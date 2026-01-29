---
title: ATR (Average True Range)
sidebar_label: ATR
description: Calculate Average True Range to measure market volatility for position sizing and stop-loss placement
---

Average True Range (ATR) measures market volatility by calculating the average of true ranges over a period. Unlike simple high-low range, true range accounts for gaps between periods, making it more accurate for volatile markets.

## Problem

You want to measure volatility to set appropriate stop-losses or position sizes. Simple high-low range misses overnight gaps, and standard deviation assumes normal distribution which markets don't follow.

## Solution

```questdb-sql demo title="Calculate 14-period ATR"
DECLARE
  @symbol := 'EURUSD',
  @lookback := '$now - 1M..$now'

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
    AND timestamp IN @lookback
),
true_range AS (
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
)
SELECT
  timestamp,
  symbol,
  round(close, 5) AS close,
  round(tr, 6) AS true_range,
  round(avg(tr, 'period', 14) OVER (PARTITION BY symbol ORDER BY timestamp), 6) AS atr
FROM true_range
ORDER BY timestamp;
```

The query:
1. Gets previous close using `lag()` to detect gaps
2. Calculates true range as the greatest of:
   - Current high - current low (intraday range)
   - |Current high - previous close| (gap up)
   - |Current low - previous close| (gap down)
3. Applies 14-period EMA smoothing to get ATR

## Interpreting results

- **High ATR**: Market is volatile, use wider stops
- **Low ATR**: Market is quiet, can use tighter stops
- **Rising ATR**: Volatility increasing, often during trends or breakouts
- **Falling ATR**: Volatility decreasing, often during consolidation

## Common uses

**Stop-loss placement:**
```sql
-- Stop at 2x ATR below entry
entry_price - 2 * atr AS stop_loss
```

**Position sizing:**
```sql
-- Risk 1% of account, sized by ATR
(account_size * 0.01) / atr AS position_size
```

:::note EMA vs Wilder's smoothing
This recipe uses standard EMA smoothing via `avg(value, 'period', 14)` where α = 2/(N+1). Wilder's original ATR uses α = 1/N, which is more gradual. For exact Wilder smoothing with a 14-period lookback, use `avg(value, 'period', 27)`. Most modern platforms offer both variants.
:::

:::info Related documentation
- [EMA window function](/docs/query/functions/window-functions/reference/#avg)
- [lag() function](/docs/query/functions/window-functions/reference/#lag)
- [greatest() function](/docs/query/functions/numeric/#greatest)
:::
