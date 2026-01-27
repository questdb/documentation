---
title: OHLC bars
sidebar_label: OHLC bars
description: Generate OHLC (Open, High, Low, Close) bars from tick data using SAMPLE BY
---

Generate OHLC bars from raw trade data. OHLC summarizes price action within each time period: the first trade (open), highest price (high), lowest price (low), and last trade (close).

## The problem

You have tick-level trade data and need to aggregate it into standard candlestick bars for charting or technical analysis.

## Solution: Use SAMPLE BY with first, max, min, last

```questdb-sql demo title="Generate 1-minute OHLC bars"
SELECT
  timestamp,
  symbol,
  first(price) AS open,
  max(price) AS high,
  min(price) AS low,
  last(price) AS close,
  sum(quantity) AS total_volume
FROM fx_trades
WHERE timestamp IN today()
SAMPLE BY 1m;
```

This query:
1. Groups trades into 1-minute intervals using `SAMPLE BY`
2. Uses `first()` and `last()` to capture opening and closing prices
3. Uses `max()` and `min()` to capture the price range
4. Sums volume for each bar

## Pre-compute bars with a materialized view

If you query OHLC bars frequently, such as for a dashboard, create a materialized view to pre-compute the aggregation:

```questdb-sql title="Materialized view for 1-minute OHLC"
CREATE MATERIALIZED VIEW 'fx_trades_ohlc_1m' WITH BASE 'fx_trades' REFRESH IMMEDIATE AS (
  SELECT
    timestamp,
    symbol,
    first(price) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price) AS close,
    sum(quantity) AS total_volume
  FROM fx_trades
  SAMPLE BY 1m
) PARTITION BY HOUR TTL 2 DAYS;
```

QuestDB automatically refreshes the view as new trades arrive. Queries against the view return instantly regardless of the underlying data volume.

:::info Related documentation
- [SAMPLE BY](/docs/query/sql/sample-by/)
- [Materialized Views](/docs/concepts/materialized-views/)
- [Demo data schema](/docs/cookbook/demo-data-schema/)
:::
