---
slug: /connect/clients/c-and-cpp
title: C & C++ client for QuestDB
sidebar_label: C & C++
description: "QuestDB C and C++ client: the questdb_db / questdb::pool connection pool for row buffers, column chunks, Arrow ingestion, and SQL queries over QWP/WebSocket."
---

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"

The C and C++ clients ingest and query over
[QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/), a columnar binary
protocol carried over WebSocket. The pool is the entry point for both ingesting
and querying data: borrow a sender to write rows, or a reader to execute SQL queries.

## CMake setup

The client lives at
[questdb/c-questdb-client](https://github.com/questdb/c-questdb-client): one
`questdb_client` library for both languages (the C++ API is header-only
wrappers over the C ABI). Requirements: C11 (C API) or C++17 (C++ API), and a
[Rust toolchain](https://rustup.rs/) to build the Rust core from source. The
fastest integration is CMake `FetchContent`; pin a release tag or commit SHA
for production builds:

```cmake
include(FetchContent)
FetchContent_Declare(
    c_questdb_client_proj
    GIT_REPOSITORY https://github.com/questdb/c-questdb-client.git
    GIT_TAG        main)   # replace with a release tag or commit SHA
FetchContent_MakeAvailable(c_questdb_client_proj)

target_link_libraries(your_target questdb_client)
```

- The query reader and its `zstd` dependency are always compiled into the C
  and C++ library.
- Arrow support ([ingestion](#arrow-ingestion) and
  [result batches](#arrow-result-batches)) is opt-in: build with
  `-DQUESTDB_ENABLE_ARROW=ON`.
- The library links statically by default; `-DBUILD_SHARED_LIBS=ON` builds a
  shared library instead. Outside CMake, add the repo's `include/` directory
  to your include path and link `-lquestdb_client`.
- Vendoring with `git submodule` / `git subtree`, and building from source, are
  covered in the repo's
  [DEPENDENCY.md](https://github.com/questdb/c-questdb-client/blob/main/doc/DEPENDENCY.md).

### Headers

Three QWP entry headers, in both a C (`.h`) and a C++ (`.hpp`) flavour:

| Header | Provides |
| --- | --- |
| `questdb/client` | The pool: `questdb_db` / `questdb::pool` |
| `questdb/ingress/qwp_sender` | Senders: `questdb_db_borrow_sender` / `pool::borrow_sender()` |
| `questdb/egress/qwp_reader` | Readers: `questdb_db_borrow_reader` / `pool::borrow_reader()` |

Both borrow headers include the pool header, so a program that only ingests
includes only `qwp_sender`, and one that only queries includes only
`qwp_reader` — each gets the pool along with it. Include `client` directly to hold
or configure a pool in a translation unit that borrows nothing itself. Mixing
the C and C++ flavours in one translation unit is fine; the C++ API is a
header-only wrapper over the C ABI.

The shared error, table/column name and UTF-8 types (`line_sender_error`,
`line_sender_buffer`, the `_utf8` literals) live in
`questdb/ingress/line_sender.h`, which all three entry headers include, so the
examples below use them without naming that header. The
[Full API reference](#full-api-reference) maps the whole surface.

## Quick start

The code below opens a connection pool, borrows a **sender** to write a row,
then borrows a **reader** to read it back. This exercises both APIs in one
runnable program; in production the ingestion and query paths are usually
separate services that share only the table.

The read-back pauses for a second first. Flush-and-wait returns once the server
has accepted the row; the row becomes visible to queries a few milliseconds
later, once QuestDB applies the WAL to the table (see
[Durability and backpressure](#durability-and-backpressure)). For bulk/columnar
and Arrow ingestion, see [The pool](#the-pool) and
[Sending data: chunks](#sending-data-column-major).

<Tabs defaultValue="cpp" groupId="c-cpp">
<TabItem value="cpp" label="C++">

```cpp
#include <questdb/ingress/qwp_sender.hpp>  // pool::borrow_sender
#include <questdb/egress/qwp_reader.hpp>          // pool::borrow_reader
#include <chrono>
#include <iostream>
#include <thread>

using namespace questdb::ingress::literals;

int main()
{
    questdb::pool pool{"ws::addr=localhost:9000;"};

    // Insert: borrow a sender, write a row, flush-and-wait.
    {
        auto sender = pool.borrow_sender();
        auto buffer = sender.new_buffer();
        buffer.table("trades"_tn)
              .symbol("symbol"_cn, "ETH-USDT"_utf8)
              .column("price"_cn, 2615.54)
              .at(questdb::ingress::timestamp_nanos::now());
        sender.flush_and_wait(buffer);
    }

    // Pause so the read-back sees the row: the flush-and-wait above means the
    // server accepted it, and it becomes queryable a few milliseconds later.
    std::this_thread::sleep_for(std::chrono::seconds(1));

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

</TabItem>
<TabItem value="c" label="C">

```c
#include <questdb/ingress/qwp_sender.h>   // questdb_db_borrow_sender + line_sender_buffer
#include <questdb/egress/qwp_reader.h>            // questdb_db_borrow_reader
#include <stdio.h>
#include <string.h>
#include <threads.h>

int main(void)
{
    /* line_sender_error and questdb_error are the same type under two names,
       so one variable would do; two keeps the error paths separate below. */
    line_sender_error* err = NULL;   /* pool + sender */
    questdb_error* rerr = NULL;      /* reader + cursor */
    questdb_db* db = NULL;
    qwp_sender* sender = NULL;
    line_sender_buffer* buffer = NULL;
    qwp_reader* rd = NULL;
    qwp_reader_cursor* cursor = NULL;

    const char* conf = "ws::addr=localhost:9000;";
    db = questdb_db_connect(conf, strlen(conf), &err);
    if (!db) goto on_error;

    /* Insert: borrow a sender, write a row, flush-and-wait. */
    sender = questdb_db_borrow_sender(db, &err);
    if (!sender) goto on_error;
    buffer = questdb_db_new_buffer(db, &err);
    if (!buffer) goto on_error;
    if (!line_sender_buffer_table(buffer, QDB_TABLE_NAME_LITERAL("trades"), &err)) goto on_error;
    if (!line_sender_buffer_symbol(buffer, QDB_COLUMN_NAME_LITERAL("symbol"),
                                   QDB_UTF8_LITERAL("ETH-USDT"), &err)) goto on_error;
    if (!line_sender_buffer_column_f64(buffer, QDB_COLUMN_NAME_LITERAL("price"), 2615.54, &err)) goto on_error;
    if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err)) goto on_error;
    if (!qwp_sender_flush_buffer_and_wait(sender, buffer, qwpws_ack_level_ok, &err)) goto on_error;
    line_sender_buffer_free(buffer);
    buffer = NULL;
    questdb_db_return_sender(db, sender);
    sender = NULL;

    /* Pause so the read-back sees the row: the flush-and-wait above means the
       server accepted it, and it becomes queryable a few milliseconds later. */
    thrd_sleep(&(struct timespec){ .tv_sec = 1 }, NULL);

    /* Query: borrow a reader, run SQL, print rows. */
    rd = questdb_db_borrow_reader(db, &rerr);
    if (!rd) goto on_query_error;
    cursor = qwp_reader_execute(rd,
        QDB_UTF8_LITERAL("SELECT symbol, price FROM trades LIMIT 5"), &rerr);
    if (!cursor) goto on_query_error;

    const qwp_reader_batch* batch;
    while ((batch = qwp_reader_cursor_next_batch(cursor, &rerr)) != NULL)
    {
        size_t rows = qwp_reader_batch_row_count(batch);
        qwp_reader_column_data d_symbol, d_price;
        qwp_reader_symbol_dict dict;
        if (!qwp_reader_batch_column_data(batch, 0, &d_symbol, &rerr)) goto on_query_error;
        if (!qwp_reader_batch_column_data(batch, 1, &d_price, &rerr)) goto on_query_error;
        if (!qwp_reader_batch_symbol_dict(batch, &dict, &rerr)) goto on_query_error;
        for (size_t r = 0; r < rows; ++r)
        {
            bool sym_null = false, price_null = false;
            const char* sym = NULL;
            size_t sym_len = 0;
            if (!qwp_reader_column_data_get_symbol(&d_symbol, &dict, r, &sym, &sym_len, &sym_null))
                goto on_query_error;
            double price = qwp_reader_column_data_get_f64(&d_price, r, &price_null);

            if (sym_null)   printf("NULL ");
            else            printf("%.*s ", (int)sym_len, sym);
            if (price_null) printf("NULL\n");
            else            printf("%g\n", price);
        }
    }
    if (rerr) goto on_query_error;

    qwp_reader_cursor_free(cursor);
    qwp_reader_close(rd);
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
    if (sender) questdb_db_drop_sender(db, sender);
    questdb_db_close(db);
    return 1;

on_query_error:;
    {
        size_t len = 0;
        const char* msg = questdb_error_msg(rerr, &len);
        fprintf(stderr, "error: %.*s\n", (int)len, msg);
        questdb_error_free(rerr);
    }
    qwp_reader_cursor_free(cursor);
    qwp_reader_close(rd);
    questdb_db_close(db);
    return 1;
}
```

</TabItem>
</Tabs>

## The pool

`questdb_db` (C) / `questdb::pool` (C++) is a thread-safe handle that owns a set
of reusable QWP/WebSocket connections. Open one per deployment, share it across
threads, close it at shutdown.

You don't open connections yourself: **borrow** a lease (a sender or reader),
use it on one thread, then **return** it (recycles the connection) or **drop**
it (retires it). In C++ the borrowed sender wrapper and pooled reader return on
destruction; `drop_on_return()` forces a drop. The pool connects lazily, and
reconnects and fails over on its own.

### Which borrow?

Match the borrow to the shape of your data:

| You have | Borrow | Why |
| --- | --- | --- |
| Columnar data already in arrays or Arrow batches (bulk loads, backfills, ETL) | **Sender** (`borrow_sender`) + chunk or Arrow method | Whole columns are encoded in one pass, with no per-row assembly. |
| Events arriving one at a time (tickers, order flow, telemetry) | **Sender** (`borrow_sender`) + buffer | Build rows field-by-field into a buffer, flush batches on your cadence. |
| SQL to run: verification read-backs, dashboards, downsampling | **Reader** (`borrow_reader`) | Streams typed columnar batches with flow control. |

Buffers, chunks, and Arrow batches may target the same tables; QuestDB unifies
the schema server-side.

## Connecting

The connect string uses a QWP/WebSocket scheme: `ws` / `wss`. For auth and TLS
keys, see the
[connect string reference](/docs/connect/clients/connect-string/). The pool is
**lazy**: `questdb_db_connect` (C) and the `questdb::pool` constructor (C++)
parse and validate the string but perform no blocking network I/O, so auth /
TLS / connect errors surface from the first borrow, not at construction. The
one exception is the on-disk send queue (`sf_dir`, see
[Durability and backpressure](#durability-and-backpressure)): at connect the
pool reopens any queue directories a previous run left holding unacknowledged
rows, then reconnects and resends them in the background.

<Tabs defaultValue="cpp" groupId="c-cpp">
<TabItem value="cpp" label="C++">

```cpp
questdb::pool pool{"ws::addr=localhost:9000;"};   // alias of questdb::ingress::pool
```

</TabItem>
<TabItem value="c" label="C">

```c
line_sender_error* err = NULL;
const char* conf = "ws::addr=localhost:9000;";
questdb_db* db = questdb_db_connect(conf, strlen(conf), &err);
if (!db) { /* read err, handle */ }
```

</TabItem>
</Tabs>

## Authentication and TLS

Authentication happens during the WebSocket upgrade, before any binary frames
are exchanged. All keys go in the connect string:

```text
wss::addr=db.example.com:9000;username=admin;password=quest;   # HTTP basic
wss::addr=db.example.com:9000;token=your_bearer_token;         # bearer token (Enterprise, recommended)
```

- **TLS**: use the `wss` scheme. `tls_ca` picks the root store; the default,
  `webpki_roots`, ships with the client and behaves the same in every
  environment (good for containers). Use `os_roots` when trust is managed at
  the OS level (corporate CAs pushed to the host), `webpki_and_os_roots` for
  both, or `tls_roots=/path/ca.pem` for a private CA. `tls_verify=unsafe_off`
  disables verification (testing only). A standard CMake build accepts this
  key; a library built with `-DQUESTDB_ENABLE_INSECURE_SKIP_VERIFY=OFF`
  rejects it.
- **`auth_timeout_ms`** (default 15000) bounds the WebSocket upgrade.

Because the pool connects lazily, a bad credential surfaces as
`line_sender_error_auth_error` from the **first borrow** on each connection.
Handle it there, not at `connect` (see
[Which errors mean what](#which-errors-mean-what)).

### Unsupported auth paths

The client supports only HTTP basic auth and static bearer-token auth. The
following are **not** supported:

| Path | Status | Workaround |
|---|---|---|
| OIDC token acquisition or in-band refresh | Not supported. The client does not negotiate with an identity provider and has no callback to refresh a token mid-session. | QuestDB itself supports OIDC; see [OpenID Connect](/docs/security/oidc/). Acquire an access token out-of-band from your IdP, pass it via `token=...`, and rebuild the pool when the token nears expiry. |
| Mutual TLS (client certificates) | Not supported. The QuestDB server does not negotiate client certificates regardless of client. | Use bearer-token auth over `wss`. See the connect-string reference's [TLS section](/docs/connect/clients/connect-string/#tls). |
| Token rotation mid-session | Not supported. Credentials are presented once during the WebSocket upgrade and are not re-sent. | On token expiry, close the pool and build a fresh one with the new token. |

## Headers

One header covers all writing, including the row-buffer API; querying adds the
reader header.

<Tabs defaultValue="cpp" groupId="c-cpp">
<TabItem value="cpp" label="C++">

```cpp
#include <questdb/ingress/qwp_sender.hpp> // pool::borrow_sender
#include <questdb/egress/qwp_reader.hpp>         // pool::borrow_reader
```

</TabItem>
<TabItem value="c" label="C">

```c
#include <questdb/ingress/qwp_sender.h>   // questdb_db_borrow_sender + line_sender_buffer
#include <questdb/egress/qwp_reader.h>            // questdb_db_borrow_reader
```

</TabItem>
</Tabs>

## Sending data: row buffers {#sending-data-row-major}

Borrow a sender and flush a `line_sender_buffer` built field-by-field. Create
the buffer from the pool — `questdb_db_new_buffer` in C,
`borrowed_sender::new_buffer()` in C++ — so that it picks up the pool's
protocol settings. The buffer is caller-owned and is not tied to the sender
borrow.

The pool is the shared handle; a borrowed sender is single-thread, so borrow one
per worker.

<Tabs defaultValue="cpp" groupId="c-cpp">
<TabItem value="cpp" label="C++">

```cpp
#include <questdb/ingress/qwp_sender.hpp>
#include <iostream>

using namespace questdb::ingress::literals;

int main()
{
    try
    {
        questdb::pool pool{"ws::addr=localhost:9000;"};
        auto sender = pool.borrow_sender();   // borrowed_sender (RAII)

        auto buffer = sender.new_buffer();        // buffer from the pool
        buffer.table("trades"_tn)
              .symbol("symbol"_cn, "ETH-USDT"_utf8)
              .column("price"_cn, 2615.54)
              .at(questdb::ingress::timestamp_nanos::now());

        sender.flush(buffer);   // borrowed_sender::flush(line_sender_buffer&)
        return 0;
    }
    catch (const questdb::error& e)
    {
        std::cerr << "error: " << e.what() << "\n";
        return 1;
    }
}
```

</TabItem>
<TabItem value="c" label="C">

```c
#include <questdb/ingress/qwp_sender.h>   // questdb_db_borrow_sender + line_sender_buffer
#include <stdio.h>
#include <string.h>

int main(void)
{
    line_sender_error* err = NULL;
    questdb_db* db = NULL;
    qwp_sender* sender = NULL;
    line_sender_buffer* buffer = NULL;

    const char* conf = "ws::addr=localhost:9000;";
    db = questdb_db_connect(conf, strlen(conf), &err);
    if (!db) goto on_error;

    sender = questdb_db_borrow_sender(db, &err);
    if (!sender) goto on_error;

    buffer = questdb_db_new_buffer(db, &err);   // buffer from the pool
    if (!buffer) goto on_error;
    if (!line_sender_buffer_table(buffer, QDB_TABLE_NAME_LITERAL("trades"), &err)) goto on_error;
    if (!line_sender_buffer_symbol(buffer, QDB_COLUMN_NAME_LITERAL("symbol"),
                                   QDB_UTF8_LITERAL("ETH-USDT"), &err)) goto on_error;
    if (!line_sender_buffer_column_f64(buffer, QDB_COLUMN_NAME_LITERAL("price"), 2615.54, &err)) goto on_error;
    if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err)) goto on_error;

    // queues the rows locally and clears the buffer; does not wait for the server
    if (!qwp_sender_flush_buffer(sender, buffer, &err)) goto on_error;

    line_sender_buffer_free(buffer);
    questdb_db_return_sender(db, sender);
    questdb_db_close(db);
    return 0;

on_error:;
    size_t len = 0;
    const char* msg = line_sender_error_msg(err, &len);
    fprintf(stderr, "error: %.*s\n", (int)len, msg);
    line_sender_error_free(err);
    line_sender_buffer_free(buffer);
    if (sender) questdb_db_drop_sender(db, sender);
    questdb_db_close(db);
    return 1;
}
```

</TabItem>
</Tabs>

:::caution No auto-flush

There are no `auto_flush_rows` / `auto_flush_bytes` keys for the QWP/WebSocket
buffer path; flushing is always explicit. Accumulate rows in the buffer on
your own cadence (row count, byte size via `line_sender_buffer_size`, or a
timer) and call `flush` yourself. A good starting cadence is about 1,000 rows or
100 ms, whichever comes first: the auto-flush defaults of the other QWP
clients. Flushing every row collapses throughput, and a single flush must
stay under the `sf_max_segment_bytes` payload cap (default 4 MiB). Null columns are
written by **omission**: skip the column for that row. There is no `set_null`
call.

:::

:::note Buffer ACK tracking

`qwp_sender_flush_buffer` (C++ `sender.flush(buffer)`) queues the rows locally
and returns without waiting for the server. `qwp_sender_flush_buffer_and_wait`
(C++ `sender.flush_and_wait(buffer)`) flushes and then blocks until the server
has acknowledged everything published so far. Its wait is bounded by the
pool-wide `request_timeout` (default 30000 ms), which fires only if
acknowledgements stop arriving — it is not a cap on total wait time.

To pick your own deadline, call `flush` and then `qwp_sender_wait` /
`sender.wait()` yourself. A C `timeout_millis` of `0` (and the C++ default
argument) waits indefinitely; a non-zero value likewise fires only when
acknowledgements stop arriving (see
[Durability and backpressure](#durability-and-backpressure)). To track progress
without blocking, use a flush that returns a frame sequence number (FSN) and
check how far the acknowledged FSN has advanced; see
[FSN progress](#fsn-progress-non-blocking).

:::

### Decimal columns

`DECIMAL` columns (QuestDB server 9.2.0 or later) accept either a **string**
value or a **binary** unscaled-integer value. Create the column ahead of time
with the precision and scale you need
(`CREATE TABLE trades (..., price DECIMAL(18, 2))`) so QuestDB stores it at the
intended width and scale.

Within one flush, the first non-null decimal value for a column fixes the scale
that every later value in that flush is encoded at. Later values may use the
same or a smaller scale; a larger one fails at flush, because encoding it would
lose precision. Encode every value at the table column's scale — `"1.20"`
rather than `"1.2"` for `DECIMAL(..., 2)` — and row order stops mattering.

<Tabs defaultValue="cpp" groupId="c-cpp">
<TabItem value="cpp" label="C++">

```cpp
// `buffer` and `.table(...)` as in the buffer example above.
using namespace questdb::ingress::decimal;   // "..."_decimal, decimal_view

// String form: use '.' between the whole and fractional parts. "+Infinity",
// "-Infinity" and "NaN" are accepted but decay to null once stored.
buffer.table("trades"_tn)
      .column("price"_cn, "2615.54"_decimal)
      .at(questdb::ingress::timestamp_nanos::now());

// Binary form: an unscaled value as two's-complement big-endian bytes plus a
// scale. 12345 with scale 2 is 123.45. Scale <= 76, mantissa <= 32 bytes.
const uint8_t unscaled[] = {0x30, 0x39};   // 12345
buffer.table("trades"_tn)
      .column("price"_cn, decimal_view(2, unscaled))
      .at(questdb::ingress::timestamp_nanos::now());
```

`column` uses `DECIMAL256` on the wire. To use a narrower wire width, call
`column_dec64` or `column_dec128`; they accept the same string or `decimal_view`
value and raise `line_sender_error` if the unscaled value does not fit the
selected width after conversion to the pending buffer's wire scale. You can
also ingest a custom decimal type directly by implementing a
`to_decimal_view_state_impl` customization point for it. See
`examples/line_sender_cpp_example_decimal_custom.cpp` in the client repository.

</TabItem>
<TabItem value="c" label="C">

```c
// `buffer` and `err` as in the buffer example above.
// String form (value + byte length). Format rules as described above.
if (!line_sender_buffer_table(
        buffer, QDB_TABLE_NAME_LITERAL("trades"), &err))
    goto on_error;
if (!line_sender_buffer_column_dec_str(
        buffer, QDB_COLUMN_NAME_LITERAL("price"), "2615.54", 7, &err))
    goto on_error;
if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err))
    goto on_error;

// Binary form: scale + unscaled value (two's-complement, big-endian).
const uint8_t unscaled[] = {0x30, 0x39};   // 12345, scale 2 -> 123.45
if (!line_sender_buffer_table(
        buffer, QDB_TABLE_NAME_LITERAL("trades"), &err))
    goto on_error;
if (!line_sender_buffer_column_dec(
        buffer, QDB_COLUMN_NAME_LITERAL("price"),
        2, unscaled, sizeof(unscaled), &err))
    goto on_error;
if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err))
    goto on_error;
```

`line_sender_buffer_column_dec64{,_str}` and `_dec128{,_str}` pin the wire width
to `DECIMAL64` / `DECIMAL128`.

</TabItem>
</Tabs>

The decimal setters above are available on row buffers. For chunk ingestion,
use the [Arrow appenders](#arrow-ingestion).

See the [Decimal datatype reference](/docs/query/datatypes/decimal/) for
precision and storage widths, and the
[QWP decimal encoding](/docs/connect/wire-protocols/qwp-ingress-websocket/#decimal-types-decimal64-decimal128-decimal256)
for the binary wire layout.

## Sending data: chunks {#sending-data-column-major}

Borrow a sender, build a `chunk` of columns (each a contiguous array plus a row
count), set the designated timestamp, then flush. `flush` publishes the chunk
into the store-and-forward queue and returns; `wait` blocks until the server has
acknowledged everything published so far. `flush_and_wait` combines the two for
the simple synchronous path, shown below.

The `questdb_db` / `questdb::pool` is the only handle you share across threads;
a borrowed sender belongs to the thread that took it, so borrow one per worker.

<Tabs defaultValue="cpp" groupId="c-cpp">
<TabItem value="cpp" label="C++">

```cpp
#include <questdb/ingress/qwp_sender.hpp>
#include <iostream>

int main()
{
    try
    {
        questdb::pool pool{"ws::addr=localhost:9000;"};
        auto sender = pool.borrow_sender();   // RAII: returns to pool on scope exit

        double price[]  = {2615.54, 2616.00, 2617.25};
        double amount[] = {0.00044, 0.00050, 0.00021};
        int64_t ts_ns[] = {1700000000000000000, 1700000000001000000, 1700000000002000000};
        size_t n = 3;

        questdb::ingress::column_chunk chunk{"trades"};
        chunk.column_f64("price", price, n)
             .column_f64("amount", amount, n)
             .at_nanos(ts_ns, n);

        sender.flush_and_wait(chunk);   // publish, then block until acked
        return 0;
    }
    catch (const questdb::error& e)
    {
        std::cerr << "error: " << e.what() << "\n";
        return 1;
    }
}
```

</TabItem>
<TabItem value="c" label="C">

```c
#include <questdb/ingress/qwp_sender.h>
#include <stdio.h>
#include <string.h>

int main(void)
{
    line_sender_error* err = NULL;
    questdb_db* db = NULL;
    qwp_sender* sender = NULL;
    qwp_chunk* chunk = NULL;

    const char* conf = "ws::addr=localhost:9000;";
    db = questdb_db_connect(conf, strlen(conf), &err);
    if (!db) goto on_error;

    sender = questdb_db_borrow_sender(db, &err);
    if (!sender) goto on_error;

    double price[]  = {2615.54, 2616.00, 2617.25};
    double amount[] = {0.00044, 0.00050, 0.00021};
    int64_t ts_ns[] = {1700000000000000000, 1700000000001000000, 1700000000002000000};
    size_t n = 3;

    chunk = qwp_chunk_new("trades", 6, &err);
    if (!chunk) goto on_error;
    // (chunk, name, name_len, data, row_count, validity_or_NULL, err_out)
    if (!qwp_chunk_column_f64(chunk, "price", 5, price, n, NULL, &err)) goto on_error;
    if (!qwp_chunk_column_f64(chunk, "amount", 6, amount, n, NULL, &err)) goto on_error;
    if (!qwp_chunk_at_nanos(chunk, ts_ns, n, &err)) goto on_error;

    // publish, then block until acked
    if (!qwp_sender_flush_chunk_and_wait(sender, chunk, qwpws_ack_level_ok, &err)) goto on_error;

    qwp_chunk_free(chunk);
    questdb_db_return_sender(db, sender);   // return the borrow to the pool
    questdb_db_close(db);
    return 0;

on_error:;
    size_t len = 0;
    const char* msg = line_sender_error_msg(err, &len);
    fprintf(stderr, "error: %.*s\n", (int)len, msg);
    line_sender_error_free(err);
    qwp_chunk_free(chunk);
    if (sender) questdb_db_drop_sender(db, sender);  // drop a possibly-in-doubt sender
    questdb_db_close(db);
    return 1;
}
```

</TabItem>
</Tabs>

### Notes

- **Reuse the chunk** across flushes: a flush clears it once the frame is
  accepted into the local queue, while keeping its capacity. To reset a chunk
  you built but decided not to send, call `qwp_chunk_clear` (C++
  `chunk.clear()`).
- All columns (and the timestamp) must share the same `row_count`. The chunk
  **borrows** your arrays; they must outlive the flush.
- **A chunk too large for one frame is split** across several, publishing each
  on its own. The client targets about 2 MiB per frame — half of `sf_max_segment_bytes`
  (default 4 MiB) — so a chunk encoding to more than roughly 2 MiB splits. It
  halves the row range until each frame fits, stopping at 8 rows: validity
  bitmaps and boolean columns pack one bit per row, so a frame must start on a
  byte boundary. An 8-row frame is checked against the full 4 MiB rather than
  the 2 MiB target; if 8 rows still exceed 4 MiB — which takes very large
  string, binary, or array values — the flush fails instead of splitting.
- **Recovery depends on `in_doubt`, not on the error code.** Check
  `line_sender_error_in_doubt` (C++: `e.in_doubt()`). False means the queue
  never took the frame and the chunk is intact: re-flush it. True means
  delivery is uncertain, so `wait` for what the queue already holds, and resend
  the chunk only where the table's dedup keys make duplicate rows harmless. A
  chunk that split across frames needs extra care;
  [Durability and backpressure](#durability-and-backpressure) has the full
  rules. (To poll progress without blocking, see
  [FSN progress](#fsn-progress-non-blocking).)
- **A successful `flush` is local acceptance, not delivery.**
  `qwp_sender_flush_chunk` returning true means the local store-and-forward
  queue took the frame; a background thread then delivers it and collects the
  server's ack, which `qwp_sender_wait` (C++ `sender.wait()`) observes. For
  throughput, publish many chunks with `flush`, then `wait` once
  (`qwpws_ack_level_durable` waits for durable upload, Enterprise). See
  [Durability and backpressure](#durability-and-backpressure).
- **Return the borrow.** C: `questdb_db_return_sender` (recycle) or
  `questdb_db_drop_sender` (retire a possibly in-doubt sender); C++ does
  it in the `borrowed_sender` destructor, and `drop_on_return()` forces
  a drop. Once a sender hits a terminal error, every later call on it fails the
  same way. The return path retires those senders, and any whose pool has been
  closed, so plain return/destruction is correct for healthy senders. Drop
  after an error when the next borrower must not inherit that connection.

### Null values

Chunk nulls use an Arrow-shape validity bitmap: bit = 1 means **valid**,
LSB-first, one bit per row. Null rows' data slots are ignored (any value works).
Pass `NULL` (C) / omit the argument (C++) for a column with no nulls.

<Tabs defaultValue="cpp" groupId="c-cpp">
<TabItem value="cpp" label="C++">

```cpp
double amount[] = {0.00044, 0.0, 0.00021};       // row 1 is null; slot ignored
uint8_t amount_valid[] = {0x05};                 // 0b101: rows 0 and 2 valid
questdb::ingress::validity_view validity{amount_valid, 3};
chunk.column_f64("amount", amount, 3, &validity);
```

</TabItem>
<TabItem value="c" label="C">

```c
double amount[] = {0.00044, 0.0, 0.00021};       // row 1 is null; slot ignored
uint8_t amount_valid[] = {0x05};                 // 0b101: rows 0 and 2 valid
qwp_validity validity = {amount_valid, 3};
if (!qwp_chunk_column_f64(chunk, "amount", 6, amount, 3, &validity, &err))
    goto on_error;
```

</TabItem>
</Tabs>

The **designated timestamp is always non-null** per the QWP wire spec: the
timestamp setters take no validity parameter.

### Column setters

The fixed-width scalar and temporal setters take
`(chunk, name, name_len, data, row_count, validity, err_out)` in C, and the
same arguments minus `chunk`, `name_len`, and `err_out`, chained on
`column_chunk`, in C++ (`name` is a `std::string_view`; errors throw). Three
families vary from that shape:

- **`column_ts`** takes one extra argument, a `qwp_ts_unit` (a
  `uint32_t` on the ABI), sitting between `row_count` and `validity`.
- **`column_str` / `column_binary`** take `(offsets, bytes, bytes_len)` in
  Arrow Utf8 / Binary layout in place of `data`.
- **`symbol_i8` / `_i16` / `_i32`** take `(codes, row_count, dict_offsets,
  dict_offsets_len, dict_bytes, dict_bytes_len)` in place of `data`.

See `qwp_sender.h` for the exact signatures. Complete list:

| Setter | Input per row | QuestDB type |
| --- | --- | --- |
| `column_i8` / `column_i16` / `column_i32` / `column_i64` | signed int | `BYTE` / `SHORT` / `INT` / `LONG` |
| `column_f32` / `column_f64` | float / double | `FLOAT` / `DOUBLE` |
| `column_bool` | LSB-first packed bitmap | `BOOLEAN` |
| `column_ts` + `qwp_ts_unit` (`_micros` / `_nanos`) | int64 since epoch | `TIMESTAMP` / `TIMESTAMP_NS` |
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
remaining Arrow types are reachable through the
[Arrow appenders](#arrow-ingestion).

:::note The NumPy appender is C-only, for programs embedding Python

`qwp_sender.h` also declares `qwp_chunk_append_numpy_column`,
which appends a raw buffer tagged with a `qwp_numpy_dtype`. It is
there for hosts that already hold NumPy arrays. There is no C++ wrapper for it,
by design: without a NumPy host it is awkward to call, and the
[Arrow appenders](#arrow-ingestion) reach the same types through a safer
interface. If you do have NumPy buffers in a C++ program, call the C function
directly — and note it requires a C-contiguous buffer, since it walks `data`
forward at the dtype's native stride and cannot see NumPy's strides. Pass a
sliced, transposed, or reversed view and it reads out of bounds. Run
`numpy.ascontiguousarray` first.

:::

:::note The designated timestamp column is named `timestamp` server-side

Whatever your source column is called, QuestDB materializes the designated
timestamp as a column literally named `timestamp`. Query it back with
`SELECT timestamp ...` / `ORDER BY timestamp`, not the source name.

:::

## Arrow ingestion

If your data is already in Arrow (Arrow C++, PyArrow, polars, pandas, DuckDB,
nanoarrow), skip the per-column setters and flush a whole `RecordBatch` through
the [Arrow C Data Interface](https://arrow.apache.org/docs/format/CDataInterface.html)
(`ArrowArray` + `ArrowSchema`). One call encodes the batch, picks the
designated timestamp from a named column, and publishes it as one logical
batch. Requires a build with `QUESTDB_CLIENT_ENABLE_ARROW` (CMake option
`QUESTDB_ENABLE_ARROW`). For the read direction, see
[Arrow result batches](#arrow-result-batches).

<Tabs defaultValue="cpp" groupId="c-cpp">
<TabItem value="cpp" label="C++">

```cpp
using namespace questdb::ingress::literals;

// Requires a build with QUESTDB_CLIENT_ENABLE_ARROW.
// `array` + `schema` from any Arrow C Data Interface producer, e.g.
// arrow::ExportRecordBatch(*batch, &array, &schema) in Arrow C++.
void ingest(questdb::pool& pool, ArrowArray& array, const ArrowSchema& schema)
{
    auto sender = pool.borrow_sender();       // one per thread
    // Publish, then block until acked; plain flush_arrow_batch() + wait()
    // is the pipelined form.
    sender.flush_arrow_batch_and_wait("trades"_tn, array, schema, "ts"_cn);
}
```

</TabItem>
<TabItem value="c" label="C">

```c
// `array` + `schema` from any Arrow C Data Interface producer.
bool ingest(questdb_db* db, struct ArrowArray* array,
            const struct ArrowSchema* schema, line_sender_error** err)
{
    qwp_sender* sender = questdb_db_borrow_sender(db, err);
    if (!sender)
        return false;
    /* Publish, then block until acked; qwp_sender_flush_arrow_batch_at_column
       followed by qwp_sender_wait is the pipelined form. */
    bool ok = qwp_sender_flush_arrow_batch_at_column_and_wait(
        sender, QDB_TABLE_NAME_LITERAL("trades"), array, schema,
        QDB_COLUMN_NAME_LITERAL("ts"), NULL, 0, qwpws_ack_level_ok, err);
    questdb_db_return_sender(db, sender);
    return ok;
}
```

</TabItem>
</Tabs>

- The designated timestamp comes from the named `Timestamp(_)` column
  (`"ts"` above). `flush_arrow_batch_at_now` (explicit opt-in) lets the server
  stamp arrival time instead; don't use it when the batch carries real event
  time.
- **Ownership**: on success `array->release` is consumed (set to `NULL`); the
  caller keeps `schema`. On failure check `array->release != NULL` before
  invoking it.
- Per-column wire-type hints (`qwp_arrow_override`: force
  SYMBOL/VARCHAR, IPv4, char, geohash precision) steer encoding without
  touching the Arrow schema.
- To append Arrow **columns** into a chunk alongside hand-built ones, use
  `qwp_chunk_append_arrow_column`, or
  `qwp_arrow_import_new` + `..._append_arrow_import` to import once
  and slice across many chunks.
- Dictionary-encoded string columns map to `SYMBOL` by default; plain Utf8 to
  `VARCHAR`. `qwp_sender.h` lists every Arrow type the client accepts, and
  the kinds it rejects (`Struct`, `Map`, `Interval`, ...); a rejected type
  fails with `line_sender_error_arrow_unsupported_column_kind`.

## Querying data

Get a reader (QWP/WebSocket only), prepare/execute SQL, then stream batches and
read typed columns. In C, `qwp_reader_query_execute` **consumes** the query handle
(sets your pointer to `NULL`). A borrowed reader, like the senders, is
single-thread; the pool it came from is the shared, thread-safe handle.

Borrow the reader from the pool: C++ `auto r = pool.borrow_reader();` returns
a `questdb::egress::reader` that returns itself to the pool on scope exit; in C,
close the borrowed handle with `qwp_reader_close(r)` to return it. Call
`qwp_reader_drop_on_return(r)` / C++ `r.drop_on_return()` first to retire it
instead. The reader pool is capped independently of the sender pool.

:::warning Mid-stream query failover can duplicate rows

If the connection fails over while a result set is streaming, the query
restarts on the new endpoint and rows you already consumed are delivered
again. The client never discards replayed rows silently; you choose the
recovery:

- **Default (no callback installed)**: the next `next_batch()` fails with
  `questdb_error_failover_would_duplicate` (C++ throws `questdb::error` with
  the same `code()`) instead of double-delivering. Free the cursor and
  re-execute the query from scratch.
- **Transparent replay**: install `qwp_reader_query_on_failover_reset` (C) /
  `query::on_failover_reset` (C++) on the prepared query, and discard any
  partial state you accumulated when it fires; the replayed stream then
  arrives as if the query had just started. Installing this callback is what
  enables replay — `on_failover_progress` only reports the reconnect
  lifecycle, so a query carrying just that one still fails with
  `questdb_error_failover_would_duplicate`.

  Both callbacks run on the internal thread that drives the cursor, so they
  must not call back into the reader, query, or cursor.

Failover before the first batch is always transparent: no rows were consumed
yet, so there is nothing to duplicate.

:::

<Tabs defaultValue="cpp" groupId="c-cpp">
<TabItem value="cpp" label="C++">

```cpp
#include <questdb/egress/qwp_reader.hpp>   // questdb::pool + reader
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
    catch (const questdb::error& e)
    {
        std::cerr << "error: " << e.what() << "\n";
        return 1;
    }
}
```

</TabItem>
<TabItem value="c" label="C">

This example uses the `questdb_error` spelling throughout, including for the
pool call — see [One error type, two names](#one-error-type-two-names).

```c
#include <questdb/egress/qwp_reader.h>            // questdb_db pool + reader
#include <stdio.h>
#include <string.h>

int main(void)
{
    questdb_error* err = NULL;
    questdb_db* db = NULL;
    qwp_reader* rd = NULL;
    qwp_reader_query* query = NULL;
    qwp_reader_cursor* cursor = NULL;

    const char* conf = "ws::addr=localhost:9000;";
    db = questdb_db_connect(conf, strlen(conf), &err);
    if (!db)
    {
        size_t len = 0;
        const char* msg = questdb_error_msg(err, &len);
        fprintf(stderr, "connect error: %.*s\n", (int)len, msg);
        questdb_error_free(err);
        return 1;
    }

    rd = questdb_db_borrow_reader(db, &err);   // pooled borrow
    if (!rd) goto on_error;

    query = qwp_reader_prepare(rd,
        QDB_UTF8_LITERAL("SELECT x AS n, x * 1.5 AS d FROM long_sequence(5)"), &err);
    if (!query) goto on_error;
    cursor = qwp_reader_query_execute(&query, &err);   // consumes `query`
    if (!cursor) goto on_error;

    const qwp_reader_batch* batch;
    while ((batch = qwp_reader_cursor_next_batch(cursor, &err)) != NULL)
    {
        size_t rows = qwp_reader_batch_row_count(batch);
        size_t cols = qwp_reader_batch_column_count(batch);
        for (size_t c = 0; c < cols; ++c)
        {
            qwp_reader_column_data col;
            if (!qwp_reader_batch_column_data(batch, c, &col, &err)) goto on_error;
            for (size_t r = 0; r < rows; ++r)
            {
                bool is_null = false;
                if (col.kind == qwp_reader_column_kind_double)
                {
                    double v = qwp_reader_column_data_get_f64(&col, r, &is_null);
                    printf(is_null ? "NULL " : "%g ", v);
                }
                else if (col.kind == qwp_reader_column_kind_long)
                {
                    int64_t v = qwp_reader_column_data_get_i64(&col, r, &is_null);
                    printf(is_null ? "NULL " : "%lld ", (long long)v);
                }
            }
        }
        printf("\n");
    }
    if (err) goto on_error;   // next_batch returns NULL at end-of-stream AND on error

    qwp_reader_cursor_free(cursor);
    qwp_reader_close(rd);   // return the borrow to the pool
    questdb_db_close(db);
    return 0;

on_error:;
    size_t len = 0;
    const char* msg = questdb_error_msg(err, &len);
    fprintf(stderr, "error: %.*s\n", (int)len, msg);
    questdb_error_free(err);
    qwp_reader_query_free(query);
    qwp_reader_cursor_free(cursor);
    qwp_reader_close(rd);   // pool drops it if the transport tore down
    questdb_db_close(db);
    return 1;
}
```

Read values with the `static inline qwp_reader_column_data_get_*` accessors; each
takes `(&col, row, &is_null)`. Dispatch on `col.kind` (`qwp_reader_column_kind`) to
pick the right accessor.

</TabItem>
</Tabs>

### Decimal result widths

For a `DECIMAL(p, s)` result, precision `p` selects the QWP kind:

| Result precision | C kind | C++ kind |
| --- | --- | --- |
| 1 through 18 | `qwp_reader_column_kind_decimal64` | `column_kind::decimal64` |
| 19 through 38 | `qwp_reader_column_kind_decimal128` | `column_kind::decimal128` |
| 39 through 76 | `qwp_reader_column_kind_decimal256` | `column_kind::decimal256` |

QWP sends scale `s` separately and reports the width bucket, not the exact
precision `p`.

For width-independent access, use `column::visit` and
`decimal_view::mantissa_bytes(row)` in C++, or
`qwp_reader_column_data_get_bytes` with `value_stride` in C. Both expose the
mantissa as little-endian two's-complement bytes. Check for null before
decoding it.

### Parameterised queries

Prepare then bind: C `qwp_reader_prepare` + `qwp_reader_query_bind_*` +
`qwp_reader_query_execute`; C++ `reader.prepare(sql)` chained with `bind_*`, then
`execute()`. Plain `execute(sql)` is the no-bind shortcut. The reader must
outlive any cursor it produces. The complete bind surface (C
`qwp_reader_query_bind_<name>`, C++ `bind_<name>` on the prepared query):

| Bind | Input | QuestDB type |
| --- | --- | --- |
| `bind_bool` | `bool` | `BOOLEAN` |
| `bind_i8` / `bind_i16` / `bind_i32` / `bind_i64` | signed int | `BYTE` / `SHORT` / `INT` / `LONG` |
| `bind_f32` / `bind_f64` | float / double | `FLOAT` / `DOUBLE` |
| `bind_timestamp_micros` / `bind_timestamp_nanos` | int64 since epoch | `TIMESTAMP` / `TIMESTAMP_NS` |
| `bind_date_millis` | int64 millis since epoch | `DATE` |
| `bind_char` | UTF-16 code unit | `CHAR` |
| `bind_decimal64` / `bind_decimal128` / `bind_decimal256` | unscaled value + scale | `DECIMAL` |
| `bind_geohash` | bits + precision | `GEOHASH` |
| `bind_varchar` | UTF-8 string | `VARCHAR` |
| `bind_uuid` | 16 bytes | `UUID` |
| `bind_long256` | 32 bytes | `LONG256` |
| `bind_binary` | bytes + length | `BINARY` (not yet accepted server-side) |
| `bind_ipv4` | uint32, host order | `IPV4` (not yet accepted server-side) |

To bind SQL NULL, use the typed NULL binds: `bind_null(kind)`, plus the
parameterised forms `bind_null_varchar`, `bind_null_binary`,
`bind_null_decimal64` / `_128` / `_256` (scale) and `bind_null_geohash`
(precision). Ingestion writes nulls by omission and has no `set_null`;
querying **does** have NULL binds. There are **no array binds**: `double[]` /
`long[]` appear only as result columns. `bind_binary` and `bind_ipv4` (and
their NULL forms) compile but fail at execute with
`questdb_error_invalid_bind` on current servers.

## Arrow result batches

Instead of reading cell-by-cell, export each result batch as an
[Arrow C Data Interface](https://arrow.apache.org/docs/format/CDataInterface.html)
`ArrowArray` + `ArrowSchema` pair. This is the efficient path for large result
sets, and a zero-copy handoff to polars, pandas, or DuckDB. It uses the same
interface as [Arrow ingestion](#arrow-ingestion) and the same build flag
(`QUESTDB_ENABLE_ARROW`).

<Tabs defaultValue="cpp" groupId="c-cpp">
<TabItem value="cpp" label="C++">

```cpp
// Requires a build with QUESTDB_CLIENT_ENABLE_ARROW.
auto cur = reader.execute("SELECT symbol, price FROM trades"_utf8);
while (auto batch = cur.next_arrow_batch())   // std::nullopt at end of stream
{
    // batch->array / batch->schema are an owned Arrow pair, independent of the
    // cursor. Hand them to a consumer; ImportRecordBatch zeroes the slots.
    auto rb = arrow::ImportRecordBatch(&batch->array, &batch->schema).ValueOrDie();
    // ... use rb ...
}
```

</TabItem>
<TabItem value="c" label="C">

```c
/* Requires a build with QUESTDB_CLIENT_ENABLE_ARROW. */
struct ArrowArray array;
struct ArrowSchema schema;
for (;;)
{
    // out slots must be uninitialised (zeroed or already-released) on each call
    qwp_reader_arrow_batch_result rc =
        qwp_reader_cursor_next_arrow_batch(cursor, &array, &schema, &err);
    if (rc == qwp_reader_arrow_batch_end) break;
    if (rc == qwp_reader_arrow_batch_error) goto on_error;
    /* array + schema are now an owned Arrow pair: pass to a consumer, then
       release whatever it did not take. */
    if (array.release) array.release(&array);
    if (schema.release) schema.release(&schema);
}
```

</TabItem>
</Tabs>

- **Ownership.** On `_ok` the caller owns the batch's `release` callbacks. The
  C++ `arrow_batch` frees them in its destructor unless you hand it off;
  passing it to an Arrow consumer such as `arrow::ImportRecordBatch` consumes
  and zeroes the slots. Each C call needs fresh out slots (zeroed, or whose
  previous `release` already ran), otherwise it leaks the prior batch.
- **Compact symbols (C).** `qwp_reader_cursor_next_arrow_batch_compact` emits each
  `SYMBOL` column with only the dictionary values that batch references, under
  batch-local codes: smaller batches when symbols are sparse.
- **Schema drift.** If the table's schema changes mid-stream the call returns
  `questdb_error_schema_drift`. Call again: the cursor picks up the new schema
  and re-delivers the batch that triggered the error under it, so no rows are
  dropped.

## Durability and backpressure {#durability-and-backpressure}

QWP/WebSocket ingestion is asynchronous: every flush **publishes** into a local
queue and returns before the server acks.

1. **`flush` = local acceptance.** Success means only that the frame is queued
   locally. A **background thread** does all the talking to QuestDB: it
   delivers queued frames, receives acks, and reconnects and replays after a
   connection failure. It keeps running after you return the sender to the
   pool, so queued frames still reach the server.
2. **`wait` = observation.** `qwp_sender_wait` (C++ `wait()`) blocks until
   everything published so far is acknowledged.
   - **Ack levels.** `qwpws_ack_level_ok` means the server accepted the
     frames. `qwpws_ack_level_durable` additionally waits until they are
     uploaded to object storage, not just in the server's WAL (Enterprise
     with replication; see the protocol page's
     [durable acknowledgement](/docs/connect/wire-protocols/qwp-ingress-websocket/#durable-acknowledgement)
     section). Durable acks must be requested at pool open with
     `request_durable_ack=on`; the connect fails with
     `protocol_version_error` when the server cannot provide them, and
     without the key any durable-level `wait` or `flush_and_wait` fails up
     front with `invalid_api_call`, leaving the buffer or chunk untouched.
   - **Ack is not visibility.** Rows become visible to queries after WAL
     apply, typically within milliseconds of the ack, so a query issued
     right after the ack can miss the newest rows. An empty read-back is
     not data loss.
   - **The timeout is a no-progress deadline.** It fires only if the server
     stops acknowledging frames, not as a cap on total wait time. On timeout
     the frames stay queued: call `wait` again, or poll progress without
     blocking with [frame sequence numbers](#fsn-progress-non-blocking). Don't
     re-flush. `wait` takes its deadline per call (`0` = none);
     `flush_and_wait` uses the pool-wide `request_timeout` (default 30000 ms).
3. **`in_doubt` decides whether to retry.** When a flush or wait fails, check
   `line_sender_error_in_doubt` (C++: `e.in_doubt()`) rather than the error
   code or the state of your buffer or chunk. A delivery-unknown failure
   typically reports `failover_retry`, and that code alone does not mean the
   input is safe to resend; likewise an emptied buffer does not mean the rows
   arrived, and a full one does not mean they didn't. `in_doubt == false` means
   the flush failed before the queue took the frame: the rows never entered the
   send path, so nothing can reach the server and the buffer or chunk is
   intact — re-flush it. True means the queue may already hold them: wait rather
   than re-flush, and replay the same rows only if the table's dedup keys make
   duplicates harmless.
   - **A buffer is one frame, queued whole or not at all.** So an in-doubt
     buffer failure can only be a failed ack wait, with every row already
     queued. Wait again and the queue delivers them.
   - **A chunk may be split** into several frames (see
     [Sending data: chunks](#sending-data-column-major)). A failure partway
     through queues the earlier frames and never accepts the rest, so waiting
     delivers only part of the batch. Getting the remainder means resending the
     chunk, which is safe only where dedup keys absorb the duplicated rows.
4. **`sf_dir` = crash survival.** Without it the queue is in memory: a process
   crash loses unacked frames, and pool close drains best-effort within
   `close_flush_timeout_millis` (default 5000). With `sf_dir`, each sender's
   queue is a directory on disk, and frames **replay automatically** when a
   pool restarts with the same `sender_id`: it finds the directories the
   previous run left behind, and resends their unacknowledged frames in the
   background without you borrowing anything. Keep `sender_id` stable across
   restarts so replay finds them; see [Pool keys](#pool-keys) for the
   directory layout. Strongly recommended for multi-host deployments: during
   failover, flushes keep landing on disk instead of filling RAM.
5. **Backpressure is bounded blocking.** Two caps apply at once: 128 in-flight
   unacked frames, and `sf_max_total_bytes` (default 128 MiB memory mode,
   10 GiB disk mode). On hitting either, `flush` blocks up to
   `sf_append_deadline_millis` (default 30000), then returns
   `server_flush_error`. Nothing is dropped or overwritten while blocked. A
   buffer whose single payload exceeds the frame cap derived from
   `sf_max_segment_bytes` (default 4 MiB) is rejected immediately instead; an oversize
   chunk is split across frames rather than rejected.

## Concurrency: one borrow per worker {#concurrency-one-borrow-per-worker}

The pool is the **only** thread-safe handle. Senders and readers belong to the
thread that borrowed them. Chunks and buffers are single-thread too: only one
thread may touch one at a time. The recommended pattern: share the pool, give
each worker its own borrow for its lifetime, and size `sender_pool_max` to the
worker count.

<Tabs defaultValue="cpp" groupId="c-cpp">
<TabItem value="cpp" label="C++">

```cpp
#include <questdb/ingress/qwp_sender.hpp>
#include <thread>
#include <vector>
#include <iostream>

using namespace questdb::ingress::literals;

int main()
{
    // sender_pool_max bounds concurrent sender borrows: size it to the worker
    // count.
    questdb::pool pool{"ws::addr=localhost:9000;sender_pool_max=4;"};

    std::vector<std::thread> workers;
    for (int w = 0; w < 4; ++w)
    {
        workers.emplace_back([&pool, w]() {
            try
            {
                // One borrow per worker; lives for the worker's lifetime.
                auto sender = pool.borrow_sender();
                auto buffer = sender.new_buffer();
                for (int i = 0; i < 100; ++i)
                {
                    buffer.table("trades"_tn)
                          .symbol("symbol"_cn, "ETH-USDT"_utf8)
                          .column("price"_cn, 2615.54 + w)
                          .at(questdb::ingress::timestamp_nanos::now());
                }
                sender.flush(buffer);
                sender.wait();   // block until acked, before the borrow returns
            }
            catch (const questdb::error& e)
            {
                std::cerr << "worker " << w << ": " << e.what() << "\n";
            }
        });
    }
    for (auto& t : workers) t.join();
    return 0;
}
```

</TabItem>
<TabItem value="c" label="C">

```c
#include <questdb/ingress/qwp_sender.h>   // questdb_db_borrow_sender + line_sender_buffer
#include <pthread.h>
#include <stdio.h>
#include <string.h>

static void* worker(void* arg)
{
    questdb_db* db = (questdb_db*)arg;
    line_sender_error* err = NULL;
    qwp_sender* sender = NULL;
    line_sender_buffer* buffer = NULL;

    /* One borrow per worker; lives for the worker's lifetime. */
    sender = questdb_db_borrow_sender(db, &err);
    if (!sender) goto on_error;
    buffer = questdb_db_new_buffer(db, &err);
    if (!buffer) goto on_error;

    for (int i = 0; i < 100; ++i)
    {
        if (!line_sender_buffer_table(buffer, QDB_TABLE_NAME_LITERAL("trades"), &err)) goto on_error;
        if (!line_sender_buffer_symbol(buffer, QDB_COLUMN_NAME_LITERAL("symbol"),
                                       QDB_UTF8_LITERAL("ETH-USDT"), &err)) goto on_error;
        if (!line_sender_buffer_column_f64(buffer, QDB_COLUMN_NAME_LITERAL("price"), 2615.54, &err)) goto on_error;
        if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err)) goto on_error;
    }
    if (!qwp_sender_flush_buffer(sender, buffer, &err)) goto on_error;
    if (!qwp_sender_wait(sender, qwpws_ack_level_ok, 0, &err)) goto on_error;   /* block until acked; 0 = no deadline */

    line_sender_buffer_free(buffer);
    questdb_db_return_sender(db, sender);
    return NULL;

on_error:;
    size_t len = 0;
    const char* msg = line_sender_error_msg(err, &len);
    fprintf(stderr, "worker: %.*s\n", (int)len, msg);
    line_sender_error_free(err);
    line_sender_buffer_free(buffer);
    if (sender) questdb_db_drop_sender(db, sender);
    return NULL;
}

