---
title: Store-and-forward concepts
sidebar_label: Concepts
description:
  How QuestDB store-and-forward keeps QWP batches in memory or in a sender
  directory on disk, tracks them by FSN, and replays them after a reconnect or
  crash.
---

Store-and-forward (SF) is the client-side substrate that sits between your
application code and the QWP wire transport. It absorbs publishes into a
local ring of fixed-size segments, drains them over a WebSocket connection
on a dedicated I/O thread, and replays any unacknowledged data after a
disconnect or restart.

The goal is **producer-never-blocks-on-the-wire**. Your call to `flush()`
returns as soon as data is published into the substrate. Acknowledgements
arrive asynchronously. A network outage or a server restart leaves your
producer code unaffected — the I/O thread quietly reconnects and replays
what remains. In SF mode, even a crash of the sender process itself loses
no unacked data: the next sender that uses the same **sender directory**,
`<sf_dir>/<sender_id>/`, recovers it from disk and replays it.

## Two modes

SF runs in either of two modes selected by the connect string:

| Aspect | Memory-only mode | SF mode |
|---|---|---|
| Trigger | `sf_dir` is **unset** | `sf_dir` is set |
| Storage | malloc'd ring in process RAM | mmap'd files in the [sender directory](/docs/high-availability/store-and-forward/operating-and-tuning/#sender-directory-layout), `<sf_dir>/<sender_id>/` |
| Default capacity | `128 MiB` | `10 GiB` |
| Unacked data if the sender crashes | Lost | Recovered and replayed on restart |
| Unacked data if the sender's host reboots | Lost | Recovered, if the disk persists |
| Tolerates transient network blips | Yes | Yes |
| Tolerates multi-minute server outages | Bounded by RAM cap | Bounded by disk cap |
| Recovers another sender's abandoned directory | n/a | Opt-in via `drain_orphans=on` |

Both modes share the same reconnect loop, the same backoff and retry
budgets, and the same on-the-wire behaviour. The only difference is
where unacked data lives.

## Batches and frames {#batches}

A **batch** is one encoded QWP message carrying rows for one or more
tables. A flush sends its rows as one batch. A flush too large for one batch
is split into several or rejected, depending on the client and the API; see
your [client's page](/docs/connect/overview/#client-libraries). The protocol,
and some API names such as `getTotalFramesReplayed`, call a batch a *frame*.
The SF substrate treats batches as opaque payloads with two properties: a
length, and a CRC32C checksum. The append protocol writes the payload first,
the checksum last, and a partial write left behind by a crash is detected and
discarded by the recovery scanner on next start.

Batches in SF mode can be replayed against any server connection, weeks or
months later, even after a process restart that wiped all in-memory state.
Every batch carries the full schema for every table it touches, at the cost
of a small per-batch overhead. SYMBOL values travel as numeric ids, and each
symbol string is sent only once. Before it replays, the client registers the
whole dictionary with the new connection from the sender directory's
[`.symbol-dict`](#symbol-dict) file, so the server knows every id a replayed
batch uses.

## The FSN model

Two distinct counters track batch identity:

- **FSN** (frame sequence number) — a monotonic counter assigned when a
  batch is appended to the substrate. FSN survives reconnects and (in SF
  mode) restarts. It is the substrate's permanent identifier for a batch.
- **wireSeq** — a per-connection counter used to correlate cumulative QWP
  responses with sent batches. It resets to `0` on every successful WebSocket
  upgrade.

On every (re)connect the relationship is pinned:

```
fsn = fsnAtZero + wireSeq
```

where `fsnAtZero` is `ackedFsn + 1` (i.e. the next un-acked FSN). The
client streams batches from disk to the wire in strict FSN order, one batch
per WebSocket binary message, incrementing `wireSeq`. The server echoes
back the same `wireSeq` in its OK responses, and the client maps that back to
the original FSN to advance the trim watermark.

Two consequences:

- Batches **must** be sent in strict order. The wire format does not
  serialise `wireSeq` — the server assigns it implicitly from receive
  order. Reordering breaks the FSN mapping.
- After a reconnect, the server sees the **same payloads** at new `wireSeq`
  values. If the server committed a batch but its acknowledgement was lost,
  replay writes those rows again.

## Trim: how unacked data is reclaimed

The substrate holds batches until the server confirms it has received and
processed them. Each confirmation advances the **acked FSN**, which
allows the manager thread to unlink sealed segment files (in SF mode) or
release ring memory (in memory-only mode) up to that watermark.

Two trim drivers exist:

### Default: OK-driven trim

The server acknowledges successful batches with cumulative **OK responses**.
Each one carries the highest `wireSeq` it acknowledges and the per-table
`seqTxn` watermarks that the acknowledged batches updated. On receipt:

1. The substrate translates `wireSeq` back to FSN.
2. `ackedFsn` advances to the new value.
3. Any segment whose last FSN is `≤ ackedFsn` is unlinked and its bytes
   returned to the available pool.

This is the default. It is sufficient when a committed batch is the bar you
need; an OK does not by itself mean that the commit is on the server's disk.
That depends on the server's [commit mode](/docs/concepts/durability/#commit-modes).

### Durable-ack trim

When the connect string sets
[`request_durable_ack`](/docs/connect/clients/connect-string/#durable-ack),
trim is driven by separate durable-ack messages that carry per-table
watermarks:

- `local`: `STATUS_LOCAL_DURABLE_ACK` messages, for commits that are **on the
  server's own disk** (WAL and sequencer record flushed). The server must run in
  [adaptive durability mode](/docs/concepts/durability/).
- `replicated`, or its original name `on`: `STATUS_DURABLE_ACK` frames, for
  data the server has **already uploaded from the WAL to the configured object
  store** (S3, Azure Blob, GCS, or NFS). QuestDB Enterprise only.
- `local,replicated`: `STATUS_DURABLE_ACK` messages drive trim. The
  `STATUS_LOCAL_DURABLE_ACK` messages only report earlier progress.

With any of these values:

- OK responses still arrive, but they no longer advance the trim watermark.
  Instead, they are stashed alongside their per-table `seqTxn` values.
- A durable-ack message names tables and their durable `seqTxn`
  watermarks. The client matches the head of the OK queue against these
  watermarks; each fully-covered head entry pops, and `ackedFsn`
  advances to the highest covered wireSeq.
- The client opt-in is mandatory — the connect fails loudly if the server
  does not confirm every requested tier in `X-QWP-Durable-Ack` on the
  upgrade response. This avoids the silent failure mode where the producer
  waits forever for acknowledgements that will never arrive.

Durable-ack mode is the right choice when the data must be on the server's
disk or in the object store before the client lets go of it, but it has two
costs: a longer time-to-trim (so larger steady-state disk usage in SF mode),
and a small WebSocket PING sent every `durable_ack_keepalive_interval_millis`
to nudge the server's flush path when the client is idle but has pending
confirmations.

See [When to use](/docs/high-availability/store-and-forward/when-to-use/)
for the decision.

## Reconnect and replay

When the wire connection breaks — for any reason — the I/O thread enters
the reconnect loop documented in
[Client failover concepts](/docs/high-availability/client-failover/concepts/).
The producer is **not notified**: it keeps publishing into the substrate,
bounded by `sf_max_total_bytes` (see backpressure below).

On every successful (re)connect:

1. `fsnAtZero = ackedFsn + 1`.
2. `wireSeq` resets to `0`.
3. The read cursor rewinds to the first un-acked batch on disk (or in
   memory).
4. Batches stream to the wire in FSN order. A batch that landed before the
   disconnect but was not acknowledged is sent again and can duplicate rows;
   use table-level `DEDUP UPSERT KEYS` or `DEDUP SKIP KEYS` with stable row
   identity when this must be suppressed.
5. New batches appended by the producer during replay are picked up
   automatically — the I/O loop watches a volatile `publishedFsn`
   cursor.

Batches sent before the disconnect and re-sent after a reconnect count
in the `getTotalFramesReplayed` observability counter.

## Backpressure

The substrate enforces `sf_max_total_bytes` as a hard cap on resident
storage. When the cap is hit, the producer's `appendBlocking` call
busy-spins (with cooperative yield) up to `sf_append_deadline_millis`
waiting for ACK-driven trim to free space. If the deadline fires, the
call throws a typed exception.

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
C, C++, Python, and Node.js. If the wait succeeds, all data is acked. If the
timeout fires:

- in **SF mode**, the un-acked tail is left on disk and recovered by the
  next sender that uses the same sender directory;
- in **memory-only mode**, the un-acked tail is lost.

How the timeout is reported depends on the client. Java logs a `WARN` and
`close()` throws `LineSenderException`, Go's `Close` returns an error, and
Node.js's `close()` rejects with `QwpSenderCloseTimeoutError`. The Node.js
pooled client logs a warning when a sender it closes times out. See your
[client's page](/docs/connect/overview/#client-libraries) for the others.

Setting `close_flush_timeout_millis=0` (or `-1`) skips the drain wait
entirely — useful for fast shutdown paths where you do not want to block.
Even in this branch, the sender directory's lock is released and segments
are unmapped cleanly, and a non-blocking safety-net check rethrows any
latched terminal error that has not already been delivered through an async
handler or a synchronous producer call.

## Crash recovery (SF mode)

When the engine opens an SF-mode sender, it scans the sender directory:

1. **Acquire the directory lock.** Two senders pointing at the same
   `<sf_dir>/<sender_id>/` will collide here and the second one fails to
   start, naming the holder's PID in the error message.
2. **Validate every segment file.** Headers are checked, batches are walked
   forward verifying each CRC. The first invalid or torn batch becomes
   the file's end-of-data; anything past it is discarded.
3. **Reconcile gaps.** Segments are sorted by their `baseSeq` and adjacent
   pairs must satisfy `prev.baseSeq + prev.frameCount == curr.baseSeq`.
   A gap means the chain is incomplete and can't be replayed safely. The
   reference client then sets the sender directory aside and starts on an
   empty one, as described under [`.symbol-dict`](#symbol-dict).
4. **Seed the ack watermark.** Either from `.ack-watermark` (if your
   client maintains it; see below) or from the lowest surviving FSN minus
   one.
5. **Bump the connection generation** so the I/O loop, on first connect,
   replays from disk against a fresh wireSeq window.

After recovery the producer publishes new batches as normal; the I/O
thread replays the un-acked tail and then drains forward.

### `.ack-watermark`

An optional file in the sender directory persists the cumulative
durable-ack FSN across process restarts. Without it, recovery seeds the
ack watermark from the lowest surviving segment's `baseSeq - 1` — which
guarantees no data loss, but cannot distinguish which batches inside that
lowest segment the previous sender had already received durable acks
for. Replay therefore re-sends every batch in that segment, producing
row-level duplicates against a still-alive server unless deduplication is
enabled on the target table. See
[Delivery semantics](/docs/concepts/delivery-semantics/) for the
at-least-once model and the DEDUP recipe.

With `.ack-watermark`, recovery clamps the seed to the higher of the
on-disk and watermarked values, so already-durable-acked batches inside
the lowest surviving segment are not re-replayed.

The file is **optional** — a conformant client may choose not to maintain
it. The reference client does.

### `.symbol-dict` {#symbol-dict}

Each sender directory also holds the sender's SYMBOL dictionary, in a
dot-prefixed side-file, `<sf_dir>/<sender_id>/.symbol-dict`.

QWP sends each symbol string to the server **once per connection** and
thereafter references it by a numeric id. A batch on disk therefore contains
ids, not strings. If the dictionary that assigned those ids were lost, the
replayed batches would reference ids the server has never seen and it would
reject them with
[`STATUS_DICTIONARY_GAP`](/docs/connect/wire-protocols/qwp-ingress-websocket/#status-codes).
Persisting the dictionary alongside the batches is what makes a recovered or
orphan-drained sender directory replayable on a fresh process.

**Write-ahead ordering.** A new symbol is appended to `.symbol-dict` *before*
the batch that references it is published. A crash can therefore leave
dictionary entries with no referencing batch — harmless — but never a batch
whose ids are unknown.

**Durability matches the rest of store-and-forward: no fsync.** Writes go to
the page cache. A process crash (including `SIGKILL`) preserves both the
dictionary and the batches, because the page cache survives. A **host** crash
or power loss can tear the dictionary tail, exactly as it can tear the segment
batches themselves. Use `sf_durability=periodic` if you need checkpoints against
host loss; see
[Configuration](/docs/high-availability/store-and-forward/configuration/).

**Torn tails are detected, not replayed.** The file is CRC-validated on open
and any torn trailing entry is dropped. If the dictionary cannot be rebuilt —
neither from the side-file's intact prefix nor from the surviving batches' own
delta sections — the sender directory is **unreplayable**, and the client sets
it aside rather than shipping batches whose ids nothing still backs. The
reference client raises `UnreplayableSlotException` (its API calls the sender
directory a slot). `Sender.build()` renames the directory to
`<sf_dir>/<sender_id>.unreplayable-<n>`, reports a `DATA_LOSS` error, and
starts the producer on a fresh directory. The background drainer marks an
unreplayable orphan with a `.failed` sentinel so later orphan scans skip it.
No data is silently discarded; the directory is preserved for inspection.

## Orphan adoption

When the foreground sender's connect string sets `drain_orphans=on`, the
engine scans `<sf_dir>/*` at startup for **orphans**: other sender
directories under the same `sf_dir` that contain unacked data and are not
marked `.failed`. For each one, up to
`max_background_drainers` at a time, a background drainer spawns,
acquires the orphan's lock (skipping if another process holds it),
opens a separate WebSocket connection, runs the same recovery + replay
flow, and exits when the orphan is fully drained.

This is the rescue path for a sender that died without draining cleanly,
after a process crash, an OOM kill, or a host reboot. The replacement process takes
the orphan's lock and clears its disk footprint. Without
`drain_orphans=on` the dead sender's data persists on disk indefinitely
until an operator intervenes.

The orphan flow is opt-in because in a multi-tenant deployment with
shared `sf_dir`, blindly draining unknown sender directories may be
surprising.

## Error responses

Not every server response is an OK. An error response carries a category,
and the client applies a policy to it. There is no policy that drops a batch
and carries on:

- `retriable`: reconnect and replay from the acknowledged watermark.
- `retriable_other`: the same, but on the next endpoint.
- `terminal`: stop sending, and fail later calls. In memory-only mode the
  unacknowledged batches are lost when the sender closes. In SF mode the
  rejected batch stays in the sender directory, so a new sender replays it and
  fails the same way until you fix the cause or move the sender directory
  aside.
- `abandoned`: used only with `DATA_LOSS`, which the client raises itself
  when it sets an unreplayable sender directory aside.

| Category | Default policy | Meaning |
|---|---|---|
| `SCHEMA_MISMATCH` | `terminal` | The batch doesn't match the table: a missing column, a type clash, or no such table. Replaying the same bytes fails the same way. |
| `PARSE_ERROR` | `terminal` | The server can't parse the batch. Almost certainly a client bug. |
| `SECURITY_ERROR` | `terminal` | Authentication or authorization failure on a writable node. |
| `WRITE_ERROR` | `retriable` | The table isn't accepting writes right now, for example while it is suspended. |
| `INTERNAL_ERROR` | `retriable` | Catch-all server fault. |
| `DICTIONARY_GAP` | `retriable` | The batch uses symbol ids the connection hasn't registered. The client registers the dictionary again and replays. |
| `NOT_WRITABLE` | `retriable_other` | The node can't serve writes, such as a read-only replica or a demoting primary. Reserved: current servers close the connection instead. |
| `UNKNOWN` | `retriable` (forced) | A status the client doesn't recognize, from a newer server. |
| `PROTOCOL_VIOLATION` | `terminal` (forced) | The server rejected the same batch `max_frame_rejections` times in a row with no acknowledgement in between, so replaying it can't succeed. |
| `DATA_LOSS` | `abandoned` | Client-side: the rows in a set-aside sender directory will never be sent. Page on this one. |

The `on_*_error` connect-string keys override the defaults that aren't
forced; see
[Error handling](/docs/connect/clients/connect-string#error-handling) for
which clients apply them.

Errors are also delivered to an **error inbox** — a bounded queue
consumed by a daemon dispatcher that invokes your registered handler.
Overflow drops the oldest entry rather than the newest (watermarks are
monotonic; the latest entry is the most informative). The default
handler logs every received error: silence is forbidden by the contract,
because a buggy or no-op handler would hide data loss
indistinguishably from a healthy connection.

## Next steps

- [When to use](/docs/high-availability/store-and-forward/when-to-use/) —
  decision guide for memory-only vs SF mode, and when to opt into
  durable-ack and orphan adoption.
- [Operating and tuning](/docs/high-availability/store-and-forward/operating-and-tuning/) —
  sender directory layout, lock semantics, sizing, observability.
- [Configuration](/docs/high-availability/store-and-forward/configuration/) —
  connect-string key reference.
- [Client failover concepts](/docs/high-availability/client-failover/concepts/) —
  how the reconnect loop selects hosts and classifies errors.
