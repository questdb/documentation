---
title: Stochastic Oscillator
sidebar_label: Stochastic Oscillator
description: Calculate the Stochastic Oscillator to identify overbought and oversold conditions based on price position within recent range
---

The Stochastic Oscillator compares a closing price to its price range over a period. It generates values between 0 and 100, showing where the current close sits relative to recent highs and lows.

## Problem

You want to identify overbought and oversold conditions based on where price is trading within its recent range. Unlike RSI which measures momentum, Stochastic shows the position of price relative to its high-low range.

## Solution

```questdb-sql demo title="Calculate Stochastic %K and %D"
DECLARE
  @symbol := 'EURUSD',
  @lookback := dateadd('M', -1, now())

WITH ranges AS (
  SELECT
    timestamp,
    symbol,
    close,
    min(low) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      ROWS BETWEEN 13 PRECEDING AND CURRENT ROW
    ) AS lowest_low,
    max(high) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      ROWS BETWEEN 13 PRECEDING AND CURRENT ROW
    ) AS highest_high
  FROM market_data_ohlc_15m
  WHERE symbol = @symbol
    AND timestamp > @lookback
),
with_k AS (
  SELECT
    timestamp,
    symbol,
    close,
    (close - lowest_low) / (highest_high - lowest_low) * 100 AS pct_k
  FROM ranges
  WHERE highest_high > lowest_low
)
SELECT
  timestamp,
  symbol,
  round(close, 5) AS close,
  round(pct_k, 2) AS pct_k,
  round(avg(pct_k) OVER (
    PARTITION BY symbol
    ORDER BY timestamp
    ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
  ), 2) AS pct_d
FROM with_k
ORDER BY timestamp;
```

The query:
1. Calculates 14-period lowest low and highest high using window functions
2. Computes %K as `(close - lowest_low) / (highest_high - lowest_low) * 100`
3. Calculates %D as 3-period SMA of %K

## Interpreting results

- **%K > 80**: Overbought zone
- **%K < 20**: Oversold zone
- **%K crosses above %D**: Bullish signal
- **%K crosses below %D**: Bearish signal
- **Divergence**: Price makes new high but %K doesn't, signals potential reversal

:::note Slow vs Fast Stochastic
This is the "slow" stochastic where %K is already smoothed by using a 3-period %D. The "fast" stochastic uses raw %K values, which are noisier.
:::

:::info Related documentation
- [Window functions](/docs/query/functions/window-functions/overview/)
- [min/max window functions](/docs/query/functions/window-functions/reference/#min)
:::
