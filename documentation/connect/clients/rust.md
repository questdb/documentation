---
slug: /connect/clients/rust
title: Rust client for QuestDB
sidebar_label: Rust
description: "Use the QuestDB Rust connection pool for Buffer, Chunk, Arrow, and Polars ingestion plus streaming SQL queries over QWP."
---

The QuestDB Rust client uses a thread-safe `QuestDb` pool for ingestion and SQL
queries over [QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/). Borrow
a short-lived writer or reader for each unit of work, then let `Drop` return its
connection to the pool.

## Quick start

Add the client:

```text title="Cargo.toml"
[dependencies]
questdb-rs = "7"
```

The default features enable both directions: `sync-sender` for pooled
QWP/WebSocket ingestion (as well as the legacy ILP over TCP and HTTP), and
`sync-reader` for QWP/WebSocket queries with `zstd` compression. They also
enable bundled TLS roots and the `ring` cryptography backend.

The following program writes one uniquely marked row through a pooled sender,
waits for the server to accept it, then polls for query visibility:

```rust
use std::{
    process, thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use questdb::{
    egress::column::ColumnView,
    ingress::{AckLevel, TimestampNanos},
    QuestDb,
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db = QuestDb::connect("ws::addr=localhost:9000;")?;
    let marker = format!(
        "rust-{}-{}",
        process::id(),
        SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos(),
    );

    {
        let mut sender = db.borrow_sender()?;
        let mut buffer = sender.new_buffer();

        buffer
            .table("rust_quick_start")?
            .symbol("symbol", &marker)?
            .column_f64("price", 2615.54)?
            .at(TimestampNanos::now())?;

        sender.flush_buffer_and_wait(&mut buffer, AckLevel::Ok)?;
    }

    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        let found = {
            let mut reader = db.borrow_reader()?;
            let mut cursor = reader
                .prepare(
                    "SELECT price FROM rust_quick_start \
                     WHERE symbol = $1 LIMIT 1",
                )
                .bind_varchar(marker.clone())
                .execute()?;
            let mut found = false;

            while let Some(batch) = cursor.next_batch()? {
                let ColumnView::Double(price) = batch.column(0)? else {
                    unreachable!()
                };

                if batch.row_count() > 0 {
                    if price.is_null(0) {
                        return Err("quick-start price is NULL".into());
                    }
                    println!("{marker} {}", price.value(0));
                    found = true;
                }
            }

            found
        };

        if found {
            break;
        }
        if Instant::now() >= deadline {
            return Err("timed out waiting for query visibility".into());
        }
        thread::sleep(Duration::from_millis(100));
    }

    Ok(())
}
```

An `Ok` ACK confirms that QuestDB accepted the frame, but the row becomes
visible only after the WAL is applied to the table. This happens asynchronously.
The bounded poll uses a unique value and a bind parameter, so it cannot
accidentally report an older row. In production, poll for the application
condition you need and choose a timeout that matches your ingestion and query
latency budget.

Note that the polling code has an inner loop `while let Some(batch) =
cursor.next_batch()?...`, which seems unnecessary since we're receiving a single
row. However, the `Cursor` contract states we must either drain all batches or
call `cancel()`. The loop showcases the general idiom for working with a cursor.

## Connecting

Use `ws` for plain WebSocket or `wss` for TLS:

```rust
use questdb::QuestDb;

let db = QuestDb::connect("ws::addr=localhost:9000;")?;
```

`QuestDb::connect` parses the connect string and doesn't normally perform any
blocking network I/O. The exception to that happens when store-and-forward
durability is in use, and the client detects unsent data left over from a
previously crashed client. The pool may reopen the dirty slots at construction
and start replaying them in the background.

The ingestion sender creates its local producer on first borrow and connects its
delivery runner in the background, so it can queue data while the server is
temporarily unavailable. Reader errors and direct Arrow/Polars transport errors
surface from the borrow or during operation rather than from `connect()`.

## Authentication and TLS

Put the credentials and TLS settings in the connect string:

```rust
use questdb::QuestDb;

let basic = QuestDb::connect(
    "wss::addr=db.example.com:9000;username=admin;password=quest;",
)?;

let token = QuestDb::connect(
    "wss::addr=db.example.com:9000;token=your_bearer_token;",
)?;
```

With the default crate features, the TLS root set is `webpki_roots`. Other
choices have feature requirements:

| Setting | Requirement |
| --- | --- |
| `tls_ca=os_roots` | Enable `tls-native-certs`. |
| `tls_ca=webpki_and_os_roots` | Enable both `tls-webpki-certs` and `tls-native-certs`. |
| `tls_roots=/path/to/roots.pem` | Uses the supplied PEM bundle and implies `tls_ca=pem_file`. |
| `tls_roots_password=...` | Unlocks a JKS or PKCS#12 store named by `tls_roots`. |
| `tls_verify=unsafe_off` | Enable `insecure-skip-verify`; use only in controlled tests. |

## The pool

`QuestDb` owns reusable QWP/WebSocket connections. Create one pool per
application or service process and share it across workers. Borrow a sender or
reader for one unit of work, then let `Drop` return its connection to the pool.

### Choose an API

Match the API to the shape of the work:

