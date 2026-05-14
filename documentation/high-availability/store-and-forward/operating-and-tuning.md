---
title: Operating and tuning store-and-forward
sidebar_label: Operating & tuning
description:
  Operational guidance for QuestDB store-and-forward producers — slot
  directory layout, locks, capacity sizing, recovery, backpressure,
  observability, and orphan adoption.
---

:::note Java-only today

Client-side store-and-forward support is currently available in the Java
client. Additional language clients are on the roadmap.

:::

This page is the operator-facing guide for SF in production: how to
provision the slot directory, what to watch, and how to tune the limits.
For the underlying model see
[Concepts](/docs/high-availability/store-and-forward/concepts/); for the
choice between memory mode and SF mode see
[When to use](/docs/high-availability/store-and-forward/when-to-use/).

## Slot directory layout

In SF mode every sender owns one **slot directory**:

```
<sf_dir>/<sender_id>/
├── .lock              # advisory exclusive lock (kernel-released on process exit)
├── .lock.pid          # UTF-8 text: holder PID + '\n' (diagnostic only)
├── .failed            # optional drainer-failure sentinel (UTF-8 reason text)
├── .ack-watermark     # optional 16-byte durable-ack high-water mark
├── sf-0000000000000001.sfa
├── sf-0000000000000002.sfa
└── ...
```

`<sf_dir>` is the **group root** — the directory you point the connect
string at. `<sender_id>` is the slot subdirectory; it defaults to
`default` but should be set explicitly when more than one sender shares
the host.

### `.lock` and `.lock.pid`

The `.lock` file is held under an advisory exclusive lock for the engine's
lifetime — POSIX clients use `flock` / `fcntl`, Windows uses
`LockFileEx`. The lock is released automatically when the file descriptor
closes, including on hard process exit (kernel cleanup).

A second sender pointing at the same slot directory will fail to start
with an error that names the holder's PID, read from `.lock.pid`. The
PID file is overwritten on every successful acquire; an absent or empty
`.lock.pid` reports `holder=unknown` rather than failing the lookup.

Neither `.lock` nor `.lock.pid` is deleted on clean shutdown. Stale
files are harmless — the next acquirer silently overwrites them.

**Cross-platform interop:** a POSIX client and a Windows client must
**not** share a slot on a network filesystem. Their lock primitives are
incompatible.

### `.failed`

Present iff a previous drainer attempt gave up on the slot — reconnect
budget exhausted, terminal auth failure, or irrecoverable corruption.
The file contents are a UTF-8 reason for human operators; the **presence**
is the signal that the orphan scanner uses to exclude the slot from
auto-drain on subsequent scans.

**Operator action:** read the reason, fix the underlying cause (rotate
credentials, restore the missing peer, etc.), then delete `.failed`. The
next sender that scans `<sf_dir>` will pick the slot up again.

### Segment files

Segments are named `sf-<gen>.sfa` where `<gen>` is a 16-character
zero-padded hexadecimal generation counter. The number reflects
allocation order, **not** the FSN range — that lives in the file header
and is read at recovery time.

Pre-allocation reserves real disk blocks at file creation. On Linux this
is `posix_fallocate`; on macOS, `F_PREALLOCATE` / `F_ALLOCATEALL`. The
substrate refuses to fall back silently to `ftruncate` on filesystems
where these are unsupported — sparse files would risk a `SIGBUS` later
when the mmap'd region writes into a hole. On filesystems where the
native layer **must** fall back to `ftruncate`, size `sf_max_bytes`
conservatively against free space.

## Lock collisions in practice

Two `sender_id`s in the same `sf_dir` never collide — they are
independent slots. The same `sender_id` started twice **will** collide,
and the second start fails loudly.

A common cause is a redeploy where the old process hasn't fully exited
when the new one comes up. Solutions:

- Wait for the old process to release the lock (the kernel releases on
  exit; `kill -9` is sufficient).
- Use a deployment unit that orders shutdown before startup.
- For containerised deployments, set `sender_id` from a per-pod stable
  identity so two pods with the same template name don't collide.

`drain_orphans=on` does **not** override the lock — a busy orphan slot
is skipped, not stolen.

## Sizing capacity

Two limits matter:

### `sf_max_bytes` — per-segment file size (default `4 MiB`)

