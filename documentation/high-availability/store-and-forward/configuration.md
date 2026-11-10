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

These keys select between memory-only mode and SF mode and govern on-disk
layout. The single switch is `sf_dir`: unset → memory-only mode, set → SF
mode.

| Key | Type | Default | Description |
|---|---|---|---|
| `sf_dir` | path | unset | Parent directory for sender directories. When set, each sender keeps its data in its sender directory, `<sf_dir>/<sender_id>/`, and unacknowledged data survives process restarts. When unset, the client runs in memory-only mode. |
| `sender_id` | string | `default` | Name of the sender directory under `sf_dir`. A pooled client uses it as a prefix instead: `<sender_id>-<index>`, or `<sender_id>-ingest-<index>` on Rust, C, C++, Python, and Ruby. Two senders with the same `sender_id` and `sf_dir` collide on the directory's lock. Must not contain path separators or be empty. |
| `sf_max_segment_bytes` | size | `4M` | Size of each segment file; the client starts a new segment when the current one is full. Each batch must fit in one segment. |
| `sf_max_total_bytes` | size | `128M` (memory-only) / `10G` (SF) | Cap on the client's store-and-forward storage, counted in whole segments, so it includes acknowledged batches in segments not freed yet: on disk in SF mode, in RAM in memory-only mode. When it's reached, flushes wait for space; see `sf_append_deadline_millis`. |
| `sf_durability` | enum | `memory` | When the client forces store-and-forward data to stable storage: `memory` (doesn't force each write to disk), `periodic` (forces it every `sf_sync_interval_millis`; requires `sf_dir`), `append` (forces each flush's rows before the flush completes), `flush` (reserved). Not every client accepts every value; see your [client's page](/docs/connect/overview/#client-libraries). `memory` doesn't mean memory-only mode; for that, leave `sf_dir` unset. |
| `sf_sync_interval_millis` | int (ms) | `5000` | How often `sf_durability=periodic` forces the segment files to stable storage; rejected without `periodic`. The interval is a floor, since scheduler and storage latency add to it. |
| `sf_append_deadline_millis` | int (ms) | `30000` | Maximum time a flush waits for space when `sf_max_total_bytes` is reached. If the deadline passes, the call fails with an error. |
| `drain_orphans` | bool | `off` | Scan `<sf_dir>/*` at startup and, in the background, send the rows of other sender directories that are unlocked and still hold unacknowledged rows (orphans). See [orphan adoption](/docs/high-availability/store-and-forward/concepts/#orphan-adoption). |
| `max_background_drainers` | int | `4` | Maximum number of orphans drained at the same time. |

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
| `reconnect_max_duration_millis` | int (ms) | `300000` (5 min) | Bounds the blocking sync initial connect only (`initial_connect_retry=on`/`sync`). A running sender's reconnect loop never consults it and retries indefinitely. |
| `reconnect_initial_backoff_millis` | int (ms) | `100` | Initial backoff sleep at round exhaustion. |
| `reconnect_max_backoff_millis` | int (ms) | `5000` | Cap on the exponential backoff. With equal-jitter the actual sleep lands in `[max, 2·max)`. |
| `initial_connect_retry` | enum | `off` | `off` (alias `false`): first-connect failure is terminal. `on` (aliases `sync`, `true`): same retry loop as reconnect, blocking the constructor. `async`: same retry loop in the I/O thread, non-blocking. |
| `close_flush_timeout_millis` | int (ms) | `60000` on Java and .NET; `5000` on Rust, C, C++, Python, and Node.js | `close()` blocks up to this long waiting for `ackedFsn ≥ publishedFsn`. `0` or `-1` skips the drain wait. The safety-net `checkError()` still runs. |

Cross-reference:
[connect-string #reconnect-keys](/docs/connect/clients/connect-string#reconnect-keys).

## Durable-ack keys

Opt in to trim on durable acknowledgements: from the server's disk, the object
store, or both. See
[Durable-ack: when to opt in](/docs/high-availability/store-and-forward/when-to-use/#durable-ack-when-to-opt-in).

| Key | Type | Default | Description |
|---|---|---|---|
| `request_durable_ack` | enum: `off`, `local`, `replicated`, `local,replicated`, `on` | `off` | `local` trims on `STATUS_LOCAL_DURABLE_ACK` frames (the server's disk; needs [adaptive durability mode](/docs/concepts/durability/)). `replicated` and `on` trim on `STATUS_DURABLE_ACK` frames (the object store; QuestDB Enterprise). `local,replicated` trims on `STATUS_DURABLE_ACK`. OK frames then no longer advance the trim watermark. Connect fails loudly if the server does not confirm every requested tier in `X-QWP-Durable-Ack`. WebSocket transports only. See [Durable ACK](/docs/connect/clients/connect-string/#durable-ack) for client and server versions. |
| `durable_ack_keepalive_interval_millis` | int (ms) | `200` | Cadence of WebSocket PING the I/O loop sends while there are pending durable confirmations and the producer is idle. `0` or negative disables. |

## Error-handling keys

| Key | Type | Default | Description |
|---|---|---|---|
| `error_inbox_capacity` | int (≥16) | `256` | Bounded SPSC queue capacity for async error notifications. Overflow drops the oldest entry and increments `getDroppedErrorNotifications`. |
| `max_frame_rejections` | int (≥1) | `4` | How many times in a row the server may reject the same batch, with no acknowledgement in between, before the sender records a terminal error instead of replaying it again. The protocol calls a batch a *frame*. |
| `on_server_error`, `on_schema_error`, `on_parse_error`, `on_internal_error`, `on_security_error`, `on_write_error` | enum | per category | Override the default policy (`terminal`, `retriable`, or `retriable_other`) for a category; `on_server_error` also accepts `auto`. Every client accepts these keys, but the Java and Node.js clients don't apply them yet. |
| `poison_min_escalation_window_millis` | int (ms) | `5000` | Minimum time the same batch must keep being rejected before `max_frame_rejections` makes the error terminal, so a brief outage can clear first. `0` escalates at once. Not supported by the Go client. |

The per-category defaults are documented in
[Concepts § Error responses](/docs/high-availability/store-and-forward/concepts/#error-responses),
and the override rules in
[Error handling](/docs/connect/clients/connect-string#error-handling).
`PROTOCOL_VIOLATION` is always `terminal` and `UNKNOWN` always `retriable`;
neither can be overridden.

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
| `tls_roots` | path | system trust | Custom CA trust store. |
| `tls_roots_password` | string | unset | Trust store password. |
| `auto_flush` | bool | `on` | Global on/off for auto-flush triggers. |
| `auto_flush_rows` | int / `off` | `1000` | Row-count flush trigger. |
| `auto_flush_bytes` | int / `off` | `0` (off) | Byte-size flush trigger. |
| `auto_flush_interval` | int (ms) / `off` | `100` | Time-since-first-row flush trigger. |
| `init_buf_size` | size | `64K` | Initial encode buffer capacity. |
| `max_buf_size` | size | `100M` | Max encode buffer capacity. |
| `max_name_len` | int | `127` | Local validation cap for table / column names. |

## Validation

The parser rejects:

- Unknown keys (forward compatibility is via the spec, not silent
  acceptance).
- `sf_durability` values other than `memory`, `periodic`, `flush`, and
  `append`. `flush` and `append` parse but are rejected at build time today,
  except that the Node.js client accepts `append` and rejects `flush` when
  parsing.
- `sender_id` containing path separators or empty.
- `request_durable_ack` other than `off` on non-WebSocket transports.

## Example configurations

### Single-node memory-only producer

```java
try (Sender sender = Sender.fromConfig("ws::addr=localhost:9000;")) {
    sender.table("events")
          .stringColumn("source", "edge-42")
          .longColumn("count", 1)
          .atNow();
}
```

No `sf_dir`, so memory-only mode. The default `128 MiB` cap absorbs short
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

`wss::` for TLS, three-host failover, durable-ack opt-in. The sender directory
is `/var/lib/qdb-sender/ingest-svc/`. The connect fails loudly if any peer
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
instance's foreground sender adopts the dead worker's sender directory in
the background and drains it.

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
