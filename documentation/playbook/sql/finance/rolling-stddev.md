---
title: Rolling Standard Deviation
sidebar_label: Rolling std dev
description: Calculate rolling standard deviation for volatility analysis using window functions and variance mathematics
---

Calculate rolling standard deviation to measure price volatility over time. Rolling standard deviation shows how much prices deviate from their moving average, helping identify periods of high and low volatility. This is essential for risk management, option pricing, and volatility-based trading strategies.

## Problem: Window Function Limitation

You want to calculate standard deviation over a rolling time window, but QuestDB doesn't support `STDDEV` as a window function. However, we can work around this using the mathematical relationship between standard deviation and variance.

## Solution: Calculate Variance Using Window Functions

Since standard deviation is the square root of variance, and variance is the average of squared differences from the mean, we can calculate it step by step using CTEs:

```questdb-sql demo title="Calculate 20-period rolling standard deviation"
WITH rolling_avg_cte AS (
  SELECT
    timestamp,
    symbol,
    price,
    AVG(price) OVER (PARTITION BY symbol ORDER BY timestamp) AS rolling_avg
  FROM trades
  WHERE timestamp IN yesterday()
    AND symbol = 'BTC-USDT'
),
variance_cte AS (
  SELECT
    timestamp,
    symbol,
    price,
    rolling_avg,
    AVG(POWER(price - rolling_avg, 2))
      OVER (PARTITION BY symbol ORDER BY timestamp) AS rolling_variance
  FROM rolling_avg_cte
)
SELECT
  timestamp,
  symbol,
  price,
  round(rolling_avg, 2) AS rolling_avg,
  round(rolling_variance, 4) AS rolling_variance,
  round(SQRT(rolling_variance), 2) AS rolling_stddev
FROM variance_cte;
```

This query:
1. Calculates the rolling average (mean) of prices
2. Computes the variance as the average of squared differences from the mean
3. Takes the square root of variance to get standard deviation

## How It Works

The mathematical relationship used is:

```
Variance(X) = E[(X - μ)²]
            = Average of squared differences from mean

StdDev(X) = √Variance(X)
```

Where:
- `X` = price values
- `μ` = rolling average (mean)
- `E[...]` = expected value (average)

Breaking down the calculation:
1. **First CTE** (`rolling_avg_cte`): Calculates running average using `AVG() OVER ()`
2. **Second CTE** (`variance_cte`): For each price, calculates `(price - rolling_avg)²`, then averages these squared differences using another window function
3. **Final query**: Applies `SQRT()` to variance to get standard deviation

### Window Frame Defaults

When you don't specify a frame clause (like `ROWS BETWEEN`), QuestDB defaults to:
```sql
ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
```

This calculates from the start of the partition to the current row, giving you an expanding window. For a fixed rolling window, specify the frame explicitly.

## Fixed Rolling Window

For a true rolling window (e.g., last 20 periods), specify the frame clause:

```questdb-sql demo title="20-period rolling standard deviation with fixed window"
WITH rolling_avg_cte AS (
  SELECT
    timestamp,
    symbol,
    price,
    AVG(price) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) AS rolling_avg
  FROM trades
  WHERE timestamp IN yesterday()
    AND symbol = 'BTC-USDT'
),
variance_cte AS (
  SELECT
    timestamp,
    symbol,
    price,
    rolling_avg,
    AVG(POWER(price - rolling_avg, 2)) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) AS rolling_variance
  FROM rolling_avg_cte
)
SELECT
  timestamp,
  symbol,
  price,
  round(rolling_avg, 2) AS rolling_avg,
  round(SQRT(rolling_variance), 2) AS rolling_stddev
FROM variance_cte;
```

This calculates standard deviation over exactly the last 20 rows (19 preceding + current), providing a consistent window size throughout.

## Adapting the Query

**Different window sizes:**
```sql
-- 10-period rolling stddev (change 19 to 9)
ROWS BETWEEN 9 PRECEDING AND CURRENT ROW

-- 50-period rolling stddev (change 19 to 49)
ROWS BETWEEN 49 PRECEDING AND CURRENT ROW

-- 200-period rolling stddev (change 19 to 199)
ROWS BETWEEN 199 PRECEDING AND CURRENT ROW
```

