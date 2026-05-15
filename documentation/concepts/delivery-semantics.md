---
title: Delivery semantics
sidebar_label: Delivery semantics
description:
  How QuestDB clients deliver data (at-least-once), where duplicate rows can
  arise, and how to combine designated timestamps with deduplication for
  exactly-once outcomes.
---

QuestDB clients deliver data **at-least-once**: every row your application
publishes is guaranteed to reach the server, but under failure it may arrive
more than once. Storing each row exactly once is the application's
responsibility, and QuestDB provides the mechanisms to make it routine.

This page explains where duplicates come from and how to suppress them.

## At-least-once vs exactly-once

| Property | Meaning | Where it comes from |
|----------|---------|---------------------|
| **At-most-once** | Each row reaches the server zero or one times. Rows can be lost. | A "fire and forget" client that does not retransmit on failure. |
| **At-least-once** | Each row reaches the server one or more times. No row is lost; duplicates are possible. | A client that retransmits unacknowledged data after a transport error. **This is the QuestDB client default.** |
| **Exactly-once** | Each row is stored exactly once. | At-least-once delivery plus server-side deduplication on a key covering row identity. |

QuestDB's clients retransmit unacknowledged batches after transport errors,
host failovers, and process restarts. The trade-off is deliberate: losing
data silently is the worse failure mode. The cost is that the application
must tolerate or suppress duplicates.

## Where duplicates come from

Three replay paths can resend rows the server already accepted.

### Client retry on transport error

The client buffers unacknowledged rows. When the connection breaks before
the server confirms a batch, the client reconnects and re-sends. If the
server had already committed the batch but the acknowledgement was lost in
flight, the second send produces duplicates.

This path applies to every QuestDB client deployment.

### Multi-host failover replay

In a [multi-host](/docs/high-availability/client-failover/concepts/)
Enterprise deployment, the client carries a list of peers. When the primary
fails over to a replica, the client redirects to the new primary and
replays any batches it had not yet seen acknowledged. If the dying primary
committed those batches before the failover took effect, the new primary
applies them again on replay.

### Store-and-forward replay across sender restarts

With [store-and-forward](/docs/high-availability/store-and-forward/concepts/)
enabled, the client persists outgoing frames to disk. After a sender
process crash or restart, the next sender instance reads the on-disk queue
and replays everything past the durable-ack watermark. The window between
"the server applied the frame" and "the client recorded the ack" is
exactly the window in which replay produces duplicates.

This path applies only when `sf_dir` is set on the connect string.

## Achieving exactly-once

Three things must hold:

1. **A user-assigned designated timestamp.** The application chooses the
   timestamp for each row (event time), not the server. Server-assigned
   timestamps — `atNow()`, `at_now()`, omitting `at()` — change between
   the original send and the replay, so the two rows are not identical and
   deduplication cannot match them.
2. **A [deduplication](/docs/concepts/deduplication/) key covering row
   identity.** Declare `DEDUP UPSERT KEYS(...)` on the target table with
   keys that uniquely identify a logical event. The designated timestamp
   is always part of the key; add any other columns needed to distinguish
   two events that share a timestamp.
3. **Stable values across retransmits.** Any column that participates in
   row identity must be derived deterministically from the source event —
   not from wall-clock time at the moment of sending, and not from a
   per-attempt counter.

When those three hold, the server treats a replayed batch as already-seen
and skips the write.

## Recipe

Define the table with DEDUP on the columns that identify a unique event:

```questdb-sql
CREATE TABLE trades (
    ts TIMESTAMP,
    symbol SYMBOL,
    side SYMBOL,
    price DOUBLE,
    qty DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY WAL
DEDUP UPSERT KEYS(ts, symbol, side);
```

In the publishing client, set `ts` explicitly to the event time:

```java
sender.table("trades")
      .symbol("symbol", "ETH-USD")
      .symbol("side", "buy")
      .doubleColumn("price", 2615.54)
      .doubleColumn("qty", 0.5)
      .at(eventInstant);   // not atNow()
```

If two distinct events can share `(ts, symbol, side)` and both should be
preserved, widen `UPSERT KEYS` to include a column that distinguishes them
— for example a `trade_id` or `seq` column.

:::warning DEDUP is required on tables behind multi-host failover

When the client fails over from one primary to another, unacknowledged
batches are replayed against the new primary. Without `DEDUP UPSERT KEYS`
covering row identity, those replays produce duplicate rows in the target
table.

:::

## When at-least-once is enough

DEDUP has a cost: the server compares each incoming row against existing
rows with the same keys. For most workloads the cost is invisible; for
high-cardinality keys or heavily out-of-order data, it adds work to the
write path.

If your application tolerates occasional duplicates — counting events with
a small tolerance, aggregating over a window where one extra row shifts
the average by a negligible amount, append-only logs where uniqueness is
not meaningful — you can skip DEDUP and rely on at-least-once delivery
directly.

The decision is per-table, not per-deployment: enable DEDUP on the tables
that need exactly-once, leave it off on the tables that don't.

## Related Enterprise features

These features change *where* the replay window opens, but do not change
the guarantee — at-least-once still applies, and DEDUP is still the
mechanism that achieves exactly-once.

- **Durable ACK**
  ([`request_durable_ack=on`](/docs/connect/clients/connect-string#durable-ack))
  — the server delays the per-batch acknowledgement until the WAL is
  shipped to object storage. This narrows the replay window after primary
  failover but does not eliminate it.
- **[Store-and-forward](/docs/high-availability/store-and-forward/concepts/)**
  — provides at-least-once across sender process restarts. Replay
  semantics from this page apply.
- **[Multi-host client failover](/docs/high-availability/client-failover/concepts/)**
  — provides at-least-once across primary failovers. Replay semantics
  from this page apply.

## See also

- [Deduplication](/docs/concepts/deduplication/) — the server-side
  mechanism that makes exactly-once achievable.
- [Designated timestamp](/docs/concepts/designated-timestamp/) — required
  for DEDUP and for explicit-timestamp publishing.
- [Write-ahead log](/docs/concepts/write-ahead-log/) — when the server
  considers a batch durable.
- [Client failover concepts](/docs/high-availability/client-failover/concepts/)
  — the multi-host replay path in detail.
- [Store-and-forward concepts](/docs/high-availability/store-and-forward/concepts/)
  — the sender-restart replay path in detail.
