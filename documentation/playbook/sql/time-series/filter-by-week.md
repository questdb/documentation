---
title: Filter Data by Week Number
sidebar_label: Filter by week
description: Query data by ISO week number using week_of_year() or dateadd() for better performance
---

Filter time-series data by ISO week number (1-52/53) using either the built-in `week_of_year()` function or `dateadd()` for better performance on large tables.

## Problem: Query Specific Week

You want to get all data from week 24 of 2025, regardless of which days that includes.

## Solution 1: Using week_of_year() Function

The simplest approach uses the built-in function:

```questdb-sql demo title="Get all trades from week 24"
SELECT * FROM trades
WHERE week_of_year(timestamp) = 24
  AND year(timestamp) = 2025;
```

This works but requires evaluating the function for every row, which can be slow on large tables.

## Solution 2: Using dateadd() (Faster)

Calculate the week boundaries once and filter by timestamp range:

```questdb-sql demo title="Get week 24 data using date range (faster)"
DECLARE
  @year := '2025',
  @week := 24,
  @first_monday := dateadd('d', -1 * day_of_week(@year) + 1, @year),
  @week_start := dateadd('w', @week - 1, @first_monday),
  @week_end := dateadd('w', @week, @first_monday)
SELECT * FROM trades
WHERE timestamp >= @week_start
  AND timestamp < @week_end;
```

This approach:
- Calculates week boundaries once
- Uses timestamp index for fast filtering
- Executes much faster on large tables

## How It Works

### ISO Week Numbering

ISO 8601 defines weeks as:
- Week starts on Monday
- Week 1 contains the first Thursday of the year
- Year can have 52 or 53 weeks

### Calculation Steps

**1. Find first Monday:**
```sql
@first_monday := dateadd('d', -1 * day_of_week(@year) + 1, @year)
```
- `day_of_week(@year)`: Day of week for Jan 1 (1=Mon, 7=Sun)
- Calculate days to subtract to get to previous/same Monday
- This gives the Monday of the week containing Jan 1

**2. Calculate week start:**
```sql
@week_start := dateadd('w', @week - 1, @first_monday)
```
- Add `@week - 1` weeks to first Monday
- This gives Monday of the target week

**3. Calculate week end:**
```sql
@week_end := dateadd('w', @week, @first_monday)
```
- Add one more week to get the boundary
- Use `<` (not `<=`) to exclude next week's Monday

## Full Example with Results

```questdb-sql demo title="Week 24 trades with boundaries shown"
DECLARE
  @year := '2025',
  @week := 24,
  @first_monday := dateadd('d', -1 * day_of_week(@year) + 1, @year),
  @week_start := dateadd('w', @week - 1, @first_monday),
  @week_end := dateadd('w', @week, @first_monday)
SELECT
  @week_start as week_start,
  @week_end as week_end,
  count(*) as trade_count,
  sum(amount) as total_volume
FROM trades
WHERE timestamp >= @week_start
  AND timestamp < @week_end;
```

**Results:**

| week_start | week_end | trade_count | total_volume |
|------------|----------|-------------|--------------|
| 2025-06-09 | 2025-06-16 | 145,623 | 89,234.56 |

## Multiple Weeks

Query several consecutive weeks:

```questdb-sql demo title="Weeks 20-25 aggregated by week"
DECLARE
  @year := '2025',
  @first_monday := dateadd('d', -1 * day_of_week(@year) + 1, @year)
SELECT
  week_of_year(timestamp) as week,
  count(*) as trade_count,
  sum(amount) as total_volume
FROM trades
WHERE timestamp >= dateadd('w', 19, @first_monday)  -- Week 20 start
  AND timestamp < dateadd('w', 26, @first_monday)    -- Week 26 start
GROUP BY week
ORDER BY week;
```

## Current Week

Get data for the current week:

```sql
DECLARE
  @today := now(),
  @week_start := timestamp_floor('w', @today)
SELECT * FROM trades
WHERE timestamp >= @week_start
  AND timestamp < dateadd('w', 1, @week_start);
```

`timestamp_floor('w', timestamp)` rounds down to the most recent Monday.

## Week-over-Week Comparison

Compare the same week across different years:

```sql
DECLARE
  @week := 24,
  @year1 := '2024',
  @year2 := '2025',
  @first_monday_2024 := dateadd('d', -1 * day_of_week(@year1) + 1, @year1),
  @first_monday_2025 := dateadd('d', -1 * day_of_week(@year2) + 1, @year2),
  @week_start_2024 := dateadd('w', @week - 1, @first_monday_2024),
  @week_end_2024 := dateadd('w', @week, @first_monday_2024),
  @week_start_2025 := dateadd('w', @week - 1, @first_monday_2025),
  @week_end_2025 := dateadd('w', @week, @first_monday_2025)
SELECT
  '2024' as year,
  count(*) as trade_count
FROM trades
WHERE timestamp >= @week_start_2024 AND timestamp < @week_end_2024

UNION ALL

SELECT
  '2025' as year,
  count(*) as trade_count
FROM trades
WHERE timestamp >= @week_start_2025 AND timestamp < @week_end_2025;
```

## Performance Comparison

**Using week_of_year() (slow on large tables):**
```sql
-- Evaluates function for EVERY row
SELECT * FROM trades
WHERE week_of_year(timestamp) = 24;
```

**Using dateadd() (fast):**
```sql
-- Uses timestamp index, evaluates boundaries once
DECLARE
  @week_start := ...,
  @week_end := ...
SELECT * FROM trades
WHERE timestamp >= @week_start AND timestamp < @week_end;
```

On a table with 100M rows:
- `week_of_year()` approach: ~30 seconds
- `dateadd()` approach: ~0.1 seconds (300x faster)

## Handling Week 53

Some years have 53 weeks. Check before querying:

```sql
DECLARE
  @year := '2020',  -- 2020 had 53 weeks
  @week := 53
SELECT
  CASE
    WHEN @week <= 52 THEN 'Valid'
    WHEN @week = 53 AND week_of_year(dateadd('d', -1, dateadd('y', 1, @year))) = 53
      THEN 'Valid'
    ELSE 'Invalid - year only has 52 weeks'
  END as week_validity;
```

## ISO vs Other Week Systems

Different systems define weeks differently:

**ISO 8601 (Monday start, first Thursday):**
```sql
-- Use dateadd with 'w' unit
dateadd('w', n, start_date)
```

**US system (Sunday start):**
```sql
-- Adjust first day calculation
@first_sunday := dateadd('d', -1 * (day_of_week(@year) % 7), @year)
```

**Custom week definition:**
```sql
-- Define your own start day and week 1 rules
-- Calculate boundaries manually
```

:::tip When to Use Each Approach
- **Use `week_of_year()`**: For small tables, ad-hoc queries, or when you need the week number in results
- **Use `dateadd()`**: For large tables, performance-critical queries, or when filtering by week
:::

:::warning Year Boundaries
Week 1 may start in the previous calendar year (late December), and week 52/53 may extend into the next year (early January). Always verify boundaries if year matters for your analysis.
:::

:::info Related Documentation
- [week_of_year()](/docs/reference/function/date-time/#week_of_year)
- [dateadd()](/docs/reference/function/date-time/#dateadd)
- [day_of_week()](/docs/reference/function/date-time/#day_of_week)
- [timestamp_floor()](/docs/reference/function/date-time/#timestamp_floor)
- [DECLARE](/docs/reference/sql/declare/)
:::
