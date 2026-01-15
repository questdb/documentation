---
title: Calculate compound interest
sidebar_label: Compound interest
description: Calculate compound interest over time using POWER and window functions
---

Calculate compound interest over multiple periods using SQL, where each period's interest is calculated on the previous period's ending balance. This is useful for financial modeling, investment projections, and interest calculations.

:::info Generated Data
This query uses generated data from `long_sequence()` to create a time series of years, so it can run directly on the demo instance without requiring any existing tables.
:::

## Problem: Need year-by-year growth

You want to calculate compound interest over 5 years, starting with an initial principal of 1000, with an annual interest rate of 0.1 (10%). Each year's interest should be calculated on the previous year's ending balance.

## Solution: Use POWER function with window functions

The compound interest formula is `principal * (1 + rate)^periods`. Use `POWER()` to calculate the exponential part:

```questdb-sql demo title="Calculate compound interest over 5 years"
WITH
year_series AS (
    DECLARE @year:=2000,
            @rate := 0.1,
            @principal := 1000.0
    SELECT @year as start_year, @year + (x - 1) AS timestamp,
    @rate AS interest_rate, @principal as initial_principal
    FROM long_sequence(5) -- number of years
),
compounded_values AS (
    SELECT
        timestamp,
        initial_principal,
        interest_rate,
        initial_principal *
            POWER(
                  1 + interest_rate,
                  timestamp - start_year + 1
                  ) AS compounding
    FROM
        year_series
), compounding_year_before AS (
SELECT
    timestamp,
    initial_principal,
    interest_rate,
    LAG(cv.compounding) OVER (ORDER BY timestamp) AS year_principal,
    cv.compounding as compounding_amount
FROM
    compounded_values cv
ORDER BY
    timestamp
    )
select timestamp, initial_principal, interest_rate,
coalesce(year_principal, initial_principal) as year_principal,
compounding_amount
from compounding_year_before;
```

**Results:**

| timestamp | initial_principal | interest_rate | year_principal | compounding_amount |
|-----------|-------------------|---------------|----------------|-------------------|
| 2000      | 1000.0            | 0.1           | 1000.0         | 1100.0            |
| 2001      | 1000.0            | 0.1           | 1100.0         | 1210.0            |
| 2002      | 1000.0            | 0.1           | 1210.0         | 1331.0            |
| 2003      | 1000.0            | 0.1           | 1331.0         | 1464.1            |
| 2004      | 1000.0            | 0.1           | 1464.1         | 1610.51           |

Each row shows how the principal grows year over year, with interest compounding on the previous year's ending balance.

## How it works

The query uses a multi-step CTE approach:

1. **Generate year series**: Use `long_sequence(5)` to create 5 rows representing years 2000-2004
2. **Calculate compound amount**: Use `POWER(1 + interest_rate, years)` to compute the ending balance for each year
3. **Get previous year's balance**: Use `LAG()` to access the previous row's compounding amount
4. **Handle first year**: Use `COALESCE()` to show the initial principal for the first year


:::tip
For more complex scenarios like monthly or quarterly compounding, adjust the time period generation and the exponent in the POWER function accordingly.
:::

:::info Related Documentation
- [POWER function](/docs/query/functions/numeric/#power)
- [Window functions](/docs/query/functions/window-functions/syntax/)
- [LAG window function](/docs/query/functions/window-functions/reference/#lag)
- [long_sequence](/docs/query/functions/row-generator/#long_sequence)
:::
