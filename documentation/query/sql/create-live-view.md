---
title: CREATE LIVE VIEW
sidebar_label: CREATE LIVE VIEW
description:
  Documentation for the CREATE LIVE VIEW SQL keyword in QuestDB.
---

Creates a live view that incrementally maintains the result of a window-function
query over a single base table and can be queried like a regular table. For a
conceptual overview, see [Live views](/docs/concepts/live-views/).

## Syntax

```questdb-sql title="CREATE LIVE VIEW"
CREATE LIVE VIEW [ IF NOT EXISTS ] viewName
FLUSH EVERY duration
[ IN MEMORY duration ]
[ PARTITION BY ( YEAR | MONTH | WEEK | DAY | HOUR ) ]
START FROM ( NOW | BEGINNING | 'timestamp' )
AS [ ( ] query [ ) ]
[ OWNED BY ownerName ]
```

Where:

- `duration`: a single token with a unit of `ms`, `s`, `m`, `h`, or `d`, for
  example `100ms`, `5s`, or `30m`.
- `query`: a `SELECT` over one WAL-backed base table whose projection contains
  [window functions](/docs/query/functions/window-functions/overview/).

`FLUSH EVERY` is required and must come first. `START FROM` is also required and
may appear in any order with the optional `IN MEMORY` and `PARTITION BY`
clauses. These clauses all precede `AS`; the optional `OWNED BY` clause follows
the query.

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name for the live view |
| `IF NOT EXISTS` | Create only if a view with this name does not already exist |
| `FLUSH EVERY` | How often computed rows are persisted to disk. Required |
| `IN MEMORY` | Window of recent rows kept in RAM for fresh reads. Defaults to `FLUSH EVERY` |
| `PARTITION BY` | Partitioning unit for the view's disk tier. Defaults to the base table's scheme |
| `START FROM` | Inclusive event-time boundary: `NOW`, `BEGINNING`, or a timestamp literal. Required |
| `query` | A window-function `SELECT` over a single WAL-backed base table |
| `OWNED BY` | Assign ownership (Enterprise) |

## Clauses

### FLUSH EVERY

`FLUSH EVERY` sets how often the view's computed rows are persisted from the
in-memory tier to the view's own WAL-backed disk tier. It controls durability and
write amplification, not read freshness: a direct `SELECT` reads the freshest
computed rows regardless of the flush cadence.

