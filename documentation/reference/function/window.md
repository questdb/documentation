---
title: Window Functions
sidebar_label: Window
description: Window SQL functions reference documentation and explanation.
---

Window functions perform calculations across sets of table rows that are related to the current row. Unlike aggregate functions that return a single result for a group of rows, window functions return a value for every row while considering a window of rows defined by the OVER clause.

For details about window functions syntax and components, please visit the [OVER Keyword reference](/docs/reference/sql/over/)


## avg()

In the context of window functions, `avg(value)` calculates the average of
`value` over the set of rows defined by the window frame.

**Arguments:**

- `value`: The column of numeric values to calculate the average of.

**Return value:**

- The average of `value` for the rows in the window frame.

**Description**

When used as a window function, `avg()` operates on a "window" of rows defined
by the `OVER` clause. The rows in this window are determined by the
`PARTITION BY`, `ORDER BY`, and frame specification components of the `OVER`
clause.

The `avg()` function respects the frame clause, meaning it only includes rows
within the specified frame in the calculation. The result is a separate average
for each row, based on the corresponding window of rows.

Note that the order of rows in the result set is not guaranteed to be the same
with each execution of the query. To ensure a consistent order, use an
`ORDER BY` clause outside of the `OVER` clause.

**Syntax:**
```questdb-sql title="avg() syntax"
avg(value) OVER (window_definition)
```

**Example:**
```questdb-sql title="avg() example" demo
SELECT
    symbol,
    price,
    timestamp,
    avg(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS moving_avg
FROM trades;
```

## count()

Counts rows or non-null values over the window frame.

**Syntax:**
```questdb-sql title="count() syntax"
count(*) OVER (window_definition)
count(value) OVER (window_definition)
```

**Arguments:**
- `*`: Counts all rows
- `value`: Counts non-null values

**Example:**
```questdb-sql title="count() example" demo
SELECT
    symbol,
    count(*) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        RANGE BETWEEN '1' SECOND PRECEDING AND CURRENT ROW
    ) AS trades_last_second
FROM trades;
```

## dense_rank()

In the context of window functions, `dense_rank()` assigns a unique rank to each row
within the window frame. Rows with equal values may have the same rank,
but there are no gaps in the rank numbers - it increases sequentially.

**Arguments:**

- `dense_rank()` does not require arguments.

**Return value:**

- The increasing consecutive rank numbers of each row within the window frame. Return value type is `long`.

**Description**

When used as a window function, `dense_rank()` operates on a "window" of rows defined
by the `OVER` clause. The rows in this window are determined by the
`PARTITION BY` and `ORDER BY` components of the `OVER` clause.

The `dense_rank()` function assigns a unique rank to each row within its window, with the same rank for the same values in the `ORDER BY` clause of
the `OVER` clause. However, there are no gaps in the counter, unlike with `rank()` - it is guaranteed to be sequential.
It ignores the frame clause, meaning it considers all rows in each partition, regardless of the frame specification.

Note that the order of rows in the result set is not guaranteed to be the same
with each execution of the query. To ensure a consistent order, use an
`ORDER BY` clause outside of the `OVER` clause.

**Syntax:**
```questdb-sql title="dense_rank() syntax"
dense_rank() OVER (window_definition)
```

**Example:**
```questdb-sql title="dense_rank() example" demo
SELECT
    symbol,
    price,
    timestamp,
    dense_rank() OVER (
        PARTITION BY symbol
        ORDER BY price DESC
    ) AS price_rank
FROM trades;
```

## first_value()

In the context of window functions, `first_value(value)` calculates the first
`value` in the set of rows defined by the window frame.

**Arguments:**

- `value`: Any numeric value.

**Return value:**

- The first occurrence of `value` (including null) for the rows in the window
  frame.

**Description**

`first_value()` operates on a "window" of rows defined by the `OVER` clause. The
rows in this window are determined by the `PARTITION BY`, `ORDER BY`, and frame
specification components of the `OVER` clause.

The `first_value()` function respects the frame clause, meaning it only includes
rows within the specified frame in the calculation. The result is a separate
value for each row, based on the corresponding window of rows.

Note that the order of rows in the result set is not guaranteed to be the same
with each execution of the query. To ensure a consistent order, use an
`ORDER BY` clause outside of the `OVER` clause.

**Syntax:**
```questdb-sql title="first_value() syntax"
first_value(value) OVER (window_definition)
```

**Example:**
```questdb-sql title="first_value() example" demo
SELECT
    symbol,
    price,
    timestamp,
    first_value(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS first_price
FROM trades;
```

## max()

In the context of window functions, `max(value)` calculates the maximum value within the set of rows defined by the window frame.

**Arguments:**

- `value`: Any numeric value.

**Return value:**

