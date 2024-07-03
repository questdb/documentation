---
title: Window Functions
sidebar_label: Window
description: Window SQL functions reference documentation and explanation.
---

This page unpacks QuestDB window functions and provides references.

Window functions exist within many SQL dialects. QuestDB is consistent with
expected function.

## What is a Window Function?

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
- Calculating [moving averages](/docs/reference/function/window/#avg) or
  [cumulative sums](/docs/reference/function/window/#cumulative-sum)

Window functions are tough to grok.

An analogy before we get to building:

Imagine a group of cars in a race. Each car has a number, a name, and a finish
time. If you wanted to know the average finish time, you could use an aggregate
function like `avg` to calculate it. But this would only give you a single
result: the average time. You wouldn't know anything about individual cars'
times.

Now, let's say you want to know how each car's time compares to the average.
Enter window functions. A window function allows you to calculate the average
finish time (the window), but for each car (row) individually.

For example, you could use a window function to calculate the average finish
time for all cars, but then apply this average to each car to see if they were
faster or slower than the average. The `OVER` clause in a window function is
like saying, "for each car, compare their time to the average time of all cars."

So, in essence, window functions allow you to perform calculations that consider
more than just the individual row or the entire table, but a 'window' of related
rows. This 'window' could be all rows with the same value in a certain column,
like all cars of the same engine size, or it could be a range of rows based on
some order, like the three cars who finished before and after a certain car.

This makes window functions incredibly powerful for complex calculations and
analyses.

## Building Window Functions

At the peak of its complexity, a window function can appear as such:

```questdb-sql
functionName OVER (
    PARTITION BY columnName [, columnName ...]
    ORDER BY columnName [ASC | DESC] [, columnName [ASC | DESC] ...]
    RANGE | ROWS (
        UNBOUNDED PRECEDING | offset PRECEDING | CURRENT ROW
        | BETWEEN (UNBOUNDED PRECEDING | offset PRECEDING | CURRENT ROW)
        AND (offset PRECEDING | CURRENT ROW)
    )
    EXCLUDE CURRENT ROW | EXCLUDE NO OTHERS
)
```

The broad scope of possible choices can be overwhelming. But once the options
become clear, assembling valuable and performant queries is quick work.

We will break down the above into:

1. [Base Function](#base-function)
2. [OVER Clause - PARTITION & ORDER](#over-clause---partition--order)
3. ["Frame" Clause - RANGE or ROWS](#frame-clause---range-or-rows)
4. [Exclusion Option](#exclusion-option)

### Base Function

This reference page demonstrates 5 base functions:

1. [avg()](/docs/reference/function/window/#avg)
2. [first_value()](/docs/reference/function/window/#first_value)
3. [rank()](/docs/reference/function/window/#rank)
4. [row_number()](/docs/reference/function/window/#row_number)
5. Cumulative [sum()](/docs/reference/function/window/#cumulative-sum)

We can assemble our window functions into "blocks" so that it is easier to
understand. Each block is then explained in its own small section.

The base function is the first block.

It contextualizes the "way we look through our window":

```questdb-sql
avg(price) ... (
      ...
    )
    ...
)
```

Next we define `OVER`. It is the key to assembling valuable and performant
window functions:

```questdb-sql
avg(price) OVER (
      ...
    )
    ...
)
```

Within `OVER`, we will define `PARTITION BY` and `ORDER BY`, as well as provide
our "Frame" clause, which details our `RANGE` or `ROWS`. This is the heart and
shape of our window:

```questdb-sql
avg(price) OVER (
    PARTITION BY columnName [, columnName ...]
    ORDER BY columnName [ASC | DESC] [, columnName [ASC | DESC] ...]
    RANGE | ROWS (
        UNBOUNDED PRECEDING | offset PRECEDING | CURRENT ROW
        | BETWEEN (UNBOUNDED PRECEDING | offset PRECEDING | CURRENT ROW)
        AND (offset PRECEDING | CURRENT ROW)
    )
    ...
)
```

Finally, our exclusion clauses indicate what to omit. It's a bit like sculpting
the final details into the window:

```questdb-sql
avg(price) OVER (
    PARTITION BY columnName [, columnName ...]
    ORDER BY columnName [ASC | DESC] [, columnName [ASC | DESC] ...]
    RANGE | ROWS (
        UNBOUNDED PRECEDING | offset PRECEDING | CURRENT ROW
        | BETWEEN (UNBOUNDED PRECEDING | offset PRECEDING | CURRENT ROW)
        AND (offset PRECEDING | CURRENT ROW)
    )
    EXCLUDE CURRENT ROW | EXCLUDE NO OTHERS
)
```

### OVER Clause - PARTITION & ORDER

The `OVER` clause defines how data is grouped and processed. When you set the
function ahead of `OVER`, it's a bit like a "for each" operation. It is framed
as: "perform this function OVER related rows based on the following terms".

It can be used with `PARTITION BY` and `ORDER BY` to set unique parameters and
organize the rows. For performance reasons, if `ORDER BY` is set within an
`OVER` clause, it should match the base query's `ORDER BY`.

### "Frame" Clause - RANGE or ROWS

Window functions use a "frame" to define the subset of data the function
operates on. Two modes are available for defining this frame: `RANGE` and
`ROWS`.

#### RANGE Mode

`RANGE` mode defines the window frame based on a range of values in the
`ORDER BY` column. This is useful when the data has a continuous or time-based
nature.

For example, to calculate a moving average of prices over time, you might use
`RANGE` mode with `ORDER BY` timestamp:

```questdb-sql
SELECT symbol, price, timestamp,
       avg(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        RANGE BETWEEN '1' HOUR PRECEDING AND CURRENT ROW)
as moving_avg
FROM trades
```

This calculates the average price for each symbol, for the current row and all
rows with a timestamp within the preceding hour.

#### ROWS Mode

`ROWS` mode defines the window frame based on a specific number of rows. This is
useful when you want to consider a fixed number of rows, regardless of their
values.

For example, to calculate a moving average of the last `N` prices, you might use
`ROWS` mode:

```questdb-sql
SELECT symbol, price, timestamp,
       avg(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS BETWEEN 3 PRECEDING AND CURRENT ROW) as moving_avg
FROM trades
```

This calculates the average price for each symbol, for the current row and the
three preceding rows.

##### Common Syntax

Both `RANGE` and `ROWS` modes share similar syntax for defining the frame:

- `UNBOUNDED PRECEDING`: The window starts at the first row of the partition
- `value PRECEDING` or `offset PRECEDING`: The window starts at a specified
  value or number of rows before the current row
- `CURRENT ROW`: The window starts or ends at the current row
- `BETWEEN (UNBOUNDED PRECEDING | value PRECEDING | CURRENT ROW) AND (value PRECEDING | CURRENT ROW)`:
  The window starts and ends at specified points relative to the current row

The choice between `RANGE` and `ROWS` depends on the nature of your data and the
specific requirements of your calculation.

#### Default Frame Definition

When the frame clause is not specified, the default frame is
`RANGE UNBOUNDED PRECEDING`, which includes all rows from the start of the
partition to the current row.

- If `ORDER BY` is not present, the frame includes the entire partition, as all
  rows are considered equal.

- If `ORDER BY` is present, the frame includes all rows from the start of the
  partition to the current row. Note that `UNBOUNDED FOLLOWING` is only allowed
  when the frame start is `UNBOUNDED PRECEDING`, which means the frame includes
  the entire partition.

### Exclusion Option

The `OVER` clause can also include an exclusion option, which determines whether
certain rows are excluded from the frame:

- `EXCLUDE CURRENT ROW`: Excludes the current row in `ROWS` mode and all rows
  with the same `ORDER BY` value in `RANGE` mode. This is equivalent to setting
  the frame end to `1 PRECEDING`.
- `EXCLUDE NO OTHERS`: Includes all rows in the frame. This is the default if no
  exclusion option is specified.

### Time Units

The time units that can be used in window functions are:

- `day`
- `hour`
- `minute`
- `second`
- `millisecond`
- `microsecond`

Plural forms of these time units are also accepted.

## avg

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

**Examples:**

Examples below use `trades` table:

```questdb-sql
CREATE TABLE trades (
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE,
  timestamp TIMESTAMP
) TIMESTAMP (timestamp)
PARTITION BY DAY WAL;

INSERT INTO trades(symbol, price, amount, timestamp)
VALUES
('ETH-USD', 2615.54, 0.00044, '2022-03-08 18:03:57'),
('BTC-USD', 39269.98, 0.001, '2022-03-08 18:03:57'),
('BTC-USD', 39265.31, 0.000127, '2022-03-08 18:03:58'),
('BTC-USD', 39265.31, 0.000245, '2022-03-08 18:03:58'),
('BTC-USD', 39265.31, 0.000073, '2022-03-08 18:03:58'),
('BTC-USD', 39263.28, 0.00392897, '2022-03-08 18:03:58'),
('ETH-USD', 2615.35, 0.02245868, '2022-03-08 18:03:58'),
('ETH-USD', 2615.36, 0.03244613, '2022-03-08 18:03:58'),
('BTC-USD', 39265.27, 0.00006847, '2022-03-08 18:03:58'),
('BTC-USD', 39262.42, 0.00046562, '2022-03-08 18:03:58');
```

#### Moving average price over latest 4 rows

```questdb-sql
SELECT symbol, price, amount, timestamp,
avg(price) OVER (PARTITION BY symbol
                 ROWS BETWEEN 3 PRECEDING AND CURRENT ROW)
FROM trades
```

| symbol  | price    | amount     | timestamp                   | avg        |
| ------- | -------- | ---------- | --------------------------- | ---------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.609765Z | 2615.54    |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.710419Z | 39269.98   |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.357448Z | 39267.645  |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.357448Z | 39266.8666 |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.357448Z | 39266.4775 |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.357448Z | 39264.8025 |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.612275Z | 2615.445   |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.612275Z | 2615.4166  |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.660121Z | 39264.7925 |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.660121Z | 39264.07   |

#### Moving average price over preceding X rows

If frame is specified only on preceding rows, `avg()` returns null until at
least one non-null value enters the frame.

```questdb-sql
SELECT symbol, price, amount, timestamp,
avg(price) OVER (PARTITION BY symbol
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 4 PRECEDING)
FROM trades
```

| symbol  | price    | amount     | timestamp                   | avg        |
| ------- | -------- | ---------- | --------------------------- | ---------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.609765Z | null       |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.710419Z | null       |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.357448Z | null       |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.357448Z | null       |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.357448Z | null       |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.357448Z | 39269.98   |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.612275Z | null       |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.612275Z | null       |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.660121Z | 39267.6450 |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.660121Z | 39266.8666 |

#### Moving average price over values in the latest second

```questdb-sql
SELECT symbol, price, amount, timestamp,
avg(price) OVER (PARTITION BY symbol
                 ORDER BY timestamp
                 RANGE BETWEEN '1' SECOND PRECEDING AND CURRENT ROW)
FROM trades
ORDER BY timestamp
```

| symbol  | price    | amount     | timestamp                   | avg        |
| ------- | -------- | ---------- | --------------------------- | ---------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.609765Z | 2615.54    |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.710419Z | 39269.98   |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.357448Z | 39267.645  |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.357448Z | 39266.8666 |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.357448Z | 39266.4775 |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.357448Z | 39265.838  |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.612275Z | 2615.35    |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.612275Z | 2615.355   |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.660121Z | 39265.7433 |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.660121Z | 39265.2685 |

#### Moving average price over values in the latest second, descending designated timestamp order

```questdb-sql
SELECT symbol, price, amount, timestamp,
avg(price) OVER (PARTITION BY symbol
                 ORDER BY timestamp DESC
                 RANGE BETWEEN '1' SECOND PRECEDING AND CURRENT ROW)
FROM trades
ORDER BY timestamp DESC
```

| symbol  | price    | amount     | timestamp                   | avg        |
| ------- | -------- | ---------- | --------------------------- | ---------- |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.660121Z | 39262.42   |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.660121Z | 39263.845  |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.612275Z | 2615.36    |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.612275Z | 2615.355   |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.357448Z | 39263.6566 |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.357448Z | 39264.07   |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.357448Z | 39264.318  |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.357448Z | 39264.4833 |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.710419Z | 39265.2685 |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.609765Z | 2615.54    |

#### Moving average over default frame

Default frame is RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW, which spans
whole partition in absence of ORDER BY clause.

```questdb-sql
SELECT symbol, price, amount, timestamp,
avg(price) OVER (PARTITION BY symbol)
FROM trades
ORDER BY timestamp
```

| symbol  | price    | amount     | timestamp                   | avg        |
| ------- | -------- | ---------- | --------------------------- | ---------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.609765Z | 2615.4166  |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.710419Z | 39265.2685 |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.357448Z | 39265.2685 |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.357448Z | 39265.2685 |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.357448Z | 39265.2685 |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.357448Z | 39265.2685 |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.612275Z | 2615.4166  |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.612275Z | 2615.4166  |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.660121Z | 39265.2685 |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.660121Z | 39265.2685 |

#### Moving average over default ordered frame

```questdb-sql
SELECT symbol, price, amount, timestamp,
avg(price) OVER (PARTITION BY symbol ORDER BY timestamp)
FROM trades
ORDER BY timestamp
```

| symbol  | price    | amount     | timestamp                   | avg        |
| ------- | -------- | ---------- | --------------------------- | ---------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.609765Z | 2615.54    |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.710419Z | 39269.98   |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.357448Z | 39267.645  |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.357448Z | 39266.8666 |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.357448Z | 39266.4775 |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.357448Z | 39265.838  |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.612275Z | 2615.445   |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.612275Z | 2615.4166  |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.660121Z | 39265.7433 |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.660121Z | 39265.2685 |

#### Moving average over whole result set

```questdb-sql
SELECT symbol, price, amount, timestamp,
avg(price) OVER ()
FROM trades
ORDER BY timestamp
```

| symbol  | price    | amount     | timestamp                   | avg        |
| ------- | -------- | ---------- | --------------------------- | ---------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.609765Z | 28270.3130 |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.710419Z | 28270.3130 |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.357448Z | 28270.3130 |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.357448Z | 28270.3130 |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.357448Z | 28270.3130 |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.357448Z | 28270.3130 |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.612275Z | 28270.3130 |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.612275Z | 28270.3130 |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.660121Z | 28270.3130 |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.660121Z | 28270.3130 |

## first_value

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

**Examples:**

Examples below use `trades` table defined above.

#### First price over latest 4 rows

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    timestamp,
    first_value(price) OVER (
        PARTITION BY symbol
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    )
FROM
    trades
```

| symbol  | price    | amount     | timestamp                   | first_value |
| ------- | -------- | ---------- | --------------------------- | ----------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.000000Z | 2615.54     |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.000000Z | 39269.98    |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.000000Z | 39265.31    |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.000000Z | 2615.54     |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.000000Z | 2615.54     |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.000000Z | 39265.31    |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.000000Z | 39265.31    |

#### First price over preceding rows except 4 latest

If frame is specified only on preceding rows, `first_value()` returns null until
at least one non-null value enters the frame.

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    timestamp,
    first_value(price) OVER (
        PARTITION BY symbol
        ROWS BETWEEN UNBOUNDED PRECEDING AND 4 PRECEDING
    )
FROM
    trades
```

| symbol  | price    | amount     | timestamp                   | first_value |
| ------- | -------- | ---------- | --------------------------- | ----------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.000000Z | null        |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.000000Z | null        |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.000000Z | null        |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.000000Z | null        |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.000000Z | null        |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.000000Z | 39269.98    |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.000000Z | null        |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.000000Z | null        |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.000000Z | 39269.98    |

#### First value of price in the latest second

```questdb-sql
SELECT symbol, price, amount, timestamp,
first_value(price) OVER (PARTITION BY symbol
                         ORDER BY timestamp
                         RANGE BETWEEN '1' SECOND PRECEDING AND CURRENT ROW)
FROM trades
ORDER BY timestamp
```

| symbol  | price    | amount     | timestamp                   | first_value |
| ------- | -------- | ---------- | --------------------------- | ----------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.000000Z | 2615.54     |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.000000Z | 39269.98    |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.000000Z | 39269.98    |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.000000Z | 2615.54     |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.000000Z | 2615.54     |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.000000Z | 39269.98    |

#### First value of price in the latest second, descending designated timestamp order

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    timestamp,
    first_value(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp DESC
        RANGE BETWEEN '1' SECOND PRECEDING AND CURRENT ROW
    )
FROM
    trades
ORDER BY
    timestamp DESC
```

| symbol  | price    | amount     | timestamp                   | first_value |
| ------- | -------- | ---------- | --------------------------- | ----------- |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.000000Z | 39262.42    |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.000000Z | 39262.42    |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.000000Z | 2615.36     |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.000000Z | 2615.36     |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.000000Z | 39262.42    |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.000000Z | 39262.42    |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.000000Z | 39262.42    |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.000000Z | 39262.42    |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.000000Z | 39262.42    |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.000000Z | 2615.36     |

#### First value of price in default frame

Default frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, which
spans the whole partition in absence of an `ORDER BY` clause.

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    timestamp,
    first_value(price) OVER (
        PARTITION BY symbol
    )
FROM
    trades
ORDER BY
    timestamp
```

| symbol  | price    | amount     | timestamp                   | first_value |
| ------- | -------- | ---------- | --------------------------- | ----------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.000000Z | 2615.54     |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.000000Z | 39269.98    |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.000000Z | 39269.98    |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.000000Z | 2615.54     |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.000000Z | 2615.54     |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.000000Z | 39269.98    |

#### First value of price in default ordered frame

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    timestamp,
    first_value(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    )
FROM
    trades
ORDER BY
    timestamp
```

| symbol  | price    | amount     | timestamp                   | first_value |
| ------- | -------- | ---------- | --------------------------- | ----------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.000000Z | 2615.54     |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.000000Z | 39269.98    |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.000000Z | 39269.98    |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.000000Z | 2615.54     |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.000000Z | 2615.54     |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.000000Z | 39269.98    |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.000000Z | 39269.98    |

#### First value of price in whole result set

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    timestamp,
    first_value(price) OVER ()
FROM
    trades
ORDER BY
    timestamp
```

| symbol  | price    | amount     | timestamp                   | first_value |
| ------- | -------- | ---------- | --------------------------- | ----------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.000000Z | 2615.54     |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.000000Z | 2615.54     |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.000000Z | 2615.54     |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.000000Z | 2615.54     |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.000000Z | 2615.54     |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.000000Z | 2615.54     |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.000000Z | 2615.54     |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.000000Z | 2615.54     |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.000000Z | 2615.54     |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.000000Z | 2615.54     |

## rank

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

**Examples:**

For a given table `housing`:

```questdb-sql
CREATE TABLE housing (
  id INT,
  price DOUBLE,
  rating INT,
  location VARCHAR,
  date_sold TIMESTAMP
);

INSERT INTO housing(id, price, rating, location, date_sold)
VALUES
(2, 246.3393, 1, 'alcatraz_ave', '2021-02-01 00:00:00'),
(10, 69.2601, 5, 'alcatraz_ave', '2021-02-01 04:00:00'),
(15, 616.2569, 3, 'westbrae', '2021-02-01 08:00:00'),
(3, 112.7856, 5, 'south_side', '2021-02-01 12:00:00'),
(17, 993.3345, 1, 'south_side', '2021-02-01 16:00:00'),
(8, 937.4274, 1, 'berkeley_hills', '2021-02-01 20:00:00'),
(4, 207.7797, 1, 'alcatraz_ave', '2021-02-02 00:00:00'),
(17, 352.3193, 3, 'downtown', '2021-02-02 04:00:00'),
(3, 140.0437, 1, 'westbrae', '2021-02-02 08:00:00'),
(15, 971.7142, 1, 'westbrae', '2021-02-02 12:00:00');
```

The following query uses `rank()` to display output based on the rating:

```questdb-sql
SELECT
    location,
    price,
    date_sold,
    rating,
    rank() OVER (
        ORDER BY rating ASC
    ) AS rank
FROM
    housing
ORDER BY
    rank
```

| location       | price    | date_sold                   | rating | rank |
| -------------- | -------- | --------------------------- | ------ | ---- |
| westbrae       | 971.7142 | 2021-02-02T12:00:00.000000Z | 1      | 1    |
| westbrae       | 140.0437 | 2021-02-02T08:00:00.000000Z | 1      | 1    |
| alcatraz_ave   | 207.7797 | 2021-02-02T00:00:00.000000Z | 1      | 1    |
| berkeley_hills | 937.4274 | 2021-02-01T20:00:00.000000Z | 1      | 1    |
| south_side     | 993.3345 | 2021-02-01T16:00:00.000000Z | 1      | 1    |
| alcatraz_ave   | 246.3393 | 2021-02-01T00:00:00.000000Z | 1      | 1    |
| downtown       | 352.3193 | 2021-02-02T04:00:00.000000Z | 3      | 7    |
| westbrae       | 616.2569 | 2021-02-01T08:00:00.000000Z | 3      | 7    |
| south_side     | 112.7856 | 2021-02-01T12:00:00.000000Z | 5      | 9    |
| alcatraz_ave   | 69.2601  | 2021-02-01T04:00:00.000000Z | 5      | 9    |

## row_number

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

**Examples:**

Given a table `trades`, the queries below use `row_number()` with a `WHERE`
clause to filter trading records added within one day.

The following query assigns row numbers and orders output based on them:

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    row_number() OVER () AS row_num
FROM trades
WHERE timestamp > DATEADD('d', -1, NOW())
ORDER BY row_num ASC;
-- The ORDER BY clause arranges the output based on the assigned row_num.
```

| symbol  | price    | amount     | row_num |
| :------ | :------- | :--------- | :------ |
| BTC-USD | 20633.47 | 0.17569298 | 1       |
| ETH-USD | 1560.04  | 1.3289     | 2       |
| ETH-USD | 1560.04  | 0.3        | 3       |
| ETH-USD | 1560     | 1.40426786 | 4       |
| BTC-USD | 20633.48 | 0.00179092 | 5       |

The following query groups the table based on `symbol` and assigns row numbers
to each group based on `price`:

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    row_number() OVER (PARTITION BY symbol ORDER BY price) AS row_num
FROM trades
WHERE timestamp > DATEADD('d', -1, NOW())
ORDER BY row_num ASC;
-- The ORDER BY clause arranges the output based on the assigned row_num.
```

| symbol  | price   | amount     | row_num |
| :------ | :------ | :--------- | :------ |
| BTC-USD | 1479.41 | 0.10904633 | 1       |
| ETH-USD | 20000   | 0.1        | 1       |
| BTC-USD | 1479.45 | 0.02       | 2       |
| ETH-USD | 20000   | 0.000249   | 2       |

## Cumulative sum

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

**Examples:**

Examples below use `trades` table defined above.

#### Moving price sum over latest 4 rows

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    timestamp,
    sum(price) OVER (
        PARTITION BY symbol
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    )
FROM
    trades
```

| symbol  | price    | amount     | timestamp                   | sum       |
| ------- | -------- | ---------- | --------------------------- | --------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.000000Z | 2615.54   |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.000000Z | 39269.98  |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.000000Z | 78535.29  |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.000000Z | 117800.6  |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.000000Z | 157065.91 |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.000000Z | 157059.21 |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.000000Z | 5230.89   |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.000000Z | 7846.25   |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.000000Z | 157059.17 |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.000000Z | 157056.28 |

#### Moving price sum over preceding rows except 4 latest

If frame is specified only on preceding rows, `sum()` returns null until at
least one non-null value enters the frame.

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    timestamp,
    sum(price) OVER (
        PARTITION BY symbol
        ROWS BETWEEN UNBOUNDED PRECEDING AND 4 PRECEDING
    )
FROM
    trades
```

| symbol  | price    | amount     | timestamp                   | sum      |
| ------- | -------- | ---------- | --------------------------- | -------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.000000Z | null     |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.000000Z | null     |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.000000Z | null     |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.000000Z | null     |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.000000Z | null     |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.000000Z | 39269.98 |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.000000Z | null     |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.000000Z | null     |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.000000Z | 78535.29 |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.000000Z | 117800.6 |

#### Moving price sum over the latest second

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    timestamp,
    sum(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        RANGE BETWEEN '1' SECOND PRECEDING AND CURRENT ROW
    )
FROM
    trades
ORDER BY
    timestamp
```

| symbol  | price    | amount     | timestamp                   | sum       |
| ------- | -------- | ---------- | --------------------------- | --------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.000000Z | 2615.54   |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.000000Z | 39269.98  |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.000000Z | 78535.29  |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.000000Z | 117800.6  |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.000000Z | 157065.91 |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.000000Z | 196329.19 |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.000000Z | 5230.89   |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.000000Z | 7846.25   |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.000000Z | 235594.46 |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.000000Z | 274856.88 |

#### Moving price sum over the latest second, descending designated timestamp order

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    timestamp,
    sum(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp DESC
        RANGE BETWEEN '1' SECOND PRECEDING AND CURRENT ROW
    )
FROM
    trades
ORDER BY
    timestamp DESC
```

| symbol  | price    | amount     | timestamp                   | sum       |
| ------- | -------- | ---------- | --------------------------- | --------- |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.000000Z | 39262.42  |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.000000Z | 78527.69  |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.000000Z | 2615.36   |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.000000Z | 5230.71   |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.000000Z | 117790.97 |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.000000Z | 157056.28 |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.000000Z | 196321.59 |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.000000Z | 235586.9  |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.000000Z | 274856.88 |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.000000Z | 7846.25   |

#### Moving price sum over default frame

Default frame is RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW, which spans
whole partition in absence of ORDER BY clause.

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    timestamp,
    sum(price) OVER (
        PARTITION BY symbol
    )
FROM
    trades
ORDER BY
    timestamp
```

| symbol  | price    | amount     | timestamp                   | sum       |
| ------- | -------- | ---------- | --------------------------- | --------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.000000Z | 7846.25   |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.000000Z | 274856.88 |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.000000Z | 274856.88 |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.000000Z | 274856.88 |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.000000Z | 274856.88 |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.000000Z | 274856.88 |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.000000Z | 7846.25   |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.000000Z | 7846.25   |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.000000Z | 274856.88 |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.000000Z | 274856.88 |

#### Moving price sum over default ordered frame

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    timestamp,
    sum(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    )
FROM
    trades
ORDER BY
    timestamp
```

| symbol  | price    | amount     | timestamp                   | sum       |
| ------- | -------- | ---------- | --------------------------- | --------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.000000Z | 2615.54   |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.000000Z | 39269.98  |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.000000Z | 78535.29  |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.000000Z | 117800.6  |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.000000Z | 157065.91 |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.000000Z | 196329.19 |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.000000Z | 5230.89   |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.000000Z | 7846.25   |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.000000Z | 235594.46 |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.000000Z | 274856.88 |

#### Moving price sum over whole result set

```questdb-sql
SELECT
    symbol,
    price,
    amount,
    timestamp,
    sum(price) OVER ()
FROM
    trades
ORDER BY
    timestamp
```

| symbol  | price    | amount     | timestamp                   | sum       |
| ------- | -------- | ---------- | --------------------------- | --------- |
| ETH-USD | 2615.54  | 0.00044    | 2022-03-08T18:03:57.000000Z | 282703.13 |
| BTC-USD | 39269.98 | 0.001      | 2022-03-08T18:03:57.000000Z | 282703.13 |
| BTC-USD | 39265.31 | 0.000127   | 2022-03-08T18:03:58.000000Z | 282703.13 |
| BTC-USD | 39265.31 | 0.000245   | 2022-03-08T18:03:58.000000Z | 282703.13 |
| BTC-USD | 39265.31 | 0.000073   | 2022-03-08T18:03:58.000000Z | 282703.13 |
| BTC-USD | 39263.28 | 0.00392897 | 2022-03-08T18:03:58.000000Z | 282703.13 |
| ETH-USD | 2615.35  | 0.02245868 | 2022-03-08T18:03:58.000000Z | 282703.13 |
| ETH-USD | 2615.36  | 0.03244613 | 2022-03-08T18:03:58.000000Z | 282703.13 |
| BTC-USD | 39265.27 | 0.00006847 | 2022-03-08T18:03:58.000000Z | 282703.13 |
| BTC-USD | 39262.42 | 0.00046562 | 2022-03-08T18:03:58.000000Z | 282703.13 |
