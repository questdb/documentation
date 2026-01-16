---
title: Window Functions Reference
sidebar_label: Function Reference
description: Complete reference for all window functions in QuestDB including avg, sum, ksum, count, rank, row_number, lag, lead, EMA, VWEMA, and more.
keywords: [window functions, avg, sum, ksum, count, rank, row_number, lag, lead, first_value, last_value, min, max, ema, vwema, exponential moving average]
---

This page provides detailed documentation for each window function. For an introduction to window functions and how they work, see the [Overview](overview.md). For syntax details on the `OVER` clause, see [OVER Clause Syntax](syntax.md).

## Aggregate window functions

These functions respect the frame clause and calculate values over the specified window frame.

### avg()

Calculates the average of values over the window frame. Supports standard arithmetic average, Exponential Moving Average (EMA), and Volume-Weighted Exponential Moving Average (VWEMA).

**Syntax:**
```questdb-sql
-- Standard average
avg(value) OVER (window_definition)

-- Exponential Moving Average (EMA)
avg(value, kind, param) OVER (window_definition)

-- Volume-Weighted Exponential Moving Average (VWEMA)
avg(value, kind, param, volume) OVER (window_definition)
```

**Arguments:**
- `value`: Numeric column to calculate the average of
- `kind` (EMA/VWEMA): Smoothing mode - `'alpha'`, `'period'`, or a time unit (`'second'`, `'minute'`, `'hour'`, `'day'`, `'week'`)
- `param` (EMA/VWEMA): Parameter for the smoothing mode (see below)
- `volume` (VWEMA only): Numeric column representing volume weights

**Return value:**
- The average of `value` for rows in the window frame

**Description:**

`avg()` operates on the window defined by `PARTITION BY`, `ORDER BY`, and frame specification. It respects the frame clause, calculating a separate average for each row based on its corresponding window.

**Example:**
```questdb-sql title="4-row moving average" demo
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
WHERE timestamp IN today();
```

#### Exponential Moving Average (EMA)

The EMA variant applies exponential smoothing, giving more weight to recent values. It supports three smoothing modes:

| Mode | `kind` | `param` | Description |
|------|--------|---------|-------------|
| Direct alpha | `'alpha'` | 0 < α ≤ 1 | Use smoothing factor directly |
| Period-based | `'period'` | N | N-period EMA where α = 2 / (N + 1) |
| Time-weighted | `'second'`, `'minute'`, `'hour'`, `'day'`, `'week'` | τ (tau) | Time-weighted decay where α = 1 - exp(-Δt / τ) |

**EMA formula:**
```
EMA = α × current_value + (1 - α) × previous_EMA
```

**Examples:**
```questdb-sql title="EMA with direct alpha"
SELECT
    symbol,
    price,
    avg(price, 'alpha', 0.2) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS ema_alpha
FROM trades;
```

```questdb-sql title="10-period EMA"
SELECT
    symbol,
    price,
    avg(price, 'period', 10) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS ema_10
FROM trades;
```

```questdb-sql title="Time-weighted EMA with 5-minute decay"
SELECT
    symbol,
    price,
    avg(price, 'minute', 5) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS ema_5min
FROM trades;
```

:::note EMA behavior
- NULL values are skipped; the previous EMA value is preserved
- The first non-NULL value initializes the EMA
- Works with both `TIMESTAMP` and `TIMESTAMP_NS` precision
- EMA ignores the frame clause and operates cumulatively from the first row
:::

#### Volume-Weighted Exponential Moving Average (VWEMA)

VWEMA combines exponential smoothing with volume weighting, useful for financial analysis where trading volume affects price significance.

**VWEMA formula:**
```
numerator   = α × price × volume + (1 - α) × prev_numerator
denominator = α × volume + (1 - α) × prev_denominator
VWEMA       = numerator / denominator
```

For time-weighted mode: `α = 1 - exp(-Δt / τ)`

**Examples:**
```questdb-sql title="VWEMA with direct alpha"
SELECT
    symbol,
    price,
    avg(price, 'alpha', 0.1, volume) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS vwema_alpha
FROM trades;
```

```questdb-sql title="10-period VWEMA"
SELECT
    symbol,
    price,
    avg(price, 'period', 10, amount) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS vwema_10
FROM trades;
```

