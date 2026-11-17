---
title: Reports with subtotals and grand totals
sidebar_label: Subtotals and grand totals
description: Build reports with detail rows, subtotals, and a grand total in one query using ROLLUP, CUBE, and GROUPING SETS
---

Reports often need detail rows, a subtotal per group, and a grand total in the
same result. `ROLLUP` and `CUBE` compute all of these levels in a single scan,
instead of one `GROUP BY` query per level combined with `UNION ALL`.

## Problem

You want a daily volume report for a trading desk, by ECN and currency pair,
with a subtotal after each ECN and a grand total at the end:

| ecn      | symbol      | trades  | volume         |
|----------|-------------|---------|----------------|
| Currenex | EURUSD      | 84885   | 11430345409.0  |
| Currenex | GBPUSD      | 66334   | 8932570866.0   |
| Currenex | All symbols | 151219  | 20362916275.0  |
| EBS      | EURUSD      | 83573   | 11202722174.0  |
| ...      | ...         | ...     | ...            |
| All ECNs | All symbols | 604467  | 80965873522.0  |

## Solution: ROLLUP with labelled totals

`ROLLUP(ecn, symbol)` returns the detail rows, one subtotal per ECN, and the
grand total. `GROUPING()` returns `1` on the rows where a column was rolled up,
so the outer query can replace those `NULL` values with labels and sort each
subtotal after its detail rows:

```questdb-sql demo title="Daily volume by ECN and symbol with subtotals"
WITH totals AS (
  SELECT
    ecn,
    symbol,
    GROUPING(ecn) AS ecn_total,
    GROUPING(symbol) AS symbol_total,
    count() AS trades,
    SUM(quantity) AS volume
  FROM fx_trades
  WHERE timestamp IN '$today'
    AND symbol IN ('EURUSD', 'GBPUSD')
  GROUP BY ROLLUP(ecn, symbol)
)
SELECT
  CASE WHEN ecn_total = 1 THEN 'All ECNs' ELSE ecn END AS ecn,
  CASE WHEN symbol_total = 1 THEN 'All symbols' ELSE symbol END AS symbol,
  trades,
  volume
FROM totals
ORDER BY ecn_total, ecn, symbol_total, symbol;
```

How it works:

- `ROLLUP(ecn, symbol)` produces three levels: `(ecn, symbol)`, `(ecn)`, and
  `()`. With 4 ECNs and 2 symbols, that is 8 detail rows, 4 subtotals, and 1
  grand total.
- `GROUPING(column)` tells a rolled-up `NULL` apart from a `NULL` in the data,
  so the labels are only applied to total rows.
- Sorting by `ecn_total` first puts the grand total last. Sorting by
  `symbol_total` before `symbol` puts each ECN's subtotal after its pairs.

## Totals in both directions with CUBE

`ROLLUP` follows the column order: it totals symbols within each ECN, but not
ECNs within each symbol. When you also want the volume of each pair across all
ECNs, use `CUBE`, which computes every combination:

```questdb-sql demo title="Volume totals per ECN and per symbol"
SELECT
  ecn,
  symbol,
  GROUPING_ID(ecn, symbol) AS level,
  SUM(quantity) AS volume
FROM fx_trades
WHERE timestamp IN '$today'
  AND symbol IN ('EURUSD', 'GBPUSD')
GROUP BY CUBE(ecn, symbol)
ORDER BY level, ecn, symbol;
```

`GROUPING_ID(ecn, symbol)` numbers the four levels in one column:

| level | Rows |
|-------|------|
| 0 | Detail: one row per ECN and symbol |
| 1 | Subtotal per ECN, `symbol` rolled up |
| 2 | Subtotal per symbol, `ecn` rolled up |
| 3 | Grand total |

To get only some levels, list them with `GROUPING SETS`. For example,
`GROUP BY GROUPING SETS ((ecn, symbol), ())` returns the detail rows and the
grand total, without subtotals.

## Subtotals over time with SAMPLE BY

Grouping sets also work with `SAMPLE BY`. Every time bucket gets its own
levels, so this query returns the hourly volume of each pair plus an hourly
total for all of them, ready to chart as one extra series:

```questdb-sql demo title="Hourly volume per symbol with an hourly total"
WITH hourly AS (
  SELECT
    timestamp,
    symbol,
    GROUPING(symbol) AS symbol_total,
    SUM(quantity) AS volume
  FROM fx_trades
  WHERE timestamp IN '$today'
    AND symbol IN ('EURUSD', 'GBPUSD', 'USDJPY')
  SAMPLE BY 1h ROLLUP(symbol)
)
SELECT
  timestamp,
  CASE WHEN symbol_total = 1 THEN 'All symbols' ELSE symbol END AS symbol,
  volume
FROM hourly
ORDER BY timestamp, symbol_total, symbol;
```

The timestamp is never rolled up: it stays the time bucket key at every level.

:::info Related documentation
- [GROUPING SETS, ROLLUP, and CUBE](/docs/query/sql/grouping-sets/)
- [GROUPING() and GROUPING_ID()](/docs/query/sql/grouping-sets/#grouping-and-grouping_id-functions)
- [SAMPLE BY with grouping sets](/docs/query/sql/grouping-sets/#sample-by-integration)
- [CASE expressions](/docs/query/sql/case/)
:::
