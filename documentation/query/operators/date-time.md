---
title: Date and Time Operators
sidebar_label: Date and Time
description: Date and time operators for timestamp filtering in WHERE clauses
---

This page covers operators for filtering data by timestamp in `WHERE` clauses.

:::tip Recommended: TICK syntax

For most timestamp filtering, use `IN` with [TICK syntax](/docs/query/operators/tick/).
It handles simple ranges, multiple intervals, business days, timezones, and more
in a single unified syntax:

```questdb-sql
WHERE ts IN '2024-01-[01..31]T09:30@EST#wd;6h30m'
```

The `interval()` function and `BETWEEN` operator described below are alternatives
for specific use cases, but TICK syntax covers most needs.

:::

For date/time manipulation functions (`dateadd()`, `now()`, `extract()`, etc.),
see [Date/time functions](/docs/query/functions/date-time/).

## `IN` with timestamp intervals

The `IN` operator with a string argument queries timestamp intervals. QuestDB
uses [TICK syntax](/docs/query/operators/tick/) for all timestamp interval
expressions.

```questdb-sql
-- Simple: all data from a specific day
SELECT * FROM trades WHERE ts IN '2024-01-15';

-- With duration: 1-hour window starting at 09:30
SELECT * FROM trades WHERE ts IN '2024-01-15T09:30;1h';

-- Multiple dates with bracket expansion
SELECT * FROM trades WHERE ts IN '2024-01-[15,16,17]';

-- Workdays only with timezone
SELECT * FROM trades WHERE ts IN '2024-01-[01..31]T09:30@EST#wd;6h30m';

-- Dynamic: last 5 business days
SELECT * FROM trades WHERE ts IN '[$today-5bd..$today-1bd]';
```

For complete documentation of all patterns including bracket expansion,
date variables, timezones, and day filters, see
**[TICK interval syntax](/docs/query/operators/tick/)**.

:::note Interval scan optimization

When timestamp predicates are used on a [designated timestamp](/docs/concepts/designated-timestamp/)
column, QuestDB performs an [interval scan](/docs/concepts/deep-dive/interval-scan/)
using binary search instead of a full table scan.

This optimization works with:
- `IN` with TICK syntax or `interval()` function
- `BETWEEN` ranges
- Comparison operators (`>`, `<`, `>=`, `<=`)
- `AND` combinations (intersects intervals)
- `OR` combinations (unions intervals)

```questdb-sql
-- AND: intersects intervals (both conditions must match)
WHERE ts IN '2024-01' AND ts > '2024-01-15'
-- Results in: 2024-01-15 to 2024-01-31

-- OR: unions intervals (either condition matches)
WHERE ts IN '2024-01-10' OR ts IN '2024-01-20'
-- Results in: two separate interval scans
```

:::

## `IN` with `interval()` function

The `interval()` function creates an interval from two explicit bounds. This is
useful when bounds come from variables or subqueries.

:::tip

For static bounds, prefer TICK syntax: `IN '2024-01-01;30d'` instead of
`IN interval('2024-01-01', '2024-01-31')`.

:::

```questdb-sql title="Interval from explicit bounds"
SELECT * FROM trades
WHERE ts IN interval('2024-01-01', '2024-01-31');
```

```questdb-sql title="Interval with bound parameters (prepared statements)"
SELECT * FROM trades
WHERE ts IN interval($1, $2);
```

## `BETWEEN` ... `AND`

The `BETWEEN` operator specifies an inclusive range. Useful when working with
dynamic bounds from functions.

:::tip

For static ranges, prefer TICK syntax: `IN '2024-01'` instead of
`BETWEEN '2024-01-01' AND '2024-01-31'`.

:::

```questdb-sql title="Explicit timestamp range"
SELECT * FROM trades
WHERE ts BETWEEN '2024-01-01T00:00:00Z' AND '2024-01-31T23:59:59Z';
```

```questdb-sql title="Dynamic range using functions"
SELECT * FROM trades
WHERE ts BETWEEN dateadd('d', -7, now()) AND now();
```

`BETWEEN` produces the same [interval scan](/docs/concepts/deep-dive/interval-scan/)
optimization as `IN` when used on a designated timestamp column.

### When to use each

| Use case | Recommended |
|----------|-------------|
| Any static range | `IN` with TICK — `'2024-01'`, `'2024-01-15T09:00;1h'` |
| Multiple intervals | `IN` with TICK — `'2024-01-[15,16,17]'` |
| Schedules, business days | `IN` with TICK — `'[$today-5bd..$today]#workday'` |
| Dynamic bounds from functions | `BETWEEN` — `BETWEEN dateadd('d', -7, now()) AND now()` |
| Prepared statement parameters | `IN interval()` — `IN interval($1, $2)` |

## See also

- [TICK interval syntax](/docs/query/operators/tick/) — Full reference for `IN` patterns
- [Interval scan](/docs/concepts/deep-dive/interval-scan/) — How timestamp queries are optimized
- [Designated timestamp](/docs/concepts/designated-timestamp/) — Required for interval scan
- [Date/time functions](/docs/query/functions/date-time/) — `dateadd()`, `now()`, etc.
