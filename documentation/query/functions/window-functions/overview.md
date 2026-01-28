---
title: Window Functions Overview
sidebar_label: Overview
description: Introduction to window functions in QuestDB - perform calculations across related rows without collapsing results.
keywords: [window functions, over, partition by, moving average, running total, rank, dense_rank, percent_rank, row_number, lag, lead, analytics, ema, vwema, ksum, exponential moving average]
---

Window functions perform calculations across sets of table rows related to the current row. Unlike aggregate functions that return a single result for a group of rows, window functions return a value for **every row** while considering a "window" of related rows defined by the `OVER` clause.

![Window function animation showing how a sliding window moves through rows, calculating results for each position](/images/docs/window-functions/window-function-animation.svg)

## Syntax

```sql
function_name(arguments) OVER (
    [PARTITION BY column [, ...]]
    [ORDER BY column [ASC | DESC] [, ...]]
    [frame_clause]
)
```

- **`PARTITION BY`**: Divides rows into groups; the function resets for each group
- **`ORDER BY`**: Defines the order of rows within each partition
- **`frame_clause`**: Specifies which rows relative to the current row to include (e.g., `ROWS BETWEEN 3 PRECEDING AND CURRENT ROW`)

Some functions (`first_value`, `last_value`, `lag`, `lead`) also support `IGNORE NULLS` or `RESPECT NULLS` before the `OVER` keyword to control null handling.

For complete syntax details including frame specifications and exclusion options, see [OVER Clause Syntax](syntax.md).

:::info Window function arithmetic (9.3.1+)
Arithmetic operations on window functions (e.g., `sum(...) OVER (...) / sum(...) OVER (...)`) are supported from version 9.3.1. Earlier versions require wrapping window functions in CTEs or subqueries.
:::

## Quick reference

