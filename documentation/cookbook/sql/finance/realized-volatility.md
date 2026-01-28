---
title: Realized volatility
sidebar_label: Realized volatility
description: Calculate realized volatility from historical returns for risk measurement and comparison to implied volatility
---

Realized volatility measures the actual historical volatility of returns over a period. It's typically annualized to allow comparison with implied volatility from options markets.

## Problem

You want to measure how volatile an asset has actually been, either for risk management or to compare with implied volatility. ATR measures price range but not the statistical dispersion of returns.

## Solution

```questdb-sql demo title="Calculate 20-period realized volatility (annualized)"
DECLARE
  @symbol := 'EURUSD',
  @lookback := dateadd('M', -1, now())

WITH returns AS (
  SELECT
    timestamp,
    symbol,
    close,
    ln(close / lag(close) OVER (PARTITION BY symbol ORDER BY timestamp)) AS log_return
  FROM market_data_ohlc_15m
  WHERE symbol = @symbol
    AND timestamp > @lookback
),
with_stats AS (
  SELECT
    timestamp,
    symbol,
    close,
    log_return,
    avg(log_return) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) AS mean_return,
    avg(log_return * log_return) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) AS mean_sq_return
  FROM returns
  WHERE log_return IS NOT NULL
)
SELECT
  timestamp,
  symbol,
  round(close, 5) AS close,
  round(log_return * 100, 4) AS return_pct,
  round(sqrt(mean_sq_return - mean_return * mean_return) * sqrt(252 * 96) * 100, 2) AS realized_vol_annualized
FROM with_stats
ORDER BY timestamp;
```

The query:
1. Calculates log returns: `ln(close / previous_close)`
2. Computes rolling standard deviation using variance formula
3. Annualizes by multiplying by `sqrt(trading_periods_per_year)` (252 days × 96 fifteen-minute periods = 24,192)

## Interpreting results

- **High realized vol**: Market has been volatile, expect continued movement
- **Low realized vol**: Market has been calm, potential for breakout
- **Realized > Implied**: Options may be cheap (if you expect volatility to continue)
- **Realized < Implied**: Options may be expensive

:::note Annualization factor
For 15-minute data with 24/7 trading: `sqrt(365 * 96) ≈ 187`
For daily data with ~252 trading days: `sqrt(252) ≈ 15.87`
:::

:::info Related documentation
- [Rolling standard deviation recipe](/docs/cookbook/sql/finance/rolling-stddev/)
- [Window functions](/docs/query/functions/window-functions/overview/)
- [ln() function](/docs/query/functions/numeric/#ln)
:::
