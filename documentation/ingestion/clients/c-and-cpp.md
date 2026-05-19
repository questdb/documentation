---
slug: /connect/clients/c-and-cpp
title: C & C++ client for QuestDB
sidebar_label: C & C++
description: "QuestDB C and C++ client for high-throughput data ingestion over the QWP binary protocol (WebSocket)."
---

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"
import SfDedupWarning from "../../partials/_sf-dedup-warning.partial.mdx"

The QuestDB C and C++ client connects to QuestDB over the
[QWP — QuestDB Wire Protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/) — a
columnar binary protocol carried over WebSocket. The library is implemented in Rust
and exposes both a C11 ABI and a C++17 header-only wrapper from a single
shared/static library. Both APIs support high-throughput, column-oriented batched
writes with automatic table creation, schema evolution, multi-host failover, and
optional store-and-forward durability.

:::tip Transports

QWP/WebSocket (`ws::` / `wss::`) is the current default ingest path and the
focus of this page. The same library also supports the legacy ILP transports
(`http::` / `https::` / `tcp::` / `tcps::`) and QWP over UDP for trusted
high-throughput networks. For ILP transport details, see the
[ILP overview](/docs/connect/compatibility/ilp/overview/).

:::

:::info

This page focuses on ingestion. For querying QuestDB from C/C++, use the
[PGWire C++ client](/docs/connect/compatibility/pgwire/c-and-cpp/) or the
[REST API](/docs/connect/compatibility/rest-api/).

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
size (`line_sender_buffer_size(buffer)`) exceeds a threshold.

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
application logs), the client's `X-QWP-Client-Id` header value (if your
application sets one), and the `(message_sequence, from_fsn, to_fsn)` triple.

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

## Configuration reference

For the full list of connect-string keys and their defaults, see the
[connect string reference](/docs/connect/clients/connect-string/).

Common WebSocket-specific options:

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

- C: [`include/questdb/ingress/line_sender.h`](https://github.com/questdb/c-questdb-client/blob/main/include/questdb/ingress/line_sender.h)
- C++: [`include/questdb/ingress/line_sender.hpp`](https://github.com/questdb/c-questdb-client/blob/main/include/questdb/ingress/line_sender.hpp)

For querying QuestDB from C/C++, see the
[PGWire C++ client](/docs/connect/compatibility/pgwire/c-and-cpp/) or the
[REST API](/docs/connect/compatibility/rest-api/).

With data flowing into QuestDB, the next step is querying. See the
[Query overview](/docs/query/overview/) to learn QuestDB SQL.

Need help? Visit the
[Community Forum](https://community.questdb.com/).
