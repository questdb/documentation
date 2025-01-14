---
title: Window Functions
sidebar_label: Window
description: Window SQL functions reference documentation and explanation.
---

Window functions perform calculations across sets of table rows that are related to the current row. Unlike aggregate functions that return a single result for a group of rows, window functions return a value for every row while considering a window of rows defined by the OVER clause.

We'll cover high-level, introductory information about window functions, and then move on to composition. 

We also have some [common examples](#common-window-function-examples) to get you started.

:::tip
Click _Demo this query_ within our query examples to see them in our live demo.
:::

## Deep Dive: What is a Window Function?

A window function performs a calculation across a set of rows that are related
to the current row. This set of related rows is called a "window", defined by an
`OVER` clause that follows the window function.

In practical terms, window functions are used when you need to perform a
calculation that depends on a group of rows, but you want to retain the
individual rows in the result set. This is different from aggregate functions
like a cumulative `sum` or `avg`, which perform calculations on a group of rows
and return a single result.

The underlying mechanism of a window function involves three components:

- **Partitioning:** The `PARTITION BY` clause divides the result set into
  partitions (groups of rows) upon which the window function is applied. If no
  partition is defined, the function treats all rows of the query result set as
  a single partition.

- **Ordering:** The `ORDER BY` clause within the `OVER` clause determines the
  order of the rows in each partition.

- **Frame Specification:** This defines the set of rows included in the window,
  relative to the current row. For example,
  `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` includes all rows from the
  start of the partition to the current row.

Use cases for window functions are vast.

They are often used in analytics for tasks such as:

- Calculating running totals or averages
- Finding the maximum or minimum value in a sequence or partition
- Ranking items within a specific category or partition
- Calculating [moving averages](#avg) or
  [cumulative sums](#cumulative-sum)

Window functions are tough to grok.

An analogy before we get to building:

Imagine a group of cars in a race. Each car has a number, a name, and a finish
time. If you wanted to know the average finish time, you could use an aggregate
function like [`avg()`](#avg) to calculate it. But this would only give you a single
result: the average time. You wouldn't know anything about individual cars'
times.

For example, a window function allows you to calculate the average finish time
for all the cars (the window), but display it on each car (row), so you can
compare this average to each car's average speed to see if they were faster or
slower than the global average.

So, in essence, window functions allow you to perform calculations that consider
more than just the individual row or the entire table, but a 'window' of related
rows. This 'window' could be all rows with the same value in a certain column,
like all cars of the same engine size, or it could be a range of rows based on
some order, like the three cars who finished before and after a certain car.

This makes window functions incredibly powerful for complex calculations and
analyses.

## Syntax

```txt
functionName OVER (
    [PARTITION BY columnName [, ...]]
    [ORDER BY columnName [ASC | DESC] [, ...]]
    [ROWS | RANGE BETWEEN frame_start AND frame_end]
    [EXCLUDE CURRENT ROW | EXCLUDE NO OTHERS]
)
```
Where:

- `functionName`: The window function to apply (e.g., avg, sum, rank)
- `OVER`: Specifies the window over which the function operates
  - `PARTITION BY`: Divides the result set into partitions
  - `ORDER BY`: Specifies the order of rows within each partition
  - `ROWS | RANGE BETWEEN`: Defines the window frame relative to the current row
  - `EXCLUDE`: Optionally excludes certain rows from the frame

## Supported functions

- [`avg()`](#avg) – Calculates the average within a window

- [`sum()`](#cumulative-sum) – Calculates the sum within a window

- [`count()`](#count) – Counts rows or non-null values

- [`first_value()`](#first_value) – Retrieves the first value in a window

- [`max()`](#max) – Returns the maximum value within a window

- [`min()`](#min) – Returns the minimum value within a window

- [`rank()`](#rank) – Assigns a rank to rows

- [`row_number()`](#row_number) – Assigns sequential numbers to rows

## Components of a window function

A window function calculates results across a set of rows related to the current row, called a window. This allows for complex calculations like moving averages, running totals, and rankings without collapsing rows.

1. **Function Name**: Specifies the calculation to perform (e.g., `avg(price)`)
2. **OVER Clause**: Defines the window for the function
   - `PARTITION BY`: Divides the result set into partitions
   - `ORDER BY`: Orders rows within partitions
   - Frame Specification: Defines the subset of rows using ROWS or RANGE
3. **Exclusion Option**: Excludes specific rows from the frame

### Example

```questdb-sql title="Moving average example" demo
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

This calculates a moving average of price over the current and three preceding rows for each symbol.

## Frame types and behavior

Window frames specify which rows are included in the calculation relative to the current row.

```mermaid
sequenceDiagram
    participant R1 as Row at 09:00
    participant R2 as Row at 09:02
    participant R3 as Row at 09:03
    participant R4 as Row at 09:04<br/>(Current Row)

    Note over R4: Calculating at 09:04

    rect rgb(191, 223, 255)
    Note over R2,R4: ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    end

    rect rgb(255, 223, 191)
    Note over R3,R4: RANGE BETWEEN<br/>'1' MINUTE PRECEDING<br/>AND CURRENT ROW
    end
```

### ROWS frame

Defines the frame based on a physical number of rows:

```txt
ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
```

This includes the current row and two preceding rows.

```mermaid
sequenceDiagram
    participant R1 as Row 1
    participant R2 as Row 2
    participant R3 as Row 3
    participant R4 as Row 4
    participant R5 as Row 5

    Note over R1: Frame includes Row1
    Note over R2: Frame includes Row1, Row2
    Note over R3: Frame includes Row1, Row2, Row3
    Note over R4: Frame includes Row2, Row3, Row4
    Note over R5: Frame includes Row3, Row4, Row5
```

### RANGE frame

:::note
RANGE functions have a known issue. When using RANGE, all the rows with the same value will have the same output for the function. Read the [open issue](https://github.com/questdb/questdb/issues/5177) for more information.
:::

Defines the frame based on the actual values in the ORDER BY column, rather than counting rows. Unlike ROWS, which counts a specific number of rows, RANGE considers the values in the ORDER BY column to determine the window.

Important requirements for RANGE:
- Data must be ordered by the designated timestamp column
- The window is calculated based on the values in that ORDER BY column

For example, with a current row at 09:04 and `RANGE BETWEEN '1' MINUTE PRECEDING AND CURRENT ROW`:
- Only includes rows with timestamps between 09:03 and 09:04 (inclusive)
- Earlier rows (e.g., 09:00, 09:02) are excluded as they fall outside the 1-minute range

```mermaid
sequenceDiagram
    participant R1 as Row at 09:00
    participant R2 as Row at 09:02
    participant R3 as Row at 09:03
    participant R4 as Row at 09:04<br/>(Current Row)

    Note over R4: Calculating at 09:04

    %% Only include rows within 1 minute of current row (09:03-09:04)
    rect rgba(255, 223, 191)
    Note over R3,R4: RANGE BETWEEN<br/>'1' MINUTE PRECEDING<br/>AND CURRENT ROW
    end

    %% Show excluded rows in grey or with a visual indicator
    Note over R1,R2: Outside 1-minute range
```

The following time units can be used in RANGE window functions:

- day
- hour
- minute
- second
- millisecond
- microsecond

Plural forms of these time units are also accepted (e.g., 'minutes', 'hours').

```questdb-sql title="Multiple time intervals example" demo
SELECT
    timestamp,
    bid_px_00,
    -- 5-minute average: includes rows from (current_timestamp - 5 minutes) to current_timestamp
    AVG(bid_px_00) OVER (
        ORDER BY timestamp
        RANGE BETWEEN '5' MINUTE PRECEDING AND CURRENT ROW
    ) AS avg_5min,
    -- 100ms count: includes rows from (current_timestamp - 100ms) to current_timestamp
    COUNT(*) OVER (
        ORDER BY timestamp
        RANGE BETWEEN '100' MILLISECOND PRECEDING AND CURRENT ROW
    ) AS updates_100ms,
    -- 2-second sum: includes rows from (current_timestamp - 2 seconds) to current_timestamp
    SUM(bid_sz_00) OVER (
        ORDER BY timestamp
        RANGE BETWEEN '2' SECOND PRECEDING AND CURRENT ROW
    ) AS volume_2sec
FROM AAPL_orderbook
WHERE bid_px_00 > 0
LIMIT 10;
```

This query demonstrates different time intervals in action, calculating:
- 5-minute moving average of best bid price
- Update frequency in 100ms windows
- 2-second rolling volume

Note that each window calculation is based on the timestamp values, not the number of rows. This means the number of rows included can vary depending on how many records exist within each time interval.

## Frame boundaries

Frame boundaries determine which rows are included in the window calculation:

- `UNBOUNDED PRECEDING`: Starts at the first row of the partition
- `<value> PRECEDING`: Starts or ends at a specified number of rows or interval before the current row
- `CURRENT ROW`: Starts or ends at the current row

When the frame clause is not specified, the default frame is
`RANGE UNBOUNDED PRECEDING`, which includes all rows from the start of the
partition to the current row.

- If `ORDER BY` is not present, the frame includes the entire partition, as all
  rows are considered equal.

- If `ORDER BY` is present, the frame includes all rows from the start of the
  partition to the current row. Note that `UNBOUNDED FOLLOWING` is only allowed
  when the frame start is `UNBOUNDED PRECEDING`, which means the frame includes
  the entire partition.

### Restrictions

1. Frame start can only be:
   - `UNBOUNDED PRECEDING`
   - `<value> PRECEDING`
   - `CURRENT ROW`

2. Frame end can only be:
   - `CURRENT ROW`
   - `<value> PRECEDING` (unless start is `UNBOUNDED PRECEDING`)

3. RANGE frames must be ordered by a designated timestamp

## Exclusion options

Modifies the window frame by excluding certain rows:

### EXCLUDE NO OTHERS

- Default behavior
- Includes all rows in the frame

```mermaid
sequenceDiagram
    participant R1 as Row 1
    participant R2 as Row 2
    participant CR as Current Row
    participant R4 as Row 4

    rect rgba(255, 223, 191)
    Note over R1,CR: Frame includes all rows from the frame start up to and including the current row
    end
```

### EXCLUDE CURRENT ROW

- Excludes the current row from the frame
- When frame ends at `CURRENT ROW`, end boundary automatically adjusts to `1 PRECEDING`
- This automatic adjustment ensures that the current row is effectively excluded from the calculation, as there cannot be a frame that ends after the current row when the current row is excluded.

```mermaid
sequenceDiagram
    participant R1 as Row 1
    participant R2 as Row 2
    participant CR as Current Row
    participant R4 as Row 4

    rect rgba(255, 223, 191)
    Note over R1,R2: Frame includes all rows <br/> from the frame startup to one row <br/> before the current row<br/>(excluding the current row)
    end
    rect rgba(255, 0, 0, 0.1)
    Note over CR: Current Row is excluded
    end
```

#### Example query

To tie it together, consider the following example:

```questdb-sql title="EXCLUSION example" demo
SELECT
    timestamp,
    price,
    SUM(price) OVER (
        ORDER BY timestamp
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        EXCLUDE CURRENT ROW
    ) AS cumulative_sum_excluding_current
FROM trades;
```

The query calculates a cumulative sum of the price column for each row in the trades table, excluding the current row from the calculation. By using `EXCLUDE CURRENT ROW`, the window frame adjusts to include all rows from the start up to one row before the current row. This demonstrates how the `EXCLUDE CURRENT ROW` option modifies the window frame to exclude the current row, affecting the result of the window function.

## Function reference

### avg()

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

### Cumulative sum()

In the context of window functions, `sum(value)` calculates the sum of `value`
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

### count()

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

### first_value()

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

### first_not_null_value()

In the context of window functions, `first_not_null_value(value)` returns the first non-null value in the set of rows defined by the window frame.

**Arguments:**

- `value`: Any numeric value.

**Return value:**

- The first non-null occurrence of `value` for the rows in the window frame. Returns `NaN` if no non-null values are found.

**Description**

When used as a window function, `first_not_null_value()` operates on a "window" of rows defined by the `OVER` clause. The rows in this window are determined by the `PARTITION BY`, `ORDER BY`, and frame specification components of the `OVER` clause.

The `first_not_null_value()` function respects the frame clause, meaning it only includes rows within the specified frame in the calculation. The result is a separate value for each row, based on the corresponding window of rows.

Unlike `first_value()`, this function skips null values and returns the first non-null value it encounters in the window frame. This is particularly useful when dealing with sparse data or when you want to ignore null values in your analysis.

Note that the order of rows in the result set is not guaranteed to be the same with each execution of the query. To ensure a consistent order, use an `ORDER BY` clause outside of the `OVER` clause.

**Syntax:**

```questdb-sql title="first_not_null_value() syntax" 
first_not_null_value(value) OVER (window_definition)
```

**Example:**

```questdb-sql title="first_not_null_value() example" demo
SELECT
    symbol,
    price,
    timestamp,
    first_not_null_value(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS first_valid_price
FROM trades;
```

### max()

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

### min()

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

### rank()

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

### row_number()

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

### LAG function

A LAG function allows you to access data from a previous row in the same result
set without requiring a self-join. This is especially useful for comparing
values in sequential rows or performing calculations like differences,
trends, or changes over time.

```questdb-sql title="LAG example" demo
SELECT
    symbol,
    price,
    timestamp,
    first_value(price) OVER (
        PARTITION BY symbol        
        ORDER BY timestamp
        ROWS 1 PRECEDING EXCLUDE CURRENT ROW
    ) AS price_from_1_row_before,
    first_value(price) OVER (
        PARTITION BY symbol        
        ORDER BY timestamp
        ROWS 2 PRECEDING EXCLUDE CURRENT ROW
    ) AS price_from_2_rows_before
FROM trades;
```

Key Points:

- `LAG(price, 1)` fetches the price from the immediately preceding row for the same symbol.
- `PARTITION BY symbol` ensures the function operates independently for each stock.
- `ORDER BY timestamp` processes rows in chronological order.
- `price - LAG(price, 1)` gets the value from the row before and from 2 rows before
- Returns NULL for the first row (no previous data).

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

## Notes and restrictions

### ORDER BY behavior

- ORDER BY in OVER clause determines the logical order for window functions
- Independent of the query-level ORDER BY
- Required for window-only functions
- Required for RANGE frames

### Frame specifications

- ROWS frames:
  - Based on physical row counts
  - More efficient for large datasets
  - Can be used with any ORDER BY column

- RANGE frames:
  - Defines the frame based on the actual values in the ORDER BY column, rather than counted row.
  - Require ORDER BY on timestamp
  - Support time-based intervals (e.g., '1h', '5m')

### Exclusion behavior

- Using `EXCLUDE CURRENT ROW` with frame end at `CURRENT ROW`:
  - Automatically adjusts end boundary to `1 PRECEDING`
  - Ensures consistent results across queries

### Performance considerations

- ROWS frames typically perform better than RANGE frames for large datasets
- Partitioning can improve performance by processing smaller chunks of data
- Consider index usage when ordering by timestamp columns

### Common pitfalls

#### Using window functions in WHERE clauses:

```questdb-sql title="Not allowed!"
-- Incorrect usage
SELECT
    symbol,
    price,
    timestamp
FROM trades
WHERE
    avg(price) OVER (ORDER BY timestamp) > 100;
```

Instead, build like so:

```questdb-sql title="Correct usage" demo
with prices_and_avg AS (
SELECT
    symbol,
    price, avg(price) OVER (ORDER BY timestamp) as moving_avg_price,
    timestamp
FROM trades
WHERE timestamp in yesterday()
)
select * from prices_and_avg
WHERE
   moving_avg_price  > 100;
```

#### Missing ORDER BY in OVER clause

When no `ORDER BY` is specified, the average will be calculated for the whole
partition. Given we don't have a PARTITION BY and we are using a global window,
all the rows will show the same average. This is the average for the whole
dataset.

```questdb-sql title="Missing ORDER BY"
-- Potential issue
SELECT
    symbol,
    price,
    sum(price) OVER () AS cumulative_sum
FROM trades;
WHERE timestamp in yesterday();
```

To compute the _moving average_, we need to specify an `ORDER BY` clause:

```questdb-sql title="Safer usage" demo
SELECT
    symbol,
    price,
    sum(price) OVER (ORDER BY TIMESTAMP) AS cumulative_sum
FROM trades
WHERE timestamp in yesterday();
```

We may also have a case where all the rows for the same partition (symbol) will
have the same average, if we include a `PARTITION BY` clause without an
`ORDER BY` clause:

```questdb-sql title="Partitioned usage" demo
-- Potential issue
SELECT
    symbol,
    price,
    sum(price) OVER (PARTITION BY symbol ) AS cumulative_sum
FROM trades
WHERE timestamp in yesterday();
```

For every row to show the moving average for each symbol, we need to specify both
an `ORDER BY` and a `PARTITION BY` clause:

```questdb-sql title="Partitioned and ordered usage" demo
SELECT
    symbol,
    price,
    sum(price) OVER (PARTITION BY symbol ORDER BY TIMESTAMP) AS cumulative_sum
FROM trades
WHERE timestamp in yesterday();
```
