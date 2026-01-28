---
title: MACD (Moving Average Convergence Divergence)
sidebar_label: MACD
description: Calculate MACD indicator with signal line and histogram for trend-following momentum analysis
---

MACD (Moving Average Convergence Divergence) is a trend-following momentum indicator that shows the relationship between two exponential moving averages. It consists of the MACD line, signal line, and histogram.

## Problem

You want to identify trend changes and momentum shifts. Simple moving averages lag too much, while raw price changes are too noisy. MACD combines fast and slow EMAs to filter noise while remaining responsive to trend changes.

## Solution

```questdb-sql demo title="Calculate MACD with signal line and histogram"
DECLARE
  @symbol := 'EURUSD',
  @lookback := dateadd('M', -1, now())

WITH ema AS (
  SELECT
    timestamp,
    symbol,
    close,
    avg(close, 'period', 12) OVER (PARTITION BY symbol ORDER BY timestamp) AS ema12,
    avg(close, 'period', 26) OVER (PARTITION BY symbol ORDER BY timestamp) AS ema26
  FROM market_data_ohlc_15m
  WHERE symbol = @symbol
    AND timestamp > @lookback
),
macd_line AS (
  SELECT
    timestamp,
    symbol,
    close,
    ema12,
    ema26,
    ema12 - ema26 AS macd
  FROM ema
),
with_signal AS (
  SELECT
    timestamp,
    symbol,
    close,
    macd,
    avg(macd, 'period', 9) OVER (PARTITION BY symbol ORDER BY timestamp) AS signal
  FROM macd_line
)
SELECT
  timestamp,
  symbol,
  round(close, 5) AS close,
  round(macd, 6) AS macd,
  round(signal, 6) AS signal,
  round(macd - signal, 6) AS histogram
FROM with_signal
ORDER BY timestamp;
```

The query:
1. Calculates 12-period and 26-period EMAs using `avg(value, 'period', N)`
2. Computes MACD line as the difference: EMA12 - EMA26
3. Calculates 9-period EMA of MACD as the signal line
4. Derives histogram as MACD - signal

## Interpreting results

- **MACD crosses above signal**: Bullish signal, momentum turning up
- **MACD crosses below signal**: Bearish signal, momentum turning down
- **Histogram growing**: Momentum strengthening in current direction
- **Histogram shrinking**: Momentum weakening, potential reversal
- **MACD above zero**: Uptrend (fast EMA above slow EMA)
- **MACD below zero**: Downtrend (fast EMA below slow EMA)

:::note Standard parameters
The classic MACD uses 12/26/9 periods. Some traders adjust these:
- Faster signals: 8/17/9
- Slower signals: 19/39/9
:::

:::info Related documentation
- [EMA window function](/docs/query/functions/window-functions/reference/#avg)
- [Window functions overview](/docs/query/functions/window-functions/overview/)
:::
