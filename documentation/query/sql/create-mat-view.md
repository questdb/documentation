---
title: CREATE MATERIALIZED VIEW
sidebar_label: CREATE MATERIALIZED VIEW
description:
  Documentation for the CREATE MATERIALIZED VIEW SQL keyword in QuestDB.
---

Creates a materialized view that stores pre-computed query results and refreshes
incrementally as new data arrives. For conceptual overview, see
[Materialized Views](/docs/concepts/materialized-views/).

## Syntax

```
CREATE MATERIALIZED VIEW [ IF NOT EXISTS ] viewName
[ WITH BASE baseTableName ]
[ REFRESH ( IMMEDIATE | MANUAL | EVERY interval ) [ DEFERRED ]
           [ START timestamp ] [ TIME ZONE timezone ]
           [ PERIOD ( LENGTH length [ TIME ZONE tz ] [ DELAY delay ] ) ]
           [ PERIOD ( SAMPLE BY INTERVAL ) ] ]
AS [ ( ] query [ ) ]
[ TIMESTAMP ( columnRef ) ]
[ PARTITION BY ( YEAR | MONTH | WEEK | DAY | HOUR ) [ TTL n timeUnit ] ]
[ OWNED BY ownerName ]
```

Where:
- `interval`: Duration like `1m`, `10m`, `1h`, `1d`
- `timeUnit`: `HOURS | DAYS | WEEKS | MONTHS | YEARS`
- `query`: Must contain `SAMPLE BY` or time-based `GROUP BY`

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name for the materialized view |
| `IF NOT EXISTS` | Create only if view doesn't already exist |
| `WITH BASE` | Specify base table (required for JOINs) |
| `REFRESH` | Refresh strategy (default: `IMMEDIATE`) |
| `DEFERRED` | Skip initial refresh on creation |
| `query` | A `SAMPLE BY` or time-based `GROUP BY` query |
| `TIMESTAMP` | Designate timestamp column for the view |
| `PARTITION BY` | Partitioning unit for view storage |
| `TTL` | Retention period for view data |
| `OWNED BY` | Assign ownership (Enterprise) |

## Rules and defaults

| Rule | Description |
| ---- | ----------- |
| Query must aggregate | Requires `SAMPLE BY` or `GROUP BY` with designated timestamp |
| Default refresh | `IMMEDIATE` (refreshes after each base table transaction) |
| WITH BASE required | Must specify when query contains JOINs |
| PARTITION BY sizing | Should be larger than or equal to `SAMPLE BY` interval |
| PERIOD requires SAMPLE BY | The `PERIOD` clause only works with `SAMPLE BY` queries |
| EVERY minimum | Minimum timer interval is `1m` |

## Valid clause combinations

| Refresh | DEFERRED | PERIOD | Valid |
| ------- | -------- | ------ | ----- |
| IMMEDIATE | ✓ | ✓ | ✓ |
| MANUAL | ✓ | ✓ | ✓ |
| EVERY interval | ✓ | ✓ | ✓ |
| _(none specified)_ | ✗ | ✗ | ✓ (defaults to IMMEDIATE) |

## Basic example