```questdb-sql title="Time-weighted VWEMA with 1-hour decay"
SELECT
    symbol,
    price,
    avg(price, 'hour', 1, amount) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS vwema_1h
FROM trades;
```

:::note VWEMA behavior
- Rows with NULL price, NULL volume, or zero volume are skipped
- When timestamps are identical (Δt = 0), the row is skipped in time-weighted mode
- VWEMA ignores the frame clause and operates cumulatively from the first row
:::

---

### count()

Counts rows or non-null values over the window frame.

**Syntax:**
```questdb-sql
count(*) OVER (window_definition)
count(value) OVER (window_definition)
```

**Arguments:**
- `*`: Counts all rows in the frame
- `value`: Counts non-null values only

**Return value:**
- Number of rows or non-null values in the window frame

**Example:**
```questdb-sql title="Trades in last second" demo
SELECT
    symbol,
    count(*) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        RANGE BETWEEN '1' SECOND PRECEDING AND CURRENT ROW
    ) AS trades_last_second
FROM trades;
```

---

### sum()

Calculates the sum of values over the window frame. Commonly used for running totals.

**Syntax:**
```questdb-sql
sum(value) OVER (window_definition)
```

**Arguments:**
- `value`: Numeric column (except decimal)

**Return value:**
- The sum of `value` for rows in the window frame

**Example:**
```questdb-sql title="Cumulative amount" demo
SELECT
    symbol,
    amount,
    timestamp,
    sum(amount) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_amount
FROM trades
WHERE timestamp IN today();
```

---

### ksum()

Calculates the sum of values over the window frame using the Kahan summation algorithm for improved floating-point precision. This is particularly useful when summing many floating-point values where standard summation might accumulate rounding errors.

**Syntax:**
```questdb-sql
ksum(value) OVER (window_definition)
```

**Arguments:**
- `value`: Numeric column to sum

**Return value:**
- The sum of `value` for rows in the window frame with improved precision

**Description:**

