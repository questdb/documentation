---
title: Multiple Conditional Aggregates
sidebar_label: Conditional aggregates
description: Calculate multiple conditional aggregates in a single query using CASE expressions for efficient data analysis
---

Calculate multiple aggregates with different conditions in a single pass through the data using CASE expressions. This pattern is more efficient than running separate queries and essential for creating summary reports with multiple metrics.

## Problem: Multiple Metrics with Different Filters

You need to calculate various metrics from the same dataset with different conditions:

- Count of buy orders
- Count of sell orders
- Average buy price
- Average sell price
- Total volume for large trades (> 1.0)
- Total volume for small trades (≤ 1.0)

Running separate queries is inefficient:

```sql
-- Inefficient: 6 separate scans
SELECT count(*) FROM trades WHERE side = 'buy';
SELECT count(*) FROM trades WHERE side = 'sell';
SELECT avg(price) FROM trades WHERE side = 'buy';
-- ... 3 more queries
```

## Solution: CASE Within Aggregate Functions

Use CASE expressions inside aggregates to calculate all metrics in one query:

```questdb-sql demo title="Multiple conditional aggregates in single query"
SELECT
  symbol,
  count(CASE WHEN side = 'buy' THEN 1 END) as buy_count,
  count(CASE WHEN side = 'sell' THEN 1 END) as sell_count,
  avg(CASE WHEN side = 'buy' THEN price END) as avg_buy_price,
  avg(CASE WHEN side = 'sell' THEN price END) as avg_sell_price,
  sum(CASE WHEN amount > 1.0 THEN amount END) as large_trade_volume,
  sum(CASE WHEN amount <= 1.0 THEN amount END) as small_trade_volume,
  sum(amount) as total_volume
FROM trades
WHERE timestamp >= dateadd('d', -1, now())
  AND symbol IN ('BTC-USDT', 'ETH-USDT')
GROUP BY symbol;
```

**Results:**

| symbol | buy_count | sell_count | avg_buy_price | avg_sell_price | large_trade_volume | small_trade_volume | total_volume |
|--------|-----------|------------|---------------|----------------|--------------------|--------------------|--------------  |
| BTC-USDT | 12,345 | 11,234 | 61,250.50 | 61,248.75 | 456.78 | 123.45 | 580.23 |
| ETH-USDT | 23,456 | 22,345 | 3,456.25 | 3,455.50 | 678.90 | 234.56 | 913.46 |

## How It Works

### CASE Returns NULL for Non-Matching Rows

```sql
count(CASE WHEN side = 'buy' THEN 1 END)
```

- When `side = 'buy'`: CASE returns 1
- When `side != 'buy'`: CASE returns NULL (implicit ELSE NULL)
- `count()` only counts non-NULL values
- Result: counts only rows where side is 'buy'

### Aggregate Functions Ignore NULL

```sql
avg(CASE WHEN side = 'buy' THEN price END)
```

- `avg()` calculates average of non-NULL values only
- Only includes price when side is 'buy'
- Automatically skips all other rows

## Time-Series Summary Report

Create comprehensive time-series summaries with multiple conditions:

```questdb-sql demo title="Hourly trading summary with multiple metrics"
SELECT
  timestamp_floor('h', timestamp) as hour,
  symbol,
  count(*) as total_trades,
  count(CASE WHEN side = 'buy' THEN 1 END) as buy_trades,
  count(CASE WHEN side = 'sell' THEN 1 END) as sell_trades,
  sum(amount) as total_volume,
  sum(CASE WHEN side = 'buy' THEN amount END) as buy_volume,
  sum(CASE WHEN side = 'sell' THEN amount END) as sell_volume,
  min(price) as low,
  max(price) as high,
  first(price) as open,
  last(price) as close,
  avg(CASE WHEN amount > 1.0 THEN price END) as avg_large_trade_price,
  count(CASE WHEN amount > 10.0 THEN 1 END) as whale_trades
FROM trades
WHERE timestamp >= dateadd('d', -7, now())
  AND symbol = 'BTC-USDT'
GROUP BY hour, symbol
ORDER BY hour DESC
LIMIT 24;
```

**Results:**

| hour | symbol | total_trades | buy_trades | sell_trades | total_volume | buy_volume | sell_volume | low | high | open | close | avg_large_trade_price | whale_trades |
|------|--------|--------------|------------|-------------|--------------|------------|-------------|-----|------|------|-------|----------------------|--------------|
| 2025-01-15 23:00 | BTC-USDT | 1,234 | 645 | 589 | 45.67 | 23.45 | 22.22 | 61,200 | 61,350 | 61,250 | 61,300 | 61,275 | 12 |

## Conditional Aggregates with SAMPLE BY

Combine conditional aggregates with time-series aggregation:

