---
title: Bollinger BandWidth
sidebar_label: Bollinger BandWidth
description: Calculate Bollinger BandWidth to measure volatility and identify squeeze setups for potential breakouts
---

Bollinger BandWidth quantifies the width of [Bollinger Bands](/docs/cookbook/sql/finance/bollinger-bands/) as a percentage, helping traders identify low-volatility squeeze conditions that often precede significant price moves.

## Problem

You have Bollinger Bands but want to objectively measure when volatility is unusually low. Visually spotting a "squeeze" is subjective. BandWidth provides a numeric value you can compare against historical levels to identify when bands are at their historical lows.

## What is BandWidth?

BandWidth measures the percentage difference between the upper and lower Bollinger Bands:

```
BandWidth = ((Upper Band - Lower Band) / Middle Band) × 100
```

When BandWidth drops to historically low levels, the bands are in a "squeeze". Periods of low volatility are often followed by high volatility, so a squeeze suggests a significant price move may be coming. The squeeze does not indicate direction, only that a breakout is likely.

## Solution

```questdb-sql demo title="Calculate Bollinger BandWidth with range position"
DECLARE
  @symbol := 'BTC-USDT',
  @history := '$now - 6M..$now',
  @display := '$now - 1M..$now'

WITH daily_ohlc AS (
  SELECT
    timestamp,
    symbol,
    first(open) AS open,
    max(high) AS high,
    min(low) AS low,
    last(close) AS close
  FROM trades_ohlc_15m
  WHERE symbol = @symbol
    AND timestamp IN @history
  SAMPLE BY 1d
),
bands AS (
  SELECT
    timestamp,
    symbol,
    close,
    AVG(close) OVER w AS sma20,
    AVG(close * close) OVER w AS avg_close_sq
  FROM daily_ohlc
  WINDOW w AS (PARTITION BY symbol ORDER BY timestamp ROWS 19 PRECEDING)
),
bollinger AS (
  SELECT
    timestamp,
    symbol,
    close,
    sma20,
    sma20 + 2 * sqrt(avg_close_sq - (sma20 * sma20)) AS upper_band,
    sma20 - 2 * sqrt(avg_close_sq - (sma20 * sma20)) AS lower_band
  FROM bands
),
with_bandwidth AS (
  SELECT
    timestamp,
    symbol,
    close,
    sma20,
    upper_band,
    lower_band,
    (upper_band - lower_band) / sma20 * 100 AS bandwidth
  FROM bollinger
),
with_range AS (
  SELECT
    timestamp,
    symbol,
    close,
    sma20,
    upper_band,
    lower_band,
    bandwidth,
    min(bandwidth) OVER w AS min_bw,
    max(bandwidth) OVER w AS max_bw
  FROM with_bandwidth
  WINDOW w AS (PARTITION BY symbol)
)
SELECT
  timestamp,
  symbol,
  round(close, 2) AS close,
  round(sma20, 2) AS sma20,
  round(upper_band, 2) AS upper_band,
  round(lower_band, 2) AS lower_band,
  round(bandwidth, 4) AS bandwidth,
  round((bandwidth - min_bw) / (max_bw - min_bw) * 100, 1) AS range_position
FROM with_range
WHERE timestamp IN @display
ORDER BY timestamp;
```

The query first aggregates 15-minute candles into daily OHLC, then calculates standard 20-day Bollinger Bands. This matches the traditional approach where SMA20 represents roughly one month of trading. The 6-month lookback (`@history`) establishes the historical range, while `@display` limits output to the last month. Standard deviation uses the variance formula `sqrt(avg(x²) - avg(x)²)`.

The `range_position` shows where current BandWidth falls within the 6-month range: 0% means at the historical minimum, 100% at the maximum. This works well for identifying squeeze conditions since you're comparing against historical extremes.

## Interpreting results

- **Low range position** (< 20%): BandWidth is near 6-month lows, indicating a squeeze
- **High range position** (> 80%): BandWidth is near 6-month highs, volatility is elevated
- **Rising BandWidth**: Volatility increasing, bands expanding
- **Falling BandWidth**: Volatility decreasing, bands contracting

A squeeze signals that volatility expansion is likely, but not the direction. Use price action or other indicators to determine breakout direction.

:::info Related documentation
- [Bollinger Bands recipe](/docs/cookbook/sql/finance/bollinger-bands/)
- [Window functions](/docs/query/functions/window-functions/overview/)
:::
