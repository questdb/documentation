---
title: Donchian Channels
sidebar_label: Donchian Channels
description: Calculate Donchian Channels to identify breakouts and trading ranges using highest high and lowest low
---

Donchian Channels plot the highest high and lowest low over a period, creating a channel that tracks price range. Breakouts above the upper channel or below the lower channel often signal trend continuation.

## Problem

You want to identify breakout levels and trading ranges. Moving averages smooth price but don't show clear breakout levels. Donchian Channels show exactly where price needs to go to break out of its recent range.

## Solution

```questdb-sql demo title="Calculate 20-period Donchian Channels"
DECLARE
  @symbol := 'EURUSD',
  @lookback := '$now - 1M..$now'

SELECT
  timestamp,
  symbol,
  round(close, 5) AS close,
  round(max(high) OVER (
    PARTITION BY symbol
    ORDER BY timestamp
    ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
  ), 5) AS upper_channel,
  round(min(low) OVER (
    PARTITION BY symbol
    ORDER BY timestamp
    ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
  ), 5) AS lower_channel,
  round((max(high) OVER (
    PARTITION BY symbol
    ORDER BY timestamp
    ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
  ) + min(low) OVER (
    PARTITION BY symbol
    ORDER BY timestamp
    ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
  )) / 2, 5) AS middle_channel
FROM market_data_ohlc_15m
WHERE symbol = @symbol
  AND timestamp IN @lookback
ORDER BY timestamp;
```

The query calculates:
- **Upper channel**: 20-period highest high
- **Lower channel**: 20-period lowest low
- **Middle channel**: Average of upper and lower

## Interpreting results

- **Price breaks above upper**: Bullish breakout, potential long entry
- **Price breaks below lower**: Bearish breakout, potential short entry
- **Price at middle**: Neutral zone
- **Narrow channel**: Low volatility, breakout likely coming
- **Wide channel**: High volatility, trend in progress

:::note Turtle Trading
Donchian Channels were famously used by the Turtle Traders. Their system entered on 20-day breakouts and exited on 10-day breakouts in the opposite direction.
:::

:::info Related documentation
- [min/max window functions](/docs/query/functions/window-functions/reference/#min)
- [Window functions overview](/docs/query/functions/window-functions/overview/)
:::
