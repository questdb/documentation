---
title: Bollinger BandWidth
sidebar_label: Bollinger BandWidth
description: Calculate Bollinger BandWidth to measure volatility and identify squeeze setups for potential breakouts
---

Bollinger BandWidth quantifies the width of Bollinger Bands as a percentage, helping traders identify low-volatility squeeze conditions that often precede significant price moves.

## The problem

You have Bollinger Bands but want to objectively measure when volatility is unusually low. Visually spotting a "squeeze" is subjective. BandWidth provides a numeric value you can compare against historical levels to identify when bands are at the low end of their 6-month range.

## What is BandWidth?

BandWidth measures the percentage difference between the upper and lower Bollinger Bands:

```
BandWidth = ((Upper Band - Lower Band) / Middle Band) × 100
```

When BandWidth drops to historically low levels, the bands are in a "squeeze". Periods of low volatility are often followed by high volatility, so a squeeze suggests a significant price move may be coming. The squeeze does not indicate direction, only that a breakout is likely.

## Solution

```sql
-- TODO: Implement full query

-- The approach:
-- 1. Calculate Bollinger Bands (SMA20, upper, lower)
-- 2. Derive BandWidth: (upper - lower) / sma * 100
-- 3. Compare current BandWidth to its 6-month historical range

-- For step 3, consider:
percent_rank() OVER (
  ORDER BY bandwidth
  ROWS BETWEEN 8640 PRECEDING AND CURRENT ROW  -- ~6 months of 15m candles
) AS bandwidth_percentile

-- Or a simpler approach comparing to MIN/MAX over the period
```

## Interpreting results

- **Low BandWidth percentile** (< 10-20%): Squeeze condition, expect volatility expansion
- **High BandWidth percentile** (> 80-90%): High volatility, bands are wide
- **Rising BandWidth**: Volatility increasing
- **Falling BandWidth**: Volatility decreasing

The squeeze signals that *something* is about to happen, but not which direction. Use other indicators or price action to determine breakout direction.

:::info Related documentation
- [Bollinger Bands recipe](/docs/cookbook/sql/finance/bollinger-bands/)
- [Window functions](/docs/query/functions/window-functions/overview/)
:::
