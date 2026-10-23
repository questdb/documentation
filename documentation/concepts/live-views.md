---
title: Live views
sidebar_label: Live views
description:
  Live views incrementally maintain window-function results over a base table so
  that running totals, moving averages, and rankings can be read like a regular
  table without recomputing on every query.
---

A live view is a QuestDB table that stores the incrementally maintained result
of a window-function query over a single base table. As new rows arrive in the
base table, the window functions run once per new row and the results are
written to the view. Querying the live view then scans precomputed rows instead
of reprocessing the base table on every read.

Live views target workloads where the same window aggregate is read frequently
against high-rate ingestion: rolling VWAP, cumulative volume, running ranks, or
day-over-day comparisons that would otherwise recompute a window over millions
of rows on each query.

:::note

Live views are currently released as beta. The supported SQL surface is deliberately narrow
in this first version. See [Limitations](#limitations) for the shapes that are
rejected at creation time.

:::

## Live views vs materialized views

Both feature types pre-compute a query and refresh it incrementally, but they
serve different query shapes:

| Aspect | Live view | [Materialized view](/docs/concepts/materialized-views/) |
| ------ | --------- | --------------------- |
| Query shape | Window functions (`OVER`) | `SAMPLE BY` / time-based `GROUP BY` |
| Output cardinality | One row per base row that passes `WHERE` | One row per time bucket |
| Typical use | Running totals, moving averages, rankings | OHLC bars, downsampled summaries |
| Base tables | A single WAL-backed table | One or more tables (JOINs allowed) |
| Freshness / durability | `FLUSH EVERY`, `IN MEMORY` | `REFRESH` strategy |

Use a materialized view when you want to aggregate rows into time buckets. Use a
live view when you want to keep a row-per-input result of a window computation.

## Quick example

Given a `trades` table of incoming trades:

```questdb-sql title="Base table"
CREATE TABLE trades (
  symbol SYMBOL,
  side SYMBOL,
  price DOUBLE,
  amount DOUBLE,
  timestamp TIMESTAMP
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

Create a live view that keeps a moving average of price per symbol over each
trade and the 300 trades before it:

```questdb-sql title="Live view with a moving average"
CREATE LIVE VIEW trades_ma
FLUSH EVERY 1s
IN MEMORY 5s
START FROM NOW
AS
SELECT
  timestamp,
  symbol,
  price,
  avg(price) OVER (
    PARTITION BY symbol
    ORDER BY timestamp
    ROWS 300 PRECEDING
  ) AS moving_avg
FROM trades;
```

Query it like any table:

```questdb-sql title="Query the live view"
SELECT * FROM trades_ma;
```

The view updates incrementally as new rows arrive in `trades`. Each new trade
produces one output row carrying its moving average. Queries see new rows as
soon as they are refreshed, without waiting for a flush; see
[Freshness](#freshness).

## How live views work

A live view is its own WAL-backed table maintained by a background refresh
worker. The worker reads new committed rows from the base table and runs the
view's window functions over them, writing the output to the view. Two
independent cadences govern how that output becomes visible and durable:

- **Refresh** runs continuously. As the worker computes output rows, it appends
  them to an in-memory tier. This is what keeps the view fresh.
- **Flush** runs on the `FLUSH EVERY` cadence. It persists the in-memory rows to
  the live view's own WAL-backed disk tier and advances a durability checkpoint.

Reads combine both tiers. Recent rows are served from the in-memory tier and the
older prefix from disk, so a query sees the freshest computed rows without
waiting for a flush.

The view is not append-only. When a base row arrives out of order, with a
timestamp below rows the view has already emitted, QuestDB recomputes and
replaces the view's rows at or after that timestamp. A consumer that polls the
view only for rows newer than the last timestamp it has seen misses these
corrections. If the base table receives out-of-order data, re-read a trailing
time range that covers how late base rows can arrive.

Views over [deduplicated](/docs/concepts/deduplication/) base tables, and every
live view on a QuestDB Enterprise read-only replica, work differently: they
refresh and flush together on the `FLUSH EVERY` cadence, with no in-memory rows
ahead of the disk tier.

### Freshness

Because refresh publishes to the in-memory tier ahead of flush, queries see
refreshed rows without waiting for `FLUSH EVERY`, which is a durability and
write-amplification control, not a freshness control. This covers full-row
reads, projections and aggregates over the view, `WHERE` filters including
designated-timestamp intervals, and a live view used as the right-hand side of
an [`ASOF JOIN`](/docs/query/sql/asof-join/) or `LT JOIN`.

The following reads are served from the disk tier only and can trail by up to
one `FLUSH EVERY` interval:

- [`LATEST ON`](/docs/query/sql/latest-on/) queries over the view
- Any read of a view over a deduplicated base table, or of a view on an
  Enterprise read-only replica, because these views have no in-memory rows
  ahead of disk
- Occasionally, a query that races a flush, which falls back to the disk tier
  for that query only

Keep `FLUSH EVERY` small (for example `1s`) so this lag stays negligible.

:::tip

A live view falling behind sustained ingestion stays correct but grows stale.
There is no automatic throttle. See [Monitoring](#monitoring) for how to
interpret lag and detect a view that cannot keep up.

:::

## Supported window functions

Live views maintain window functions whose result can be computed incrementally
in a single forward pass and whose state can be checkpointed. Whether a function
is accepted depends on the window it runs over: a bounded frame such as
`ROWS 300 PRECEDING` or `RANGE '1' HOUR PRECEDING`, or an
[anchored window](#anchored-windows) that accumulates from a reset boundary.

| Function | Bounded `ROWS` | Bounded `RANGE` | Anchored |
| -------- | -------------- | --------------- | -------- |
| `avg`, `count`, `first_value`, `max`, `min`, `nth_value`, `sum` | Yes | Yes | Yes |
| `ksum` | Yes | No | Yes |
| `last_value` | Yes | Yes | Yes, except with `IGNORE NULLS` |
| `lag` | Yes | Yes | Yes |
| `dense_rank`, `rank`, `row_number` | No | No | Yes |
| `corr`, `covar_pop`, `covar_samp` | No | No | Yes |
| `stddev`, `stddev_pop`, `stddev_samp`, `var_pop`, `var_samp`, `variance` | No | No | Yes |
| EMA and VWEMA, `avg(value, kind, param [, volume])` | No | No | Yes |

The statistical functions, EMA, and VWEMA run only in an anchored window, so
they return a cumulative value since the last anchor boundary, such as a
session-to-date standard deviation. Over a bounded frame, the statistical
functions fail with
`incremental snapshot is not supported for this function yet`, and EMA and VWEMA
do not accept a frame clause at all. For a rolling standard deviation, see
[Rolling standard deviation](#rolling-standard-deviation).

```questdb-sql title="Session-to-date volatility per symbol"
CREATE LIVE VIEW trades_session_stats
FLUSH EVERY 1s
START FROM NOW
AS
SELECT
  timestamp,
  symbol,
  price,
  avg(price) OVER w AS session_avg,
  stddev_samp(price) OVER w AS session_stddev
FROM trades
WINDOW w AS (
  PARTITION BY symbol
  ORDER BY timestamp
  ANCHOR DAILY '00:00'
);
```

The following rules also apply:

- **`PARTITION BY` is required.** Every window function needs a `PARTITION BY`
  clause. The only exception is a `last_value` without `IGNORE NULLS` whose
  frame ends at `CURRENT ROW`, which keeps no state.
- **Partition keys must be checkpointable.** `VARCHAR`, `UUID`, `LONG256`,
  `DECIMAL`, `BINARY`, and array keys are rejected with
  `incremental snapshot is not supported for this function yet`. In a bounded
  window, cast a `VARCHAR` key to `SYMBOL` or `STRING`, for example
  `PARTITION BY venue::symbol` for a `VARCHAR` column `venue`. An anchored
  window must partition by base columns directly.
- **Frames must not start at `UNBOUNDED PRECEDING`.** A window without a frame
  clause, such as `OVER (PARTITION BY symbol ORDER BY timestamp)`, defaults to a
  frame that starts at `UNBOUNDED PRECEDING`. Such windows are rejected unless
  they are anchored. `last_value` without `IGNORE NULLS` is the only exception.
- **`RANGE` frames share one domain.** A `RANGE` frame must order by the
  designated timestamp ascending, and all `RANGE` window functions in one view
  must use the same `PARTITION BY` and `ORDER BY`.
- **`lag` needs a frame or an anchor.** `lag` ignores the frame, but a bare
  `OVER (PARTITION BY ... ORDER BY ...)` counts as unbounded, so give it an
  explicit bounded frame or an anchored window. In an anchored window, `lag`
  returns `NULL` for the first row after each boundary. `lag(value, 0)` and
  `lag` over a `DECIMAL` with precision above 18 are rejected.
- **No look-ahead or multi-pass functions.** `lead`, `percent_rank`,
  `cume_dist`, and `ntile` are rejected.

Columns of any type, including `VARCHAR`, `BINARY`, and arrays, can appear as
pass-through output columns. `count` also accepts `STRING`, `VARCHAR`, and
`SYMBOL` arguments, but not `BINARY` or arrays. Window function results can be
combined in projection expressions.

### Rolling standard deviation

Because the statistical functions run only in anchored windows, compute a
rolling standard deviation from bounded averages instead. The population
standard deviation is the square root of `avg(x * x) - avg(x) * avg(x)`, which a
live view can maintain over any bounded frame. This view keeps 20-trade
Bollinger bands per symbol:

```questdb-sql title="Rolling 20-trade Bollinger bands"
CREATE LIVE VIEW trades_bollinger
FLUSH EVERY 1s
START FROM NOW
AS
SELECT
  timestamp,
  symbol,
  price,
  avg(price) OVER w AS sma20,
  sqrt(greatest(
    avg(price * price) OVER w - avg(price) OVER w * avg(price) OVER w,
    0
  )) AS stddev20
FROM trades
WINDOW w AS (PARTITION BY symbol ORDER BY timestamp ROWS 19 PRECEDING);
```

```questdb-sql title="Read the bands"
SELECT
  timestamp,
  symbol,
  price,
  sma20 - 2 * stddev20 AS lower_band,
  sma20 + 2 * stddev20 AS upper_band
FROM trades_bollinger
WHERE symbol = 'BTC-USDT'
LIMIT -10;
```

`greatest(..., 0)` guards against tiny negative values from floating-point
rounding when prices are flat.

For the sample standard deviation that `stddev_samp` returns, multiply the
variance by `n / (n - 1)`, where `n` is `count(price) OVER w`. Write the
denominator as `n - 1.0`: QuestDB divides integers as integers, so `n / (n - 1)`
evaluates to `1` and leaves the population value unchanged.

```questdb-sql title="Sample standard deviation over the same window"
sqrt(greatest(
  (avg(price * price) OVER w - avg(price) OVER w * avg(price) OVER w)
    * count(price) OVER w / (count(price) OVER w - 1.0),
  0
)) AS stddev20_samp
```

The first row of each symbol reads `0` here, where `stddev_samp` returns `NULL`.

## Anchored windows

An anchored window resets its cumulative aggregate on a boundary, which is
useful for running totals that restart each day or on a period boundary. Declare
it in a named window with either `ANCHOR DAILY 'HH:MM' ['timezone']` or an
`ANCHOR EXPRESSION` clause:

```questdb-sql title="Cumulative daily volume per symbol"
CREATE LIVE VIEW trades_daily_volume
FLUSH EVERY 1s
START FROM NOW
AS
SELECT
  timestamp,
  symbol,
  sum(amount) OVER w AS cumulative_volume
FROM trades
WINDOW w AS (
  PARTITION BY symbol
  ORDER BY timestamp
  ANCHOR DAILY '00:00'
);
```

`ANCHOR DAILY` resets at the specified wall-clock time. Without a time zone, the
time is interpreted in UTC; add an IANA time zone such as `'America/New_York'`
when the boundary follows local civil time.

An anchored window must be a named window, must partition by base-table columns,
must order by the designated timestamp ascending, and must use the default
frame: an explicit `ROWS` frame or a bounded `RANGE` frame is rejected. A live
view supports at most one anchored window, and at least one window function must
reference it directly with `OVER w`. An anchor expression must be deterministic
and return `TIMESTAMP`, `LONG`, or `INT`.

## Start boundary and historical data

Every live view has a mandatory `START FROM` clause that defines an event-time
lower bound for its rows:

- `START FROM NOW` resolves to the creation time.
- `START FROM BEGINNING` includes all base-table history.
- `START FROM 'timestamp'` includes rows at or after the specified timestamp.

The boundary is inclusive and is evaluated against the base table's designated
timestamp, not commit time. Rows below the boundary neither appear in the view
nor contribute to window state, and late out-of-order rows below it are dropped
and counted in the `o3_rejected_count` column of
[`live_views()`](/docs/query/functions/meta/#live_views). If qualifying rows
already exist when the view is created, QuestDB seeds them before switching to
continuous refresh.

```questdb-sql title="Include all existing history"
CREATE LIVE VIEW trades_ma
FLUSH EVERY 1s
START FROM BEGINNING
AS
SELECT
  timestamp,
  symbol,
  avg(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS 300 PRECEDING)
    AS moving_avg
FROM trades;
```

The seed sweep is resumable: it checkpoints its progress and continues after a
restart. `START FROM NOW` can still seed existing future-dated rows whose
designated timestamps are at or above the resolved creation-time boundary.

## Base table lifecycle

A live view is tied to a single WAL-backed base table and tracks the exact set of
base columns its query references, including columns used only in its `WHERE`
filter:

- Schema changes to columns the view does not reference pass through
  transparently and the view keeps refreshing.
- Dropping, renaming, or changing the type of a referenced column invalidates the
  view.
- Renaming or dropping the base table invalidates the view.
- An [`UPDATE`](/docs/query/sql/update/) that changes base-table rows
  invalidates the view, even when it changes only columns the view does not
  reference.
- [`ALTER TABLE REBASE WAL`](/docs/query/sql/alter-table-rebase-wal/) on the
  base table invalidates the view.
- Exceeding
  [`cairo.live.view.refresh.memory.limit.bytes`](/docs/configuration/live-views/#cairoliveviewrefreshmemorylimitbytes)
  during a refresh invalidates the view. Before setting that limit, measure
  what a refresh needs as described in
  [Sizing a limit](/docs/configuration/cairo-engine/#sizing-a-limit).
- Refresh failures that exhaust the
  [`cairo.live.view.flush.retry.max`](/docs/configuration/live-views/#cairoliveviewflushretrymax)
  retry budget invalidate the view.
- `DROP PARTITION`, `TRUNCATE`, and base TTL eviction keep the view valid. Rows
  the view already emitted for the removed data stay in the view. Window state
  is not reset, so later rows can still reflect values from removed rows, and a
  later out-of-order commit can recompute emitted rows above the removed range
  from the remaining base data.

An invalidated view keeps serving its existing data and reports the reason in
[`live_views()`](/docs/query/functions/meta/#live_views), for example
`drop column operation [column=price]` or `update operation`. It stops
refreshing. Invalidation is permanent: reversing the schema change does not
automatically revalidate the view, and
[`ALTER LIVE VIEW RESUME WAL`](/docs/query/sql/alter-live-view-resume-wal/) only
recovers a suspended WAL writer.

To recover, inspect `invalidation_reason`, repair the base-table schema or
raise
[`cairo.live.view.refresh.memory.limit.bytes`](/docs/configuration/live-views/#cairoliveviewrefreshmemorylimitbytes)
when the reason is a memory limit breach, and save the definition before
dropping the view:

```questdb-sql
SHOW CREATE LIVE VIEW trades_ma;
```

Then drop and recreate the live view. Review the saved statement before
replaying it:

- `START FROM NOW` is saved as written, so replaying it starts the new view at
  the time of the replay. To keep the original boundary, replace it with the
  `view_lower_bound_timestamp` value from
  [`live_views()`](/docs/query/functions/meta/#live_views), or use
  `START FROM BEGINNING` to include all history still present in the base table.
- If the view was created with a trailing `;`, the saved query keeps it inside
  `AS ( ... )` and replaying fails with `')' expected`. Remove that `;`.
- On QuestDB Enterprise, the saved `OWNED BY` names the user running
  `SHOW CREATE`, not necessarily the view's owner, and dropping the view
  removes its grants. Set `OWNED BY` to the intended owner and grant
  permissions on the new view again.

Dropping the invalid view removes its materialized rows, including rows whose
source history is no longer retained by the base table.

Live views over [deduplicated](/docs/concepts/deduplication/) base tables are
supported. A keep-last `UPSERT` replacement at an earlier timestamp is reflected
in the view, and later rows are recomputed. Such a view has no in-memory rows
ahead of disk, so it trails the base table by up to one `FLUSH EVERY` cycle.

## Monitoring

The [`live_views()`](/docs/query/functions/meta/#live_views) function exposes
the state, refresh lag, in-memory footprint, and out-of-order repair counters of
every live view:

```questdb-sql title="List all live views"
SELECT view_name, base_table_name, view_status, lag_seqtxn, lag_micros
FROM live_views();
```

Check `view_status` before reading lag. `seeding` means the view is still
processing the base rows that existed when it was created, and `invalid` means
it has stopped refreshing; see [Base table lifecycle](#base-table-lifecycle).
The lag columns are meaningful only for an `active` view: during the seed,
`lag_seqtxn` reads `0` while the view is still empty.

`view_status` does not show a suspended WAL on the view itself: a view whose own
WAL apply failed still reports `active`. QuestDB retries the apply on the view's
next flush after a base commit, so a view whose base table is idle stays
suspended. Find suspended live views with
[`tables()`](/docs/query/functions/meta/#tables), or with
[`wal_tables()`](/docs/query/functions/meta/#wal_tables) for the error details,
and resume them with
[`ALTER LIVE VIEW RESUME WAL`](/docs/query/sql/alter-live-view-resume-wal/):

```questdb-sql title="Find live views with a suspended WAL"
SELECT table_name FROM tables() WHERE table_type = 'L' AND table_suspended;
```

`lag_seqtxn` is the number of transactions applied to the base table beyond the
view's durable processed watermark. It counts transactions, not rows: one
transaction may contain one row or millions. For an `active` view, a value of
`0` means that the durable tier has caught up with the base table. A temporary
non-zero value is expected between `FLUSH EVERY` cycles, especially when
ingestion produces many small commits. Base commits that are not yet applied to
the base table are not counted, so when the base table itself lags or is
suspended, check [`wal_tables()`](/docs/query/functions/meta/#wal_tables) too.

There is no universal acceptable non-zero value. Sample the metric over time and
compare it with the view's normal flush-cycle baseline. A bounded sawtooth that
returns to zero around flushes is normal. A value that stays elevated for
multiple flush intervals or keeps increasing indicates that the view cannot keep
up.

`lag_micros` reports the elapsed time since the last successful flush. It is a
flush-activity indicator, not the timestamp difference between base and view
rows, and can continue growing while an idle view has `lag_seqtxn = 0`.

When lag grows persistently, check `view_status` and `invalidation_reason` for an
invalidated view, and `writer_stall_micros` for long-running queries that keep
the in-memory tier from publishing. Also verify CPU and I/O capacity, reduce the
number or cost of maintained views, or increase
[`live.view.refresh.worker.count`](/docs/configuration/live-views/#liveviewrefreshworkercount).
A single view is refreshed by one worker at a time, so more workers help only
when several views are busy.

For out-of-order repair cost, compare `o3_replay_scan_rows`,
`o3_resume_replay_rows`, and `o3_boundary_replay_rows`. The first counts base
rows scanned; the other two split rows emitted by the resume-from-checkpoint and
rebuild paths. `checkpoint_repair_plan` reports whether the view has a finite
`range`, `rows`, or `anchor` repair plan, or `none` when every out-of-order row
below the head rebuilds the view's history. The last disposition and denial
columns show which path actually ran and why a local rebuild was not selected.
These counters reset on restart.

The `checkpoint_timeline_*` columns describe the persistent timeline used for
restart and out-of-order repair. In particular,
`checkpoint_timeline_sharing_ratio` shows how effectively checkpoint state is
shared, while `checkpoint_gc_lag_generations` and
`checkpoint_obsolete_segment_bytes` can expose delayed cleanup. A growing
`checkpoint_seal_failures` value means the view keeps serving correct results
while its restart-recovery state goes stale. See
[`live_views()`](/docs/query/functions/meta/#live_views) for the complete
catalog.

Live views also appear in [`tables()`](/docs/query/functions/meta/#tables) with
`table_type = 'L'`, and are recognized by `SHOW CREATE LIVE VIEW`, `EXPLAIN`,
`pg_class`, and `information_schema.tables`.

## Limitations

Live views have a deliberately narrow surface in this first version. Statements
outside it are rejected at creation time with a specific error:

| Base object       | Derived object    | Supported                             |
| ----------------- | ----------------- | ------------------------------------- |
| Live view         | Regular view      | Yes                                   |
| Live view         | Materialized view | No                                    |
| Live view         | Live view         | No                                    |
| Regular view      | Live view         | No; the view query must read a base table directly |
| Materialized view | Live view         | Yes                                   |

A full rebuild of a materialized view invalidates a live view that uses it as
its base. Recreate the live view after the rebuild, following the recovery steps
in [Base table lifecycle](#base-table-lifecycle).

- **Single base table only.** No JOINs, subqueries, CTEs, or regular views in
  `FROM`.
- **Explicit output columns only.** `SELECT *` and other wildcard projections
  are rejected because the output schema is fixed when the view is created.
- **Designated timestamp in the output.** The query must select the base
  table's designated timestamp as a plain column under its own name.
- **No pre-aggregation.** `SAMPLE BY` and `GROUP BY` are not allowed between the
  base table and the window functions. A view like "5-minute candles with a
  rolling VWAP" must pre-aggregate upstream.
- **No designated-timestamp filter.** A `WHERE` clause may filter other columns,
  but cannot filter the base table's designated timestamp yet.
- **Deterministic queries only.** Non-deterministic functions such as `now()`,
  `sysdate()`, `systimestamp()`, and `rnd_*()` are rejected in the projection,
  the `WHERE` filter, and window-function arguments.
- **No administrative functions.** Enterprise functions that check the
  caller's permissions, such as `permissions()` and `backup_instance_name()`,
  are rejected, since a live view refreshes in the background. See
  [query constraints](/docs/query/sql/create-live-view/#query-constraints) for
  the full list.
- **No TTL on the view.** Live-view disk growth is unbounded in this version.
  Base-table retention does not shrink the view, because `DROP PARTITION`,
  `TRUNCATE`, and TTL eviction on the base table leave the view's rows in place.
  The only way to reclaim the space is to drop and recreate the view.
- **No direct writes.** `INSERT`, `UPDATE`, `TRUNCATE`, and structural
  `ALTER` statements on a live view are rejected with `cannot modify live view`.

## Tradeoffs

- **Storage grows with output.** The computed rows are stored on the live view's
  disk tier in addition to the base table's rows. For wide projections or long
  retention the view's footprint can exceed the base table.
- **Base WAL is retained for the view.** Base-table WAL segments are kept until
  every valid live view on the table has consumed them and covered them with a
  checkpoint, so a lagging view increases the base table's WAL disk usage.
  Invalidated and dropped views release this hold.
- **No admission control.** A view that cannot keep up with ingestion stays
  correct but stale, with no automatic throttle or drop.
- **Per-partition state for partitioned windows grows with distinct partition
  cardinality.** A view that partitions by a high-cardinality key, such as a
  `SYMBOL` column of account or order ids, holds state per key. Use
  [`cairo.live.view.refresh.memory.limit.bytes`](/docs/configuration/live-views/#cairoliveviewrefreshmemorylimitbytes)
  to cap the per-view refresh footprint; a view that exceeds the cap is
  invalidated, not throttled. The `in_mem_bytes` column in
  [`live_views()`](/docs/query/functions/meta/#live_views) separately reports
  the peak-sticky capacity of the recent-row tier.

## Enterprise features

QuestDB Enterprise adds access control, replication, and backup support for live
views.

### Permissions

Two dedicated permissions govern live-view DDL, modelled on the materialized-view
permissions:

- `CREATE LIVE VIEW` is a database-level permission. Creating a view also
  requires `SELECT` on the base-table columns the view reads; a table-level
  `SELECT` grant covers them.
- `DROP LIVE VIEW` is checked against the target view.

The creator, or the `OWNED BY` principal when one is given, receives all
permissions on the new view with the `GRANT` option. Querying a live view uses
the standard table-level `SELECT` permission, since a live view is a regular
table token. [`ALTER LIVE VIEW RESUME WAL`](/docs/query/sql/alter-live-view-resume-wal/)
requires the `RESUME WAL` permission on the view. See
[Role-based access control](/docs/security/rbac/) for the full permission model.

### Replication

Live-view definitions replicate, but their derived rows do not. Every node
refreshes and flushes its own node-local live-view table:

- The primary refreshes directly from the base table's WAL.
- A read-only replica refreshes from its locally applied copy of the base table.
- Live-view WAL is not uploaded or transferred between nodes.

`CREATE LIVE VIEW` and `DROP LIVE VIEW` run on the primary, and a dropped view
is removed from replicas too. A replica keeps no in-memory rows ahead of disk,
so its live views trail by up to one `FLUSH EVERY` interval plus base-table
replication and apply lag. Refresh state and checkpoints are also node-local,
so a view invalidated on one node, for example by a memory limit breach, stays
valid on the others.

A role switch continues the local refresh state; it does not reconstruct or
transfer the former primary's live-view rows.

### Backup and restore

A live view is captured by the object-store backup like a materialized view: its
table data and definition files are backed up with the table. The checkpoint
timeline is not backed up. After restore, window state is rebuilt from the
restored base table, and rows that were not yet flushed at backup time are
re-derived from it.

## Related documentation

- **SQL commands**
  - [`CREATE LIVE VIEW`](/docs/query/sql/create-live-view/): Create a live view
  - [`ALTER LIVE VIEW RESUME WAL`](/docs/query/sql/alter-live-view-resume-wal/):
    Resume a suspended live view
  - [`DROP LIVE VIEW`](/docs/query/sql/drop-live-view/): Remove a live view

- **Related concepts**
  - [Materialized views](/docs/concepts/materialized-views/): Incrementally
    maintained `SAMPLE BY` aggregates
  - [Views](/docs/concepts/views/): Virtual tables computed at query time
  - [Window functions](/docs/query/functions/window-functions/overview/): The `OVER` functions a
    live view maintains

- **Configuration**
  - [Live views configs](/docs/configuration/live-views/): Server configuration
    options for live views
