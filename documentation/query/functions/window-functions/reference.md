---
title: Window Functions Reference
sidebar_label: Function Reference
description: Complete reference for all window functions in QuestDB including avg, sum, ksum, count, rank, dense_rank, percent_rank, row_number, lag, lead, EMA, VWEMA, and more.
keywords: [window functions, avg, sum, ksum, count, rank, dense_rank, percent_rank, row_number, lag, lead, first_value, last_value, min, max, ema, vwema, exponential moving average]
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
- `value`: Numeric column (`short`, `int`, `long`, `float`, `double`) to calculate the average of
- `kind` (EMA/VWEMA): Smoothing mode - `'alpha'`, `'period'`, or a time unit (`'second'`, `'minute'`, `'hour'`, `'day'`, `'week'`)
- `param` (EMA/VWEMA): Parameter for the smoothing mode (see below)
- `volume` (VWEMA only): Numeric column representing volume weights

**Return value:**
- `double` - The average of `value` for rows in the window frame

**Description:**

`avg()` operates on the window defined by `PARTITION BY`, `ORDER BY`, and frame specification. It respects the frame clause, calculating a separate average for each row based on its corresponding window.

Use `avg()` as a window function when you need to compare individual values against their surrounding context. Common use cases include:

- **Smoothing noisy data**: Calculate moving averages to reduce short-term fluctuations and highlight trends
- **Anomaly detection**: Compare each value to its rolling average to identify unusual spikes or drops
- **Baseline comparison**: Show how each data point differs from the average of its partition
- **Technical analysis**: Compute moving averages for financial indicators like price trends

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
WHERE timestamp IN '[$today]';
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
```questdb-sql title="EMA with direct alpha" demo
SELECT
    symbol,
    price,
    timestamp,
    avg(price, 'alpha', 0.2) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS ema_alpha
FROM trades
WHERE timestamp IN '[$today]';
```

```questdb-sql title="10-period EMA" demo
SELECT
    symbol,
    price,
    timestamp,
    avg(price, 'period', 10) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS ema_10
FROM trades
WHERE timestamp IN '[$today]';
```

```questdb-sql title="Time-weighted EMA with 5-minute decay" demo
SELECT
    symbol,
    price,
    timestamp,
    avg(price, 'minute', 5) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS ema_5min
FROM trades
WHERE timestamp IN '[$today]';
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
```questdb-sql title="VWEMA with direct alpha" demo
SELECT
    symbol,
    price,
    timestamp,
    avg(price, 'alpha', 0.1, amount) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS vwema_alpha
FROM trades
WHERE timestamp IN '[$today]';
```

```questdb-sql title="10-period VWEMA" demo
SELECT
    symbol,
    price,
    timestamp,
    avg(price, 'period', 10, amount) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS vwema_10
FROM trades
WHERE timestamp IN '[$today]';
```

```questdb-sql title="Time-weighted VWEMA with 1-hour decay" demo
SELECT
    symbol,
    price,
    timestamp,
    avg(price, 'hour', 1, amount) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
    ) AS vwema_1h
FROM trades
WHERE timestamp IN '[$today]';
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
- `long` - Number of rows or non-null values in the window frame

**Description:**

Use `count()` as a window function when you need to track frequency or density of events over time. Common use cases include:

- **Activity monitoring**: Count events in a sliding time window (e.g., requests per second)
- **Rate limiting detection**: Identify periods with unusually high event frequency
- **Data density analysis**: Track how many data points exist within rolling intervals
- **Cumulative event counting**: Track total events up to each point in time

**Example:**
```questdb-sql title="Trades in last second" demo
SELECT
    symbol,
    timestamp,
    count(*) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        RANGE BETWEEN '1' SECOND PRECEDING AND CURRENT ROW
    ) AS trades_last_second
FROM trades
WHERE timestamp IN '[$today]';
```

---

### sum()

Calculates the sum of values over the window frame. Commonly used for running totals.

**Syntax:**
```questdb-sql
sum(value) OVER (window_definition)
```

**Arguments:**
- `value`: Numeric column (`short`, `int`, `long`, `float`, `double`)

**Return value:**
- `double` - The sum of `value` for rows in the window frame

**Description:**

Use `sum()` as a window function when you need to track accumulation or totals over a sequence. Common use cases include:

- **Running totals**: Track cumulative values like total volume traded throughout the day
- **Rolling sums**: Calculate sums over sliding windows (e.g., volume in the last 5 minutes)
- **Budget tracking**: Show how spending accumulates against a budget over time
- **Position tracking**: Calculate net position by summing buys and sells

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
WHERE timestamp IN '[$today]';
```

---

### ksum()

Calculates the sum of values over the window frame using the Kahan summation algorithm for improved floating-point precision. This is particularly useful when summing many floating-point values where standard summation might accumulate rounding errors.

**Syntax:**
```questdb-sql
ksum(value) OVER (window_definition)
```

**Arguments:**
- `value`: Numeric column (`short`, `int`, `long`, `float`, `double`) to sum

**Return value:**
- `double` - The sum of `value` for rows in the window frame with improved precision

**Description:**

`ksum()` uses the [Kahan summation algorithm](https://en.wikipedia.org/wiki/Kahan_summation_algorithm) which maintains a running compensation for lost low-order bits. This is useful when summing many floating-point numbers where the standard `sum()` function might accumulate significant rounding errors.

Use `ksum()` instead of `sum()` when precision matters. Common use cases include:

- **Financial calculations**: Summing many small monetary values where rounding errors compound
- **Scientific data**: Aggregating sensor readings or measurements requiring high precision
- **Large datasets**: Running totals over millions of rows where standard floating-point errors accumulate
- **Reconciliation**: When totals must match exactly with external systems

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
WHERE timestamp IN '[$today]';
```

