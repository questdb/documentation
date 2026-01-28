---
title: OBV (On-Balance Volume)
sidebar_label: OBV
description: Calculate On-Balance Volume to track cumulative buying and selling pressure using volume flow
---

On-Balance Volume (OBV) is a cumulative indicator that adds volume on up days and subtracts volume on down days. It shows whether volume is flowing into or out of an asset, often leading price movements.

## Problem

You want to confirm price trends with volume or spot divergences where volume doesn't support price movement. Raw volume numbers don't show direction, and comparing volumes across different time periods is difficult.

## Solution

```questdb-sql demo title="Calculate On-Balance Volume"
DECLARE
  @symbol := 'EURUSD',
  @lookback := dateadd('M', -1, now())

WITH with_direction AS (
  SELECT
    timestamp,
    symbol,
    close,
    quantity AS volume,
    CASE
      WHEN close > lag(close) OVER (PARTITION BY symbol ORDER BY timestamp) THEN quantity
      WHEN close < lag(close) OVER (PARTITION BY symbol ORDER BY timestamp) THEN -quantity
      ELSE 0
    END AS directed_volume
  FROM fx_trades_ohlc_1m
  WHERE symbol = @symbol
    AND timestamp > @lookback
)
SELECT
  timestamp,
  symbol,
  round(close, 5) AS close,
  round(volume, 0) AS volume,
  round(sum(directed_volume) OVER (
    PARTITION BY symbol
    ORDER BY timestamp
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ), 0) AS obv
FROM with_direction
ORDER BY timestamp;
```

The query:
1. Compares each close to the previous close
2. Assigns positive volume if price went up, negative if down, zero if unchanged
3. Calculates cumulative sum of directed volume

## Interpreting results

- **OBV rising with price**: Uptrend confirmed by volume
- **OBV falling with price**: Downtrend confirmed by volume
- **OBV rising, price flat**: Accumulation, potential breakout up
- **OBV falling, price flat**: Distribution, potential breakout down
- **OBV divergence from price**: Trend may be weakening

:::note OBV absolute value
The absolute value of OBV is meaningless. What matters is the direction and whether it confirms or diverges from price.
:::

:::info Related documentation
- [sum() window function](/docs/query/functions/window-functions/reference/#sum)
- [lag() function](/docs/query/functions/window-functions/reference/#lag)
:::