A smaller interval persists more often, shortening crash recovery at the cost of
more write volume. A larger interval reduces write volume but lengthens recovery
and increases the staleness of the read shapes that are served from disk only
(see [Freshness](/docs/concepts/live-views/#freshness)).

The minimum is `100ms`. The maximum is
[`cairo.live.view.in.memory.max`](/docs/configuration/live-views/#cairoliveviewinmemorymax)
(60 minutes by default), because `IN MEMORY` defaults to `FLUSH EVERY`.

```questdb-sql
CREATE LIVE VIEW trades_ma
FLUSH EVERY 1s
START FROM NOW
AS
SELECT timestamp, symbol,
  avg(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS 300 PRECEDING)
    AS moving_avg
FROM trades;
```

### IN MEMORY

`IN MEMORY` sets how long a window of recent output rows is retained in RAM to
serve fast, fresh reads. Reads of recent data are served from the in-memory tier
and older data from disk. It defaults to `FLUSH EVERY`.

`IN MEMORY` must be at least `FLUSH EVERY` and at most
[`cairo.live.view.in.memory.max`](/docs/configuration/live-views/#cairoliveviewinmemorymax).

```questdb-sql
CREATE LIVE VIEW trades_ma
FLUSH EVERY 1s
IN MEMORY 5s
START FROM NOW
AS
SELECT timestamp, symbol,
  avg(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS 300 PRECEDING)
    AS moving_avg
FROM trades;
```

### PARTITION BY

`PARTITION BY` sets the partitioning of the view's disk tier. If omitted, the
view inherits the base table's partitioning scheme.

```questdb-sql
CREATE LIVE VIEW trades_ma
FLUSH EVERY 1s
PARTITION BY HOUR
START FROM NOW
AS
SELECT timestamp, symbol,
  avg(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS 300 PRECEDING)
    AS moving_avg
FROM trades;
```

### START FROM

`START FROM` defines the inclusive event-time boundary for rows in the live
view. It is mandatory and accepts:

- `NOW`: resolve the engine clock once when the view is created.
- `BEGINNING`: include all base-table history.
- A quoted timestamp literal: include rows whose designated timestamp is equal
  to or later than that value.

The boundary applies to the base table's designated timestamp, not to commit
time. QuestDB performs a resumable initial seed for qualifying rows already
present at creation, then continues refreshing from new base commits.

```questdb-sql
CREATE LIVE VIEW trades_ma
FLUSH EVERY 1s
START FROM BEGINNING
AS
SELECT timestamp, symbol,
  avg(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS 300 PRECEDING)
    AS moving_avg
FROM trades;
```

```questdb-sql title="Start from an explicit timestamp"
CREATE LIVE VIEW trades_ma_from_april
FLUSH EVERY 1s
START FROM '2026-04-01T00:00:00.000000Z'
AS
SELECT timestamp, symbol,
  avg(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS 300 PRECEDING)
    AS moving_avg
FROM trades;
```

## Anchored windows

An anchored window resets its cumulative aggregate on a boundary. Declare it in a
named `WINDOW` with either the `ANCHOR DAILY` shorthand or an
`ANCHOR EXPRESSION` clause:

```questdb-sql title="Cumulative daily volume, reset each day"
CREATE LIVE VIEW trades_daily_volume
FLUSH EVERY 1s
START FROM NOW
AS
SELECT timestamp, symbol,
  sum(amount) OVER w AS cumulative_volume
FROM trades
WINDOW w AS (PARTITION BY symbol ORDER BY timestamp ANCHOR DAILY);
```

```questdb-sql title="Anchor on an arbitrary expression"
CREATE LIVE VIEW trades_hourly_volume
FLUSH EVERY 1s
START FROM NOW
AS
SELECT timestamp, symbol,
  sum(amount) OVER w AS bucket_volume
FROM trades
WINDOW w AS (
  PARTITION BY symbol
  ORDER BY timestamp
  ANCHOR EXPRESSION timestamp_floor('1h', timestamp)
);
```

An anchored window must be partitioned, must `ORDER BY` the designated timestamp
ascending, cannot use a bounded frame, and its anchor expression must be
deterministic.

## Query constraints

The view query is validated at creation time and must:

- Read a single WAL-backed base table that has a designated timestamp. No JOINs,
  subqueries, or CTEs.
- Contain [window functions](/docs/query/functions/window-functions/overview/) that can be
  maintained incrementally (see
  [supported functions](/docs/concepts/live-views/#supported-window-functions)).
- Give every window function a `PARTITION BY` clause.
- Not use `SAMPLE BY`, `GROUP BY`, a top-level `ORDER BY`, or `LIMIT` in the view
  query. The `ORDER BY` inside a window's `OVER (...)` is required and allowed.
- Not use non-deterministic functions such as `now()`, `sysdate()`,
  `systimestamp()`, or `rnd_*()`.
- Not read another live view.

## Complete example

```questdb-sql title="Base table"
CREATE TABLE trades (
  symbol SYMBOL,
  side SYMBOL,
  price DOUBLE,
  amount DOUBLE,
  timestamp TIMESTAMP
) TIMESTAMP(timestamp) PARTITION BY DAY WAL;
```

```questdb-sql title="Fully specified live view"
CREATE LIVE VIEW IF NOT EXISTS trades_ma
FLUSH EVERY 1s
IN MEMORY 5s
PARTITION BY HOUR
START FROM BEGINNING
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

This creates a view that:

- Persists computed rows to disk every second (`FLUSH EVERY 1s`)
- Keeps 5 seconds of recent rows in RAM for fresh reads (`IN MEMORY 5s`)
- Partitions its disk tier by hour (`PARTITION BY HOUR`)
- Includes all existing history in `trades` (`START FROM BEGINNING`)
- Keeps a 300-row moving average of price per symbol

## Metadata

Query view metadata with [`live_views()`](/docs/query/functions/meta/#live_views):

```questdb-sql
SELECT view_name, base_table_name, view_status, lag_seqtxn
FROM live_views();
```

## Permissions (Enterprise)

Creating a live view requires the database-level `CREATE LIVE VIEW` permission
and `SELECT` on the base table:

```questdb-sql title="Grant permission to create live views"
GRANT CREATE LIVE VIEW TO user1;
```

```questdb-sql title="Grant SELECT on the base table"
GRANT SELECT ON trades TO user1;
```

When you create a live view you automatically receive all permissions on it,
including `DROP LIVE VIEW`, with the `GRANT` option.

### OWNED BY clause

Assign ownership to a user, group, or service account:

```questdb-sql
CREATE GROUP analysts;
CREATE LIVE VIEW trades_ma
FLUSH EVERY 1s
START FROM NOW
AS
SELECT timestamp, symbol,
  avg(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS 300 PRECEDING)
    AS moving_avg
FROM trades
OWNED BY analysts;
```

## Errors

| Error | Cause |
| ----- | ----- |
| `live views are disabled` | Live-view support is turned off (`cairo.live.view.enabled=false`) |
| `live view already exists` | A live view of this name exists and `IF NOT EXISTS` was not specified |
| `table or view with the requested name already exists` | The name is taken by a table, view, or materialized view |
| `live view FLUSH EVERY must be at least 100ms` | The `FLUSH EVERY` interval is below the minimum |
| `live view select must be a simple scan of a single WAL base table; joins, subqueries, GROUP BY, ORDER BY and LIMIT are not supported yet` | The view query is not a simple scan of one base table |
| `base table must be a WAL table` | The base object is a non-WAL table or a regular view |
| `live views are not allowed as base tables in V1` | The base object is another live view |
| `live view base table must have a designated timestamp` | The base table has no designated timestamp |
| `non-deterministic function cannot be used in materialized view` | The query uses `now()`, `rnd_*()`, or a similar non-deterministic function |
| `permission denied` | Missing required permission (Enterprise) |

:::note

The non-determinism check is the same guard materialized views use, so its error
message names "materialized view" even when it is raised for a live view. The
rule and its effect are identical for both view types.

:::

## See also

- [Live views concept](/docs/concepts/live-views/)
- [DROP LIVE VIEW](/docs/query/sql/drop-live-view/)
- [Window functions](/docs/query/functions/window-functions/overview/)
- [live_views()](/docs/query/functions/meta/#live_views)
