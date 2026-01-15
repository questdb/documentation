---
title: Remove outliers from candle data
sidebar_label: Remove OHLC outliers
description: Filter outliers in OHLC candles using window functions to compare against moving averages
---

Remove outlier trades that differ significantly from recent average prices.

## Problem

You have candle data from trading pairs where some markets have very low volume trades that move the candle significantly. These are usually single trades with very low volume where the exchange rate differs a lot from the actual exchange rate. This makes charts hard to use and you would like to remove those from the chart.

Current query:

```questdb-sql demo title="Daily OHLC candles"
SELECT
    timestamp, symbol,
    first(price) AS open,
    last(price) AS close,
    min(price),
    max(price),
    sum(quantity) AS volume
FROM fx_trades
WHERE symbol = 'EURUSD' AND timestamp > dateadd('d', -14, now())
SAMPLE BY 1d;
```

The question is: is there a way to only select trades where the price deviates significantly from recent patterns?

## Solution

Use a window function to calculate a moving average of price, then filter out trades where the price deviates more than a threshold (e.g., 1%) from the moving average before aggregating with `SAMPLE BY`.

This query excludes trades where price deviates more than 1% from the 7-day moving average:

```questdb-sql demo title="Filter outliers using 7-day moving average"
WITH moving_trades AS (
  SELECT timestamp, symbol, price, quantity,
    avg(price) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      RANGE BETWEEN 7 days PRECEDING AND 1 day PRECEDING
    ) AS moving_avg_price
  FROM fx_trades
  WHERE symbol = 'EURUSD' AND timestamp > dateadd('d', -21, now())
)
SELECT
    timestamp, symbol,
    first(price) AS open,
    last(price) AS close,
    min(price),
    max(price),
    sum(quantity) AS volume
FROM moving_trades
WHERE timestamp > dateadd('d', -14, now())
  AND moving_avg_price IS NOT NULL
  AND ABS(price - moving_avg_price) <= moving_avg_price * 0.01
SAMPLE BY 1d;
```

:::note Moving Average Window
The CTE fetches 21 days of data (7 extra days) so the 7-day moving average window has enough history for the first rows in the 14-day result period.
:::

:::info Related Documentation
- [Window functions](/docs/query/functions/window-functions/syntax/)
- [AVG window function](/docs/query/functions/window-functions/reference/#avg)
- [SAMPLE BY](/docs/query/sql/sample-by/)
:::