**Time-based windows instead of row-based:**
```questdb-sql demo title="Rolling stddev over 1-hour time window"
WITH rolling_avg_cte AS (
  SELECT
    timestamp,
    symbol,
    price,
    AVG(price) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      RANGE BETWEEN 1 HOUR PRECEDING AND CURRENT ROW
    ) AS rolling_avg
  FROM trades
  WHERE timestamp IN yesterday()
    AND symbol = 'BTC-USDT'
),
variance_cte AS (
  SELECT
    timestamp,
    symbol,
    price,
    rolling_avg,
    AVG(POWER(price - rolling_avg, 2)) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      RANGE BETWEEN 1 HOUR PRECEDING AND CURRENT ROW
    ) AS rolling_variance
  FROM rolling_avg_cte
)
SELECT
  timestamp,
  symbol,
  price,
  round(rolling_avg, 2) AS rolling_avg,
  round(SQRT(rolling_variance), 2) AS rolling_stddev
FROM variance_cte;
```

**With OHLC candles:**
```questdb-sql demo title="Rolling stddev of candle closes"
WITH OHLC AS (
  SELECT
    timestamp,
    symbol,
    first(price) AS open,
    last(price) AS close,
    min(price) AS low,
    max(price) AS high
  FROM trades
  WHERE symbol = 'BTC-USDT'
    AND timestamp IN yesterday()
  SAMPLE BY 15m
),
rolling_avg_cte AS (
  SELECT
    timestamp,
    symbol,
    close,
    AVG(close) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) AS rolling_avg
  FROM OHLC
),
variance_cte AS (
  SELECT
    timestamp,
    symbol,
    close,
    rolling_avg,
    AVG(POWER(close - rolling_avg, 2)) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) AS rolling_variance
  FROM rolling_avg_cte
)
SELECT
  timestamp,
  symbol,
  close,
  round(rolling_avg, 2) AS sma_20,
  round(SQRT(rolling_variance), 2) AS stddev_20
FROM variance_cte;
```

**Multiple symbols:**
```questdb-sql demo title="Rolling stddev for multiple symbols"
WITH rolling_avg_cte AS (
  SELECT
    timestamp,
    symbol,
    price,
    AVG(price) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) AS rolling_avg
  FROM trades
  WHERE timestamp IN yesterday()
    AND symbol IN ('BTC-USDT', 'ETH-USDT', 'SOL-USDT')
),
variance_cte AS (
  SELECT
    timestamp,
    symbol,
    price,
    rolling_avg,
    AVG(POWER(price - rolling_avg, 2)) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) AS rolling_variance
  FROM rolling_avg_cte
)
SELECT
  timestamp,
  symbol,
  round(SQRT(rolling_variance), 2) AS rolling_stddev
FROM variance_cte
ORDER BY symbol, timestamp;
```

## Calculating Annualized Volatility

For option pricing and risk management, convert rolling standard deviation to annualized volatility:

```sql
-- Assuming daily returns, multiply by sqrt(252) for annual volatility
round(SQRT(rolling_variance) * SQRT(252), 4) AS annualized_volatility_pct

-- For intraday data, adjust the multiplier:
-- 1-minute bars: SQRT(252 * 390) -- 390 trading minutes per day
-- 5-minute bars: SQRT(252 * 78)
-- 1-hour bars: SQRT(252 * 6.5)
```

## Combining with Bollinger Bands

Rolling standard deviation is the foundation for Bollinger Bands:

```sql
SELECT
  timestamp,
  symbol,
  price,
  rolling_avg AS middle_band,
  rolling_avg + (2 * SQRT(rolling_variance)) AS upper_band,
  rolling_avg - (2 * SQRT(rolling_variance)) AS lower_band
FROM variance_cte;
```

:::tip Volatility Analysis Applications
- **Risk management**: Higher standard deviation indicates higher risk/volatility
- **Position sizing**: Adjust position sizes based on current volatility levels
- **Option pricing**: Volatility is a key input for option valuation models
- **Volatility targeting**: Maintain constant portfolio risk by adjusting to current volatility
- **Regime detection**: Identify transitions between high and low volatility regimes
:::

:::tip Interpretation
- **High stddev**: Large price swings, high uncertainty, potentially higher risk and opportunity
- **Low stddev**: Stable prices, low uncertainty, often precedes larger moves (volatility compression)
- **Expanding stddev**: Increasing volatility, trend acceleration or market stress
- **Contracting stddev**: Decreasing volatility, consolidation phase
:::

:::warning Performance Considerations
Calculating rolling standard deviation requires multiple passes over the data (once for average, once for variance). For very large datasets, consider:
- Filtering by timestamp range first
- Using larger time intervals (SAMPLE BY)
- Calculating on aggregated OHLC data rather than tick data
:::

:::info Related Documentation
- [Window functions](/docs/reference/sql/select/#window-functions)
- [AVG window function](/docs/reference/function/window/#avg)
- [POWER function](/docs/reference/function/numeric/#power)
- [SQRT function](/docs/reference/function/numeric/#sqrt)
- [Window frame clauses](/docs/reference/sql/select/#frame-clause)
:::