```questdb-sql title="Sliding window sum with precision" demo
SELECT
    symbol,
    price,
    timestamp,
    ksum(price) OVER (
        ORDER BY timestamp
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS rolling_sum
FROM trades
WHERE timestamp IN '[$today]';
```

---

### min()

Returns the minimum value within the window frame.

**Syntax:**
```questdb-sql
min(value) OVER (window_definition)
```

**Arguments:**
- `value`: Numeric column (`short`, `int`, `long`, `float`, `double`)

**Return value:**
- Same type as input - The minimum value (excluding null) in the window frame

**Description:**

Use `min()` as a window function when you need to track lowest values over a range. Common use cases include:

- **Support levels**: Track the lowest price within a rolling window for technical analysis
- **Drawdown calculation**: Find the minimum value since a peak to measure decline
- **Quality thresholds**: Identify the worst reading within each time period
- **Intraday lows**: Track the lowest price per symbol throughout the trading day

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
WHERE timestamp IN '[$today]';
```

---

### max()

Returns the maximum value within the window frame.

**Syntax:**
```questdb-sql
max(value) OVER (window_definition)
```

**Arguments:**
- `value`: Numeric column (`short`, `int`, `long`, `float`, `double`)

**Return value:**
- Same type as input - The maximum value (excluding null) in the window frame

**Description:**

Use `max()` as a window function when you need to track highest values over a range. Common use cases include:

- **Resistance levels**: Track the highest price within a rolling window for technical analysis
- **Peak detection**: Find the maximum value to identify local or global peaks
- **High-water marks**: Track the highest value achieved up to each point in time
- **Intraday highs**: Track the highest price per symbol throughout the trading day

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
WHERE timestamp IN '[$today]';
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
- Same type as input - The first value in the window frame (or first non-null with `IGNORE NULLS`)

**Description:**

Use `first_value()` when you need to reference the starting point of a sequence. Common use cases include:

- **Opening price**: Get the first price of each trading session to calculate daily returns
- **Baseline comparison**: Compare each row to the first value in its partition
- **Session start**: Reference the initial state at the beginning of each user session
- **Gap filling**: Use `IGNORE NULLS` to carry forward the last known value when data is sparse

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
WHERE timestamp IN '[$today]';
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
- Same type as input - The last value in the window frame (or last non-null with `IGNORE NULLS`)

**Description:**

Use `last_value()` when you need to reference the most recent or ending value in a sequence. Common use cases include:

- **Closing price**: Get the last price in each time bucket for OHLC calculations
- **Current state**: Access the most recent value in a rolling window
- **Forward filling**: Use `IGNORE NULLS` to get the most recent non-null value for sparse data
- **End-of-period values**: Capture the final state at partition boundaries

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
WHERE timestamp IN '[$today]';
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

Use `row_number()` when you need unique sequential identifiers within groups. Common use cases include:

- **Pagination**: Assign row numbers to implement efficient pagination over query results
- **Deduplication**: Select only the first row from each group (where `row_number() = 1`)
- **Top-N queries**: Get the top N records per category by filtering on row number
- **Sequence generation**: Create sequential IDs within each partition for ordering or reference

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
WHERE timestamp IN '[$today]';
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

Use `rank()` when ties should share a rank and you want gaps to reflect the true position. Common use cases include:

- **Competition ranking**: Assign standings where ties share a position (1st, 2nd, 2nd, 4th)
- **Leaderboards**: Rank scores where tied values get the same rank
- **Percentile buckets**: Group values by rank to create percentile bands
- **Top performers**: Identify all items tied for top positions

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
WHERE timestamp IN '[$today]';
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

Use `dense_rank()` when you need consecutive rank values without gaps. Common use cases include:

- **Category assignment**: Assign items to numbered tiers (tier 1, tier 2, tier 3) based on value
- **Top-N distinct values**: Find rows with the N highest distinct values (not N highest rows)
- **Medal ranking**: Assign places where you always have a 3rd place even if 1st is tied
- **Bucketing**: Create a fixed number of groups based on ordered values

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
WHERE timestamp IN '[$today]';
```

---

### percent_rank()

Returns the relative rank of the current row within its partition as a value between 0 and 1.

**Syntax:**
```questdb-sql
percent_rank() OVER (window_definition)
```

**Arguments:**
- None required