| You have | Use | Why |
| --- | --- | --- |
| Events arriving one at a time | `borrow_sender()` + `Buffer` | Build rows field by field and flush them in batches. |
| Data already stored in column arrays | `borrow_sender()` + `Chunk` | Encode whole columns without assembling rows. |
| An Arrow `RecordBatch` or Polars `DataFrame` | `flush_arrow_batch()` or `flush_polars_dataframe()` | Let the pool own the direct sender, commit boundary, and return path. |
| SQL to execute | `borrow_reader()` | Stream typed columnar result batches with binds and flow control. |

Buffer and chunk ingestion use store-and-forward. The pool-level Arrow and
Polars helpers use a separate direct connection pool and block for an ACK.

All borrowed handles return to their respective pools on `Drop`. A connection in
a terminal error state is retired automatically. Use `drop_on_return()` when
your application deliberately abandons a connection and does not want it
recycled.

## Buffer ingestion

Use a `Buffer` for events that arrive one at a time. Build several rows, then
flush through the sender on your application's size or time boundary:

```rust
use questdb::{ingress::TimestampNanos, QuestDb};

fn main() -> questdb::Result<()> {
    let db = QuestDb::connect("ws::addr=localhost:9000;")?;
    let mut sender = db.borrow_sender()?;
    let mut buffer = sender.new_buffer();

    for (symbol, price, amount) in [
        ("ETH-USDT", 2615.54, 0.00044),
        ("BTC-USDT", 65432.10, 0.00120),
    ] {
        buffer
            .table("trades")?
            .symbol("symbol", symbol)?
            .column_f64("price", price)?
            .column_f64("amount", amount)?
            .at(TimestampNanos::now())?;
    }

    sender.flush_buffer(&mut buffer)?;
    Ok(())
}
```

`at()` or `at_now()` completes the current row. `at_now()` asks the server to
assign the designated timestamp. When QWP auto-creates a table, that designated
timestamp column is named `timestamp`.

Reuse the same buffer across flushes. `flush_buffer()` clears it only after
successful local publication and retains its allocated capacity. Use
`flush_buffer_and_keep()` only when you need to retain the rows for another
destination or operation.

### Buffer column setters

Every setter returns `Result<&mut Buffer>`, so setters can be chained. The
`_opt` variants leave the field absent when passed `None`, producing a null for
an existing nullable column.

| QuestDB type | Setter |
| --- | --- |
| `SYMBOL` | `symbol`, `symbol_opt` |
| `BOOLEAN` | `column_bool`, `column_bool_opt` |
| `BYTE`, `SHORT`, `INT`, `LONG` | `column_i8`, `column_i16`, `column_i32`, `column_i64` and `_opt` variants |
| `FLOAT`, `DOUBLE` | `column_f32`, `column_f64` and `_opt` variants |
| `VARCHAR` | `column_str`, `column_str_opt` |
| `DECIMAL` | `column_dec`, `column_dec64`, `column_dec128` and `_opt` variants |
| `CHAR` | `column_char`, `column_char_opt` |
| `UUID` | `column_uuid`, `column_uuid_opt` |
| `LONG256` | `column_long256`, `column_long256_opt` |
| `IPv4` | `column_ipv4`, `column_ipv4_opt` |
| `DATE` | `column_date`, `column_date_opt` |
| `BINARY` | `column_binary`, `column_binary_opt` |
| `GEOHASH` | `column_geohash`, `column_geohash_opt` |
| `DOUBLE[]` | `column_arr`, `column_arr_opt` |
| `TIMESTAMP`, `TIMESTAMP_NS` | `column_ts`, `column_ts_opt` |

QWP cannot preserve nulls for `BOOLEAN`, `BYTE`, or `SHORT`. An absent value in
one of those columns is received as `false` or `0`; use a wider nullable type
when the distinction matters.

## Chunk ingestion {#sending-data-column-major}

Use a `Chunk` when values already live in column slices. All columns and the
designated timestamp must have the same row count:

```rust
use std::time::Duration;

use questdb::{
    ingress::{column_sender::Chunk, AckLevel},
    QuestDb,
};

fn main() -> questdb::Result<()> {
    let db = QuestDb::connect("ws::addr=localhost:9000;")?;
    let mut sender = db.borrow_sender()?;

    let price = [2615.54_f64, 2616.00, 2617.25];
    let amount = [0.00044_f64, 0.00050, 0.00021];
    let timestamp = [
        1_700_000_000_000_000_000_i64,
        1_700_000_000_001_000_000,
        1_700_000_000_002_000_000,
    ];

    let mut chunk = Chunk::new("trades");
    chunk.column_f64("price", &price, None)?;
    chunk.column_f64("amount", &amount, None)?;
    chunk.at_nanos(&timestamp)?;

    sender.flush(&mut chunk)?;
    sender.wait(AckLevel::Ok, Duration::from_secs(30))?;
    Ok(())
}
```

The `at_*` setters take raw epoch `i64` values.
`TimestampNanos::now().as_i64()` supplies the current time for `at_nanos`, and
`TimestampMicros` has the same `as_i64()` accessor for `at_micros`.

Use one `Chunk` per batch. Create the chunk after creating the batch's backing
buffers, append the columns, and flush it before leaving that scope.

