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

## cairo.live.view.checkpoint.compaction.interval

- **Default**: `0` (disabled)
- **Reloadable**: no

Number of checkpoint seals between physical compaction attempts. Compaction
repacks live state pages from sparse data segments so obsolete segments can be
reclaimed. A value of `0` disables compaction.

## cairo.live.view.checkpoint.max.duration.micros

- **Default**: `300000000` (5 minutes)
- **Reloadable**: no

Maximum wall-clock interval, in microseconds, between head-checkpoint writes.
This caps restart and out-of-order replay work for low-rate views that do not
reach the row-count trigger.

## cairo.live.view.checkpoint.repair.replay.max.rows

- **Default**: `1000000`
- **Reloadable**: no

Maximum base rows a localized out-of-order repair replays in one refresh turn. A
larger repair pauses at a timestamp-group boundary and continues in a later turn
without publishing partial output. The refresh-turn duration limit also applies.
A value of `0` or less disables this row budget.

## cairo.live.view.checkpoint.repair.scan.max.keys

- **Default**: `100000`
- **Reloadable**: no

Maximum partition keys inspected while planning a localized `ROWS` repair. If
planning crosses the limit, QuestDB uses an unlocalized repair instead. A value
of `0` or less disables this key budget.

## cairo.live.view.checkpoint.repair.scan.max.rows

- **Default**: `1000000`
- **Reloadable**: no

Maximum base rows scanned while discovering the bounds of a localized `ROWS`
repair. This includes rows later discarded by the view's `WHERE` filter. If the
limit is crossed, QuestDB uses the conservative unlocalized bound. A value of
`0` or less disables this scan budget.

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

Fast-path growth budget for the in-memory tier. Once the published buffer's
footprint reaches this size, refresh falls back to a swap that evicts expired
rows and may shrink the buffer instead of continuing to append in place. Raise
it for `IN MEMORY` windows expected to exceed the default. A value of `0` or
less forces this compaction path on every publish. Accepts a size suffix such as
`16M`.

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

Anchor-map tombstone threshold that triggers compaction. Compaction also runs
when tombstones exceed half of the anchor map, regardless of this absolute
threshold.

## cairo.live.view.refresh.memory.limit.bytes

- **Default**: `0` (unlimited)
- **Reloadable**: yes

Per-live-view limit on the peak memory used during a refresh cycle. It includes
persistent window state, the `IN MEMORY` recent-row tier, staging memory, and
transient buffers such as Parquet row-group decode buffers. Exceeding the limit
invalidates the view immediately; recovery requires dropping and recreating it.

Size the limit above the refresh workload's allocation floor. In particular, a
bounded `ROWS` frame allocates at least one `cairo.sql.window.store.page.size`
page (1 MiB by default), and a Parquet-backed refresh may decode a complete row
group.

## cairo.live.view.refresh.turn.max.commits

- **Default**: `64`
- **Reloadable**: no

Maximum number of base-table commits a refresh worker processes in a single turn
before yielding to other views.

## cairo.live.view.refresh.turn.max.duration.micros

- **Default**: `50000` (50 milliseconds)
- **Reloadable**: no

Maximum wall-clock time, in microseconds, a refresh worker spends on one view
per turn before yielding.