```questdb-sql title="Base table"
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

```questdb-sql title="Materialized view with hourly aggregation"
CREATE MATERIALIZED VIEW trades_hourly AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1h;
```

The view refreshes incrementally each time `trades` receives new data.

## Refresh strategies

### IMMEDIATE (default)

Refreshes incrementally after each base table transaction:

```questdb-sql
CREATE MATERIALIZED VIEW trades_hourly
REFRESH IMMEDIATE AS
SELECT timestamp, symbol, avg(price) FROM trades SAMPLE BY 1h;
```

Best for: Real-time dashboards where data freshness matters.

### EVERY interval

Checks for new data and refreshes on a timer schedule:

```questdb-sql
CREATE MATERIALIZED VIEW trades_hourly
REFRESH EVERY 10m AS
SELECT timestamp, symbol, avg(price) FROM trades SAMPLE BY 1h;
```

Every 10 minutes, QuestDB checks if the base table has new data and performs an
incremental refresh if needed.

With start time and timezone:

```questdb-sql
CREATE MATERIALIZED VIEW trades_hourly
REFRESH EVERY 1h START '2025-01-01T00:00:00Z' TIME ZONE 'Europe/Berlin' AS
SELECT timestamp, symbol, avg(price) FROM trades SAMPLE BY 1h;
```

| Option | Description |
| ------ | ----------- |
| `EVERY interval` | How often to check for updates (e.g., `10m`, `1h`) |
| `START timestamp` | When to begin the schedule |
| `TIME ZONE` | Timezone for schedule alignment |

Best for: Reducing refresh overhead when real-time accuracy isn't required.

:::note
Minimum interval is `1m`. For faster refresh, use `IMMEDIATE`.
:::

### MANUAL

Refreshes only when explicitly triggered:

```questdb-sql
CREATE MATERIALIZED VIEW trades_hourly
REFRESH MANUAL AS
SELECT timestamp, symbol, avg(price) FROM trades SAMPLE BY 1h;
```

Trigger refresh with [`REFRESH MATERIALIZED VIEW`](/docs/query/sql/refresh-mat-view/).

Best for: Full control over refresh timing, batch processing workflows.

### DEFERRED

Skips the initial full refresh on creation. Applies to any strategy:

```questdb-sql
CREATE MATERIALIZED VIEW trades_hourly
REFRESH IMMEDIATE DEFERRED AS
SELECT timestamp, symbol, avg(price) FROM trades SAMPLE BY 1h;
```

The view remains empty until:
- `IMMEDIATE`: Next base table transaction
- `EVERY`: Next scheduled refresh time
- `MANUAL`: Explicit `REFRESH` command

## PERIOD clause

For data arriving at fixed intervals (e.g., end-of-day prices), use `PERIOD` to
define an in-flight time window that won't refresh until complete.

### Full PERIOD syntax

```questdb-sql
CREATE MATERIALIZED VIEW trades_daily
REFRESH PERIOD (LENGTH 1d TIME ZONE 'Europe/London' DELAY 2h) AS
SELECT timestamp, symbol, avg(price) FROM trades SAMPLE BY 1d;
```

| Option | Description |
| ------ | ----------- |
| `LENGTH` | Period duration (e.g., `1d`) |
| `TIME ZONE` | Timezone for period boundaries |
| `DELAY` | Grace period before period closes (e.g., `2h` for late data) |

In this example, each day's data refreshes at 2AM London time.

### Compact PERIOD syntax

Matches period to the `SAMPLE BY` interval:

```questdb-sql
CREATE MATERIALIZED VIEW trades_hourly
REFRESH PERIOD (SAMPLE BY INTERVAL) AS
SELECT timestamp, symbol, avg(price) FROM trades
SAMPLE BY 1h ALIGN TO CALENDAR TIME ZONE 'Europe/London';
```

Ignores the latest incomplete interval, reducing refresh transactions during
high-velocity ingestion.

### PERIOD with other strategies

Combine `PERIOD` with `EVERY` or `MANUAL`:

```questdb-sql title="Period with timer refresh"
CREATE MATERIALIZED VIEW hourly_stats
REFRESH EVERY 15m PERIOD (LENGTH 1h DELAY 5m) AS
SELECT timestamp, symbol, avg(price) FROM trades SAMPLE BY 1h;
```

This configuration:
- Checks for updates every 15 minutes (`EVERY 15m`)
- Processes data in 1-hour chunks (`LENGTH 1h`)
- Waits 5 minutes after each hour ends before refreshing it (`DELAY 5m`)

The `DELAY` allows late-arriving data to be included before the period closes.

```questdb-sql title="Period with manual refresh"
CREATE MATERIALIZED VIEW trades_daily
REFRESH MANUAL PERIOD (LENGTH 1d TIME ZONE 'UTC' DELAY 1h) AS
SELECT timestamp, symbol, avg(price) FROM trades SAMPLE BY 1d;
```

With `MANUAL`, refresh only occurs when you run
[`REFRESH MATERIALIZED VIEW`](/docs/query/sql/refresh-mat-view/) explicitly.

## WITH BASE (for JOINs)

When querying multiple tables, specify which table triggers refresh:

```questdb-sql
CREATE MATERIALIZED VIEW trades_with_metadata
WITH BASE trades AS
SELECT
  t.timestamp,
  t.symbol,
  m.description,
  avg(t.price) AS avg_price
FROM trades t
JOIN instruments m ON t.symbol = m.symbol
SAMPLE BY 1h;
```

Only changes to `trades` trigger refresh. Changes to `instruments` do not.

## Partitioning

Specify storage partitioning with `PARTITION BY`:

```questdb-sql
CREATE MATERIALIZED VIEW trades_hourly AS (
  SELECT timestamp, symbol, avg(price) FROM trades SAMPLE BY 1h
) PARTITION BY DAY;
```

Options: `YEAR`, `MONTH`, `WEEK`, `DAY`, `HOUR`

If omitted, partitioning is
[inferred from SAMPLE BY](/docs/concepts/materialized-views/#default-partitioning).

:::warning
Partitioning cannot be changed after creation.
:::

## TTL (Time-To-Live)

Limit data retention with `TTL`:

```questdb-sql
CREATE MATERIALIZED VIEW trades_hourly AS (
  SELECT timestamp, symbol, avg(price) FROM trades SAMPLE BY 1h
) PARTITION BY DAY TTL 7 DAYS;
```

Time units: `HOURS`, `DAYS`, `WEEKS`, `MONTHS`, `YEARS`

The view's TTL is independent of the base table's TTL. See
[TTL documentation](/docs/concepts/ttl/) for details.

## Complete example

Putting it all together:

```questdb-sql title="Fully specified materialized view"
CREATE MATERIALIZED VIEW IF NOT EXISTS trades_hourly_stats
WITH BASE trades
REFRESH EVERY 15m
  START '2025-01-01T00:00:00Z'
  TIME ZONE 'UTC'
  PERIOD (LENGTH 1h DELAY 5m)
