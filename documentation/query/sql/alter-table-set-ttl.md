---
title: ALTER TABLE SET TTL
sidebar_label: SET TTL
description: ALTER TABLE SET TTL SQL keyword reference documentation.
---

Sets the time-to-live (TTL) period on a table.

Refer to the [section on TTL](/docs/concepts/ttl/) for a conceptual overview.

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)

![Flow chart showing the syntax of ALTER TABLE with SET TTL keyword](/images/docs/diagrams/setTtl.svg)

## Description

To store and analyze only recent data, configure a time-to-live (TTL) period on
a table using the `ALTER TABLE SET TTL` command.

Follow the `TTL` keyword with a number and a time unit, one of:

- `HOURS`
- `DAYS`
- `WEEKS`
- `MONTHS`
- `YEARS`

TTL units fall into two categories:

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

:::note

QuestDB drops data that exceeded its TTL only a whole partition at a time. For
this reason, the TTL period must be a whole number multiple of the table's
partition size.

For example:

- If a table is partitioned by `DAY`, the TTL must be a whole number of days
  (`24 HOURS`, `2 DAYS` and `3 MONTHS` are all accepted)
- If a table is partitioned by `MONTH`, the TTL must be in months or years.
  QuestDB won't accept the `HOUR`, `DAY`, or `WEEK` units

Refer to the [section on TTL in Concepts](/docs/concepts/ttl/) for detailed
information on the behavior of this feature.

:::

## Examples

Set the TTL to 3 weeks:

```sql
ALTER TABLE weather SET TTL 3 WEEKS;
```

Set the TTL to 12 hours, using the shorthand syntax for the time unit:

```sql
ALTER TABLE weather SET TTL 12h;
```
