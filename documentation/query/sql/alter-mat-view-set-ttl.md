---
title: ALTER MATERIALIZED VIEW SET TTL
sidebar_label: SET TTL
description:
  ALTER MATERIALIZED VIEW SET TTL SQL keyword reference documentation.
---

Sets the [time-to-live](/docs/concepts/ttl/) (TTL) period on a materialized
view, automatically dropping partitions older than the specified duration.

## Syntax

```
ALTER MATERIALIZED VIEW viewName SET TTL n timeUnit
```

Where `timeUnit` is: `HOURS | DAYS | WEEKS | MONTHS | YEARS` (or shorthand:
`h`, `d`, `w`, `M`, `y`)

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name of the materialized view to modify |
| `n` | Number of time units to retain |
| `timeUnit` | Time unit for the retention period |

## When to use

Set a TTL when:

- You only need recent aggregated data (e.g., last 30 days)
- Disk space is a concern for long-running views
- Compliance requires automatic data expiration

## How it works

QuestDB automatically drops partitions that exceed the TTL. Data removal happens
at partition boundaries, not row-by-row.

:::note
The TTL period must be a whole number multiple of the view's partition size.
For example, a view with `PARTITION BY DAY` can have `TTL 7 DAYS` but not
`TTL 36 HOURS`.
:::

## Time units

| Unit | Singular | Plural | Shorthand |
| ---- | -------- | ------ | --------- |
| Hours | `HOUR` | `HOURS` | `h` |
| Days | `DAY` | `DAYS` | `d` |
| Weeks | `WEEK` | `WEEKS` | `w` |
| Months | `MONTH` | `MONTHS` | `M` |
| Years | `YEAR` | `YEARS` | `y` |

## Examples

```questdb-sql title="Keep 3 days of data"
ALTER MATERIALIZED VIEW trades_hourly SET TTL 3 DAYS;
```

```questdb-sql title="Keep 12 hours of data (shorthand)"
ALTER MATERIALIZED VIEW trades_hourly SET TTL 12h;
```

```questdb-sql title="Keep 1 year of data"
ALTER MATERIALIZED VIEW trades_daily SET TTL 1 YEAR;
```

## Behavior

| Aspect | Description |
| ------ | ----------- |
| Granularity | Data dropped at partition boundaries only |
| Independence | View TTL is separate from base table TTL |
| Immediate effect | Expired partitions dropped on next maintenance cycle |

## Permissions (Enterprise)

Changing TTL requires the `ALTER MATERIALIZED VIEW` permission:

```questdb-sql title="Grant alter permission"
GRANT ALTER MATERIALIZED VIEW ON trades_hourly TO user1;
```

## Errors

| Error | Cause |
| ----- | ----- |
| `materialized view does not exist` | View with specified name doesn't exist |
| `invalid TTL` | TTL not a multiple of partition size |
| `invalid time unit` | Unrecognized time unit |
| `permission denied` | Missing `ALTER MATERIALIZED VIEW` permission (Enterprise) |

## See also

- [Materialized views concept](/docs/concepts/materialized-views/)
- [TTL concept](/docs/concepts/ttl/)
- [ALTER TABLE SET TTL](/docs/query/sql/alter-table-set-ttl/)
- [CREATE MATERIALIZED VIEW](/docs/query/sql/create-mat-view/)