AS (
  SELECT
    timestamp,
    symbol,
    avg(price) AS avg_price,
    sum(amount) AS total_volume
  FROM trades
  SAMPLE BY 1h
)
PARTITION BY DAY TTL 30 DAYS;
```

This creates a view that:
- Checks for updates every 15 minutes (`EVERY 15m`)
- Processes data in 1-hour chunks, waiting 5 minutes for late data (`PERIOD`)
- Aggregates from `trades` table (`WITH BASE trades`)
- Stores hourly averages and volumes (`SAMPLE BY 1h`)
- Keeps 30 days of data (`TTL 30 DAYS`)

## Metadata

Query view metadata with `materialized_views()`:

```questdb-sql
SELECT view_name, base_table_name, view_status, last_refresh_finish_timestamp
FROM materialized_views();
```

See [meta functions](/docs/query/functions/meta/) for all available columns.

## Query constraints

Materialized view queries must:

- Use `SAMPLE BY` or `GROUP BY` with designated timestamp
- Not use `FROM-TO`, `FILL`, or `ALIGN TO FIRST OBSERVATION`
- Not use non-deterministic functions (`now()`, `rnd_*`)

See [query constraints](/docs/concepts/materialized-views/#query-constraints)
for the full list.

## Permissions (Enterprise)

Creating and managing materialized views requires specific permissions.

### Required permissions

| Permission | Level | Required for |
| ---------- | ----- | ------------ |
| `CREATE MATERIALIZED VIEW` | Database (global) | Creating a materialized view |
| `SELECT` | Table/Column (base table) | All columns referenced in the view query |
| `DROP MATERIALIZED VIEW` | Materialized view | Dropping the view |
| `REFRESH MATERIALIZED VIEW` | Materialized view | Manually refreshing the view |

### Owner permissions

When you create a materialized view, you automatically receive all permissions on
it (including `DROP MATERIALIZED VIEW` and `REFRESH MATERIALIZED VIEW`) with the
`GRANT` option.

### OWNED BY clause

Assign ownership to a user, group, or service account:

```questdb-sql
CREATE GROUP analysts;
CREATE MATERIALIZED VIEW trades_hourly AS (
  SELECT timestamp, symbol, avg(price) FROM trades SAMPLE BY 1h
) OWNED BY analysts;
```

:::note
External users (authenticated via external identity providers) must specify the
`OWNED BY` clause when creating materialized views.
:::

### Permission examples

```questdb-sql title="Grant permission to create materialized views"
GRANT CREATE MATERIALIZED VIEW TO user1;
```

```questdb-sql title="Grant SELECT on base table (required to create view from it)"
GRANT SELECT ON trades TO user1;
```

```questdb-sql title="Grant permission to refresh a specific view"
GRANT REFRESH MATERIALIZED VIEW ON trades_hourly TO user1;
```

```questdb-sql title="Grant permission to drop a specific view"
GRANT DROP MATERIALIZED VIEW ON trades_hourly TO user1;
```

## Errors

| Error | Cause |
| ----- | ----- |
| `materialized view already exists` | View exists and `IF NOT EXISTS` not specified |
| `base table does not exist` | Referenced table doesn't exist |
| `query is not supported` | Query doesn't meet constraints (missing SAMPLE BY, uses FILL, etc.) |
| `permission denied` | Missing required permission (Enterprise) |

## See also

- [Materialized views concept](/docs/concepts/materialized-views/)
- [REFRESH MATERIALIZED VIEW](/docs/query/sql/refresh-mat-view/)
- [DROP MATERIALIZED VIEW](/docs/query/sql/drop-mat-view/)
- [ALTER MATERIALIZED VIEW SET REFRESH](/docs/query/sql/alter-mat-view-set-refresh/)
- [ALTER MATERIALIZED VIEW SET TTL](/docs/query/sql/alter-mat-view-set-ttl/)
