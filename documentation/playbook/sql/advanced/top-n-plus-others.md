---
title: Top N Plus Others Row
sidebar_label: Top N + Others
description: Group query results into top N rows plus an aggregated "Others" row using rank() and CASE expressions
---

Create aggregated results showing the top N items individually, with all remaining items combined into a single "Others" row. This pattern is useful for dashboards and reports where you want to highlight the most important items while still showing the total.

## Problem: Show Top Items Plus Remainder

You want to display results like:

| Browser            | Count |
|--------------------|-------|
| Chrome             | 450   |
| Firefox            | 380   |
| Safari             | 320   |
| Edge               | 280   |
| Opera              | 190   |
| -Others-           | 380   | ← Combined total of all other browsers

Instead of listing all browsers (which might be dozens), show the top 5 individually and aggregate the rest.

## Solution: Use rank() with CASE Statement

Use `rank()` to identify top N rows, then use `CASE` to group remaining rows:

```questdb-sql demo title="Top 5 symbols plus Others"
WITH totals AS (
  SELECT
    symbol,
    count() as total
  FROM trades
  WHERE timestamp >= dateadd('d', -1, now())
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

## How It Works

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

## Adapting the Pattern

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

**Different grouping columns:**
```questdb-sql demo title="Top 5 ECNs plus Others from market data"
WITH totals AS (
  SELECT
    ecn,
    count() as total
  FROM market_data
  WHERE timestamp >= dateadd('h', -1, now())
),
ranked AS (
  SELECT *, rank() OVER (ORDER BY total DESC) as ranking
  FROM totals
)
SELECT
  CASE WHEN ranking <= 5 THEN ecn ELSE '-Others-' END as ecn,
  SUM(total) as message_count
FROM ranked
GROUP BY 1
ORDER BY message_count DESC;
```

**With percentage:**
```questdb-sql demo title="Top 5 symbols with percentage of total"
WITH totals AS (
  SELECT symbol, count() as total
  FROM trades
  WHERE timestamp >= dateadd('d', -1, now())
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

## Alternative: Using row_number()

If you don't want to handle ties and always want exactly N rows in top tier:

```sql
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

## Multiple Grouping Columns

Show top N for multiple dimensions:

```sql
WITH totals AS (
  SELECT
    symbol,
    side,
    count() as total
  FROM trades
  WHERE timestamp >= dateadd('d', -1, now())
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

## Visualization Considerations

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

**Time series:**
```questdb-sql demo title="Top 5 symbols over time with Others"
WITH totals AS (
  SELECT
    timestamp_floor('h', timestamp) as hour,
    symbol,
    count() as total
  FROM trades
  WHERE timestamp >= dateadd('d', -1, now())
  SAMPLE BY 1h
),
overall_ranks AS (
  SELECT symbol, SUM(total) as grand_total
  FROM totals
  GROUP BY symbol
),
ranked_symbols AS (
  SELECT symbol, rank() OVER (ORDER BY grand_total DESC) as ranking
  FROM overall_ranks
)
SELECT
  t.hour,
  CASE WHEN rs.ranking <= 5 THEN t.symbol ELSE '-Others-' END as symbol,
  SUM(t.total) as hourly_total
FROM totals t
LEFT JOIN ranked_symbols rs ON t.symbol = rs.symbol
GROUP BY t.hour, 2
ORDER BY t.hour, hourly_total DESC;
```

This shows how top 5 symbols trade over time, with all others combined.

## Filtering Out Low Values

Add a minimum threshold to exclude negligible values:

```sql
WITH totals AS (
  SELECT symbol, count() as total
  FROM trades
  WHERE timestamp >= dateadd('d', -1, now())
),
ranked AS (
  SELECT *, rank() OVER (ORDER BY total DESC) as ranking
  FROM totals
  WHERE total >= 10  -- Exclude symbols with less than 10 trades
)
SELECT
  CASE WHEN ranking <= 5 THEN symbol ELSE '-Others-' END as symbol,
  SUM(total) as total_trades
FROM ranked
GROUP BY 1
ORDER BY total_trades DESC;
```

## Performance Tips

**Pre-filter data:**
```sql
-- Good: Filter before aggregation
WITH totals AS (
  SELECT symbol, count() as total
  FROM trades
  WHERE timestamp >= dateadd('d', -1, now())  -- Filter early
    AND symbol IN (SELECT DISTINCT symbol FROM watched_symbols)
)
...

-- Less efficient: Filter after aggregation
WITH totals AS (
  SELECT symbol, count() as total
  FROM trades  -- No filter
)
, filtered AS (
  SELECT * FROM totals
  WHERE ...  -- Late filter
)
...
```

**Limit ranking scope:**
```sql
-- If you only need top 5, don't rank beyond what's needed
WITH totals AS (
  SELECT symbol, count() as total
  FROM trades
  WHERE timestamp >= dateadd('d', -1, now())
  ORDER BY total DESC
  LIMIT 100  -- Rank only top 100, not all thousands
)
...
```

:::tip Custom Labels
Customize the "Others" label for your domain:
- `-Others-` (generic)
- `~Rest~` (shorter)
- `Other Symbols` (explicit)
- `Remaining Browsers` (domain-specific)

Choose a label that sorts appropriately and is clear in your context.
:::

:::warning Empty Others Row
If there are N or fewer distinct values, the "Others" row won't appear (or will have 0 count). Handle this in your visualization logic if needed.
:::

:::info Related Documentation
- [rank() window function](/docs/reference/function/window/#rank)
- [row_number() window function](/docs/reference/function/window/#row_number)
- [CASE expressions](/docs/reference/sql/case/)
- [Window functions](/docs/reference/sql/select/#window-functions)
:::