A chunk too large for one frame is split across several, each published on its
own. The client targets about 2 MiB per frame — half of `sf_max_segment_bytes` (default
4 MiB) — so a chunk encoding to more than roughly 2 MiB splits. That matters
because a flush failing partway through leaves the earlier frames queued and
never accepts the rest, which is why chunk recovery differs from buffer
recovery; see [Recovering from a failed flush](#recovering-from-a-failed-flush).

The client halves the row range until each frame fits, stopping at 8 rows:
validity bitmaps and boolean columns pack one bit per row, so a frame must
start on a byte boundary. An 8-row frame is checked against the full 4 MiB
rather than the 2 MiB target; if 8 rows still exceed 4 MiB — which takes very
large string, binary, or array values — the flush fails instead of splitting.

### Chunk column setters

Most setters take `(name, data, validity)`. Pass `None` for `validity` when
every row carries a value. Otherwise build the bitmap with
`Validity::from_bitmap(bits, bit_len)`: one bit per row, LSB-first within each
byte, where `1` means valid. `bits` needs at least `ceil(bit_len / 8)` bytes,
and any bits past `bit_len` are ignored:

```rust
use questdb::ingress::column_sender::Validity;

// Rows 0 and 2 carry a price; row 1 is NULL.
let price = [2615.54_f64, 0.0, 2617.25];
let bits = [0b0000_0101_u8];
let validity = Validity::from_bitmap(&bits, price.len())?;

chunk.column_f64("price", &price, Some(&validity))?;
```

`bit_len` must equal the column's data length: the slot backing a null still
needs an entry in `data`, which the encoder ignores.

| QuestDB type | `Chunk` method | Input |
| --- | --- | --- |
| `BYTE`, `SHORT`, `INT`, `LONG` | `column_i8`, `column_i16`, `column_i32`, `column_i64` | Numeric slice |
| `FLOAT`, `DOUBLE` | `column_f32`, `column_f64` | Numeric slice |
| `BOOLEAN` | `column_bool(name, bits, row_count, validity)` | LSB-first bit-packed values |
| `TIMESTAMP`, `TIMESTAMP_NS` | `column_ts(name, data, TimestampUnit, validity)` | Epoch `i64` values |
| `DATE` | `column_date` | Epoch milliseconds |
| `UUID` | `column_uuid` | `&[[u8; 16]]` in QuestDB wire order |
| `LONG256` | `column_long256` | `&[[u8; 32]]` in little-endian limb order |
| `IPv4` | `column_ipv4` | Host-order `u32` values |
| `VARCHAR` | `column_str`, `column_str_large` | Arrow Utf8 offsets and bytes |
| `BINARY` | `column_binary` | Arrow Binary offsets and bytes |
| `SYMBOL` | `symbol_i8`, `symbol_i16`, `symbol_i32` | Codes plus an `i32`-offset dictionary |
| `SYMBOL` with large offsets | `symbol_large_i8`, `symbol_large_i16`, `symbol_large_i32` | Codes plus an `i64`-offset dictionary |
| Designated timestamp | `at_micros`, `at_nanos`, `at_millis`, `at_seconds` | Epoch `i64` values, no validity bitmap |

`BYTE`, `SHORT`, and `BOOLEAN` have no null representation in QWP. A null
`BYTE` or `SHORT` is encoded as `0`; a null `BOOLEAN` is encoded as `false`.
Choose a wider nullable type if that distinction matters.

Other lifecycle methods are `new`, `table`, `row_count`, and `is_empty`. With
`arrow-ingress`, `push_arrow_column` and `push_imported_arrow_slice` add Arrow
data to an existing chunk.

### Symbol columns in a chunk

`SYMBOL` is the one shape that takes more than a single data slice. The per-row
`codes` index a dictionary passed as two further arguments, `dict_offsets` and
`dict_bytes`, in Arrow Utf8 layout:

```rust
use questdb::ingress::column_sender::Chunk;

// A flat UTF-8 block plus one offset per entry boundary, so entry `i`
// spans `dict_offsets[i]..dict_offsets[i + 1]`.
let mut dict_bytes: Vec<u8> = Vec::new();
let mut dict_offsets: Vec<i32> = vec![0];
for instrument in ["BTC-USDT", "ETH-USDT"] {
    dict_bytes.extend_from_slice(instrument.as_bytes());
    dict_offsets.push(dict_bytes.len() as i32);
}

// One code per row: BTC-USDT, ETH-USDT, BTC-USDT.
let codes = [0_i8, 1, 0];

let mut chunk = Chunk::new("trades");
chunk.symbol_i8("symbol", &codes, &dict_offsets, &dict_bytes, None)?;
```

Match the code width to the dictionary size: `symbol_i8` addresses up to 128
entries, `symbol_i16` up to 32768, and `symbol_i32` beyond that. The
`symbol_large_*` variants are identical except that `dict_offsets` is `&[i64]`,
for a dictionary whose bytes exceed `i32::MAX`.

Appending the column validates the dictionary: offsets must be non-negative and
non-decreasing, the final offset must not exceed `dict_bytes.len()`, every entry
must be valid UTF-8, and every non-null code must fall in `0..dict_len`, where
`dict_len` is `dict_offsets.len() - 1`. Only the entries a batch references are
sent, and a single dictionary entry is capped at 1 MiB.

`column_str` and `column_binary` take the same offsets-and-bytes pair directly,
without the code indirection, so `offsets` holds `row_count + 1` entries.

## Arrow and Polars ingestion

Use the pool-level helpers for a complete synchronous operation. They borrow a
direct sender internally, publish a commit boundary, wait for the requested
ACK, and return the connection to the pool.

```rust
use questdb::ingress::AckLevel;

// Feature: arrow-ingress
db.flush_arrow_batch(
    "trades",
    &record_batch,
    None,                  // server-assigned designated timestamp
    &[],                   // no Arrow column overrides
    Some(AckLevel::Ok),
)?;
```

Pass `Some(ColumnName)` instead of `None` to source the designated timestamp
from an Arrow timestamp column. Passing `None` for the ACK level selects
`Durable` when `request_durable_ack=on`, otherwise `Ok`.

For Polars, configure ingestion with `PolarsIngestOptions`:

```rust
use questdb::ingress::{
    column_sender::ArrowColumnOverride,
    polars::PolarsIngestOptions,
    AckLevel,
    ColumnName,
};

let overrides: [ArrowColumnOverride<'_>; 0] = [];
let options = PolarsIngestOptions::new()
    .max_rows(50_000)
    .timestamp_column(ColumnName::new("timestamp")?)
    .overrides(&overrides)
    .ack_level(AckLevel::Ok);

db.flush_polars_dataframe("trades", &dataframe, &options)?;
```

`max_rows(0)` uses the default batch size. Omitting `timestamp_column` asks the
server to assign timestamps. Omitting `ack_level` uses the pool default.

`flush_polars_dataframe` checkpoints the frame and automatically retries the
uncommitted tail after a transient failover. `flush_arrow_batch` returns a
transient error for the caller to retry because the caller still owns the
batch. Polars replay is at-least-once, and retrying an Arrow batch after an
uncertain failure can also duplicate rows. Use
[deduplication](/docs/concepts/deduplication/) when duplicates would be
harmful.

## Querying

Borrow a reader, prepare SQL, bind values, execute, and pull typed batches:

```rust
use questdb::{egress::column::ColumnView, QuestDb};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db = QuestDb::connect("ws::addr=localhost:9000;")?;
    let mut reader = db.borrow_reader()?;

    let mut cursor = reader
        .prepare(concat!(
            "SELECT timestamp, price, symbol ",
            "FROM trades WHERE price > $1",
        ))
        .bind_f64(2615.0)
        .execute()?;

    while let Some(batch) = cursor.next_batch()? {
        let ColumnView::Timestamp(timestamp) = batch.column(0)? else {
            unreachable!()
        };
        let ColumnView::Double(price) = batch.column(1)? else {
            unreachable!()
        };
        let ColumnView::Symbol(symbol) = batch.column(2)? else {
            unreachable!()
        };

        for row in 0..batch.row_count() {
            if price.is_null(row) {
                continue;
            }
            println!(
                "{} {} {:?}",
                timestamp.value(row),
                price.value(row),
                symbol.resolve(row),
            );
        }
    }

    Ok(())
}
```

`Reader::prepare<S: Into<String>>()` returns a `ReaderQuery`; its builder
methods consume and return the query. `Reader::execute<S: Into<String>>()` is
the no-bind shortcut. The resulting `Cursor` borrows the reader, so finish or
drop the cursor before using the reader for another query.

### Parameter binds

Bind parameters in positional order for `$1`, `$2`, and later placeholders.
Available builders include:

- `bind_bool`, `bind_i8`, `bind_i16`, `bind_i32`, `bind_i64`
- `bind_f32`, `bind_f64`, `bind_varchar`, `bind_binary`
- `bind_timestamp_micros`, `bind_timestamp_nanos`, `bind_date_millis`
- `bind_uuid`, `bind_long256`, `bind_char`, `bind_ipv4`
- `bind_decimal64`, `bind_decimal128`, `bind_decimal256`
- `bind_geohash`
- `bind_null` and the typed `bind_null_*` variants

### Reading columns

`BatchView::column(index)` returns a non-exhaustive `ColumnView`. Match the
variant before reading values:

| `ColumnView` variant | Value access |
| --- | --- |
| `Boolean`, `Byte`, `Short`, `Int`, `Long`, `Float`, `Double` | `FixedColumn<T>::value(row)` |
| `Timestamp`, `TimestampNanos`, `Date`, `Char`, `Ipv4` | `FixedColumn<T>::value(row)` |
| `Symbol` | `resolve(row) -> Option<&str>` |
| `Varchar` | `value(row) -> Option<&str>` |
| `Binary` | `value(row) -> Option<&[u8]>` |
| `Uuid`, `Long256` | Fixed-size byte-array reference |
| `Decimal64`, `Decimal128`, `Decimal256` | Integer value plus the column scale |
| `Geohash` | Bits plus precision |
| `DoubleArray`, `LongArray` | Per-row shape and element data |

For a `DECIMAL(p, s)` result, precision `p` selects the QWP variant:

| Result precision | `ColumnView` variant |
| --- | --- |
| 1 through 18 | `Decimal64` |
| 19 through 38 | `Decimal128` |
| 39 through 76 | `Decimal256` |

QWP sends scale `s` separately and reports the width bucket, not the exact
precision `p`.

Use `ColumnView::as_decimal()` to handle all three widths. `DecimalColumn`
reports `byte_width()`, `max_precision()`, and `scale()`;
`mantissa_le(row)` returns little-endian two's-complement bytes. Check
`is_null(row)` before decoding them.

Check `is_null(row)` before calling `value(row)` on fixed-width data. The raw
value in a null slot is only a sentinel. `Symbol::resolve`, `Varchar::value`,
and `Binary::value` return `None` for nulls.

QWP result batches do not carry null bitmaps for `BOOLEAN`, `BYTE`, or `SHORT`.
Those values are always reported as non-null. Server-side nulls arrive as
`false` for `BOOLEAN` and `0` for `BYTE` or `SHORT`.

### Arrow and Polars query results

With `arrow-egress`, use `next_arrow_batch`, `as_arrow_reader`, or
`fetch_all_arrow`. With `polars-egress`, use `next_polars`, `iter_polars`, or
`fetch_all_polars`:

```rust
let dataframe = reader
    .prepare("SELECT * FROM trades")
    .execute()?
    .fetch_all_polars()?;
```

The `fetch_all_*` helpers materialize the complete result. Prefer `next_*` or
an iterator for large results.

### DDL, DML, cancellation, and flow control

`execute` also runs statements such as `CREATE`, `ALTER`, `INSERT`, `UPDATE`,
and `DROP`. Drain the cursor even when no result rows are expected, then read
the outcome from `cursor.terminal()`:

```rust
use questdb::egress::Terminal;

let mut cursor = reader.execute(
    "UPDATE trades SET amount = 0 WHERE amount < 0",
)?;
while cursor.next_batch()?.is_some() {}

match cursor.terminal() {
    Some(Terminal::ExecDone { rows_affected, .. }) => {
        println!("{rows_affected} rows affected")
    }
    Some(Terminal::End { total_rows, .. }) => {
        println!("{total_rows} rows returned")
    }
    _ => {}
}
```

`terminal()` returns `None` until the stream ends, so read it once
`next_batch()` has returned `None`. A statement that returns no rows finishes
with `Terminal::ExecDone`; a `SELECT` finishes with `Terminal::End`, which
reports `total_rows`. `Terminal` is non-exhaustive, so keep a catch-all arm.

Call `cursor.cancel()` to cancel and drain an active query. For large result
sets, set byte credit with `ReaderQuery::initial_credit()` and replenish it
with `Cursor::add_credit()` as batches are consumed. A credit of `0` means
unbounded.

The default `sync-reader` feature includes Zstandard support. Set
`compression=zstd` or `compression=auto` to accept compressed result batches.
If you disable default features, also enable `sync-reader-zstd`.
`compression_level` accepts `1` through `22`; the default advertised level is
`1`.

## Delivery and durability

The ingestion sender pool always uses store-and-forward. Without `sf_dir`, the
queue is in memory. With `sf_dir`, each borrowed sender uses a disk slot:

```text
<sf_dir>/<sender_id>-ingest-<index>/
```

Give each pool that shares an `sf_dir` a distinct `sender_id`. On restart, the
pool reopens managed dirty slots and replays their unacknowledged frames.

Disk mode does not call `fsync`. It is page-cache durable, which protects
against a client-process crash but does not guarantee survival of a host crash
or power loss. The only supported `sf_durability` mode is currently `memory`;
`flush` and `append` are rejected.

### Choose a completion mode

| Need | Use | Meaning |
| --- | --- | --- |
| Highest throughput | Buffer: `flush_buffer`; chunk: `flush` | The local queue accepted the data. Delivery continues in the background. |
| One-call delivery barrier | Buffer: `flush_buffer_and_wait`; chunk: `flush_and_wait` | Publish, then wait using `request_timeout`. |
| Per-call deadline | Publish, then `wait(level, timeout)` | Wait with an explicit no-progress timeout. |
| Non-blocking progress | Buffer: `flush_buffer_and_get_fsn`; chunk: `flush_and_get_fsn`; then `acked_fsn` | Observe a boundary while retaining the same borrow. |

`AckLevel::Ok` means the server accepted all frames through the boundary.
`AckLevel::Durable` requires `request_durable_ack=on` and Enterprise server
support. Requesting `Durable` without opting in is rejected before the buffer
or chunk is changed.

A `wait` timeout is a no-progress timeout. The data remains queued and its
background delivery continues. Retry `wait()` or keep observing `acked_fsn()`;
do not flush the same data again. `Duration::ZERO` disables the deadline.

FSNs belong to the current sender stream and borrow. They are watermarks, not
portable receipts that can be checked through an arbitrary later borrow.

A successful FSN-returning flush of a non-empty buffer or chunk always returns
`Some(fsn)`; `Ok(None)` only means there was nothing to publish. Similarly,
`published_fsn()` and `acked_fsn()` return `Ok(None)` until this borrow
publishes or completes its first frame, so treat `None` from `acked_fsn()` as
"nothing acked yet", not as a failure. A saved boundary is covered once
`acked_fsn()` returns a value at or above it.

### Recovering from a failed flush {#recovering-from-a-failed-flush}

Recovery turns on `err.in_doubt()`, not on `err.code()` and not on whether the
buffer or chunk still holds rows.

When `in_doubt()` is `false`, the flush failed before the queue took the frame,
so the rows never entered the send path and your input is intact: re-flush it.
When `in_doubt()` is `true`, delivery is
uncertain — do not blindly replay, because the queue may already hold the rows.
Waiting never duplicates, so `wait()` (or observe `acked_fsn()`) for whatever
the queue holds; replay the same rows only if the table's dedup/upsert keys
make duplicates harmless.

The code alone cannot make this decision: a delivery-unknown failure typically
reports `ErrorCode::FailoverRetry`, and a socket error is classified to that
same code when nothing was ever published. Pair `in_doubt() == false` with a
retryable code before re-sending.

How much waiting recovers depends on the API:

- A `Buffer` publishes as one indivisible frame, and every publication failure
  is provably-not-delivered. So an in-doubt buffer failure means the ACK wait
  failed with every row already queued, and `wait()` recovers it.
- A `Chunk` may be [split](#sending-data-column-major) across frames. A failure
  partway through queues the earlier frames and never accepts the rest, so
  waiting delivers only part of the batch. Recovering the remainder means
  resending the chunk, which is safe only under dedup keys.

Buffer and chunk state is not a substitute for this flag. An in-doubt chunk is
cleared after a failed ACK wait but populated when a split remainder fails, so
neither state tells you the rows are safe to resend.

### Backpressure

Store-and-forward is bounded. When producers continuously outrun the server,
publication can wait for ACK-driven space and then return an error:

| Key | Default | Purpose |
| --- | --- | --- |
| `sf_max_segment_bytes` | `4 MiB` | Segment size. |
| `sf_max_total_bytes` | `128 MiB` in memory, `10 GiB` on disk | Total queue budget per sender. |
| `sf_append_deadline_millis` | `30000` | Maximum no-progress wait for queue space. |
| `close_flush_timeout_millis` | `5000` | Best-effort drain window when a sender or pool closes. |

Size the queue for the largest expected outage and ingest rate. If an in-memory
queue cannot drain before close timeout, its remaining tail is lost. Disk mode
keeps the tail for restart replay, subject to the page-cache durability limit.

## Concurrency and sizing

`QuestDb` is `Send + Sync` but not `Clone`. Wrap one pool in `Arc` and let each
worker take its own short-lived borrow:

```rust
use std::sync::Arc;

use questdb::QuestDb;

let db = Arc::new(QuestDb::connect(
    "ws::addr=localhost:9000;sender_pool_max=4;",
)?);

let workers: Vec<_> = (0..4)
    .map(|_| {
        let db = Arc::clone(&db);
        std::thread::spawn(move || -> questdb::Result<()> {
            let _sender = db.borrow_sender()?;
            // Build and publish this worker's chunks here.
            Ok(())
        })
    })
    .collect();

for worker in workers {
    worker.join().expect("worker panicked")?;
}
```

`BorrowedSender`, `BorrowedReader`, and `Chunk` are not `Send` or `Sync`; use
each on the thread that borrowed or built it. `Buffer` is owned reusable data
and is not part of that thread-bound borrow list.

### Pool settings

| Key | Default | Guidance |
| --- | --- | --- |
| `sender_pool_min` | `1` | Warm minimum of ingestion connections retained once they have been opened. Set it near steady concurrent use. |
| `sender_pool_max` | `4` | Ingestion pool growth cap. Set it at or above peak concurrent sender borrows. |
| `query_pool_min` | `1` | Warm minimum of reader connections retained once they have been opened. |
| `query_pool_max` | `4` | Reader pool growth cap. Set it at or above peak concurrent reader borrows. |
| `acquire_timeout_ms` | `5000` | How long a borrow waits for a returned connection once its pool is at its cap. `0` fails fast. |
| `idle_timeout_ms` | `60000` | Idle lifetime for connections above the warm minimum. |
| `pool_reap` | `auto` | Use `manual` only when your application will call `reap_idle()`. |
| `initial_connect_retry` | `off` | `on`/`sync` retries initial connection synchronously; `async` starts background retry. |

Setting an ingress `reconnect_*` key without explicitly setting
`initial_connect_retry` promotes the initial mode to synchronous retry. See the
[connect string reference](/docs/connect/clients/connect-string/) for the full
grammar and all limits.

The ingestion and reader pools grow and cap independently. The pool-level Arrow
and Polars helpers use another internal direct pool, so account for those
connections when sizing the server. Avoid a single combined connection formula;
the active paths in an application determine the total.

A borrow at the pool's cap waits up to `acquire_timeout_ms` for another thread
to return a connection, then fails with `ErrorCode::InvalidApiCall`. Set
`acquire_timeout_ms=0` to fail fast instead. In disk-backed store-and-forward
mode, an ingestion borrow may first wait up to `close_flush_timeout_millis` for
a closing slot to release its disk lock.

Keep borrows short. A borrow occupies its slot until `Drop`, even while the
application is idle.

## Failover and errors

Use repeated `addr` keys or a comma-separated address list. Role and zone
filters apply to every pooled path:

```rust
use questdb::QuestDb;

let db = QuestDb::connect(
    "ws::addr=node-a:9000,node-b:9000,node-c:9000;target=primary;",
)?;
```

The crate uses one `questdb::Error` and `questdb::ErrorCode` vocabulary for
ingestion and queries. Inspect `err.code()`, `err.msg()`, and, for publication
failures, `err.in_doubt()`. A `true` result means the rows may already have
reached the server, so replaying them can duplicate data; `in_doubt()` rather
than `code()` decides whether re-sending is safe. See
[Recovering from a failed flush](#recovering-from-a-failed-flush).

`ErrorCode` is non-exhaustive, so a match on it needs a catch-all arm.

`Error::new(code, msg)` constructs an error where your own code speaks for the
client, such as a result column that is not the type the program expects:

```rust
use questdb::{egress::column::ColumnView, Error, ErrorCode};

let ColumnView::Double(price) = batch.column(1)? else {
    return Err(Error::new(
        ErrorCode::InvalidApiCall,
        "result column price is not a DOUBLE",
    ));
};
```

Keep your application's own conditions in your application's error type instead.
`ErrorCode` describes client, transport, and server failures, and no variant
stands for an application rule such as "the rows I ingested did not become
visible within the deadline I chose". `questdb::Error` implements
`std::error::Error` and is `Send + Sync`, so it propagates into a
`Box<dyn Error>`, an `anyhow::Error`, or a `thiserror` enum with `?`, and a
worker thread can return client and application failures through one type.

The writer background runner reconnects and replays queued frames. The
ingestion retry budget uses these keys:

| Key | Default |
| --- | --- |
| `reconnect_max_duration_millis` | `300000` |
| `reconnect_initial_backoff_millis` | `100` |
| `reconnect_max_backoff_millis` | `5000` |

Authentication failures, protocol-version failures, and terminal data
rejections are not retried. A terminal writer is retired when its borrow is
dropped; there is no pooled `must_close()` or async-error polling API.

Reader failover has a separate policy:

| Key | Default | Meaning |
| --- | --- | --- |
| `failover` | `on` | Permit mid-query failover. |
| `failover_max_attempts` | `8` | Total execute attempts, including the first. |
| `failover_max_duration_ms` | `30000` | Overall reader failover budget; `0` means unbounded. |
| `failover_backoff_initial_ms` | `50` | First retry delay; `0` disables sleeping. |
| `failover_backoff_max_ms` | `1000` | Retry-delay ceiling. |

A mid-query failover restarts the query from the beginning. To opt in, install
`on_failover_reset` and discard any rows retained from the failed attempt:

```rust
let mut cursor = reader
    .prepare("SELECT timestamp, price FROM trades WHERE price > $1")
    .bind_f64(2615.0)
    .on_failover_reset(|event| {
        eprintln!(
            "query restarted on {}:{} after {} attempts",
            event.new_addr.host,
            event.new_addr.port,
            event.attempts,
        );
    })
    .execute()?;
```

Without an `on_failover_reset` callback, a mid-stream failure after the first
delivered batch returns `ErrorCode::FailoverWouldDuplicate` instead of silently
repeating rows. The `on_failover_progress` callback is telemetry-only and does
not authorize replay. Callbacks run synchronously while the cursor is being
driven; keep them short and do not call back into the same reader or cursor.

## Closing

Dropping `QuestDb` or calling `db.close()` stops the reaper, rejects future
borrows, and closes idle connections. Rust's lifetimes prevent calling
`close(self)` while a normal borrowed handle is still alive.

Closing drains store-and-forward queues on a best-effort basis for
`close_flush_timeout_millis`, which defaults to five seconds. Before shutdown:

- Call `wait(AckLevel::Ok, timeout)` when accepted delivery is required.
- Call `wait(AckLevel::Durable, timeout)` when durable ACKs are configured and
  required.
- Configure `sf_dir` when undelivered frames must replay after a process
  restart.

Under `pool_reap=manual`, call `reap_idle()` periodically if the pool should
shrink above its warm floor.

## Crate features

Writing and querying work with the default crate features. Enable optional
integrations only when your application uses them:

| Feature | Default | Use it for |
| --- | --- | --- |
| `sync-sender` | Yes | Pooled QWP/WebSocket ingestion for buffers and chunks. It also enables the standalone ILP/TCP and ILP/HTTP senders. |
| `sync-reader` | Yes | QWP/WebSocket queries with Zstandard decompression. It enables `sync-reader-qwp-ws` and `sync-reader-zstd`. |
| `tls-webpki-certs` | Yes | TLS validation with the bundled Web PKI root certificates. |
| `ring-crypto` | Yes | The default TLS cryptography backend. Do not combine it with `aws-lc-crypto`. |
| `arrow-ingress` / `arrow-egress` | No | Arrow ingestion / Arrow query results. The `arrow` feature enables both. |
| `polars-ingress` / `polars-egress` | No | Polars ingestion / Polars query results. The `polars` feature enables both. |
| `ndarray` | No | `Buffer::column_arr` from `ndarray` views. |
| `rust_decimal` / `bigdecimal` | No | Row-buffer decimal values from those crates. Decimal strings need neither feature. |
| `chrono-timestamp` | No | Timestamp values built from `chrono::DateTime`. |
| `tls-native-certs` | No | TLS validation through the operating-system certificate store. |
| `insecure-skip-verify` | No | `tls_verify=unsafe_off` for controlled testing only. |
| `almost-all-features` | No | Client development and testing with most compatible features. It excludes Arrow and Polars. |

`almost-all-features` is intended for client development and CI. It extends
the defaults with QWP/UDP, both TLS root sources, `insecure-skip-verify`, JSON
test helpers, timestamp and array integrations, and both decimal crates. It
selects `ring-crypto`, omits the mutually exclusive `aws-lc-crypto`, and
excludes `arrow` and `polars`. Prefer the specific features your application
uses.

If you disable default features, select the sender and reader transports you
need, exactly one crypto backend (`ring-crypto` or `aws-lc-crypto`), and at
least one TLS root source (`tls-webpki-certs` or `tls-native-certs`). The method
tables below name the feature that gates each API, not the complete
no-default-features set.

## API at a glance

Use this inventory after choosing a borrow and delivery model. Methods that
require an optional crate feature are absent when that feature is disabled.

### `QuestDb` methods

These are the supported pool entry points:

| Method | Feature | Purpose |
| --- | --- | --- |
| `QuestDb::connect(conf: &str)` | `sync-sender-qwp-ws` | Parse the connect string and create the pool. |
| `new_buffer()` | `sync-sender-qwp-ws` | Create a caller-owned QWP/WebSocket `Buffer` using the pool's name limit. |
| `borrow_sender()` | `sync-sender-qwp-ws` | Borrow a `BorrowedSender` for buffers, chunks, or Arrow batches. |
| `borrow_reader()` | `sync-sender-qwp-ws` + `sync-reader-qwp-ws` | Borrow a `BorrowedReader`. |
| `flush_arrow_batch(table, batch, timestamp_column, overrides, ack_level)` | `arrow-ingress` | Ingest one Arrow batch through an internally borrowed direct sender. |
| `flush_polars_dataframe(table, dataframe, options)` | `polars-ingress` | Ingest a Polars frame with checkpointed failover replay. |
| `reap_idle()` | `sync-sender-qwp-ws` | Close expired idle connections above the warm minimum and return the number closed. |
| `close(self)` | `sync-sender-qwp-ws` | Consume and close the pool. Dropping it has the same effect. |

The crate also contains doc-hidden direct-sender, diagnostic, and FFI-owned
entry points. They are internal integration surfaces, not supported Rust
application APIs.

### `BorrowedSender` methods

`BorrowedSender` exposes these methods for caller-owned `Buffer` values and
borrowed-slice `Chunk` values:

| Method | Purpose |
| --- | --- |
| `new_buffer()` | Create a reusable `Buffer` using the pool settings. The buffer is independent of this lease. |
| `flush_buffer(&mut Buffer)` | Publish a buffer locally and clear it on success. |
| `flush_buffer_and_wait(&mut Buffer, AckLevel)` | Publish, clear, and wait using the pool-wide `request_timeout`. |
| `flush_buffer_and_keep(&Buffer)` | Publish without clearing the buffer. |
| `flush_buffer_and_get_fsn(&mut Buffer)` | Publish, clear, and return the final frame sequence number. |
| `flush_buffer_and_keep_and_get_fsn(&Buffer)` | Publish without clearing and return the final FSN. |
| `flush(&mut Chunk)` | Publish a chunk locally and clear it on success. |
| `flush_and_wait(&mut Chunk, AckLevel)` | Publish, clear, and wait using the pool-wide `request_timeout`. |
| `flush_and_get_fsn(&mut Chunk)` | Publish and return the final frame sequence number. |
| `published_fsn()` | Read the highest locally published FSN. |
| `acked_fsn()` | Read the highest completed FSN. |
| `wait(AckLevel, Duration)` | Wait for everything published on this borrow, using an explicit no-progress timeout. |
| `drop_on_return()` | Drop this connection instead of recycling it when the borrow ends. |

With `arrow-ingress`, `BorrowedSender` also exposes store-and-forward Arrow
operations:

| Method | Timestamp | Completion |
| --- | --- | --- |
| `flush_arrow_batch_at_now` | Server-assigned | Publish only |
| `flush_arrow_batch_at_now_and_wait` | Server-assigned | Publish and wait |
| `flush_arrow_batch_at_now_and_get_fsn` | Server-assigned | Publish and return FSN |
| `flush_arrow_batch_at_column` | Named Arrow column | Publish only |
| `flush_arrow_batch_at_column_and_wait` | Named Arrow column | Publish and wait |
| `flush_arrow_batch_at_column_and_get_fsn` | Named Arrow column | Publish and return FSN |

Prefer the pool-level `flush_arrow_batch()` for a one-off synchronous batch.
Borrow a sender to pipeline Arrow batches or observe FSN progress.

### `BorrowedReader` methods

`BorrowedReader` has one lease-specific method, `drop_on_return()`. It
implements `Deref` and `DerefMut` to `Reader`, so normal reader methods such as
`prepare()`, `execute()`, `server_info()`, and `server_version()` work directly
on the borrowed value.

## Next steps

- [Connect string reference](/docs/connect/clients/connect-string/)
- [QWP protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/)
- [C and C++ client](/docs/connect/clients/c-and-cpp/)
- [Query overview](/docs/query/overview/)
