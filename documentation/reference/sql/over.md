---
title: Over Keyword - Window Functions
sidebar_label: OVER
description: Window SQL functions reference documentation and explanation.
---

Window functions perform calculations across sets of table rows that are related to the current row. Unlike aggregate functions that return a single result for a group of rows, window functions return a value for every row while considering a window of rows defined by the OVER clause.

We'll cover high-level, introductory information about window functions, and then move on to composition.

We also have some [common examples](/docs/reference/function/window#common-window-function-examples) to get you started.

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
- Calculating [moving averages](/docs/reference/function/window#avg) or
  [cumulative sums](/docs/reference/function/window#cumulative-sum)

Window functions are tough to grok.

An analogy before we get to building:

Imagine a group of cars in a race. Each car has a number, a name, and a finish
time. If you wanted to know the average finish time, you could use an aggregate
function like [`avg()`](/docs/reference/function/window#avg) to calculate it. But this would only give you a single
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

- [`avg()`](/docs/reference/function/window#avg) – Calculates the average within a window

- [`count()`](/docs/reference/function/window#count) – Counts rows or non-null values

- [`dense_rank()`](/docs/reference/function/window#dense_rank) – Assigns a rank to rows monotonically

- [`first_not_null_value()`](/docs/reference/function/window#first_not_null_value) – Retrieves the first not null value in a window

- [`first_value()`](/docs/reference/function/window#first_value) – Retrieves the first value in a window

- [`lag()`](/docs/reference/function/window#lag) – Accesses data from previous rows

- [`last_value()`](/docs/reference/function/window#last_value) – Retrieves the last value in a window

- [`lead()`](/docs/reference/function/window#lead) – Accesses data from subsequent rows

- [`max()`](/docs/reference/function/window#max) – Returns the maximum value within a window

- [`min()`](/docs/reference/function/window#min) – Returns the minimum value within a window

- [`rank()`](/docs/reference/function/window#rank) – Assigns a rank to rows

- [`row_number()`](/docs/reference/function/window#row_number) – Assigns sequential numbers to rows

- [`sum()`](/docs/reference/function/window#cumulative-sum) – Calculates the sum within a window

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

This calculates a moving average of price over the current and three preceding rows for each symbol. For other
common window function examples, please check the [Window functions reference](/docs/reference/function/window#common-window-function-examples).


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