int main(void)
{
    line_sender_error* err = NULL;
    /* sender_pool_max bounds concurrent sender borrows: size it to the worker
       count. */
    const char* conf = "ws::addr=localhost:9000;sender_pool_max=4;";
    questdb_db* db = questdb_db_connect(conf, strlen(conf), &err);
    if (!db)
    {
        size_t len = 0;
        const char* msg = line_sender_error_msg(err, &len);
        fprintf(stderr, "connect: %.*s\n", (int)len, msg);
        line_sender_error_free(err);
        return 1;
    }

    pthread_t workers[4];
    for (int w = 0; w < 4; ++w)
        pthread_create(&workers[w], NULL, worker, db);
    for (int w = 0; w < 4; ++w)
        pthread_join(workers[w], NULL);

    questdb_db_close(db);
    return 0;
}
```

</TabItem>
</Tabs>

Notes:

- Do **not** pass a borrowed sender between threads mid-borrow, even with your
  own locking. Return it and borrow again on the other thread.
- Chunks and buffers are also single-thread, but you may **build** a chunk on
  one thread and flush it through a sender borrowed on another, as long as the
  handoff is ordered (e.g. via a queue) and only one thread touches it at a
  time.
- Each borrowed sender owns its own store-and-forward queue (its own directory
  when `sf_dir` is set), so this pattern applies unchanged in
  store-and-forward mode.

## Failover, retry, and pool lifecycle

The pool owns reconnection and connection health so borrowers don't have to:

- **Multiple endpoints.** Comma-separate hosts in one `addr=` (or repeat the
  key): `ws::addr=db-primary:9000,db-replica-1:9000;`. The endpoints must be
  replicas of one logical deployment
  ([Enterprise replication](/docs/connect/wire-protocols/qwp-ingress-websocket/#failover-and-high-availability));
  listing unrelated instances splits your data across them. The pool rotates
  away from unhealthy endpoints on borrow and follows the writable primary on
  a role reject. `target=` filters by role (e.g. `target=primary`); when
  every reachable endpoint handshakes but none matches the filter, the borrow
  fails with `role_mismatch` rather than a connect error.
- **Retrying borrow.** `questdb_db_borrow_sender_with_retry(db, budget_ms,
  &err)` (C++ `pool::borrow_sender_with_retry(budget_ms)`) retries the connect
  within `budget_ms` using the pool's reconnect backoff. Authentication and
  protocol-version errors are terminal; `budget_ms == 0` makes a single
  attempt.
- **Failover budget.** `questdb_db_reconnect_max_duration_ms(db)` (C++
  `pool::reconnect_max_duration_ms()`, default 300000 ms) is the pool's overall
  reconnect budget. Pass the remaining budget to the `_with_retry` calls when
  tracking a deadline.
- **Return vs. drop.** Returning a healthy borrow recycles its connection;
  dropping retires it and the next borrow opens a fresh one. The return path
  drops any connection that has recorded a terminal error or whose pool has been
  closed, so plain return/RAII destruction is the default. Use
  `questdb_db_drop_sender` / `drop_on_return()` only after an error where the next
  borrower must not inherit the connection.
- **Closing idle connections.** With `pool_reap=auto` a background thread closes
  idle connections above the warm minimum after `idle_timeout_ms`. With
  `pool_reap=manual`, call `questdb_db_reap_idle(db)` (C++ `pool::reap_idle()`)
  yourself; it returns the number of connections it closed.

### Which errors mean what {#which-errors-mean-what}

Dispatch on `line_sender_error_get_code(err)` (C++
`e.code()`). What to do with the borrow after each class:

| Error code | Meaning | Borrow state | What to do |
| --- | --- | --- | --- |
| `auth_error`, `tls_error`, `unsupported_server`, `protocol_version_error` | Deployment/config problem | n/a (borrow failed) | Fix the connect string or server; retrying won't help. The retry helpers treat these as terminal. |
| `failover_retry` | Transient transport failure; frames may be in doubt | Dead — every later call fails | **Drop** the borrow, then re-borrow with `borrow_sender_with_retry(reconnect_max_duration_ms())`. With `sf_dir`, unresolved frames replay automatically. |
| `server_rejection` | Server refused the data (schema/type conflict, bad name) | Dead — every later call fails | Plain **return** is safe; the pool retires the connection. Fix the data before re-sending; blind retry re-fails. |
| `server_flush_error` | Backpressure deadline hit: queue full for `sf_append_deadline_millis` | Usable | Retry later, shed load, or raise the deadline. Nothing was dropped. See [backpressure](#durability-and-backpressure). |
| `invalid_api_call` | Borrow still at the pool cap after `acquire_timeout_ms`, pool closed, an operation on a borrow after close, or a durable-level wait without `request_durable_ack=on` | n/a | At-cap: treat as backpressure (see [Sizing the pool](#sizing-the-pool)). Closed pool: stop borrowing. |

If you are unsure which case you hit, **return is always safe**: the pool
inspects the connection and retires it if unhealthy, so a broken connection
never reaches the next borrower. **Drop** is the conservative choice when the
next borrower must not inherit the connection.

### Pool keys

The connect string accepts pool-tuning keys; the defaults suit most
callers.

The ingestion and query pools size independently, so each has its own pair of
keys.

| Key | Default | Meaning |
| --- | --- | --- |
| `sender_pool_min` | 1 | Warm/minimum ingestion connections. Once connections have been opened, this many stay open however long they sit idle. |
| `sender_pool_max` | 4 | Hard cap on ingestion auto-grow. |
| `query_pool_min` | 1 | Warm/minimum query connections. |
| `query_pool_max` | 4 | Hard cap on query auto-grow. |
| `acquire_timeout_ms` | 5000 | How long a borrow waits for a returned connection once its pool is at its cap, before returning an error. `0` fails fast. |
| `idle_timeout_ms` | 60000 | Idle connections above the warm minimum are closed after this long. |
| `pool_reap` | `auto` | `auto` closes idle connections on a background thread; `manual` leaves it to your `questdb_db_reap_idle` / `pool::reap_idle` calls. |

When to change them: raise `sender_pool_min` / `query_pool_min` when workers
borrow intermittently and a cold borrow would pay reconnect and auth latency;
that many connections stay warm. `idle_timeout_ms` trades idle sockets against
that same reconnect cost. Pick `pool_reap=manual` to control the shrink cadence
yourself and avoid the background thread; call `reap_idle` on your own schedule.

Every borrowed sender writes through a local **store-and-forward** queue.
Without `sf_dir` the queue is in memory and private to the borrow; setting
`sf_dir` moves it to a directory on disk that survives process restarts. The
pool gives each borrow its own directory, named
`<sf_dir>/<sender_id>-ingest-<index>/`, where `index` is the lowest free number
in `[0, sender_pool_max)`. Because those names are stable, a restarted pool
re-adopts the directories and replays the unacked frames they hold.

`sender_id` (default `default`) is the **name prefix** for those directories,
not a directory itself. Keep it stable across restarts so replay finds them,
and give each pool sharing an `sf_dir` its own prefix, since a pool assumes
every `<sender_id>-ingest-*` directory is its own. If two processes (or two
pools) do share a prefix, the second one fails immediately with an in-use error
naming the pid that holds the directory. A bare `<sf_dir>/<sender_id>/`
directory, with no `-ingest-<index>` suffix, is not pool-managed: the pool
treats it as an orphan and drains it only with `drain_orphans=on`. The
`sf_max_segment_bytes`, `sf_max_total_bytes`, and `sf_append_deadline_millis` keys
tune the queue in both memory and disk mode; `sender_id` has no effect
without `sf_dir`. Full `sf_*` key semantics are in the
[connect string reference](/docs/connect/clients/connect-string/#sf-keys).

### Sizing the pool

**A borrow at the cap waits for a return before it fails.** When
`sender_pool_max` sender handles are already out, `questdb_db_borrow_sender`
waits up to `acquire_timeout_ms` for another thread to return one; if none does,
it returns `NULL` with `line_sender_error_invalid_api_call` (C++ throws). Set
`acquire_timeout_ms=0` to fail fast instead. In disk-backed store-and-forward
mode, an at-cap borrow may also wait up to `close_flush_timeout_millis` for a
sender that is currently closing to release its directory. Two consequences:

- **Size `sender_pool_max` to your worker count.** The natural pattern is one
  borrow per worker thread held for the worker's lifetime (see
  [Concurrency](#concurrency-one-borrow-per-worker)); then the cap is never
  hit.
- **If borrows are short-lived and demand can spike past the cap**, treat the
  at-cap error as backpressure: return a borrow elsewhere, or retry after a
  delay in your own loop. `borrow_sender_with_retry` will not help here — it
  retries *connection establishment*, and at the cap the connection side is
  working fine.

The sender and reader pools are capped independently, at `sender_pool_max` and
`query_pool_max`, so heavy ingestion cannot starve queries; budget each active
path up to its own cap in live connections.

## FSN progress (non-blocking) {#fsn-progress-non-blocking}

Every QWP/WebSocket flush is asynchronous: it publishes into the local queue and
returns before the server ACKs. Beyond the blocking `wait` barrier, the sender
exposes **frame sequence numbers (FSNs)** for non-blocking progress tracking
while the borrow is still held:

- Publish with an FSN-returning flush: C
  `qwp_sender_flush_buffer_and_get_fsn` or
  `qwp_sender_flush_chunk_and_get_fsn`; C++ `flush_and_get_fsn()` (overloaded
  for buffers and chunks, returning `std::optional<uint64_t>`).
- Keep doing work, then compare the saved FSN against how far the server has
  acknowledged: C `qwp_sender_acked_fsn`; C++ `acked_fsn()`. The server has
  acknowledged everything you published up to that flush once `acked_fsn`
  returns a value `>=` your saved FSN.
- A successful flush of a non-empty buffer or chunk always yields an FSN. No
  value (C: `has_value == false` in the `line_sender_qwpws_fsn` out-param,
  C++: `std::nullopt`) means the buffer or chunk was empty, so there was no
  frame to publish. Likewise `acked_fsn` has no value until the first frame on
  this borrow completes: keep polling, don't re-flush.

An FSN is a watermark on one borrowed sender's own stream, meaningful only
while you hold that borrow. A later borrow from the same pool gets a fresh
stream, and a number you saved from an earlier one means nothing against it.

## Closing

Orderly shutdown is: **wait, return, close.**

1. If you need delivery confirmation, call `wait` on each sender first (or
   check FSN watermarks); pool close only drains best-effort within
   `close_flush_timeout_millis` (default 5000 ms; `0` disables the drain; see
   the [connect string reference](/docs/connect/clients/connect-string/)) on
   an in-memory queue. With `sf_dir`, unacked frames survive on disk
   regardless and replay on the next run.
2. Return or drop every borrow. In C++, scope exit does this.
3. `questdb_db_close(db)` (C++: `pool` destructor). Accepts `NULL`. Unlike
   every other pool call, this one is **not safe to run concurrently**: no
   other thread may be borrowing, returning, or reaping on the same handle
   while it runs.

Outstanding borrows **survive the pool's close**: returning or dropping them
afterwards is safe (they close instead of recycling), but new operations on
them fail with `invalid_api_call`. Return and drop remain **mutually
exclusive** per handle (exactly one, exactly once); a second release call on
the same handle is undefined behavior.

You never have to inspect a connection's health yourself. The return path
detects one that has failed permanently and retires it, so the only choice is
between plain return and drop.

## Production shape: TLS, token, multi-host, retry

A production-shaped configuration: TLS with OS roots, bearer token, two
endpoints, a store-and-forward spool, durable acks, and a retry-bounded
borrow:

<Tabs defaultValue="cpp" groupId="c-cpp">
<TabItem value="cpp" label="C++">

```cpp
#include <questdb/ingress/qwp_sender.hpp>
#include <iostream>

