---
title: Volume spike detection
sidebar_label: Volume spikes
description: Detect volume spikes by comparing current volume against previous volume using LAG
---

Detect volume spikes by comparing current trading volume against the previous candle's volume.

## Problem

You have candles aggregated at 30 seconds intervals, and you want to show a flag 'spike' if volume is bigger than twice the latest record for the same symbol. Otherwise it should display 'normal'.

## Solution

Use the `LAG` window function to retrieve the previous candle's volume, then compare with a `CASE` statement:

```questdb-sql demo title="Detect volume spikes exceeding 2x previous volume"
DECLARE
  @anchor_date := timestamp_floor('30s', now()),
  @start_date := dateadd('h', -7, @anchor_date),
  @symbol := 'EURUSD'
WITH candles AS (
  SELECT
    timestamp,
    symbol,
    sum(quantity) AS volume
  FROM fx_trades
  WHERE timestamp >= @start_date
    AND symbol = @symbol
  SAMPLE BY 30s
),
prev_volumes AS (
  SELECT
    timestamp,
    symbol,
    volume,
    LAG(volume) OVER (PARTITION BY symbol ORDER BY timestamp) AS prev_volume
  FROM candles
)
SELECT
  *,
  CASE
    WHEN volume > 2 * prev_volume THEN 'spike'
    ELSE 'normal'
  END AS spike_flag
FROM prev_volumes;
```

:::info Related Documentation
- [LAG window function](/docs/query/functions/window/#lag)
- [SAMPLE BY](/docs/query/sql/sample-by/)
- [CASE expressions](/docs/query/sql/case/)
:::
