---
title: Maximum drawdown
sidebar_label: Maximum drawdown
description: Calculate maximum drawdown to measure the largest peak-to-trough decline for risk assessment
---

Maximum drawdown measures the largest percentage decline from a peak to a trough before a new peak is reached. It's a key risk metric showing the worst-case loss an investor would have experienced.

## Problem

You want to measure downside risk beyond simple volatility. Standard deviation treats up and down moves equally, but investors care more about losses. Maximum drawdown shows the actual worst decline experienced.

## Solution

```questdb-sql demo title="Calculate rolling maximum drawdown"
DECLARE
  @symbol := 'EURUSD',
  @lookback := dateadd('M', -1, now())

WITH with_peak AS (
  SELECT
    timestamp,
    symbol,
    close,
    max(close) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_peak
  FROM market_data_ohlc_15m
  WHERE symbol = @symbol
    AND timestamp > @lookback
),
with_drawdown AS (
  SELECT
    timestamp,
    symbol,
    close,
    running_peak,
    (close - running_peak) / running_peak * 100 AS drawdown
  FROM with_peak
)
SELECT
  timestamp,
  symbol,
  round(close, 5) AS close,
  round(running_peak, 5) AS peak,
  round(drawdown, 4) AS drawdown_pct,
  round(min(drawdown) OVER (
    PARTITION BY symbol
    ORDER BY timestamp
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ), 4) AS max_drawdown_pct
FROM with_drawdown
ORDER BY timestamp;
```

The query:
1. Tracks the running maximum (peak) price using `max() OVER (... UNBOUNDED PRECEDING)`
2. Calculates current drawdown as percentage from peak
3. Tracks the minimum (worst) drawdown seen so far

## Interpreting results

- **Drawdown = 0%**: At a new high
- **Drawdown negative**: Currently below peak by that percentage
- **Max drawdown**: Worst decline seen in the period
- **Recovery**: When drawdown returns to 0%, a new peak is reached

## Finding drawdown periods

```questdb-sql title="Identify significant drawdown periods"
DECLARE @symbol := 'EURUSD'

WITH with_peak AS (
  SELECT timestamp, symbol, close,
    max(close) OVER (PARTITION BY symbol ORDER BY timestamp ROWS UNBOUNDED PRECEDING) AS running_peak
  FROM market_data_ohlc_15m
  WHERE symbol = @symbol
),
with_drawdown AS (
  SELECT timestamp, symbol, close, running_peak,
    (close - running_peak) / running_peak * 100 AS drawdown
  FROM with_peak
)
SELECT timestamp, symbol, round(close, 5) AS close, round(drawdown, 2) AS drawdown_pct
FROM with_drawdown
WHERE drawdown < -1  -- Drawdowns greater than 1%
ORDER BY drawdown
LIMIT 10;
```

:::info Related documentation
- [max() window function](/docs/query/functions/window-functions/reference/#max)
- [min() window function](/docs/query/functions/window-functions/reference/#min)
:::
