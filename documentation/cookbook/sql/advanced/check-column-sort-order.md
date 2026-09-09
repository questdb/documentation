---
title: Check whether a column is sorted by another column
sidebar_label: Check column sort order
description: Use lag() with an explicit ORDER BY to test whether one column ever decreases as another column increases.
---

Sorting one column by another answers questions like whether large trades always print at better prices, or whether a cumulative field ever moves backwards against its key. This recipe reports where that relationship breaks.

## Problem

You want to know whether `price` only rises as `amount` grows, without assuming anything about the order the rows are stored in.

## Solution

Order the window by the column you are sorting against, compare each row's value with the previous one, and count the rows that go backwards:

```questdb-sql demo title="Count rows where price falls as amount grows"
SELECT count() AS out_of_order_rows
FROM (
  SELECT price AS current_price,
         lag(price) OVER (ORDER BY amount) AS previous_price
  FROM trades
  WHERE symbol = 'BTC-USDT' AND timestamp IN '$today'
)
WHERE current_price < previous_price;
```

`ORDER BY amount` inside `OVER ()` is what makes this different from checking a column against the designated timestamp. Without it, `lag()` follows the table's scan order and answers a different question entirely, which is covered in [Check timestamp order](/docs/cookbook/sql/time-series/check-timestamp-order/).

A result of `0` means `price` never decreases as `amount` increases. Any other number is the count of positions where it does.

## Find the first row that breaks the order

To locate the break rather than count breaks, number the rows and return the first violation:

```questdb-sql demo title="Find the first row where price falls as amount grows"
WITH column_and_prev AS (
  SELECT row_number() OVER (ORDER BY amount) AS rownum,
         amount,
         price AS current_price,
         lag(price) OVER (ORDER BY amount) AS previous_price
  FROM trades
  WHERE symbol = 'BTC-USDT' AND timestamp IN '$today'
)
SELECT rownum, amount, current_price, previous_price
FROM column_and_prev
WHERE current_price < previous_price
ORDER BY rownum
LIMIT 1;
```

`row_number()` must use the same `ORDER BY` as `lag()`. If it is left as `row_number() OVER ()` it numbers rows in scan order while `lag()` walks them in `amount` order, so the reported position belongs to a different sequence than the comparison.

:::warning ORDER BY is required before LIMIT
The rows leave the `WHERE` clause in scan order, not in `amount` order, so `LIMIT 1` on its own returns an arbitrary violation rather than the earliest one. `ORDER BY rownum` before `LIMIT 1` is what makes it the first.
:::

Filtering by a single symbol keeps the comparison meaningful. Across interleaved symbols the query reports breaks that are only an artefact of mixing instruments.

:::info Related documentation
- [Check timestamp order](/docs/cookbook/sql/time-series/check-timestamp-order/)
- [Window functions reference](/docs/query/functions/window-functions/reference/)
- [Window functions syntax](/docs/query/functions/window-functions/syntax/)
- [ORDER BY keyword](/docs/query/sql/order-by/)
:::
