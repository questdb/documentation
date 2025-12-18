---
title: Remove Outliers from Candle Data
sidebar_label: Remove outliers
description: Filter outliers using window functions to compare against moving averages
---

Remove outlier trades that differ significantly from recent average prices.

## Problem

You have candle data from trading pairs where some markets have very low volume trades that move the candle significantly. These are usually single trades with very low volume where the exchange rate differs a lot from the actual exchange rate. This makes charts hard to use and you would like to remove those from the chart.

Current query:

```sql
SELECT
    timestamp, symbol,
    first(price) AS open,
    last(price) AS close,
    min(price),
    max(price),
    sum(amount) AS volume
FROM trades
WHERE timestamp > dateadd('M', -1, now())
SAMPLE BY 1d ALIGN TO CALENDAR;
```

The question is: is there a way to only select trades where the traded amount deviates significantly from recent patterns?

## Solution

Use a window function to get the moving average for the amount, then `SAMPLE BY` in an outer query and compare the value of the sampled interval against the moving data. You can do this for the whole interval (when you don't specify `ORDER BY` and `RANGE` in the window definition), or you can make it relative to an interval in the past.

This query compares with the average of the past 6 days (7 days ago, but excluding the current row):

```questdb-sql demo title="Filter outliers using 7-day moving average"
WITH moving_trades AS (
  SELECT timestamp, symbol, price, amount,
    avg(amount) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      RANGE BETWEEN 7 days PRECEDING AND 1 day PRECEDING
    ) moving_avg_7_days
  FROM trades
  WHERE timestamp > dateadd('d', -37, now())
)
SELECT
    timestamp, symbol,
    first(price) AS open,
    last(price) AS close,
    min(price),
    max(price),
    sum(amount) AS volume
FROM moving_trades
WHERE timestamp > dateadd('M', -1, now())
  AND moving_avg_7_days IS NOT NULL
  AND ABS(moving_avg_7_days - price) > moving_avg_7_days * 0.01
SAMPLE BY 1d ALIGN TO CALENDAR;
```

:::info Related Documentation
- [Window functions](/docs/reference/sql/select/#window-functions)
- [AVG window function](/docs/reference/function/window/#avg)
- [SAMPLE BY](/docs/reference/sql/select/#sample-by)
- [ALIGN TO CALENDAR](/docs/reference/sql/select/#align-to-calendar-time-zone)
:::
