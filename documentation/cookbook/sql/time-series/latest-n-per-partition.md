---
title: Get Latest N Records Per Partition
sidebar_label: Latest N per partition
description: Retrieve the most recent N rows for each distinct value using window functions and filtering
---

Retrieve the most recent N rows for each distinct partition value (e.g., latest 5 trades per symbol, last 10 readings per sensor). While `LATEST ON` returns only the single most recent row per partition, this pattern extends it to get multiple recent rows per partition.

## Problem: Need Multiple Recent Rows Per Group

You want to get the latest N rows for each distinct value in a column. For example:
- Latest 5 trades for each trading symbol
- Last 10 sensor readings per device
- Most recent 3 log entries per service

`LATEST ON` only returns one row per partition:

```questdb-sql demo title="LATEST ON returns only 1 row per symbol"
SELECT * FROM trades
WHERE timestamp in today()
LATEST ON timestamp PARTITION BY symbol;
```

But you need multiple rows per symbol.

## Solution: Use ROW_NUMBER() Window Function

Use `row_number()` to rank rows within each partition, then filter to keep only the top N:

```questdb-sql demo title="Get latest 5 trades for each symbol"
WITH ranked AS (
  SELECT
    *,
    row_number() OVER (PARTITION BY symbol ORDER BY timestamp DESC) as rn
  FROM trades
  WHERE timestamp in today()
)
SELECT timestamp, symbol, side, price, amount
FROM ranked
WHERE rn <= 5
ORDER BY symbol, timestamp DESC;
```

This returns up to 5 most recent trades for each symbol from the last day.

## How It Works

The query uses a two-step approach:

1. **Ranking step (CTE):**
   - `row_number() OVER (...)`: Assigns sequential numbers to rows within each partition
   - `PARTITION BY symbol`: Separate ranking for each symbol
   - `ORDER BY timestamp DESC`: Newest rows get lower numbers (1, 2, 3, ...)
   - Result: Each row gets a rank within its symbol group

2. **Filtering step (outer query):**
   - `WHERE rn <= 5`: Keep only rows ranked 1-5 (the 5 most recent)
   - `ORDER BY symbol, timestamp DESC`: Sort final results

### Understanding row_number()

`row_number()` assigns a unique sequential number within each partition:

| timestamp | symbol    | price | (row number) |
|-----------|-----------|-------|--------------|
| 10:03:00  | BTC-USDT  | 63000 | 1 (newest)   |
| 10:02:00  | BTC-USDT  | 62900 | 2            |
| 10:01:00  | BTC-USDT  | 62800 | 3            |
| 10:03:30  | ETH-USDT  | 3100  | 1 (newest)   |
| 10:02:30  | ETH-USDT  | 3095  | 2            |

With `WHERE rn <= 3`, we keep rows 1-3 for each symbol.

## Adapting the Query

**Different partition columns:**
```sql
-- Latest 10 per sensor_id
PARTITION BY sensor_id

-- Latest 5 per combination of symbol and exchange
PARTITION BY symbol, exchange

-- Latest N per user_id
PARTITION BY user_id
```

**Different sort orders:**
```sql
-- Oldest N rows per partition
ORDER BY timestamp ASC

-- Highest prices first
ORDER BY price DESC

-- Alphabetically
ORDER BY name ASC
```

**Dynamic N value:**
```questdb-sql demo title="Latest N trades with variable limit"
DECLARE @limit := 10

WITH ranked AS (
  SELECT *, row_number() OVER (PARTITION BY symbol ORDER BY timestamp DESC) as rn
  FROM trades
  WHERE timestamp >= dateadd('d', -1, now())
)
SELECT * FROM ranked WHERE rn <= @limit;
```

**Include additional filtering:**
```questdb-sql demo title="Latest 5 buy orders per symbol"
WITH ranked AS (
  SELECT
    *,
    row_number() OVER (PARTITION BY symbol ORDER BY timestamp DESC) as rn
  FROM trades
  WHERE timestamp in today()
    AND side = 'buy'  -- Additional filter before ranking
)
SELECT timestamp, symbol, side, price, amount
FROM ranked
WHERE rn <= 5;
```

**Show rank in results:**
```questdb-sql demo title="Show rank number in results"
WITH ranked AS (
  SELECT *, row_number() OVER (PARTITION BY symbol ORDER BY timestamp DESC) as rn
  FROM trades
  WHERE timestamp in today()
)
SELECT timestamp, symbol, price, rn as rank
FROM ranked
WHERE rn <= 5;
```

## Alternative: Use Negative LIMIT

For a simpler approach when you need the latest N rows **total** (not per partition), use negative LIMIT:

```questdb-sql demo title="Latest 100 trades overall (all symbols)"
SELECT * FROM trades
WHERE symbol = 'BTC-USDT'
ORDER BY timestamp DESC
LIMIT 100;
```

Or more convenient with QuestDB's negative LIMIT feature:

```questdb-sql demo title="Latest 100 trades using negative LIMIT"
SELECT * FROM trades
WHERE symbol = 'BTC-USDT'
LIMIT -100;
```

**But this doesn't work per partition** - it returns 100 total rows, not 100 per symbol.

## Performance Optimization

**Filter by timestamp first:**
```sql
-- Good: Reduces dataset before windowing
WITH ranked AS (
  SELECT *, row_number() OVER (PARTITION BY symbol ORDER BY timestamp DESC) as rn
  FROM trades
  WHERE timestamp in today()  -- Filter early
)
SELECT * FROM ranked WHERE rn <= 5;

-- Less efficient: Windows over entire table
WITH ranked AS (
  SELECT *, row_number() OVER (PARTITION BY symbol ORDER BY timestamp DESC) as rn
  FROM trades  -- No filter
)
SELECT * FROM ranked WHERE rn <= 5 AND timestamp in today();
```

**Limit partitions:**
```sql
-- Process only specific symbols
WHERE timestamp in today()
  AND symbol IN ('BTC-USDT', 'ETH-USDT', 'SOL-USDT')
```

## Top N with Aggregates

Combine with aggregates to get summary statistics for top N:

```questdb-sql demo title="Average price of latest 10 trades per symbol"
WITH ranked AS (
  SELECT
    timestamp,
    symbol,
    price,
    row_number() OVER (PARTITION BY symbol ORDER BY timestamp DESC) as rn
  FROM trades
  WHERE timestamp in today()
)
SELECT
  symbol,
  count(*) as trade_count,
  avg(price) as avg_price,
  min(price) as min_price,
  max(price) as max_price
FROM ranked
WHERE rn <= 10
GROUP BY symbol;
```

## Comparison with LATEST ON

| Feature | LATEST ON | row_number() + Filter |
|---------|-----------|----------------------|
| **Rows per partition** | Exactly 1 | Any number (N) |
| **Performance** | Very fast (optimized) | Moderate (requires ranking) |
| **Flexibility** | Fast | High (custom ordering, filtering) |
| **Use case** | Single latest value | Multiple recent values |


:::info Related Documentation
- [row_number() window function](/docs/query/functions/window-functions/reference/#row_number)
- [LATEST ON](/docs/query/sql/latest-on/)
- [Window functions](/docs/query/functions/window-functions/syntax/)
- [LIMIT](/docs/query/sql/select/#limit)
:::
