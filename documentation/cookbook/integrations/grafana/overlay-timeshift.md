---
title: Overlay Two Time Series with Time Shift
sidebar_label: Overlay with timeshift
description: Overlay yesterday's and today's data on the same Grafana chart using time shift
---

Compare yesterday's data against today's data on the same Grafana chart by overlaying them.

## Problem

You have a query with Grafana's `timeshift` set to `1d/d` to display yesterday's data. You want to overlay today's data on the same chart, starting from scratch each day, so you can compare the shapes of both time series.

## Solution

Leave the timeshift as `1d/d` to cover yesterday, and add a new query to the same chart. In this new query, filter for timestamp plus 1 day to cover today's datapoints, then shift them back by 1 day for display.

**Query 1 (Yesterday's data):**
```sql
DECLARE
  @symbol := 'BTC-USDT'
WITH sampled AS (
    SELECT
          timestamp,  symbol,
          volume AS volume,
          ((open+close)/2) * volume AS traded_value
     FROM trades_OHLC_15m
     WHERE $__timeFilter(timestamp)
     AND symbol = @symbol
), cumulative AS (
     SELECT timestamp, symbol,
           SUM(traded_value)
                OVER (ORDER BY timestamp) AS cumulative_value,
           SUM(volume)
                OVER (ORDER BY timestamp) AS cumulative_volume
     FROM sampled
)
SELECT timestamp as time, cumulative_value/cumulative_volume AS vwap_yesterday FROM cumulative;
```

**Query 2 (Today's data, shifted back):**
```sql
DECLARE
  @symbol := 'BTC-USDT'
WITH sampled AS (
    SELECT
          timestamp,  symbol,
          volume AS volume,
          ((open+close)/2) * volume AS traded_value
     FROM trades_OHLC_15m
     WHERE timestamp BETWEEN dateadd('d',1,$__unixEpochFrom()*1000000)
       AND dateadd('d',1,$__unixEpochTo() * 1000000)
     AND symbol = @symbol
), cumulative AS (
     SELECT timestamp, symbol,
           SUM(traded_value)
                OVER (ORDER BY timestamp) AS cumulative_value,
           SUM(volume)
                OVER (ORDER BY timestamp) AS cumulative_volume
     FROM sampled
)
SELECT dateadd('d',-1,timestamp) as time, cumulative_value/cumulative_volume AS vwap_today FROM cumulative;
```

**Note:** This example uses `$__unixEpochFrom()` and `$__unixEpochTo()` macros from the PostgreSQL Grafana plugin. When using the QuestDB plugin, the equivalent macros are `$__fromTime` and `$__toTime` and don't need epoch conversion as those are native timestamps.

This creates an overlay chart where yesterday's and today's data align on the same time axis, allowing direct comparison.

:::info Related Documentation
- [UNION ALL](/docs/query/sql/union-except-intersect/)
- [Window functions](/docs/query/sql/over/)
- [Grafana integration](/docs/integrations/visualization/grafana/)
:::
