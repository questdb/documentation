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
  @lookback := '$now - 2d..$now'

WITH returns AS (
  SELECT
    timestamp,
    symbol,
    close,
    ln(close / lag(close)
        OVER (PARTITION BY symbol ORDER BY timestamp))
        AS log_return
  FROM market_data_ohlc_15m
  WHERE symbol = @symbol
    AND timestamp IN @lookback
),
with_stats AS (
  SELECT
    timestamp,
    symbol,
    close,
    log_return,
    avg(log_return) OVER w AS mean_return,
    avg(log_return * log_return) OVER w AS mean_sq_return
  FROM returns
  WHERE log_return IS NOT NULL
  WINDOW w AS (
    PARTITION BY symbol ORDER BY timestamp
    ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
  )
)
SELECT
  timestamp,
  symbol,
  round(close, 5) AS close,
  round(log_return * 100, 4) AS return_pct,
  round(
    sqrt(mean_sq_return - mean_return * mean_return)
        * sqrt(365 * 96) * 100,
    2) AS realized_vol_annualized
FROM with_stats
ORDER BY timestamp;
```

The query:
1. Calculates log returns: `ln(close / previous_close)`
2. Computes rolling standard deviation using variance formula
3. Annualizes by multiplying by `sqrt(periods_per_year)` (365 days × 96 fifteen-minute periods = 35,040 for the 24/7 simulated data)

## Interpreting results

- **High realized vol**: Market has been volatile, expect continued movement
- **Low realized vol**: Market has been calm, potential for breakout
- **Realized > Implied**: Options may be cheap (if you expect volatility to continue)
- **Realized < Implied**: Options may be expensive

:::note Annualization factor
The demo FX data is simulated continuously (24/7, including weekends), so the annualization factor uses `365 * 96` (365 days x 96 fifteen-minute periods per day). For real FX markets (24/5), use `260 * 96`. FX uses 260 (52 weeks x 5 trading days) rather than the 252 convention from US equities, which also excludes public holidays. For daily data, use `sqrt(260)`.
:::

:::note Variance formula
The formula `E[X^2] - E[X]^2` computes population variance. Practitioners often prefer sample variance with Bessel's correction (dividing by N-1 instead of N). For rolling windows of 20+ bars the difference is small (under 5%), but be aware of the distinction when comparing against other implementations.
:::

## Variant: from trade execution prices

The same pattern works against `fx_trades` using actual fill prices instead of mid-prices. This gives realized vol from the perspective of where trades actually executed, which can differ from mid-price vol in the presence of systematic slippage:

```questdb-sql demo title="Realized vol from 5-minute trade bars"
DECLARE
  @symbol := 'EURUSD',
  @lookback := '$now - 1M..$now'

WITH ohlc AS (
  SELECT
    timestamp,
    symbol,
    last(price) AS close
  FROM fx_trades
  WHERE symbol = @symbol
    AND timestamp IN @lookback
  SAMPLE BY 5m ALIGN TO CALENDAR
),
returns AS (
  SELECT
    timestamp,
    symbol,
    close,
    ln(close / lag(close)
        OVER (PARTITION BY symbol ORDER BY timestamp))
        AS log_return
  FROM ohlc
),
with_stats AS (
  SELECT
    timestamp,
    symbol,
    close,
    log_return,
    avg(log_return) OVER w AS mean_return,
    avg(log_return * log_return) OVER w AS mean_sq_return
  FROM returns
  WHERE log_return IS NOT NULL
  WINDOW w AS (
    PARTITION BY symbol ORDER BY timestamp
    ROWS BETWEEN 11 PRECEDING AND CURRENT ROW
  )
)
SELECT
  timestamp,
  symbol,
  round(close, 5) AS close,
  round(log_return * 100, 4) AS return_pct,
  round(
    sqrt(mean_sq_return - mean_return * mean_return)
        * sqrt(288 * 365) * 100,
    2) AS realized_vol_annualized
FROM with_stats
ORDER BY timestamp;
```

This variant uses a 12-bar rolling window (one hour of 5-minute bars) and the annualization factor `288 * 365` (288 five-minute bars per day times 365 days). The shorter window (1 hour vs 5 hours in the main query) produces a faster-reacting volatility estimate suited to intraday monitoring, while the 20-bar window on 15-minute bars gives a smoother signal better suited to longer-horizon analysis.

:::info Related documentation
- [Log returns](/docs/cookbook/sql/finance/log-returns/) - building block for this recipe
- [Rolling standard deviation](/docs/cookbook/sql/finance/rolling-stddev/) - the variance identity used here
- [Gamma scalping signal](/docs/cookbook/sql/finance/gamma-scalping-signal/) - combines realized vol with spread cost
- [Window functions](/docs/query/functions/window-functions/overview/)
- [ln() function](/docs/query/functions/numeric/#ln)
:::
