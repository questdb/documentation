---
title: Rolling standard deviation
sidebar_label: Rolling std dev
description: Calculate rolling standard deviation using window functions
---

Calculate rolling standard deviation to measure price volatility over time.

## Problem

You want to calculate rolling standard deviation. QuestDB supports `stddev` as an aggregate function, but not as a window function.

## Solution

Use the mathematical identity: `Var(X) = E[X²] - E[X]²`

Compute both `AVG(price)` and `AVG(price * price)` as window functions, then derive the standard deviation:

```questdb-sql demo title="Calculate rolling standard deviation"
WITH stats AS (
  SELECT
    timestamp,
    symbol,
    price,
    AVG(price) OVER (PARTITION BY symbol ORDER BY timestamp) AS rolling_avg,
    AVG(price * price) OVER (PARTITION BY symbol ORDER BY timestamp) AS rolling_avg_sq
  FROM fx_trades
  WHERE timestamp IN yesterday() AND symbol = 'EURUSD'
)
SELECT
  timestamp,
  symbol,
  price,
  rolling_avg,
  SQRT(rolling_avg_sq - rolling_avg * rolling_avg) AS rolling_stddev
FROM stats
LIMIT 10;
```

The key insight is that both window functions are computed in the same CTE, then combined in the final SELECT. This works because QuestDB doesn't allow operations on window function results directly within the same query level.

:::info Related documentation
- [Window functions](/docs/query/functions/window-functions/syntax/)
- [AVG window function](/docs/query/functions/window-functions/reference/#avg)
- [SQRT function](/docs/query/functions/numeric/#sqrt)
:::
