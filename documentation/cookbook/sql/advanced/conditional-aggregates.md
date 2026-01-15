---
title: Multiple conditional aggregates
sidebar_label: Conditional aggregates
description: Calculate multiple conditional aggregates in a single query using CASE expressions
---

Calculate multiple aggregates with different conditions in a single pass through the data using CASE expressions.

## Problem

You need to calculate various metrics from the same dataset with different conditions:
- Count of buy orders
- Count of sell orders
- Average buy price
- Average sell price
- Total volume for large trades (> 1.0)
- Total volume for small trades (≤ 1.0)

Running separate queries is inefficient.

## Solution: CASE within aggregate functions

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

Which returns:


| symbol   | buy_count | sell_count | avg_buy_price     | avg_sell_price     | large_trade_volume | small_trade_volume | total_volume       |
| -------- | --------- | ---------- | ----------------- | ------------------ | ------------------ | ------------------ | ------------------ |
| ETH-USDT | 262870    | 212163     | 3275.286678129868 | 3273.6747631773655 | 152042.02150799974 | 51934.917160999976 | 203976.93866900489 |
| BTC-USDT | 789959    | 712152     | 94286.52121793582 | 94304.92124321847  | 1713.1241887299993 | 8803.505760999722  | 10516.629949730019 |


## How it works

### CASE returns NULL for non-matching rows

```sql
count(CASE WHEN side = 'buy' THEN 1 END)
```

- When `side = 'buy'`: CASE returns 1
- When `side != 'buy'`: CASE returns NULL (implicit ELSE NULL)
- `count()` only counts non-NULL values
- Result: counts only rows where side is 'buy'

### Aggregate functions ignore NULL

```sql
avg(CASE WHEN side = 'buy' THEN price END)
```

- `avg()` calculates average of non-NULL values only
- Only includes price when side is 'buy'
- Automatically skips all other rows

:::info Related Documentation
- [CASE expressions](/docs/query/sql/case/)
- [Aggregate functions](/docs/query/functions/aggregation/)
- [count()](/docs/query/functions/aggregation/#count)
:::
