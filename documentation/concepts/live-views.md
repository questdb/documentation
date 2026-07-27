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
base table, the window functions run once per new row and the output is appended
to the view. Querying the live view then scans precomputed rows instead of
reprocessing the base table on every read.

Live views target workloads where the same window aggregate is read frequently
against high-rate ingestion: rolling VWAP, cumulative volume, running ranks, or
day-over-day comparisons that would otherwise recompute a window over millions
of rows on each query.

:::note

Live views are a new feature. The supported SQL surface is deliberately narrow
in this first version. See [Limitations](#limitations) for the shapes that are
rejected at creation time.

:::

## Live views vs materialized views

Both feature types pre-compute a query and refresh it incrementally, but they
serve different query shapes:

| Aspect | Live view | [Materialized view](/docs/concepts/materialized-views/) |
| ------ | --------- | --------------------- |
| Query shape | Window functions (`OVER`) | `SAMPLE BY` / time-based `GROUP BY` |
| Output cardinality | One row per base row | One row per time bucket |
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
) TIMESTAMP(timestamp) PARTITION BY DAY WAL;
```

Create a live view that keeps a 300-row moving average of price per symbol:

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
produces one output row carrying its moving average. A direct `SELECT` of the
full output rows sees data as soon as it is refreshed. Filtering a read to a
timestamp interval (for example `WHERE timestamp IN '$today'`) is served from the
disk tier and can trail by up to one `FLUSH EVERY` interval; see
[Freshness](#freshness).

## How live views work

A live view is its own WAL-backed table maintained by a background refresh
worker. The worker reads new committed rows from the base table and runs the
view's window functions over them, appending the output. Two independent
cadences govern how that output becomes visible and durable:

- **Refresh** runs continuously. As the worker computes output rows, it appends
  them to an in-memory tier. This is what keeps the view fresh.
- **Flush** runs on the `FLUSH EVERY` cadence. It persists the in-memory rows to
  the live view's own WAL-backed disk tier and advances a durability checkpoint.

Reads combine both tiers. Recent rows are served from the in-memory tier and the
older prefix from disk, so a query sees the freshest computed rows without
waiting for a flush.

```questdb-sql title="Show the live view definition"
SHOW CREATE LIVE VIEW trades_ma;
```

### Freshness

Because refresh publishes to the in-memory tier ahead of flush, a direct
`SELECT` that reads the full output rows sees data as soon as it is refreshed.
This is independent of `FLUSH EVERY`, which is a durability and
write-amplification control, not a freshness control.

Some read shapes are served from the disk tier only and therefore trail by up to
one `FLUSH EVERY` interval:

- Reads that project or aggregate the view's columns rather than reading full
  output rows
- Reads filtered to a timestamp interval
- A live view used as the right-hand side of an [`ASOF JOIN`](/docs/query/sql/asof-join/)

Keep `FLUSH EVERY` small (for example `1s`) so this lag stays negligible.

:::tip

A live view falling behind sustained ingestion stays correct but grows stale.
There is no automatic throttle. See [Monitoring](#monitoring) for how to
interpret lag and detect a view that cannot keep up.

:::

## Supported window functions

Live views maintain window functions whose result can be computed incrementally
in a single forward pass and whose state can be checkpointed:

- **Anchored ranking**: `row_number`, `rank`, `dense_rank`
- **Bounded or anchored aggregates**: `sum`, `avg`, `count`, `min`, `max`,
  `ksum`, `first_value`, `last_value`, `nth_value`
- **Offset**: `lag`
- **Statistics**: `variance`, `stddev`, covariance, correlation, EMA, and VWEMA

Stateful window functions must have a `PARTITION BY` clause. Both bounded `ROWS`
and bounded `RANGE` frames are supported. Ranking functions must use an anchored
window because an out-of-order row would otherwise change every later rank.

String, `VARCHAR`, `BINARY`, `ARRAY`, and `SYMBOL` columns can appear as
pass-through output columns and as `count` arguments, but there are no string-
or array-valued window functions.

The following shapes cannot be maintained by an append-only incremental refresh
and are rejected at creation time:

- Multi-pass or look-ahead functions: `percent_rank`, `cume_dist`, `ntile`,
  `lead`
- Stateful window functions without `PARTITION BY`
- Unanchored ranking functions
- Frames that start at `UNBOUNDED PRECEDING`, except stateless `last_value`
  shapes

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
must order by the designated timestamp ascending, and cannot use a bounded
frame. A live view supports at most one anchored window. An anchor expression
must be deterministic and return `TIMESTAMP`, `LONG`, or `INT`.

## Start boundary and historical data

Every live view has a mandatory `START FROM` clause that defines an event-time
lower bound for its rows:

- `START FROM NOW` resolves to the creation time.
- `START FROM BEGINNING` includes all base-table history.
- `START FROM 'timestamp'` includes rows at or after the specified timestamp.

The boundary is inclusive and is evaluated against the base table's designated
timestamp, not commit time. If qualifying rows already exist when the view is
created, QuestDB seeds them before switching to continuous refresh.

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
base columns its query references:

- Changes to columns the view does not reference pass through transparently and
  the view keeps refreshing.
- Dropping, renaming, or changing the type of a referenced column invalidates the
  view.
- Renaming or dropping the base table invalidates the view.
- `DROP PARTITION`, `TRUNCATE`, and base TTL eviction freeze the already-emitted
  rows and the view continues forward from where it was.

An invalidated view keeps serving its existing data and reports the reason in
[`live_views()`](/docs/query/functions/meta/#live_views). It stops refreshing.
Invalidation is permanent: reversing the schema change does not automatically
revalidate the view, and `ALTER LIVE VIEW ... RESUME WAL` only recovers a
suspended WAL writer.

To recover, inspect `invalidation_reason`, repair the base-table schema, and
save the definition before dropping the view:

```questdb-sql
SHOW CREATE LIVE VIEW trades_ma;
```

Then drop and recreate the live view. Use `START FROM BEGINNING` or an explicit
timestamp if it must include history that is still present in the base table.
Dropping the invalid view removes its materialized rows, including rows whose
source history is no longer retained by the base table.

Live views over [deduplicated](/docs/concepts/deduplication/) base tables are
supported. A keep-last `UPSERT` replacement at an earlier timestamp is reflected
in the view. A view over a deduplicated base is one `FLUSH EVERY` cycle behind
rather than sub-cycle fresh, because its refresh is coupled to base apply.

## Monitoring

The [`live_views()`](/docs/query/functions/meta/#live_views) function exposes
the state, refresh lag, in-memory footprint, and seed progress of every live
view:

```questdb-sql title="List all live views"
SELECT view_name, base_table_name, view_status, lag_seqtxn, lag_micros
FROM live_views();
```

`lag_seqtxn` is the number of committed base-table WAL transactions beyond the
view's durable processed watermark. It counts transactions, not rows: one
transaction may contain one row or millions. A value of `0` means that the
durable tier is caught up. A temporary non-zero value is expected between
`FLUSH EVERY` cycles, especially when ingestion produces many small commits.

There is no universal acceptable non-zero value. Sample the metric over time and
compare it with the view's normal flush-cycle baseline. A bounded sawtooth that
returns to zero around flushes is normal. A value that stays elevated for
multiple flush intervals or keeps increasing indicates that the view cannot keep
up.

`lag_micros` reports the elapsed time since the last successful flush. It is a
flush-activity indicator, not the timestamp difference between base and view
rows, and can continue growing while an idle view has `lag_seqtxn = 0`.

When lag grows persistently, check `view_status` and `writer_stall_micros` for a
failed or blocked flush. Also verify CPU and I/O capacity, reduce the number or
cost of maintained views, or increase the shared
[`mat.view.refresh.worker.count`](/docs/configuration/materialized-views/)
setting.

For out-of-order repair cost, compare `o3_replay_scan_rows`,
`o3_resume_replay_rows`, and `o3_boundary_replay_rows`. The first counts base
rows scanned; the other two split rows emitted by the resume-from-checkpoint and
rebuild paths. `checkpoint_repair_plan` reports whether the view has a finite
`range`, `rows`, or `anchor` repair plan. The last disposition and denial
columns show which path actually ran and why a local rebuild was not selected.
These counters reset on restart.

The `checkpoint_timeline_*` columns describe the persistent timeline used for
restart and out-of-order repair. In particular,
`checkpoint_timeline_sharing_ratio` shows how effectively checkpoint state is
shared, while `checkpoint_gc_lag_generations` and
`checkpoint_obsolete_segment_bytes` can expose delayed cleanup. See
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
| Regular view      | Live view         | No; a regular view is not a WAL table |
| Materialized view | Live view         | Yes                                   |

A full rebuild of a materialized view invalidates a live view that uses it as
its base. Recreate the live view after the rebuild, following the recovery steps
in [Base table lifecycle](#base-table-lifecycle).

- **Single base table only.** No JOINs, subqueries, or CTEs in the view query.
- **Explicit output columns only.** `SELECT *` and other wildcard projections
  are rejected because the output schema is fixed when the view is created.
- **No pre-aggregation.** `SAMPLE BY` and `GROUP BY` are not allowed between the
  base table and the window functions. A view like "5-minute candles with a
  rolling VWAP" must pre-aggregate upstream.
- **No designated-timestamp filter.** A `WHERE` clause may filter other columns,
  but cannot filter the base table's designated timestamp yet.
- **Deterministic queries only.** Non-deterministic functions such as `now()`,
  `sysdate()`, `systimestamp()`, and `rnd_*()` are rejected in the projection,
  the `WHERE` filter, and window-function arguments.
- **No TTL on the view.** Live-view disk growth is unbounded in this version.
  Size retention on the base table instead.

## Tradeoffs

- **Storage grows with output.** The computed rows are stored on the live view's
  disk tier in addition to the base table's rows. For wide projections or long
  retention the view's footprint can exceed the base table.
- **No admission control.** A view that cannot keep up with ingestion stays
  correct but stale, with no automatic throttle or drop.
- **Per-partition state for partitioned windows grows with distinct partition
  cardinality.** A base table with high-cardinality partition keys (UUIDs,
  session ids) holds state per key. Use
  [`cairo.live.view.refresh.memory.limit.bytes`](/docs/configuration/live-views/#cairoliveviewrefreshmemorylimitbytes)
  to bound the per-view refresh footprint. The `in_mem_bytes` column in
  [`live_views()`](/docs/query/functions/meta/#live_views) separately reports
  the peak-sticky capacity of the recent-row tier.

## Enterprise features

QuestDB Enterprise adds access control, replication, and backup support for live
views.

### Permissions

Two dedicated permissions govern live-view DDL, modelled on the materialized-view
permissions:

- `CREATE LIVE VIEW` is a database-level permission.
- `DROP LIVE VIEW` is checked against the target view.

Querying a live view uses the standard table-level `SELECT` permission, since a
live view is a regular table token. See
[Role-based access control](/docs/security/rbac/) for the full permission model.

### Replication

Live-view definitions replicate, but their derived rows do not. Every node
refreshes and flushes its own node-local live-view table:

- The primary refreshes directly from the base table's WAL.
- A read-only replica refreshes from its locally applied copy of the base table.
- Live-view WAL is not uploaded or transferred between nodes.

A role switch continues the local refresh state; it does not reconstruct or
transfer the former primary's live-view rows. Replica freshness therefore also
depends on base-table replication and apply lag.

### Backup and restore

A live view is captured by the object-store backup like a materialized view: its
table data rides the standard table path and its definition sidecars are carried
in the backup manifest. After restore, unflushed rows are re-derived from the
base table.

## Related documentation

- **SQL commands**
  - [`CREATE LIVE VIEW`](/docs/query/sql/create-live-view/): Create a live view
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
