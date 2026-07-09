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
| Freshness control | `FLUSH EVERY`, `IN MEMORY` | `REFRESH` strategy |

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
SELECT * FROM trades_ma
WHERE timestamp IN '$today';
```

The view updates incrementally as new rows arrive in `trades`. Each new trade
produces one output row carrying its moving average.

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
There is no automatic throttle. Monitor `lag_seqtxn` and `lag_micros` in
[`live_views()`](/docs/query/functions/meta/#live_views) to detect a view that
cannot keep up.

:::

## Supported window functions

Live views maintain the window functions whose result can be computed
incrementally in a single forward pass over a partitioned frame:

- **Ranking**: `row_number`, `rank`, `dense_rank`
- **Cumulative and bounded aggregates**: `sum`, `avg`, `count`, `min`, `max`,
  `ksum`, `first_value`, `last_value`, `nth_value`
- **Offset**: `lag`
- **Statistics**: `variance`, `stddev`, covariance, correlation, and EWMA

Every window function must have a `PARTITION BY` clause. Both bounded `ROWS` and
bounded `RANGE` frames are supported.

String, `VARCHAR`, `BINARY`, `ARRAY`, and `SYMBOL` columns can appear as
pass-through output columns and as `count` arguments, but there are no
string- or array-valued window functions.

The following shapes cannot be maintained by an append-only incremental refresh
and are rejected at creation time:

- Multi-pass or look-ahead functions: `percent_rank`, `cume_dist`, `ntile`,
  `lead`
- Window functions without `PARTITION BY`
- Unbounded frames on non-anchored windows

## Anchored windows

An anchored window resets its cumulative aggregate on a boundary, which is useful
for running totals that restart each day or on a period boundary. Declare it in a
named window with either the `ANCHOR DAILY` shorthand or an `ANCHOR EXPRESSION`
clause:

```questdb-sql title="Cumulative daily volume per symbol"
CREATE LIVE VIEW trades_daily_volume
FLUSH EVERY 1s
AS
SELECT
  timestamp,
  symbol,
  sum(amount) OVER w AS cumulative_volume
FROM trades
WINDOW w AS (
  PARTITION BY symbol
  ORDER BY timestamp
  ANCHOR DAILY
);
```

An anchored window must be partitioned, cannot use a bounded frame, and its
anchor expression must be deterministic.

## Backfill

By default a live view only reflects data that arrives after it is created. Rows
in the base table below the view's creation-time lower bound are not processed.

Add the `BACKFILL` clause to materialize the base table's existing history before
the view starts live-tailing:

```questdb-sql title="Backfill existing history"
CREATE LIVE VIEW trades_ma
FLUSH EVERY 1s
BACKFILL
AS
SELECT
  timestamp,
  symbol,
  avg(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS 300 PRECEDING)
    AS moving_avg
FROM trades;
```

The backfill sweep is resumable: it checkpoints its progress and continues after
a restart.

## Base table lifecycle

A live view is tied to a single WAL-backed base table and tracks the exact set of
base columns its query references:

- Changes to columns the view does not reference pass through transparently and
  the view keeps refreshing.
- Dropping, renaming, or changing the type of a referenced column invalidates the
  view.
- Renaming, dropping, or truncating the base table invalidates the view.
- `DROP PARTITION`, `TRUNCATE`, and base TTL eviction freeze the already-emitted
  rows and the view continues forward from where it was.

An invalidated view keeps serving its existing data and reports the reason in
[`live_views()`](/docs/query/functions/meta/#live_views). It stops refreshing.

Live views over [deduplicated](/docs/concepts/deduplication/) base tables are
supported. A keep-last `UPSERT` replacement at an earlier timestamp is reflected
in the view. A view over a deduplicated base is one `FLUSH EVERY` cycle behind
rather than sub-cycle fresh, because its refresh is coupled to base apply.

## Monitoring

The [`live_views()`](/docs/query/functions/meta/#live_views) function exposes the
state, refresh lag, in-memory footprint, and backfill progress of every live
view:

```questdb-sql title="List all live views"
SELECT view_name, base_table_name, view_status, lag_seqtxn, lag_micros
FROM live_views();
```

Live views also appear in [`tables()`](/docs/query/functions/meta/#tables) with
`table_type = 'L'`, and are recognized by `SHOW CREATE LIVE VIEW`, `EXPLAIN`,
`pg_class`, and `information_schema.tables`.

## Limitations

Live views have a deliberately narrow surface in this first version. Statements
outside it are rejected at creation time with a specific error:

- **Single base table only.** No JOINs, subqueries, or CTEs in the view query.
- **No pre-aggregation.** `SAMPLE BY` and `GROUP BY` are not allowed between the
  base table and the window functions. A view like "5-minute candles with a
  rolling VWAP" must pre-aggregate upstream.
- **No live-view-on-live-view.** A live view cannot be the base of another live
  view.
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
  session ids) holds one state entry per key seen, so native-memory use grows
  over the life of the view. The `in_mem_bytes` column in
  [`live_views()`](/docs/query/functions/meta/#live_views) reports this
  footprint as a peak-sticky high-water mark.

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

A live view replicates physically like a materialized view. Its disk tier is a
regular WAL-backed table, so its rows transfer to replicas through the existing
object-store WAL path. A read-only replica never refreshes the view itself. It
reconstructs the primary's un-flushed in-memory rows in RAM so that reads on the
replica match the primary's freshness. Promoting a replica to primary resumes
refresh from the durable watermark.

### Backup and restore

A live view is captured by the object-store backup like a materialized view: its
table data rides the standard table path and its definition sidecars are carried
in the backup manifest. On restore, the un-flushed in-memory rows are re-derived
from the base table, which is the same bounded recompute a promote performs.

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
