---
slug: /connect/clients/rust
title: Rust client for QuestDB
sidebar_label: Rust
description: "QuestDB Rust client: the QuestDb connection pool for column-major and row-major ingestion and SQL queries over QWP/WebSocket. Complete signatures and examples."
---

The QuestDB Rust client ingests and queries data over
[QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/), a columnar binary
protocol carried over WebSocket. The single entry point is a connection pool,
`QuestDb`. Open it once, then borrow:

- a **column-major writer** for bulk/columnar ingestion (`borrow_column_sender`),
- a **row-major writer** for event-at-a-time ingestion (`borrow_row_sender`),
- a **reader** for SQL queries (`borrow_reader`).

`QuestDb` and the three `Borrowed*` handles are re-exported at the crate root:
`use questdb::QuestDb;`.

## Cargo setup

```bash
cargo add questdb-rs
```

```toml
[dependencies]
# Writing works with default features. Querying needs `sync-reader-qwp-ws`.
questdb-rs = { version = "7", features = ["sync-reader-qwp-ws"] }
```

| Feature | Default | Enables |
| --- | --- | --- |
| `sync-sender` | ✅ | The ILP/TCP, ILP/HTTP and QWP/WebSocket senders — including the pool's column-major and row-major writers. (QWP/UDP is best-effort and opt-in via `sync-sender-qwp-udp`; the pool does not use it.) |
| `sync-reader-qwp-ws` | ❌ | The query **reader** (`QuestDb::borrow_reader`, `Reader`, `Cursor`). Required for reads. |
| `sync-reader-zstd` | ❌ | Decompress `zstd`-compressed result batches on the read path. |
| `ndarray` | ❌ | `Buffer::column_arr` from [`ndarray`](https://docs.rs/ndarray) views (row-major arrays). |
| `rust_decimal` / `bigdecimal` | ❌ | `Buffer::column_dec*` from those decimal types (string decimals work without). |
| `chrono-timestamp` | ❌ | Build timestamps from `chrono::DateTime`. |
| `arrow` (`arrow-ingress` / `arrow-egress`) | ❌ | Apache Arrow: `db.flush_arrow_batch` (ingest) and `Cursor::*_arrow` (read). The umbrella `arrow` enables both directions; pick one direction to stay lean. |
| `polars` (`polars-ingress` / `polars-egress`) | ❌ | polars: `db.flush_polars_dataframe` (ingest) and `Cursor::*_polars` (read). Umbrella enables both; directional features available. |
| `tls-native-certs` | ❌ | Validate TLS against the OS certificate store. |

**Direction tip:** ingest methods (`flush_*`) need the `*-ingress` feature; query
methods (`Cursor::*`) need the `*-egress` feature. The `arrow` / `polars` umbrellas
enable both directions — enable a single directional feature (e.g. `arrow-egress`)
to keep a read-only or write-only build lean.

The pre-rename names `sync-reader-ws`, `compression-zstd`, and `chrono_timestamp`
still work as deprecated aliases but will be removed in the next major — prefer
the names above.

:::tip For an AI building a read+write app

Add `features = ["sync-reader-qwp-ws"]`. Without it, `QuestDb::borrow_reader` and
the `egress` module do not exist and reads will not compile.

:::

## Quick start

```rust
use questdb::{QuestDb, ingress::column_sender::{Chunk, AckLevel}};
use std::time::Duration;

fn main() -> questdb::Result<()> {
    let db = QuestDb::connect("ws::addr=localhost:9000;")?;

    // write a batch of trades (column-major)
    let mut sender = db.borrow_column_sender()?;
    let mut chunk = Chunk::new("trades");
    chunk.column_f64("price", &[2615.54, 2616.00], None)?;
    chunk.designated_timestamp_nanos(&[1_700_000_000_000_000_000, 1_700_000_000_001_000_000])?;
    sender.flush(&mut chunk)?;                   // queued for delivery (a background thread sends it)
    sender.wait(AckLevel::Ok, Duration::ZERO)?;  // optional: block until the server has it
    Ok(())
}
```

That is the whole write path: open the pool, borrow a sender, flush a chunk. To
read the data back, add `features = ["sync-reader-qwp-ws"]` and use a reader —
see [Querying data](#querying-data).

## API overview

| Concern | Type | Obtained via |
| --- | --- | --- |
| Connection pool | `QuestDb` | `QuestDb::connect(conf)` |
| Column-major writer | `SfColumnSender` (store-and-forward) | `db.borrow_column_sender()` |
| Row-major writer | `BorrowedRowSender` (derefs to `Sender`) | `db.borrow_row_sender()` |
| Query reader | `BorrowedReader` (derefs to `Reader`) | `db.borrow_reader()` |
| Column batch | `Chunk` | `Chunk::new(table)` |
| Row buffer | `Buffer` | `sender.new_buffer()` |
| Query builder | `ReaderQuery` | `reader.prepare(sql)` |
| Streaming result | `Cursor` → `BatchView` → `ColumnView` | `reader.prepare(sql).execute()` |

Each kind of borrow draws from its own pool within the same `QuestDb`, capped
independently by `pool_max`, so heavy ingest can't starve queries. All borrows recycle on `Drop` and are `!Send` — each belongs to the
thread that took it. The pool handle is `Send`/`Sync`.

`QuestDb` methods:

```rust
fn connect(conf: &str) -> questdb::Result<QuestDb>
fn borrow_column_sender(&self) -> questdb::Result<SfColumnSender<'_>>
fn borrow_row_sender(&self) -> questdb::Result<BorrowedRowSender<'_>>
fn borrow_reader(&self) -> questdb::egress::error::Result<BorrowedReader<'_>>  // needs `sync-reader-qwp-ws`
fn flush_arrow_batch<T>(&self, table: T, batch: &RecordBatch, ts_col: Option<ColumnName>, overrides: &[ArrowColumnOverride], ack: Option<AckLevel>) -> Result<()>  // feature `arrow-ingress`
fn flush_polars_dataframe<T>(&self, table: T, df: &DataFrame, opts: &PolarsIngestOptions) -> Result<()>  // feature `polars-ingress`
fn reap_idle(&self) -> usize
fn close(self)
```

## Connecting

```rust
use questdb::QuestDb;

let db = QuestDb::connect("ws::addr=localhost:9000;")?;
```

Use `ws` (plain) or `wss` (TLS); `qwpws` / `qwpwss` are accepted aliases. These
are the only supported schemes. For the full connect-string grammar, see the
[connect string reference](/docs/connect/clients/connect-string/).

`QuestDb::connect` is the only constructor: every option — pool sizing, auth,
TLS, store-and-forward, failover, compression — is a connect-string key, so one
string fully configures the client. There is no separate builder API.

`connect` is **lazy**: it validates the connect string and starts the pool but
opens no connection. The **first borrow** (`borrow_column_sender` /
`borrow_row_sender` / `borrow_reader`, or a `db.flush_*` DataFrame call) opens the
connection, so an unreachable server, TLS, or auth failure surfaces there — not
at `connect`. By default that first attempt fails fast; set
`initial_connect_retry=on` to retry it within the reconnect budget instead.

### Pool keys

| Key | Default | Meaning |
| --- | --- | --- |
| `pool_size` | 1 | Warm minimum the reaper keeps once connections exist. Opened lazily on first borrow, **not** at `connect()`. |
| `pool_max` | 64 | Hard cap on auto-grow. Borrowing at the cap returns an error. |
| `pool_idle_timeout_ms` | 60000 | Idle connections above `pool_size` are closed after this long. |
| `pool_reap` | `auto` | `auto` runs a background reaper; `manual` requires calling `reap_idle()`. |
| `initial_connect_retry` | `off` | How the first borrow's connect handles failure: `off` fails fast; `on` retries within the reconnect budget; `async` retries in the background. |

### Authentication and TLS

Pass auth/TLS in the connect string:

```rust
// Basic auth over TLS
let db = QuestDb::connect("wss::addr=db:9000;username=admin;password=quest;")?;
// Bearer token (Enterprise)
let db = QuestDb::connect("wss::addr=db:9000;token=your_bearer_token;")?;
```

`tls_ca` selects the root store: `webpki_roots` (default), `os_roots`,
`webpki_and_os_roots`; `tls_roots=/path/ca.pem` loads a PEM; `tls_verify=unsafe_off`
disables verification (testing only).

:::note Store-and-forward is always on

**Both** the column-major and row-major senders are always store-and-forward:
`flush()` lands in a local durable queue instead of blocking on the server, and a
background thread delivers it for you — reconnecting, rotating endpoints, and
replaying as needed. By default the queue is in-memory; set `sf_dir` to make it
**disk-backed**, so it survives a client restart. In disk-backed mode the column
pool is single-borrower — an explicit `pool_size > 1` or `pool_max > 1` is
rejected, and an omitted `pool_max` is treated as `1`. `sender_id` and the other
`sf_*` keys require an explicit `sf_dir`.

:::

## Sending data: column-major

Borrow a column sender, build a `Chunk` of columns (each a slice), set the
designated timestamp, then `flush`. Each `flush` lands in a durable
store-and-forward queue and returns immediately — there is no server round-trip
on the hot path. A background thread delivers the queue for you, so you normally
never call `wait`; reach for it only when your own code must block until the data
has reached the server.

```rust
use questdb::{QuestDb, ingress::column_sender::{Chunk, AckLevel}};
use std::time::Duration;

fn main() -> questdb::Result<()> {
    let db = QuestDb::connect("ws::addr=localhost:9000;")?;
    let mut sender = db.borrow_column_sender()?;

    let price  = [2615.54_f64, 2616.00, 2617.25];
    let amount = [0.00044_f64, 0.00050, 0.00021];
    let ts_ns  = [1_700_000_000_000_000_000_i64, 1_700_000_000_001_000_000, 1_700_000_000_002_000_000];

    let mut chunk = Chunk::new("trades");
    chunk.column_f64("price", &price, None)?;     // (name, &[T], validity)
    chunk.column_f64("amount", &amount, None)?;
    chunk.designated_timestamp_nanos(&ts_ns)?;

    sender.flush(&mut chunk)?;     // publish to the durable queue; chunk cleared on success
    sender.wait(AckLevel::Ok, Duration::ZERO)?;   // optional: block until the server has received it (ZERO = wait forever)
    Ok(())
}
```

`borrow_column_sender()` returns an `SfColumnSender` — a **store-and-forward**
handle with a deliberately small surface:

```rust
fn flush(&mut self, chunk: &mut Chunk) -> Result<()>            // publish to the durable queue; auto-clears the chunk; no round-trip
fn wait(&mut self, ack_level: AckLevel, timeout: Duration) -> Result<()>   // block until `ack_level` (or `timeout` of no ack progress)
fn must_close(&self) -> bool
fn mark_must_close(&mut self)
```

`AckLevel::Ok` waits for the server to **accept** every published frame;
`AckLevel::Durable` waits for **durable** storage and requires the pool to have
been opened with `request_durable_ack=on` (Enterprise). For whole-`RecordBatch`
Arrow or polars `DataFrame` ingestion, prefer the pool-level `db.flush_arrow_batch`
/ `db.flush_polars_dataframe` (see *DataFrame and Arrow ingestion* below).

:::important Delivery is automatic; `wait()` is rarely needed

`flush()` does not round-trip — it appends the batch to a client-side
store-and-forward queue and returns. A **background thread** delivers the queue
for you: it reconnects, rotates across endpoints, and **replays across client
restarts** when the pool is disk-backed (`sf_dir`). A successful `flush()`
already means "safely queued for delivery" — you do **not** call `wait()` to make
delivery happen.

Reach for `wait()` only when your own application logic cannot proceed until the
data has reached the server:

- **`wait(AckLevel::Ok, timeout)`** blocks until the server has accepted every
  frame published so far.
- **`wait(AckLevel::Durable, timeout)`** blocks until those frames are durably
  stored (Enterprise, needs `request_durable_ack=on`).

`timeout` is a **no-progress deadline** — it fires only if the ack watermark
stops advancing for that long (`Duration::ZERO` waits indefinitely); on expiry
`wait()` returns `ErrorCode::FailoverRetry` and the queued frames are kept for
replay.

**`wait()` does not yet guarantee query visibility.** It confirms the server has
*received* the data, not that it is queryable. A read-your-write guarantee is
planned but not implemented — do not rely on `wait()` to make rows immediately
selectable.

:::

**Throughput.** `flush()` never round-trips, so a few rows per flush is fine —
but each flush is still a wire frame and a queue append. If your source trickles
tiny batches, accumulate rows into larger chunks and flush less often to amortise
the per-frame overhead, then `wait()` once per batch if you need confirmation.
The only calls that ever block are `wait()` and backpressure when you sustainably
outrun the server.

### Reuse the chunk across flushes

**Reuse one `Chunk` — do not allocate per batch.** On a successful `flush` it is
cleared but keeps its capacity; on failure it is left untouched. The chunk
**borrows** your slices, so they only need to outlive each `flush`.

```rust
let mut chunk = Chunk::new("trades");
for batch in incoming_batches() {
    chunk.column_f64("price", &batch.price, None)?;
    chunk.column_f64("amount", &batch.amount, None)?;
    chunk.designated_timestamp_nanos(&batch.ts_ns)?;
    sender.flush(&mut chunk)?;        // clears the chunk
}
sender.wait(AckLevel::Ok, Duration::ZERO)?;   // confirm the whole run (optional)
```

### Chunk column setters

Every setter is `fn(&mut self, name: &str, data: &[T], validity: Option<&Validity>) -> Result<&mut Self>`
unless noted, and all columns plus the timestamp must share the same row count.
`validity = None` means no nulls.

| QuestDB type | `Chunk` method | `data` slice |
| --- | --- | --- |
| `BYTE`/`SHORT`/`INT`/`LONG` | `column_i8` / `column_i16` / `column_i32` / `column_i64` | `&[i8/i16/i32/i64]` |
| `FLOAT` / `DOUBLE` | `column_f32` / `column_f64` | `&[f32]` / `&[f64]` |
| `BOOLEAN` | `column_bool(name, data, row_count, validity)` | bit-packed `&[u8]` (LSB-first) + explicit `row_count` |
| `TIMESTAMP` (micros) / `timestamp_ns` | `column_ts_micros` / `column_ts_nanos` | `&[i64]` |
| `DATE` | `column_date_millis` | `&[i64]` |
| `UUID` | `column_uuid` | `&[[u8; 16]]` |
| `LONG256` | `column_long256` | `&[[u8; 32]]` |
| `IPV4` | `column_ipv4` | `&[u32]` |
| `VARCHAR` | `column_varchar(name, offsets: &[i32], bytes: &[u8], validity)` | Arrow Utf8: `row_count+1` offsets + UTF-8 bytes (`column_varchar_large` for `&[i64]` offsets) |
| `BINARY` | `column_binary(name, offsets: &[i32], bytes: &[u8], validity)` | same offset+byte layout |
| `SYMBOL` | `symbol_dict_i32` (or `_i8`/`_i16`, `_large_*`) | `codes: &[i32]` + `dict_offsets: &[i32]` + `dict_bytes: &[u8]` |
| designated timestamp | `designated_timestamp_nanos` / `_micros` / `_millis` / `_seconds` | `&[i64]` (no validity) |

Other `Chunk` methods: `new(table)`, `table()`, `row_count()`, `is_empty()`,
`clear()`.

## Sending data: row-major

For event-at-a-time ingestion, borrow a row sender. `BorrowedRowSender` derefs to
`Sender`, so the classic `Buffer` API works unchanged.

```rust
use questdb::{QuestDb, ingress::timestamp::TimestampNanos};

fn main() -> questdb::Result<()> {
    let db = QuestDb::connect("ws::addr=localhost:9000;")?;
    let mut sender = db.borrow_row_sender()?;
    let mut buffer = sender.new_buffer();

    for (sym, price, amount) in [("ETH-USD", 2615.54, 0.00044), ("BTC-USD", 65432.10, 0.00120)] {
        buffer
            .table("trades")?
            .symbol("symbol", sym)?
            .column_f64("price", price)?
            .column_f64("amount", amount)?
            .at(TimestampNanos::now())?;          // .at_now() = server-assigned timestamp
    }

    sender.flush(&mut buffer)?;                    // sends + clears the buffer
    Ok(())
}
```

Tables/columns are auto-created. A row is committed to the buffer only on
`at`/`at_now`. `flush` publishes every completed row to the durable queue and
clears the buffer (`flush_and_keep` retains it). Reuse the `Buffer` across
flushes — it keeps its capacity.

:::important Confirming delivery

The row sender is store-and-forward too: `flush()` publishes to the local queue
and a background thread delivers it — you do not call `wait()` for delivery to
happen. Use the **same `wait()`** the column sender uses only when your code must
block until the data has reached the server:

```rust
use questdb::ingress::AckLevel;
use std::time::Duration;

sender.flush(&mut buffer)?;                  // publish to the durable queue
sender.wait(AckLevel::Ok, Duration::ZERO)?;  // optional: block until the server has received it
```

`wait()` blocks until every frame published so far reaches `ack_level`
(`Ok` = accepted by the server, `Durable` = durably stored); `timeout` is a
no-progress deadline (`Duration::ZERO` waits indefinitely). As on the column
sender, `wait()` confirms receipt, **not** query visibility (a future guarantee).

For non-blocking progress instead of a barrier, use `flush_and_get_fsn()`
(publish + return this frame's FSN), then compare `published_fsn()` (highest
sent) against `acked_fsn()` (highest server-confirmed).

:::

### Buffer column setters

Each takes the column name first and returns `Result<&mut Buffer>` so calls chain.
Every setter has an `_opt` variant taking `Option<T>` that is a no-op on `None`
(how you leave a value null on a row).

| QuestDB type | `Buffer` setter |
| --- | --- |
| `SYMBOL` | `symbol(name, &str)` |
| `BOOLEAN` | `column_bool(name, bool)` |
| `BYTE`/`SHORT`/`INT`/`LONG` | `column_i8` / `column_i16` / `column_i32` / `column_i64` |
| `FLOAT` / `DOUBLE` | `column_f32(name, f32)` / `column_f64(name, f64)` |
| `VARCHAR` | `column_str(name, &str)` |
| `DECIMAL` (≤256-bit) | `column_dec` / `column_dec64` / `column_dec128` (`&str`, or `rust_decimal`/`bigdecimal` with those features) |
| `CHAR` | `column_char(name, u16)` (UTF-16 code unit) |
| `UUID` | `column_uuid(name, lo: u64, hi: u64)` |
| `LONG256` | `column_long256(name, &[u8; 32])` |
| `IPV4` | `column_ipv4(name, Ipv4Addr)` |
| `DATE` | `column_date(name, millis: i64)` |
| `BINARY` | `column_binary(name, &[u8])` |
| `GEOHASH` | `column_geohash(name, bits: u64, precision_bits: u8)` |
| `DOUBLE[]` (arrays) | `column_arr(name, &view)` — slices/vecs (≤3D) and `ndarray` views (needs `ndarray`) |
| `TIMESTAMP` (non-designated) | `column_ts(name, TimestampMicros / TimestampNanos)` |
| designated timestamp | `at(TimestampMicros / TimestampNanos)` or `at_now()` |

Useful `Sender` methods (via deref): `new_buffer()`, `flush(&mut Buffer)`,
`flush_and_keep(&Buffer)`, `wait(ack_level, timeout)`, `flush_and_get_fsn`,
`published_fsn`/`acked_fsn`, `poll_qwp_ws_error()`, `must_close()`.

## DataFrame and Arrow ingestion

With the `arrow` or `polars` feature, ingest a whole Arrow `RecordBatch` or
polars `DataFrame` in **one call on the pool** — no sender, no chunk, no buffer.
These helpers borrow a connection internally, drive the frame, and return it.
`table` accepts anything convertible into a `TableName` (a bare `&str` works).

Unlike the store-and-forward row- and column-major senders, these two calls are
**synchronous and blocking** and do **not** use the on-client queue: they drive
a direct connection and return only once the data has been delivered to the
server.

```rust
use questdb::ingress::AckLevel;

// feature = "arrow-ingress" (or the `arrow` umbrella).
// ts_col: Some(col) sources the designated timestamp from that column; None lets
//   the server stamp each row. overrides: &[ArrowColumnOverride] (&[] = none).
// ack: None uses the pool default (Durable if request_durable_ack=on, else Ok).
db.flush_arrow_batch("trades", &record_batch, None, &[], None)?;

// feature = "polars-ingress" (or the `polars` umbrella)
use questdb::ingress::polars::PolarsIngestOptions;
db.flush_polars_dataframe("trades", &df, &PolarsIngestOptions::new().max_rows(10_000))?;
```

`PolarsIngestOptions` is a builder (all default off): `.max_rows(n)` slices the
frame into batches, `.timestamp_column(name)` picks the designated timestamp,
`.overrides(&[…])` remaps column interpretation (e.g. treat a Utf8 column as
`SYMBOL`).

Because they block until delivery, each owns its failover handling inline:
`flush_polars_dataframe` re-drives the uncommitted tail onto a live endpoint
across a transient failure, while `flush_arrow_batch` surfaces the error for you
to re-call (the batch is yours to resend). Delivery is at-least-once — a replayed
tail can duplicate rows, so cover the table with
[deduplication](/docs/concepts/deduplication/) upsert keys.

## Querying data

Get a reader, `prepare` SQL (optionally binding parameters), `execute` to a
`Cursor`, then pull `BatchView`s and read typed columns.

```rust
use questdb::QuestDb;
use questdb::egress::column::ColumnView;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db = QuestDb::connect("ws::addr=localhost:9000;")?;
    let mut reader = db.borrow_reader()?;   // BorrowedReader, derefs to Reader

    let mut cursor = reader
        .prepare("SELECT ts, price, symbol FROM trades WHERE price > $1")
        .bind_f64(2615.0)
        .execute()?;

    while let Some(batch) = cursor.next_batch()? {
        let ColumnView::Timestamp(ts) = batch.column(0)? else { unreachable!() };
        let ColumnView::Double(price) = batch.column(1)? else { unreachable!() };
        let ColumnView::Symbol(symbol) = batch.column(2)? else { unreachable!() };

        for r in 0..batch.row_count() {
            if price.is_null(r) { continue; }
            println!("{} {} {:?}", ts.value(r), price.value(r), symbol.resolve(r));
        }
    }
    Ok(())
}
```

### Reader → Cursor methods

```rust
// Reader (and BorrowedReader via deref)
fn prepare(&mut self, sql: impl AsRef<str>) -> ReaderQuery<'_>   // build a parametrised query
fn execute(&mut self, sql: impl AsRef<str>) -> Result<Cursor<'_>> // shortcut, no binds
fn server_info(&self) -> Option<&ServerInfo>
fn server_version(&self) -> Result<u8>

// Cursor
fn next_batch(&mut self) -> Result<Option<BatchView<'_>>>        // None = end of stream
fn terminal(&self) -> Option<&Terminal>                         // Some after RESULT_END/EXEC_DONE
fn cancel(&mut self) -> Result<()>
fn request_id(&self) -> i64
// with feature = "polars-egress" (or the `polars` umbrella):
fn next_polars(&mut self) -> Result<Option<DataFrame>>             // one batch as a DataFrame
fn iter_polars(&mut self) -> Result<CursorPolarsIter<'_, '_>>      // drift-checked iterator of per-batch DataFrames
fn fetch_all_polars(&mut self) -> Result<DataFrame>               // whole result as one DataFrame
// with feature = "arrow-egress" (or the `arrow` umbrella):
fn next_arrow_batch(&mut self) -> Result<Option<RecordBatch>>
fn fetch_all_arrow(&mut self) -> Result<(SchemaRef, Vec<RecordBatch>)>
```

### Parameter binds

`reader.prepare(sql)` returns a `ReaderQuery`; chain `bind_*` (positional, in
order, matching `$1`, `$2`, …) then `.execute()`:

```rust
let mut cursor = reader
    .prepare("SELECT * FROM trades WHERE symbol = $1 AND ts >= $2")
    .bind_varchar("ETH-USD")
    .bind_timestamp_micros(1_700_000_000_000_000)
    .execute()?;
```

Available binds: `bind_bool`, `bind_i8/i16/i32/i64`, `bind_f32/f64`,
`bind_varchar(&str)`, `bind_binary(&[u8])`, `bind_timestamp_micros/nanos(i64)`,
`bind_date_millis(i64)`, `bind_uuid([u8;16])`, `bind_long256([u8;32])`,
`bind_char(u16)`, `bind_ipv4(Ipv4Addr)`, `bind_decimal64(i64, scale)`,
`bind_decimal128(i128, scale)`, `bind_decimal256([u8;32], scale)`,
`bind_geohash(u64, precision_bits)`, and `bind_null_*` variants. `initial_credit(u64)`,
`on_failover_reset`/`on_failover_progress` configure streaming/failover.

### Reading columns

`batch.column(idx)` returns a typed `ColumnView`. Match it to the concrete column,
then index per row. Every column type exposes `len()`, `is_null(row)`, and
`validity()`; `ColumnView` itself also has `kind()`, `len()`, and `is_null(row)`.

| `ColumnView` variant | Inner type | Read a value |
| --- | --- | --- |
| `Boolean`/`Byte`/`Short`/`Int`/`Long`/`Float`/`Double` | `FixedColumn<T>` (`u8/i8/i16/i32/i64/f32/f64`) | `col.value(row) -> T` |
| `Timestamp`/`TimestampNanos`/`Date` | `FixedColumn<i64>` | `col.value(row) -> i64` |
| `Char` | `FixedColumn<u16>` | `col.value(row) -> u16` |
| `Ipv4` | `FixedColumn<u32>` | `col.value(row) -> u32` (host-order) |
| `Symbol` | `SymbolColumn` | `col.resolve(row) -> Option<&str>` |
| `Varchar` | `VarcharColumn` | `col.value(row) -> Option<&str>` |
| `Binary` | `BinaryColumn` | `col.value(row) -> Option<&[u8]>` |
| `Uuid` | `UuidColumn` | `col.value(row) -> &[u8; 16]` |
| `Long256` | `Long256Column` | `col.value(row) -> &[u8; 32]` |
| `Decimal64`/`Decimal128`/`Decimal256` | `Decimal*Column` | see column docs (value + scale) |
| `Geohash` | `GeohashColumn` | bits + precision |
| `DoubleArray`/`LongArray` | `DoubleArrayColumn`/`LongArrayColumn` | per-row array slices |

`FixedColumn<T>::value(row)` returns the raw `T` even on null rows — always check
`is_null(row)` first (or use `col.iter()`). `SymbolColumn::resolve`,
`VarcharColumn::value`, and `BinaryColumn::value` return `Option`, which is `None`
on a null row.

With the `polars` (or `polars-egress`) feature you can pull a SQL result straight
into a polars `DataFrame`, skipping per-column handling:

```rust
// whole result in one DataFrame
let df = reader.prepare(sql).execute()?.fetch_all_polars()?;

// or stream it batch-by-batch (schema-drift-checked)
let mut cursor = reader.prepare(sql).execute()?;
for frame in cursor.iter_polars()? {
    let df = frame?;
    // ... process each DataFrame ...
}
```

`fetch_all_polars()` materialises the entire result (and replays transparently
through a mid-query failover); `iter_polars()` yields one `DataFrame` per batch
with schema-drift detection; `next_polars()` is the low-level per-batch form.
These live on the `Cursor` — there is no pool-level shortcut on the read side.

### Running DDL and DML

`execute` / `prepare` also run non-`SELECT` statements (CREATE, INSERT, UPDATE,
ALTER, DROP, TRUNCATE). They return no rows: `next_batch()` yields `None`
immediately and the outcome lands in the cursor's `terminal()` as
`Terminal::ExecDone { rows_affected, .. }`.

```rust
use questdb::egress::Terminal;

let mut cursor =
    reader.execute("UPDATE trades SET price = price * 1.01 WHERE symbol = 'ETH-USD'")?;
while cursor.next_batch()?.is_some() {}          // drain (a DDL/DML statement yields no rows)
if let Some(Terminal::ExecDone { rows_affected, .. }) = cursor.terminal() {
    println!("updated {rows_affected} rows");
}
```

The `Cursor` is `#[must_use]`: always drain it with `next_batch()` (or
`cancel()`), even when the statement returns nothing.

### Cancellation, flow control, and compression

Cancel a running query at any time with `cursor.cancel()` — it sends a `CANCEL`
frame and drains to the server's terminal.

For large results, bound how far the server streams ahead with **byte credits**.
`initial_credit(n)` caps the in-flight bytes (`0` = unbounded); grant more as you
consume with `Cursor::add_credit(bytes)`, and read the running total with
`credit_granted_total()`:

```rust
let mut cursor = reader
    .prepare("SELECT * FROM trades")
    .initial_credit(1 << 20)          // cap at 1 MiB in flight
    .execute()?;
while let Some(batch) = cursor.next_batch()? {
    // ... process `batch` ...
    cursor.add_credit(1 << 20)?;      // top up as you drain
}
```

Enable **zstd** compression on the read path with the `sync-reader-zstd` feature
plus a connect-string key: `compression=zstd` (or `compression=auto` to let the
server choose), optionally tuned with `compression_level=N` (`1`–22, default `1`).

## Error handling

Every write call returns `questdb::Result<T>` (alias for
`Result<T, questdb::Error>`); `questdb::Error` carries an
`ErrorCode` (`err.code()`) and a message (`err.msg()`). The reader uses a parallel
`questdb::egress::error::{Error, ErrorCode, Result}`. To mix both in one function,
return `Result<(), Box<dyn std::error::Error>>` (both `?` cleanly).

```rust
match sender.flush(&mut chunk) {
    Ok(()) => {}
    Err(e) => {
        eprintln!("flush failed [{:?}]: {}", e.code(), e.msg());
        if sender.must_close() { /* drop the borrow; the pool opens a fresh conn next time */ }
    }
}
```

A borrow that has latched terminal (`must_close()` is `true`) is dropped — not
recycled — when it returns to the pool. Call `mark_must_close()` to force this
after an error you suspect damaged the connection.

## Failover and high availability

Point the pool at several QuestDB nodes and it rotates to a live one on every
reconnect. List the endpoints in the connect string — comma-separated in one
`addr=`, or as repeated `addr=` params:

```rust
// rotate across three nodes; pin to the primary (Enterprise primary/replica)
let db = QuestDb::connect("ws::addr=node-a:9000,node-b:9000,node-c:9000;target=primary;")?;
```

`target=primary` / `target=replica` / `target=any` and `zone=` select which node
role the pool connects to; see the
[connect string reference](/docs/connect/clients/connect-string/) for the full
grammar. If every endpoint completes its handshake but none matches `target=`,
the borrow fails with a role-reject error (distinct from "all endpoints
unreachable").

### Reconnect budget

When a connection drops, the pool dials the endpoint set with centered-jittered
backoff until one answers or the budget expires. Three QWP/WebSocket-only keys
tune it:

| Key | Default | Meaning |
| --- | --- | --- |
| `reconnect_max_duration_millis` | 300000 (5 min) | Total failover budget before the borrow gives up. |
| `reconnect_initial_backoff_millis` | 100 | First backoff between dials; grows toward the max. |
| `reconnect_max_backoff_millis` | 5000 | Backoff ceiling between dials. |

Auth failures and protocol-version mismatches are **terminal** — they are never
retried, whatever the budget.

### Ingestion failover

Ingestion failover is **automatic** — you do not write a retry loop. The column
sender publishes every `flush()` into its store-and-forward queue, and a
background runner forwards that queue to the server, reconnecting and rotating
across the endpoints above on its own. When the pool is disk-backed (`sf_dir`)
the queue is durable, so unacknowledged batches **replay after a client restart
or a server failover** — a batch that `flush()` accepted is not lost to a dropped
connection.

The only thing you react to is a **terminal** condition — an auth or
protocol-version rejection the runner cannot retry. The handle reports it via
`must_close()`; drop the borrow and the next one opens a fresh connection.

:::note Replays can duplicate

Because the durable queue replays unacknowledged batches, a delivery that was in
doubt when a connection dropped may be re-sent. Enable table-level
[deduplication](/docs/concepts/deduplication/) or upsert keys so replays are
idempotent.

:::

The **row sender** shares this model: its background runner absorbs reconnects
across the endpoint set automatically. Surface any async transport error with
`poll_qwp_ws_error()`, confirm the tail with `wait()`, and check `must_close()`
after a terminal error.

### Query failover

A transport error mid-query fails the cursor over to another endpoint and
**replays the query from the start** there (a fresh `request_id`, batches from
zero). Because already-consumed rows arrive again, you must opt in and discard
them — install `on_failover_reset`:

```rust
let mut cursor = reader
    .prepare("SELECT ts, price FROM trades WHERE price > $1")
    .bind_f64(2615.0)
    .on_failover_reset(|ev| {
        // query restarts on ev.new_addr — drop rows kept from the dead node
        eprintln!("failover {}:{} -> {}:{} ({} attempts)",
            ev.failed_addr.host, ev.failed_addr.port,
            ev.new_addr.host, ev.new_addr.port, ev.attempts);
    })
    .execute()?;
```

Without `on_failover_reset` (or `on_failover_progress`), a mid-stream failover
surfaces as an error instead of silently replaying. `on_failover_progress`
reports each phase — `Disconnected`, `Retrying`, `Reset`, `GaveUp` (budget
exhausted; the cursor is terminal and the error is in `final_error`). Both
callbacks run synchronously on the cursor's drive thread: do not call back into
the reader/cursor, block, or panic inside them.

## Concurrency

`QuestDb` **is the pool**, and it is the only thread-safe handle in the client.
It is `Send + Sync`: create **one** per process and share it across every worker
thread — behind an `Arc`, since the pool itself is not `Clone`. The pool guards
its connections internally.

The borrowed handles are the opposite. `SfColumnSender`, `BorrowedRowSender`, and
`BorrowedReader` — and the `Chunk` / `Buffer` you build — are **not** thread-safe
(`!Send + !Sync`). A borrow belongs to the thread that took it; the compiler
stops you moving one to another thread. The model is always **one pool, many
short-lived borrows**: each thread borrows what it needs, uses it, and drops it.

```rust
use std::sync::Arc;

let db = Arc::new(QuestDb::connect("ws::addr=localhost:9000;pool_size=4;")?);

let workers: Vec<_> = (0..4).map(|_| {
    let db = Arc::clone(&db);
    std::thread::spawn(move || -> questdb::Result<()> {
        let mut sender = db.borrow_column_sender()?;   // this thread's own sender
        // ... build and flush chunks ...
        Ok(())
    }) // `sender` drops here → its connection returns to the pool
}).collect();
```

**Borrows return to the pool on `Drop`** — you never return one by hand. A handle
holds a pool slot for as long as it is alive, so keep borrows short: borrow, use,
drop, rather than parking one open across idle periods. A returned connection is
recycled for the next borrow (one that latched `must_close` is discarded instead,
and the next borrow opens a fresh connection).

**Borrowing is fail-fast at the cap.** The column, row, and reader pools are each
capped independently by `pool_max`; when every slot is in use the next borrow
returns `ErrorCode::InvalidApiCall` rather than blocking. Size `pool_max` to your
peak concurrency, and set `pool_size` to your steady worker count so the reaper
keeps that many connections warm once they have opened.

## Closing

Dropping `QuestDb` closes the pool (stops the reaper, drops idle connections).
Call `db.close()` for an explicit shutdown, or `db.reap_idle()` under
`pool_reap=manual` to trim idle connections yourself.

## Complete example: write then read

```rust
use questdb::QuestDb;
use questdb::ingress::column_sender::{Chunk, AckLevel};
use questdb::egress::column::ColumnView;
use std::time::Duration;

// Cargo.toml: questdb-rs = { version = "7", features = ["sync-reader-qwp-ws"] }
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db = QuestDb::connect("ws::addr=localhost:9000;")?;

    // --- write (column-major) ---
    {
        let mut sender = db.borrow_column_sender()?;
        let price = [2615.54_f64, 2616.00, 2617.25];
        let ts_ns = [1_700_000_000_000_000_000_i64, 1_700_000_000_001_000_000, 1_700_000_000_002_000_000];
        let mut chunk = Chunk::new("trades");
        chunk.column_f64("price", &price, None)?;
        chunk.designated_timestamp_nanos(&ts_ns)?;
        sender.flush(&mut chunk)?;
        sender.wait(AckLevel::Ok, Duration::ZERO)?;
    } // sender returns to the pool here

    // --- read ---
    // NOTE: wait() confirms receipt, not query visibility. In a real
    // write-then-read flow a freshly written row may not be selectable
    // immediately — see the visibility note above.
    {
        let mut reader = db.borrow_reader()?;
        let mut cursor = reader.prepare("SELECT ts, price FROM trades ORDER BY ts").execute()?;
        while let Some(batch) = cursor.next_batch()? {
            let ColumnView::Timestamp(ts) = batch.column(0)? else { unreachable!() };
            let ColumnView::Double(price) = batch.column(1)? else { unreachable!() };
            for r in 0..batch.row_count() {
                println!("{} -> {}", ts.value(r), price.value(r));
            }
        }
    }

    db.close();
    Ok(())
}
```

## Next steps

- [Connect string reference](/docs/connect/clients/connect-string/)
- [QWP protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/)
- [C/C++ pooled API](/docs/connect/clients/c-and-cpp-pooled/) (the same pool, in C/C++)
- [Query overview](/docs/query/overview/)
