---
slug: /connect/clients/c-api-reference
title: C/C++ client (pooled API) draft
sidebar_label: C/C++ pooled API (draft)
description: "Draft guide for the QuestDB C and C++ pooled connection API: questdb_db / questdb::pool for column-major and row-major ingestion and the query reader, over QWP/WebSocket."
---

:::caution Draft

Work-in-progress guide for the **pooled** C/C++ API on the
`jh_conn_pool_refactor` branch, built side-by-side with the existing
[C & C++ guide](/docs/connect/clients/c-and-cpp/) for comparison. Documents the
connection-pool entry point (`questdb_db_*` in C, `questdb::pool` in C++). APIs
may change before release.

:::

The C and C++ clients ingest and query over
[QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/), a columnar binary
protocol carried over WebSocket. The pool is the **front door** for both: open
it once, then borrow a column-major sender, a row-major sender, or a reader. It
is the C/C++ projection of the Rust
[`QuestDb`](/docs/connect/clients/rust/) pool, with matching names.

## API overview

| Concern | C | C++ |
| --- | --- | --- |
| Connection pool | `questdb_db*` | `questdb::pool` |
| Borrow a **column-major** writer | `questdb_db_borrow_column_sender` → `column_sender*` | `pool::borrow_column_sender()` → `borrowed_column_sender` |
| Borrow a **row-major** writer | `questdb_db_borrow_row_sender` → `row_sender*` | `pool::borrow_row_sender()` → `borrowed_row_sender` |
| Borrow a **reader** | `questdb_db_borrow_reader` → `reader*` | `pool::borrow_reader()` → `reader` |
| Column batch | `column_sender_chunk*` | `questdb::ingress::column_chunk` |
| Row buffer | `line_sender_buffer*` | `questdb::ingress::line_sender_buffer` |
| Streaming result | `reader_cursor*` → `reader_batch*` | `cursor` → `batch` → `column` |

One `questdb_db` pool vends three kinds of borrow, each from its own
independently-capped free list (the combined live-connection ceiling is
`3 * pool_max`):

- **Column-major** (`borrow_column_sender`) — build a `chunk` of whole columns
  (slices) and flush it. Best for bulk/columnar loads (Arrow, polars).
- **Row-major** (`borrow_row_sender`) — the classic ILP `line_sender_buffer`:
  append rows field-by-field, then flush. Best for event-at-a-time ingestion.
- **Reader** (`borrow_reader`) — run SQL and stream typed columnar results.

The C++ types are thin RAII wrappers over the C ABI; the pool, borrows, chunk,
and reader free/return themselves on scope exit and report errors as exceptions.

## Headers

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
[connect string reference](/docs/connect/clients/connect-string/).

```c
line_sender_error* err = NULL;
questdb_db* db = questdb_db_connect("ws::addr=localhost:9000;", 24, &err);
if (!db) { /* read err, handle */ }
```

```cpp
questdb::pool pool{"ws::addr=localhost:9000;"};   // alias of questdb::ingress::pool
```

### Pool keys

| Key | Default | Meaning |
| --- | --- | --- |
| `pool_size` | 1 | Warm/minimum connections, opened eagerly at connect. |
| `pool_max` | 64 | Hard cap on auto-grow. Borrowing at the cap returns an error. |
| `pool_idle_timeout_ms` | 60000 | Idle connections above `pool_size` are closed after this long. |
| `pool_reap` | `auto` | `auto` runs a background reaper; `manual` requires `questdb_db_reap_idle` / `pool::reap_idle`. |

Setting `sf_dir` opts the column sender into **store-and-forward** (on-disk
durability). In SF mode the pool currently supports a single active borrower —
an explicit `pool_size > 1` or `pool_max > 1` is rejected, and an omitted
`pool_max` is treated as `1`. `sender_id` and the other `sf_*` keys require an
explicit `sf_dir`.

## Sending data: column-major

Borrow a column sender, build a `chunk` of columns (each a contiguous array plus
a row count), set the designated timestamp, then flush. `sync` waits for the
server to acknowledge.

### C

