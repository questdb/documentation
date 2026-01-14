---
title: TICK and TRIN indicators
sidebar_label: TICK & TRIN
description: Calculate TICK and TRIN (ARMS Index) based on price direction for market breadth analysis
---

Calculate TICK and TRIN (Trading Index, also known as the ARMS Index) to measure market breadth. These indicators classify each time period as advancing or declining based on price movement.

## Problem: Measure market breadth by price direction

You want to calculate TICK and TRIN indicators using traditional definitions:
- **Uptick**: Current price > previous price
- **Downtick**: Current price < previous price
- **TICK** = upticks - downticks
- **TRIN** = (upticks / downticks) / (uptick_volume / downtick_volume)

## Solution: Use LAG to compare consecutive prices

### Per-symbol TICK and TRIN

Calculate separate indicators for each currency pair:

```questdb-sql demo title="TICK and TRIN per symbol"
WITH candles AS (
  SELECT timestamp, symbol, last(price) AS close, sum(quantity) AS total_volume
  FROM fx_trades
  WHERE timestamp IN yesterday()
    AND symbol IN ('EURUSD', 'GBPUSD', 'USDJPY')
  SAMPLE BY 10m
),
prev_prices AS (
  SELECT timestamp, symbol, close, total_volume,
    LAG(close) OVER (PARTITION BY symbol ORDER BY timestamp) AS prev_close
  FROM candles
),
classified AS (
  SELECT *,
    CASE WHEN close > prev_close THEN 1 ELSE 0 END AS is_uptick,
    CASE WHEN close < prev_close THEN 1 ELSE 0 END AS is_downtick,
    CASE WHEN close > prev_close THEN total_volume ELSE 0 END AS uptick_vol,
    CASE WHEN close < prev_close THEN total_volume ELSE 0 END AS downtick_vol
  FROM prev_prices
  WHERE prev_close IS NOT NULL
),
aggregated AS (
  SELECT symbol,
    SUM(is_uptick) AS upticks,
    SUM(is_downtick) AS downticks,
    SUM(is_uptick) - SUM(is_downtick) AS tick,
    SUM(uptick_vol) AS uptick_vol,
    SUM(downtick_vol) AS downtick_vol
  FROM classified
)
SELECT symbol,
  upticks,
  downticks,
  tick,
  upticks::double / downticks AS advance_decline_ratio,
  uptick_vol::double / downtick_vol AS upside_downside_ratio,
  (upticks::double / downticks) / (uptick_vol::double / downtick_vol) AS trin
FROM aggregated;
```

### Market-wide TICK and TRIN

Aggregate across all symbols for a single market breadth reading:

```questdb-sql demo title="Market-wide TICK and TRIN"
WITH candles AS (
  SELECT timestamp, symbol, last(price) AS close, sum(quantity) AS total_volume
  FROM fx_trades
  WHERE timestamp IN yesterday()
    AND symbol IN ('EURUSD', 'GBPUSD', 'USDJPY')
  SAMPLE BY 10m
),
prev_prices AS (
  SELECT timestamp, symbol, close, total_volume,
    LAG(close) OVER (PARTITION BY symbol ORDER BY timestamp) AS prev_close
  FROM candles
),
classified AS (
  SELECT *,
    CASE WHEN close > prev_close THEN 1 ELSE 0 END AS is_uptick,
    CASE WHEN close < prev_close THEN 1 ELSE 0 END AS is_downtick,
    CASE WHEN close > prev_close THEN total_volume ELSE 0 END AS uptick_vol,
    CASE WHEN close < prev_close THEN total_volume ELSE 0 END AS downtick_vol
  FROM prev_prices
  WHERE prev_close IS NOT NULL
),
aggregated AS (
  SELECT
    SUM(is_uptick) AS upticks,
    SUM(is_downtick) AS downticks,
    SUM(is_uptick) - SUM(is_downtick) AS tick,
    SUM(uptick_vol) AS uptick_vol,
    SUM(downtick_vol) AS downtick_vol
  FROM classified
)
SELECT
  upticks,
  downticks,
  tick,
  upticks::double / downticks AS advance_decline_ratio,
  uptick_vol::double / downtick_vol AS upside_downside_ratio,
  (upticks::double / downticks) / (uptick_vol::double / downtick_vol) AS trin
FROM aggregated;
```

## Interpreting the indicators

**TICK:**
- **Positive**: More upticks than downticks (bullish)
- **Negative**: More downticks than upticks (bearish)
- **Near zero**: Balanced market

**TRIN (ARMS Index):**
- **< 1.0**: Volume favoring advances (bullish)
- **> 1.0**: Volume favoring declines (bearish)
- **= 1.0**: Neutral

:::note TRIN limitations
TRIN can produce counterintuitive results. For example, if advances outnumber declines 2:1 and advancing volume also leads 2:1, TRIN equals 1.0 (neutral) despite bullish conditions. The query includes separate **advance_decline_ratio** and **upside_downside_ratio** columns to help identify such cases.
:::

:::info Related documentation
- [Window functions](/docs/query/functions/window-functions/syntax/)
- [LAG function](/docs/query/functions/window-functions/reference/#lag)
- [CASE expressions](/docs/query/sql/case/)
:::
