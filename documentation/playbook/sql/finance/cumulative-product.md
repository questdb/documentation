---
title: Cumulative Product for Random Walk
sidebar_label: Cumulative product
description: Calculate cumulative product to simulate stock price paths from daily returns
---

Calculate the cumulative product of daily returns to simulate a stock's price path (random walk). This is useful for financial modeling, backtesting trading strategies, and portfolio analysis where you need to compound returns over time.

## Problem: Compound Daily Returns

You have a table with daily returns for a stock and want to calculate the cumulative price starting from an initial value (e.g., $100). Each day's price is calculated by multiplying the previous price by `(1 + return)`.

For example, with these daily returns:

| Date       | Daily Return (%) |
|------------|------------------|
| 2024-09-05 | 2.00            |
| 2024-09-06 | -1.00           |
| 2024-09-07 | 1.50            |
| 2024-09-08 | -3.00           |

You want to calculate:

| Date       | Daily Return (%) | Stock Price |
|------------|------------------|-------------|
| 2024-09-05 | 2.00            | 102.00      |
| 2024-09-06 | -1.00           | 100.98      |
| 2024-09-07 | 1.50            | 102.49      |
| 2024-09-08 | -3.00           | 99.42       |

## Solution: Use Logarithm Mathematics Trick

Since QuestDB doesn't allow functions on top of window function results, we use a mathematical trick: **the exponential of the sum of logarithms equals the product**.

```questdb-sql demo title="Calculate cumulative product via logarithms"
WITH ln_values AS (
    SELECT
        date,
        return,
        SUM(ln(1 + return)) OVER (ORDER BY date) AS ln_value
    FROM daily_returns
)
SELECT
    date,
    return,
    100 * exp(ln_value) AS stock_price
FROM ln_values;
```

This query:
1. Calculates `ln(1 + return)` for each day
2. Uses a cumulative `SUM` window function to add up the logarithms
3. Applies `exp()` to convert back to the product

## How It Works

The mathematical identity used here is:

```
product(1 + r₁, 1 + r₂, ..., 1 + rₙ) = exp(sum(ln(1 + r₁), ln(1 + r₂), ..., ln(1 + rₙ)))
```

Breaking it down:
- `ln(1 + return)` converts each multiplicative factor to an additive one
- `SUM(...) OVER (ORDER BY date)` creates a cumulative sum
- `exp(ln_value)` converts the cumulative sum back to a cumulative product
- Multiply by 100 to apply the starting price of $100

### Why This Works

QuestDB doesn't support direct window functions like `PRODUCT() OVER()`, and attempting `exp(SUM(ln(1 + return)) OVER ())` fails with a "dangling literal" error because you can't nest functions around window functions.

The workaround is to use a CTE to compute the cumulative sum first, then apply `exp()` in the outer query where it's operating on a regular column, not a window function result.

## Adapting to Your Data

You can easily modify this pattern:

**Different starting price:**
```sql
SELECT date, return, 1000 * exp(ln_value) AS stock_price  -- Start at $1000
FROM ln_values;
```

**Different time granularity:**
```sql
-- For hourly returns
WITH ln_values AS (
    SELECT
        timestamp,
        return,
        SUM(ln(1 + return)) OVER (ORDER BY timestamp) AS ln_value
    FROM hourly_returns
)
SELECT timestamp, 100 * exp(ln_value) AS price FROM ln_values;
```

**Multiple assets:**
```sql
WITH ln_values AS (
    SELECT
        date,
        symbol,
        return,
        SUM(ln(1 + return)) OVER (PARTITION BY symbol ORDER BY date) AS ln_value
    FROM daily_returns
)
SELECT
    date,
    symbol,
    100 * exp(ln_value) AS stock_price
FROM ln_values;
```

:::tip Use Case: Monte Carlo Simulation
This pattern is essential for Monte Carlo simulations in finance. Generate random returns, apply this cumulative product calculation, and run thousands of iterations to model possible future price paths.
:::

:::info Related Documentation
- [Window functions](/docs/reference/sql/over/)
- [Mathematical functions](/docs/reference/function/numeric/)
- [SUM aggregate](/docs/reference/function/aggregation/#sum)
:::