```c
#include <questdb/ingress/column_sender.h>
#include <stdio.h>

int main(void)
{
    line_sender_error* err = NULL;
    questdb_db* db = NULL;
    column_sender* sender = NULL;
    column_sender_chunk* chunk = NULL;

    db = questdb_db_connect("ws::addr=localhost:9000;", 24, &err);
    if (!db) goto on_error;

    sender = questdb_db_borrow_column_sender(db, &err);
    if (!sender) goto on_error;

    double price[]  = {2615.54, 2616.00, 2617.25};
    double amount[] = {0.00044, 0.00050, 0.00021};
    int64_t ts_ns[] = {1700000000000000000, 1700000000001000000, 1700000000002000000};
    size_t n = 3;

    chunk = column_sender_chunk_new("trades", 6, &err);
    if (!chunk) goto on_error;
    // (chunk, name, name_len, data, row_count, validity_or_NULL, err_out)
    if (!column_sender_chunk_column_f64(chunk, "price", 5, price, n, NULL, &err)) goto on_error;
    if (!column_sender_chunk_column_f64(chunk, "amount", 6, amount, n, NULL, &err)) goto on_error;
    if (!column_sender_chunk_designated_timestamp_nanos(chunk, ts_ns, n, &err)) goto on_error;

    if (!column_sender_flush(sender, chunk, &err)) goto on_error;        // publish
    if (!column_sender_sync(sender, column_sender_ack_level_ok, &err)) goto on_error; // wait for ACK

    column_sender_chunk_free(chunk);
    questdb_db_return_column_sender(db, sender);   // return the borrow to the pool
    questdb_db_close(db);
    return 0;

on_error:;
    size_t len = 0;
    const char* msg = line_sender_error_msg(err, &len);
    fprintf(stderr, "error: %.*s\n", (int)len, msg);
    line_sender_error_free(err);
    column_sender_chunk_free(chunk);
    if (sender) questdb_db_drop_column_sender(db, sender);  // drop a possibly-bad sender
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
        auto sender = pool.borrow_column_sender();   // RAII: returns to pool on scope exit

        double price[]  = {2615.54, 2616.00, 2617.25};
        double amount[] = {0.00044, 0.00050, 0.00021};
        int64_t ts_ns[] = {1700000000000000000, 1700000000001000000, 1700000000002000000};
        size_t n = 3;

        questdb::ingress::column_chunk chunk{"trades"};
        chunk.column_f64("price", price, n)
             .column_f64("amount", amount, n)
             .designated_timestamp_nanos(ts_ns, n);

        sender->flush(chunk);   // publish  (borrowed_column_sender derefs to the sender)
        sender->sync();         // wait for ACK (column_sender_ack_level::ok)
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
- `flush` publishes; `sync` commits and waits. Flush many chunks, then `sync`
  once (`column_sender_ack_level_durable` waits for durable upload, Enterprise).
- **Return the borrow**: C `questdb_db_return_column_sender` (recycle) or
  `questdb_db_drop_column_sender` (discard a bad one); C++ does it in the
  `borrowed_column_sender` destructor (`drop_on_return()` forces a drop).
- Column setter families: `column_f64/f32`, `column_i64/i32/i16/i8`,
  `column_bool`, `column_ts_nanos/micros`, `column_date_millis`, `column_uuid`,
  `column_long256`, `column_ipv4`, `column_varchar`/`column_binary`, and
  `symbol_dict_i8/i16/i32`.

## Sending data: row-major

Borrow a row sender and flush a `line_sender_buffer` — the classic ILP buffer
you build field-by-field. The row sender uses a single error type
(`line_sender_error`) throughout.

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

    buffer = line_sender_buffer_new_qwp();   // QWP-format buffer
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

        // Build the classic ILP buffer (see the C & C++ guide for the full
        // column API). QWP-format buffer for the WebSocket transport:
        auto buffer = questdb::ingress::line_sender_buffer::qwp_udp();  // QWP wire format
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

:::note `borrowed_row_sender` has no `new_buffer()`

Unlike the standalone `questdb::ingress::line_sender` (which offers
`new_buffer()`), the borrowed row sender does not yet hand you a
protocol-matched buffer — you construct a `line_sender_buffer` yourself. The
factory name `qwp_udp()` reflects the shared QWP wire format (the same buffer is
used for the WebSocket transport); a dedicated QWP/WS buffer factory may land
later. Confirm against your build.

:::

## Querying data

Get a reader (QWP/WebSocket only), prepare/execute SQL, then stream batches and
read typed columns. In C, `reader_query_execute` **consumes** the query handle
(sets your pointer to `NULL`).

Two ways to get a reader, mirroring the writer side:

- **Pooled** — C++: `auto r = pool.borrow_reader();` returns a
  `questdb::egress::reader` that returns itself to the pool on scope exit (the
  **C++ example below** uses this). C:
  `reader* r = questdb_db_borrow_reader(db, &err);`, returned with
  `questdb_db_return_reader(db, r)`.
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

## Conventions and lifecycle

- **Error handling.** C: every fallible call takes a trailing
  `line_sender_error**` (ingress / pool / senders) or `reader_error**` (reads)
  and returns `bool`/handle (`NULL` on failure). Read with `*_error_msg`, free
  with `*_error_free`. C++: failures throw `questdb::ingress::line_sender_error`
  (pool + writes) or `questdb::egress::reader_error` (reads); both derive from
  `std::runtime_error`.
- **Ownership.** C handles are created by `*_connect` / `*_new` / `*_from_conf`
  / `questdb_db_borrow_*` and released with `*_close` / `*_free` /
  `questdb_db_return_*` / `questdb_db_drop_*`. The C++ wrappers (`pool`,
  `borrowed_column_sender`, `borrowed_row_sender`, `column_chunk`, `reader`,
  `cursor`) are RAII and move-only.
- **Concurrency.** The pool is shared across threads; a borrowed handle belongs
  to one thread at a time. Borrow one per worker and size `pool_size`/`pool_max`
  accordingly.

## Scope and gaps

- The pool vends **column-major senders**, **row-major senders**, and
  **readers** in both C and C++, matching the Rust
  [`QuestDb`](/docs/connect/clients/rust/) surface.
- The borrowed row sender has no `new_buffer()` helper yet (see the note above).
- The full ABI listing (every enum, struct, and function across the headers) can
  be regenerated with `scripts/generate-c-api-reference.js`.

## Next steps

- [Connect string reference](/docs/connect/clients/connect-string/)
- [QWP protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/)
- [Rust pooled API](/docs/connect/clients/rust/) (the same pool, in Rust)
