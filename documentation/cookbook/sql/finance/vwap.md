---
title: Volume Weighted Average Price (VWAP)
sidebar_label: VWAP
description: Calculate cumulative volume weighted average price using window functions for intraday trading analysis
---

Calculate the cumulative Volume Weighted Average Price (VWAP) for intraday trading analysis. VWAP is a trading benchmark that represents the average price at which an asset has traded throughout the day, weighted by volume. It's widely used by institutional traders to assess execution quality and identify trend strength.

## Problem: Calculate Running VWAP

You want to calculate the cumulative VWAP for a trading day, where each point shows the average price weighted by volume from market open until that moment. This helps traders determine if current prices are above or below the day's volume-weighted average.

## Solution: Use Window Functions for Cumulative Sums

While QuestDB doesn't have a built-in VWAP window function, we can calculate it using cumulative `SUM` window functions for both traded value and volume:

```questdb-sql demo title="Calculate cumulative VWAP over 10-minute intervals"
WITH sampled AS (
    SELECT
          timestamp, symbol,
          SUM(quantity) AS volume,
          SUM(price * quantity) AS traded_value
     FROM fx_trades
     WHERE timestamp IN yesterday()
     AND symbol = 'EURUSD'
     SAMPLE BY 10m
), cumulative AS (
     SELECT timestamp, symbol,
           SUM(traded_value)
                OVER (ORDER BY timestamp) AS cumulative_value,
           SUM(volume)
                OVER (ORDER BY timestamp) AS cumulative_volume
     FROM sampled
)
SELECT timestamp, symbol,
       cumulative_value/cumulative_volume AS vwap
     FROM cumulative;
```

This query:
1. Aggregates trades into 10-minute intervals, calculating total volume and total traded value (price × amount) for each interval
2. Uses window functions to compute running totals of both traded value and volume from the start of the day
3. Divides cumulative traded value by cumulative volume to get VWAP at each timestamp

## How It Works

VWAP is calculated as:

```
VWAP = Total Traded Value / Total Volume
     = Σ(Price × Volume) / Σ(Volume)
```

The key insight is using `SUM(...) OVER (ORDER BY timestamp)` to create running totals:
- `cumulative_value`: Running sum of (price × amount) from market open
- `cumulative_volume`: Running sum of volume from market open
- Final VWAP: Dividing these cumulative values gives the volume-weighted average at each point in time

### Window Function Behavior

When using `SUM() OVER (ORDER BY timestamp)` without specifying a frame clause, QuestDB defaults to summing from the first row to the current row, which is exactly what we need for cumulative VWAP.

## Adapting the Query

**Different time intervals:**
```questdb-sql demo title="VWAP with 1-minute resolution"
WITH sampled AS (
    SELECT
          timestamp, symbol,
          SUM(quantity) AS volume,
          SUM(price * quantity) AS traded_value
     FROM fx_trades
     WHERE timestamp IN yesterday()
     AND symbol = 'EURUSD'
     SAMPLE BY 1m -- Changed from 10m to 1m
), cumulative AS (
     SELECT timestamp, symbol,
           SUM(traded_value)
                OVER (ORDER BY timestamp) AS cumulative_value,
           SUM(volume)
                OVER (ORDER BY timestamp) AS cumulative_volume
     FROM sampled
)
SELECT timestamp, symbol,
       cumulative_value/cumulative_volume AS vwap
     FROM cumulative;
```

**Multiple symbols:**
```questdb-sql demo title="VWAP for multiple symbols"

WITH sampled AS (
    SELECT
          timestamp, symbol,
          SUM(quantity) AS volume,
          SUM(price * quantity) AS traded_value
     FROM fx_trades
     WHERE timestamp IN yesterday()
     AND symbol IN ('EURUSD', 'GBPUSD', 'JPYUSD')
     SAMPLE BY 10m
), cumulative AS (
     SELECT timestamp, symbol,
           SUM(traded_value)
                OVER (ORDER BY timestamp) AS cumulative_value,
           SUM(volume)
                OVER (ORDER BY timestamp) AS cumulative_volume
     FROM sampled
)
SELECT timestamp, symbol,
       cumulative_value/cumulative_volume AS vwap
     FROM cumulative;
```

Note the addition of `PARTITION BY symbol` to calculate separate VWAP values for each symbol.

**Different time ranges:**
```sql
-- Current trading day (today)
WHERE timestamp IN today()

-- Specific date
WHERE timestamp IN '2026-01-12'

-- Last hour
WHERE timestamp >= dateadd('h', -1, now())
```

:::tip Trading Use Cases
- **Execution quality**: Institutional traders compare their execution prices against VWAP to assess trade quality
- **Trend identification**: Price consistently above VWAP suggests bullish momentum; below suggests bearish
- **Support/resistance**: VWAP often acts as dynamic support or resistance during the trading day
- **Mean reversion**: Traders use deviations from VWAP to identify potential reversal points
:::

:::info Related Documentation
- [Window functions](/docs/query/functions/window-functions/syntax/)
- [SUM aggregate](/docs/query/functions/aggregation/#sum)
- [SAMPLE BY](/docs/query/sql/sample-by/)
:::
