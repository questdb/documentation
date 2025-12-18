---
title: Pivoting Query Results
sidebar_label: Pivoting results
description: Transform rows into columns using CASE statements to pivot time-series data
---

Pivoting transforms row-based data into column-based data, where values from one column become column headers. This is useful for creating wide-format reports or comparison tables.

## Problem: Long-format Results

When you aggregate data with `SAMPLE BY`, you get one row per time interval and grouping value:

```questdb-sql demo title="Query returning rows per symbol and timestamp"
SELECT timestamp, symbol, SUM(bid_price) AS total_bid
FROM core_price
WHERE timestamp IN today()
SAMPLE BY 1m
LIMIT 20;
```

**Results:**

| timestamp                   | symbol | total_bid          |
| --------------------------- | ------ | ------------------ |
| 2025-12-18T00:00:00.000000Z | AUDUSD | 1146.7547999999995 |
| 2025-12-18T00:00:00.000000Z | USDTRY | 77545.1637         |
| 2025-12-18T00:00:00.000000Z | USDSEK | 15655.122000000012 |
| 2025-12-18T00:00:00.000000Z | USDCHF | 1308.9189999999994 |
| 2025-12-18T00:00:00.000000Z | AUDCAD | 1533.120900000004  |
| 2025-12-18T00:00:00.000000Z | EURNZD | 3502.5426999999922 |
| 2025-12-18T00:00:00.000000Z | AUDNZD | 2014.2881000000089 |
| 2025-12-18T00:00:00.000000Z | USDMXN | 31111.124799999983 |
| 2025-12-18T00:00:00.000000Z | EURGBP | 1501.919500000002  |
| 2025-12-18T00:00:00.000000Z | EURJPY | 305747.47          |
| 2025-12-18T00:00:00.000000Z | USDZAR | 28375.69069999998  |
| 2025-12-18T00:00:00.000000Z | EURUSD | 2034.6741000000018 |
| 2025-12-18T00:00:00.000000Z | NZDCAD | 1365.2795000000028 |
| 2025-12-18T00:00:00.000000Z | USDCAD | 2318.794500000005  |
| 2025-12-18T00:00:00.000000Z | GBPNZD | 4033.9539000000054 |
| 2025-12-18T00:00:00.000000Z | NZDUSD | 977.1505000000012  |
| 2025-12-18T00:00:00.000000Z | USDHKD | 13200.823400000027 |
| 2025-12-18T00:00:00.000000Z | GBPCHF | 1856.3431999999962 |
| 2025-12-18T00:00:00.000000Z | NZDJPY | 152123.41999999998 |
| 2025-12-18T00:00:00.000000Z | GBPJPY | 348693.1200000006  |

This format has multiple rows per timestamp, one for each symbol.

## Solution: Pivot Using CASE Statements

To get one row per timestamp with a column for each symbol, use conditional aggregation with `CASE` statements:

```questdb-sql demo title="Pivot symbols into columns"
SELECT timestamp,
  SUM(CASE WHEN symbol='EURUSD' THEN bid_price END) AS EURUSD,
  SUM(CASE WHEN symbol='GBPUSD' THEN bid_price END) AS GBPUSD,
  SUM(CASE WHEN symbol='USDJPY' THEN bid_price END) AS USDJPY,
  SUM(CASE WHEN symbol='USDCHF' THEN bid_price END) AS USDCHF,
  SUM(CASE WHEN symbol='AUDUSD' THEN bid_price END) AS AUDUSD,
  SUM(CASE WHEN symbol='USDCAD' THEN bid_price END) AS USDCAD,
  SUM(CASE WHEN symbol='NZDUSD' THEN bid_price END) AS NZDUSD
FROM core_price
WHERE timestamp IN today()
SAMPLE BY 1m
LIMIT 5;
```

Now each timestamp has a single row with all symbols as columns, making cross-symbol comparison much easier.

## How It Works

The `CASE` statement conditionally includes values:

```sql
SUM(CASE WHEN symbol='EURUSD' THEN bid_price END) AS EURUSD
```

This means:
1. For each row, if `symbol='EURUSD'`, include the `bid_price` value
2. Otherwise, include `NULL` (implicit)
3. `SUM()` aggregates only the non-NULL values for each timestamp

The same pattern applies to each symbol, creating one column per unique value.

## Use Cases

Pivoting is useful for:
- **Comparison tables**: Side-by-side comparison of metrics across categories
- **Dashboard exports**: Wide-format data for spreadsheets or BI tools
- **Correlation analysis**: Computing correlations between time-series in different columns
- **Report generation**: Creating fixed-width reports with known categories

:::tip
For unknown or dynamic column lists, you'll need to generate the CASE statements programmatically in your application code. SQL doesn't support dynamic column generation.
:::

:::info Related Documentation
- [CASE expressions](/docs/reference/sql/case/)
- [SAMPLE BY aggregation](/docs/reference/function/aggregation/#sample-by)
- [Aggregation functions](/docs/reference/function/aggregation/)
:::
