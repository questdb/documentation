---
title: Volume weighted average price (VWAP)
sidebar_label: VWAP
description: Calculate cumulative volume weighted average price using window functions for intraday trading analysis
---

Calculate the cumulative Volume Weighted Average Price (VWAP) for intraday trading analysis. VWAP is a trading benchmark that represents the average price at which an asset has traded throughout the day, weighted by volume. It's widely used by institutional traders to assess execution quality and identify trend strength.

## Problem: Calculate running VWAP

You want to calculate the cumulative VWAP for a trading day, where each point shows the average price weighted by volume from market open until that moment. This helps traders determine if current prices are above or below the day's volume-weighted average.

## Solution: Use typical price from OHLC data

The industry standard for VWAP uses the **typical price** formula from OHLC (Open, High, Low, Close) candles:

```
Typical Price = (High + Low + Close) / 3
VWAP = Σ(Typical Price × Volume) / Σ(Volume)
```

This approximation is used because most trading platforms work with OHLC data rather than tick-level trades. We use the `fx_trades_ohlc_1m` materialized view which provides 1-minute candles:

```questdb-sql demo title="Calculate cumulative VWAP"
WITH sampled AS (
  SELECT
    timestamp, symbol,
    total_volume,
    ((high + low + close) / 3) * total_volume AS traded_value
  FROM fx_trades_ohlc_1m
  WHERE timestamp IN '$yesterday' AND symbol = 'EURUSD'
)
SELECT
  timestamp, symbol,
  SUM(traded_value) OVER w / SUM(total_volume) OVER w AS vwap
FROM sampled
WINDOW w AS (ORDER BY timestamp);
```

This query:
1. Reads 1-minute OHLC candles and calculates typical price × volume for each candle
2. Divides cumulative traded value by cumulative volume using window functions

## How it works

The key insight is using `SUM(...) OVER w` with a named window to create running totals, then dividing them directly:

```sql
SUM(traded_value) OVER w / SUM(total_volume) OVER w AS vwap
...
WINDOW w AS (ORDER BY timestamp)
```

When using `SUM() OVER (ORDER BY timestamp)` without specifying a frame clause, QuestDB defaults to summing from the first row to the current row, which is exactly what we need for cumulative VWAP.

## Multiple symbols

To calculate VWAP for multiple symbols simultaneously, add `PARTITION BY symbol` to the window functions:

```questdb-sql demo title="VWAP for multiple symbols"
WITH sampled AS (
  SELECT
    timestamp, symbol,
    total_volume,
    ((high + low + close) / 3) * total_volume AS traded_value
  FROM fx_trades_ohlc_1m
  WHERE timestamp IN '$yesterday'
    AND symbol IN ('EURUSD', 'GBPUSD', 'USDJPY')
)
SELECT
  timestamp, symbol,
  SUM(traded_value) OVER w / SUM(total_volume) OVER w AS vwap
FROM sampled
WINDOW w AS (PARTITION BY symbol ORDER BY timestamp);
```

The `PARTITION BY symbol` ensures each symbol's VWAP is calculated independently.

## Different time ranges

```sql
-- Current trading day
WHERE timestamp IN '$today'

-- Specific date
WHERE timestamp IN '2026-01-12'

-- Last hour
WHERE timestamp IN '$now - 1h..$now'
```

:::tip Trading use cases
- **Execution quality**: Institutional traders compare their execution prices against VWAP to assess trade quality
- **Trend identification**: Price consistently above VWAP suggests bullish momentum; below suggests bearish
- **Support/resistance**: VWAP often acts as dynamic support or resistance during the trading day
- **Mean reversion**: Traders use deviations from VWAP to identify potential reversal points
:::

:::info Related documentation
- [Window functions](/docs/query/functions/window-functions/syntax/)
- [SUM aggregate](/docs/query/functions/aggregation/#sum)
- [Materialized views](/docs/concepts/materialized-views/)
:::
