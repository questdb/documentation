---
title: Fill missing intervals with value from another column
sidebar_label: Fill from one column
description: Use window functions to propagate values from one column to fill multiple columns in SAMPLE BY queries
---

Fill missing intervals using the previous value from a specific column to populate multiple columns.

## Problem

You have a query like this:

```questdb-sql demo title="SAMPLE BY with FILL(PREV)"
SELECT timestamp, symbol, avg(bid_price) as bid_price, avg(ask_price) as ask_price
FROM core_price
WHERE symbol = 'EURUSD' AND timestamp IN '$today'
SAMPLE BY 100T FILL(PREV, PREV);
```

But when there is an interpolation, instead of getting the PREV value for `bid_price` and previous for `ask_price`, you want both prices to show the PREV known value for the `ask_price`.

## Solution

QuestDB supports referencing another aggregate column by alias inside `PREV()`:

```questdb-sql demo title="Fill bid_price with previous value of ask_price"
SELECT timestamp, symbol, avg(bid_price) as bid_price, avg(ask_price) as ask_price
FROM core_price
WHERE symbol = 'EURUSD' AND timestamp IN '$today'
SAMPLE BY 100T FILL(PREV(ask_price), PREV);
```

The reference must match the target column's type, cannot be broadcast across
aggregates, and is rejected when either side is a `SYMBOL`. For more flexible
cases — for example, marking which rows were filled, or chaining custom
expressions — the equivalent rewrite below uses window functions:

```questdb-sql demo title="Fill bid and ask prices with value from ask price"
WITH sampled AS (
  SELECT timestamp, symbol, avg(bid_price) as bid_price, avg(ask_price) as ask_price
  FROM core_price
  WHERE symbol = 'EURUSD' AND timestamp IN '$today'
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
  WHERE symbol = 'EURUSD' AND timestamp IN '$today'
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
- [FILL keyword](/docs/query/sql/sample-by/#fill-options)
- [Window functions](/docs/query/functions/window-functions/syntax/)
- [last_value()](/docs/query/functions/window-functions/reference/#last_value)
:::
