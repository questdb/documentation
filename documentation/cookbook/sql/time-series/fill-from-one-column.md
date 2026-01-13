---
title: Fill Missing Intervals with Value from Another Column
sidebar_label: Fill from one column
description: Use window functions to propagate values from one column to fill multiple columns in SAMPLE BY queries
---

Fill missing intervals using the previous value from a specific column to populate multiple columns.

## Problem

You have a query like this:

```questdb-sql demo title="SAMPLE BY with FILL(PREV)"
SELECT timestamp, symbol, avg(bid_price) as bid_price, avg(ask_price) as ask_price
FROM core_price
WHERE symbol = 'EURUSD' AND timestamp IN today()
SAMPLE BY 100T FILL(PREV, PREV);
```

But when there is an interpolation, instead of getting the PREV value for `bid_price` and previous for `ask_price`, you want both prices to show the PREV known value for the `ask_price`. Imagine this SQL was valid:

```sql
SELECT timestamp, symbol, avg(bid_price) as bid_price, avg(ask_price) as ask_price
FROM core_price
WHERE symbol = 'EURUSD' AND timestamp IN today()
SAMPLE BY 100T FILL(PREV(ask_price), PREV);
```

## Solution

The only way to do this is in multiple steps within a single query: first get the sampled data interpolating with null values, then use a window function to get the last non-null value for the reference column, and finally coalesce the missing columns with this filler value.

```questdb-sql demo title="Fill bid and ask prices with value from ask price"
WITH sampled AS (
  SELECT timestamp, symbol, avg(bid_price) as bid_price, avg(ask_price) as ask_price
  FROM core_price
  WHERE symbol = 'EURUSD' AND timestamp IN today()
  SAMPLE BY 100T FILL(null)
), with_previous_vals AS (
  SELECT *,
    last_value(ask_price) IGNORE NULLS OVER(PARTITION BY symbol ORDER BY timestamp) as filler
  FROM sampled
)
SELECT timestamp, symbol, coalesce(bid_price, filler) as bid_price,
       coalesce(ask_price, filler) as ask_price
FROM with_previous_vals;
```

Note the use of `IGNORE NULLS` modifier on the window function to make sure we always look back for a value, rather than just over the previous row.

You can mark which rows were filled by adding a column that flags interpolated values:

```questdb-sql demo title="Show which rows were filled"
WITH sampled AS (
  SELECT timestamp, symbol, avg(bid_price) as bid_price, avg(ask_price) as ask_price
  FROM core_price
  WHERE symbol = 'EURUSD' AND timestamp IN today()
  SAMPLE BY 100T FILL(null)
), with_previous_vals AS (
  SELECT *,
    last_value(ask_price) IGNORE NULLS OVER(PARTITION BY symbol ORDER BY timestamp) as filler
  FROM sampled
)
SELECT timestamp, symbol, coalesce(bid_price, filler) as bid_price,
       coalesce(ask_price, filler) as ask_price,
       case when bid_price is NULL then true END as filled
FROM with_previous_vals;
```

:::info Related Documentation
- [SAMPLE BY](/docs/query/sql/sample-by/)
- [FILL keyword](/docs/query/sql/sample-by/#fill-keywords)
- [Window functions](/docs/query/functions/window-functions/syntax/)
- [last_value()](/docs/query/functions/window-functions/reference/#last_value)
:::
