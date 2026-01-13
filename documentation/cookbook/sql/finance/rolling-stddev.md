---
title: Rolling Standard Deviation
sidebar_label: Rolling std dev
description: Calculate rolling standard deviation using window functions and CTEs
---

Calculate rolling standard deviation to measure price volatility over time.

## Problem

You want to calculate the standard deviation in a time window. QuestDB supports stddev as an aggregate function, but not as a window function.

## Solution

The standard deviation can be calculated from the variance, which is the average of the square differences from the mean.

In general we could write it in SQL like this:

```sql
SELECT
  symbol,
  price,
  AVG(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS rolling_mean,
  SQRT(AVG(POWER(price - AVG(price) OVER (PARTITION BY symbol  ORDER BY timestamp ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 2))
       OVER (PARTITION BY symbol ORDER BY timestamp ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)) AS rolling_stddev
FROM
  fx_trades
WHERE timestamp IN yesterday()
```

But in QuestDB we cannot do any operations on the return value of a window function, so we need to do this using CTEs:

```questdb-sql demo title="Calculate rolling standard deviation"
WITH rolling_avg_cte AS (
  SELECT
    timestamp,
    symbol,
    price,
    AVG(price) OVER (PARTITION BY symbol ORDER BY timestamp) AS rolling_avg
  FROM
    fx_trades
  WHERE
    timestamp IN yesterday() AND symbol = 'EURUSD'
),
variance_cte AS (
  SELECT
    timestamp,
    symbol,
    price,
    rolling_avg,
    AVG(POWER(price - rolling_avg, 2)) OVER (PARTITION BY symbol ORDER BY timestamp) AS rolling_variance
  FROM
    rolling_avg_cte
)
SELECT
  timestamp,
  symbol,
  price,
  rolling_avg,
  rolling_variance,
  SQRT(rolling_variance) AS rolling_stddev
FROM
  variance_cte;
```

I first get the rolling average/mean, then from that I get the variance, and then I can do the `sqrt` to get the standard deviation as requested.

:::info Related Documentation
- [Window functions](/docs/query/functions/window-functions/syntax/)
- [AVG window function](/docs/query/functions/window-functions/reference/#avg)
- [POWER function](/docs/query/functions/numeric/#power)
- [SQRT function](/docs/query/functions/numeric/#sqrt)
:::