using namespace questdb::ingress::literals;

int main()
{
    try
    {
        questdb::pool pool{
            "wss::addr=db-primary.example.com:9000,db-replica.example.com:9000;"
            "token=YOUR_BEARER_TOKEN;"
            "tls_ca=os_roots;"              // trust the OS store (corporate CAs)
            "sf_dir=/var/spool/questdb;"
            "sender_id=ingest-01;"
            // Enterprise; the connect fails against a server without replication.
            "request_durable_ack=on;"};

        // First borrow opens the connection: give it the failover budget.
        auto sender =
            pool.borrow_sender_with_retry(pool.reconnect_max_duration_ms());

        auto buffer = sender.new_buffer();
        buffer.table("trades"_tn)
              .symbol("symbol"_cn, "ETH-USDT"_utf8)
              .column("price"_cn, 2615.54)
              .at(questdb::ingress::timestamp_nanos::now());

        sender.flush(buffer);                       // lands in the sf_dir spool
        // Durable barrier; needs request_durable_ack=on above.
        sender.wait(questdb::ingress::qwpws_ack_level::durable);
        return 0;
    }
    catch (const questdb::error& e)
    {
        std::cerr << "error: " << e.what() << "\n";
        return 1;
    }
}
```

</TabItem>
<TabItem value="c" label="C">

```c
#include <questdb/ingress/qwp_sender.h>   // questdb_db_borrow_sender + line_sender_buffer
#include <stdio.h>
#include <string.h>