```questdb-sql demo title="5-minute candles with buy/sell split"
SELECT
  timestamp,
  symbol,
  first(price) as open,
  last(price) as close,
  min(price) as low,
  max(price) as high,
  sum(amount) as total_volume,
  sum(CASE WHEN side = 'buy' THEN amount ELSE 0 END) as buy_volume,
  sum(CASE WHEN side = 'sell' THEN amount ELSE 0 END) as sell_volume,
  (sum(CASE WHEN side = 'buy' THEN amount ELSE 0 END) /
   sum(amount) * 100) as buy_percentage
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp >= dateadd('h', -6, now())
SAMPLE BY 5m;
```

This creates 5-minute OHLCV candles with buy/sell volume breakdown.

## Percentage Calculations

Calculate percentages within the same query:

```questdb-sql demo title="Trade distribution by size category"
SELECT
  symbol,
  count(*) as total_trades,
  count(CASE WHEN amount <= 0.1 THEN 1 END) as micro_trades,
  count(CASE WHEN amount > 0.1 AND amount <= 1.0 THEN 1 END) as small_trades,
  count(CASE WHEN amount > 1.0 AND amount <= 10.0 THEN 1 END) as medium_trades,
  count(CASE WHEN amount > 10.0 THEN 1 END) as large_trades,
  (count(CASE WHEN amount <= 0.1 THEN 1 END) * 100.0 / count(*)) as micro_pct,
  (count(CASE WHEN amount > 0.1 AND amount <= 1.0 THEN 1 END) * 100.0 / count(*)) as small_pct,
  (count(CASE WHEN amount > 1.0 AND amount <= 10.0 THEN 1 END) * 100.0 / count(*)) as medium_pct,
  (count(CASE WHEN amount > 10.0 THEN 1 END) * 100.0 / count(*)) as large_pct
FROM trades
WHERE timestamp >= dateadd('d', -1, now())
GROUP BY symbol;
```

**Results:**

| symbol | total_trades | micro_trades | small_trades | medium_trades | large_trades | micro_pct | small_pct | medium_pct | large_pct |
|--------|--------------|--------------|--------------|---------------|--------------|-----------|-----------|------------|-----------|
| BTC-USDT | 50,000 | 35,000 | 10,000 | 4,000 | 1,000 | 70.0 | 20.0 | 8.0 | 2.0 |

## Ratio and Comparison Metrics

Calculate buy/sell ratios and imbalances:

```questdb-sql demo title="Order flow imbalance metrics"
SELECT
  timestamp,
  symbol,
  sum(CASE WHEN side = 'buy' THEN amount END) as buy_volume,
  sum(CASE WHEN side = 'sell' THEN amount END) as sell_volume,
  (sum(CASE WHEN side = 'buy' THEN amount END) -
   sum(CASE WHEN side = 'sell' THEN amount END)) as volume_imbalance,
  (sum(CASE WHEN side = 'buy' THEN amount END) /
   NULLIF(sum(CASE WHEN side = 'sell' THEN amount END), 0)) as buy_sell_ratio,
  count(CASE WHEN side = 'buy' THEN 1 END) * 1.0 /
   count(CASE WHEN side = 'sell' THEN 1 END) as trade_count_ratio
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp >= dateadd('h', -1, now())
SAMPLE BY 5m;
```

**Key points:**
- `NULLIF(denominator, 0)` prevents division by zero
- Ratio > 1.0 indicates buying pressure
- Ratio < 1.0 indicates selling pressure

## Multiple Symbols Comparison

Compare metrics across different assets:

```questdb-sql demo title="Cross-asset summary statistics"
SELECT
  timestamp_floor('h', timestamp) as hour,
  sum(CASE WHEN symbol = 'BTC-USDT' THEN amount END) as btc_volume,
  sum(CASE WHEN symbol = 'ETH-USDT' THEN amount END) as eth_volume,
  sum(CASE WHEN symbol = 'SOL-USDT' THEN amount END) as sol_volume,
  avg(CASE WHEN symbol = 'BTC-USDT' THEN price END) as btc_avg_price,
  avg(CASE WHEN symbol = 'ETH-USDT' THEN price END) as eth_avg_price,
  avg(CASE WHEN symbol = 'SOL-USDT' THEN price END) as sol_avg_price,
  count(CASE WHEN symbol = 'BTC-USDT' THEN 1 END) as btc_trades,
  count(CASE WHEN symbol = 'ETH-USDT' THEN 1 END) as eth_trades,
  count(CASE WHEN symbol = 'SOL-USDT' THEN 1 END) as sol_trades
FROM trades
WHERE timestamp >= dateadd('d', -1, now())
  AND symbol IN ('BTC-USDT', 'ETH-USDT', 'SOL-USDT')
GROUP BY hour
ORDER BY hour DESC;
```

