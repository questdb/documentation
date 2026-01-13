---
title: Access Rows Before and After Current Row
sidebar_label: Rows before/after
description: Use LAG and LEAD window functions to access values from surrounding rows
---

Access values from rows before and after the current row to find patterns, detect changes, or provide context around events.

## Problem

You want to see values from surrounding rows alongside the current row - for example, the 5 previous and 5 next bid prices for each row.

## Solution

Use `LAG()` to access rows before the current row and `LEAD()` to access rows after:

```questdb-sql demo title="Access surrounding row values with LAG and LEAD"
SELECT timestamp, bid_price,
  LAG(bid_price, 1) OVER () AS prev_1,
  LAG(bid_price, 2) OVER () AS prev_2,
  LAG(bid_price, 3) OVER () AS prev_3,
  LAG(bid_price, 4) OVER () AS prev_4,
  LAG(bid_price, 5) OVER () AS prev_5,
  LEAD(bid_price, 1) OVER () AS next_1,
  LEAD(bid_price, 2) OVER () AS next_2,
  LEAD(bid_price, 3) OVER () AS next_3,
  LEAD(bid_price, 4) OVER () AS next_4,
  LEAD(bid_price, 5) OVER () AS next_5
FROM core_price
WHERE timestamp >= dateadd('m', -1, now()) AND symbol = 'EURUSD';
```

## How It Works

- **`LAG(column, N)`** - Gets the value from N rows **before** the current row (earlier in time)
- **`LEAD(column, N)`** - Gets the value from N rows **after** the current row (later in time)

Both functions return `NULL` for rows where the offset goes beyond the dataset boundaries (e.g., `LAG(5)` returns `NULL` for the first 5 rows).

:::info Related Documentation
- [LAG window function](/docs/query/functions/window/#lag)
- [LEAD window function](/docs/query/functions/window/#lead)
- [Window functions overview](/docs/query/sql/over/)
:::
