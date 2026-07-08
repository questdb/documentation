---
slug: /connect/clients/c-and-cpp-pooled
title: C/C++ client (pooled API) draft
sidebar_label: C/C++ pooled API (draft)
description: "Draft guide for the QuestDB C and C++ pooled connection API: questdb_db / questdb::pool for column-major, row-major, and Arrow ingestion plus the query reader, with authentication, failover, and durability guidance, over QWP/WebSocket."
---

:::caution Draft

Guide for the **pooled** C/C++ API: the connection-pool entry point
(`questdb_db_*` in C, `questdb::pool` in C++), available with QuestDB 10.0.
This is a pre-release API and may change before release.

:::

The C and C++ clients ingest and query over
[QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/), a columnar binary
protocol carried over WebSocket. The pool is the entry point for both ingesting
and querying data: borrow a sender to write rows, or a reader to execute SQL queries.

## Quick start

Open a pool, borrow a **row sender** to write a row, then borrow a **reader** to
read it back — the common "insert and query" path. Everything below expands on
this; for bulk/columnar and Arrow ingestion, see [The pool](#the-pool) and
[Sending data: column-major](#sending-data-column-major).

### C++

```cpp
#include <questdb/ingress/column_sender.hpp>  // pool + row sender
#include <questdb/egress/reader.hpp>          // pool::borrow_reader
#include <iostream>

using namespace questdb::ingress::literals;

int main()
{
    questdb::pool pool{"ws::addr=localhost:9000;"};

    // Insert: borrow a row sender, write a row, flush, wait for the ack.
    {
        auto sender = pool.borrow_row_sender();
        auto buffer = sender.new_buffer();
        buffer.table("trades"_tn)
              .symbol("symbol"_cn, "ETH-USD"_utf8)
              .column("price"_cn, 2615.54)
              .at(questdb::ingress::timestamp_nanos::now());
        sender.flush(buffer);
        sender.wait();
    }

    // Query: borrow a reader, run SQL, print rows.
    auto reader = pool.borrow_reader();
    auto cur = reader.execute("SELECT symbol, price FROM trades LIMIT 5"_utf8);
    while (auto batch = cur.next_batch())
    {
        for (size_t r = 0; r < batch->row_count(); ++r)
        {
            auto price = batch->column(1).get<double>(r);
            std::cout << batch->column(0).symbol(r).value_or("NULL") << " "
                      << (price ? std::to_string(*price) : "NULL") << "\n";
        }
    }
}
```

### C

```c
#include <questdb/ingress/column_sender.h>   // pool + row_sender
#include <questdb/ingress/line_sender.h>      // line_sender_buffer
#include <questdb/egress/reader.h>            // reader
#include <stdio.h>

int main(void)
{
    line_sender_error* err = NULL;   /* pool + row sender use this error type */
    reader_error* rerr = NULL;       /* reader / cursor use this error type */
    questdb_db* db = NULL;
    row_sender* sender = NULL;
    line_sender_buffer* buffer = NULL;
    reader* rd = NULL;
    reader_cursor* cursor = NULL;

    db = questdb_db_connect("ws::addr=localhost:9000;", 24, &err);
    if (!db) goto on_error;

    /* Insert: borrow a row sender, write a row, flush, wait for the ack. */
    sender = questdb_db_borrow_row_sender(db, &err);
    if (!sender) goto on_error;
    buffer = row_sender_new_buffer(sender, &err);
    if (!buffer) goto on_error;
    if (!line_sender_buffer_table(buffer, QDB_TABLE_NAME_LITERAL("trades"), &err)) goto on_error;
    if (!line_sender_buffer_symbol(buffer, QDB_COLUMN_NAME_LITERAL("symbol"),
                                   QDB_UTF8_LITERAL("ETH-USD"), &err)) goto on_error;
    if (!line_sender_buffer_column_f64(buffer, QDB_COLUMN_NAME_LITERAL("price"), 2615.54, &err)) goto on_error;
    if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err)) goto on_error;
    if (!row_sender_flush(sender, buffer, &err)) goto on_error;
    if (!row_sender_wait(sender, qwpws_ack_level_ok, 0, &err)) goto on_error;
    line_sender_buffer_free(buffer);
    buffer = NULL;
    questdb_db_return_row_sender(db, sender);
    sender = NULL;

    /* Query: borrow a reader, run SQL, print rows. */
    rd = questdb_db_borrow_reader(db, &rerr);
    if (!rd) goto on_reader_error;
    cursor = reader_execute(rd,
        QDB_UTF8_LITERAL("SELECT symbol, price FROM trades LIMIT 5"), &rerr);
    if (!cursor) goto on_reader_error;

    const reader_batch* batch;
    while ((batch = reader_cursor_next_batch(cursor, &rerr)) != NULL)
    {
        size_t rows = reader_batch_row_count(batch);
        reader_column_data d_symbol, d_price;
        reader_symbol_dict dict;
        if (!reader_batch_column_data(batch, 0, &d_symbol, &rerr)) goto on_reader_error;
        if (!reader_batch_column_data(batch, 1, &d_price, &rerr)) goto on_reader_error;
        if (!reader_batch_symbol_dict(batch, &dict, &rerr)) goto on_reader_error;
        for (size_t r = 0; r < rows; ++r)
        {
            bool sym_null = false, price_null = false;
            const char* sym = NULL;
            size_t sym_len = 0;
            if (!reader_column_data_get_symbol(&d_symbol, &dict, r, &sym, &sym_len, &sym_null))
                goto on_reader_error;
            double price = reader_column_data_get_f64(&d_price, r, &price_null);

            if (sym_null)   printf("NULL ");
            else            printf("%.*s ", (int)sym_len, sym);
            if (price_null) printf("NULL\n");
            else            printf("%g\n", price);
        }
    }
    if (rerr) goto on_reader_error;

    reader_cursor_free(cursor);
    questdb_db_return_reader(db, rd);
    questdb_db_close(db);
    return 0;

on_error:;
    {
        size_t len = 0;
        const char* msg = line_sender_error_msg(err, &len);
        fprintf(stderr, "error: %.*s\n", (int)len, msg);
        line_sender_error_free(err);
    }
    line_sender_buffer_free(buffer);
    if (sender) questdb_db_drop_row_sender(db, sender);
    questdb_db_close(db);
    return 1;

on_reader_error:;
    {
        size_t len = 0;
        const char* msg = reader_error_msg(rerr, &len);
        fprintf(stderr, "error: %.*s\n", (int)len, msg);
        reader_error_free(rerr);
    }
    reader_cursor_free(cursor);
    if (rd) questdb_db_return_reader(db, rd);
    questdb_db_close(db);
    return 1;
}
```

## The pool

`questdb_db` (C) / `questdb::pool` (C++) is a thread-safe handle that owns a set
of reusable QWP/WebSocket connections. Open one per deployment, share it across
threads, close it at shutdown.

You don't open connections yourself: **borrow** a lease — a row sender, column
sender, or reader — use it on one thread, then **return** it (recycles the
connection) or **drop** it (retires it). In C++ this happens on destruction —
for the borrowed sender wrappers and the pooled reader alike — and
`drop_on_return()` forces a drop. The pool connects lazily and handles reconnect
and failover underneath.

The pooled API at a glance:

| Concern | C | C++ |
| --- | --- | --- |
| Connection pool | `questdb_db*` | `questdb::pool` |
| Borrow a **column-major** writer | `questdb_db_borrow_column_sender` → `column_sender*` | `pool::borrow_column_sender()` → `borrowed_column_sender` |
| Borrow a **row-major** writer | `questdb_db_borrow_row_sender` → `row_sender*` | `pool::borrow_row_sender()` → `borrowed_row_sender` |
| Borrow a **reader** | `questdb_db_borrow_reader` → `reader*` | `pool::borrow_reader()` → `reader` |
| Column batch | `column_sender_chunk*` | `questdb::ingress::column_chunk` |
| Arrow batch flush | `column_sender_flush_arrow_batch_at_column` | `borrowed_column_sender::flush_arrow_batch()` |
| Row buffer | `line_sender_buffer*` | `questdb::ingress::line_sender_buffer` |
| Streaming result | `reader_cursor*` → `reader_batch*` | `cursor` → `batch` → `column` |

### Which borrow?

Match the borrow to the shape of your data:

| You have | Borrow | Why |
| --- | --- | --- |
| Columnar data already in arrays, Arrow batches, or DataFrames (bulk loads, backfills, ETL) | **Column-major** (`borrow_column_sender`) | Whole columns are encoded in one pass — no per-row assembly. Store-and-forward queue owns delivery. |
| Events arriving one at a time (tickers, order flow, telemetry) | **Row-major** (`borrow_row_sender`) | Build rows field-by-field into a buffer, flush batches on your cadence. |
| SQL to run — verification read-backs, dashboards, downsampling | **Reader** (`borrow_reader`) | Streams typed columnar batches with flow control. |

Both senders may target the same tables; QuestDB unifies the schema
server-side.

## Headers

Writing pulls in the sender headers; querying adds the reader header.

```c
#include <questdb/ingress/column_sender.h>   // C: pool + column-major + row-major senders
#include <questdb/ingress/line_sender.h>      // C: line_sender_buffer (row building)
#include <questdb/egress/reader.h>            // C: query reader
```

```cpp
#include <questdb/ingress/column_sender.hpp> // C++: questdb::pool + senders
#include <questdb/egress/reader.hpp>         // C++: questdb::egress::reader (+ pool::borrow_reader)
```

## Connecting

The connect string uses a QWP/WebSocket scheme: `ws` / `wss` (or the `qwpws` /
`qwpwss` aliases). For auth and TLS keys, see the
[connect string reference](/docs/connect/clients/connect-string/). The pool is
**lazy**: `questdb_db_connect` parses and validates the string but opens no
connection, so auth / TLS / connect errors surface from the first borrow, not
from `connect`.

```c
line_sender_error* err = NULL;
questdb_db* db = questdb_db_connect("ws::addr=localhost:9000;", 24, &err);
if (!db) { /* read err, handle */ }
```

```cpp
questdb::pool pool{"ws::addr=localhost:9000;"};   // alias of questdb::ingress::pool
```

### Pool keys

The connect string also accepts pool-tuning keys; the defaults suit most
callers.

| Key | Default | Meaning |
| --- | --- | --- |
| `pool_size` | 1 | Warm/minimum connections. The reaper keeps this many once connections have been opened. |
| `pool_max` | 64 | Hard cap on auto-grow. Borrowing at the cap returns an error. |
| `pool_idle_timeout_ms` | 60000 | Idle connections above `pool_size` are closed after this long. |
| `pool_reap` | `auto` | `auto` runs a background reaper; `manual` requires `questdb_db_reap_idle` / `pool::reap_idle`. |

Setting `sf_dir` opts the column sender into **store-and-forward** with on-disk
durability. In store-and-forward mode the pool currently supports a **single
active borrower** — an explicit `pool_size > 1` or `pool_max > 1` is rejected,
and an omitted `pool_max` is treated as `1` for the column sender. `sender_id`
and the other `sf_*` keys require an explicit `sf_dir`.

### Sizing the pool

**A borrow at the cap fails immediately — there is no blocking acquire.**
When `pool_max` handles of one kind are already out, `questdb_db_borrow_*`
returns `NULL` with `line_sender_error_invalid_api_call` (C++ throws) rather
than waiting for a return. Two consequences:

- **Size `pool_max` to your worker count.** The natural pattern is one borrow
  per worker thread held for the worker's lifetime (see
  [Concurrency](#concurrency-one-borrow-per-worker)); then the cap is never
  hit.
- **If borrows are short-lived and demand can spike past the cap**, treat the
  at-cap error as backpressure: return a borrow elsewhere, or retry after a
  delay in your own loop. Don't confuse it with the connect-retry helpers —
  `borrow_*_with_retry` retries *connection establishment*, not cap
  exhaustion.

Each borrow kind (column, row, reader) has its own `pool_max`-capped free
list — so heavy ingestion cannot starve queries — and the combined
live-connection ceiling is `3 * pool_max`.

## Authentication and TLS

Authentication happens during the WebSocket upgrade, before any binary frames
are exchanged. The pooled connect string takes the same keys as the standalone
sender — see the
[C & C++ guide](/docs/connect/clients/c-and-cpp/#authentication-and-tls) for
the full treatment. Summary:

```text
wss::addr=db.example.com:9000;username=admin;password=quest;   # HTTP basic
wss::addr=db.example.com:9000;token=your_bearer_token;         # bearer token (Enterprise, recommended)
```

- **TLS**: use the `wss` scheme. Pick the root store with `tls_ca=webpki_roots`
  / `os_roots` / `webpki_and_os_roots`, or `tls_roots=/path/ca.pem` for a
  custom CA. `tls_verify=unsafe_off` disables verification (testing only;
  requires an `insecure-skip-verify` build).
- **`auth_timeout_ms`** (default 15000) bounds the WebSocket upgrade.
- **Not supported**: OIDC token acquisition/refresh (acquire the token
  out-of-band and pass `token=...`; rebuild the pool when it nears expiry),
  mutual TLS, and mid-session token rotation. See the
  [unsupported auth paths](/docs/connect/clients/c-and-cpp/#unsupported-auth-paths)
  table.

Because the pool connects lazily, a bad credential surfaces as
`line_sender_error_auth_error` from the **first borrow** on each connection —
handle it there, not at `connect` (see
[Which errors mean what](#which-errors-mean-what)).

## Sending data: row-major

Borrow a row sender and flush a `line_sender_buffer` — the classic ILP buffer
you build field-by-field. Get a protocol-matched buffer straight from the sender
(`row_sender_new_buffer` in C, `borrowed_row_sender::new_buffer()` in C++); it is
the only buffer a `row_sender` accepts. The row sender uses a single error type
(`line_sender_error`) throughout.

The pool is the shared handle; a borrowed row sender is single-thread — borrow
one per worker.

### C

```c
#include <questdb/ingress/column_sender.h>   // pool + row_sender
#include <questdb/ingress/line_sender.h>      // line_sender_buffer
#include <stdio.h>

int main(void)
{
    line_sender_error* err = NULL;
    questdb_db* db = NULL;
    row_sender* sender = NULL;
    line_sender_buffer* buffer = NULL;

    db = questdb_db_connect("ws::addr=localhost:9000;", 24, &err);
    if (!db) goto on_error;

    sender = questdb_db_borrow_row_sender(db, &err);
    if (!sender) goto on_error;

    buffer = row_sender_new_buffer(sender, &err);   // protocol-matched QWP/WS buffer
    if (!buffer) goto on_error;
    if (!line_sender_buffer_table(buffer, QDB_TABLE_NAME_LITERAL("trades"), &err)) goto on_error;
    if (!line_sender_buffer_symbol(buffer, QDB_COLUMN_NAME_LITERAL("symbol"),
                                   QDB_UTF8_LITERAL("ETH-USD"), &err)) goto on_error;
    if (!line_sender_buffer_column_f64(buffer, QDB_COLUMN_NAME_LITERAL("price"), 2615.54, &err)) goto on_error;
    if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err)) goto on_error;

    if (!row_sender_flush(sender, buffer, &err)) goto on_error;   // sends + clears the buffer

    line_sender_buffer_free(buffer);
    questdb_db_return_row_sender(db, sender);
    questdb_db_close(db);
    return 0;

on_error:;
    size_t len = 0;
    const char* msg = line_sender_error_msg(err, &len);
    fprintf(stderr, "error: %.*s\n", (int)len, msg);
    line_sender_error_free(err);
    line_sender_buffer_free(buffer);
    if (sender) questdb_db_drop_row_sender(db, sender);
    questdb_db_close(db);
    return 1;
}
```

### C++

```cpp
#include <questdb/ingress/column_sender.hpp>
#include <questdb/ingress/line_sender.hpp>
#include <iostream>

using namespace questdb::ingress::literals;

int main()
{
    try
    {
        questdb::pool pool{"ws::addr=localhost:9000;"};
        auto sender = pool.borrow_row_sender();   // borrowed_row_sender (RAII)

        auto buffer = sender.new_buffer();        // protocol-matched buffer
        buffer.table("trades"_tn)
              .symbol("symbol"_cn, "ETH-USD"_utf8)
              .column("price"_cn, 2615.54)
              .at(questdb::ingress::timestamp_nanos::now());

        sender.flush(buffer);   // borrowed_row_sender::flush(line_sender_buffer&)
        return 0;
    }
    catch (const questdb::ingress::line_sender_error& e)
    {
        std::cerr << "error: " << e.what() << "\n";
        return 1;
    }
}
```

:::caution No auto-flush

There are no `auto_flush_rows` / `auto_flush_bytes` keys for the QWP/WebSocket
row sender — flushing is always explicit. Accumulate rows in the buffer on your
own cadence (row count, byte size via `line_sender_buffer_size`, or a timer)
and call `flush` yourself. Null columns are written by **omission**: skip the
column for that row — there is no `set_null` call.

:::

:::note Row-sender ack tracking

`row_sender_flush` (C++ `sender.flush(buffer)`) publishes without waiting for the
server ACK. For a blocking barrier over everything published so far, call
`row_sender_wait` / `sender.wait()`. For non-blocking pipelining, publish with an
FSN-returning flush and compare watermarks — see
[FSN progress](#fsn-progress-non-blocking) below.

:::

## Sending data: column-major

Borrow a store-and-forward column sender, build a `chunk` of columns (each a
contiguous array plus a row count), set the designated timestamp, then flush.
`flush` publishes the chunk into the store-and-forward queue; `wait` is an
**ack barrier** that blocks until the server has acknowledged everything
published so far.

The `questdb_db` / `questdb::pool` is the only handle you share across threads;
a borrowed sender belongs to the thread that took it — borrow one per worker
(store-and-forward mode allows a single active borrower).

### C

```c
#include <questdb/ingress/column_sender.h>
#include <stdio.h>

int main(void)
{
    line_sender_error* err = NULL;
    questdb_db* db = NULL;
    column_sender* conn = NULL;
    column_sender_chunk* chunk = NULL;

    db = questdb_db_connect("ws::addr=localhost:9000;", 24, &err);
    if (!db) goto on_error;

    conn = questdb_db_borrow_column_sender(db, &err);
    if (!conn) goto on_error;

    double price[]  = {2615.54, 2616.00, 2617.25};
    double amount[] = {0.00044, 0.00050, 0.00021};
    int64_t ts_ns[] = {1700000000000000000, 1700000000001000000, 1700000000002000000};
    size_t n = 3;

    chunk = column_sender_chunk_new("trades", 6, &err);
    if (!chunk) goto on_error;
    // (chunk, name, name_len, data, row_count, validity_or_NULL, err_out)
    if (!column_sender_chunk_column_f64(chunk, "price", 5, price, n, NULL, &err)) goto on_error;
    if (!column_sender_chunk_column_f64(chunk, "amount", 6, amount, n, NULL, &err)) goto on_error;
    if (!column_sender_chunk_at_nanos(chunk, ts_ns, n, &err)) goto on_error;

    if (!column_sender_flush(conn, chunk, &err)) goto on_error;                 // publish
    if (!column_sender_wait(conn, qwpws_ack_level_ok, 0, &err)) goto on_error;  // wait for ACK

    column_sender_chunk_free(chunk);
    questdb_db_return_column_sender(db, conn);   // return the borrow to the pool
    questdb_db_close(db);
    return 0;

on_error:;
    size_t len = 0;
    const char* msg = line_sender_error_msg(err, &len);
    fprintf(stderr, "error: %.*s\n", (int)len, msg);
    line_sender_error_free(err);
    column_sender_chunk_free(chunk);
    if (conn) questdb_db_drop_column_sender(db, conn);  // drop a possibly-in-doubt conn
    questdb_db_close(db);
    return 1;
}
```

### C++

```cpp
#include <questdb/ingress/column_sender.hpp>
#include <iostream>

int main()
{
    try
    {
        questdb::pool pool{"ws::addr=localhost:9000;"};
        auto conn = pool.borrow_column_sender();   // RAII: returns to pool on scope exit

        double price[]  = {2615.54, 2616.00, 2617.25};
        double amount[] = {0.00044, 0.00050, 0.00021};
        int64_t ts_ns[] = {1700000000000000000, 1700000000001000000, 1700000000002000000};
        size_t n = 3;

        questdb::ingress::column_chunk chunk{"trades"};
        chunk.column_f64("price", price, n)
             .column_f64("amount", amount, n)
             .at_nanos(ts_ns, n);

        conn.flush(chunk);   // publish into the store-and-forward queue
        conn.wait();         // ack barrier (qwpws_ack_level::ok, waits indefinitely)
        return 0;
    }
    catch (const questdb::ingress::line_sender_error& e)
    {
        std::cerr << "error: " << e.what() << "\n";
        return 1;
    }
}
```

### Notes

- **Reuse the chunk** across flushes: on a successful flush it is cleared but
  keeps its capacity; on failure it is left untouched.
- All columns (and the timestamp) must share the same `row_count`. The chunk
  **borrows** your arrays — they must outlive the flush.
- **`flush` is not durability.** A successful `column_sender_flush` means the
  frame was accepted by the local store-and-forward queue, which owns delivery —
  not that the server has ACKed it. `column_sender_wait` (C++ `conn.wait()`)
  only *observes* the ACK; it is a barrier, not a commit step. Publish many
  chunks, then `wait` once (`qwpws_ack_level_durable` waits for durable upload,
  Enterprise). See [Durability and backpressure](#durability-and-backpressure).
- **Return the borrow.** C: `questdb_db_return_column_sender` (recycle) or
  `questdb_db_drop_column_sender` (retire a possibly in-doubt conn); C++ does
  it in the `borrowed_column_sender` destructor, and `drop_on_return()` forces
  a drop. The return path already retires conns that have latched a terminal
  error or whose pool has been closed, so plain return/destruction is correct for
  healthy conns — reach for drop only after an error that may have left in-doubt
  or uncommitted frames on the conn.

### Null values

Column-major nulls use an Arrow-shape validity bitmap: bit = 1 means **valid**,
LSB-first, one bit per row. Null rows' data slots are ignored (any value works).
Pass `NULL` (C) / omit the argument (C++) for a column with no nulls.

```c
double amount[] = {0.00044, 0.0, 0.00021};       // row 1 is null; slot ignored
uint8_t amount_valid[] = {0x05};                 // 0b101: rows 0 and 2 valid
column_sender_validity validity = {amount_valid, 3};
if (!column_sender_chunk_column_f64(chunk, "amount", 6, amount, 3, &validity, &err))
    goto on_error;
```

```cpp
double amount[] = {0.00044, 0.0, 0.00021};       // row 1 is null; slot ignored
uint8_t amount_valid[] = {0x05};                 // 0b101: rows 0 and 2 valid
questdb::ingress::validity_view validity{amount_valid, 3};
chunk.column_f64("amount", amount, 3, &validity);
```

The **designated timestamp is always non-null** per the QWP wire spec — the
timestamp setters take no validity parameter.

### Column setters

The fixed-width scalar and temporal setters take
`(chunk, name, name_len, data, row_count, validity, err_out)` in C — and the
same arguments minus `chunk`, `name_len`, and `err_out`, chained on
`column_chunk`, in C++ (`name` is a `std::string_view`; errors throw). Three
families take extra arguments:

- **`column_ts`** inserts a `column_sender_ts_unit unit` (passed as `uint32_t`
  on the ABI) before `validity`.
- **`column_str` / `column_binary`** replace `data` with
  `(offsets, bytes, bytes_len)` in Arrow Utf8 / Binary layout.
- **`symbol_i8` / `_i16` / `_i32`** replace `data` with `(codes, row_count,
  dict_offsets, dict_offsets_len, dict_bytes, dict_bytes_len)`.

See `column_sender.h` for the exact signatures. Complete list:

| Setter | Input per row | QuestDB type |
| --- | --- | --- |
| `column_i8` / `column_i16` / `column_i32` / `column_i64` | signed int | `BYTE` / `SHORT` / `INT` / `LONG` |
| `column_f32` / `column_f64` | float / double | `FLOAT` / `DOUBLE` |
| `column_bool` | LSB-first packed bitmap | `BOOLEAN` |
| `column_ts` + `column_sender_ts_unit` (`_micros` / `_nanos`) | int64 since epoch | `TIMESTAMP` / `TIMESTAMP_NS` |
| `column_date` | int64 millis since epoch | `DATE` |
| `column_uuid` | 16 bytes | `UUID` |
| `column_long256` | 32 bytes (4 LE limbs) | `LONG256` |
| `column_ipv4` | uint32 | `IPV4` |
| `column_str` | Arrow Utf8 offsets + bytes | `VARCHAR` |
| `column_binary` | Arrow Binary offsets + bytes | `BINARY` |
| `symbol_i8` / `_i16` / `_i32` | dict codes + Utf8 dictionary | `SYMBOL` |

Designated timestamp (exactly once per chunk, before flush):
`at_nanos` / `at_micros` / `at_millis` / `at_seconds` (millis and
seconds are widened to micros on the wire). Decimals, geohash, arrays, and the
remaining Arrow type matrix are reachable through the
[Arrow appenders](#arrow-ingestion) and the NumPy appender
(`column_sender_chunk_append_numpy_column`).

:::note The designated timestamp column is named `timestamp` server-side

Whatever your source column is called, QuestDB materializes the designated
timestamp as a column literally named `timestamp`. Query it back with
`SELECT timestamp ...` / `ORDER BY timestamp`, not the source name.

:::

## Arrow ingestion

If your data is already in Arrow — Arrow C++, PyArrow, polars, pandas, DuckDB,
nanoarrow — skip the per-column setters and flush a whole `RecordBatch` through
the [Arrow C Data Interface](https://arrow.apache.org/docs/format/CDataInterface.html)
(`ArrowArray` + `ArrowSchema`). One call encodes the batch, picks the
designated timestamp from a named column, and publishes it as one logical
batch. Requires a build with `QUESTDB_CLIENT_ENABLE_ARROW` (CMake option
`QUESTDB_ENABLE_ARROW`).

```cpp
using namespace questdb::ingress::literals;

// Requires a build with QUESTDB_CLIENT_ENABLE_ARROW.
// `array` + `schema` from any Arrow C Data Interface producer, e.g.
// arrow::ExportRecordBatch(*batch, &array, &schema) in Arrow C++.
void ingest(questdb::pool& pool, ArrowArray& array, const ArrowSchema& schema)
{
    auto conn = pool.borrow_column_sender();       // one per thread
    conn.flush_arrow_batch("trades"_tn, array, schema, "ts"_cn);
    conn.wait();                                      // ack barrier
}
```

```c
// `array` + `schema` from any Arrow C Data Interface producer.
bool ingest(questdb_db* db, struct ArrowArray* array,
            const struct ArrowSchema* schema, line_sender_error** err)
{
    column_sender* conn = questdb_db_borrow_column_sender(db, err);
    if (!conn)
        return false;
    bool ok = column_sender_flush_arrow_batch_at_column(
        conn, QDB_TABLE_NAME_LITERAL("trades"), array, schema,
        QDB_COLUMN_NAME_LITERAL("ts"), NULL, 0, err);
    if (ok)
        ok = column_sender_wait(conn, qwpws_ack_level_ok, 0, err);
    questdb_db_return_column_sender(db, conn);
    return ok;
}
```

- The designated timestamp comes from the named `Timestamp(_)` column
  (`"ts"` above). `flush_arrow_batch_at_now` (explicit opt-in) lets the server
  stamp arrival time instead — don't use it when the batch carries real event
  time.
- **Ownership**: on success `array->release` is consumed (set to `NULL`); the
  caller keeps `schema`. On failure check `array->release != NULL` before
  invoking it.
- Per-column wire-type hints (`column_sender_arrow_override`: force
  SYMBOL/VARCHAR, IPv4, char, geohash precision) steer encoding without
  touching the Arrow schema.
- To append Arrow **columns** into a chunk alongside hand-built ones, use
  `column_sender_chunk_append_arrow_column`, or
  `column_sender_arrow_import_new` + `..._append_arrow_import` to import once
  and slice across many chunks.
- Dictionary-encoded string columns map to `SYMBOL` by default; plain Utf8 to
  `VARCHAR`. The full supported matrix (43 Arrow type classifications) and
  unsupported kinds (`Struct`, `Map`, `Interval`, ...) are listed in
  `column_sender.h`; unsupported types fail with
  `line_sender_error_arrow_unsupported_column_kind`.

## Querying data

Get a reader (QWP/WebSocket only), prepare/execute SQL, then stream batches and
read typed columns. In C, `reader_query_execute` **consumes** the query handle
(sets your pointer to `NULL`). A borrowed reader, like the senders, is
single-thread; the pool it came from is the shared, thread-safe handle.

Two ways to get a reader, mirroring the writer side:

- **Pooled** — C++: `auto r = pool.borrow_reader();` returns a
  `questdb::egress::reader` that returns itself to the pool on scope exit (the
  **C++ example below** uses this). C:
  `reader* r = questdb_db_borrow_reader(db, &err);`, returned with
  `questdb_db_return_reader(db, r)` (or force-retired with
  `reader_drop_on_return(r)` / C++ `r.drop_on_return()`).
- **Standalone** — a one-off connection: C `reader_from_conf(...)`, C++
  `questdb::egress::reader{conf}`.

The reader pool is capped independently of the sender pools. Both examples
below borrow from the pool. One **C** wrinkle: `questdb_db_connect` lives in
`column_sender.h` and reports a `line_sender_error`, while every reader call
uses the distinct `reader_error` — so the pooled C reader needs that one extra
error type, but only for the `connect` call (shown inline below). For a
pool-free reader, swap `questdb_db_connect` + `questdb_db_borrow_reader` for a
single `reader_from_conf(conf, &err)`. In C++ both surface as exceptions, so
`pool.borrow_reader()` is friction-free.

:::warning Mid-stream query failover can duplicate rows

If the connection fails over while a result set is streaming, the query
restarts on the new endpoint and rows you already consumed are delivered
again. Any query that feeds aggregation or writes must handle this — see the
[dedicated hazard section](/docs/connect/clients/c-and-cpp/#mid-stream-failover-hazard-duplicate-rows)
of the main guide for detection and mitigation patterns.

:::

### C

```c
#include <questdb/ingress/column_sender.h>   // questdb_db pool + questdb_db_connect
#include <questdb/egress/reader.h>            // reader
#include <stdio.h>

int main(void)
{
    line_sender_error* db_err = NULL;   // questdb_db_connect uses the ingress error type
    reader_error* err = NULL;           // borrow + reader/query/cursor use reader_error
    questdb_db* db = NULL;
    reader* rd = NULL;
    reader_query* query = NULL;
    reader_cursor* cursor = NULL;

    db = questdb_db_connect("ws::addr=localhost:9000;", 24, &db_err);
    if (!db)
    {
        size_t len = 0;
        const char* msg = line_sender_error_msg(db_err, &len);
        fprintf(stderr, "connect error: %.*s\n", (int)len, msg);
        line_sender_error_free(db_err);
        return 1;
    }

    rd = questdb_db_borrow_reader(db, &err);   // pooled borrow
    if (!rd) goto on_error;

    query = reader_prepare(rd,
        QDB_UTF8_LITERAL("SELECT x AS n, x * 1.5 AS d FROM long_sequence(5)"), &err);
    if (!query) goto on_error;
    cursor = reader_query_execute(&query, &err);   // consumes `query`
    if (!cursor) goto on_error;

    const reader_batch* batch;
    while ((batch = reader_cursor_next_batch(cursor, &err)) != NULL)
    {
        size_t rows = reader_batch_row_count(batch);
        size_t cols = reader_batch_column_count(batch);
        for (size_t c = 0; c < cols; ++c)
        {
            reader_column_data col;
            if (!reader_batch_column_data(batch, c, &col, &err)) goto on_error;
            for (size_t r = 0; r < rows; ++r)
            {
                bool is_null = false;
                if (col.kind == reader_column_kind_double)
                {
                    double v = reader_column_data_get_f64(&col, r, &is_null);
                    printf(is_null ? "NULL " : "%g ", v);
                }
                else if (col.kind == reader_column_kind_long)
                {
                    int64_t v = reader_column_data_get_i64(&col, r, &is_null);
                    printf(is_null ? "NULL " : "%lld ", (long long)v);
                }
            }
        }
        printf("\n");
    }
    if (err) goto on_error;   // next_batch returns NULL at end-of-stream AND on error

    reader_cursor_free(cursor);
    questdb_db_return_reader(db, rd);   // return the borrow to the pool
    questdb_db_close(db);
    return 0;

on_error:;
    size_t len = 0;
    const char* msg = reader_error_msg(err, &len);
    fprintf(stderr, "error: %.*s\n", (int)len, msg);
    reader_error_free(err);
    reader_cursor_free(cursor);
    questdb_db_return_reader(db, rd);   // pool drops it if the transport tore down
    questdb_db_close(db);
    return 1;
}
```

Read values with the `static inline reader_column_data_get_*` accessors; each
takes `(&col, row, &is_null)`. Dispatch on `col.kind` (`reader_column_kind`) to
pick the right accessor.

### C++

```cpp
#include <questdb/egress/reader.hpp>   // also pulls in questdb::pool
#include <iostream>

using namespace questdb::ingress::literals;

int main()
{
    try
    {
        questdb::pool pool{"ws::addr=localhost:9000;"};
        auto reader = pool.borrow_reader();   // RAII: returns to the pool on scope exit
        auto cur = reader.execute("SELECT x AS n, x * 1.5 AS d FROM long_sequence(5)"_utf8);

        while (auto bo = cur.next_batch())
        {
            auto& batch = *bo;
            for (size_t r = 0; r < batch.row_count(); ++r)
            {
                for (size_t c = 0; c < batch.column_count(); ++c)
                {
                    auto col = batch.column(c);
                    if (col.kind() == questdb::egress::column_kind::double_)
                    {
                        auto v = col.get<double>(r);             // std::optional-like
                        std::cout << (v ? std::to_string(*v) : "NULL") << " ";
                    }
                    else if (col.kind() == questdb::egress::column_kind::long_)
                    {
                        auto v = col.get<int64_t>(r);
                        std::cout << (v ? std::to_string(*v) : "NULL") << " ";
                    }
                }
                std::cout << "\n";
            }
        }
        return 0;
    }
    // The pool ctor throws questdb::ingress::line_sender_error; reader/query
    // calls throw questdb::egress::reader_error. Both derive from
    // std::exception, so one catch covers the pooled path.
    catch (const std::exception& e)
    {
        std::cerr << "error: " << e.what() << "\n";
        return 1;
    }
}
```

Use `reader.prepare(sql)` and chain `bind_*` for parameterised queries;
`reader.execute(sql)` is the no-bind shortcut. The reader must outlive any
cursor it produces.

## Failover, retry, and pool lifecycle

The pool owns reconnection and connection health so borrowers don't have to:

- **Multiple endpoints.** Comma-separate hosts in one `addr=` (or repeat the
  key): `ws::addr=db-primary:9000,db-replica-1:9000;`. The pool rotates away
  from unhealthy endpoints on borrow.
- **Retrying borrow.** `questdb_db_borrow_column_sender_with_retry(db,
  budget_ms, &err)` and `questdb_db_borrow_row_sender_with_retry(...)` (C++
  `pool::borrow_column_sender_with_retry(budget_ms)` /
  `borrow_row_sender_with_retry(budget_ms)`) retry the connect within `budget_ms`
  using the pool's reconnect backoff. Authentication and protocol-version errors
  are terminal; `budget_ms == 0` makes a single attempt.
- **Failover budget.** `questdb_db_reconnect_max_duration_ms(db)` (C++
  `pool::reconnect_max_duration_ms()`, default 300000 ms) is the pool's overall
  reconnect budget — pass the remaining budget to the `_with_retry` calls when
  tracking a deadline.
- **Return vs. drop.** Returning a healthy borrow recycles its connection;
  dropping retires it and the next borrow opens a fresh one. The return path
  **already** drops any conn that latched a terminal error or whose pool has been
  closed, so plain return/RAII destruction is the default. Use
  `questdb_db_drop_*` / `drop_on_return()` only after an error where the next
  borrower must not inherit the connection (or, for store-and-forward, must not
  commit its in-doubt frames).
- **Reaping.** With `pool_reap=auto` a background reaper closes idle connections
  above `pool_size` after `pool_idle_timeout_ms`. With `pool_reap=manual`, call
  `questdb_db_reap_idle(db)` (C++ `pool::reap_idle()`), which returns the number
  of connections it closed.

### Which errors mean what {#which-errors-mean-what}

Dispatch on `line_sender_error_get_code(err)` (C++
`e.code()`). What to do with the borrow after each class:

| Error code | Meaning | Borrow state | What to do |
| --- | --- | --- | --- |
| `auth_error`, `tls_error`, `unsupported_server`, `protocol_version_error` | Deployment/config problem | n/a (borrow failed) | Fix the connect string or server; retrying won't help. The retry helpers treat these as terminal. |
| `failover_retry` | Transient transport failure; frames may be in-doubt | Latched terminal | **Drop** the borrow, then re-borrow with `borrow_*_with_retry(reconnect_max_duration_ms())`. With `sf_dir`, unresolved frames replay on the next borrow. |
| `server_rejection` | Server refused the data (schema/type conflict, bad name) | Latched terminal | Plain **return** is safe — the pool retires the latched conn. Fix the data before re-sending; blind retry re-fails. |
| `server_flush_error` (SubmitTimedOut) | Backpressure deadline hit — queue full for `sf_append_deadline_millis` | Usable | Retry later, shed load, or raise the deadline. Nothing was dropped. See [backpressure](#durability-and-backpressure). |
| `invalid_api_call` | Borrow at `pool_max` cap, pool closed, or API misuse | n/a | At-cap: treat as backpressure (see [Sizing the pool](#sizing-the-pool)). Closed pool: stop borrowing. |

When in doubt after an ingestion error: **return is always memory-safe** (the
pool inspects the conn and retires it if unhealthy); **drop** is the
conservative choice when the error left frames whose fate you can't determine
and the next borrower must not commit them.

## Durability and backpressure {#durability-and-backpressure}

The QWP/WebSocket writers are asynchronous: every flush **publishes** into a
local queue that owns delivery, and returns before the server ACKs. The
durability story in one place:

1. **`flush` = local acceptance.** Success means the frame is queued locally,
   nothing more. The background runner delivers, receives ACKs, reconnects,
   and replays as needed — even while the conn is parked in the pool.
2. **`wait` = observation.** `column_sender_wait` / `row_sender_wait`
   (C++ `wait()`) block until everything published so far reaches an ack
   level: `qwpws_ack_level_ok` (server accepted) or `qwpws_ack_level_durable`
   (Enterprise: uploaded to object storage — distinguish "in the server's WAL"
   from "durable off-box"). The timeout is a **no-progress deadline**: it fires
   only if the watermark stops advancing; on timeout the frames stay queued —
   call `wait` again or watch FSNs, don't re-flush.
3. **`sf_dir` = crash survival.** Without it the queue is in memory: a process
   crash loses unacked frames, and pool close drains best-effort within
   `close_flush_timeout`. With `sf_dir`, frames persist on disk and **replay on
   the next borrow** (same `sender_id`), surviving process restarts. Strongly
   recommended for multi-host deployments — during failover, flushes keep
   landing on disk instead of filling RAM.
4. **Backpressure is bounded blocking.** Two stacked caps: 128 in-flight
   unacked frames, and `sf_max_total_bytes` (default 128 MiB memory mode,
   10 GiB disk mode). At a cap, `flush` blocks up to
   `sf_append_deadline_millis` (default 30000), then returns
   `server_flush_error`. Nothing is dropped or overwritten while blocked. A
   single payload larger than `sf_max_bytes` (default 4 MiB) is rejected
   immediately instead.

## FSN progress (non-blocking) {#fsn-progress-non-blocking}

Every QWP/WebSocket flush is asynchronous: it publishes into the local queue and
returns before the server ACKs. Beyond the blocking `wait` barrier, both senders
expose **frame sequence numbers (FSNs)** for non-blocking progress tracking while
the same borrow is still held:

- Publish with an FSN-returning flush — C `column_sender_flush_and_get_fsn` /
  `row_sender_flush_and_get_fsn`; C++ `flush_and_get_fsn()` (returns
  `std::optional<uint64_t>`).
- Keep doing work, then compare the saved FSN against the completion watermark —
  C `column_sender_acked_fsn` / `row_sender_acked_fsn`; C++ `acked_fsn()`. The
  publication boundary has completed once `acked_fsn` returns a value `>=` your
  saved FSN.

FSNs are per-stream watermarks for the **currently borrowed** sender, not
portable receipts you can check through a later, unrelated pool borrow.

## Concurrency: one borrow per worker {#concurrency-one-borrow-per-worker}

The pool is the **only** thread-safe handle. Every borrowed handle — sender,
reader, chunk, buffer — belongs to the thread that took it. The recommended
pattern: share the pool, give each worker its own borrow for its lifetime, and
size `pool_max` to the worker count.

```cpp
#include <questdb/ingress/column_sender.hpp>
#include <thread>
#include <vector>
#include <iostream>

using namespace questdb::ingress::literals;

int main()
{
    // pool_max bounds each borrow kind: size it to the worker count.
    questdb::pool pool{"ws::addr=localhost:9000;pool_max=4;"};

    std::vector<std::thread> workers;
    for (int w = 0; w < 4; ++w)
    {
        workers.emplace_back([&pool, w]() {
            try
            {
                // One borrow per worker; lives for the worker's lifetime.
                auto sender = pool.borrow_row_sender();
                auto buffer = sender.new_buffer();
                for (int i = 0; i < 100; ++i)
                {
                    buffer.table("trades"_tn)
                          .symbol("symbol"_cn, "ETH-USD"_utf8)
                          .column("price"_cn, 2615.54 + w)
                          .at(questdb::ingress::timestamp_nanos::now());
                }
                sender.flush(buffer);
                sender.wait();   // ack barrier before the borrow returns
            }
            catch (const questdb::ingress::line_sender_error& e)
            {
                std::cerr << "worker " << w << ": " << e.what() << "\n";
            }
        });
    }
    for (auto& t : workers) t.join();
    return 0;
}
```

Notes:

- Do **not** pass a borrowed sender between threads mid-borrow, even with your
  own locking — return it and borrow again on the other thread.
- Chunks and buffers are also single-thread, but you may **build** a chunk on
  one thread and flush it through a sender borrowed on another, as long as the
  handoff is ordered (e.g. via a queue) and only one thread touches it at a
  time.
- Store-and-forward mode is single-borrower by design — use one dedicated
  writer thread for the SF column sender.

## Closing

Orderly shutdown is: **wait, return, close.**

1. If you need delivery confirmation, call `wait` on each sender first (or
   check FSN watermarks) — pool close only drains best-effort within
   `close_flush_timeout` on an in-memory queue. With `sf_dir`, unacked frames
   survive on disk regardless and replay on the next run.
2. Return or drop every borrow. In C++, scope exit does this.
3. `questdb_db_close(db)` (C++: `pool` destructor). Accepts `NULL`. This is
   the **final owner release**: don't call it concurrently with borrows or
   reaps on the same handle.

Outstanding borrows are **independent leases**: returning or dropping them
after close is safe (they close instead of recycling), but new operations on
them fail with `invalid_api_call`. Return and drop remain **mutually
exclusive** per handle — exactly one, exactly once; a second release call on
the same handle is undefined behavior.

There is **no `must_close()` inspection call** — earlier drafts of this API had
one, and it's gone deliberately. The return path itself detects a
terminally-latched connection and retires it; you only ever choose between
plain return and force-drop.

## Production shape: TLS, token, multi-host, retry

Everything above, combined the way a production deployment looks — TLS with OS
roots, bearer token, two endpoints, store-and-forward spool, and a
retry-bounded borrow:

```cpp
#include <questdb/ingress/column_sender.hpp>
#include <iostream>

using namespace questdb::ingress::literals;

int main()
{
    try
    {
        questdb::pool pool{
            "wss::addr=db-primary.example.com:9000,db-replica.example.com:9000;"
            "token=YOUR_BEARER_TOKEN;"
            "tls_ca=os_roots;"
            "sf_dir=/var/spool/questdb;"
            "sender_id=ingest-01;"};

        // First borrow opens the connection: give it the failover budget.
        auto sender =
            pool.borrow_row_sender_with_retry(pool.reconnect_max_duration_ms());

        auto buffer = sender.new_buffer();
        buffer.table("trades"_tn)
              .symbol("symbol"_cn, "ETH-USD"_utf8)
              .column("price"_cn, 2615.54)
              .at(questdb::ingress::timestamp_nanos::now());

        sender.flush(buffer);                       // lands in the sf_dir spool
        sender.wait(questdb::ingress::qwpws_ack_level::durable);  // Enterprise
        return 0;
    }
    catch (const questdb::ingress::line_sender_error& e)
    {
        std::cerr << "error: " << e.what() << "\n";
        return 1;
    }
}
```

## Conventions and lifecycle

- **Error handling.** C: every fallible call takes a trailing
  `line_sender_error**` (ingress / pool / senders) or `reader_error**` (reads)
  and returns `bool`/handle (`NULL` on failure). Read with `*_error_msg`, free
  with `*_error_free`. C++: failures throw `questdb::ingress::line_sender_error`
  (pool + writes) or `questdb::egress::reader_error` (reads); both derive from
  `std::runtime_error`.
- **Ownership.** C handles are created by `*_connect` / `*_new` / `*_from_conf`
  / `questdb_db_borrow_*` and released with `*_close` / `*_free` /
  `questdb_db_return_*` / `questdb_db_drop_*`. Return and drop are **mutually
  exclusive** on the same handle: call exactly one, exactly once. The C++
  wrappers (`pool`, `borrowed_column_sender`, `borrowed_row_sender`,
  `column_chunk`, `reader`, `cursor`) are RAII and move-only.
- **Concurrency.** The pool is shared across threads; a borrowed handle belongs
  to one thread at a time. See
  [Concurrency: one borrow per worker](#concurrency-one-borrow-per-worker).

## Scope and gaps

- The pool vends **column-major senders**, **row-major senders**, and
  **readers** in both C and C++, matching the Rust
  [`QuestDb`](/docs/connect/clients/rust/) surface.
- The full ABI listing (every enum, struct, and function across the headers) can
  be regenerated with `scripts/generate-c-api-reference.js`.

## Next steps

- [Connect string reference](/docs/connect/clients/connect-string/)
- [QWP protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/)
- [Rust pooled API](/docs/connect/clients/rust/) (the same pool, in Rust)
