---
title: Rate of Change (ROC)
sidebar_label: Rate of Change
description: Calculate Rate of Change momentum indicator to measure percentage price change over a period
---

Rate of Change (ROC) measures the percentage change in price between the current price and the price N periods ago. It oscillates around zero, with positive values indicating upward momentum and negative values indicating downward momentum.

## Problem

You want a simple momentum indicator that shows how fast price is changing. Raw price differences don't account for the price level, making comparison across assets difficult.

## Solution

```questdb-sql demo title="Calculate 12-period Rate of Change"
DECLARE
  @symbol := 'EURUSD',
  @lookback := '$now - 1M..$now'

WITH with_lag AS (
  SELECT
    timestamp,
    symbol,
    close,
    lag(close, 12) OVER (PARTITION BY symbol ORDER BY timestamp) AS close_12_ago
  FROM market_data_ohlc_15m
  WHERE symbol = @symbol
    AND timestamp IN @lookback
)
SELECT
  timestamp,
  symbol,
  round(close, 5) AS close,
  round(close_12_ago, 5) AS close_12_ago,
  round((close - close_12_ago) / close_12_ago * 100, 4) AS roc
FROM with_lag
WHERE close_12_ago IS NOT NULL
ORDER BY timestamp;
```

The formula: `ROC = ((Close - Close N periods ago) / Close N periods ago) × 100`

## Interpreting results

- **ROC > 0**: Price higher than N periods ago, upward momentum
- **ROC < 0**: Price lower than N periods ago, downward momentum
- **ROC crossing zero**: Potential trend change
- **Extreme ROC values**: Overbought/oversold, may revert to mean

:::note Period selection
Common ROC periods:
- **9 or 12**: Short-term momentum
- **25**: Medium-term (roughly one month of daily data)
- **200**: Long-term trend
:::

:::info Related documentation
- [lag() function](/docs/query/functions/window-functions/reference/#lag)
- [Window functions overview](/docs/query/functions/window-functions/overview/)
:::