| Function | Description | Respects Frame |
|----------|-------------|----------------|
| [`avg()`](reference.md#avg) | Average value in window (also supports EMA and VWEMA) | Yes (standard) / No (EMA/VWEMA) |
| [`count()`](reference.md#count) | Count rows or non-null values | Yes |
| [`sum()`](reference.md#sum) | Sum of values in window | Yes |
| [`ksum()`](reference.md#ksum) | Sum with Kahan precision | Yes |
| [`min()`](reference.md#min) | Minimum value in window | Yes |
| [`max()`](reference.md#max) | Maximum value in window | Yes |
| [`first_value()`](reference.md#first_value) | First value in window | Yes |
| [`last_value()`](reference.md#last_value) | Last value in window | Yes |
| [`row_number()`](reference.md#row_number) | Sequential row number | No |
| [`rank()`](reference.md#rank) | Rank with gaps for ties | No |
| [`dense_rank()`](reference.md#dense_rank) | Rank without gaps | No |
| [`percent_rank()`](reference.md#percent_rank) | Relative rank (0 to 1) | No |
| [`lag()`](reference.md#lag) | Value from previous row | No |
| [`lead()`](reference.md#lead) | Value from following row | No |

**Respects Frame**: Functions marked "Yes" use the frame clause (`ROWS`/`RANGE BETWEEN`). Functions marked "No" operate on the entire partition regardless of frame specification.

## When to use window functions

Window functions are essential for analytics tasks where you need to:

- Calculate **running totals** or **cumulative sums**
- Compute **moving averages** over time periods
- Find the **maximum or minimum** value within a sequence
- **Rank** items within categories
- Access **previous or next row** values without self-joins
- Compare each row to an **aggregate** of related rows

### Example: Moving average

```questdb-sql title="4-row moving average of price" demo
SELECT
    symbol,
    price,
    timestamp,
    avg(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS moving_avg
FROM trades
WHERE timestamp IN '[$today]'
LIMIT 100;
```

This calculates a moving average over the current row plus three preceding rows, grouped by symbol.

## How window functions work

A window function has three key components:

```
function_name(arguments) OVER (
    [PARTITION BY column]      -- Divide into groups
    [ORDER BY column]          -- Order within groups
    [frame_specification]      -- Define which rows to include
)
```

### 1. Partitioning

`PARTITION BY` divides rows into independent groups. The window function **resets** for each partition—calculations start fresh, as if each group were a separate table.

**When to use it:** When storing multiple instruments in the same table, you typically want calculations isolated per symbol. For example:
- Cumulative volume **per symbol** (not across all instruments)
- Moving average price **per symbol** (not mixing BTC-USDT with ETH-USDT)
- Intraday high/low **per symbol**

```questdb-sql
-- Without PARTITION BY: cumulative volume across ALL symbols (mixing instruments)
sum(amount) OVER (ORDER BY timestamp)

-- With PARTITION BY: cumulative volume resets for each symbol
sum(amount) OVER (PARTITION BY symbol ORDER BY timestamp)
```

| timestamp | symbol | amount | cumulative (no partition) | cumulative (by symbol) |
|-----------|--------|--------|---------------------------|------------------------|
| 09:00 | BTC-USDT | 100 | 100 | 100 |
| 09:01 | ETH-USDT | 200 | 300 | 200 |
| 09:02 | BTC-USDT | 150 | 450 | 250 |
| 09:03 | ETH-USDT | 100 | 550 | 300 |

Without `PARTITION BY`, all rows are treated as a single partition.

### 2. Ordering

`ORDER BY` within the `OVER` clause determines the logical order for calculations:

```questdb-sql
-- Row numbers ordered by timestamp
row_number() OVER (ORDER BY timestamp)
```

This is independent of the query-level `ORDER BY`.

:::tip Time-series optimization
For tables with a designated timestamp, data is already ordered by time. When your window `ORDER BY` matches the designated timestamp, QuestDB skips redundant sorting—no performance penalty.
:::

### 3. Frame specification

The frame defines which rows relative to the current row are included in the calculation:

```questdb-sql
-- Sum of current row plus 2 preceding rows
sum(price) OVER (
    ORDER BY timestamp
    ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
)
```

For complete frame syntax details, see [OVER Clause Syntax](syntax.md#frame-types-and-behavior).

## Aggregate vs window functions

The key difference: aggregate functions collapse rows into one result, while window functions keep all rows and add a computed column.

**Source data:**

| timestamp | symbol | price |
|-----------|--------|-------|
| 09:00 | BTC-USDT | 100 |
| 09:01 | BTC-USDT | 102 |
| 09:02 | BTC-USDT | 101 |

**Aggregate function** — returns one row:

```questdb-sql
SELECT symbol, avg(price) AS avg_price
FROM trades
GROUP BY symbol;
```

| symbol | avg_price |
|--------|-----------|
| BTC-USDT | 101 |

**Window function** — returns all rows with computed column:

```questdb-sql
SELECT timestamp, symbol, price,
       avg(price) OVER (PARTITION BY symbol) AS avg_price
FROM trades;
```

| timestamp | symbol | price | avg_price |
|-----------|--------|-------|-----------|
| 09:00 | BTC-USDT | 100 | 101 |
| 09:01 | BTC-USDT | 102 | 101 |
| 09:02 | BTC-USDT | 101 | 101 |

Each row keeps its original data **plus** the average—useful for comparing each price to the mean, calculating deviations, or adding running totals alongside the raw values.

## ROWS vs RANGE frames

QuestDB supports two frame types:

### ROWS frame

Based on physical row count:

```questdb-sql
ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
```

Includes exactly 4 rows: current row plus 3 before it.

### RANGE frame

Based on values in the `ORDER BY` column (must be a timestamp):

```questdb-sql
RANGE BETWEEN '1' MINUTE PRECEDING AND CURRENT ROW
```

Includes all rows within 1 minute of the current row's timestamp.

:::note
RANGE frames have a known limitation: rows with the same ORDER BY value ("peers") do not produce identical results as required by the SQL standard. QuestDB currently processes peers as distinct rows rather than treating them as a group. See [GitHub issue #5177](https://github.com/questdb/questdb/issues/5177) for details.
:::

For complete frame syntax, see [OVER Clause Syntax](syntax.md).

## Common patterns

### Running total

Use the `CUMULATIVE` shorthand for running totals:

```questdb-sql title="Cumulative sum" demo
SELECT
    timestamp,
    amount,
    sum(amount) OVER (
        ORDER BY timestamp
        CUMULATIVE
    ) AS running_total
FROM trades
WHERE timestamp IN '[$today]';
```

This is equivalent to `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.

### VWAP (Volume-Weighted Average Price)

For high-frequency market data, VWAP is typically calculated over OHLC time series using the typical price `(high + low + close) / 3`:

```questdb-sql title="VWAP over OHLC data" demo
DECLARE @symbol := 'BTC-USDT'

WITH ohlc AS (
    SELECT
        timestamp AS ts,
        symbol,
        first(price) AS open,
        max(price) AS high,
        min(price) AS low,
        last(price) AS close,
        sum(amount) AS volume
    FROM trades
    WHERE timestamp IN '2024-05-22' AND symbol = @symbol
    SAMPLE BY 1m ALIGN TO CALENDAR
)
SELECT
    ts,
    symbol,
    open, high, low, close, volume,
    sum((high + low + close) / 3 * volume) OVER (ORDER BY ts CUMULATIVE)
        / sum(volume) OVER (ORDER BY ts CUMULATIVE) AS vwap
FROM ohlc
ORDER BY ts;
```

### Compare to group average

```questdb-sql title="Price vs symbol average" demo
SELECT
    symbol,
    price,
    timestamp,
    avg(price) OVER (PARTITION BY symbol) AS symbol_avg,
    price - avg(price) OVER (PARTITION BY symbol) AS diff_from_avg
FROM trades
WHERE timestamp IN '[$today]';
```

### Rank within category

```questdb-sql title="Rank prices per symbol" demo
SELECT
    symbol,
    price,
    timestamp,
    rank() OVER (
        PARTITION BY symbol
        ORDER BY price DESC
    ) AS price_rank
FROM trades
WHERE timestamp IN '[$today]';
```

### Access previous row

```questdb-sql title="Calculate price change" demo
SELECT
    timestamp,
    price,
    lag(price) OVER (ORDER BY timestamp) AS prev_price,
    price - lag(price) OVER (ORDER BY timestamp) AS price_change
FROM trades
WHERE timestamp IN '[$today]'
    AND symbol = 'BTC-USDT';
```

## Next steps

- **[Function Reference](reference.md)**: Detailed documentation for each window function
- **[OVER Clause Syntax](syntax.md)**: Complete syntax for partitioning, ordering, and frame specifications

:::tip Looking for WINDOW JOIN?
[WINDOW JOIN](/docs/query/sql/window-join/) is a separate feature for aggregating data from a *different table* within a time window. Use window functions (this page) for calculations within a single table; use WINDOW JOIN to correlate two time-series tables.
:::

## Common mistakes

### Using window functions in WHERE

Window functions cannot be used directly in `WHERE` clauses:

```questdb-sql title="Incorrect - will not work"
SELECT symbol, price
FROM trades
WHERE avg(price) OVER (ORDER BY timestamp) > 100;
```

Use a CTE or subquery instead:

```questdb-sql title="Correct approach" demo
WITH prices AS (
    SELECT
        symbol,
        price,
        avg(price) OVER (ORDER BY timestamp) AS moving_avg
    FROM trades
    WHERE timestamp IN '[$today]'
)
SELECT * FROM prices
WHERE moving_avg > 100;
```

### Missing ORDER BY

Without `ORDER BY`, the window includes all rows in the partition, which may not be the intended behavior:

```questdb-sql title="All rows show same average" demo
SELECT
    symbol,
    price,
    timestamp,
    avg(price) OVER (PARTITION BY symbol) AS avg_price  -- Same value for all rows in partition
FROM trades
WHERE timestamp IN '[$today]';
```

Add `ORDER BY` for cumulative/moving calculations:

```questdb-sql title="Running average" demo
SELECT
    symbol,
    price,
    timestamp,
    avg(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS running_avg
FROM trades
WHERE timestamp IN '[$today]';
```
