---
title: Store-and-forward configuration
sidebar_label: Configuration
description:
  Connect-string keys that configure the QuestDB store-and-forward client
  substrate — storage, reconnect, durable-ack, and error-handling.
---

This page is the configuration reference for the SF connect-string keys.
For the model behind each knob, read
[Concepts](/docs/high-availability/store-and-forward/concepts/); for
operational guidance read
[Operating and tuning](/docs/high-availability/store-and-forward/operating-and-tuning/).

Shared keys (authentication, TLS, address list) are documented on the
[connect-string reference](/docs/connect/clients/connect-string).
The keys below are the SF-specific subset.

## Storage keys

These keys select between memory mode and SF mode and govern on-disk
layout. The single switch is `sf_dir`: unset → memory mode, set → SF
mode.

| Key | Type | Default | Description |
|---|---|---|---|
| `sf_dir` | path | unset | Group root directory. When set, the slot lives at `<sf_dir>/<sender_id>/` and unacked data is durable across process restarts. When unset, the substrate runs in memory mode. |
| `sender_id` | string | `default` | Slot subdirectory name. Two senders sharing the same `sender_id` and `sf_dir` will collide on the slot lock. Must not contain path separators or be empty. |
| `sf_max_segment_bytes` | size | `4M` | Per-segment file size; rotation threshold. |
| `sf_max_total_bytes` | size | `128M` (memory) / `10G` (SF) | Capacity for producer backpressure. Node.js disk journals can exceed this target for transaction completion and symbol dictionaries; provision [additional disk headroom](/docs/connect/clients/nodejs/#store-and-forward). Without `sf_dir`, this caps the memory replay queue. |
| `sf_durability` | enum | `memory` | `memory` relies on the page cache; `periodic` checkpoints in the background and requires `sf_dir`. Node.js also supports `append`, which makes each journal append durable before `flush()` resolves. Go and .NET accept only `memory`; other clients reject `append` at build time. `flush` is not supported. |
| `sf_sync_interval_millis` | int (ms) | `5000` | Checkpoint cadence for `sf_durability=periodic`; rejected without it. A floor, not a guarantee: scheduler and storage latency add to it. |
| `sf_append_deadline_millis` | int (ms) | `30000` | How long a producer `appendBlocking` call waits for ACK-driven trim to free space before throwing. |
| `drain_orphans` | bool | `off` | Scan `<sf_dir>/*` at startup and spawn drainers for sibling slots that contain unacked data. See [orphan adoption](/docs/high-availability/store-and-forward/concepts/#orphan-adoption). |
| `max_background_drainers` | int | `4` | Cap on concurrent orphan drainers. |

Size values accept integer bytes or unit suffixes (`K`, `M`, `G`, `T`)
using binary multipliers.

These keys are also documented on the central
[connect-string reference](/docs/connect/clients/connect-string#sf-keys).

## Reconnect keys

Govern the in-flight reconnect loop after the wire breaks. Backoff math
and host-walk semantics are documented in
[Client failover concepts](/docs/high-availability/client-failover/concepts/).

| Key | Type | Default | Description |
|---|---|---|---|
| `reconnect_max_duration_millis` | int (ms) | `300000` (5 min) | Bounds the blocking sync initial connect only (`initial_connect_retry=on`/`sync`). A running sender's reconnect loop never consults it and retries indefinitely. Exception: a Node.js sender with neither `sf_dir` nor `initial_connect_retry=async` applies it to every outage; see [the Node.js client](/docs/connect/clients/nodejs/#ingestion-reconnect). |
| `reconnect_initial_backoff_millis` | int (ms) | `100` | Initial backoff sleep at round exhaustion. |
| `reconnect_max_backoff_millis` | int (ms) | `5000` | Cap on the exponential backoff. With equal-jitter the actual sleep lands in `[max, 2·max)`. |
| `initial_connect_retry` | enum | `off` | `off` (alias `false`): first-connect failure is terminal. `on` (aliases `sync`, `true`): same retry loop as reconnect, blocking the constructor. `async`: same retry loop in the I/O thread, non-blocking. |
| `close_flush_timeout_millis` | int (ms) | `60000` on Java and .NET; `5000` on Rust, C, C++, Python and Node.js | `close()` blocks up to this long waiting for `ackedFsn ≥ publishedFsn`. `0` or `-1` skips the drain wait. The safety-net `checkError()` still runs. |

Cross-reference:
[connect-string #reconnect-keys](/docs/connect/clients/connect-string#reconnect-keys).

## Durable-ack keys

Opt in to object-store-durable trim. See
[Durable-ack: when to opt in](/docs/high-availability/store-and-forward/when-to-use/#durable-ack-when-to-opt-in).

| Key | Type | Default | Description |
|---|---|---|---|
| `request_durable_ack` | bool | `off` | Opt-in via the upgrade header `X-QWP-Request-Durable-Ack: true`. Trim is then driven by `STATUS_DURABLE_ACK` frames only; OK frames no longer advance the trim watermark. A missing `X-QWP-Durable-Ack: enabled` echo is terminal except for [Node.js background retries](/docs/connect/clients/nodejs/#durable-acknowledgement). WebSocket transports only. |
| `durable_ack_keepalive_interval_millis` | int (ms) | `200` | Cadence of WebSocket PING the I/O loop sends while there are pending durable confirmations and the producer is idle. `0` or negative disables. |

## Error-handling keys

| Key | Type | Default | Description |
|---|---|---|---|
| `error_inbox_capacity` | int (≥16) | `256` | Bounded SPSC queue capacity for async error notifications. Overflow drops the oldest entry and increments `getDroppedErrorNotifications`. |
| `on_server_error`, `on_schema_error`, `on_parse_error`, `on_internal_error`, `on_security_error`, `on_write_error` | enum | per category | All clients accept these keys, but Node.js and Java currently ignore them; .NET applies them. There is no `DROP_AND_CONTINUE` policy. See [Error handling](/docs/connect/clients/connect-string/#error-handling). |

The Node.js defaults are documented in
[Concepts § Error frames](/docs/high-availability/store-and-forward/concepts/#error-frames).
`PROTOCOL_VIOLATION` is always terminal; Node.js treats an unknown server
status as retriable rather than silently dropping the batch.

## Other relevant keys

These keys are not SF-specific but affect SF behaviour. See the
[connect-string reference](/docs/connect/clients/connect-string) for the
canonical entries.

| Key | Type | Default | Description |
|---|---|---|---|
| `addr` | `host[:port][,host[:port]…]` | required | Multi-host failover list. See [Client failover configuration](/docs/high-availability/client-failover/configuration/). |
| `username` / `password` | string | unset | HTTP Basic auth on the upgrade request. |
| `token` | string | unset | Bearer token on the upgrade request. |
| `tls_verify` | enum | `on` | `on` or `unsafe_off`. Applies to `wss::` / TLS connections. |
| `tls_roots` | path | system trust (Node.js: bundled CAs) | Custom CA trust store. |
| `tls_roots_password` | string | unset | Trust store password. |
| `auto_flush` | bool | `on` | Global on/off for auto-flush triggers. |
| `auto_flush_rows` | int / `off` | `1000` | Row-count flush trigger. Node.js: use `0` to disable; `off` is rejected. |
| `auto_flush_bytes` | int / `off` | `0` (off) | Byte-size flush trigger. |
| `auto_flush_interval` | int (ms) / `off` | `100` | Time-since-first-row flush trigger (Node.js: since last flush or sender creation). Node.js: use `0` to disable; `off` is rejected. |
| `init_buf_size` | size | `64K` | Initial encode buffer capacity; not supported by the Node.js QWP `ws`/`wss` client. |
| `max_buf_size` | size | `100M` | Max encode buffer capacity; not supported by the Node.js QWP `ws`/`wss` client. |
| `max_name_len` | int | `127` | Local validation cap for table / column names. |

## Validation

The parser rejects:

- Unknown keys (forward compatibility is via the spec, not silent
  acceptance).
- Unsupported `sf_durability` values. Go and .NET accept only `memory`;
  Node.js also accepts `periodic` and `append`. Other clients accept
  `periodic`, but reject `flush` and `append` at build time.
- `sender_id` containing path separators or empty.
- `request_durable_ack=on` on non-WebSocket transports.

## Worked examples

### Single-node memory-mode producer

```java
try (Sender sender = Sender.fromConfig("ws::addr=localhost:9000;")) {
    sender.table("events")
          .stringColumn("source", "edge-42")
          .longColumn("count", 1)
          .atNow();
}
```

No `sf_dir`, so memory mode. The default `128 MiB` cap absorbs short
network blips. A sender crash loses the unacked tail.

### Single-node durable producer

```java
try (Sender sender = Sender.fromConfig(
        "ws::addr=localhost:9000;sf_dir=/var/lib/qdb-sender;")) {
    // ...
}
```

Same producer code; SF mode is enabled by the one extra key. Unacked
data persists at `/var/lib/qdb-sender/default/` across crashes.

### Multi-host with object-store durability

```java
try (Sender sender = Sender.fromConfig(
        "wss::addr=node-a:9000,node-b:9000,node-c:9000;"
        + "sf_dir=/var/lib/qdb-sender;sender_id=ingest-svc;"
        + "request_durable_ack=on;"
        + "username=ingest;password=…;")) {
    // ...
}
```

`wss::` for TLS, three-host failover, durable-ack opt-in. Slot lives at
`/var/lib/qdb-sender/ingest-svc/`. The connect fails loudly if any peer
returns an upgrade without `X-QWP-Durable-Ack: enabled`.

### Multi-tenant host with orphan rescue

```java
try (Sender sender = Sender.fromConfig(
        "wss::addr=node-a:9000;sf_dir=/var/lib/qdb-sender;"
        + "sender_id=worker-" + workerInstanceId + ";"
        + "drain_orphans=on;max_background_drainers=8;")) {
    // ...
}
```

Each worker instance has a unique `sender_id`. When a worker crashes and
a new instance comes up under a different `sender_id`, the new
instance's foreground sender adopts the dead worker's slot in the
background and drains it.

### Long-outage tolerance for unattended ingest

```java
try (Sender sender = Sender.fromConfig(
        "wss::addr=primary:9000;sf_dir=/var/lib/qdb-sender;"
        + "sf_max_total_bytes=50G;"
        + "reconnect_max_duration_millis=3600000;"
        + "initial_connect_retry=async;")) {
    // ...
}
```

50 GB of buffer space, a one-hour reconnect budget, async initial
connect so the constructor returns immediately even if the server is
down. Suitable for edge / IoT producers on unreliable links.

## Where each key is documented

| Group | Connect-string reference |
|---|---|
| Storage (`sf_dir`, `sender_id`, …) | [#sf-keys](/docs/connect/clients/connect-string#sf-keys) |
| Reconnect (`reconnect_*`, `initial_connect_retry`, `close_flush_timeout_millis`) | [#reconnect-keys](/docs/connect/clients/connect-string#reconnect-keys) |
| Failover (`addr`, `zone`, `target`, `auth_timeout_ms`) | [#failover-keys](/docs/connect/clients/connect-string#failover-keys) |
| Auth (`username`, `password`, `token`) | [#auth](/docs/connect/clients/connect-string#auth) |
| TLS (`tls_*`) | [#tls](/docs/connect/clients/connect-string#tls) |
