---
title: Live views
description: Configuration settings for live views in QuestDB.
---

These settings control live view SQL support and the background refresh job that
maintains live views incrementally. For a conceptual overview, see
[Live views](/docs/concepts/live-views/).

Live view refresh shares the materialized view refresh worker pool, so the
worker-pool settings under
[Materialized views](/docs/configuration/materialized-views/)
(`mat.view.refresh.worker.count`, `.affinity`, `.haltOnError`) also govern live
view refresh. There are no dedicated live-view worker-pool properties.

## cairo.live.view.checkpoint.max.duration.micros

- **Default**: `300000000` (5 minutes)
- **Reloadable**: no

Time budget, in microseconds, for a single checkpoint write turn. Checkpoints let
a restart or out-of-order replay resume without rebuilding the whole view.

## cairo.live.view.checkpoint.rows

- **Default**: `1000000`
- **Reloadable**: no

Number of newly flushed rows after which the refresh worker writes a head
checkpoint. Smaller values shorten restart replay at the cost of more checkpoint
writes.

## cairo.live.view.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables SQL support and the refresh job for live views. When
disabled, `CREATE LIVE VIEW` fails with `live views are disabled`.

## cairo.live.view.flush.retry.max

- **Default**: `5`
- **Reloadable**: no

Maximum number of consecutive flush attempts before a view is marked invalid. A
flush persists the in-memory rows to the view's disk tier.

## cairo.live.view.flush.retry.max.duration.micros

- **Default**: `60000000` (60 seconds)
- **Reloadable**: no

Maximum total time, in microseconds, spent retrying a stalled flush before the
view is marked invalid.

## cairo.live.view.in.memory.buffer.growth.bytes

- **Default**: `16777216` (16 MiB)
- **Reloadable**: no

Increment by which the in-memory tier's buffer arena grows when it needs more
capacity. Accepts a size suffix such as `16M`.

## cairo.live.view.in.memory.buffer.initial.bytes

- **Default**: `65536` (64 KiB)
- **Reloadable**: no

Initial size of a live view's in-memory tier buffer. Accepts a size suffix such
as `64K`.

## cairo.live.view.in.memory.max

- **Default**: `3600000000` (60 minutes)
- **Reloadable**: no

Upper bound on the `IN MEMORY` retention window. A `CREATE LIVE VIEW` whose
`IN MEMORY` (or defaulted `FLUSH EVERY`) exceeds this value is rejected.

## cairo.live.view.partition.compact.threshold

- **Default**: `100000`
- **Reloadable**: no

Row-count threshold at which an anchored live view compacts a partition's
per-function state. Compaction fires when a partition's anchor-map entry count
exceeds this value and the frontier has advanced. Applies only to anchored views
whose anchor is a monotone, fixed-duration-unit timestamp expression.

## cairo.live.view.refresh.turn.max.commits

- **Default**: `64`
- **Reloadable**: no

Maximum number of base-table commits a refresh worker processes in a single turn
before yielding to other views.

## cairo.live.view.refresh.turn.max.duration.micros

- **Default**: `50000` (50 milliseconds)
- **Reloadable**: no

Maximum wall-clock time, in microseconds, a refresh worker spends on one view per
turn before yielding.
