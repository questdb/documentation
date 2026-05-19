---
slug: /connect/clients/c-and-cpp
title: C & C++ client for QuestDB
sidebar_label: C & C++
description: "QuestDB C and C++ client for high-throughput ingestion and SQL query execution over the QWP binary protocol (WebSocket)."
---

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"
import SfDedupWarning from "../../partials/_sf-dedup-warning.partial.mdx"

The QuestDB C and C++ client connects to QuestDB over the
[QWP — QuestDB Wire Protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/) — a
columnar binary protocol carried over WebSocket. The library is implemented in
Rust and exposes both a C11 ABI and a C++17 header-only wrapper from a single
shared/static library.

Two complementary APIs live in the same library:

- **Ingestion** (`line_sender_*` / `questdb::ingress::line_sender`):
  column-oriented batched writes with automatic table creation, schema
  evolution, multi-host failover, and optional store-and-forward durability.
- **Querying** (`line_reader_*` / `questdb::egress::reader`):
  parameterised SQL over the QWP egress endpoint (`/read/v1`), with
  streaming batch results, per-query failover, and credit-based flow
  control. See [Querying and SQL execution](#querying-and-sql-execution).

:::tip Transports

QWP/WebSocket (`ws::` / `wss::`) is the current default ingest path and the
focus of this page. The same library also supports the legacy ILP transports
(`http::` / `https::` / `tcp::` / `tcps::`) and QWP over UDP for trusted
high-throughput networks. For ILP transport details, see the
[ILP overview](/docs/connect/compatibility/ilp/overview/).

:::

:::info

The ingestion and query clients are independent — each opens its own
WebSocket connection. You can also query QuestDB from C/C++ via the
[PGWire C++ client](/docs/connect/compatibility/pgwire/c-and-cpp/) or the
[REST API](/docs/connect/compatibility/rest-api/) when the QWP transport
is not available.

:::

## Quick start

### Prerequisites

- A C11 or C++17 compiler (tested with GCC and Clang).
- CMake 3.15 or newer.
- Rust 1.61 or newer (only required when building the library from source).

### Build the library

Clone and build from
[c-questdb-client](https://github.com/questdb/c-questdb-client):

```bash
git clone https://github.com/questdb/c-questdb-client.git
cd c-questdb-client
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

The build produces both a static (`libquestdb_client.a`) and a shared
(`libquestdb_client.so` / `.dylib` / `.dll`) library. Headers live in
`include/questdb/ingress/`. The same build directory also contains
runnable example binaries (`line_sender_c_example*` for C,
`line_sender_cpp_example*` for C++) that are useful as reference workloads.

### Hello world

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
#include <questdb/ingress/line_sender.h>
#include <stdio.h>
#include <string.h>

int main(void) {
    line_sender_error* err = NULL;
    line_sender* sender = NULL;
    line_sender_buffer* buffer = NULL;

    const char* conf = "ws::addr=localhost:9000;";
    line_sender_utf8 conf_utf8;
    if (!line_sender_utf8_init(&conf_utf8, strlen(conf), conf, &err)) goto on_error;

    sender = line_sender_from_conf(conf_utf8, &err);
    if (!sender) goto on_error;

    buffer = line_sender_buffer_new_for_sender(sender);

    line_sender_table_name tbl = QDB_TABLE_NAME_LITERAL("trades");
    line_sender_column_name symbol_name = QDB_COLUMN_NAME_LITERAL("symbol");
    line_sender_column_name side_name = QDB_COLUMN_NAME_LITERAL("side");
    line_sender_column_name price_name = QDB_COLUMN_NAME_LITERAL("price");
    line_sender_column_name amount_name = QDB_COLUMN_NAME_LITERAL("amount");
    line_sender_utf8 symbol_val = QDB_UTF8_LITERAL("ETH-USD");
    line_sender_utf8 side_val = QDB_UTF8_LITERAL("sell");

    if (!line_sender_buffer_table(buffer, tbl, &err)) goto on_error;
    if (!line_sender_buffer_symbol(buffer, symbol_name, symbol_val, &err)) goto on_error;
    if (!line_sender_buffer_symbol(buffer, side_name, side_val, &err)) goto on_error;
    if (!line_sender_buffer_column_f64(buffer, price_name, 2615.54, &err)) goto on_error;
    if (!line_sender_buffer_column_f64(buffer, amount_name, 0.00044, &err)) goto on_error;
    if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err)) goto on_error;

    if (!line_sender_flush(sender, buffer, &err)) goto on_error;
    if (!line_sender_qwpws_close_drain(sender, &err)) goto on_error;

    line_sender_buffer_free(buffer);
    line_sender_close(sender);
    return 0;

on_error:;
    size_t err_len = 0;
    const char* msg = line_sender_error_msg(err, &err_len);
    fprintf(stderr, "error: %.*s\n", (int)err_len, msg);
    line_sender_error_free(err);
    if (buffer) line_sender_buffer_free(buffer);
    if (sender) line_sender_close(sender);
    return 1;
}
```

:::caution `QDB_*_LITERAL` is for string literals only

The `QDB_*_LITERAL` macros expand to `sizeof(literal) - 1`; passing a
`const char*` variable compiles but silently encodes the pointer size
(typically 7 bytes), not the string length. For runtime strings, use the
`_init` form — see how `conf` above is initialized with
`line_sender_utf8_init`. The matching `_table_name_init` and
`_column_name_init` exist as well.

:::

Compile with:

```bash
gcc -std=c11 hello.c \
    -I /path/to/c-questdb-client/include \
    -L /path/to/c-questdb-client/build -lquestdb_client \
    -o hello
```

</TabItem>
<TabItem value="cpp">

```cpp
#include <questdb/ingress/line_sender.hpp>
#include <iostream>

namespace qdb = questdb::ingress;
using namespace questdb::ingress::literals;

int main() {
    try {
        auto sender = qdb::line_sender::from_conf(
            "ws::addr=localhost:9000;"_utf8);
        auto buffer = sender.new_buffer();
        buffer
            .table("trades"_tn)
            .symbol("symbol"_cn, "ETH-USD"_utf8)
            .symbol("side"_cn, "sell"_utf8)
            .column("price"_cn, 2615.54)
            .column("amount"_cn, 0.00044)
            .at(qdb::timestamp_nanos::now());
        sender.flush(buffer);
        sender.close_drain();
        return 0;
    } catch (const qdb::line_sender_error& e) {
        std::cerr << "error: " << e.what() << "\n";
        return 1;
    }
}
```

Compile with:

```bash
g++ -std=c++17 hello.cpp \
    -I /path/to/c-questdb-client/include \
    -L /path/to/c-questdb-client/build -lquestdb_client \
    -o hello
```

</TabItem>
</Tabs>

Linking against the shared `libquestdb_client.so` needs no extra libraries.
The static `libquestdb_client.a` additionally requires `-lpthread -ldl -lm`
(and TLS deps if the build was configured with rustls or OpenSSL).

If you linked against an in-tree build, the binary needs to find
`libquestdb_client.so` at runtime — either set
`LD_LIBRARY_PATH=/path/to/c-questdb-client/build` before running, or add
`-Wl,-rpath,/path/to/c-questdb-client/build` to the link line.

For production builds, prefer CMake integration — see the [upstream dependency
guide](https://github.com/questdb/c-questdb-client/blob/main/doc/DEPENDENCY.md).

The four steps are:

1. Build a sender from a connect string.
2. Append rows to a buffer.
3. Call `flush()` to publish.
4. Call `close_drain()` before destroying the sender so already-published
   frames complete on the wire.

C function names that include `qwpws` — for example
`line_sender_qwpws_close_drain` in step 4, or `line_sender_qwpws_poll_error`
in [Asynchronous error handling](#asynchronous-error-handling) — are
QWP/WebSocket-specific. Unprefixed functions (`line_sender_close`,
`line_sender_flush`, the buffer setters) work for any transport the library
supports.

## Authentication and TLS

Authentication happens at the HTTP level during the WebSocket upgrade, before
any binary frames are exchanged.

### HTTP basic auth

```text
wss::addr=db.example.com:9000;username=admin;password=quest;
```

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
line_sender_utf8 conf = QDB_UTF8_LITERAL(
    "wss::addr=db.example.com:9000;username=admin;password=quest;");
line_sender_error* err = NULL;
line_sender* sender = line_sender_from_conf(conf, &err);
```

</TabItem>
<TabItem value="cpp">

```cpp
auto sender = questdb::ingress::line_sender::from_conf(
    "wss::addr=db.example.com:9000;username=admin;password=quest;"_utf8);
```

</TabItem>
</Tabs>

### Token auth (Enterprise, recommended)

Token authentication has lower overhead than basic auth and is the
recommended path for Enterprise deployments.

```text
wss::addr=db.example.com:9000;token=your_bearer_token;
```

### TLS

Use the `wss` schema for TLS. Select where root certificates come from with
`tls_ca`:

| Key | Description |
|-----|-------------|
| `tls_ca=webpki_roots` | Use bundled webpki roots. |
| `tls_ca=os_roots` | Use the OS certificate store. |
| `tls_ca=webpki_and_os_roots` | Combine both. |
| `tls_roots=/path/to/root-ca.pem` | Load roots from a PEM file. Useful for self-signed certs during testing. |
| `tls_verify=unsafe_off` | Disable verification. Never use in production. Requires the library to be built with the `insecure-skip-verify` Cargo feature; the default builds reject this value. |

Example with a custom CA file:

```text
wss::addr=db.example.com:9000;tls_roots=/etc/ssl/qdb-ca.pem;
```

### Authentication timeout

`auth_timeout_ms` (default 15000) controls how long the client waits for the
WebSocket upgrade to complete. `auth_timeout` is also accepted for
compatibility with the HTTP transport's spelling.

### Unsupported auth paths

The C/C++ client supports only HTTP basic auth and static bearer-token auth
(the two methods documented above). The following are **not** supported:

| Path | Status | Workaround |
|---|---|---|
| OIDC token acquisition or in-band refresh | Not supported by this client. The client does not negotiate with an identity provider and has no callback to refresh a token mid-session. | QuestDB itself supports OIDC — see [OpenID Connect](/docs/security/oidc/). To connect this client to an OIDC-protected QuestDB, acquire an access token out-of-band from your IdP, pass it via `token=...` above, and rebuild the sender when the token nears expiry. |
| Mutual TLS (client certificates) | Not supported. The QuestDB server does not negotiate client certificates regardless of client. | Use bearer-token auth over `wss://`. See the connect-string reference's [TLS section](/docs/connect/clients/connect-string/#tls) for the canonical statement. |
| Token rotation mid-session | Not supported. Credentials are presented once during the WebSocket upgrade and are not re-sent. | On token expiry, call `line_sender_qwpws_close_drain` / `sender.close_drain()`, free the sender, and build a fresh one with the new token. |

## Creating the client

### From a connect string

The connect string format is `<schema>::<key>=<value>;<key>=<value>;...`

Use `ws` (plain) or `wss` (TLS). `qwpws` / `qwpwss` are accepted as
aliases. The default port is `9000`.

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
line_sender_utf8 conf = QDB_UTF8_LITERAL("ws::addr=localhost:9000;");
line_sender_error* err = NULL;
line_sender* sender = line_sender_from_conf(conf, &err);
```

</TabItem>
<TabItem value="cpp">

```cpp
auto sender = questdb::ingress::line_sender::from_conf(
    "ws::addr=localhost:9000;"_utf8);
```

</TabItem>
</Tabs>

For the full list of connect-string keys, see the
[connect string reference](/docs/connect/clients/connect-string/).

### From an environment variable

Set `QDB_CLIENT_CONF` to keep credentials out of source code:

```bash
export QDB_CLIENT_CONF="wss::addr=db.example.com:9000;username=admin;password=quest;"
```

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
line_sender_error* err = NULL;
line_sender* sender = line_sender_from_env(&err);
```

</TabItem>
<TabItem value="cpp">

```cpp
auto sender = questdb::ingress::line_sender::from_env();
```

</TabItem>
</Tabs>

### Using the options API

For callers that prefer typed setters over a connect string, build the sender
through `line_sender_opts`:

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
line_sender_error* err = NULL;
line_sender_utf8 host = QDB_UTF8_LITERAL("localhost");
line_sender_opts* opts = line_sender_opts_new(
    line_sender_protocol_qwpws, host, 9000);
if (!line_sender_opts_qwpws_progress(
        opts, LINE_SENDER_QWPWS_PROGRESS_BACKGROUND, &err))
    goto on_error;
line_sender* sender = line_sender_build(opts, &err);
line_sender_opts_free(opts);
```

</TabItem>
<TabItem value="cpp">

```cpp
namespace qdb = questdb::ingress;
using namespace questdb::ingress::literals;

qdb::opts options{qdb::protocol::qwpws, "localhost"_utf8, 9000};
options.qwp_ws_progress(qdb::qwp_ws_progress::background)
       .auth_timeout(15000);
qdb::line_sender sender{options};
```

</TabItem>
</Tabs>

Most QWP/WebSocket settings are best configured through the connect string. The
options API mirrors the same keys with C/C++-typed setters; see the function
prototypes under `bool line_sender_opts_*` in `line_sender.h` for the full set.

## Data ingestion

### Concurrency

`line_sender` is single-owner: only one thread may call publishing methods on a
given sender at a time. For concurrent producers, create one sender per
producer thread, or hand rows to a single owner over a queue.

Buffers (`line_sender_buffer`) are also single-owner but are not tied to a
specific sender. Give each encoder thread its own buffer, fill it locally,
and hand the buffer to the sender thread (or call `flush()` if the same
thread owns both). This lets worker threads encode rows in parallel and
serialises only the publish step.

When several sender instances share an `sf_dir`, give each a distinct
`sender_id`, slots are exclusive (see [Store-and-forward](#store-and-forward)).

### General usage pattern

1. Call `line_sender_buffer_table(buffer, name, &err)` (C++ `buffer.table(name)`)
   to select a target table.
2. Call typed column setters to add values (see
   [Column setters](#column-setters) below).
3. Finalize the row with `line_sender_buffer_at_nanos`,
   `line_sender_buffer_at_micros`, or `line_sender_buffer_at_now` (C++
   `buffer.at(...)` / `buffer.at_now()`).
4. Repeat from step 1, or call `line_sender_flush(sender, buffer, &err)` (C++
   `sender.flush(buffer)`) to publish.

Tables and columns are created automatically if they do not exist.

A typical ingest loop reuses both the sender and the buffer; a successful
`line_sender_flush` clears the buffer (a failed flush retains the rows so
you can retry):

```c
while (running) {
    if (!line_sender_buffer_table(buffer, tbl, &err)) break;
    if (!line_sender_buffer_symbol(buffer, sensor_name, sensor_val, &err)) break;
    if (!line_sender_buffer_column_f64(buffer, temp_name, read_temp(), &err)) break;
    if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err)) break;
    if (!line_sender_flush(sender, buffer, &err)) break;
    sleep_one_second();
}
```

### Column setters

QWP buffers accept every QuestDB column type. The C ABI exposes each type as a
separate function; the C++ wrapper overloads `column()` for primitive scalars
and provides dedicated methods for everything else.

| QuestDB type | C function | C++ method |
|---|---|---|
| `SYMBOL` | `line_sender_buffer_symbol` | `buffer.symbol(name, value)` |
| `BOOLEAN` | `line_sender_buffer_column_bool` | `buffer.column(name, bool)` |
| `BYTE` (i8) | `line_sender_buffer_column_i8` | `buffer.column_i8(name, value)` |
| `SHORT` (i16) | `line_sender_buffer_column_i16` | `buffer.column_i16(name, value)` |
| `INT` (i32) | `line_sender_buffer_column_i32` | `buffer.column_i32(name, value)` |
| `LONG` (i64) | `line_sender_buffer_column_i64` | `buffer.column(name, int64_t)` |
| `FLOAT` (f32) | `line_sender_buffer_column_f32` | `buffer.column_f32(name, value)` |
| `DOUBLE` (f64) | `line_sender_buffer_column_f64` | `buffer.column(name, double)` |
| `CHAR` | `line_sender_buffer_column_char` | `buffer.column_char(name, code_unit)` |
| `VARCHAR` | `line_sender_buffer_column_str` | `buffer.column(name, std::string_view)` |
| `BINARY` | `line_sender_buffer_column_binary` | `buffer.column_binary(name, bytes, len)` |
| `UUID` | `line_sender_buffer_column_uuid` | `buffer.column_uuid(name, lo, hi)` |
| `LONG256` | `line_sender_buffer_column_long256` | `buffer.column_long256(name, bytes)` |
| `IPv4` | `line_sender_buffer_column_ipv4` | `buffer.column_ipv4(name, value)` |
| `DATE` | `line_sender_buffer_column_date` | `buffer.column_date(name, millis)` |
| `TIMESTAMP` (non-designated) | `line_sender_buffer_column_ts_micros` | `buffer.column(name, timestamp_micros)` |
| `TIMESTAMP_NS` (non-designated) | `line_sender_buffer_column_ts_nanos` | `buffer.column(name, timestamp_nanos)` |
| `GEOHASH` | `line_sender_buffer_column_geohash` | `buffer.column_geohash(name, bits, precision)` |
| `DECIMAL` (string form) | `line_sender_buffer_column_dec_str` | `buffer.column(name, decimal_str_view)` |
| `DECIMAL` (binary, generic) | `line_sender_buffer_column_dec` | `buffer.column(name, decimal_view)` |
| `DECIMAL64` | `line_sender_buffer_column_dec64` / `_dec64_str` | `buffer.column_dec64(name, ...)` |
| `DECIMAL128` | `line_sender_buffer_column_dec128` / `_dec128_str` | `buffer.column_dec128(name, ...)` |
| `DOUBLE[]` (arrays) | `line_sender_buffer_column_f64_arr_c_major` / `_byte_strides` / `_elem_strides` | `buffer.column(name, array_view)` |

### Null values

The C ABI does not expose `_opt` variants for typed nulls (unlike the Rust
client). To write a null for a column on a given row, **omit the setter for
that column** — there is no explicit "set null" call.

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
// `amount` is omitted on this row, so it is stored as NULL.
if (!line_sender_buffer_table(buffer, tbl, &err)) goto on_error;
if (!line_sender_buffer_symbol(buffer, symbol_name, symbol_val, &err)) goto on_error;
if (!line_sender_buffer_column_f64(buffer, price_name, 2615.54, &err)) goto on_error;
if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err)) goto on_error;
```

</TabItem>
<TabItem value="cpp">

```cpp
// `amount` is omitted on this row, so it is stored as NULL.
buffer
    .table("trades"_tn)
    .symbol("symbol"_cn, "ETH-USD"_utf8)
    .column("price"_cn, 2615.54)
    .at(qdb::timestamp_nanos::now());
```

</TabItem>
</Tabs>

The designated timestamp cannot be null — every row requires one of
`at_nanos`, `at_micros`, or `at_now`.

On a brand-new table, an omitted column is not inferred from that row.
The server only adds the column when a later row supplies a non-null
value for it, so first-row nulls leave the column absent until then.

### Ingest arrays

The client encodes one-dimensional and multidimensional `DOUBLE[]` (and
`LONG[]`, when the server accepts it) columns. Three layouts are supported:

| Layout | Function (f64) | When to use |
|---|---|---|
| Row-major (C-major) | `line_sender_buffer_column_f64_arr_c_major` | Contiguous, row-major (C-style) buffers. |
| Byte strides | `line_sender_buffer_column_f64_arr_byte_strides` | Non-contiguous data with strides expressed in bytes. |
| Element strides | `line_sender_buffer_column_f64_arr_elem_strides` | Non-contiguous data with strides expressed in elements. |

```c
// Row-major 3x2 array of f64.
uintptr_t shape[2] = {3, 2};
double values[6] = {1.0850, 600000.0, 1.0849, 300000.0, 1.0848, 150000.0};
if (!line_sender_buffer_column_f64_arr_c_major(
        buffer,
        QDB_COLUMN_NAME_LITERAL("bids"),
        2,                                     // rank
        shape,                                 // shape (length == rank)
        values,                                // data (typed pointer)
        sizeof(values) / sizeof(values[0]),    // element count
        &err))
    goto on_error;
```

Array ingestion requires QuestDB 9.0.0 or later.

### Decimal columns

:::caution

Decimal ingestion requires QuestDB 9.2.0 or later. Pre-create decimal columns
with `DECIMAL(precision, scale)` so the server enforces the expected precision.
See the
[decimal data type](/docs/query/datatypes/decimal/#creating-tables-with-decimals)
page.

:::

The simplest path is the string form:

```c
const char* price = "2615.54";
if (!line_sender_buffer_column_dec_str(
        buffer,
        QDB_COLUMN_NAME_LITERAL("price"),
        price, strlen(price),
        &err))
    goto on_error;
```

For fixed-width binary forms, use `line_sender_buffer_column_dec64` (one
`int64_t` unscaled value) and `line_sender_buffer_column_dec128` (a 16-byte
unscaled little-endian integer).

### Designated timestamp

The [designated timestamp](/docs/concepts/designated-timestamp/) column
controls time-based partitioning and ordering. Two ways to set it:

**User-assigned** (recommended for deduplication and exactly-once delivery):

```c
// Microsecond precision creates a standard TIMESTAMP column.
if (!line_sender_buffer_at_micros(buffer, line_sender_now_micros(), &err))
    goto on_error;

// Nanosecond precision creates a TIMESTAMP_NS column.
if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err))
    goto on_error;
```

**Server-assigned** (server uses its wall-clock time):

```c
if (!line_sender_buffer_at_now(buffer, &err))
    goto on_error;
```

`at_now` removes the ability to deduplicate rows. Prefer explicit timestamps
for production ingestion. See
[Delivery semantics](/docs/concepts/delivery-semantics/) for why
server-assigned timestamps defeat exactly-once outcomes.

:::note

QuestDB works best when data arrives in chronological order (sorted by
timestamp).

:::

## Flushing

The sender and buffer are decoupled. Buffered rows are not on the wire until
you call `line_sender_flush(sender, buffer, &err)` (C++ `sender.flush(buffer)`).

:::caution No auto-flush

The QWP/WebSocket C/C++ client does not implement auto-flushing at all —
you must call `flush()` explicitly. The connect-string keys
`auto_flush_rows` and `auto_flush_bytes` are rejected; `auto_flush=off` is
accepted only as a no-op for compatibility with HTTP/ILP connect strings.

A common pattern is to flush periodically on a timer and/or when the buffer
exceeds a threshold — by encoded byte size (`line_sender_buffer_size(buffer)`,
C++ `buffer.size()`) or row count (`line_sender_buffer_row_count(buffer)`,
C++ `buffer.row_count()`).

:::

`flush()` clears the buffer after publishing locally. Use
`line_sender_flush_and_keep` (C++ `sender.flush_and_keep(buffer)`) to retain
the contents, for example to fan the same buffer out to multiple senders.

On QWP/WebSocket, `flush()` returns once the buffer is accepted by the local
sender queue, before the server acknowledges it. The queue is in process
memory by default; setting `sf_dir` swaps it for the disk-backed
store-and-forward queue. Either way, the call can block if the queue is
full (see [Backpressure on flush](#backpressure-on-flush)). Server errors
observed later are reported asynchronously (see
[Asynchronous error handling](#asynchronous-error-handling)).

### Backpressure on flush

`flush()` is not unconditionally non-blocking. The publisher feeds a bounded
queue with two stacked caps:

1. **In-flight window**, `max_in_flight` (default `128`) unacknowledged
   frames on the connection. Reached first under steady-state load when the
   server keeps up but you have many small flushes in flight.
2. **Queue cap**, `sf_max_total_bytes` (default `128 MiB` in memory mode,
   `10 GiB` in disk mode). Reached when the server is unreachable long
   enough that the in-flight count stops being the active limit.

When either cap is hit, `flush()` blocks the caller and retries as the I/O
loop releases capacity (ACK-driven trim). The wait is bounded by
`sf_append_deadline_millis` (default `30000`). If the deadline elapses,
`flush()` returns an error with code
`line_sender_error_server_flush_error` carrying a `SubmitTimedOut`
diagnostic, the application can retry, fail closed, or shed load.
**No data is ever dropped or overwritten** while the publisher is parked.

Column setters and `line_sender_buffer_table(...)` never block, they only
mutate the in-process buffer. Backpressure surfaces only at `flush()`.

:::caution Oversized payloads are rejected, not parked

A single flushed payload larger than `sf_max_bytes` (default `4 MiB`) returns
an error from `flush()` immediately, it does *not* enter the backpressure
wait. Fixes: reduce the number of rows you accumulate per buffer before
flushing, or raise `sf_max_bytes` to fit your largest single flushed payload.

:::

### FSN-based completion

Every published frame is assigned a frame sequence number (FSN). To wait until
the server has acknowledged a specific frame:

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
line_sender_qwpws_fsn fsn;
if (!line_sender_qwpws_flush_and_get_fsn(sender, buffer, &fsn, &err))
    goto on_error;

if (fsn.has_value) {
    bool reached = false;
    if (!line_sender_qwpws_await_acked_fsn(
            sender, fsn.value, 10000, &reached, &err))
        goto on_error;
    if (!reached)
        fprintf(stderr, "timed out waiting for server ACK\n");
}
```

</TabItem>
<TabItem value="cpp">

```cpp
auto fsn = sender.flush_and_get_fsn(buffer);
if (fsn && !sender.await_acked_fsn(*fsn, std::chrono::seconds{10})) {
    std::cerr << "timed out waiting for server ACK\n";
}
```

</TabItem>
</Tabs>

Related accessors:

| C function | C++ method | Returns |
|---|---|---|
| `line_sender_qwpws_flush_and_get_fsn` | `flush_and_get_fsn(buffer)` | Highest FSN published by this call. `has_value == false` / `std::nullopt` if the buffer was empty. |
| `line_sender_qwpws_flush_and_keep_and_get_fsn` | `flush_and_keep_and_get_fsn(buffer)` | Same, but keeps the buffer. |
| `line_sender_qwpws_published_fsn` | `published_fsn()` | Highest FSN published locally. |
| `line_sender_qwpws_acked_fsn` | `acked_fsn()` | Highest FSN completed (server ACK or drop-and-continue). |
| `line_sender_qwpws_await_acked_fsn` | `await_acked_fsn(fsn, timeout)` | Block until `acked_fsn()` reaches `fsn`, or the timeout elapses. |

In durable ACK mode, `acked_fsn` advances after durable upload, not on the
ordinary OK frame.

## Store-and-forward

With store-and-forward (SF) enabled, unacknowledged frames are persisted to
disk and replayed after reconnection, surviving sender process restarts:

```text
ws::addr=localhost:9000;sf_dir=/var/lib/questdb/sf;sender_id=ingest-1;
```

Without `sf_dir`, unacknowledged data lives in process memory and is lost if
the sender process exits. The reconnect loop still spans transient server
outages, but a RAM cap bounds how much data can accumulate.

<SfDedupWarning />

### SF tuning keys

| Key | Default | Description |
|-----|---------|-------------|
| `sf_dir` | unset | Enables disk-backed SF when set. |
| `sender_id` | `default` | Slot identity. Allowed chars: `A-Za-z0-9_-`. Use distinct ids per sender process. |
| `sf_max_bytes` | 4 MiB | Per-segment size cap. |
| `sf_max_total_bytes` | 128 MiB (memory) / 10 GiB (disk) | Cap on total queued bytes. |
| `sf_durability` | `memory` | `memory` is the only shipping value. `flush` and `append` are reserved for future per-write fsync modes; setting them today fails sender construction. |
| `sf_append_deadline_millis` | 30000 | Maximum time `flush()` blocks waiting for queue capacity to free up. Applies in both memory and disk modes (the SFA queue is shared). On timeout, `flush()` surfaces an error; no data is dropped. See [Backpressure on flush](#backpressure-on-flush). |
| `drain_orphans` | `off` | If `on`, take over stale slots owned by a previous sender. |
| `max_background_drainers` | 4 | Concurrency cap when draining orphans. |

## Durable acknowledgement

:::note Enterprise

Durable acknowledgement requires QuestDB Enterprise with primary replication
configured.

:::

By default, the server confirms a batch once it is committed to the local
[WAL](/docs/concepts/write-ahead-log/). To wait for the batch to be durably
uploaded to object storage:

```text
ws::addr=localhost:9000;sf_dir=/var/lib/questdb/sf;request_durable_ack=on;
```

`durable_ack_keepalive_interval_millis` (default 200) controls how often the
client probes the server for durable ACK progress when no other traffic is in
flight.

## Asynchronous error handling

QWP/WebSocket ingestion is asynchronous: `flush()` returns as soon as the
frame is accepted locally. Server-side rejections and protocol violations are
reported separately.

There are two ways to observe them.

### Polling

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
for (;;) {
    line_sender_qwpws_error* qwp_err = NULL;
    if (!line_sender_qwpws_poll_error(sender, &qwp_err, &err))
        goto on_error;
    if (!qwp_err)
        break;  // no more queued diagnostics

    line_sender_qwpws_error_view view =
        line_sender_qwpws_error_get_view(qwp_err);
    fprintf(stderr,
        "qwp error: category=%d policy=%d status=%d fsn=[%llu..=%llu] msg=%.*s\n",
        (int)view.category,
        (int)view.applied_policy,
        view.has_status ? view.status : -1,
        (unsigned long long)view.from_fsn,
        (unsigned long long)view.to_fsn,
        (int)view.message_len, view.message);
    line_sender_qwpws_error_free(qwp_err);
}
```

</TabItem>
<TabItem value="cpp">

```cpp
while (auto err = sender.poll_qwp_ws_error()) {
    std::cerr
        << "qwp error: category=" << static_cast<int>(err->category)
        << " policy=" << static_cast<int>(err->applied_policy)
        << " status=" << (err->status ? int(*err->status) : -1)
        << " fsn=[" << err->from_fsn << ".." << err->to_fsn << "]"
        << " msg=" << err->message << "\n";
}
```

</TabItem>
</Tabs>

### Handler callback

Install a handler on the options object. It runs synchronously from sender
API calls such as `flush()`. The handler must not call back into the same
sender.

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
static void on_qwp_error(
        void* user_data,
        const line_sender_qwpws_error_view* ev)
{
    (void)user_data;
    fprintf(stderr, "qwp error: category=%d msg=%.*s\n",
        (int)ev->category, (int)ev->message_len, ev->message);
}

line_sender_utf8 host = QDB_UTF8_LITERAL("localhost");
line_sender_opts* opts = line_sender_opts_new(
    line_sender_protocol_qwpws, host, 9000);
line_sender_opts_qwpws_error_handler(opts, on_qwp_error, NULL, &err);
line_sender* sender = line_sender_build(opts, &err);
line_sender_opts_free(opts);
```

</TabItem>
<TabItem value="cpp">

```cpp
namespace qdb = questdb::ingress;
using namespace questdb::ingress::literals;

qdb::opts options{qdb::protocol::qwpws, "localhost"_utf8, 9000};
options.qwp_ws_error_handler([](const qdb::qwp_ws_error& e) {
    std::cerr << "qwp error: category=" << static_cast<int>(e.category)
              << " msg=" << e.message << "\n";
});
qdb::line_sender sender{options};
```

</TabItem>
</Tabs>

### Error view fields

The `line_sender_qwpws_error_view` struct (and the C++ `qwp_ws_error` struct)
carries:

| Field | Meaning |
|---|---|
| `category` | `schema_mismatch`, `parse_error`, `internal_error`, `security_error`, `write_error`, `protocol_violation`, `unknown`. Use for programmatic dispatch. |
| `applied_policy` | `drop_and_continue` (batch dropped, sender continues) or `halt` (sender latched terminal). |
| `status` (`has_status`) | Raw QWP status byte. Absent for WebSocket protocol violations. |
| `message` / `message_len` | Human-readable error text from the server, or a client-synthesized close reason for WebSocket protocol violations. The pointer is **not** NUL-terminated; always read exactly `message_len` bytes. See [Message stability](#message-stability) and [PII safety](#message-pii). |
| `message_sequence` (`has_message_sequence`) | Server's per-frame QWP wire sequence for the error frame. Resets on reconnect, only meaningful within one connection. |
| `from_fsn` / `to_fsn` | Inclusive FSN span of the affected frame(s), client-side. |

`line_sender_qwpws_errors_dropped` (C++ `qwp_ws_errors_dropped()`) reports how
many diagnostics were lost because the bounded log overflowed (typically due
to a lagging poll cursor).

#### Message stability {#message-stability}

`message` is a human-readable diagnostic, **not a stable contract.** Its
text varies across server versions and across provenance:

- **QWP error frames** carry a server-supplied UTF-8 string capped at
  1024 bytes by the wire spec.
- **WebSocket protocol violations** are client-synthesized as
  `"ws-close[<code>]: <reason>"`.
- The server-supplied text mirrors QuestDB's normal SQL error formatting,
  which historically reworded across releases.
- The field may be empty.

Use `category` and `status` for programmatic dispatch. Never pattern-match
on `message`.

#### PII / secret safety {#message-pii}

`message` may include fragments of the client's own payload, for
example, an offending column value quoted back by a schema or parse
rejection, or a server-supplied WebSocket close reason that the
operator did not control. **Treat `message` as potentially containing
PII or secrets.**

Log it at the same trust level as the data being sent, and sanitize
before forwarding to external error trackers (Sentry, Datadog, end-user
UIs). The other fields on the error view are safe to forward as-is -
they carry only structural metadata.

#### Correlating with server-side logs

The protocol does not currently surface a server-issued request or
connection identifier in the WebSocket upgrade response. The closest
correlation tuple is `(message_sequence, from_fsn, to_fsn)`:

- `message_sequence`, per-connection QWP wire sequence the server
  attached to the error frame. Resets on reconnect.
- `from_fsn` / `to_fsn`, client-side FSN span of the affected frames.
  Not generally indexed by server-side logs.

When opening a bug report, supply the connection start time (from your
application logs) and the `(message_sequence, from_fsn, to_fsn)` triple.

After a `halt` policy fires, the sender is terminal. Drop it and create a new
one. `line_sender_must_close(sender)` (C++ `sender.must_close()`) reports
whether the sender has entered a terminal state.

`drop_and_continue` errors do not halt the sender. The affected batch is
discarded; subsequent frames are unaffected and the I/O loop keeps running.

For terminal diagnostics, the next failing sender call also returns a
`line_sender_error*` whose structured QWP/WebSocket diagnostic can be
copied with `line_sender_error_qwpws_get_view(err, &view)`. The view is
borrowed from the ordinary error object and is valid until
`line_sender_error_free()`. Copy exactly `message_len` bytes from
`view.message` before freeing the error. In C++, the same diagnostic is
available via `line_sender_error::qwp_ws_diagnostic()` on the thrown
exception.

## Progress modes

The client drives the WebSocket loop in one of two modes:

| Mode | Behaviour |
|---|---|
| `LINE_SENDER_QWPWS_PROGRESS_BACKGROUND` (default) | A sender-owned thread sends frames, receives ACKs, reconnects, and replays. Right choice for most callers. |
| `LINE_SENDER_QWPWS_PROGRESS_MANUAL` | No background thread. The caller drives progress with `line_sender_qwpws_drive_once` or `line_sender_qwpws_await_acked_fsn`. |

Set it via the connect string (`qwp_ws_progress=manual`) or the options API:

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
#define _POSIX_C_SOURCE 199309L   /* nanosleep */
#include <time.h>

line_sender_utf8 conf = QDB_UTF8_LITERAL(
    "ws::addr=localhost:9000;qwp_ws_progress=manual;");
line_sender* sender = line_sender_from_conf(conf, &err);

// ... append rows ...
line_sender_qwpws_fsn fsn;
if (!line_sender_qwpws_flush_and_get_fsn(sender, buffer, &fsn, &err))
    goto on_error;

if (fsn.has_value) {
    bool reached = false;
    while (!reached) {
        bool progressed = false;
        if (!line_sender_qwpws_drive_once(sender, &progressed, &err))
            goto on_error;
        line_sender_qwpws_fsn acked;
        if (!line_sender_qwpws_acked_fsn(sender, &acked, &err))
            goto on_error;
        if (acked.has_value && acked.value >= fsn.value) {
            reached = true;
        } else if (!progressed) {
            /* Park briefly so the loop does not spin. Replace with
             * whatever your scheduler/event loop uses. */
            struct timespec park = {0, 1000 * 1000};
            nanosleep(&park, NULL);
        }
    }
}
```

</TabItem>
<TabItem value="cpp">

```cpp
#include <thread>

auto sender = qdb::line_sender::from_conf(
    "ws::addr=localhost:9000;qwp_ws_progress=manual;"_utf8);
// ... append rows ...
auto fsn = sender.flush_and_get_fsn(buffer);
if (fsn) {
    while (true) {
        auto acked = sender.acked_fsn();
        if (acked && *acked >= *fsn) break;
        if (!sender.drive_once()) {
            std::this_thread::sleep_for(std::chrono::milliseconds{1});
        }
    }
}
```

</TabItem>
</Tabs>

`drive_once` performs at most one unit of work per call (send one frame,
drain ready responses, do one storage-maintenance step). For a simpler
blocking wait in manual mode, call `await_acked_fsn` directly, it drives
manual progress internally while waiting.

## Failover and high availability

:::note Enterprise

Multi-host failover with automatic reconnect is most useful with QuestDB
Enterprise primary-replica replication.

:::

### Multiple endpoints

Specify a comma-separated address list (or repeat `addr=`):

```text
ws::addr=db-primary:9000,db-replica-1:9000,db-replica-2:9000;
```

The client picks an endpoint, connects, and walks the list to find the next
healthy peer when the current connection breaks. Duplicate `host:port`
entries are rejected at parse time.

:::tip Strongly recommend sf_dir for multi-host deployments

Without `sf_dir`, `flush()` blocks when the connection is down and the
in-memory queue fills up. After `sf_append_deadline_millis` (default 30s),
it returns an error. With `sf_dir`, `flush()` writes to disk and returns
quickly while the reconnect loop replays to the new primary in the
background. For any deployment where failover may take more than a few
seconds, `sf_dir` is strongly recommended.

:::

### Reconnect knobs

| Key | Default | Description |
|---|---|---|
| `reconnect_max_duration_millis` | 300000 | Total outage budget before giving up. |
| `reconnect_initial_backoff_millis` | 100 | First post-failure sleep. |
| `reconnect_max_backoff_millis` | 5000 | Cap on per-attempt sleep. |
| `initial_connect_retry` | `off` | Retry on first connect. Values: `off`, `on` / `true` / `sync` (synchronous retry), `async` (background retry), `false` (alias for `off`). |

By default the first connect fails fast; subsequent disconnects use the
reconnect policy. Set `initial_connect_retry=on` to apply the same policy to
the initial connect.

Once `reconnect_max_duration_millis` elapses without a successful
reconnect, the sender latches terminal: `line_sender_must_close(sender)`
(C++ `sender.must_close()`) returns `true` and subsequent `flush()` calls
fail with a "sender is terminal" error. Drop the sender and create a new
one to continue.

### Error classification

- **Authentication errors** (`401`/`403`): terminal across all endpoints. The
  reconnect loop stops immediately.
- **Role reject** (`421 + X-QuestDB-Role`): transient if the role is
  `PRIMARY_CATCHUP`, topology-level otherwise.
- **Version mismatch at upgrade**: per-endpoint, not terminal. The client
  tries the next endpoint.
- **All other errors** (TCP/TLS failures, `404`, `503`, mid-stream errors):
  transient, fed into the reconnect loop.

Connection lifecycle events are not surfaced as a structured C/C++ callback.
The default error handler writes one structured line to stderr per server
diagnostic; install your own
[handler](#handler-callback) to integrate with another logging system.

## Closing the sender

Call `line_sender_qwpws_close_drain` (C++ `sender.close_drain()`) before
freeing the sender for delivery-sensitive shutdown:

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
if (!line_sender_qwpws_close_drain(sender, &err))
    goto on_error;
line_sender_close(sender);
```

</TabItem>
<TabItem value="cpp">

```cpp
sender.close_drain();   // throws on timeout or terminal failure
// sender's destructor runs as normal
```

</TabItem>
</Tabs>

`close_drain` stops accepting new publications and waits up to
`close_flush_timeout_millis` (default 5000) for already-published frames to
ACK. Plain `line_sender_close` (C++ destructor) is best-effort and does
**not** report delivery failure, use `close_drain` whenever delivery
matters. With `sf_dir`, anything still un-acked is persisted to disk so a
later sender can replay it.

## Querying and SQL execution

The query client sends SQL over the
[QWP egress](/docs/connect/wire-protocols/qwp-egress-websocket/) endpoint
(`/read/v1`). It is a separate object from the ingestion sender — it
opens its own WebSocket and accepts the same connect-string schemas
(`ws::` / `wss::`).

A reader connects to one endpoint at a time, executes one query at a
time, and streams the result as a sequence of column-oriented batches
until the server emits a terminal frame. DDL, DML, and `SELECT` use the
same `execute()` entry point and differ only in their terminal frame.

### Quick start

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
#include <questdb/egress/line_reader.h>
#include <stdio.h>
#include <stdbool.h>

int main(void) {
    line_reader_error* err = NULL;
    line_reader* reader = NULL;
    line_reader_cursor* cursor = NULL;

    line_sender_utf8 conf = QDB_UTF8_LITERAL("ws::addr=localhost:9000;");
    reader = line_reader_from_conf(conf, &err);
    if (!reader) goto on_error;

    line_sender_utf8 sql = QDB_UTF8_LITERAL(
        "SELECT ts, symbol, price, amount FROM trades "
        "WHERE symbol = 'ETH-USD' LIMIT 100");
    cursor = line_reader_execute(reader, sql, &err);
    if (!cursor) goto on_error;

    int rc;
    while ((rc = line_reader_cursor_next_batch(cursor, &err)) == 1) {
        const size_t rows = line_reader_cursor_row_count(cursor);
        for (size_t r = 0; r < rows; ++r) {
            int64_t ts = 0;
            bool ts_null = false;
            if (!line_reader_cursor_get_i64(cursor, 0, r, &ts, &ts_null, &err))
                goto on_error;

            const char* symbol = NULL;
            size_t symbol_len = 0;
            bool symbol_null = false;
            if (!line_reader_cursor_get_symbol(
                    cursor, 1, r, &symbol, &symbol_len, &symbol_null, &err))
                goto on_error;

            double price = 0.0;
            bool price_null = false;
            if (!line_reader_cursor_get_f64(
                    cursor, 2, r, &price, &price_null, &err))
                goto on_error;

            printf("ts=%lld symbol=%.*s price=%g\n",
                (long long)ts, (int)symbol_len, symbol, price);
        }
    }
    if (rc < 0) goto on_error;

    line_reader_cursor_free(cursor);
    line_reader_close(reader);
    return 0;

on_error:;
    size_t err_len = 0;
    const char* msg = line_reader_error_msg(err, &err_len);
    fprintf(stderr, "error: %.*s\n", (int)err_len, msg);
    line_reader_error_free(err);
    if (cursor) line_reader_cursor_free(cursor);
    if (reader) line_reader_close(reader);
    return 1;
}
```

</TabItem>
<TabItem value="cpp">

```cpp
#include <questdb/egress/line_reader.hpp>
#include <iostream>

namespace qdb = questdb::egress;
using namespace questdb::ingress::literals;

int main() {
    try {
        qdb::reader reader{"ws::addr=localhost:9000;"_utf8};
        auto cur = reader.execute(
            "SELECT ts, symbol, price, amount FROM trades "
            "WHERE symbol = 'ETH-USD' LIMIT 100"_utf8);

        while (cur.next_batch()) {
            const size_t rows = cur.row_count();
            for (size_t r = 0; r < rows; ++r) {
                auto ts = cur.get_i64(0, r);
                auto symbol = cur.get_symbol(1, r);
                auto price = cur.get_f64(2, r);
                std::cout
                    << "ts=" << (ts ? std::to_string(*ts) : "NULL")
                    << " symbol=" << (symbol ? *symbol : "NULL")
                    << " price=" << (price ? std::to_string(*price) : "NULL")
                    << "\n";
            }
        }
        return 0;
    } catch (const qdb::line_reader_error& e) {
        std::cerr << "error (code " << static_cast<int>(e.code())
                  << "): " << e.what() << "\n";
        return 1;
    }
}
```

</TabItem>
</Tabs>

The four steps mirror the ingestion side:

1. Build a `reader` from a connect string.
2. Call `execute(sql)` (or `prepare(sql)` + binds + `.execute()`) to obtain a `cursor`.
3. Loop `next_batch()` until it returns `false` / `0`.
4. Read scalars and views with the typed getters during each batch.

For the full list of connect-string keys accepted by the reader (including
`target`, `zone`, `failover_*`, `compression`, and the shared TLS / auth
keys), see the
[connect string reference](/docs/connect/clients/connect-string/).

### Creating a reader

The reader uses the same connect-string format as the sender. Build it
from a literal, from `QDB_CLIENT_CONF`, or — in C — through the C ABI
directly.

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
/* From a literal. */
line_sender_utf8 conf = QDB_UTF8_LITERAL("ws::addr=localhost:9000;");
line_reader_error* err = NULL;
line_reader* reader = line_reader_from_conf(conf, &err);

/* From QDB_CLIENT_CONF (credentials out of source code). */
line_reader* reader2 = line_reader_from_env(&err);
```

</TabItem>
<TabItem value="cpp">

```cpp
namespace qdb = questdb::egress;
using namespace questdb::ingress::literals;

// From a literal.
qdb::reader reader{"ws::addr=localhost:9000;"_utf8};

// From QDB_CLIENT_CONF.
auto reader2 = qdb::reader::from_env();
```

</TabItem>
</Tabs>

Use the same `QDB_CLIENT_CONF` environment variable as the sender — both
clients parse the same connect-string grammar, so a single shared variable
works for callers that open one of each in the same process.

### Concurrency

The reader API has three handle types, each with its own thread-mobility
rule:

| Handle | Concurrent access | Mobility |
|---|---|---|
| `line_reader` / `qdb::reader` | Single-threaded. | Movable between threads with an explicit happens-before edge (mutex hand-off, thread spawn/join, release/acquire on the pointer). |
| `line_reader_query` / `qdb::query` | Single-threaded. | **Pinned** to the thread that created it. |
| `line_reader_cursor` / `qdb::cursor` | Single-threaded. | **Pinned** to the thread that created it. |
| `line_reader_error` / `qdb::line_reader_error` | Not concurrent. | Free to move. |

Concurrent operations on the same handle from two threads are always
undefined behaviour. To query in parallel, **create one reader per
thread**. Each opens its own WebSocket connection and runs one query at
a time. A reader can execute many queries sequentially; only one cursor
may be live on a reader at any given moment.

A narrow set of reader stats are exempt from the one-thread rule because
they read atomic counters: `line_reader_bytes_received`,
`line_reader_credit_granted_total`, `line_reader_read_ns`,
`line_reader_decode_ns`, `line_reader_reset_timing`. Use these (not the
`_cursor_credit_granted_total` variant) when a monitoring thread polls a
reader that another thread is actively driving.

### DDL, DML, and SELECT

`execute()` is **blocking**: it sends the query, drives the receive loop
on the calling thread, and returns a cursor that streams the response.
DDL, DML, and `SELECT` use the same entry point; they differ only in the
terminal frame the cursor delivers.

| Statement class | Terminal | `cursor.terminal_kind()` | What to read |
|---|---|---|---|
| `SELECT` | `RESULT_END` | `terminal_kind::end` | `terminal_end()` → `{final_seq, total_rows}` |
| `INSERT` / `UPDATE` / `DELETE` | `EXEC_DONE` | `terminal_kind::exec_done` | `terminal_exec_done()` → `{op_type, rows_affected}` |
| `CREATE` / `ALTER` / `DROP` / `TRUNCATE` | `EXEC_DONE` | `terminal_kind::exec_done` | `terminal_exec_done()` → `{op_type, rows_affected == 0}` |

Concrete DDL / DML example:

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
/* CREATE TABLE. The cursor delivers no batches; only the terminal frame. */
line_sender_utf8 ddl = QDB_UTF8_LITERAL(
    "CREATE TABLE IF NOT EXISTS trades ("
    " ts TIMESTAMP, symbol SYMBOL, side SYMBOL,"
    " price DOUBLE, amount DOUBLE"
    ") TIMESTAMP(ts) PARTITION BY DAY WAL");
line_reader_cursor* cursor = line_reader_execute(reader, ddl, &err);
if (!cursor) goto on_error;

/* Drain (DDL streams zero batches; the loop body never runs). */
int rc;
while ((rc = line_reader_cursor_next_batch(cursor, &err)) == 1) { /* unused */ }
if (rc < 0) goto on_error;

uint8_t op_type = 0;
uint64_t rows_affected = 0;
if (line_reader_cursor_terminal_exec_done(cursor, &op_type, &rows_affected))
    printf("DDL ok: op_type=%u rows_affected=%llu\n",
        (unsigned)op_type, (unsigned long long)rows_affected);

line_reader_cursor_free(cursor);
```

</TabItem>
<TabItem value="cpp">

```cpp
auto cur = reader.execute(
    "CREATE TABLE IF NOT EXISTS trades ("
    " ts TIMESTAMP, symbol SYMBOL, side SYMBOL,"
    " price DOUBLE, amount DOUBLE"
    ") TIMESTAMP(ts) PARTITION BY DAY WAL"_utf8);

while (cur.next_batch()) { /* DDL streams zero batches */ }

if (auto info = cur.terminal_exec_done()) {
    std::cout << "DDL ok: op_type=" << int(info->op_type)
              << " rows_affected=" << info->rows_affected << "\n";
}
```

</TabItem>
</Tabs>

`rows_affected` is the count for `INSERT` / `UPDATE` / `DELETE`. Pure DDL
reports `0`.

`EXEC_DONE` confirms the statement has been applied to the local
write-ahead log (WAL) and is visible to subsequent `SELECT`s on this
reader. The `request_durable_ack` connect-string key is **sender-only**
— it is not accepted on the reader, and reader-driven `INSERT`s
acknowledge on local-WAL commit only. If you need durable upload to
object storage for reader-side `INSERT`s, drive the inserts through the
[ingestion sender](#data-ingestion) with `request_durable_ack=on`
instead.

Sequencing operations across one reader is safe because `execute()` is
synchronous: the next statement does not start until the previous cursor
terminates and is freed.

### Parameterised queries

Use `prepare()` for SQL with `$N` placeholders. Append binds in
positional order, then call `execute()` to obtain a cursor.

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
line_sender_utf8 sql = QDB_UTF8_LITERAL(
    "SELECT ts, symbol, price, amount FROM trades "
    "WHERE symbol = $1 AND price >= $2 LIMIT 1000");

line_reader_query* query = line_reader_prepare(reader, sql, &err);
if (!query) goto on_error;

line_reader_query_bind_varchar(query, QDB_UTF8_LITERAL("ETH-USD"));
line_reader_query_bind_f64(query, 2500.0);

line_reader_cursor* cursor = line_reader_query_execute(&query, &err);
/* `query` is now NULL — line_reader_query_execute consumes it. */
if (!cursor) goto on_error;
```

</TabItem>
<TabItem value="cpp">

```cpp
auto cur = reader
    .prepare(
        "SELECT ts, symbol, price, amount FROM trades "
        "WHERE symbol = $1 AND price >= $2 LIMIT 1000"_utf8)
    .bind_varchar("ETH-USD"_utf8)
    .bind_f64(2500.0)
    .execute();
```

</TabItem>
</Tabs>

Binds are positional: the first `bind_*` call fills `$1`, the second
fills `$2`, and so on. The number of binds must match the number of
placeholders; mismatches surface from `execute()` as
`line_reader_error_invalid_bind`.

Most binds are infallible at the call site — they only mutate the
in-process query buffer. The single exception is `bind_varchar`, which
re-validates UTF-8 and silently freezes the builder on invalid bytes; the
deferred error surfaces from `execute()` as
`line_reader_error_invalid_utf8`. To recover, drop the query and rebuild.

#### Bind parameter types

The C ABI exposes a separate function per QuestDB type; the C++ wrapper
exposes the same surface as `query::bind_*` methods returning `query&`
for chaining. Every QuestDB column type that can appear in a `$N`
placeholder has a setter:

| QuestDB type | C function | C++ method |
|---|---|---|
| `BOOLEAN` | `line_reader_query_bind_bool` | `query.bind_bool(value)` |
| `BYTE` (i8) | `line_reader_query_bind_i8` | `query.bind_i8(value)` |
| `SHORT` (i16) | `line_reader_query_bind_i16` | `query.bind_i16(value)` |
| `INT` (i32) | `line_reader_query_bind_i32` | `query.bind_i32(value)` |
| `LONG` (i64) | `line_reader_query_bind_i64` | `query.bind_i64(value)` |
| `FLOAT` (f32) | `line_reader_query_bind_f32` | `query.bind_f32(value)` |
| `DOUBLE` (f64) | `line_reader_query_bind_f64` | `query.bind_f64(value)` |
| `CHAR` | `line_reader_query_bind_char` | `query.bind_char(code_unit)` |
| `VARCHAR` | `line_reader_query_bind_varchar` | `query.bind_varchar(utf8_view)` |
| `BINARY` | `line_reader_query_bind_binary` | `query.bind_binary(buf, len)` |
| `UUID` | `line_reader_query_bind_uuid` | `query.bind_uuid(std::array<uint8_t, 16>)` |
| `LONG256` | `line_reader_query_bind_long256` | `query.bind_long256(std::array<uint8_t, 32>)` |
| `IPv4` | `line_reader_query_bind_ipv4` | `query.bind_ipv4(host_order_u32)` |
| `TIMESTAMP` (μs) | `line_reader_query_bind_timestamp_micros` | `query.bind_timestamp_micros(micros)` |
| `TIMESTAMP_NS` (ns) | `line_reader_query_bind_timestamp_nanos` | `query.bind_timestamp_nanos(nanos)` |
| `DATE` (ms) | `line_reader_query_bind_date_millis` | `query.bind_date_millis(millis)` |
| `DECIMAL64` | `line_reader_query_bind_decimal64` | `query.bind_decimal64(mantissa, scale)` |
| `DECIMAL128` | `line_reader_query_bind_decimal128` | `query.bind_decimal128(lo, hi, scale)` |
| `DECIMAL256` | `line_reader_query_bind_decimal256` | `query.bind_decimal256(std::array<uint8_t, 32>, scale)` |
| `GEOHASH` | `line_reader_query_bind_geohash` | `query.bind_geohash(value, precision_bits)` |
| `SYMBOL` | use `bind_varchar` (the server narrows VARCHAR → SYMBOL on schema match) | use `bind_varchar` |

`SYMBOL` reuses `bind_varchar` because the QWP bind framing carries
UTF-8 text; the server resolves to a symbol value on the receiving side.

:::caution DECIMAL128 mantissa sign

`bind_decimal128` splits the two's-complement i128 mantissa into a
`uint64_t mantissa_lo` (low 64 bits) and an `int64_t mantissa_hi`
(upper 64 bits). The high limb **must** be passed as `int64_t` so the
sign extends correctly into the full i128 — passing `uint64_t` zero-
extends and silently corrupts every negative value. For example,
i128 `-1` is `(mantissa_lo = UINT64_MAX, mantissa_hi = -1)`. The C++
overload takes `int64_t` directly, so calling it with a literal works
without further care.

:::

The following column types have no `bind_*` variant — they can appear in
result columns but not in `$N` placeholders:

| Type | Why no bind | Workaround |
|---|---|---|
| `DOUBLE[]` / `LONG[]` (arrays) | The QWP `ARGS` frame carries scalar binds only; shape and stride metadata have no wire encoding. | Emit array literals directly in SQL, or filter by an extracted element (`bids[1][1] >= $1`). |
| `INTERVAL` | Not yet exposed as a bind type. | Bind the boundary as a `TIMESTAMP` / `TIMESTAMP_NS` instead. |

#### Binding NULL

Bind a typed NULL with `bind_null` for the simple kinds, or with the
dedicated `bind_null_*` variants for kinds that carry metadata (column
scale on decimals, precision on geohash). Index drift is the failure
mode to avoid: NULL still consumes one positional slot.

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
line_reader_query_bind_null(query, line_reader_column_kind_long);     /* $1 = NULL LONG */
line_reader_query_bind_null_varchar(query);                            /* $2 = NULL VARCHAR */
line_reader_query_bind_null_decimal64(query, /*scale=*/4);             /* $3 = NULL DECIMAL64 */
line_reader_query_bind_null_geohash(query, /*precision_bits=*/20);     /* $4 = NULL GEOHASH */
```

</TabItem>
<TabItem value="cpp">

```cpp
query
    .bind_null(qdb::column_kind::long_)
    .bind_null_varchar()
    .bind_null_decimal64(/*scale=*/4)
    .bind_null_geohash(/*precision_bits=*/20);
```

</TabItem>
</Tabs>

`bind_null_*` variants exist for `varchar`, `binary`, `decimal64`,
`decimal128`, `decimal256`, and `geohash`. Every other kind goes through
the generic `bind_null(kind)`.

### Reading result batches

`next_batch()` returns `true` / `1` when a batch is available, `false` /
`0` when the stream has terminated, and the C function returns `-1` on
error (with `*err_out` set). Inspect `row_count()`, `column_count()`,
`column_kind(col_idx)`, and `column_name(col_idx)` to drive the typed
getters.

Pointers and views returned by the cursor (`column_name`, `get_varchar`,
`get_symbol`, `get_binary`, array views, validity bitmaps) borrow from
the currently-loaded batch and are invalidated by `next_batch()`,
`cancel()`, `add_credit()`, or freeing the cursor. **Copy out any values
you need beyond the current batch.**

Batches are decoded column-major: each column's values live in one
contiguous buffer. When porting from a PostgreSQL or ODBC row cursor,
prefer iterating the outer loop over columns and the inner loop over
rows — sequential access through each column buffer is cache-friendly,
and you can pull `column_validity(col)` once and vectorise null
handling instead of branching cell-by-cell. Row-major iteration (outer
over rows) is correct but jumps between per-column buffers on every
cell, so reach for it only when downstream shape (CSV, JSON) forces it.

#### Column getters

Every QuestDB column type has a dedicated getter:

| QuestDB type | C function | C++ method | Return shape (C++) |
|---|---|---|---|
| `BOOLEAN` | `line_reader_cursor_get_bool` | `cursor.get_bool(col, row)` | `nullable<bool>` |
| `BYTE` (i8) | `line_reader_cursor_get_i8` | `cursor.get_i8(col, row)` | `nullable<int8_t>` |
| `SHORT` (i16) | `line_reader_cursor_get_i16` | `cursor.get_i16(col, row)` | `nullable<int16_t>` |
| `INT` (i32) | `line_reader_cursor_get_i32` | `cursor.get_i32(col, row)` | `nullable<int32_t>` |
| `LONG`, `TIMESTAMP` (μs), `TIMESTAMP_NS` (ns), `DATE` (ms) | `line_reader_cursor_get_i64` | `cursor.get_i64(col, row)` | `nullable<int64_t>` |
| `FLOAT` (f32) | `line_reader_cursor_get_f32` | `cursor.get_f32(col, row)` | `nullable<float>` |
| `DOUBLE` (f64) | `line_reader_cursor_get_f64` | `cursor.get_f64(col, row)` | `nullable<double>` |
| `CHAR` (UTF-16 code unit) | `line_reader_cursor_get_char` | `cursor.get_char(col, row)` | `nullable<uint16_t>` |
| `VARCHAR` | `line_reader_cursor_get_varchar` | `cursor.get_varchar(col, row)` | `nullable<std::string_view>` |
| `SYMBOL` | `line_reader_cursor_get_symbol` | `cursor.get_symbol(col, row)` | `nullable<std::string_view>` |
| `BINARY` | `line_reader_cursor_get_binary` | `cursor.get_binary(col, row)` | `nullable<binary_view>` |
| `UUID` | `line_reader_cursor_get_uuid` | `cursor.get_uuid(col, row)` | `nullable<std::array<uint8_t, 16>>` |
| `LONG256` | `line_reader_cursor_get_long256` | `cursor.get_long256(col, row)` | `nullable<std::array<uint8_t, 32>>` |
| `IPv4` | `line_reader_cursor_get_ipv4` | `cursor.get_ipv4(col, row)` | `nullable<uint32_t>` |
| `GEOHASH` | `line_reader_cursor_get_geohash` | `cursor.get_geohash(col, row)` | `nullable<geohash>` (value + `precision_bits`) |
| `DECIMAL64` | `line_reader_cursor_get_decimal64` | `cursor.get_decimal64(col, row)` | `nullable<decimal64>` (mantissa + `scale`) |
| `DECIMAL128` | `line_reader_cursor_get_decimal128` | `cursor.get_decimal128(col, row)` | `nullable<decimal128>` (`low`, `high`, `scale`) |
| `DECIMAL256` | `line_reader_cursor_get_decimal256` | `cursor.get_decimal256(col, row)` | `nullable<decimal256>` (32 bytes + `scale`) |
| `DOUBLE[]` row | `line_reader_cursor_get_double_array` | `cursor.get_double_array(col, row)` | `nullable<double_array_view>` |
| `DOUBLE[]` element | `line_reader_cursor_get_double_array_element` | `cursor.get_double_array_element(col, row, flat_idx)` | `nullable<double>` |
| `LONG[]` row | `line_reader_cursor_get_long_array` | `cursor.get_long_array(col, row)` | `nullable<long_array_view>` |
| `LONG[]` element | `line_reader_cursor_get_long_array_element` | `cursor.get_long_array_element(col, row, flat_idx)` | `nullable<int64_t>` |
| Null bitmap (all kinds) | `line_reader_cursor_column_validity` | `cursor.column_validity(col)` | `validity_view` (LSB-first; bit `1` = null) |

`get_i64` is the single accessor for all 64-bit temporal kinds —
disambiguate units by calling `column_kind(col)` and treating the value
as μs / ns / ms accordingly.

`get_i32` rejects `IPv4` columns (status `invalid_api_call`); use
`get_ipv4` for those, otherwise an address ≥ `128.0.0.0` would silently
flip sign through the signed 32-bit getter.

`column_validity` exposes the raw LSB-first null bitmap when you want
to vectorise null handling across a column instead of calling
`get_*` cell-by-cell. The pointer is borrowed for the current batch.

#### Reading NULLs

C ABI: every `get_*` writes its `out_is_null` flag separately from the
value pointer. Always branch on `out_is_null` before consuming
`*out_value` — a default-zero `int64_t` or empty `string_view` is a
valid value, not a NULL marker.

```c
int64_t price_micros = 0;
bool is_null = false;
if (!line_reader_cursor_get_i64(cursor, 0, r, &price_micros, &is_null, &err))
    goto on_error;
if (is_null) {
    /* SQL NULL. Skip, sentinel, error — your call. */
} else {
    /* Real value. */
}
```

C++ wrapper: every `get_*` returns `std::optional<T>` (`nullable<T>`),
empty for NULL cells.

```cpp
if (auto price = cur.get_f64(col, r))
    process(*price);
else
    handle_null();
```

#### Reading arrays

`DOUBLE[]` and `LONG[]` rows return a borrowed view containing `shape`
(row-major, innermost dimension last), `ndim`, `data` (concatenated
little-endian element bytes), `data_len`, and `element_count`. Use the
`_element` accessor when you want one cell at a flat row-major index;
the wrapper does the little-endian decode for you.

A NULL row sets `is_null` to true and zeroes the view. A non-null row
whose shape produces zero elements (e.g. `[2, 0, 3]`) leaves
`is_null = false` but writes `data == NULL`, `data_len == 0`. The C++
wrapper's `view.element(flat_idx)` returns a NULL sentinel
(`quiet_NaN()` for doubles, `INT64_MIN` for longs) in either case so a
single branch handles both.

Arrays require QuestDB 9.0.0 or later — older servers reject the QWP
encoding outright with `unsupported_server`.

### Flow control: credit

By default the server streams as fast as the network allows. Set
`initial_credit(bytes)` on the query to apply byte-credit flow control:
the server pauses after the configured byte budget is exhausted and the
client tops it up by calling `add_credit(more_bytes)` after each batch
is processed. `0` is the sentinel for "unbounded".

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
line_reader_query* query = line_reader_prepare(reader, sql, &err);
if (!query) goto on_error;
line_reader_query_initial_credit(query, 256 * 1024);  /* 256 KiB */
line_reader_cursor* cursor = line_reader_query_execute(&query, &err);

while ((rc = line_reader_cursor_next_batch(cursor, &err)) == 1) {
    /* ... read the batch ... */
    if (!line_reader_cursor_add_credit(cursor, 256 * 1024, &err))
        goto on_error;
}
```

</TabItem>
<TabItem value="cpp">

```cpp
auto cur = reader
    .prepare(sql)
    .initial_credit(256 * 1024)
    .execute();

while (cur.next_batch()) {
    // ... read the batch ...
    cur.add_credit(256 * 1024);
}
```

</TabItem>
</Tabs>

Inspect `line_reader_credit_granted_total(reader)` (or
`reader.credit_granted_total()`) from a monitoring thread to track
cumulative credit issued on a connection.

### Cancelling an in-flight query

There are two ways to stop a stream early:

- **`cancel()`** (C: `line_reader_cursor_cancel`) — sends `CANCEL`,
  drains pending frames until the server's terminal reply, and **surfaces
  any transport errors** through `err_out` / an exception. Use this when
  you need to know whether the cancellation completed cleanly — for
  example before reusing the reader from a critical path, or when the
  cancel is itself observable to the application.
- **Free the cursor** (C: `line_reader_cursor_free`; C++ destructor) —
  best-effort: sends `CANCEL`, then tears down the WebSocket bounded by a
  short internal timeout. Transport errors during teardown are
  **swallowed**. Use this when you don't care about clean closure (e.g.
  the process is shutting down anyway).

Either way, after the cursor is gone the reader is ready for the next
`execute()`.

### Server info and connection state

Once the reader (or cursor) is connected, `server_info()` exposes the
last-seen QWP `SERVER_INFO` frame:

```cpp
if (auto info = reader.server_info()) {
    std::cout << "role=" << int(info.role())
              << " epoch=" << info.epoch()
              << " cluster=" << info.cluster_id()
              << " node=" << info.node_id() << "\n";
}
```

`role` is one of `standalone`, `primary`, `replica`, `primary_catchup`,
or `other` (use `role_byte()` for unknown values). `epoch` is monotonic
across failover/role transitions. `current_host()` / `current_port()`
return the endpoint currently in use.

The reader's getters reject while a cursor is live — they read non-atomic
state the cursor thread may mutate. Use the cursor-scoped equivalents
(`cursor.server_info()`, `cursor.current_host()`, `cursor.current_port()`,
`cursor.server_version()`) instead, or release the cursor first.

### Failover and high availability

:::note Enterprise

Multi-host failover is most useful with QuestDB Enterprise primary-replica
replication. A single-node deployment can configure the connect string
the same way, but failover only kicks in when there is a second healthy
endpoint to try.

:::

#### Multiple endpoints and routing

Pass a comma-separated address list:

```text
wss::addr=db-primary:9000,db-replica-1:9000,db-replica-2:9000;
```

`target` filters by `SERVER_INFO.role`:

| Value | Endpoints accepted |
|---|---|
| `any` (default) | Any role. |
| `primary` | `PRIMARY`, `PRIMARY_CATCHUP`, or `STANDALONE`. |
| `replica` | `REPLICA` only. |

`zone=<id>` biases endpoint selection toward same-zone hosts (Enterprise).

#### Per-query failover loop

When the connection breaks mid-stream, the cursor reconnects to another
endpoint and replays the query from the start. The loop is bounded:

| Key | Default | Description |
|---|---|---|
| `failover` | `on` | Master switch. `failover=off` disables per-query reconnect. |
| `failover_max_attempts` | `8` | Cap on reconnect attempts per `execute()`. |
| `failover_backoff_initial_ms` | `50` | First post-failure sleep. |
| `failover_backoff_max_ms` | `1000` | Cap on per-attempt sleep. |
| `failover_max_duration_ms` | `30000` | Total wall-clock budget per `execute()`. |
| `auth_timeout_ms` | `15000` | Per-host HTTP upgrade timeout. |

When the budget is exhausted, `next_batch()` (or `execute()`) surfaces a
terminal error — typically `socket_error`, `handshake_error`, or
`role_mismatch`. Free the cursor; the reader is then available for the
next `execute()`. There is **no continuous reconnect** spanning idle
periods between queries — each `execute()` starts its own failover budget.

:::warning Failover requires multiple endpoints

The failover loop rotates across the `addr=` list. With a single address
there is no other host to try, and the budget collapses after one
attempt regardless of `failover_max_attempts`. Provide at least two
addresses for failover to be useful.

:::

#### Mid-stream failover hazard: duplicate rows

**Read this before deploying a long-running cursor against a failover-
enabled connect string.**

When mid-stream failover fires, the server replays the query from the
beginning. **Any rows the application has already consumed will be
delivered again on the new connection.** Without explicit recovery, an
aggregation, fan-out, or downstream writer sees duplicates.

The library does **not** silently discard the replayed rows. Instead, it
gives the application a choice via either the `on_failover_reset` or the
`on_failover_progress` callback — installing either one clears the
silent-duplicate guard:

- **Wire a callback.** The trampoline fires on the cursor's thread,
  before any replayed batch arrives. Discard the partial state you've
  accumulated. Replay then proceeds transparently. Use
  `on_failover_reset` for the reset-only signal, or
  `on_failover_progress` (see [Failover progress
  phases](#failover-progress-phases)) for the full lifecycle —
  disconnect, per-retry, reset, gave-up.
- **Don't wire a callback, and don't want replay.** The cursor surfaces
  the next `next_batch()` (or `execute()`) call as
  `line_reader_error_failover_would_duplicate` and terminates instead of
  double-delivering. The application can then re-execute the query from
  scratch.

Initial-connect failover (before any batch has been yielded) is always
transparent and ignores the callback — no rows are consumed yet, so
there is nothing to duplicate.

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
static void on_failover_reset(
        const line_reader_failover_event* ev,
        void* user_data)
{
    /* `user_data` is your accumulator; clear it before replay. */
    struct row_buf* buf = (struct row_buf*)user_data;
    row_buf_clear(buf);

    /* Diagnostics only — must NOT call back into reader / query / cursor. */
    const char* new_host = NULL;
    size_t new_host_len = 0;
    line_reader_failover_event_new_host(ev, &new_host, &new_host_len);
    fprintf(stderr,
        "failover -> %.*s:%u after %u attempts\n",
        (int)new_host_len, new_host,
        (unsigned)line_reader_failover_event_new_port(ev),
        (unsigned)line_reader_failover_event_attempts(ev));
}

line_reader_query* query = line_reader_prepare(reader, sql, &err);
line_reader_query_on_failover_reset(query, on_failover_reset, &my_buf);
line_reader_cursor* cursor = line_reader_query_execute(&query, &err);
```

</TabItem>
<TabItem value="cpp">

```cpp
std::vector<row> accumulator;

auto cur = reader
    .prepare(sql)
    .on_failover_reset([&](const qdb::failover_event_view& ev) {
        accumulator.clear();  // discard partial result; replay incoming
        std::cerr
            << "failover -> " << ev.new_host() << ":" << ev.new_port()
            << " after " << ev.attempts() << " attempts\n";
    })
    .execute();
```

</TabItem>
</Tabs>

The callback runs synchronously on the cursor's drive thread. It **must
not** call back into the originating reader, query, or cursor (including
read-only stat getters — they read state the trampoline is mid-mutation
on); must not throw or `longjmp` across the C boundary (an escaping
unwind aborts the C++ trampoline); and must not block, because while it
runs no batch is being read and no credit is being granted to the
server.

#### Failover event fields

The `failover_event` passed to the callback carries:

| C++ accessor | C function | Meaning |
|---|---|---|
| `failed_host()` / `failed_port()` | `line_reader_failover_event_failed_host` / `_port` | The previously-connected endpoint that failed. |
| `new_host()` / `new_port()` | `line_reader_failover_event_new_host` / `_port` | The endpoint the cursor is now connected to. |
| `new_request_id()` | `line_reader_failover_event_new_request_id` | Server-assigned request ID on the new connection. |
| `attempts()` | `line_reader_failover_event_attempts` | Number of reconnect attempts that preceded this success (1 = first retry). |
| `elapsed_ns()` | `line_reader_failover_event_elapsed_ns` | Wall-clock nanoseconds spent reconnecting (sleep + dial + handshake + `SERVER_INFO`). |
| `trigger_code()` | `line_reader_failover_event_trigger_code` | `line_reader_error_code` that triggered the failover. |
| `trigger_msg()` | `line_reader_failover_event_trigger_msg` | Human-readable message for the trigger. |
| `server_info()` | `line_reader_failover_event_server_info` | `SERVER_INFO` of the new endpoint (empty on v1 servers). |

Outside the callback, `cursor.failover_resets()` reports the cumulative
number of successful resets observed by this cursor since `execute()`.

#### Failover progress phases

`on_failover_reset` only fires on a successful reconnect. For full
connection-lifecycle visibility — outage observed, per-retry telemetry,
reset, retry budget exhausted — install an `on_failover_progress`
callback instead (or in addition). The same callback fires for every
phase; route on the phase discriminant:

| Phase (C / C++) | When it fires | Fields populated beyond the always-set ones |
|---|---|---|
| `line_reader_failover_phase_disconnected` / `failover_phase::disconnected` | Once, immediately after the cursor's connection drops — **before** any retry. Lets observers alert on "QuestDB unreachable now" instead of retroactively when reconnect lands. | None. `attempt` is `0`. |
| `line_reader_failover_phase_retrying` / `failover_phase::retrying` | Once per outer-loop iteration, **after** the inter-attempt backoff sleep and immediately before the dial. | `attempt` is `1`-based for the about-to-be-tried dial. `elapsed_ns` already includes backoff cost. |
| `line_reader_failover_phase_reset` / `failover_phase::reset` | A reconnect succeeded; replayed batches will start arriving next. Fires immediately **before** the `on_failover_reset` callback (when both are installed) so a single sink sees the lifecycle in order. | `new_host` / `new_port`, `new_request_id`, `server_info` (empty on v1 servers). `attempt` is the dial that landed. |
| `line_reader_failover_phase_gave_up` / `failover_phase::gave_up` | The retry budget is exhausted; the cursor is terminal. The same error will surface on the next `next_batch()` / `add_credit()` call. | `final_error_code` / `final_error_msg`. `attempt` is the total number of dials burned (may be `0` if the wall-clock deadline was already exhausted). |

Always-set fields (every phase): `failed_host` / `failed_port` (the
endpoint that died), `trigger_code` / `trigger_msg` (the original
cause-of-death, preserved across phases), `elapsed_ns` (wall-clock since
the disconnect was observed, monotonically non-decreasing across phases
of the same lifecycle), and `attempt` (per-phase semantics above).

Accessor surface:

| C++ accessor | C function | Notes |
|---|---|---|
| `phase()` | `line_reader_failover_progress_event_phase` | Discriminant. |
| `failed_host()` / `failed_port()` | `line_reader_failover_progress_event_failed_host` / `_failed_port` | Always set. |
| `new_host()` / `new_port()` | `line_reader_failover_progress_event_new_host` / `_new_port` | Empty / `0` outside `Reset`. |
| `new_request_id()` → `std::optional<int64_t>` | `line_reader_failover_progress_event_new_request_id` (returns `bool`) | `nullopt` / `false` outside `Reset`. |
| `attempt()` | `line_reader_failover_progress_event_attempt` | Per-phase semantics, see table. |
| `trigger_code()` / `trigger_msg()` | `line_reader_failover_progress_event_trigger_code` / `_trigger_msg` | Always set; preserved across phases. |
| `elapsed_ns()` | `line_reader_failover_progress_event_elapsed_ns` | Wall-clock since disconnect. Saturating, monotonic. |
| `server_info()` | `line_reader_failover_progress_event_server_info` | Non-NULL only on `Reset`, v2+ servers. |
| `final_error_code()` → `std::optional<error_code>` | `line_reader_failover_progress_event_final_error_code` (returns `bool`) | Populated only on `GaveUp`. |
| `final_error_msg()` | `line_reader_failover_progress_event_final_error_msg` (returns `bool`) | Populated only on `GaveUp`. |

Installing `on_failover_progress` also clears the silent-duplicate
guard documented under [Mid-stream failover
hazard](#mid-stream-failover-hazard-duplicate-rows) — same as
`on_failover_reset`. If you only want telemetry and not replay
semantics, set `failover=off` in the connect string instead.

The reentrancy contract is identical to `on_failover_reset`: the
callback runs synchronously on the cursor's drive thread, **must not**
call back into the originating reader / query / cursor (including
read-only stat getters), **must not** throw or `longjmp` across the C
boundary (an escaping unwind aborts the process), and **must not**
block — while it runs, no batch is being read and the failover loop
cannot make progress.

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
static void on_failover_progress(
        const line_reader_failover_progress_event* ev,
        void* user_data)
{
    const char* failed_host = NULL;
    size_t failed_host_len = 0;
    line_reader_failover_progress_event_failed_host(
        ev, &failed_host, &failed_host_len);
    const uint16_t failed_port =
        line_reader_failover_progress_event_failed_port(ev);
    const uint64_t elapsed_ns =
        line_reader_failover_progress_event_elapsed_ns(ev);

    switch (line_reader_failover_progress_event_phase(ev)) {
    case line_reader_failover_phase_disconnected:
        fprintf(stderr, "failover: disconnected from %.*s:%u\n",
            (int)failed_host_len, failed_host, (unsigned)failed_port);
        break;
    case line_reader_failover_phase_retrying:
        fprintf(stderr, "failover: retry #%u after %llu ns\n",
            (unsigned)line_reader_failover_progress_event_attempt(ev),
            (unsigned long long)elapsed_ns);
        break;
    case line_reader_failover_phase_reset: {
        const char* new_host = NULL;
        size_t new_host_len = 0;
        line_reader_failover_progress_event_new_host(
            ev, &new_host, &new_host_len);
        fprintf(stderr,
            "failover: reset -> %.*s:%u after %u attempts (%llu ns)\n",
            (int)new_host_len, new_host,
            (unsigned)line_reader_failover_progress_event_new_port(ev),
            (unsigned)line_reader_failover_progress_event_attempt(ev),
            (unsigned long long)elapsed_ns);
        break;
    }
    case line_reader_failover_phase_gave_up: {
        const char* msg = NULL;
        size_t msg_len = 0;
        line_reader_failover_progress_event_final_error_msg(
            ev, &msg, &msg_len);
        fprintf(stderr,
            "failover: gave up after %u attempts: %.*s\n",
            (unsigned)line_reader_failover_progress_event_attempt(ev),
            (int)msg_len, msg);
        break;
    }
    }
}

line_reader_query* query = line_reader_prepare(reader, sql, &err);
line_reader_query_on_failover_progress(query, on_failover_progress, NULL);
line_reader_cursor* cursor = line_reader_query_execute(&query, &err);
```

</TabItem>
<TabItem value="cpp">

```cpp
auto cur = reader
    .prepare(sql)
    .on_failover_progress([&](const qdb::failover_progress_event_view& ev) {
        switch (ev.phase()) {
        case qdb::failover_phase::disconnected:
            std::cerr << "failover: disconnected from "
                      << ev.failed_host() << ":" << ev.failed_port() << "\n";
            break;
        case qdb::failover_phase::retrying:
            std::cerr << "failover: retry #" << ev.attempt()
                      << " after " << ev.elapsed_ns() << " ns\n";
            break;
        case qdb::failover_phase::reset:
            std::cerr << "failover: reset -> "
                      << ev.new_host() << ":" << ev.new_port()
                      << " after " << ev.attempt() << " attempts ("
                      << ev.elapsed_ns() << " ns)\n";
            break;
        case qdb::failover_phase::gave_up:
            std::cerr << "failover: gave up after " << ev.attempt()
                      << " attempts: " << ev.final_error_msg() << "\n";
            break;
        }
    })
    .execute();
```

</TabItem>
</Tabs>

`on_failover_progress` and `on_failover_reset` coexist: when both are
installed, the `Reset` phase fires immediately before the reset
callback so a single observer sees the whole lifecycle in order. Pick
whichever shape fits your sink — phased event stream vs. one-shot
reset hook — or install both.

#### Connection-state observability

For mid-query connection lifecycle, install `on_failover_progress`
(above): it surfaces `Disconnected` (on outage), `Retrying` (per dial
attempt), `Reset` (reconnect succeeded), and `GaveUp` (budget
exhausted) as structured events on the cursor's drive thread.

What remains polling-based:

- **Initial-connect failures** (before `execute()` returns): no
  progress callback fires — `line_reader_from_conf` or
  `line_reader_execute` itself fails. Inspect the host / port the
  reader settled on with `current_host()` / `current_port()` once
  `execute()` returns a cursor.
- **Between queries**, while no cursor is live, the reader holds no
  connection in the foreground, so there is nothing to observe. Poll
  `reader.current_host()` / `reader.current_port()` (or
  `reader.server_info().epoch()`) between successive `execute()` calls
  for "endpoint changed" or "topology rotated" signals.

### Error handling

Every reader / query / cursor entry point that can fail returns a
NULL/false / `-1` on error and writes an opaque `line_reader_error*`
through its `err_out` parameter. The C++ wrapper throws
`questdb::egress::line_reader_error` (derived from `std::runtime_error`)
with the same code and message.

`line_reader_error_get_code(err)` returns one of:

| Code | Meaning | Typical recovery |
|---|---|---|
| `could_not_resolve_addr` | Bad URL, host, or interface in the connect string. | Fix the connect string. |
| `config_error` | Connect-string syntax or unknown key. | Fix the connect string. |
| `invalid_api_call` | Wrong-order or wrong-state call (e.g. `execute` while a cursor is live, type-mismatched `get_*`). | Bug in the application; fix the call site. |
| `socket_error` | TCP / WS read / write / close failure. | Per-query failover handles it transparently if `failover=on` and multiple `addr=` entries are configured; otherwise rebuild the reader. |
| `tls_error` | TLS handshake failure. | Inspect cert chain; verify `tls_roots` / `tls_ca`. |
| `handshake_error` | HTTP upgrade or WebSocket handshake failed. | Often a version or compression mismatch; check the server release. |
| `auth_error` | `401`/`403` from the upgrade response. | Re-mint the credential; auth failures are terminal across all endpoints — failover does not retry them. |
| `unsupported_server` | Server advertises a QWP version, encoding, or capability the client cannot use. | Align client and server versions; disable optional encodings. |
| `role_mismatch` | All endpoints connected but none matched `target=`. | Loosen `target` or fix the topology. |
| `protocol_error` | Wire-format violation: bad magic, truncated frame, bad varint. | Rebuild the reader; report a bug if it recurs against an in-sync server. |
| `invalid_utf8` | Connect string, SQL, or `bind_varchar` value contained invalid UTF-8. | Re-encode the input. |
| `invalid_bind` | Bind count, index, or value rejected client-side (including timestamp / decimal / geohash range failures). | Fix the bind. |
| `server_schema_mismatch` | Server-reported `SCHEMA_MISMATCH` (`0x03`). | Fix bind types or SQL. |
| `server_parse_error` | Server-reported `PARSE_ERROR` (`0x05`). | Fix SQL. |
| `server_internal_error` | Server-reported `INTERNAL_ERROR` (`0x06`). | Inspect server logs; retry with backoff. |
| `server_security_error` | Server-reported `SECURITY_ERROR` (`0x08`). | Permission denied; check role / grants. |
| `server_limit_exceeded` | Server-reported `LIMIT_EXCEEDED` (`0x0B`). | Reduce result size or raise the server limit. |
| `limit_exceeded` | Client-side limit hit (e.g. array row exceeds per-row element cap). | Reduce row size. |
| `cancelled` | Local `cancel()` or server `CANCELLED` (`0x0A`). | Expected after `cancel()`. |
| `failover_would_duplicate` | Mid-query failover would replay rows the application has already consumed, and no `on_failover_reset` callback was installed. | See [Mid-stream failover hazard](#mid-stream-failover-hazard-duplicate-rows). Either wire a callback and discard partial state, or re-execute the query from scratch. |

Once any of the `server_*` codes surface, the cursor is terminated; free
it and (typically) reuse the reader for the next `execute()`. For
`auth_error`, `unsupported_server`, `tls_error`, and `role_mismatch`,
rebuild the reader from scratch — these are not transient.

#### Error object fields

A production error handler usually wants more than the code and the
text. The following fields are everything you need to log a structured
event, decide what to retry, and assemble a bug report:

| Field | C++ accessor | C function | Notes — stability / PII / scope |
|---|---|---|---|
| Code | `e.code()` | `line_reader_error_get_code(err)` | `line_reader_error_code` discriminant. **Stable across releases** — the right field to dispatch on. For server-originated codes the discriminant embeds the QWP status byte (e.g. `server_parse_error = 0x05`). Safe to forward as-is. |
| Message | `e.what()` | `line_reader_error_msg(err, &len)` | UTF-8 diagnostic. **Not null-terminated** in C — read exactly `len` bytes; pointer is owned by the error and stays valid until `line_reader_error_free`. Server messages mirror QuestDB's normal SQL error formatting (capped at the QWP error-message limit, currently 1 KiB); client-synthesised messages cover transport / handshake / bind validation. **Not stable across server versions** — never pattern-match. **May contain PII / secrets**: it can echo offending bind values or server-supplied close reasons — log at the input's trust level and sanitise before forwarding to external trackers. |
| Cursor request ID | `cursor.request_id()` | `line_reader_cursor_request_id` | Server-assigned request ID for the current connection. Refreshes on failover. Safe to forward. |
| Batch request ID | `cursor.batch_request_id()` | `line_reader_cursor_batch_request_id` | Request ID stamped on the most recently decoded batch (may differ from `request_id()` for already-buffered frames mid-failover). Safe to forward. |
| Failover resets | `cursor.failover_resets()` | `line_reader_cursor_failover_resets` | Cumulative successful mid-stream resets since `execute()`. A non-zero value next to a duplicate-row complaint tells you replay happened. Safe to forward. |
| Current endpoint | `cursor.current_host()` / `cursor.current_port()` | `line_reader_cursor_current_addr_host` / `_port` | Endpoint the cursor was attached to when the error fired. Safe to forward. |
| Client identifier | (connect-string `client_id=` value) | (same) | Opaque label echoed by QuestDB as `X-QWP-Client-Id`. Set this in production so support can correlate sessions. Safe to forward. |

The protocol does not currently surface a server-issued request or
connection identifier in the WebSocket upgrade response. When opening a
bug report, supply the connection start time (from your application
logs), the `client_id=` value, and the cursor tuple
`(request_id, batch_request_id, failover_resets, current_host, current_port)`
— that is the closest you can get to a server-side correlation handle
today.

### Reader authentication and TLS

The reader and the sender share the same authentication and TLS
configuration grammar — see [Authentication and TLS](#authentication-and-tls)
above for the full table of `tls_ca` / `tls_roots` / `tls_verify` values.
In brief:

- **HTTP basic auth**: `username=...;password=...;`.
- **Bearer token (Enterprise)**: `token=...;`. Sent as
  `Authorization: Bearer <token>` on the WebSocket upgrade.
- **TLS**: switch to `wss::`. Select root certificates with `tls_ca`
  (`webpki_roots`, `os_roots`, `webpki_and_os_roots`) or
  `tls_roots=/path/to/ca.pem`. `tls_roots_password` unlocks JKS / PKCS#12
  keystores.

The reader applies the same restrictions as the sender:

| Path | Status | Workaround |
|---|---|---|
| OIDC token acquisition or in-band refresh | Not supported by this client. There is no IdP integration and no callback to refresh a token mid-session. | QuestDB itself supports OIDC — see [OpenID Connect](/docs/security/oidc/). Acquire an access token out-of-band from your IdP, pass it via `token=...`, and rebuild the reader when the token nears expiry. |
| Mutual TLS (client certificates) | Not supported. The QuestDB server does not negotiate client certificates. | Use bearer-token auth over `wss://`. See the connect-string reference's [TLS section](/docs/connect/clients/connect-string/#tls). |
| Token rotation mid-session | Not supported. The token is presented once during the WebSocket upgrade and is not re-sent. | On token expiry, free the reader and build a fresh one with the new token. The cursor (and any open query) must be freed first. |

### Enterprise example: TLS, token auth, multi-host failover

A production read path typically combines all three. The reader uses the
same connect-string grammar as the sender — drop `sf_*` keys (they are
sender-only) and configure failover instead:

```text
wss::addr=db-primary:9000,db-replica-1:9000,db-replica-2:9000;
     token=eyJhbGciOi...;
     target=primary;
     failover_max_attempts=10;
     failover_max_duration_ms=60000;
     compression=auto;
     tls_ca=os_roots;
     client_id=quote-server;
```

<Tabs defaultValue="c" values={[
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
]}>
<TabItem value="c">

```c
line_sender_utf8 conf = QDB_UTF8_LITERAL(
    "wss::addr=db-primary:9000,db-replica-1:9000,db-replica-2:9000;"
    "token=eyJhbGciOi...;"
    "target=primary;"
    "failover_max_attempts=10;"
    "failover_max_duration_ms=60000;"
    "compression=auto;"
    "tls_ca=os_roots;"
    "client_id=quote-server;");
line_reader_error* err = NULL;
line_reader* reader = line_reader_from_conf(conf, &err);
```

</TabItem>
<TabItem value="cpp">

```cpp
qdb::reader reader{
    "wss::addr=db-primary:9000,db-replica-1:9000,db-replica-2:9000;"
    "token=eyJhbGciOi...;"
    "target=primary;"
    "failover_max_attempts=10;"
    "failover_max_duration_ms=60000;"
    "compression=auto;"
    "tls_ca=os_roots;"
    "client_id=quote-server;"_utf8};
```

</TabItem>
</Tabs>

`client_id` is opaque to the server but appears in QuestDB's connection
logs as `X-QWP-Client-Id` — include it in bug reports to help support
correlate sessions.

## Configuration reference

For the full list of connect-string keys and their defaults, see the
[connect string reference](/docs/connect/clients/connect-string/).

Common WebSocket-specific options accepted by the **ingestion sender**:

| Key | Default | Description |
|---|---|---|
| `addr` | required | One or more `host:port` entries, comma-separated or repeated. |
| `username` / `password` | unset | HTTP basic auth. |
| `token` | unset | Bearer token auth (Enterprise). |
| `auth_timeout_ms` | 15000 | WebSocket upgrade timeout (milliseconds). `auth_timeout` is also accepted. |
| `tls_ca` / `tls_roots` / `tls_verify` | `webpki_roots` | TLS configuration (`wss` only). |
| `auto_flush` | required `off` if set | Auto-flush is not supported. `auto_flush_rows` and `auto_flush_bytes` are rejected. |
| `sf_dir` | unset | Enable disk-backed store-and-forward. |
| `sender_id` | `default` | SF slot identity. |
| `sf_durability` | `memory` | Only `memory` is currently accepted. |
| `request_durable_ack` | `off` | Wait for durable upload before ACK (Enterprise). |
| `reconnect_max_duration_millis` | 300000 | Per-outage reconnect budget. |
| `initial_connect_retry` | `off` | Apply reconnect policy to the first connect. |
| `close_flush_timeout_millis` | 5000 | Bound on `close_drain` wait. |
| `qwp_ws_progress` | `background` | `background` or `manual`. |
| `max_in_flight` | 128 | Max unacknowledged frames in flight on a connection. Acts as the backpressure window: publishers block locally once the window is full. |

Common WebSocket-specific options accepted by the **query reader**:

| Key | Default | Description |
|---|---|---|
| `addr` | required | One or more `host:port` entries, comma-separated or repeated. |
| `username` / `password` | unset | HTTP basic auth. |
| `token` | unset | Bearer token auth (Enterprise). |
| `auth_timeout_ms` | 15000 | Per-host HTTP upgrade timeout (milliseconds). |
| `tls_ca` / `tls_roots` / `tls_verify` / `tls_roots_password` | `webpki_roots` | TLS configuration (`wss` only). |
| `target` | `any` | Endpoint role filter: `any`, `primary`, `replica`. |
| `zone` | unset | Zone-aware routing hint (Enterprise). |
| `failover` | `on` | Master switch for per-query reconnect. |
| `failover_max_attempts` | `8` | Cap on reconnect attempts per `execute()`. |
| `failover_backoff_initial_ms` | `50` | First post-failure sleep. |
| `failover_backoff_max_ms` | `1000` | Cap on per-attempt sleep. |
| `failover_max_duration_ms` | `30000` | Total wall-clock budget per `execute()`. |
| `compression` | `raw` | `raw` / `zstd` / `auto`. `zstd` and `auto` require the `compression-zstd` build feature. |
| `compression_level` | `1` | Advertised zstd level. Server clamps to `[1, 9]`. |
| `max_batch_rows` | server default | Hint passed in `X-QWP-Max-Batch-Rows`. `0` (or unset) defers to the server. |
| `client_id` | unset | Opaque identifier echoed in server logs as `X-QWP-Client-Id`. |
| `path` | `/read/v1` | Endpoint path. Rarely changed. |
| `max_version` | `2` | Highest QWP version the reader advertises. |

## Migration from ILP (HTTP/TCP)

The buffer API is unchanged. To switch a sender to QWP/WebSocket:

| Aspect | HTTP (ILP) | WebSocket (QWP) |
|---|---|---|
| Connect string schema | `http::` / `https::` | `ws::` / `wss::` (`qwpws::` / `qwpwss::` aliases) |
| Batch trigger | Row/time-based auto-flush (defaults: 75000 rows, 1000 ms) | Explicit `flush()` only |
| Error model | Synchronous on `flush()` | Async via `line_sender_qwpws_poll_error` / handler |
| Completion tracking | Implicit per request | Explicit FSN watermarks |
| Store-and-forward | Not available | Available (`sf_dir`) |
| Multi-endpoint failover | Not available | Built in (comma-separated `addr`) |
| Shutdown | `line_sender_close` | `line_sender_qwpws_close_drain`, then `line_sender_close` |
| Querying SQL from the same library | Not available | `line_reader_*` (C) / `questdb::egress::reader` (C++) — see [Querying and SQL execution](#querying-and-sql-execution) |

To migrate, change the connect string from `http::` to `ws::` (or
`https::` to `wss::`), drop any `auto_flush_*` keys, install a
`line_sender_opts_qwpws_error_handler` (C) / `qwp_ws_error_handler` (C++)
callback or poll `line_sender_qwpws_poll_error`, and call
`line_sender_qwpws_close_drain` before closing the sender.

## Full example: multi-host ingestion with failover

This example shows a production ingestion loop with store-and-forward,
multi-host failover, and proper error handling including the retry pattern
around `flush()`.

```c
#include <questdb/ingress/line_sender.h>
#include <stdio.h>
#include <string.h>

static void on_qwp_error(
        void* user_data,
        const line_sender_qwpws_error_view* ev)
{
    (void)user_data;
    fprintf(stderr,
        "qwp error: category=%d policy=%d msg=%.*s\n",
        (int)ev->category, (int)ev->applied_policy,
        (int)ev->message_len, ev->message);
}

int main(void) {
    line_sender_error* err = NULL;
    line_sender* sender = NULL;
    line_sender_buffer* buffer = NULL;

    /* Multi-host with store-and-forward for failover durability.
     * Without sf_dir, flush() blocks during an outage and times out
     * after sf_append_deadline_millis (default 30s). With sf_dir,
     * flush() writes to disk and returns quickly while the reconnect
     * loop replays to the new primary in the background. */
    line_sender_utf8 conf = QDB_UTF8_LITERAL(
        "wss::addr=db-primary:9000,db-replica:9000;"
        "token=your_bearer_token;"
        "sf_dir=/var/lib/myapp/qdb-sf;"
        "sender_id=ingest-1;"
        "reconnect_max_duration_millis=300000;");
    sender = line_sender_from_conf(conf, &err);
    if (!sender) goto on_error;

    buffer = line_sender_buffer_new_for_sender(sender);

    line_sender_table_name tbl = QDB_TABLE_NAME_LITERAL("book");
    line_sender_column_name ticker_name = QDB_COLUMN_NAME_LITERAL("ticker");
    line_sender_column_name price_name = QDB_COLUMN_NAME_LITERAL("price");
    line_sender_column_name size_name = QDB_COLUMN_NAME_LITERAL("size");
    line_sender_utf8 ticker_val = QDB_UTF8_LITERAL("EURUSD");

    for (;;) {
        /* Only encode a fresh row when the previous batch has been flushed.
         * On flush() failure, the rows stay buffered for the next attempt. */
        if (line_sender_buffer_row_count(buffer) == 0) {
            if (!line_sender_buffer_table(buffer, tbl, &err)) goto on_error;
            if (!line_sender_buffer_symbol(buffer, ticker_name, ticker_val, &err))
                goto on_error;
            if (!line_sender_buffer_column_f64(buffer, price_name, 1.0842, &err))
                goto on_error;
            if (!line_sender_buffer_column_f64(buffer, size_name, 100000.0, &err))
                goto on_error;
            if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err))
                goto on_error;
        }

        /* flush() can still return an error if the SF queue fills to
         * sf_max_total_bytes during a prolonged outage. On success the
         * buffer is cleared; on failure it is retained so the next
         * iteration retries the same payload. */
        if (!line_sender_flush(sender, buffer, &err)) {
            size_t err_len = 0;
            const char* msg = line_sender_error_msg(err, &err_len);
            fprintf(stderr, "flush error: %.*s\n", (int)err_len, msg);
            line_sender_error_free(err);
            err = NULL;

            /* Check if the sender is terminal (auth failure, reconnect
             * budget exhausted). If so, recreate it. */
            if (line_sender_must_close(sender)) {
                fprintf(stderr, "sender is terminal, exiting\n");
                break;
            }
        }

        /* Pace the loop as appropriate for your workload. */
    }

    if (!line_sender_qwpws_close_drain(sender, &err)) goto on_error;
    line_sender_buffer_free(buffer);
    line_sender_close(sender);
    return 0;

on_error:;
    size_t err_len = 0;
    const char* msg = line_sender_error_msg(err, &err_len);
    fprintf(stderr, "error: %.*s\n", (int)err_len, msg);
    line_sender_error_free(err);
    if (buffer) line_sender_buffer_free(buffer);
    if (sender) line_sender_close(sender);
    return 1;
}
```

## Next steps

The header files are extensively commented and serve as the canonical API
reference. Browse them on GitHub or in your local checkout:

- Ingestion C: [`include/questdb/ingress/line_sender.h`](https://github.com/questdb/c-questdb-client/blob/main/include/questdb/ingress/line_sender.h)
- Ingestion C++: [`include/questdb/ingress/line_sender.hpp`](https://github.com/questdb/c-questdb-client/blob/main/include/questdb/ingress/line_sender.hpp)
- Query C: [`include/questdb/egress/line_reader.h`](https://github.com/questdb/c-questdb-client/blob/main/include/questdb/egress/line_reader.h)
- Query C++: [`include/questdb/egress/line_reader.hpp`](https://github.com/questdb/c-questdb-client/blob/main/include/questdb/egress/line_reader.hpp)

For SQL execution from C/C++, the [Querying and SQL execution](#querying-and-sql-execution)
section covers the QWP reader. Alternatives outside this library are the
[PGWire C++ client](/docs/connect/compatibility/pgwire/c-and-cpp/) and the
[REST API](/docs/connect/compatibility/rest-api/).

With data flowing into QuestDB, the next step is querying. See the
[Query overview](/docs/query/overview/) to learn QuestDB SQL.

Need help? Visit the
[Community Forum](https://community.questdb.com/).
