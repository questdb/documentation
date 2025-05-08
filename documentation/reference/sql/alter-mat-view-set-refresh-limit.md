---
title: ALTER MATERIALIZED VIEW SET REFRESH LIMIT
sidebar_label: SET REFRESH LIMIT
description:
  ALTER MATERIALIZED VIEW SET REFRESH LIMIT SQL keyword reference documentation.
---

Sets the time limit for incremental refresh on a materialized view.

## Syntax

![Flow chart showing the syntax of ALTER MATERIALIZED VIEW SET REFRESH LIMIT command](/images/docs/diagrams/alterMatViewSetRefreshLimit.svg)

## Description

To protect older aggregated data from being overwritten by inserts with old
timestamps, configure a refresh limit on a materialized view using the
`ALTER MATERIALIZED VIEW SET REFRESH LIMIT` command. This means that base
table's rows with timestamps older than the refresh limit will not be aggregated
in the materialized view.

Let's suppose we've just configured refresh limit on a materialized view:

```sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH LIMIT 1 WEEK;
```

Next, the current time is `2025-05-02T12:00:00.000000Z` and we're inserting a
few rows into the base table:

```sql
INSERT INTO trades VALUES
  ('2025-03-02T12:00:00.000000Z', 'BTC-USD', 39269.98, 0.042),
  ('2025-04-02T12:00:00.000000Z', 'BTC-USD', 39170.01, 0.042),
  ('2025-05-02T12:00:00.000000Z', 'BTC-USD', 38450.10, 0.042);
```

The first two rows here are older than a week, so incremental refresh will only
take place for the third row with the `2025-05-02T12:00:00.000000Z` timestamp.

:::note

The limit is only applied to incremental refresh, but not to the
[`REFRESH MATERIALIZED VIEW FULL`](/docs/reference/sql/refresh-mat-view)
command. This means that when you run a full refresh command, all rows from the
base table are aggregated in the materialized view.

:::

The `REFRESH LIMIT` value consists of a number and a time unit, one of:

- `HOURS`
- `DAYS`
- `WEEKS`
- `MONTHS`
- `YEARS`

The limit units fall into two categories:

1. Fixed time periods:
   - `HOURS`
   - `DAYS`
   - `WEEKS`
2. Calendar-based periods:
   - `MONTHS`
   - `YEARS`

Fixed-time periods are always exact durations: `1 WEEK` is always 7 days.

Calendar-based periods may vary in length: `1 MONTH` from January 15th goes to
February 15th and could be between 28 and 31 days.

QuestDB accepts both singular and plural forms:

- `HOUR` or `HOURS`
- `DAY` or `DAYS`
- `WEEK` or `WEEKS`
- `MONTH` or `MONTHS`
- `YEAR` or `YEARS`

It also supports shorthand notation: `3h` for 3 hours, `2M` for 2 months.

## Examples

Set the refresh limit to 1 day:

```sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH LIMIT 1 DAY;
```

Set the limit to 8 hours, using the shorthand syntax for the time unit:

```sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH LIMIT 8h;
```
