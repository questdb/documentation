---
title: Store-and-forward concepts
sidebar_label: Concepts
description:
  How the QuestDB store-and-forward client substrate decouples the producer
  from the wire, masks network outages and server restarts, and replays
  unacknowledged frames against a fresh connection.
---

Store-and-forward (SF) is the client-side substrate that sits between your
application code and the QWP wire transport. It absorbs publishes into a
local ring of fixed-size segments, drains them over a WebSocket connection
on a dedicated I/O thread, and replays any unacknowledged frames after a
disconnect or restart.

The goal is **producer-never-blocks-on-the-wire**. Your call to `flush()`
returns as soon as data is published into the substrate. Acknowledgements
arrive asynchronously. A network outage or a server restart leaves your
producer code unaffected — the I/O thread quietly reconnects and replays
what remains. In SF mode, even a crash of the sender process itself loses
no unacked data: the next sender on the slot recovers it from disk and
replays it.

## Two modes

SF runs in either of two modes selected by the connect string:

| Aspect | Memory mode | SF mode |
|---|---|---|
| Trigger | `sf_dir` is **unset** | `sf_dir` is set |
| Storage | malloc'd ring in process RAM | mmap'd files under `<sf_dir>/<sender_id>/` |
| Default capacity | `128 MiB` | `10 GiB` |
| Unacked data if the sender crashes | Lost | Recovered and replayed on restart |
| Unacked data if the sender's host reboots | Lost | Recovered, if the disk persists |
| Tolerates transient network blips | Yes | Yes |
| Tolerates multi-minute server outages | Bounded by RAM cap | Bounded by disk cap |
| Recovers another sender's stale slot | n/a | Opt-in via `drain_orphans=on` |