int main(void)
{
    line_sender_error* err = NULL;
    questdb_db* db = NULL;
    qwp_sender* sender = NULL;
    line_sender_buffer* buffer = NULL;

    const char* conf =
        "wss::addr=db-primary.example.com:9000,db-replica.example.com:9000;"
        "token=YOUR_BEARER_TOKEN;"
        "tls_ca=os_roots;"              /* trust the OS store (corporate CAs) */
        "sf_dir=/var/spool/questdb;"
        "sender_id=ingest-01;"
        /* Enterprise; the connect fails against a server without replication. */
        "request_durable_ack=on;";
    db = questdb_db_connect(conf, strlen(conf), &err);
    if (!db) goto on_error;

    /* First borrow opens the connection: give it the failover budget. */
    sender = questdb_db_borrow_sender_with_retry(
        db, questdb_db_reconnect_max_duration_ms(db), &err);
    if (!sender) goto on_error;

    buffer = questdb_db_new_buffer(db, &err);
    if (!buffer) goto on_error;
    if (!line_sender_buffer_table(buffer, QDB_TABLE_NAME_LITERAL("trades"), &err)) goto on_error;
    if (!line_sender_buffer_symbol(buffer, QDB_COLUMN_NAME_LITERAL("symbol"),
                                   QDB_UTF8_LITERAL("ETH-USDT"), &err)) goto on_error;
    if (!line_sender_buffer_column_f64(buffer, QDB_COLUMN_NAME_LITERAL("price"), 2615.54, &err)) goto on_error;
    if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err)) goto on_error;

    /* flush lands in the sf_dir spool; the durable barrier needs the
       request_durable_ack=on key above. */
    if (!qwp_sender_flush_buffer(sender, buffer, &err)) goto on_error;
    if (!qwp_sender_wait(sender, qwpws_ack_level_durable, 0, &err)) goto on_error;

    line_sender_buffer_free(buffer);
    questdb_db_return_sender(db, sender);
    questdb_db_close(db);
    return 0;

