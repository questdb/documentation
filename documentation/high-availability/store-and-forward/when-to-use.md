---
title: When to use store-and-forward
sidebar_label: When to use
description:
  Decision guide for choosing between memory mode and disk-backed
  store-and-forward, when to opt into durable-ack trim, and when to enable
  orphan adoption.
---

The QWP WebSocket transport always uses a store-and-forward (SF) substrate.
What changes between deployments is **where** that substrate keeps unacked
data and **what durability bar** it acknowledges against. This page is the
decision guide.

If you are new to SF, start with
[Concepts](/docs/high-availability/store-and-forward/concepts/).

## Memory mode vs SF mode

The single switch that decides this is whether you set `sf_dir` in the
connect string.

### Memory mode — `sf_dir` unset

Unacked frames live in a malloc'd ring in process memory. Default cap is
`128 MiB`.

**Choose memory mode when:**

- The producer process is short-lived or ephemeral (a CLI job, a CI
  worker, a serverless function).
- A sender restart is acceptable as a fresh start — losing any in-flight
  data when the sender stops is acceptable.
- You only need to tolerate **transient** network blips and short server
  outages (think: rolling upgrades, brief network partitions).
- Your data volume comfortably fits in RAM during the longest outage you
  care about.

### SF mode — `sf_dir=/path/to/slot-root`

Unacked frames are written to mmap'd files under
`<sf_dir>/<sender_id>/`. Default cap is `10 GiB`.

**Choose SF mode when:**

- The producer process is long-running and outage budgets are measured
  in minutes (the default `reconnect_max_duration_millis` is 5 minutes
  for a reason).
- In-flight data must not be lost when the sender stops or its host
  reboots — crash, OOM kill, planned redeploy.
- You ingest at rates where minutes of buffering exceeds RAM you can
  spare.
- You operate unattended at the edge (sensors, ETL jobs) where the
  server may sometimes be unreachable for extended periods.

Both modes share the same wire behaviour, the same failover loop, and
the same connect-string keys for everything other than storage. You can
switch between them without changing application code — only the connect
string.

## Comparison at a glance

| Aspect | Memory mode | SF mode |
|---|---|---|
| Buffered data location | Process RAM | Disk (`<sf_dir>/<sender_id>/`) |
| Default capacity | `128 MiB` | `10 GiB` |
| Unacked data after a sender crash (`kill -9`, OOM) | Lost | Recovered and replayed on restart |
| Unacked data after the sender's host reboots | Lost | Recovered, if the disk persists |
| Cross-sender rescue (orphan adoption) | n/a | Yes (opt-in) |
| Setup cost | Zero | Provisioning a writable directory |
| Operational cost | Zero | Sizing, monitoring, lock collisions |

## Durable-ack: when to opt in

By default the substrate trims unacked data on OK ack from the server.
That means the substrate releases a frame once the server has acknowledged
it into the WAL. The frame is durable on the **primary's** disk; whether
it has been replicated to the object store or to replicas is a separate
matter.

When the connect string sets `request_durable_ack=on`, trim is held back
until a separate `STATUS_DURABLE_ACK` frame confirms the data has been
uploaded from the WAL to the **configured object store** (S3, Azure Blob,
GCS, or NFS).

### Choose durable-ack when

- You require object-store durability before considering a write
  acknowledged — e.g. compliance requirements, end-to-end exactly-once
  pipelines with cross-region recovery.
- Loss of an entire primary node (and its local disk) must not lose
  in-flight data — replicas haven't downloaded the WAL yet, only the
  object store has.
- You are willing to trade later trim (and so larger steady-state SF
  disk usage) for the stronger guarantee.

### Stay on the default OK trim when

- WAL-local durability on the primary is sufficient.
- You want minimum steady-state disk usage.
- You are running OSS or a build that does not support durable-ack.
  (The handshake fails loudly if you opt in but the server cannot
  deliver — see below.)

### Caveats

- **Server support is required.** The client sends
  `X-QWP-Request-Durable-Ack: true` on the upgrade. The server must echo
  back `X-QWP-Durable-Ack: enabled`. If it does not — OSS build,
  uninitialised primary, missing registry, hitting a replica — the
  connect **fails loudly**, by design. Silently waiting for ack frames
  that never arrive would let the SF disk fill up.