**Return value:**
- Relative rank as a `double` between 0 and 1

**Description:**

`percent_rank()` calculates the relative rank using the formula:

```
(rank - 1) / (total_rows - 1)
```

Where `rank` is the value that would be returned by `rank()` for the same row. This produces values from 0 (first row) to 1 (last row).

Use `percent_rank()` when you need to understand where a value falls within a distribution as a percentage rather than an absolute position. Common use cases include:

- **Percentile analysis**: Identify which trades are in the top 10% by price (`percent_rank < 0.1`)
- **Outlier detection**: Flag values in the extreme ends of the distribution
- **Normalization**: Convert rankings to a 0-1 scale for comparison across different partition sizes
- **Relative performance**: Compare how an asset's price ranks relative to its historical range

Special cases:
- Returns 0 if there is only one row in the partition
- Without `ORDER BY`, all rows are peers with rank 1, so `percent_rank` returns 0 for all rows

**Example:**
```questdb-sql title="Relative price rank per symbol" demo
SELECT
    symbol,
    price,
    timestamp,
    percent_rank() OVER (
        PARTITION BY symbol
        ORDER BY price DESC
    ) AS price_percentile
FROM trades
WHERE timestamp IN '[$today]';
```

```questdb-sql title="Compare rank functions" demo
SELECT
    symbol,
    price,
    timestamp,
    rank() OVER (ORDER BY price DESC) AS rank,
    percent_rank() OVER (ORDER BY price DESC) AS percent_rank
FROM trades
WHERE timestamp IN '[$today]'
    AND symbol = 'BTC-USDT';
```

| symbol | price | rank | percent_rank |
|--------|-------|------|--------------|
| BTC-USDT | 105 | 1 | 0.0 |
| BTC-USDT | 103 | 2 | 0.25 |
| BTC-USDT | 101 | 3 | 0.5 |
| BTC-USDT | 101 | 3 | 0.5 |
| BTC-USDT | 99 | 5 | 1.0 |

In this example, `percent_rank` shows where each price falls relative to others: 0.0 means highest price, 1.0 means lowest, and 0.5 means middle of the distribution. Tied values (both 101) receive the same percent rank.

---

### Comparing ranking functions

The following table shows how all four ranking functions behave on the same data, ordered by price descending:

| price | row_number | rank | dense_rank | percent_rank |
|-------|------------|------|------------|--------------|
| 105 | 1 | 1 | 1 | 0.0 |
| 103 | 2 | 2 | 2 | 0.25 |
| 101 | 3 | 3 | 3 | 0.5 |
| 101 | 4 | 3 | 3 | 0.5 |
| 99 | 5 | 5 | 4 | 1.0 |

Key differences:
- **`row_number()`**: Always unique, sequential (1, 2, 3, 4, 5). Ties get different numbers (non-deterministic order).
- **`rank()`**: Ties share the same rank, with gaps after ties (1, 2, 3, 3, 5). The gap reflects the true position.
- **`dense_rank()`**: Ties share the same rank, no gaps (1, 2, 3, 3, 4). Consecutive integers only.
- **`percent_rank()`**: Relative position as 0-1 value. Ties share the same value. Formula: `(rank - 1) / (total_rows - 1)`.

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
- Same type as input - Value from the specified previous row

**Description:**

Use `lag()` when you need to compare the current row with previous values. Common use cases include:

- **Change detection**: Calculate the difference between current and previous values (price change, delta)
- **Trend analysis**: Compare current readings to historical values to identify trends
- **Event sequencing**: Access the previous event's data without a self-join
- **Gap detection**: Identify missing time periods by comparing timestamps with the previous row

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
WHERE timestamp IN '[$today]';
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
- Same type as input - Value from the specified following row

**Description:**

Use `lead()` when you need to look ahead to future values in the sequence. Common use cases include:

- **Forward-looking analysis**: Calculate time until the next event or price change
- **Session boundaries**: Detect when a session ends by checking if the next row belongs to a different session
- **Predictive features**: Access future values for ML feature engineering (on historical data)
- **Duration calculation**: Compute how long until the next state change

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
WHERE timestamp IN '[$today]';
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
WHERE timestamp IN '[$today]';
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
WHERE timestamp IN '[$today]';
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
WHERE timestamp IN '[$today]' AND symbol = 'GBPUSD';
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
WHERE timestamp IN '[$today]' AND symbol = 'BTC-USDT';
```

---

## Notes

- The order of rows in the result set is not guaranteed to be consistent across query executions. Use an `ORDER BY` clause outside the `OVER` clause to ensure consistent ordering.
- Ranking functions (`row_number`, `rank`, `dense_rank`, `percent_rank`) and offset functions (`lag`, `lead`) ignore frame specifications.
- For time-based calculations, consider using `RANGE` frames with timestamp columns.
- Aggregate window functions (`avg`, `sum`, `ksum`, `count`, `min`, `max`) support numeric types: `short`, `int`, `long`, `float`, `double`. The `decimal` type is not supported.
- `ntile()` and `cume_dist()` are not currently supported.
