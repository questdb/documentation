---
title: Rolling standard deviation
sidebar_label: Rolling std dev
description: Calculate rolling standard deviation using window functions
---

Calculate rolling standard deviation to measure price volatility over time.

## Problem

You want to calculate rolling standard deviation.

## Solution

Use the mathematical identity: `σ = √(E[X²] - E[X]²)`

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

## How it works

The mathematical relationship used here is:

```
Variance(X) = E[X²] - (E[X])²
StdDev(X) = √(E[X²] - (E[X])²)
```

Where:
- `E[X]` is the average (SMA) of prices
- `E[X²]` is the average of squared prices
- `√` is the square root function

This query calculates an expanding standard deviation from the beginning of the period to the current row. For a fixed rolling window, add a [frame clause](/docs/query/functions/window-functions/syntax/#frame-types-and-behavior) to both window functions using `ROWS` (fixed number of rows) or `RANGE` (time-based window).

:::info Related documentation
- [Window functions](/docs/query/functions/window-functions/syntax/)
- [AVG window function](/docs/query/functions/window-functions/reference/#avg)
- [SQRT function](/docs/query/functions/numeric/#sqrt)
:::