- **Idle keepalive.** The OSS server only flushes pending durable-ack
  frames during inbound recv events. The client sends a WebSocket PING
  every `durable_ack_keepalive_interval_millis` (default 200 ms) when
  there are pending confirmations and the producer is idle.
- **Disk pressure.** Steady-state SF disk usage is roughly
  `ingest_rate × time_to_object_store_durability`. Size
  `sf_max_total_bytes` accordingly.

## Orphan adoption: when to enable

A sender that exits without draining its slot leaves unacked data on
disk. If another process restarts under the same `sender_id` and same
`sf_dir`, it picks up the orphan automatically as part of normal
recovery. But if no process ever uses that `sender_id` again, the data
sits on disk forever.

Setting `drain_orphans=on` tells the **foreground sender** to scan
`<sf_dir>/*` at startup for sibling `sender_id`s with unacked data and
spawn background drainers to clear them.

### Enable orphan adoption when

- You have a fleet of senders writing to a shared `sf_dir` (multi-tenant
  host, container restart) and want any survivor to rescue dead
  siblings' data.
- Your deployment can dynamically allocate `sender_id` (e.g. one per
  process instance), so dead instances leave permanent orphans that no
  natural restart will adopt.
- You prefer "automatic eventual delivery" over "operator manually
  reattaches the slot."

### Leave it off when

- Each `sender_id` is statically pinned to a specific process — there
  are no orphans by construction; a restart of the same process
  recovers its own slot.
- You want explicit operator control over data movement in a shared
  `sf_dir`.
- You run a single producer per host.

Drainer concurrency is capped by `max_background_drainers` (default
`4`). Each drainer opens its own connection — they share the network
path but not the WebSocket.

`drain_orphans=on` does not interfere with regular recovery: the
foreground sender still recovers its own `sender_id` first, then
drainers spawn for sibling slots.

## Migrating from HTTP/TCP ILP

If you are currently using HTTP or TCP ILP ingest, the comparison is:

| Capability | HTTP ILP | TCP ILP | QWP WebSocket + SF |
|---|---|---|---|
| Non-blocking producer | No (request waits) | No (TCP backpressure) | Yes (buffer absorbs publishes) |
| No data loss on a sender crash | No | No | Yes (SF mode) |
| Server outage tolerance | Best-effort retry | None | Reconnect loop with multi-minute budget |
| Multi-host failover | Yes (HTTP only) | No | Yes |
| Cross-region durability ack | No | No | Yes (`request_durable_ack=on`) |
| Cluster-wide ordering | Best-effort | Best-effort | FSN-driven, server-deduplicated |

The transition is application-transparent — `Sender.fromConfig` accepts
a `ws::` or `wss::` connect string and the public builder API is the
same. The most common migration is HTTP ILP → QWP WS+SF, with `sf_dir`
set, retaining HTTP for backward compatibility while the QWP path
becomes the primary.

For specifically the multi-host HA path on HTTP ILP, see the existing
[ILP overview "Multiple URLs for High Availability"](/docs/ingestion/ilp/overview/#multiple-urls-for-high-availability)
section. QWP failover (documented in
[Client failover concepts](/docs/high-availability/client-failover/concepts/))
replaces and extends it.

## Decision flowchart

```mermaid
graph TD
    Q1{Will the producer outlive any single outage you care about?}
    Q2{A sender crash must not lose in-flight data?}
    Q3{Is object-store durability required before ack?}
    Q4{Multiple senders share sf_dir, with dynamic sender_id?}

    Q1 -->|"No (ephemeral job)"| Memory[Memory mode — leave sf_dir unset]
    Q1 -->|"Yes (long-running service)"| Q2
    Q2 -->|No| Memory
    Q2 -->|Yes| SF[SF mode — set sf_dir]
    SF --> Q3
    Q3 -->|Yes| Durable[Add request_durable_ack=on]
    Q3 -->|No| Q4
    Durable --> Q4
    Q4 -->|Yes| Orphans[Add drain_orphans=on]
    Q4 -->|No| Done[Configuration complete]
    Orphans --> Done
```

## Next steps

- [Configuration](/docs/high-availability/store-and-forward/configuration/) —
  the connect-string keys.
- [Operating and tuning](/docs/high-availability/store-and-forward/operating-and-tuning/) —
  slot layout, sizing, observability.