on_error:;
    size_t len = 0;
    const char* msg = line_sender_error_msg(err, &len);
    fprintf(stderr, "error: %.*s\n", (int)len, msg);
    line_sender_error_free(err);
    line_sender_buffer_free(buffer);
    if (sender) questdb_db_drop_sender(db, sender);
    questdb_db_close(db);
    return 1;
}
```

</TabItem>
</Tabs>

## API at a glance

The pooled surface in both languages:

| Concern | C | C++ |
| --- | --- | --- |
| Connection pool | `questdb_db*` | `questdb::pool` |
| Borrow a sender | `questdb_db_borrow_sender` → `qwp_sender*` | `pool::borrow_sender()` → `borrowed_sender` |
| Borrow a **reader** | `questdb_db_borrow_reader` → `qwp_reader*` | `pool::borrow_reader()` → `reader` |
| Row buffer | `line_sender_buffer*` | `questdb::ingress::line_sender_buffer` |
| Column chunk | `qwp_chunk*` | `questdb::ingress::column_chunk` |
| Buffer flush | `qwp_sender_flush_buffer` | `borrowed_sender::flush(line_sender_buffer&)` |
| Chunk flush | `qwp_sender_flush_chunk` | `borrowed_sender::flush(column_chunk&)` |
| Arrow batch flush | `qwp_sender_flush_arrow_batch_at_column` | `borrowed_sender::flush_arrow_batch()` |
| Flush, then block until acked | `qwp_sender_flush_buffer_and_wait` / `qwp_sender_flush_chunk_and_wait` | `borrowed_sender::flush_and_wait()` overloads |
| Streaming result | `qwp_reader_cursor*` → `qwp_reader_batch*` | `cursor` → `batch` → `column` |

## Conventions and lifecycle

- **Error handling.** C has one error type under two names: reader declarations
  spell it `questdb_error`, ingress declarations `line_sender_error`, and
  either name works anywhere (see
  [One error type, two names](#one-error-type-two-names) below). Fallible calls
  return `bool` or a handle (`NULL` on failure); read and free errors with
  `questdb_error_msg` / `questdb_error_free`, or the identical
  `line_sender_error_msg` / `line_sender_error_free`. In C++, catch
  `questdb::error` across pool, ingestion, and query operations.
- **Ownership.** C handles are created by `*_connect` / `*_new` / `*_from_conf`
  / `questdb_db_borrow_*` and released with `*_close` / `*_free` /
  `questdb_db_return_*` / `questdb_db_drop_*`. Return and drop are **mutually
  exclusive** on the same handle: call exactly one, exactly once. The C++
  wrappers (`pool`, `borrowed_sender`, `column_chunk`, `reader`, `cursor`) are
  RAII and move-only.
- **Concurrency.** The pool is shared across threads; a borrowed handle belongs
  to one thread at a time. See
  [Concurrency: one borrow per worker](#concurrency-one-borrow-per-worker).

### One error type, two names (C) {#one-error-type-two-names}

The C library also ships the legacy Line Sender API for ILP ingestion, whose
types all carry a `line_sender_` prefix. The QWP API shares some of them, the
error object among them: it reports failures through the same
`line_sender_error` rather than declaring an error type of its own. To keep the
naming neutral across ingest and query, the headers alias it:

```c
typedef line_sender_error questdb_error;
typedef line_sender_error_code questdb_error_code;
```

Hence the two spellings in C code on this page. They are the same type: the
error codes are aliased too (`questdb_error_auth_error` *is*
`line_sender_error_auth_error`), and the accessors come in both spellings with
identical behavior (`questdb_error_msg` / `line_sender_error_msg`). Either name
compiles against any error this page returns, so pick one per program and stay
with it. The examples use whichever spelling matches the header in view.

## Full API reference

The installed headers are the complete reference:

| Header | Covers |
| --- | --- |
| `questdb/client.h` | The pool, its lifecycle, the connect-string keys, connection events, and pool diagnostics |
| `questdb/ingress/qwp_sender.h` | Sender borrowing, buffers, chunks, and ingestion |
| `questdb/ingress/line_sender.h` | Errors, table and column names, UTF-8 helpers |
| `questdb/egress/qwp_reader.h` | Reader borrowing, queries, cursors, and Arrow result batches |

Each has a `.hpp` counterpart wrapping the same surface in RAII types that
throw `questdb::error` instead of returning `false`.

## Next steps

- [Connect string reference](/docs/connect/clients/connect-string/)
- [QWP protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/)
- [Rust pooled API](/docs/connect/clients/rust/) (the same pool, in Rust)
