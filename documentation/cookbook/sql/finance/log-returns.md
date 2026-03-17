---
title: Log returns
sidebar_label: Log returns
description: Compute log returns between consecutive price observations for financial analysis
---

Log returns measure the relative change between consecutive prices using the natural logarithm. They are preferred over simple returns in financial analysis because they are additive over time and symmetric.

## Problem

You want to compute log returns between consecutive price observations.

## Solution

Use `LAG()` to access the previous row's value, then compute the natural log of the price ratio.

### Tick-by-tick log returns

This example computes log returns from the mid-price of individual quotes:

```questdb-sql demo title="Log returns from mid-price"
DECLARE
  @symbol := 'EURUSD',
  @lookback := '$now - 1m..$now'

SELECT
  timestamp,
  symbol,
  round((bid_price + ask_price) / 2, 5) AS mid_price,
  LN(
    (bid_price + ask_price) / 2 /
    LAG((bid_price + ask_price) / 2)
        OVER (PARTITION BY symbol ORDER BY timestamp)
  ) AS log_return
FROM core_price
WHERE symbol = @symbol
  AND timestamp IN @lookback;
```

### Fixed-frequency log returns

For returns at a fixed frequency, sample first then compute returns on the sampled result:

```questdb-sql demo title="One-minute log returns"
DECLARE
  @symbol := 'EURUSD',
  @lookback := '$now - 1d..$now'

WITH sampled AS (
  SELECT
    timestamp,
    symbol,
    last((bid_price + ask_price) / 2) AS close_mid
  FROM core_price
  WHERE symbol = @symbol
    AND timestamp IN @lookback
  SAMPLE BY 1m ALIGN TO CALENDAR
)
SELECT
  timestamp,
  symbol,
  round(close_mid, 5) AS close_mid,
  LN(close_mid / LAG(close_mid)
      OVER (ORDER BY timestamp)) AS log_return
FROM sampled;
```

## How it works

Log returns are defined as `ln(P_t / P_{t-1})` where `P_t` is the current price and `P_{t-1}` is the previous price. They are preferred over simple returns because:

- **Additive over time**: you can sum log returns across periods to get the total return
- **Symmetric**: a +10% gain and -10% loss don't net to zero with simple returns, but their log equivalents do

`LAG(value) OVER (ORDER BY timestamp)` gives the previous row's value in timestamp order. The first row returns `NULL` since there is no predecessor, which propagates through `LN` as `NULL`.

When computing returns at a fixed frequency, always aggregate into bars first with `SAMPLE BY` in a CTE, then apply `LAG()` to the sampled result. This ensures the window function runs over the small number of bars (e.g. 1,440 for one-minute bars over a day) rather than millions of raw ticks. See [this blog post](/blog/sample-by-window-function-order/) for a detailed walkthrough of why the order matters.

:::info Related documentation
- [Realized Volatility](/docs/cookbook/sql/finance/realized-volatility/) - uses log returns to compute rolling volatility
- [Cumulative Product](/docs/cookbook/sql/finance/cumulative-product/) - running product of returns
- [Rolling Std Dev](/docs/cookbook/sql/finance/rolling-stddev/) - rolling standard deviation of prices
- [Window functions](/docs/query/functions/window-functions/overview/)
- [ln() function](/docs/query/functions/numeric/#ln)
:::