This creates a wide-format summary with one column per symbol.

## SUM vs COUNT for Conditional Counting

Two equivalent patterns for conditional counting:

```sql
-- Method 1: COUNT with CASE (recommended)
count(CASE WHEN condition THEN 1 END)

-- Method 2: SUM with CASE
sum(CASE WHEN condition THEN 1 ELSE 0 END)
```

**Recommendation:** Use `count(CASE WHEN ... THEN 1 END)` because:
- More semantically clear (counting occurrences)
- Slightly more efficient (no need to sum zeros)
- Standard SQL pattern

## Nested Conditions

Handle multiple condition levels:

```questdb-sql demo title="Complex conditional aggregates"
SELECT
  symbol,
  -- Profitable trades by side
  count(CASE
    WHEN side = 'buy' AND price < avg(price) OVER (PARTITION BY symbol) THEN 1
  END) as good_buy_entries,
  count(CASE
    WHEN side = 'sell' AND price > avg(price) OVER (PARTITION BY symbol) THEN 1
  END) as good_sell_entries,
  -- Volume-weighted metrics
  sum(CASE
    WHEN side = 'buy' AND amount > 1.0 THEN price * amount
  END) / NULLIF(sum(CASE
    WHEN side = 'buy' AND amount > 1.0 THEN amount
  END), 0) as vwap_large_buys,
  -- Time-based conditions
  count(CASE
    WHEN hour(timestamp) >= 9 AND hour(timestamp) < 16 THEN 1
  END) as market_hours_trades,
  count(CASE
    WHEN hour(timestamp) < 9 OR hour(timestamp) >= 16 THEN 1
  END) as after_hours_trades
FROM trades
WHERE timestamp >= dateadd('d', -1, now())
GROUP BY symbol;
```

## Performance Considerations

**Single scan vs multiple queries:**

```sql
-- Efficient: One scan, multiple aggregates
SELECT
  count(CASE WHEN side = 'buy' THEN 1 END),
  count(CASE WHEN side = 'sell' THEN 1 END)
FROM trades;

-- Inefficient: Two scans
SELECT count(*) FROM trades WHERE side = 'buy';
SELECT count(*) FROM trades WHERE side = 'sell';
```

**Index usage:**

```sql
-- Filter first, then conditional aggregates
SELECT
  count(CASE WHEN side = 'buy' THEN 1 END) as buy_count,
  count(CASE WHEN side = 'sell' THEN 1 END) as sell_count
FROM trades
WHERE timestamp >= dateadd('d', -1, now())  -- Uses timestamp index
  AND symbol = 'BTC-USDT';                  -- Uses symbol index if SYMBOL type
```

**Avoid redundant conditions:**

```sql
-- Good: Simple CASE
count(CASE WHEN amount > 1.0 THEN 1 END)

-- Wasteful: Unnecessary ELSE
count(CASE WHEN amount > 1.0 THEN 1 ELSE NULL END)  -- NULL is implicit
```

## Common Patterns

**Status distribution:**
```sql
SELECT
  count(CASE WHEN status = 'active' THEN 1 END) as active,
  count(CASE WHEN status = 'pending' THEN 1 END) as pending,
  count(CASE WHEN status = 'failed' THEN 1 END) as failed
FROM orders;
```

**Success rate:**
```sql
SELECT
  (count(CASE WHEN status = 'success' THEN 1 END) * 100.0 / count(*)) as success_rate,
  (count(CASE WHEN status = 'error' THEN 1 END) * 100.0 / count(*)) as error_rate
FROM api_requests;
```

**Size buckets:**
```sql
SELECT
  sum(CASE WHEN amount < 1 THEN amount END) as small_volume,
  sum(CASE WHEN amount >= 1 AND amount < 10 THEN amount END) as medium_volume,
  sum(CASE WHEN amount >= 10 THEN amount END) as large_volume
FROM trades;
```

:::tip When to Use This Pattern
Use conditional aggregates when you need:
- Multiple metrics with different filters from the same dataset
- Summary reports with various breakdowns
- Pivot-like transformations (conditions as columns)
- Performance optimization (single scan vs multiple queries)
:::

:::warning NULL Handling
Remember that CASE without ELSE returns NULL. This is what makes the pattern work:
- `count()` ignores NULLs (only counts matching rows)
- `sum()`, `avg()`, etc. ignore NULLs (only aggregate matching values)
- Never use `count(*)` with CASE - always use `count(expression)`
:::

:::info Related Documentation
- [CASE expressions](/docs/reference/sql/case/)
- [Aggregate functions](/docs/reference/function/aggregation/)
- [count()](/docs/reference/function/aggregation/#count)
- [SAMPLE BY](/docs/reference/sql/select/#sample-by)
:::