This is the rotation threshold and the unit of trim. Segments that are
smaller release disk faster but waste more space on the active tail;
larger segments waste less on the active tail but hold acked frames in
the same file as the still-unacked tail until every frame in the segment
is acked.

For most workloads `4 MiB` is fine. Raise it if you are appending very
large batches and pre-allocation cost matters; lower it if you observe
disk usage staying high under slow ack cadence.

### `sf_max_total_bytes` — slot capacity (default `128 MiB` memory / `10 GiB` SF)

This is the **hard cap** on resident SF storage — sealed segments plus
the active segment. When this fills, producer `appendBlocking` calls
block (with cooperative yield) for up to `sf_append_deadline_millis`
waiting for ACK-driven trim to free space; on timeout the call throws.

Size this against your **worst expected outage** times your ingest
rate:

```
sf_max_total_bytes ≥ ingest_rate × max_tolerated_outage
```

A 5-minute reconnect budget at 10 MB/s of compressed frames implies at
least 3 GB. Add safety margin for trim latency — in particular,
`request_durable_ack=on` extends time-to-trim by the WAL→object-store
upload window.

In memory mode the default `128 MiB` is deliberately small: it forces
you to think about backpressure rather than letting an outage silently
balloon process RSS.

## Backpressure observability

`appendBlocking` distinguishes two reasons it can stall:

- **Wire-publishing backpressure.** The server is acking but the
  producer is faster than ack throughput. The exception message names
  this state. Solutions: scale the server, slow the producer, or raise
  `sf_max_total_bytes`.
- **Reconnect backpressure.** The I/O loop is in the retry loop and the
  substrate is filling. The exception message includes the attempt
  count and outage start time. Solutions: address the cluster outage,
  raise `sf_max_total_bytes`, or accept that the producer will start
  throwing once the cap is exhausted.

The `getTotalBackpressureStalls()` counter (see Observability below)
records every producer thread that hit the cap.

## Recovery on restart

When an SF-mode sender opens, it runs this sequence:

1. Acquire `<sf_dir>/<sender_id>/.lock`. Fail loudly on contention.
2. Scan every `*.sfa` file:
   - Validate magic, version, header.
   - Walk frames forward verifying each CRC32C-Castagnoli.
   - The first invalid frame becomes end-of-data; any non-zero bytes
     past that point are logged as a torn-tail count.
3. Sort segments by `baseSeq` and verify no gaps. A gap is a fatal
   recovery error.
4. Open `.ack-watermark` (if present) and read the cumulative
   durable-ack FSN. Reject a watermark that exceeds the on-disk
   ceiling — it would seed `ackedFsn` past every un-acked frame and
   silently drop the un-acked tail.
5. Seed `ackedFsn = max(lowestBaseSeq - 1, watermark)`.
6. Allocate the next segment generation as `max(existing-gen) + 1`.
7. Bump the connection generation so the I/O loop replays from disk
   against a fresh wireSeq window.

A clean shutdown that drained everything is indistinguishable from a
fresh start: no segments, no replay.

### Recovery failures

| Symptom | Likely cause | Operator action |
|---|---|---|
| "Slot held by PID `<n>`" | Two processes claiming the same `sender_id`. | Stop the duplicate. The lock releases on its exit. |
| "Gap between segments" | Corruption — a segment was deleted out of band. | Restore from backup or accept data loss; the substrate refuses to start. |
| "Watermark exceeds publishedFsn" | `.ack-watermark` is corrupt; the engine falls back to the no-watermark seed. | Logged as `WARN`. Replay will re-send the lowest segment's frames; rely on server deduplication. |
| Torn tail count > 0 | The previous process crashed mid-frame-write. | Informational; the CRC + zero-fill design discards the partial frame. |

## Close and shutdown

`close()` semantics depend on `close_flush_timeout_millis`:

| Value | Behaviour |
|---|---|
| `5000` (default) | Block up to 5 s waiting for `ackedFsn ≥ publishedFsn`. Log `WARN` on timeout; un-acked tail stays on disk (SF) or is lost (memory). |
| `0` or `-1` | Skip the drain wait. Pending data persists on disk (SF) for the next sender, or is lost (memory). |
| any other positive value | That timeout in milliseconds. |

In every branch `close()`:

- Performs a non-blocking safety-net check that rethrows any latched
  terminal error not already delivered through an async handler or a
  synchronous producer call.