- The maximum value (excluding null) for the rows in the window frame.

**Description**

When used as a window function, `max()` operates on a "window" of rows defined by the `OVER` clause. The rows in this window are determined by the `PARTITION BY`, `ORDER BY`, and frame specification components of the `OVER` clause.

The `max()` function respects the frame clause, meaning it only includes rows within the specified frame in the calculation. The result is a separate value for each row, based on the corresponding window of rows.

Note that the order of rows in the result set is not guaranteed to be the same with each execution of the query. To ensure a consistent order, use an `ORDER BY` clause outside of the `OVER` clause.

**Syntax:**
```questdb-sql title="max() syntax"
max(value) OVER (window_definition)
```

**Example:**
```questdb-sql title="max() example" demo
SELECT
    symbol,
    price,
    timestamp,
    max(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS highest_price
FROM trades;
```

## min()

In the context of window functions, `min(value)` calculates the minimum value within the set of rows defined by the window frame.

**Arguments:**

- `value`: Any numeric value.

**Return value:**

- The minimum value (excluding null) for the rows in the window frame.

**Description**

When used as a window function, `min()` operates on a "window" of rows defined by the `OVER` clause. The rows in this window are determined by the `PARTITION BY`, `ORDER BY`, and frame specification components of the `OVER` clause.

The `min()` function respects the frame clause, meaning it only includes rows within the specified frame in the calculation. The result is a separate value for each row, based on the corresponding window of rows.

Note that the order of rows in the result set is not guaranteed to be the same with each execution of the query. To ensure a consistent order, use an `ORDER BY` clause outside of the `OVER` clause.

**Syntax:**
```questdb-sql title="min() syntax"
min(value) OVER (window_definition)
```

**Example:**
```questdb-sql title="min() example" demo
SELECT
    symbol,
    price,
    timestamp,
    min(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS lowest_price
FROM trades;
```

## lag()

In the context of window functions, `lag()` accesses data from previous rows in the result set without using a self-join. For each row, `lag()` returns the value from a row at a specified offset before the current row within the partition.

The `lag()` function provides access to a row at a given physical offset that precedes the current row, returning NULL if the offset goes beyond the bounds of the window or partition (unless a default is specified).

- When `offset` is 0, returns the current row value
- `IGNORE NULLS` makes the function act as if NULL value rows don't exist
- `RESPECT NULLS` (default) includes NULL values in offset counting
- Does not support ROWS/RANGE frame clauses (silently ignored if present)
- When ORDER BY is not provided, uses table scan order

**Arguments:**

- `value`: The column or expression to get the value from
- `offset` (optional): The number of rows backward from the current row. Default is 1
- `default` (optional): The value to return when the offset goes beyond the partition bounds. Default is NULL
- `[IGNORE | RESPECT] NULLS` (optional): Determines whether NULL values should be ignored. Default is RESPECT NULLS

**Return value:**

- The value from the row at the specified offset before the current row

**Syntax:**
```questdb-sql title="lag() syntax"
lag(value [, offset [, default]]) [(IGNORE|RESPECT) NULLS]
OVER ([PARTITION BY partition_expression] [ORDER BY sort_expression])
```

**Example:**
```questdb-sql title="lag() example" demo
SELECT
    timestamp,
    price,
    lag(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS previous_price,
    lag(price, 2, 0.0) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS price_two_rows_back
FROM trades;
```

This example:
- Gets the previous price for each symbol (`previous_price`)
- Gets the price from 2 rows back (`price_two_rows_back`)
- Uses 0.0 as default when looking 2 rows back reaches the partition start

## last_value()

In the context of window functions, `last_value()` returns the last value in a window frame. The function supports both regular and NULL-aware processing through the `IGNORE NULLS` clause.

The `last_value()` function provides access to the last value within a window frame. The behavior depends on:
- Window frame definition (`ROWS`/`RANGE`)
- Presence of `ORDER BY` and `PARTITION BY` clauses
- `IGNORE/RESPECT NULLS` setting

In addition, note the following:

- When no `ORDER BY` is provided, uses table scan order
- Supports both `ROWS` and `RANGE` frame specifications
- When neither `ORDER BY` nor `ROWS`/`RANGE` is specified, the default frame becomes `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`
- When `ORDER BY` is provided but `ROWS`/`RANGE` is not, the default frame becomes `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`

**Arguments:**

- `value`: The column or expression to get the value from
- `[IGNORE | RESPECT] NULLS` (optional): Determines whether NULL values should be ignored. Default is `RESPECT NULLS`

**Return value:**

- The last non-NULL value in the window frame when using `IGNORE NULLS`
- The last value (including NULL) in the window frame when using `RESPECT NULLS`

