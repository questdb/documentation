---
title: CREATE LIVE VIEW
sidebar_label: CREATE LIVE VIEW
description:
  Documentation for the CREATE LIVE VIEW SQL keyword in QuestDB.
---

Creates a live view that incrementally maintains the result of a window-function
query over a single base table and can be queried like a regular table. For a
conceptual overview, see [Live views](/docs/concepts/live-views/).

:::note

Live views are currently released as beta. The supported SQL surface is deliberately narrow
in this first version. See
[Limitations](/docs/concepts/live-views/#limitations) for the shapes that are
rejected at creation time.

:::

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

- `duration`: a single token with a lowercase unit of `ms`, `s`, `m`, `h`, or
  `d`, for example `100ms`, `5s`, or `30m`.
- `query`: a `SELECT` over one WAL-backed base table whose projection contains
  [window functions](/docs/query/functions/window-functions/overview/).

`FLUSH EVERY` is required and must come first. `START FROM` is also required and
may appear in any order with the optional `IN MEMORY` and `PARTITION BY`
clauses. These clauses all precede `AS`; the optional `OWNED BY` clause follows
the query. When `OWNED BY` is used, wrap the query in parentheses.

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name for the live view |
| `IF NOT EXISTS` | Create only if a live view with this name does not already exist |
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
view inherits the base table's partitioning scheme. `PARTITION BY NONE` is not
supported.

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
time. Rows below the boundary neither appear in the view nor contribute to
window state. QuestDB performs a resumable initial seed for qualifying rows
already present at creation, then continues refreshing from new base commits.

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

An anchored window resets its functions on a boundary. Declare it in a named
`WINDOW` with one of these forms:

```questdb-sql
ANCHOR DAILY 'HH:MM' [ 'timezone' ]
ANCHOR EXPRESSION expression
```

`ANCHOR DAILY` requires a quoted 24-hour time. An optional time zone, either an
IANA name or a UTC offset such as `'+02:00'`, makes the reset follow local time;
without one, the boundary is in UTC.

```questdb-sql title="Cumulative daily volume, reset each day"
CREATE LIVE VIEW trades_daily_volume
FLUSH EVERY 1s
START FROM NOW
AS
SELECT timestamp, symbol,
  sum(amount) OVER w AS cumulative_volume
FROM trades
WINDOW w AS (
  PARTITION BY symbol
  ORDER BY timestamp
  ANCHOR DAILY '00:00'
);
```

For example, `ANCHOR DAILY '09:30' 'America/New_York'` resets at the New York
market open and follows daylight-saving transitions.

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

An anchored window must:

- Be a named window; `ANCHOR` is not supported in an inline `OVER (...)`.
- Use `PARTITION BY` with base-table columns directly.
- `ORDER BY` the designated timestamp ascending.
- Use the default frame; `ANCHOR` cannot be combined with an explicit `ROWS`
  frame or a bounded `RANGE` frame.
- Be referenced directly by at least one window function, as in `OVER w`. A
  window that inherits from it, such as `WINDOW w2 AS (w ...)`, does not carry
  the anchor.

A live view supports at most one anchored window, which several window
functions can share alongside other, bounded windows. An `ANCHOR EXPRESSION`
must be deterministic, non-constant, and return `TIMESTAMP`, `LONG`, or `INT`.
It cannot contain aggregates, subqueries, or bind variables, and it can only
reference base columns that the query already selects or filters on.

## Query constraints

The view query is validated at creation time and must:

- Read a single WAL-backed base table that has a designated timestamp. No JOINs,
  subqueries, CTEs, or regular views in `FROM`.
- Select the base table's designated timestamp as a plain column under its own
  name. Omitting it, computing it, or aliasing it is rejected.
- Contain at least one
  [window function](/docs/query/functions/window-functions/overview/) that can
  be maintained incrementally. The supported functions depend on the window
  frame; see
  [Supported window functions](/docs/concepts/live-views/#supported-window-functions).
- Give every stateful window function a `PARTITION BY` clause on a supported key
  type. `VARCHAR`, `UUID`, `LONG256`, `DECIMAL`, `BINARY`, and array keys are
  rejected.
- Use a bounded `ROWS` or `RANGE` frame, or a named anchored window. Ranking
  functions (`row_number`, `rank`, and `dense_rank`) must be anchored. A window
  without a frame clause, and any frame starting at `UNBOUNDED PRECEDING`, is
  rejected unless it is anchored; stateless `last_value` shapes are the only
  exception.
- Order every window by the designated timestamp ascending, if it has an
  `ORDER BY`. Named windows must declare it.
- Not use `SAMPLE BY`, `GROUP BY`, `LATEST ON`, `DISTINCT`, or `LIMIT`. A
  top-level `ORDER BY` is accepted only on the designated timestamp ascending.
- List output columns explicitly; wildcard projections such as `SELECT *` are
  not allowed.
- Not filter on the base table's designated timestamp. Other deterministic
  `WHERE` predicates are supported.
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
) TIMESTAMP(timestamp) PARTITION BY DAY;
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
and `SELECT` on the base-table columns the view reads. A table-level `SELECT`
grant covers all of them:

```questdb-sql title="Grant permission to create live views"
GRANT CREATE LIVE VIEW TO user1;
```

```questdb-sql title="Grant SELECT on the base table"
GRANT SELECT ON trades TO user1;
```

When you create a live view you automatically receive all permissions on it,
including `DROP LIVE VIEW`, with the `GRANT` option. With `OWNED BY`, the named
owner receives these permissions instead.

### OWNED BY clause

Assign ownership to a user, group, or service account. The query must be wrapped
in parentheses:

```questdb-sql
CREATE GROUP analysts;
CREATE LIVE VIEW trades_ma
FLUSH EVERY 1s
START FROM NOW
AS (
  SELECT timestamp, symbol,
    avg(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS 300 PRECEDING)
      AS moving_avg
  FROM trades
)
OWNED BY analysts;
```

External users must specify `OWNED BY`, and the creator must be a member of the
group named as the owner.

## Errors

Errors that end in a bracketed detail, such as `[name=trades]`, are shown
without it.

### Statement errors

| Error | Cause |
| ----- | ----- |
| `live views are disabled` | Live-view support is turned off (`cairo.live.view.enabled=false`) |
| `live view refresh is disabled, set live.view.refresh.worker.count to a positive value` | [`live.view.refresh.worker.count`](/docs/configuration/live-views/#liveviewrefreshworkercount) is `0` |
| `live view already exists` | A live view of this name exists and `IF NOT EXISTS` was not specified |
| `table or view with the requested name already exists` | The name is taken by a table, view, or materialized view, even with `IF NOT EXISTS` |
| `live view FLUSH EVERY must be at least 100ms` | The `FLUSH EVERY` interval is below the minimum |
| `live view FLUSH EVERY must be at most cairo.live.view.in.memory.max` | `FLUSH EVERY`, and therefore the default `IN MEMORY`, exceeds the cap |
| `live view IN MEMORY must be at least FLUSH EVERY` | `IN MEMORY` is shorter than `FLUSH EVERY` |
| `live view IN MEMORY must be at most cairo.live.view.in.memory.max` | `IN MEMORY` exceeds the cap |
| `live view PARTITION BY NONE is not supported` | Live views must be partitioned |
| `live view requires a START FROM clause` | `START FROM` is missing |
| `Access denied for <user> [CREATE LIVE VIEW]` | Missing `CREATE LIVE VIEW` permission (Enterprise) |
| `Access denied for <user> [SELECT on <table>(<column>)]` | Missing `SELECT` on a base-table column the view reads (Enterprise) |
| `OWNED BY clause is required for external users` | An external user created a view without `OWNED BY` (Enterprise) |

### Query shape errors

| Error | Cause |
| ----- | ----- |
| `base table does not exist` | The base table does not exist |
| `base table must be a WAL table` | The base table is not a WAL table, including a table without a designated timestamp |
| `live views are not allowed as base tables in V1` | The base object is another live view |
| `live view requires a single base table in FROM clause` | `FROM` contains a subquery, a CTE, or a regular view |
| `live view select must be a simple scan of a single WAL base table; ...` | The query joins tables or uses `LATEST ON` |
| `live view select must be a plain windowed scan of the base table; ...` | The query uses `LIMIT` or `DISTINCT` |
| `live view select must contain at least one window function` | The projection has no window function |
| `live view select must project the base table's designated timestamp` | The designated timestamp is missing from the projection or computed |
| `live view select cannot override the designated timestamp` | The designated timestamp is aliased |
| `wildcard column select is not allowed in live view queries` | The top-level projection contains `*` |
| `live view select cannot filter on the designated timestamp yet` | The `WHERE` clause filters the designated timestamp |
| `non-deterministic function cannot be used in live view` | The query uses `now()`, `rnd_*()`, or a similar non-deterministic function |

### Window errors

| Error | Cause |
| ----- | ----- |
| `live view select cannot use window function <fn>(); incremental snapshot is not supported for this function yet` | The function does not support this frame, has no `PARTITION BY`, or partitions by an unsupported key type |
| `live view select may only use window functions that support incremental refresh` | The function needs look-ahead or multiple passes (`percent_rank`, `cume_dist`, `ntile`), or a window or top-level `ORDER BY` is not the designated timestamp ascending |
| `lead() is not supported in live views; use lag() for lookback` | The query uses `lead` |
| `live view unbounded window must have an ANCHOR clause` | A window without a frame clause is not anchored |
| `live view select cannot use <fn>() over a frame starting at UNBOUNDED PRECEDING` | An explicit frame starts at `UNBOUNDED PRECEDING` and is not anchored |
| `live view select cannot use <fn>() without an anchored WINDOW` | A ranking function is not anchored |
| `live view RANGE window functions must use the same PARTITION BY and ORDER BY domain` | Two `RANGE` windows partition or order differently |
| `live view named WINDOW must ORDER BY <timestamp> ASC` | A named window does not order by the designated timestamp ascending |
| `ANCHOR is only supported on named WINDOW clauses` | `ANCHOR` appears in an inline `OVER (...)` |
| `ANCHOR is incompatible with bounded frames` | An anchored window has an explicit frame |
| `live view anchored WINDOW requires PARTITION BY` | An anchored window has no `PARTITION BY` |
| `live view ANCHOR currently requires PARTITION BY to reference base columns directly` | An anchored window partitions by an expression |
| `live view supports at most one anchored WINDOW in V1` | The query declares more than one anchored window |
| `live view anchored WINDOW '<name>' is not referenced by any window function` | No window function uses the anchored window directly |

## See also

- [Live views concept](/docs/concepts/live-views/)
- [ALTER LIVE VIEW RESUME WAL](/docs/query/sql/alter-live-view-resume-wal/)
- [DROP LIVE VIEW](/docs/query/sql/drop-live-view/)
- [Window functions](/docs/query/functions/window-functions/overview/)
- [live_views()](/docs/query/functions/meta/#live_views)
