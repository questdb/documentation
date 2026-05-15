---
slug: /connect/clients/rust
title: Rust client for QuestDB
sidebar_label: Rust
description: "QuestDB Rust client for high-throughput data ingestion over the QWP binary protocol (WebSocket)."
---

The QuestDB Rust client connects to QuestDB over the
[QWP binary protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/) (WebSocket).
It supports high-throughput, column-oriented batched writes with automatic table
creation, schema evolution, multi-host failover, and optional store-and-forward
durability.

:::tip Legacy transports

The client also supports ILP ingestion over HTTP and TCP for backward
compatibility. This page documents the recommended WebSocket (QWP) path. For
ILP transport details, see the
[ILP overview](/docs/connect/compatibility/ilp/overview/).

:::

:::info

This page focuses on ingestion. For querying QuestDB from Rust, see the
[PGWire Rust client](/docs/connect/compatibility/pgwire/rust/) or the
[REST API](/docs/connect/compatibility/rest-api/).

:::

## Quick start

Add the dependency:

```bash
cargo add questdb-rs
```

Then ingest data:

```rust
use questdb::{
    Result,
    ingress::{Sender, TimestampNanos},
};

fn main() -> Result<()> {
    let mut sender = Sender::from_conf("ws::addr=localhost:9000;")?;
    let mut buffer = sender.new_buffer();
    buffer
        .table("trades")?
        .symbol("symbol", "ETH-USD")?
        .symbol("side", "sell")?
        .column_f64("price", 2615.54)?
        .column_f64("amount", 0.00044)?
        .at(TimestampNanos::now())?;
    sender.flush(&mut buffer)?;
    sender.close_drain()?;
    Ok(())
}
```

The four steps are:

1. Get a `Sender` via `Sender::from_conf` or the builder.
2. Populate a `Buffer` with one or more rows.
3. Call `sender.flush(&mut buffer)` to publish.
4. Call `sender.close_drain()` before the sender is dropped so already-published
   frames complete on the wire.

## Authentication and TLS

Authentication happens at the HTTP level during the WebSocket upgrade, before
any binary frames are exchanged.

### HTTP basic auth

```rust
let mut sender = Sender::from_conf(
    "wss::addr=db.example.com:9000;username=admin;password=quest;"
)?;
```

### Token auth (Enterprise)

```rust
let mut sender = Sender::from_conf(
    "wss::addr=db.example.com:9000;token=your_bearer_token;"
)?;
```

For OIDC authentication, see [OpenID Connect](/docs/security/oidc/).

### TLS

Use the `wss` schema for TLS. Select where root certificates come from with
`tls_ca`:

```text
wss::addr=db.example.com:9000;tls_ca=webpki_roots;
```

Supported values:

