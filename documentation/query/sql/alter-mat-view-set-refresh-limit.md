---
title: ALTER MATERIALIZED VIEW SET REFRESH LIMIT
sidebar_label: SET REFRESH LIMIT
description:
  ALTER MATERIALIZED VIEW SET REFRESH LIMIT SQL keyword reference documentation.
---

Sets a time limit for incremental refresh, preventing old data from overwriting
existing aggregations in a materialized view.

## Syntax

```
ALTER MATERIALIZED VIEW viewName SET REFRESH LIMIT n timeUnit
```

Where `timeUnit` is: `HOURS | DAYS | WEEKS | MONTHS | YEARS` (or shorthand:
`h`, `d`, `w`, `M`, `y`)

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name of the materialized view to modify |
| `n` | Number of time units |
| `timeUnit` | Time unit for the limit |

## When to use

Set a refresh limit when:

- You want to protect historical aggregations from late-arriving data
- Base table receives out-of-order inserts with old timestamps
- You need predictable refresh behavior for auditing

## How it works

When a refresh limit is configured, incremental refresh ignores base table rows
with timestamps older than the limit. This protects already-computed
aggregations from being recalculated.

**Example scenario:**

```questdb-sql title="Set 1-week refresh limit"
ALTER MATERIALIZED VIEW trades_hourly SET REFRESH LIMIT 1 WEEK;
```

If the current time is `2025-05-02T12:00:00Z` and you insert:

```questdb-sql title="Insert rows with various timestamps"
INSERT INTO trades VALUES
  ('2025-03-02T12:00:00Z', 'BTC-USD', 39269.98, 0.042),  -- 2 months old, ignored
  ('2025-04-02T12:00:00Z', 'BTC-USD', 39170.01, 0.042),  -- 1 month old, ignored
  ('2025-05-02T12:00:00Z', 'BTC-USD', 38450.10, 0.042);  -- current, processed
```

Only the third row (within the 1-week limit) triggers an incremental refresh.

:::note
The limit only applies to incremental refresh. A
[`REFRESH MATERIALIZED VIEW FULL`](/docs/query/sql/refresh-mat-view/) command
processes all base table rows regardless of the limit.
:::

## Time units

| Unit | Singular | Plural | Shorthand |
| ---- | -------- | ------ | --------- |
| Hours | `HOUR` | `HOURS` | `h` |
| Days | `DAY` | `DAYS` | `d` |
| Weeks | `WEEK` | `WEEKS` | `w` |
| Months | `MONTH` | `MONTHS` | `M` |
| Years | `YEAR` | `YEARS` | `y` |

**Fixed vs calendar-based:**

- `HOURS`, `DAYS`, `WEEKS`: Fixed durations (1 week = 7 days exactly)
- `MONTHS`, `YEARS`: Calendar-based (1 month from Jan 15 → Feb 15)

## Examples

```questdb-sql title="Set limit to 1 day"
ALTER MATERIALIZED VIEW trades_hourly SET REFRESH LIMIT 1 DAY;
```

```questdb-sql title="Set limit to 8 hours (shorthand)"
ALTER MATERIALIZED VIEW trades_hourly SET REFRESH LIMIT 8h;
```

```questdb-sql title="Set limit to 2 weeks"
ALTER MATERIALIZED VIEW trades_hourly SET REFRESH LIMIT 2 WEEKS;
```

## Refreshing data outside the limit

To refresh data older than the limit, use
[range refresh](/docs/query/sql/refresh-mat-view/#range):

```questdb-sql title="Refresh a specific time range"
REFRESH MATERIALIZED VIEW trades_hourly
  RANGE FROM '2025-03-01T00:00:00Z' TO '2025-03-02T00:00:00Z';
```

## Permissions (Enterprise)

Changing refresh limit requires the `ALTER MATERIALIZED VIEW` permission:

```questdb-sql title="Grant alter permission"
GRANT ALTER MATERIALIZED VIEW ON trades_hourly TO user1;
```

## Errors

| Error | Cause |
| ----- | ----- |
| `materialized view does not exist` | View with specified name doesn't exist |
| `invalid time unit` | Unrecognized time unit |
| `permission denied` | Missing `ALTER MATERIALIZED VIEW` permission (Enterprise) |

## See also

- [Materialized views concept](/docs/concepts/materialized-views/)
- [REFRESH MATERIALIZED VIEW](/docs/query/sql/refresh-mat-view/)
- [ALTER MATERIALIZED VIEW SET REFRESH](/docs/query/sql/alter-mat-view-set-refresh/)
