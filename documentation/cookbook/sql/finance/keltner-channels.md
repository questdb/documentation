---
title: Keltner Channels
sidebar_label: Keltner Channels
description: Calculate Keltner Channels using EMA and ATR for volatility-based support and resistance levels
---

Keltner Channels are volatility-based bands set above and below an EMA. Unlike Bollinger Bands which use standard deviation, Keltner Channels use Average True Range (ATR), making them less sensitive to sudden price spikes.

## Problem

You want volatility bands that adapt to market conditions but are smoother than Bollinger Bands. Bollinger Bands can expand rapidly on single large moves, while Keltner Channels respond more gradually to sustained volatility changes.

## Solution

```questdb-sql demo title="Calculate Keltner Channels with 20 EMA and 2x ATR"
DECLARE
  @symbol := 'EURUSD',
  @lookback := dateadd('M', -1, now())

WITH with_prev AS (
  SELECT
    timestamp,
    symbol,
    high,
    low,
    close,
    lag(close) OVER (PARTITION BY symbol ORDER BY timestamp) AS prev_close
  FROM market_data_ohlc_15m
  WHERE symbol = @symbol
    AND timestamp > @lookback
),
with_tr AS (
  SELECT
    timestamp,
    symbol,
    high,
    low,
    close,
    greatest(
      high - low,
      abs(high - prev_close),
      abs(low - prev_close)
    ) AS tr
  FROM with_prev
  WHERE prev_close IS NOT NULL
),
with_indicators AS (
  SELECT
    timestamp,
    symbol,
    close,
    avg(close, 'period', 20) OVER (PARTITION BY symbol ORDER BY timestamp) AS ema20,
    avg(tr, 'period', 10) OVER (PARTITION BY symbol ORDER BY timestamp) AS atr
  FROM with_tr
)
SELECT
  timestamp,
  symbol,
  round(close, 5) AS close,
  round(ema20, 5) AS middle,
  round(ema20 + 2 * atr, 5) AS upper,
  round(ema20 - 2 * atr, 5) AS lower
FROM with_indicators
ORDER BY timestamp;
```

The query:
1. Calculates True Range accounting for gaps
2. Applies EMA smoothing to both price (20-period) and ATR (10-period)
3. Creates bands at ±2 ATR from the EMA

## Interpreting results

- **Price above upper**: Strong uptrend or overbought
- **Price below lower**: Strong downtrend or oversold
- **Price at middle (EMA)**: Mean reversion target
- **Channels widening**: Volatility increasing
- **Channels narrowing**: Volatility decreasing

## Keltner squeeze

When Bollinger Bands move inside Keltner Channels, it signals extremely low volatility (a "squeeze"). See the [Bollinger BandWidth recipe](/docs/cookbook/sql/finance/bollinger-bandwidth/) for measuring squeeze conditions.

:::info Related documentation
- [Bollinger Bands](/docs/cookbook/sql/finance/bollinger-bands/)
- [ATR recipe](/docs/cookbook/sql/finance/atr/)
- [EMA window function](/docs/query/functions/window-functions/reference/#avg)
:::
