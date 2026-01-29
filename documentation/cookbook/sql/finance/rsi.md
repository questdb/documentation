---
title: RSI (Relative Strength Index)
sidebar_label: RSI
description: Calculate the Relative Strength Index momentum oscillator to identify overbought and oversold conditions
---

The Relative Strength Index (RSI) is a momentum oscillator that measures the speed and magnitude of recent price changes to evaluate overbought or oversold conditions. RSI oscillates between 0 and 100, with readings above 70 typically indicating overbought conditions and below 30 indicating oversold.

## Problem

You want to identify when an asset may be overbought or oversold based on recent price momentum. Raw price changes don't account for the relative strength of up moves versus down moves over a lookback period.

## Solution

```questdb-sql demo title="Calculate 14-period RSI with EMA smoothing"
DECLARE
  @symbol := 'EURUSD',
  @lookback := '$now - 1M..$now'

WITH changes AS (
  SELECT
    timestamp,
    symbol,
    close,
    close - lag(close) OVER (PARTITION BY symbol ORDER BY timestamp) AS change
  FROM market_data_ohlc_15m
  WHERE symbol = @symbol
    AND timestamp IN @lookback
),
gains_losses AS (
  SELECT
    timestamp,
    symbol,
    close,
    CASE WHEN change > 0 THEN change ELSE 0 END AS gain,
    CASE WHEN change < 0 THEN -change ELSE 0 END AS loss
  FROM changes
),
smoothed AS (
  SELECT
    timestamp,
    symbol,
    close,
    avg(gain, 'period', 14) OVER (PARTITION BY symbol ORDER BY timestamp) AS avg_gain,
    avg(loss, 'period', 14) OVER (PARTITION BY symbol ORDER BY timestamp) AS avg_loss
  FROM gains_losses
)
SELECT
  timestamp,
  symbol,
  round(close, 5) AS close,
  round(100 - (100 / (1 + avg_gain / avg_loss)), 2) AS rsi
FROM smoothed
WHERE avg_loss > 0
ORDER BY timestamp;
```

The query:
1. Calculates price changes using `lag()`
2. Separates gains (positive changes) and losses (negative changes)
3. Applies 14-period EMA smoothing to both using `avg(value, 'period', N)`
4. Computes RSI as `100 - (100 / (1 + avg_gain / avg_loss))`

## Interpreting results

- **RSI > 70**: Overbought, price may be due for a pullback
- **RSI < 30**: Oversold, price may be due for a bounce
- **RSI = 50**: Neutral momentum
- **Divergence**: When price makes new highs but RSI doesn't, it may signal weakening momentum

:::note EMA vs Wilder's smoothing
This recipe uses standard EMA smoothing via `avg(value, 'period', 14)` where α = 2/(N+1). Traditional RSI (Wilder's) uses α = 1/N, which is more gradual. For exact Wilder smoothing with a 14-period lookback, use `avg(value, 'period', 27)`. Most modern platforms offer both variants.
:::

:::info Related documentation
- [Window functions](/docs/query/functions/window-functions/overview/)
- [EMA window function](/docs/query/functions/window-functions/reference/#avg)
- [lag() function](/docs/query/functions/window-functions/reference/#lag)
:::