Both modes share the same reconnect loop, the same backoff and retry
budgets, and the same on-the-wire behaviour. The only difference is
where unacked data lives. The Node.js client is the exception: ordinary
memory mode gives up after `reconnect_max_duration_millis` (5 minutes by
default). Background memory mode (`initial_connect_retry=async`, also selected
by pooled `lazy_connect=on`) and disk-backed SF retry indefinitely. See the
[Node.js client](/docs/connect/clients/nodejs/#ingestion-reconnect).

## What "frame" means here

A **frame** is one encoded QWP message — typically a batch of rows for one
or more tables. The SF substrate treats frames as opaque payloads with two
properties: a length, and a CRC32C checksum. The append protocol writes the
payload first, the checksum last, and a partial write left behind by a
crash is detected and discarded by the recovery scanner on next start.

Frames in SF mode are **self-sufficient**: every frame carries the full
schema for every table it touches and the full symbol-dictionary delta
from id 0. That makes a frame replayable against any server connection,
weeks or months later, even after a process restart that wiped all
in-memory schema state. The cost is a small per-batch overhead which is
accepted for correctness.

## The FSN model

Two distinct counters track frame identity:

- **FSN** (frame-sequence-number) — a monotonic counter assigned when a
  frame is appended to the substrate. FSN survives reconnects and (in SF
  mode) restarts. It is the substrate's permanent identifier for a frame.
- **wireSeq** is the per-connection counter used to correlate acknowledgements
  with sent frames. It resets to `0` on every successful WebSocket upgrade
  and is not a row-deduplication key.

On every (re)connect the relationship is pinned:

```
fsn = fsnAtZero + wireSeq
```

where `fsnAtZero` is `ackedFsn + 1` (i.e. the next un-acked FSN). The
client streams frames from disk to the wire in strict FSN order, one frame
per WebSocket binary message, incrementing `wireSeq`. The server echoes
back the same `wireSeq` in its OK frames, and the client maps that back to
the original FSN to advance the trim watermark.

Two consequences:

- Frames **must** be sent in strict order. The wire format does not
  serialise `wireSeq` — the server assigns it implicitly from receive
  order. Reordering breaks the FSN mapping.
- After a reconnect, the server may see the **same payloads** at new
  `wireSeq` values. An acknowledgement can be lost after a batch was
  committed, so replay is **at least once** and can insert duplicate rows.
  `wireSeq` is transport bookkeeping, not a deduplication key. For
  idempotent ingestion, use stable source IDs and timestamps with table-level
  `DEDUP UPSERT KEYS`, as in the [Node.js store-and-forward
  example](/docs/connect/clients/nodejs/#store-and-forward).

## Trim: how unacked data is reclaimed

The substrate holds frames until the server confirms it has received and
processed them. Each confirmation advances the **acked FSN**, which
allows the manager thread to unlink sealed segment files (in SF mode) or
release ring memory (in memory mode) up to that watermark.

Two trim drivers exist:

### Default — OK-driven trim

Each successful batch produces an **OK frame** carrying the highest
`wireSeq` it acknowledges and the per-table `seqTxn` watermarks that
batch updated. On receipt:

1. The substrate translates `wireSeq` back to FSN.
2. `ackedFsn` advances to the new value.
3. Any segment whose last FSN is `≤ ackedFsn` is unlinked and its bytes
   returned to the available pool.

This is the default and is sufficient when "data is in the server's WAL"
is the durability bar you need.

### `request_durable_ack=on` — WAL-durable trim

When the connect string sets `request_durable_ack=on`, trim is driven by
a separate frame: `STATUS_DURABLE_ACK`. These carry per-table watermarks
for data the server has **already uploaded from the WAL to the configured
object store** (S3, Azure Blob, GCS, or NFS).

- OK frames still arrive on every batch, but they no longer advance the
  trim watermark. Instead, they are stashed alongside their per-table
  `seqTxn` values.
- A `STATUS_DURABLE_ACK` frame names tables and their durable `seqTxn`
  watermarks. The client matches the head of the OK queue against these
  watermarks; each fully-covered head entry pops, and `ackedFsn`
  advances to the highest covered wireSeq.
- The client opt-in is mandatory — the connect fails loudly if the server
  does not echo `X-QWP-Durable-Ack: enabled` on the upgrade response.
  This avoids the silent failure mode where the producer waits forever
  for ack frames that will never arrive.

Durable-ack mode is the right choice when "data is in the object store"
is the durability bar, but it has two costs: a longer time-to-trim (so
larger steady-state disk usage in SF mode), and a small WebSocket PING
sent every `durable_ack_keepalive_interval_millis` to nudge the server's
flush path when the client is idle but has pending confirmations.

See [When to use](/docs/high-availability/store-and-forward/when-to-use/)
for the decision.

## Reconnect and replay

When the wire connection breaks — for any reason — the I/O thread enters
the reconnect loop documented in
[Client failover concepts](/docs/high-availability/client-failover/concepts/).
The producer is **not notified**: it keeps publishing into the substrate,
subject to available capacity (see [Backpressure](#backpressure)).

On Node.js, only ordinary memory mode waits for reconnect in `flush()`, up to
`reconnect_max_duration_millis`. Background memory mode, enabled by
`initial_connect_retry=async` or pooled `lazy_connect=on`, keeps accepting
batches into the memory replay queue until capacity is exhausted and retries
indefinitely. See the [three Node.js flushing modes](/docs/connect/clients/nodejs/#flushing).

On every successful (re)connect:

1. `fsnAtZero = ackedFsn + 1`.
2. `wireSeq` resets to `0`.
3. The read cursor rewinds to the first un-acked frame on disk (or in
   memory).
4. Frames stream to the wire in FSN order. A frame committed before the
   disconnect but not acknowledged can be inserted again: replay is at least
   once. Prevent duplicate rows with table-level `DEDUP UPSERT KEYS` covering
   the designated timestamp and stable source identity, preserving both on
   retries. See [Deduplication](/docs/concepts/deduplication/).
5. New frames appended by the producer during replay are picked up
   automatically — the I/O loop watches a volatile `publishedFsn`
   cursor.

Frames sent before the disconnect and re-sent after a reconnect count
in the `getTotalFramesReplayed` observability counter.

## Backpressure

The substrate uses `sf_max_total_bytes` to apply backpressure on resident
storage. When capacity is exhausted, the producer's `appendBlocking` call
busy-spins (with cooperative yield) up to `sf_append_deadline_millis`
waiting for ACK-driven trim to free space. If the deadline fires, the
call throws a typed exception.

On Node.js with `sf_dir`, this value is a journal size target rather than a
hard disk limit. Transaction-closing batches and retained symbol dictionaries
can exceed it, and other metadata needs additional space. Provision headroom
for each sender; see [Node.js journal capacity](/docs/connect/clients/nodejs/#store-and-forward).
Without `sf_dir`, the key caps the in-memory replay queue.

The exception message distinguishes the two scenarios:

- **Backpressure while the wire is publishing** — the server is acking
  but the producer is faster than the server can absorb. Solutions:
  raise `sf_max_total_bytes`, slow the producer, or scale the server.
- **Backpressure while reconnecting** — the I/O loop is in the retry
  loop and the substrate is filling. The message includes attempt count
  and outage start time. Solutions: address the cluster outage, raise
  `sf_max_total_bytes`, or accept that the producer will start throwing
  once the cap is exhausted.

## Close and shutdown

`close()` waits up to `close_flush_timeout_millis` for `ackedFsn` to reach
`publishedFsn` — i.e. for the server to acknowledge everything the producer has
handed in. The default differs by client: 60 s on Java and .NET, 5 s on Rust,
C, C++, Python and Node.js. If the wait succeeds, all data is acked. If the timeout
fires, a `WARN` is logged and:

- in **SF mode**, the un-acked tail is left on disk and recovered by the
  next sender on the same slot;
- in **memory mode**, the un-acked tail is lost.

On the Node.js client, a standalone sender's `close()` rejects with
`QwpSenderCloseTimeoutError` instead of logging, and the pooled client's
`db.close()` reports the timeout to its `onError` callback.

Setting `close_flush_timeout_millis=0` (or `-1`) skips the drain wait
entirely — useful for fast shutdown paths where you do not want to block.
Even in this branch, the slot lock is released and segments are unmapped
cleanly, and a non-blocking safety-net check rethrows any latched
terminal error that has not already been delivered through an async
handler or a synchronous producer call.

## Crash recovery (SF mode)

When the engine opens an SF-mode sender, it scans the slot directory:

1. **Acquire the slot lock.** Two senders pointing at the same
   `<sf_dir>/<sender_id>/` will collide here and the second one fails to
   start, naming the holder's PID in the error message.
2. **Validate every segment file.** Headers are checked, frames are walked
   forward verifying each CRC. The first invalid or torn frame becomes
   the file's end-of-data; anything past it is discarded.
3. **Reconcile gaps.** Segments are sorted by their `baseSeq` and adjacent
   pairs must satisfy `prev.baseSeq + prev.frameCount == curr.baseSeq`.
   A gap is a fatal recovery error — the engine refuses to start.
4. **Seed the ack watermark.** Either from `.ack-watermark` (if your
   client maintains it; see below) or from the lowest surviving FSN minus
   one.
5. **Bump the connection generation** so the I/O loop, on first connect,
   replays from disk against a fresh wireSeq window.

After recovery the producer publishes new frames as normal; the I/O
thread replays the un-acked tail and then drains forward.

### `.ack-watermark`

An optional 16-byte file under the slot directory persists the cumulative
durable-ack FSN across process restarts. Without it, recovery seeds the
ack watermark from the lowest surviving segment's `baseSeq - 1` — which
guarantees no data loss, but cannot distinguish which frames inside that
lowest segment the previous sender had already received durable acks
for. Replay therefore re-sends every frame in that segment, producing
row-level duplicates against a still-alive server unless deduplication is
enabled on the target table. See
[Delivery semantics](/docs/concepts/delivery-semantics/) for the
at-least-once model and the DEDUP recipe.

With `.ack-watermark`, recovery clamps the seed to the higher of the
on-disk and watermarked values, so already-durable-acked frames inside
the lowest surviving segment are not re-replayed.

The file is **optional** — a conformant client may choose not to maintain
it. The reference client does.

### `.symbol-dict` {#symbol-dict}

Each slot also persists its SYMBOL dictionary to a dot-prefixed side-file,
`<sf_dir>/<sender_id>/.symbol-dict`.

QWP sends each symbol string to the server **once per connection** and
thereafter references it by a numeric id. A frame on disk therefore contains
ids, not strings. If the dictionary that assigned those ids were lost, the
replayed frames would reference ids the server has never seen and it would
reject them with
[`STATUS_DICTIONARY_GAP`](/docs/connect/wire-protocols/qwp-ingress-websocket/#status-codes).
Persisting the dictionary alongside the frames is what makes a recovered or
orphan-drained slot replayable on a fresh process.

**Write-ahead ordering.** A new symbol is appended to `.symbol-dict` *before*
the frame that references it is published. A crash can therefore leave
dictionary entries with no referencing frame — harmless — but never a frame
whose ids are unknown.

**Durability matches the rest of store-and-forward: no fsync.** Writes go to
the page cache. A process crash (including `SIGKILL`) preserves both the
dictionary and the frames, because the page cache survives. A **host** crash
or power loss can tear the dictionary tail, exactly as it can tear the segment
frames themselves. Use `sf_durability=periodic` if you need checkpoints against
host loss; see
[Configuration](/docs/high-availability/store-and-forward/configuration/).

**Torn tails are detected, not replayed.** The file is CRC-validated on open
and any torn trailing entry is dropped. If the dictionary cannot be rebuilt —
neither from the side-file's intact prefix nor from the surviving frames' own
delta sections — the slot is **unreplayable**, and the client sets it aside
rather than shipping frames whose ids nothing still backs. The reference client
raises `UnreplayableSlotException`: `Sender.build()` sets the slot aside and
starts the producer on a fresh one, and the background drainer marks it with a
`.failed` sentinel so later orphan scans skip it. No data is silently
discarded; the slot is preserved for inspection.

## Orphan adoption

When the foreground sender's connect string sets `drain_orphans=on`, the
engine scans `<sf_dir>/*` at startup for **sibling slot directories** —
other `sender_id`s under the same group root that contain unacked data
and are not marked `.failed`. For each one, up to
`max_background_drainers` at a time, a background drainer spawns,
acquires the orphan slot's lock (skipping if another process holds it),
opens a separate WebSocket connection, runs the same recovery + replay
flow, and exits when the orphan is fully drained.

This is the rescue path for a sender that died without draining cleanly
— a process crash, an OOM kill, a host reboot. The replacement process picks
the orphan's slot lock and clears its disk footprint. Without
`drain_orphans=on` the dead sender's data persists on disk indefinitely
until an operator intervenes.

The orphan flow is opt-in because in a multi-tenant deployment with
shared `sf_dir`, blindly draining unknown slots may be surprising.

## Error frames

Not every server response is an OK. A rejected batch is **not** silently
dropped and trimmed: the client either retries it or reports a terminal error.
The defaults below apply to the Node.js QWP client; consult the
[connect-string error policies](/docs/connect/clients/connect-string/#error-handling)
for the shared vocabulary and per-client override support.

| Category | Node.js default | Meaning |
|---|---|---|
| `SCHEMA_MISMATCH` | `terminal` | The schema does not match. The sender stops; in SF mode, the rejected bytes remain in the journal for inspection. |
| `WRITE_ERROR` | `retriable` | A write failed (for example, a temporary storage problem); reconnect and replay. |
| `PARSE_ERROR` | `terminal` | Malformed payload; replaying identical bytes cannot help. |
| `INTERNAL_ERROR` | `retriable` | Retry after an unexpected server-side failure. |
| `SECURITY_ERROR` | `terminal` | Authentication or authorization failed. |
| `PROTOCOL_VIOLATION` | `terminal` (forced) | Protocol failure; stop and report it. |

The Node.js client delivers asynchronous rejections to `onSenderError`; its
default handler logs them. Other clients may use a bounded error inbox that
drops the oldest notification on overflow. Check the client-specific error
handling before relying on a policy override: the Node.js `on_*_error` keys
are currently accepted but do not change these defaults.

## Next steps

- [When to use](/docs/high-availability/store-and-forward/when-to-use/) —
  decision guide for memory vs SF mode, and when to opt into
  durable-ack and orphan adoption.
- [Operating and tuning](/docs/high-availability/store-and-forward/operating-and-tuning/) —
  slot directory layout, lock semantics, sizing, observability.
- [Configuration](/docs/high-availability/store-and-forward/configuration/) —
  connect-string key reference.
- [Client failover concepts](/docs/high-availability/client-failover/concepts/) —
  how the reconnect loop selects hosts and classifies errors.