| Key | Description |
|-----|-------------|
| `tls_ca=webpki_roots` | Use the [`webpki-roots`](https://crates.io/crates/webpki-roots) crate. |
| `tls_ca=os_roots` | Use the OS certificate store. |
| `tls_ca=webpki_and_os_roots` | Combine both. |
| `tls_roots=/path/to/root-ca.pem` | Load roots from a PEM file. Useful for self-signed certs during testing. |
| `tls_verify=unsafe_off` | Disable verification. Never use in production. |

### Authentication timeout

`auth_timeout_ms` (default 15000) controls how long the client waits for the
WebSocket upgrade to complete. `auth_timeout` is also accepted for
compatibility with the HTTP transport's spelling.

## Creating the client

### From a connect string

The connect string format is `<schema>::<key>=<value>;<key>=<value>;...`

```rust
let mut sender = Sender::from_conf("ws::addr=localhost:9000;")?;
```

Use `ws` (plain) or `wss` (TLS). `qwpws` / `qwpwss` are accepted as aliases.
The default port is `9000`.

For the full list of connect-string keys, see the
[connect string reference](/docs/connect/clients/connect-string/).

### From an environment variable

Set `QDB_CLIENT_CONF` to keep credentials out of source code:

```bash
export QDB_CLIENT_CONF="wss::addr=db.example.com:9000;username=admin;password=quest;"
```

```rust
let mut sender = Sender::from_env()?;
```

### Using the builder API

The builder lets you configure programmatically:

```rust
use questdb::ingress::{Protocol, SenderBuilder, QwpWsProgress};
use std::time::Duration;

let mut sender = SenderBuilder::new(Protocol::QwpWs, "localhost", 9000)
    .qwp_ws_progress(QwpWsProgress::Background)?
    .reconnect_max_duration(Duration::from_secs(300))?
    .qwp_ws_error_handler(|err| {
        eprintln!("QWP error: {err:?}");
    })?
    .build()?;
```

Most QWP/WebSocket settings are configured through the connect string. The
builder exposes typed setters for the most common runtime knobs: error handler,
progress mode, reconnect timing, and `initial_connect_retry`.

## Data ingestion

### General usage pattern

1. Call `buffer.table(name)?` to select a table.
2. Call column methods to add values:
   - `symbol(name, value)`
   - `column_bool(name, value)`
   - `column_i64(name, value)`
   - `column_f64(name, value)`
   - `column_str(name, value)`
   - `column_ts(name, timestamp)`
   - `column_arr(name, ...)` for arrays
   - `column_dec(name, ...)` for decimals
   - `_opt` variants (e.g. `column_f64_opt`) for `Option<T>` ergonomics
3. Call `at(timestamp)?` or `at_now()?` to finalize the row.
4. Repeat from step 1, or call `sender.flush(&mut buffer)?` to send.

Tables and columns are created automatically if they do not exist.

For the full column method reference, see the
[crate docs](https://docs.rs/questdb-rs/latest/questdb/ingress/struct.Buffer.html).

### Ingest arrays

`Buffer::column_arr` accepts native Rust arrays/slices/vectors (up to 3D) and
[`ndarray`](https://docs.rs/ndarray) arrays for higher dimensions:

```rust
use questdb::{Result, ingress::{Sender, TimestampNanos}};
use ndarray::arr2;

fn main() -> Result<()> {
    let mut sender = Sender::from_conf("ws::addr=127.0.0.1:9000;")?;
    let mut buffer = sender.new_buffer();
    buffer
        .table("fx_order_book")?
        .symbol("symbol", "EUR/USD")?
        .column_arr("bids", &vec![
            vec![1.0850, 600000.0],
            vec![1.0849, 300000.0],
            vec![1.0848, 150000.0]])?
        .column_arr("asks", &arr2(&[
            [1.0853, 500000.0],
            [1.0854, 250000.0],
            [1.0855, 125000.0]]).view())?
        .at(TimestampNanos::now())?;
    sender.flush(&mut buffer)?;
    sender.close_drain()?;
    Ok(())
}
```

Array ingestion requires QuestDB 9.0.0 or later. The QWP/WebSocket transport
negotiates protocol support automatically.

### Decimal columns

:::caution

Decimal ingestion requires QuestDB 9.2.0 or later. Pre-create decimal columns
with `DECIMAL(precision, scale)` so the server enforces the expected precision.
See the
[decimal data type](/docs/query/datatypes/decimal/#creating-tables-with-decimals)
page.

:::

`Buffer::column_dec` accepts string slices,
[`rust_decimal`](https://docs.rs/rust_decimal), and
[`bigdecimal`](https://docs.rs/bigdecimal) values.

### Designated timestamp

The [designated timestamp](/docs/concepts/designated-timestamp/) column
controls time-based partitioning and ordering. Two ways to set it:

**User-assigned** (recommended for deduplication and exactly-once delivery):

```rust
use questdb::ingress::{TimestampMicros, TimestampNanos};

// Microsecond precision creates a standard TIMESTAMP column.
buffer
    .table("trades")?
    .column_f64("price", 1.0842)?
    .at(TimestampMicros::now())?;

// Nanosecond precision creates a timestamp_ns column.
buffer
    .table("ticks")?
    .column_f64("price", 1.0842)?
    .at(TimestampNanos::now())?;
```

**Server-assigned** (server uses its wall-clock time):

```rust
buffer.table("trades")?.column_f64("price", 1.0842)?.at_now()?;
```

`at_now()` removes the ability to deduplicate rows. Prefer explicit timestamps
for production ingestion. See
[Delivery semantics](/docs/concepts/delivery-semantics/) for why
server-assigned timestamps defeat exactly-once outcomes.

:::note

QuestDB works best when data arrives in chronological order (sorted by
timestamp).

:::

## Flushing

The sender and buffer are decoupled. Buffered rows are not on the wire until
you call `sender.flush(&mut buffer)`.

:::caution No auto-flush

The Rust client does not implement auto-flushing for QWP/WebSocket. You must
call `flush()` explicitly. Connect-string keys `auto_flush_rows` and
`auto_flush_bytes` are rejected; the only accepted value is `auto_flush=off`.

A common pattern is to flush periodically on a timer and/or when the buffer
size (via `buffer.len()`) exceeds a threshold.

:::

`flush()` clears the buffer after publishing. Use `flush_and_keep()` to retain
contents (for example, to fan the same buffer out to multiple senders).

On QWP/WebSocket, `flush()` returns once the buffer is accepted by the local
replay queue, before the server acknowledges it. Server errors observed later
are reported asynchronously (see
[Asynchronous error handling](#asynchronous-error-handling)).

### FSN-based completion

Every published frame is assigned a frame sequence number (FSN). To wait until
the server has acknowledged a specific frame:

```rust
use std::time::Duration;

let fsn = sender.flush_and_get_fsn(&mut buffer)?;
if let Some(fsn) = fsn {
    let acked = sender.await_acked_fsn(fsn, Duration::from_secs(10))?;
    if !acked {
        eprintln!("timed out waiting for server ACK");
    }
}
```

Related accessors:

| Method | Returns |
|--------|---------|
| `flush_and_get_fsn(&mut buf)` | Highest FSN published by this call. `None` if the buffer was empty. |
| `flush_and_keep_and_get_fsn(&buf)` | Same, but keeps the buffer. |
| `published_fsn()` | Highest FSN published locally. |
| `acked_fsn()` | Highest FSN completed (server ACK or reject-and-continue). |
| `await_acked_fsn(fsn, timeout)` | Block until `acked_fsn()` reaches `fsn`, or the timeout elapses. |

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

### SF tuning keys

| Key | Default | Description |
|-----|---------|-------------|
| `sf_dir` | unset | Enables disk-backed SF when set. |
| `sender_id` | `default` | Slot identity. Allowed chars: `A-Za-z0-9_-`. Use distinct ids per sender process. |
| `sf_max_bytes` | 4 MiB | Per-segment size cap. |
| `sf_max_total_bytes` | 128 MiB (memory) / 10 GiB (disk) | Cap on total queued bytes. |
| `sf_durability` | `memory` | `memory`, `flush`, or `append` (strongest). |
| `sf_append_deadline_millis` | 30000 | Per-append wait budget in `append` mode. |
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

```rust
while let Some(err) = sender.poll_qwp_ws_error()? {
    eprintln!(
        "category={:?} policy={:?} status={:?} fsn=[{}..={}] msg={:?}",
        err.category,
        err.applied_policy,
        err.status,
        err.from_fsn,
        err.to_fsn,
        err.message,
    );
}
```

### Handler callback

Install a handler on the builder. It runs synchronously from sender API calls
such as `flush()`. The handler must not call back into the same sender.

```rust
use questdb::ingress::{Protocol, SenderBuilder};

let mut sender = SenderBuilder::new(Protocol::QwpWs, "localhost", 9000)
    .qwp_ws_error_handler(|err| {
        eprintln!("QWP error: {err:?}");
    })?
    .build()?;
```

### `QwpWsSenderError` fields

| Field | Meaning |
|-------|---------|
| `category` | `SchemaMismatch`, `ParseError`, `InternalError`, `SecurityError`, `WriteError`, `ProtocolViolation`, `Unknown`. |
| `applied_policy` | `DropAndContinue` (batch dropped, sender continues) or `Halt` (sender latched terminal). |
| `status` | Raw QWP status byte. `None` for WebSocket protocol violations. |
| `message` | Human-readable error text from the server or the close reason. |
| `message_sequence` | Server's per-frame QWP message sequence. |
| `from_fsn` / `to_fsn` | Inclusive FSN span of the affected frame(s). |

`Sender::qwp_ws_errors_dropped()` reports how many diagnostics were lost
because the bounded log overflowed (typically due to a lagging poll cursor).

After a `Halt` policy fires, the sender is terminal. Drop it and create a new
one. `Sender::must_close()` reports whether the sender has entered a terminal
state.

`DropAndContinue` errors do not halt the sender. The affected batch is
discarded; subsequent frames are unaffected and the I/O loop keeps running.

## Progress modes

The client drives the WebSocket loop in one of two modes:

| Mode | Behaviour |
|------|-----------|
| `QwpWsProgress::Background` (default) | A sender-owned thread sends frames, receives ACKs, reconnects, and replays. Right choice for most callers. |
| `QwpWsProgress::Manual` | No background thread. The caller drives progress with `Sender::drive_once()` or `Sender::await_acked_fsn()`. |

```rust
use questdb::ingress::{Protocol, SenderBuilder, QwpWsProgress};

let mut sender = SenderBuilder::new(Protocol::QwpWs, "localhost", 9000)
    .qwp_ws_progress(QwpWsProgress::Manual)?
    .build()?;

loop {
    // ... publish frames ...
    sender.flush(&mut buffer)?;
    // Drive until idle so the I/O loop catches up.
    while sender.drive_once()? {}
}
```

`drive_once()` performs at most one unit of work per call (send one frame,
drain ready responses, do one storage-maintenance step). Call it in a loop
until it returns `false` before parking.

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
healthy peer when the current connection breaks.

### Reconnect knobs

| Key | Default | Description |
|-----|---------|-------------|
| `reconnect_max_duration_millis` | 300000 | Total outage budget before giving up. |
| `reconnect_initial_backoff_millis` | 100 | First post-failure sleep. |
| `reconnect_max_backoff_millis` | 5000 | Cap on per-attempt sleep. |
| `initial_connect_retry` | `off` | Retry on first connect. Values: `off`, `on` / `true` / `sync` (synchronous retry), `async` (background retry), `false` (alias for `off`). |

By default the first connect fails fast; subsequent disconnects use the
reconnect policy. Set `initial_connect_retry=on` to apply the same policy to
the initial connect.

The Rust client is zone-blind on ingress: the `zone=` key is accepted but
ignored, so connect strings shared with future zone-aware egress clients work
unchanged.

The Rust client does not currently expose connection-state event callbacks
(the equivalent of Java's `SenderConnectionListener`). Connection lifecycle is
observable through `log` crate output and through error notifications
delivered to the polling API or the `qwp_ws_error_handler` callback.

### Error classification

- **Authentication errors** (`401`/`403`): terminal across all endpoints. The
  reconnect loop stops immediately.
- **Role reject** (`421 + X-QuestDB-Role`): transient if the role is
  `PRIMARY_CATCHUP`, topology-level otherwise.
- **Version mismatch at upgrade**: per-endpoint, not terminal. The client
  tries the next endpoint.
- **All other errors** (TCP/TLS failures, `404`, `503`, mid-stream errors):
  transient, fed into the reconnect loop.

## Closing the sender

Call `Sender::close_drain()` before dropping the sender:

```rust
sender.close_drain()?;
drop(sender);
```

`close_drain()` stops accepting new publications and waits up to
`close_flush_timeout_millis` (default 5000) for already-published frames to
ACK. Dropping the sender without `close_drain` may discard unacknowledged
in-memory frames; SF mode persists them to disk so a later sender can replay
them.

## Configuration reference

For the full list of connect-string keys and their defaults, see the
[connect string reference](/docs/connect/clients/connect-string/).

Common WebSocket-specific options:

| Key | Default | Description |
|-----|---------|-------------|
| `addr` | required | One or more `host:port` entries. |
| `username` / `password` | unset | HTTP basic auth. |
| `token` | unset | Bearer token auth (Enterprise). |
| `auth_timeout_ms` | 15000 | WebSocket upgrade timeout. |
| `tls_ca` / `tls_roots` / `tls_verify` | webpki | TLS configuration (`wss`/`qwpwss` only). |
| `auto_flush` | required `off` if set | Auto-flush is not supported. `auto_flush_rows` and `auto_flush_bytes` are rejected. |
| `sf_dir` | unset | Enable disk-backed store-and-forward. |
| `sender_id` | `default` | SF slot identity. |
| `sf_durability` | `memory` | `memory`, `flush`, or `append`. |
| `request_durable_ack` | `off` | Wait for durable upload before ACK (Enterprise). |
| `reconnect_max_duration_millis` | 300000 | Per-outage reconnect budget. |
| `initial_connect_retry` | `off` | Apply reconnect policy to the first connect. |
| `close_flush_timeout_millis` | 5000 | Bound on `close_drain` wait. |
| `qwp_ws_progress` | `background` | `background` or `manual`. |
| `max_in_flight` | 128 | Max unacknowledged frames in flight on a connection. Acts as the backpressure window: publishers block locally once the window is full. |

## Crate features

The QuestDB Rust client uses Cargo features to gate optional dependencies and
transports.

### Default-enabled features

- `sync-sender`: enables all sync sender transports (TCP, HTTP, QWP/UDP,
  QWP/WebSocket).
- `tls-webpki-certs`: TLS verification using `webpki-roots`.
- `ring-crypto`: TLS crypto via the `ring` crate.

### Optional features

- `sync-sender-qwp-ws`: QWP/WebSocket transport only (subset of `sync-sender`).
- `chrono_timestamp`: build timestamps from `chrono::DateTime`.
- `ndarray`: ingest arrays from the [ndarray](https://docs.rs/ndarray) crate.
- `rust_decimal` / `bigdecimal`: ingest decimals from those crates.
- `tls-native-certs`: validate TLS against the OS certificate store.
- `insecure-skip-verify`: disable TLS verification (testing only).

## Migration from ILP (HTTP/TCP)

The buffer API is unchanged. To switch a sender to QWP/WebSocket:

| Aspect | HTTP (ILP) | WebSocket (QWP) |
|--------|-----------|-----------------|
| Connect string schema | `http::` / `https::` | `ws::` / `wss::` |
| Batch trigger | Row/time-based auto-flush (defaults: 75000 rows, 1000 ms) | Explicit `flush()` only |
| Error model | Synchronous on `flush()` | Async via `poll_qwp_ws_error` / handler |
| Completion tracking | Implicit per request | Explicit FSN watermarks |
| Store-and-forward | Not available | Available (`sf_dir`) |
| Multi-endpoint failover | Not available | Built in (comma-separated `addr`) |
| Shutdown | `drop` | `close_drain()` then `drop` |

To migrate an existing sender, change the connect string from `http::` to
`ws::` (or `https::` to `wss::`), drop any `auto_flush_*` keys, install a
`qwp_ws_error_handler` or poll `poll_qwp_ws_error()`, and call `close_drain()`
before dropping the sender.

## Next steps

Explore the full API on the
[crate docs](https://docs.rs/questdb-rs/latest/questdb/ingress/).

For querying QuestDB from Rust, see the
[PGWire Rust client](/docs/connect/compatibility/pgwire/rust/) or the
[REST API](/docs/connect/compatibility/rest-api/).

With data flowing into QuestDB, the next step is querying. See the
[Query overview](/docs/query/overview/) to learn QuestDB SQL.

Need help? Visit the
[Community Forum](https://community.questdb.com/).
