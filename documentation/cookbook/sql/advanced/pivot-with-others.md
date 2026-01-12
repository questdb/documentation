---
title: Pivot with "Others" Column
sidebar_label: Pivot with Others
description: Pivot specific values into columns while aggregating remaining values into an "Others" column using CASE statements
---

QuestDB has a native [PIVOT](/docs/query/sql/pivot/) keyword for transforming rows into columns. However, when you need to pivot specific values while grouping all remaining values into an "Others" column, you need to use `CASE` statements instead.

## Problem

You want to pivot data so that specific symbols (like EURUSD, GBPUSD, USDJPY) become columns, but also capture all other symbols in a single "Others" column:

```questdb-sql demo title="Aggregated data per symbol"
SELECT timestamp, symbol, SUM(bid_volume) AS total_bid
FROM core_price
WHERE timestamp IN today()
SAMPLE BY 1m
LIMIT 20;
```

**Results:**

| timestamp                   | symbol | total_bid |
| --------------------------- | ------ | --------- |
| 2026-01-11T00:00:00.000000Z | EURGBP | 124820733 |
| 2026-01-11T00:00:00.000000Z | AUDUSD | 124778371 |
| 2026-01-11T00:00:00.000000Z | GBPAUD | 124645353 |
| 2026-01-11T00:00:00.000000Z | GBPNZD | 129175334 |
| 2026-01-11T00:00:00.000000Z | NZDUSD | 127053437 |
| 2026-01-11T00:00:00.000000Z | USDSGD | 130915407 |
| 2026-01-11T00:00:00.000000Z | USDJPY | 123039292 |
| 2026-01-11T00:00:00.000000Z | AUDCAD | 121234190 |
| 2026-01-11T00:00:00.000000Z | USDMXN | 122254886 |
| 2026-01-11T00:00:00.000000Z | USDSEK | 129272298 |
| 2026-01-11T00:00:00.000000Z | USDNOK | 124493591 |
| 2026-01-11T00:00:00.000000Z | EURJPY | 126254805 |
| 2026-01-11T00:00:00.000000Z | CADJPY | 133359111 |
| 2026-01-11T00:00:00.000000Z | EURCHF | 125818826 |
| 2026-01-11T00:00:00.000000Z | GBPJPY | 130940614 |
| 2026-01-11T00:00:00.000000Z | USDCAD | 126619566 |
| 2026-01-11T00:00:00.000000Z | USDTRY | 124860359 |
| 2026-01-11T00:00:00.000000Z | AUDJPY | 135946504 |
| 2026-01-11T00:00:00.000000Z | NZDJPY | 126419110 |
| 2026-01-11T00:00:00.000000Z | EURAUD | 122966167 |

## Solution

Use `CASE` statements with `NOT IN` for the "Others" column:

```questdb-sql demo title="Pivot with Others column"
SELECT timestamp,
  SUM(CASE WHEN symbol = 'EURUSD' THEN bid_volume END) AS EURUSD,
  SUM(CASE WHEN symbol = 'GBPUSD' THEN bid_volume END) AS GBPUSD,
  SUM(CASE WHEN symbol = 'USDJPY' THEN bid_volume END) AS USDJPY,
  SUM(CASE WHEN symbol NOT IN ('EURUSD', 'GBPUSD', 'USDJPY')
    THEN bid_volume END) AS OTHERS
FROM core_price
WHERE timestamp IN today()
SAMPLE BY 1m
LIMIT 5;
```

**Results:**

| timestamp                   | EURUSD    | GBPUSD    | USDJPY    | OTHERS     |
| --------------------------- | --------- | --------- | --------- | ---------- |
| 2026-01-11T00:00:00.000000Z | 123717175 | 123252388 | 123039292 | 2755547557 |
| 2026-01-11T00:01:00.000000Z | 130947736 | 136509565 | 127006858 | 2877498962 |
| 2026-01-11T00:02:00.000000Z | 130004490 | 125804660 | 122451477 | 2824893498 |
| 2026-01-11T00:03:00.000000Z | 124303244 | 126589046 | 124435638 | 2797775211 |
| 2026-01-11T00:04:00.000000Z | 120743669 | 127991352 | 122970185 | 2733242883 |

Each timestamp now has a single row with specific symbols as columns, plus an "Others" column aggregating all remaining symbols.

## When to Use This Pattern

Use `CASE` statements instead of `PIVOT` when you need:
- An "Others" or "Else" column to catch unspecified values
- Custom aggregation logic per column
- Different aggregation functions for different columns

For straightforward pivoting without an "Others" column, use the native [PIVOT](/docs/query/sql/pivot/) keyword.

:::info Related Documentation
- [PIVOT](/docs/query/sql/pivot/)
- [CASE expressions](/docs/query/sql/case/)
- [SAMPLE BY aggregation](/docs/query/sql/sample-by/)
:::
