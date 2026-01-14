---
title: Aggressor volume imbalance
sidebar_label: Aggressor imbalance
description: Calculate buy vs sell aggressor volume imbalance for order flow analysis
---

Calculate the imbalance between buy and sell aggressor volume to analyze order flow. The aggressor is the party that initiated the trade by crossing the spread.

## Problem: Measure order flow imbalance

You have trade data with a `side` column indicating the aggressor (buyer or seller), and want to measure the imbalance between buying and selling pressure.

## Solution: Aggregate by side and calculate ratios

```questdb-sql demo title="Aggressor volume imbalance per symbol"
WITH volumes AS (
  SELECT
    symbol,
    SUM(CASE WHEN side = 'buy' THEN amount ELSE 0 END) AS buy_volume,
    SUM(CASE WHEN side = 'sell' THEN amount ELSE 0 END) AS sell_volume
  FROM trades
  WHERE timestamp IN yesterday()
    AND symbol IN ('ETH-USDT', 'BTC-USDT', 'ETH-BTC')
)
SELECT
  symbol,
  buy_volume,
  sell_volume,
  ((buy_volume - sell_volume)::double / (buy_volume + sell_volume)) * 100 AS imbalance
FROM volumes;
```

The imbalance ranges from -100% (all sell) to +100% (all buy), with 0% indicating balanced flow.

:::info Related documentation
- [CASE expressions](/docs/query/sql/case/)
- [Aggregation functions](/docs/query/functions/aggregation/)
:::
