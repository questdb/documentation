---
title: Volume Profile
sidebar_label: Volume profile
description: Calculate volume profile by grouping trades into price bins
---

Calculate volume profile to show the distribution of trading volume across different price levels.

## Solution

Group trades into price bins using `FLOOR` and a tick size parameter:

```questdb-sql demo title="Calculate volume profile with fixed tick size"
DECLARE @tick_size := 1.0
SELECT
  floor(price / @tick_size) * @tick_size AS price_bin,
  round(SUM(amount), 2) AS volume
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp IN today()
ORDER BY price_bin;
```

Since QuestDB does an implicit GROUP BY on all non-aggregated columns, you can omit the explicit GROUP BY clause.

## Dynamic Tick Size

For consistent histograms across different price ranges, calculate the tick size dynamically to always produce approximately 50 bins:

```questdb-sql demo title="Volume profile with dynamic 50-bin distribution"
WITH raw_data AS (
  SELECT price, amount
  FROM trades
  WHERE symbol = 'BTC-USDT' AND timestamp IN today()
),
tick_size AS (
  SELECT (max(price) - min(price)) / 49 as tick_size
  FROM raw_data
)
SELECT
  floor(price / tick_size) * tick_size AS price_bin,
  round(SUM(amount), 2) AS volume
FROM raw_data CROSS JOIN tick_size
ORDER BY 1;
```

This will produce a histogram with a maximum of 50 buckets. If you have enough price difference between the first and last price for the interval, and if there are enough events with different prices, then you will get the full 50 buckets. If price difference is too small or if there are buckets with no events, then you might get less than 50.

:::info Related Documentation
- [FLOOR function](/docs/reference/function/numeric/#floor)
- [SUM aggregate](/docs/reference/function/aggregation/#sum)
- [DECLARE variables](/docs/reference/sql/declare/)
- [CROSS JOIN](/docs/reference/sql/join/#cross-join)
:::
