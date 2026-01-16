---
title: Filter data by week number
sidebar_label: Filter by week
description: Query data by ISO week number using week_of_year() or dateadd() for better performance
---

Filter time-series data by week number using either the built-in `week_of_year()` function or `dateadd()` for better performance on large tables.

## Solution 1: Using week_of_year()

There is a built-in `week_of_year()` function, so this could be solved as:

```questdb-sql demo title="Filter by week using week_of_year()"
SELECT * FROM trades
WHERE week_of_year(timestamp) = 24;
```

## Solution 2: Using dateadd() (faster)

However, depending on your table size, especially if you are not filtering by any timestamp, you might prefer this alternative, as it executes faster:

```questdb-sql demo title="Filter by week using dateadd()"
SELECT * FROM trades
WHERE timestamp >= dateadd('w', 23, '2025-01-01')
  AND timestamp < dateadd('w', 24, '2025-01-01');
```

You need to be careful with that query, as it will start counting time from Jan 1st 1970, which is not a Monday.

## Solution 3: Start at first Monday of year

This alternative would start at the Monday of the week that includes January 1st:

```questdb-sql demo title="Filter by week using first Monday calculation"
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

:::info Related Documentation
- [week_of_year()](/docs/query/functions/date-time/#week_of_year)
- [dateadd()](/docs/query/functions/date-time/#dateadd)
- [day_of_week()](/docs/query/functions/date-time/#day_of_week)
- [DECLARE](/docs/query/sql/declare/)
:::