**Syntax:**
```questdb-sql title="last_value() syntax"
last_value(value) [(IGNORE|RESPECT) NULLS]
OVER ([PARTITION BY partition_expression]
      [ORDER BY sort_expression]
      [frame_clause])
```

**Example:**
```questdb-sql title="last_value() example" demo
SELECT
    timestamp,
    price,
    last_value(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) AS last_price,
    last_value(price) IGNORE NULLS OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS last_non_null_price
FROM trades;
```

This example:
- Gets the last price within a 3-row window for each symbol (`last_price`)
- Gets the last non-NULL price for each symbol (`last_non_null_price`)
- Demonstrates both `RESPECT NULLS` (default) and `IGNORE NULLS` behavior


## lead()

In the context of window functions, `lead()` accesses data from subsequent rows in the result set without using a self-join. For each row, `lead()` returns the value from a row at a specified offset following the current row within the partition.

The `lead()` function provides access to a row at a given physical offset that follows the current row, returning NULL if the offset goes beyond the bounds of the window or partition (unless a default is specified).

- When `offset` is 0, returns the current row value
- `IGNORE NULLS` makes the function act as if `NULL` value rows don't exist
- `RESPECT NULLS` (default) includes `NULL` values in offset counting
- Does not support `ROWS/RANGE` frame clauses (silently ignored if present)
- When `ORDER BY` is not provided, uses table scan order

**Arguments:**

- `value`: The column or expression to get the value from
- `offset` (optional): The number of rows forward from the current row. Default is 1
- `default` (optional): The value to return when the offset goes beyond the partition bounds. Default is `NULL`
- `[IGNORE | RESPECT] NULLS` (optional): Determines whether `NULL` values should be ignored. Default is `RESPECT NULLS`

**Return value:**

- The value from the row at the specified offset after the current row

**Syntax:**
```questdb-sql title="lead() syntax"
lead(value [, offset [, default]]) [(IGNORE|RESPECT) NULLS]
OVER ([PARTITION BY partition_expression] [ORDER BY sort_expression])
```

**Example:**
```questdb-sql title="lead() example" demo
SELECT
    timestamp,
    price,
    lead(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS next_price,
    lead(price, 2, 0.0) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS price_after_next
FROM trades;
```

This example:
- Gets the next price for each symbol (`next_price`)
- Gets the price from 2 rows ahead (`price_after_next`)
- Uses 0.0 as default when looking 2 rows ahead reaches the partition end


## rank()

In the context of window functions, `rank()` assigns a unique rank to each row
within the window frame, with the same rank assigned to rows with the same
values. Rows with equal values receive the same rank, and a gap appears in the
sequence for the next distinct value; that is, the `row_number` of the first row
in its peer group.

**Arguments:**

- `rank()` does not require arguments.

**Return value:**

- The rank of each row within the window frame. Return value type is `long`.

**Description**

When used as a window function, `rank()` operates on a "window" of rows defined
by the `OVER` clause. The rows in this window are determined by the
`PARTITION BY` and `ORDER BY` components of the `OVER` clause.

The `rank()` function assigns a unique rank to each row within its window, with
the same rank assigned to rows with the same values in the `ORDER BY` clause of
the `OVER` clause. It ignores the frame clause, meaning it considers all rows in
each partition, regardless of the frame specification.

Note that the order of rows in the result set is not guaranteed to be the same
with each execution of the query. To ensure a consistent order, use an
`ORDER BY` clause outside of the `OVER` clause.

**Syntax:**
```questdb-sql title="rank() syntax"
rank() OVER (window_definition)
```

**Example:**
```questdb-sql title="rank() example" demo
SELECT
    symbol,
    price,
    timestamp,
    rank() OVER (
        PARTITION BY symbol
        ORDER BY price DESC
    ) AS price_rank
FROM trades;
```

## row_number()

In the context of window functions, `row_number()` assigns a unique row number
to each row within the window frame. For each partition, the row number starts
with one and increments by one.

**Arguments:**

- `row_number()` does not require arguments.

**Return value:**

- The row number of each row within the window frame. Return value type is
  `long`.

**Description**

When used as a window function, `row_number()` operates on a "window" of rows
defined by the `OVER` clause. The rows in this window are determined by the
`PARTITION BY` and `ORDER BY` components of the `OVER` clause.

The `row_number()` function assigns a unique row number to each row within its
window, starting at one for the first row in each partition and incrementing by
one for each subsequent row. It ignores the frame clause, meaning it considers
all rows in each partition, regardless of the frame specification.

Note that the order of rows in the result set is not guaranteed to be the same
with each execution of the query. To ensure a consistent order, use an
`ORDER BY` clause outside of the `OVER` clause.

**Syntax:**
```questdb-sql title="row_number() syntax"
row_number() OVER (window_definition)
```

