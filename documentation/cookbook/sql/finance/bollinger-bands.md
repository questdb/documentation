---
title: Bollinger bands
sidebar_label: Bollinger Bands
description: Calculate Bollinger Bands using window functions for volatility analysis and mean reversion trading strategies
---

Calculate Bollinger Bands for volatility analysis and mean reversion trading. Bollinger Bands consist of a moving average with upper and lower bands set at a specified number of standard deviations above and below it. They help identify overbought/oversold conditions and measure market volatility.

## Problem: Calculate rolling bands with standard deviation

You want to calculate Bollinger Bands with a 20-period simple moving average (SMA) and bands at ±2 standard deviations. The challenge is that QuestDB doesn't support `STDDEV` as a window function, so you need a workaround using the mathematical relationship between variance and standard deviation.

## Solution: Calculate variance using window functions

Since standard deviation is the square root of variance, and variance is the average of squared differences from the mean, we can calculate it using window functions:

```questdb-sql demo title="Calculate Bollinger Bands with 20-period SMA"
WITH OHLC AS (
  SELECT
    timestamp, symbol,
      first(price) AS open,
      max(price) as high,
      min(price) as low,
      last(price) AS close,
      sum(quantity) AS volume
 FROM fx_trades
 WHERE symbol = 'EURUSD' AND timestamp IN yesterday()
 SAMPLE BY 15m
), stats AS (
  SELECT
    timestamp,
    close,
    AVG(close) OVER (
      ORDER BY timestamp
      ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) AS sma20,
    AVG(close * close) OVER (
      ORDER BY timestamp
      ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) AS avg_close_sq
  FROM OHLC
)
SELECT
  timestamp,
  close,
  sma20,
  sqrt(avg_close_sq - (sma20 * sma20)) as stdev20,
  sma20 + 2 * sqrt(avg_close_sq - (sma20 * sma20)) as upper_band,
  sma20 - 2 * sqrt(avg_close_sq - (sma20 * sma20)) as lower_band
FROM stats
ORDER BY timestamp;
```

This query:
1. Aggregates trades into 15-minute OHLC candles
2. Calculates a 20-period simple moving average of closing prices
3. Calculates the average of squared closing prices over the same 20-period window
4. Computes standard deviation using the mathematical identity: `σ = √(E[X²] - E[X]²)`
5. Adds/subtracts 2× standard deviation to create upper and lower bands

## How it works

The mathematical relationship used here is:

```
Variance(X) = E[X²] - (E[X])²
StdDev(X) = √(E[X²] - (E[X])²)
```

Where:
- `E[X]` is the average (SMA) of closing prices
- `E[X²]` is the average of squared closing prices
- `√` is the square root function

Breaking down the calculation:
1. **`AVG(close)`**: Simple moving average over 20 periods
2. **`AVG(close * close)`**: Average of squared prices over 20 periods
3. **`sqrt(avg_close_sq - (sma20 * sma20))`**: Standard deviation derived from variance
4. **Upper/Lower bands**: SMA ± (multiplier × standard deviation)

### Window frame clause

`ROWS BETWEEN 19 PRECEDING AND CURRENT ROW` creates a sliding window of exactly 20 rows (19 previous + current), which gives us the 20-period moving calculations required for standard Bollinger Bands.

## Adapting the parameters

**Different period lengths:**
```sql
-- 10-period Bollinger Bands (change 19 to 9)
AVG(close) OVER (ORDER BY timestamp ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) AS sma10,
AVG(close * close) OVER (ORDER BY timestamp ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) AS avg_close_sq
```

**Different band multipliers:**
```sql
-- 1 standard deviation bands (tighter)
sma20 + 1 * sqrt(avg_close_sq - (sma20 * sma20)) as upper_band,
sma20 - 1 * sqrt(avg_close_sq - (sma20 * sma20)) as lower_band

-- 3 standard deviation bands (wider)
sma20 + 3 * sqrt(avg_close_sq - (sma20 * sma20)) as upper_band,
sma20 - 3 * sqrt(avg_close_sq - (sma20 * sma20)) as lower_band
```

**Different time intervals:**
```sql
-- 5-minute candles
SAMPLE BY 5m

-- 1-hour candles
SAMPLE BY 1h
```

**Multiple symbols:**
```questdb-sql demo title="Bollinger Bands for multiple symbols"
WITH OHLC AS (
  SELECT
    timestamp, symbol,
      first(price) AS open,
      last(price) AS close,
      sum(quantity) AS volume
 FROM fx_trades
 WHERE symbol IN ('EURUSD', 'GBPUSD')
   AND timestamp IN yesterday()
 SAMPLE BY 15m
), stats AS (
  SELECT
    timestamp,
    symbol,
    close,
    AVG(close) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) AS sma20,
    AVG(close * close) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) AS avg_close_sq
  FROM OHLC
)
SELECT
  timestamp,
  symbol,
  close,
  sma20,
  sma20 + 2 * sqrt(avg_close_sq - (sma20 * sma20)) as upper_band,
  sma20 - 2 * sqrt(avg_close_sq - (sma20 * sma20)) as lower_band
FROM stats
ORDER BY symbol, timestamp;
```

Note the addition of `PARTITION BY symbol` to calculate separate Bollinger Bands for each symbol.

:::tip Trading Signals
- **Bollinger Squeeze**: When bands narrow, it indicates low volatility and often precedes significant price moves
- **Band Walk**: Price consistently touching the upper band suggests strong uptrend; lower band suggests downtrend
- **Mean Reversion**: Price touching or exceeding bands often signals potential reversals back to the mean
- **Volatility Measure**: Width between bands indicates market volatility - wider bands mean higher volatility
:::

:::tip Parameter Selection
- **Standard settings**: 20-period SMA with 2σ bands (captures ~95% of price action)
- **Day trading**: Use shorter periods (10 or 15) for more responsive bands
- **Swing trading**: Use standard 20-period or longer (50-period) for smoother signals
- **Volatility adjustment**: Use 2.5σ or 3σ bands in highly volatile markets
:::

:::info Related Documentation
- [Window functions](/docs/query/functions/window-functions/syntax/)
- [AVG window function](/docs/query/functions/window-functions/reference/#avg)
- [SQRT function](/docs/query/functions/numeric/#sqrt)
- [Window frame clauses](/docs/query/functions/window-functions/syntax/#frame-types-and-behavior)
:::
