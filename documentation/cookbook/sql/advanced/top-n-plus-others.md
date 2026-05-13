---
title: Top N plus others row
sidebar_label: Top N + Others
description: Group query results into top N rows plus an aggregated "Others" row using rank() and CASE expressions
---

Create aggregated results showing the top N items individually, with all remaining items combined into a single "Others" row. This pattern is useful for dashboards and reports where you want to highlight the most important items while still showing the total.

## Problem: Show top items plus remainder

You want to display results like:

| symbol     | total_trades |
|------------|--------------|
| BTC-USDT   | 15234        |
| ETH-USDT   | 12890        |
| SOL-USDT   | 8945         |
| MATIC-USDT | 6723         |
| AVAX-USDT  | 5891         |
| -Others-   | 23456        | ← Sum of all other symbols

Instead of listing all symbols (which might be thousands), show the top 5 individually and aggregate the rest.

## Solution: Use rank() with CASE statement

Use `rank()` to identify top N rows, then use `CASE` to group remaining rows:

```questdb-sql demo title="Top 5 symbols plus Others"
WITH totals AS (
  SELECT
    symbol,
    count() as total
  FROM trades
  WHERE timestamp IN '$now - 1d..$now'
),
ranked AS (
  SELECT
    *,
    rank() OVER (ORDER BY total DESC) as ranking
  FROM totals
)
SELECT
  CASE
    WHEN ranking <= 5 THEN symbol
    ELSE '-Others-'
  END as symbol,
  SUM(total) as total_trades
FROM ranked
GROUP BY 1
ORDER BY total_trades DESC;
```

**Results:**

| symbol     | total_trades |
|------------|--------------|
| BTC-USDT   | 15234        |
| ETH-USDT   | 12890        |
| SOL-USDT   | 8945         |
| MATIC-USDT | 6723         |
| AVAX-USDT  | 5891         |
| -Others-   | 23456        | ← Sum of all other symbols

## How it works

The query uses a three-step approach:

1. **Aggregate data** (`totals` CTE):
   - Count or sum values by the grouping column
   - Creates base data for ranking

2. **Rank rows** (`ranked` CTE):
   - `rank() OVER (ORDER BY total DESC)`: Assigns rank based on count (1 = highest)
   - Ties receive the same rank

3. **Conditional grouping** (outer query):
   - `CASE WHEN ranking <= 5`: Keep top 5 with original names
   - `ELSE '-Others-'`: Rename all others to "-Others-"
   - `SUM(total)`: Aggregate counts (combines all "Others" into one row)
   - `GROUP BY 1`: Group by the CASE expression result

### Understanding rank()

`rank()` assigns ranks with gaps for ties:

| symbol     | total | rank |
|------------|-------|------|
| BTC-USDT   | 1000  | 1    |
| ETH-USDT   | 900   | 2    |
| SOL-USDT   | 900   | 2    | ← Tie at rank 2
| AVAX-USDT  | 800   | 4    | ← Next rank is 4 (skips 3)
| MATIC-USDT | 700   | 5    |

If there are ties at the boundary (rank 5), all tied items will be included in top N.

## Alternative: Using row_number()

If you don't want to handle ties and always want exactly N rows in top tier:

```questdb-sql demo title="Top 5 symbols, discarding extra buckets in case of a match"
WITH totals AS (
  SELECT symbol, count() as total
  FROM trades
),
ranked AS (
  SELECT *, row_number() OVER (ORDER BY total DESC) as rn
  FROM totals
)
SELECT
  CASE WHEN rn <= 5 THEN symbol ELSE '-Others-' END as symbol,
  SUM(total) as total_trades
FROM ranked
GROUP BY 1
ORDER BY total_trades DESC;
```

**Difference:**
- `rank()`: May include more than N if there are ties at position N
- `row_number()`: Always exactly N in top tier (breaks ties arbitrarily)

## Adapting the pattern

**Different top N:**
```sql
-- Top 10 instead of top 5
WHEN ranking <= 10 THEN symbol

-- Top 3
WHEN ranking <= 3 THEN symbol
```

**Different aggregations:**
```sql
-- Sum instead of count
WITH totals AS (
  SELECT symbol, SUM(amount) as total_volume
  FROM trades
)
...
```

**Multiple levels:**
```sql
SELECT
  CASE
    WHEN ranking <= 5 THEN symbol
    WHEN ranking <= 10 THEN '-Top 10-'
    ELSE '-Others-'
  END as category,
  SUM(total) as count
FROM ranked
GROUP BY 1;
```

Results in three groups: top 5 individual, ranks 6-10 combined, rest combined.


**With percentage:**
```questdb-sql demo title="Top 5 symbols with percentage of total"
WITH totals AS (
  SELECT symbol, count() as total
  FROM trades
  WHERE timestamp IN '$now - 1d..$now'
),
ranked AS (
  SELECT *, rank() OVER (ORDER BY total DESC) as ranking
  FROM totals
),
summed AS (
  SELECT SUM(total) as grand_total FROM totals
),
grouped AS (
  SELECT
    CASE WHEN ranking <= 5 THEN symbol ELSE '-Others-' END as symbol,
    SUM(total) as total_trades
  FROM ranked
  GROUP BY 1
)
SELECT
  symbol,
  total_trades,
  round(100.0 * total_trades / grand_total, 2) as percentage
FROM grouped CROSS JOIN summed
ORDER BY total_trades DESC;
```


## Multiple grouping columns

Show top N for multiple dimensions:

```questdb-sql demo title="Top 3 for each symbol and side"
WITH totals AS (
  SELECT
    symbol,
    side,
    count() as total
  FROM trades
  WHERE timestamp IN '$now - 1d..$now'
),
ranked AS (
  SELECT
    *,
    rank() OVER (PARTITION BY side ORDER BY total DESC) as ranking
  FROM totals
)
SELECT
  side,
  CASE WHEN ranking <= 3 THEN symbol ELSE '-Others-' END as symbol,
  SUM(total) as total_trades
FROM ranked
GROUP BY side, 2
ORDER BY side, total_trades DESC;
```

This shows top 3 symbols separately for buy and sell sides.

## Visualization considerations

This pattern is particularly useful for charts:

**Pie/Donut charts:**
```sql
-- Top 5 slices plus "Others" slice
CASE WHEN ranking <= 5 THEN symbol ELSE '-Others-' END
```

**Bar charts:**
```sql
-- Top 10 bars, sorted by value
CASE WHEN ranking <= 10 THEN symbol ELSE '-Others-' END
ORDER BY total_trades DESC
```


:::warning Empty Others Row
If there are N or fewer distinct values, the "Others" row won't appear (or will have 0 count). Handle this in your visualization logic if needed.
:::

:::info Related Documentation
- [rank() window function](/docs/query/functions/window-functions/reference/#rank)
- [row_number() window function](/docs/query/functions/window-functions/reference/#row_number)
- [CASE expressions](/docs/query/sql/case/)
- [Window functions](/docs/query/functions/window-functions/syntax/)
:::