**Example:**
```questdb-sql title="row_number() example" demo
SELECT
    symbol,
    price,
    timestamp,
    row_number() OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS trade_number
FROM trades;
```

## sum()

In the context of window functions, `sum(value)` calculates the cumulative sum of `value`
in the set of rows defined by the window frame. Also known as "cumulative sum".

**Arguments:**

- `value`: Any numeric value.

**Return value:**

- The sum of `value` for the rows in the window frame.

**Description**

When used as a window function, `sum()` operates on a "window" of rows defined
by the `OVER` clause. The rows in this window are determined by the
`PARTITION BY`, `ORDER BY`, and frame specification components of the `OVER`
clause.

The `sum()` function respects the frame clause, meaning it only includes rows
within the specified frame in the calculation. The result is a separate value
for each row, based on the corresponding window of rows.

Note that the order of rows in the result set is not guaranteed to be the same
with each execution of the query. To ensure a consistent order, use an
`ORDER BY` clause outside of the `OVER` clause.

**Syntax:**
```questdb-sql title="sum() syntax"
sum(value) OVER (window_definition)
```

**Example:**
```questdb-sql title="sum() example" demo
SELECT
    symbol,
    amount,
    timestamp,
    sum(amount) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_amount
FROM trades;
```

## Common window function examples

### Moving average of best bid price

```questdb-sql title="Calculate 4-row moving average of best bid price" demo
SELECT
    timestamp,
    symbol,
    bid_px_00 as best_bid,
    avg(bid_px_00) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS bid_moving_avg
FROM AAPL_orderbook
WHERE bid_px_00 > 0;
```

This example:
- Uses the best bid price (`bid_px_00`)
- Filters out zero/null bids
- Calculates average over 4 rows (current + 3 preceding)
- Groups by symbol (though in this case it's all AAPL)

### Cumulative bid size

```questdb-sql title="Calculate cumulative size for top 3 bid levels" demo
SELECT
    timestamp,
    bid_px_00,
    bid_sz_00,
    sum(bid_sz_00) OVER (
        ORDER BY timestamp
        RANGE BETWEEN '5' SECONDS PRECEDING AND CURRENT ROW
    ) as bid_volume_1min,
    bid_sz_00 + bid_sz_01 + bid_sz_02 as total_bid_size
FROM AAPL_orderbook
WHERE bid_px_00 > 0
LIMIT 10;
```

This example:
- Shows best bid price and size
- Calculates 1-minute rolling volume at best bid
- Sums size across top 3 price levels
- Filters out empty bids

### Order count analysis

```questdb-sql title="Compare order counts across price levels" demo
SELECT
    timestamp,
    bid_px_00,
    bid_ct_00 as best_bid_orders,
    sum(bid_ct_00) OVER (
        ORDER BY timestamp
        ROWS BETWEEN 5 PRECEDING AND CURRENT ROW
    ) as rolling_order_count,
    bid_ct_00 + bid_ct_01 + bid_ct_02 as total_bid_orders
FROM AAPL_orderbook
WHERE bid_px_00 > 0
LIMIT 10;
```

This example:
- Shows best bid price and order count
- Calculates rolling sum of orders at best bid
- Sums orders across top 3 price levels
- Uses ROWS frame for precise control

### Moving sum of bid volume

```questdb-sql title="Calculate 1-minute rolling bid volume" demo
SELECT
    timestamp,
    bid_px_00,
    bid_sz_00,
    sum(bid_sz_00) OVER (
        ORDER BY timestamp
        RANGE BETWEEN 60000000 PRECEDING AND CURRENT ROW
    ) as bid_volume_1min,
    bid_sz_00 + bid_sz_01 + bid_sz_02 as total_bid_size
FROM AAPL_orderbook
WHERE bid_px_00 > 0
LIMIT 10;
```

This example:
- Shows best bid price and size
- Calculates rolling 1-minute volume at best bid
- Also shows total size across top 3 levels
- Filters out empty bids

### Order frequency analysis

```questdb-sql title="Calculate order updates per minute" demo
SELECT
    timestamp,
    symbol,
    COUNT(*) OVER (
        ORDER BY timestamp
        RANGE BETWEEN 60000000 PRECEDING AND CURRENT ROW
    ) as updates_per_min,
    COUNT(CASE WHEN action = 'A' THEN 1 END) OVER (
        ORDER BY timestamp
        RANGE BETWEEN 60000000 PRECEDING AND CURRENT ROW
    ) as new_orders_per_min
FROM AAPL_orderbook
LIMIT 10;
```

This example:

- Counts all order book updates in last minute
- Specifically counts new orders (action = 'A')
- Uses rolling 1-minute window
- Shows order book activity patterns
