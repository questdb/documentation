---
title: Live views
description:
  "Live view server settings: refresh worker pool size, per-view memory limit,
  in-memory tier buffers, checkpoints, and out-of-order repair budgets."
---

These settings control live view SQL support, the refresh worker pool, and the
background refresh job that maintains live views incrementally. For a conceptual
overview, see [Live views](/docs/concepts/live-views/).

Live view refresh runs on its own worker pool, separate from the
[materialized view](/docs/configuration/materialized-views/) refresh pool. Size
it with [`live.view.refresh.worker.count`](#liveviewrefreshworkercount).

## cairo.live.view.checkpoint.compaction.interval

- **Default**: `0` (disabled)
- **Reloadable**: no

Number of checkpoint seals between physical compaction attempts. Compaction
repacks live state pages from sparse data segments so obsolete segments can be
reclaimed. A value of `0` disables compaction. Without compaction, a superseded
page is reclaimed only once its whole segment becomes unreferenced, so dead
bytes left behind by out-of-order repairs can accumulate. Enable it for views
that receive frequent out-of-order corrections.

## cairo.live.view.checkpoint.max.duration.micros

- **Default**: `300000000` (5 minutes)
- **Reloadable**: no

Maximum wall-clock interval, in microseconds, between head-checkpoint writes.
This caps restart and out-of-order replay work for low-rate views that do not
reach the row-count trigger.

## cairo.live.view.checkpoint.purge.interval

- **Default**: `1`
- **Reloadable**: no

Number of checkpoint seals between sweeps that delete checkpoint segments no
longer referenced by any checkpoint generation. A value of `0` disables the
periodic sweep. Unreferenced segments are then reclaimed only by the sweep that
runs once per server start, so their disk space is not released until a
restart.

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

Number of live view output rows applied since the previous head checkpoint after
which the refresh worker writes a new one. Smaller values shorten restart and
out-of-order replay at the cost of more checkpoint writes. The value is also the
per-turn row budget of the initial seed sweep, so lowering it also shortens each
seed turn.

## cairo.live.view.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables SQL support and the refresh job for live views. When
disabled, `CREATE LIVE VIEW` fails with `live views are disabled`, and existing
live views are neither refreshed nor listed in
[`live_views()`](/docs/query/functions/meta/#live_views). They stay queryable as
plain tables without their in-memory tier, and the base table's WAL is no longer
retained on their behalf. Re-enabling live views rebuilds each existing view
from the applied base table without invalidating it.

## cairo.live.view.flush.retry.max

- **Default**: `5`
- **Reloadable**: no

Maximum number of consecutive failed refresh cycles, such as a failed flush to
the view's disk tier, before the view is marked invalid. The view is invalidated
as soon as either this count or
[`cairo.live.view.flush.retry.max.duration.micros`](#cairoliveviewflushretrymaxdurationmicros)
is exhausted. Failures caused by a transiently missing base table count only
against the duration budget. A breach of
[`cairo.live.view.refresh.memory.limit.bytes`](#cairoliveviewrefreshmemorylimitbytes)
invalidates the view without any retry.

## cairo.live.view.flush.retry.max.duration.micros

- **Default**: `60000000` (60 seconds)
- **Reloadable**: no

Maximum time, in microseconds, that a view may keep failing refresh cycles
before it is marked invalid. See
[`cairo.live.view.flush.retry.max`](#cairoliveviewflushretrymax) for how the two
budgets interact.

## cairo.live.view.in.memory.buffer.growth.bytes

- **Default**: `16777216` (16 MiB)
- **Reloadable**: no

Bytes of aged rows that the in-memory tier may hold before a refresh compacts
it. Aged rows are rows already flushed to disk and older than the view's
`IN MEMORY` window. Until this many bytes of aged rows accumulate, refresh keeps
appending in place; once they do, it swaps to a compacted buffer that evicts
them. The value therefore bounds how much RAM the tier holds beyond the
`IN MEMORY` window. A value of `0` or less compacts on every publish. Accepts a
size suffix such as `16M`.

## cairo.live.view.in.memory.buffer.initial.bytes

- **Default**: `65536` (64 KiB)
- **Reloadable**: no

Initial size of each column buffer in the in-memory tier. The tier keeps two
buffer slots, and each slot holds one buffer per output column. Accepts a size
suffix such as `64K`.

## cairo.live.view.in.memory.max

- **Default**: `3600000000` (60 minutes)
- **Reloadable**: no

Upper bound on the `IN MEMORY` retention window. A `CREATE LIVE VIEW` whose
`IN MEMORY` (or defaulted `FLUSH EVERY`) exceeds this value is rejected.

## cairo.live.view.partition.compact.threshold

- **Default**: `100000`
- **Reloadable**: no

Threshold for the sweep that drops anchored-window partition state left behind
the previous anchor boundary. The sweep runs only when all of the following
hold: the anchor map has more partitions than this value, at least this many of
them are reclaimable, and the reclaimable partitions make up at least half of
the map. Only anchors that return `TIMESTAMP` and advance with the designated
timestamp compact. An anchor value that is not monotonic or is `NULL`, and any
`ANCHOR EXPRESSION` that returns `LONG` or `INT`, never compacts.

## cairo.live.view.refresh.memory.limit.bytes

- **Default**: `0` (unlimited)
- **Reloadable**: yes

Per-live-view limit on tracked native memory. It covers persistent window state,
the `IN MEMORY` recent-row tier, staging memory, and transient buffers such as
Parquet row-group decode buffers. Exceeding the limit invalidates the view
immediately; recovery requires dropping and recreating it. Process-wide
out-of-memory errors are not limit breaches and are retried instead.

This is one of the four workload
[memory limits](/docs/configuration/cairo-engine/#memory-limits) and counts
tracked native allocations only. A view acquires the limit when it is first
compiled and keeps it until it is dropped or invalidated, so the limit applies
to the view's running footprint across refreshes rather than to a single cycle.
Persistent state grows with the number of distinct partition keys the view has
seen and does not shrink when keys go quiet, and the in-memory tier does not
shrink after a burst. A limit sized from an early measurement can therefore be
breached later without any change in workload. A reloaded value reaches an
existing view only after it is recreated or the server restarts.

Size the limit above the refresh workload's allocation floor. In particular, a
`RANGE` frame, or a `ROWS` frame or `lag()` with `PARTITION BY`, allocates at
least one `cairo.sql.window.store.page.size` page (1 MiB by default) on its
first partition, and a Parquet-backed refresh may decode a complete row group.

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

## live.view.refresh.worker.affinity

- **Default**: none
- **Reloadable**: no

Comma-separated list of CPU core indexes, one per refresh worker.

## live.view.refresh.worker.count

- **Default**: `2` on hosts with up to 8 CPU cores, `3` on up to 32 cores, `4`
  on larger hosts
- **Reloadable**: no

Number of worker threads that refresh live views. A single view is refreshed by
one worker at a time, so more workers help when several views are busy at once,
not when one view is slow.

A value of `0` turns live view refresh off. `CREATE LIVE VIEW` then fails, and
existing views behave as described for
[`cairo.live.view.enabled`](#cairoliveviewenabled) set to `false`.

## live.view.refresh.worker.haltOnError

- **Default**: `false`
- **Reloadable**: no

Flag that indicates if a refresh worker thread must stop when an unexpected
error occurs.

## live.view.refresh.worker.nap.threshold

- **Default**: `7000`
- **Reloadable**: no

Number of idle worker-loop iterations before a refresh worker naps.

## live.view.refresh.worker.sleep.threshold

- **Default**: `10000`
- **Reloadable**: no

Number of idle worker-loop iterations before a refresh worker sleeps.

## live.view.refresh.worker.sleep.timeout

- **Default**: `10ms`
- **Reloadable**: no

Sleep duration when a refresh worker has no views to refresh.

## live.view.refresh.worker.yield.threshold

- **Default**: `1000`
- **Reloadable**: no

Number of idle worker-loop iterations before a refresh worker yields.