- Releases the slot lock and unmaps segment files.

The safety-net check is what makes "close-and-forget" callers safe: if
the only API your code uses is `close()`, terminal errors still surface
rather than silently sinking into a no-op handler.

## Orphan adoption in operations

With `drain_orphans=on`, the foreground sender — after acquiring its own
lock — scans `<sf_dir>/*` for siblings that:

- are not its own `sender_id`,
- contain at least one `*.sfa` file,
- do not have a `.failed` sentinel.

Up to `max_background_drainers` drainers run concurrently. Each drainer
opens its own engine and WebSocket connection, runs recovery + replay,
and exits when the orphan's `ackedFsn ≥ publishedFsn`.

### Drainer failure modes

- **Reconnect budget exhausted.** Drainer writes `.failed` with reason,
  releases the lock, exits.
- **Auth-terminal upgrade error.** Same.
- **Irrecoverable corruption.** Same.

`.failed` slots are excluded from auto-drain on subsequent scans —
operator action is required to clear the sentinel.

### Observing drainers

- `getActiveBackgroundDrainers()` — count of currently-running drainers
  (best-effort: a just-finished drainer may still count for a few ms).
- `getTotalBackgroundDrainersSucceeded()` / `…Failed()` — cumulative
  outcomes since process start.
- The `BackgroundDrainerListener` callback delivers per-drainer
  events (progress watermark, durable-ack-mismatch escalation, terminal
  outcome) for richer dashboards.
- On-disk `.failed` sentinels are the canonical record of giveup
  events surviving sender restart.

## Observability counters

A conformant client exposes at minimum:

| Counter | What it tells you |
|---|---|
| `getTotalReconnectAttempts()` | How often the wire has broken across the sender's lifetime. |
| `getTotalReconnectsSucceeded()` | How many of those recovered. |
| `getTotalFramesReplayed()` | Volume re-sent after reconnects. A spike usually means a fresh outage; sustained growth means a flapping wire. |
| `getTotalServerErrors()` | Count of error frames received (any category). |
| `getDroppedErrorNotifications()` | Error-inbox overflow count. Non-zero means a busy error stream or a slow handler. |
| `getTotalErrorNotificationsDelivered()` | Errors delivered to the user handler. |
| `getTotalBackpressureStalls()` | Producer threads that hit `sf_max_total_bytes`. |
| `getLastTerminalError()` | The latched `SenderError`, or null. |
| `getActiveBackgroundDrainers()` | Running orphan drainers right now. |
| `getTotalBackgroundDrainersSucceeded()` / `…Failed()` | Cumulative drainer outcomes. |

### Suggested dashboards

- **Reconnect health:** `reconnect_attempts - reconnect_succeeded` over
  time. A non-zero difference for more than a few seconds means the
  wire is currently down. Alert if it stays elevated past your
  `reconnect_max_duration_millis`.
- **Replay volume:** `frames_replayed` rate. Bursts are expected;
  sustained replay means a chronic instability.
- **Backpressure:** `backpressure_stalls` rate. Any non-zero rate is a
  capacity signal.
- **Error rate by category:** instrument your error handler to bucket
  by category. Background `SCHEMA_MISMATCH` is usually a schema-drift
  symptom worth alerting on.

The default error handler logs every received `SenderError` —
`ERROR`-level for HALT, `WARN`-level for DROP. Replace it only if you
are also routing the errors somewhere else (Sentry, structured logs):
silence is forbidden by the contract.

## Multi-sender deployments

When several senders share a host and a `sf_dir`:

- Give each one a unique `sender_id`. The defaults `sender_id=default`
  is fine for a single-sender host but collides for any second
  sender.
- Consider `drain_orphans=on` if dynamic sender identities mean dead
  instances can leave permanent orphans.
- Size `sf_max_total_bytes × number_of_senders` against available disk.
- Plan for the worst-case lock-collision recovery: a misconfigured
  fleet that all share `sender_id=default` will leave only one sender
  alive on each host. That is the design — fail loudly rather than
  silently corrupt overlapping slots.

## Next steps

- [Configuration](/docs/high-availability/store-and-forward/configuration/) —
  the full connect-string key reference.
- [Client failover concepts](/docs/high-availability/client-failover/concepts/) —
  what the reconnect loop does between disconnects.