`ksum()` uses the [Kahan summation algorithm](https://en.wikipedia.org/wiki/Kahan_summation_algorithm) which maintains a running compensation for lost low-order bits. This is useful when summing many floating-point numbers where the standard `sum()` function might accumulate significant rounding errors.

**Example:**
```questdb-sql title="Cumulative sum with Kahan precision" demo
SELECT
    symbol,
    price,
    timestamp,
    ksum(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_price
FROM trades
WHERE timestamp IN today();
```

```questdb-sql title="Sliding window sum with precision"
SELECT
    symbol,
    price,
    ksum(price) OVER (
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS rolling_sum
FROM trades;
```

---

### min()

Returns the minimum value within the window frame.

**Syntax:**
```questdb-sql
min(value) OVER (window_definition)
```

**Arguments:**
- `value`: Numeric column (except decimal)

**Return value:**
- The minimum value (excluding null) in the window frame

**Example:**
```questdb-sql title="Rolling minimum price" demo
SELECT
    symbol,
    price,
    timestamp,
    min(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS lowest_price
FROM trades
WHERE timestamp IN today();
```

---

### max()

Returns the maximum value within the window frame.

**Syntax:**
```questdb-sql
max(value) OVER (window_definition)
```

**Arguments:**
- `value`: Numeric column (except decimal)

**Return value:**
- The maximum value (excluding null) in the window frame

**Example:**
```questdb-sql title="Rolling maximum price" demo
SELECT
    symbol,
    price,
    timestamp,
    max(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS highest_price
FROM trades
WHERE timestamp IN today();
```

---

### first_value()

Returns the first value in the window frame. Supports `IGNORE NULLS` clause.

**Syntax:**
```questdb-sql
first_value(value) [(IGNORE|RESPECT) NULLS]
OVER ([PARTITION BY partition_expression]
      [ORDER BY sort_expression]
      [frame_clause])
```

**Arguments:**
- `value`: Column or expression to get value from
- `IGNORE NULLS` (optional): Skip null values
- `RESPECT NULLS` (default): Include null values

**Return value:**
- The first value in the window frame (or first non-null with `IGNORE NULLS`)

**Example:**
```questdb-sql title="First price in partition" demo
SELECT
    symbol,
    price,
    timestamp,
    first_value(price) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS first_price,
    first_value(price) IGNORE NULLS OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS first_non_null_price
FROM trades
WHERE timestamp IN today();
```

---

### last_value()

Returns the last value in the window frame. Supports `IGNORE NULLS` clause.

**Syntax:**
```questdb-sql
last_value(value) [(IGNORE|RESPECT) NULLS]
OVER ([PARTITION BY partition_expression]
      [ORDER BY sort_expression]
      [frame_clause])
```

**Arguments:**
- `value`: Column or expression to get value from
- `IGNORE NULLS` (optional): Skip null values
- `RESPECT NULLS` (default): Include null values

**Return value:**
- The last value in the window frame (or last non-null with `IGNORE NULLS`)

**Frame behavior:**
- Without `ORDER BY` or frame clause: default is `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`
- With `ORDER BY` but no frame clause: default is `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`

**Example:**
```questdb-sql title="Last value with IGNORE NULLS" demo
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
FROM trades
WHERE timestamp IN today();
```

This example:
- Gets the last price within a 3-row window for each symbol (`last_price`)
- Gets the last non-null price for each symbol (`last_non_null_price`)
- Demonstrates both `RESPECT NULLS` (default) and `IGNORE NULLS` behavior

---

## Ranking functions

These functions assign ranks or row numbers. They ignore the frame clause and operate on the entire partition.

### row_number()

Assigns a unique sequential number to each row within its partition, starting at 1.

**Syntax:**
```questdb-sql
row_number() OVER (window_definition)
```

**Arguments:**
- None required

**Return value:**
- Sequential row number (`long` type)

**Description:**

`row_number()` assigns unique numbers even when rows have equal values in the `ORDER BY` column. The assignment among equal values is non-deterministic.

**Example:**
```questdb-sql title="Number trades sequentially" demo
SELECT
    symbol,
    price,
    timestamp,
    row_number() OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS trade_number
FROM trades
WHERE timestamp IN today();
```

---

### rank()

Assigns ranks within a partition. Rows with equal values get the same rank, with gaps in the sequence.

**Syntax:**
```questdb-sql
rank() OVER (window_definition)
```

**Arguments:**
- None required

**Return value:**
- Rank number (`long` type)

**Description:**

With `rank()`, if two rows tie for rank 2, the next row gets rank 4 (not 3). The rank equals the `row_number` of the first row in its peer group.

**Example:**
```questdb-sql title="Rank by price" demo
SELECT
    symbol,
    price,
    timestamp,
    rank() OVER (
        PARTITION BY symbol
        ORDER BY price DESC
    ) AS price_rank
FROM trades
WHERE timestamp IN today();
```

---

### dense_rank()

Assigns ranks within a partition. Rows with equal values get the same rank, with no gaps in the sequence.

**Syntax:**
```questdb-sql
dense_rank() OVER (window_definition)
```

**Arguments:**
- None required

**Return value:**
- Rank number (`long` type)

**Description:**

Unlike `rank()`, `dense_rank()` produces consecutive rank numbers. If two rows tie for rank 2, the next row gets rank 3.

**Example:**
```questdb-sql title="Dense rank by price" demo
SELECT
    symbol,
    price,
    timestamp,
    dense_rank() OVER (
        PARTITION BY symbol
        ORDER BY price DESC
    ) AS price_rank
FROM trades
WHERE timestamp IN today();
```

---

## Offset functions

These functions access values from other rows relative to the current row. They ignore frame clauses.

### lag()

Accesses data from a previous row without a self-join.

**Syntax:**
```questdb-sql
lag(value [, offset [, default]]) [(IGNORE|RESPECT) NULLS]
OVER ([PARTITION BY partition_expression] [ORDER BY sort_expression])
```

**Arguments:**
- `value`: Column or expression to retrieve
- `offset` (optional): Number of rows back. Default is 1
- `default` (optional): Value when offset exceeds partition bounds. Default is `NULL`
- `IGNORE NULLS` (optional): Skip null values when counting offset
- `RESPECT NULLS` (default): Include null values in offset counting

**Return value:**
- Value from the specified previous row

**Behavior:**
- When `offset` is 0, returns current row value
- Frame clauses (`ROWS`/`RANGE`) are ignored
- Without `ORDER BY`, uses table scan order

**Example:**
```questdb-sql title="Previous price and price change" demo
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
FROM trades
WHERE timestamp IN today();
```

This example:
- Gets the previous price for each symbol (`previous_price`)
- Gets the price from 2 rows back (`price_two_rows_back`)
- Uses 0.0 as default when looking 2 rows back reaches the partition start

---

### lead()

Accesses data from a subsequent row without a self-join.

**Syntax:**
```questdb-sql
lead(value [, offset [, default]]) [(IGNORE|RESPECT) NULLS]
OVER ([PARTITION BY partition_expression] [ORDER BY sort_expression])
```

**Arguments:**
- `value`: Column or expression to retrieve
- `offset` (optional): Number of rows forward. Default is 1
- `default` (optional): Value when offset exceeds partition bounds. Default is `NULL`
- `IGNORE NULLS` (optional): Skip null values when counting offset
- `RESPECT NULLS` (default): Include null values in offset counting

**Return value:**
- Value from the specified following row

**Behavior:**
- When `offset` is 0, returns current row value
- Frame clauses (`ROWS`/`RANGE`) are ignored
- Without `ORDER BY`, uses table scan order

**Example:**
```questdb-sql title="Next price" demo
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
FROM trades
WHERE timestamp IN today();
```

This example:
- Gets the next price for each symbol (`next_price`)
- Gets the price from 2 rows ahead (`price_after_next`)
- Uses 0.0 as default when looking 2 rows ahead reaches the partition end

---

## Examples

### Moving average of best bid price

```questdb-sql title="4-row moving average of best bid" demo
DECLARE @best_bid := bids[1,1]
SELECT
    timestamp,
    symbol,
    @best_bid AS best_bid,
    avg(@best_bid) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS bid_moving_avg
FROM market_data
WHERE timestamp IN today();
```

### Cumulative bid size

```questdb-sql title="Rolling 5-row volume" demo
DECLARE
  @best_bid := bids[1,1],
  @volume_l1 := bids[2,1]
SELECT
    timestamp, symbol,
    @best_bid AS bid_price_l1,
    @volume_l1 AS bid_volume_l1,
    sum(@volume_l1) OVER (
        PARTITION BY symbol ORDER BY timestamp
        ROWS BETWEEN 5 PRECEDING AND CURRENT ROW
    ) AS bid_volume_l1_5rows
FROM market_data
WHERE timestamp IN today();
```

### Time-based rolling sum

```questdb-sql title="1-minute rolling bid volume" demo
DECLARE
    @best_bid := bids[1,1],
    @volume_l1 := bids[2,1]
SELECT
    timestamp,
    sum(@volume_l1) OVER (
        ORDER BY timestamp
        RANGE BETWEEN '1' MINUTE PRECEDING AND CURRENT ROW
    ) AS bid_volume_1min
FROM market_data
WHERE timestamp IN today() AND symbol = 'GBPUSD';
```

### Trade frequency analysis

```questdb-sql title="Trades per minute by side" demo
SELECT
    timestamp,
    symbol,
    COUNT(*) OVER (
        ORDER BY timestamp
        RANGE BETWEEN 60000000 PRECEDING AND CURRENT ROW
    ) AS updates_per_min,
    COUNT(CASE WHEN side = 'buy' THEN 1 END) OVER (
        ORDER BY timestamp
        RANGE BETWEEN 60000000 PRECEDING AND CURRENT ROW
    ) AS buys_per_minute,
    COUNT(CASE WHEN side = 'sell' THEN 1 END) OVER (
        ORDER BY timestamp
        RANGE BETWEEN 60000000 PRECEDING AND CURRENT ROW
    ) AS sells_per_minute
FROM trades
WHERE timestamp IN today() AND symbol = 'BTC-USD';
```

---

## Notes

- The order of rows in the result set is not guaranteed to be consistent across query executions. Use an `ORDER BY` clause outside the `OVER` clause to ensure consistent ordering.
- Ranking functions (`row_number`, `rank`, `dense_rank`) and offset functions (`lag`, `lead`) ignore frame specifications.
- For time-based calculations, consider using `RANGE` frames with timestamp columns.
