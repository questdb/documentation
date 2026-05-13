---
title: WINDOW JOIN keyword
sidebar_label: WINDOW JOIN
description:
  Learn how to use WINDOW JOIN for efficient time-based aggregation across
  related tables in QuestDB.
---

WINDOW JOIN is a SQL join type that efficiently aggregates data from a related
table within a time-based window around each row. It is particularly useful for
financial time-series analysis, such as calculating rolling statistics from
price feeds, computing moving averages, or aggregating sensor readings within
time windows.

It is a variant of the [`JOIN` keyword](/docs/query/sql/join/) and shares
many of its execution traits.

:::note WINDOW JOIN vs Window Functions
Despite the similar name, WINDOW JOIN and [window functions](/docs/query/functions/window-functions/overview/) serve different purposes:

- **WINDOW JOIN**: Aggregates data from a *different table* within a time window around each row. Uses `RANGE BETWEEN` to define a time-based window relative to each row's timestamp.
- **Window functions**: Perform calculations across rows *within the same table* using the `OVER` clause with `PARTITION BY`, `ORDER BY`, and frame specifications.

Use WINDOW JOIN when you need to correlate and aggregate data across two time-series tables. Use window functions for calculations within a single table.
:::

## Syntax

```questdb-sql
SELECT
    left_columns,
    aggregate_function(right_column) AS result
FROM left_table [alias]
WINDOW JOIN right_table [alias]
    [ON join_condition]
    RANGE BETWEEN <lo_bound> [unit] AND <hi_bound> [unit]
    [INCLUDE PREVAILING | EXCLUDE PREVAILING]
[WHERE filter_on_left]
[ORDER BY ...]
```

### RANGE clause

The `RANGE` clause defines the time window relative to each left row's
timestamp. Both boundaries are inclusive.

```questdb-sql
RANGE BETWEEN <value> <unit> PRECEDING AND <value> <unit> FOLLOWING
RANGE BETWEEN <value> <unit> PRECEDING AND <value> <unit> PRECEDING  -- past window
RANGE BETWEEN <value> <unit> FOLLOWING AND <value> <unit> FOLLOWING  -- future window
```

Each boundary `<value>` can be:
- A **static constant** (e.g., `1`, `30`)
- A **column reference** from the left table (e.g., `t.lookback`)
- An **expression** referencing left table columns (e.g., `2 * t.lookback`)

Either or both boundaries can be dynamic. For example, one boundary can be a
column reference while the other remains a static constant.

Supported time units:

- `nanoseconds`
- `microseconds`
- `milliseconds`
- `seconds`
- `minutes`
- `hours`
- `days`

When a time unit is present, the value is scaled to the left table's designated
timestamp resolution at runtime. When omitted, the raw integer value is
interpreted in the left table's native timestamp resolution.

:::note

`UNBOUNDED PRECEDING` and `UNBOUNDED FOLLOWING` are not supported in WINDOW
JOIN.

:::

#### Dynamic window bounds

Dynamic window bounds allow each left table row to define its own window size based
on its data. This is useful when different rows require different lookback or
lookahead periods.

**Rules for dynamic bounds:**

- Boundary expressions must evaluate to an **integer** type
- Expressions must only reference **left table** columns — right table column
  references are not allowed
- Bound expressions must evaluate to **non-negative** values — negative results
  are clamped to zero, equivalent to `CURRENT ROW`. To reference rows before the
  current row, use a positive value with `PRECEDING`
- **NULL values** cause the row to produce NULL aggregates — the row is skipped

:::note

Dynamic window bounds disable the Fast Join (symbol-keyed) and vectorized (SIMD)
execution paths. Queries with an `ON` key equality clause fall back to the
general join path with a join filter instead. For best performance, prefer
static bounds when a fixed window size is sufficient.

:::

### INCLUDE/EXCLUDE PREVAILING

- `INCLUDE PREVAILING` (default): Includes right table rows within the time window
  plus the most recent right row with a timestamp equal to or earlier than the
  window start (similar to [ASOF JOIN](/docs/query/sql/asof-join/) behavior),
  useful for "last known value" scenarios
- `EXCLUDE PREVAILING`: Only includes right table rows strictly within the time window

## Requirements

1. Both tables must have [designated timestamps](/docs/concepts/designated-timestamp/)
   and be partitioned
2. The right table must be a direct table reference, not a subquery
3. Aggregate functions are required - you cannot select non-aggregated columns
   from the right table
4. Symbol-based join conditions enable "Fast Join" optimization when matching on
   symbol columns

## Mixed-precision timestamps

The left and right tables can use different timestamp resolutions (e.g.,
`TIMESTAMP` with microseconds and `TIMESTAMP_NS` with nanoseconds). QuestDB
aligns the timestamps internally — no explicit casting is needed.

## Aggregate functions

WINDOW JOIN supports all aggregate functions on the right table. However, the
following functions use SIMD-optimized aggregation and will run faster:

- `sum()` - Sum of values
- `avg()` - Average/mean
- `count()` - Count of matching rows
- `min()` / `max()` - Minimum/maximum values
- `first()` / `last()` - First/last value in the window
- `first_not_null()` / `last_not_null()` - First/last non-null value

When only these optimized functions are used, queries benefit from vectorized
execution.

## Examples

The examples below use the [QuestDB demo](https://demo.questdb.io/) tables:

- `fx_trades` - FX trade executions (symbol, side, price, quantity, ecn, timestamp)
- `core_price` - ECN-level quotes (symbol, ecn, bid_price, ask_price, timestamp)
- `market_data` - consolidated order book snapshots (symbol, best_bid, best_ask, timestamp)

### Basic example: rolling average quote

Calculate the average bid from `core_price` within +-5 seconds of each trade:

```questdb-sql title="Rolling average bid around each trade" demo
SELECT
    t.symbol,
    t.price,
    t.timestamp,
    avg(c.bid_price) AS avg_bid
FROM fx_trades t
WINDOW JOIN core_price c
    ON (t.symbol = c.symbol)
    RANGE BETWEEN 5 seconds PRECEDING AND 5 seconds FOLLOWING
    EXCLUDE PREVAILING
WHERE t.symbol = 'EURUSD'
    AND t.timestamp IN '$now-1h..$now'
ORDER BY t.timestamp
LIMIT -20;
```

### Symbol-based Fast Join

When joining on symbol columns, QuestDB uses an optimized "Fast Join" path for
improved performance:

```questdb-sql title="Fast Join with symbol matching" demo
SELECT
    t.symbol,
    t.timestamp,
    avg(c.bid_price) AS avg_bid,
    count() AS num_quotes
FROM fx_trades t
WINDOW JOIN core_price c
    ON (t.symbol = c.symbol)
    RANGE BETWEEN 5 seconds PRECEDING AND 5 seconds FOLLOWING
    EXCLUDE PREVAILING
WHERE t.symbol = 'EURUSD'
    AND t.timestamp IN '$now-1h..$now'
LIMIT -20;
```

### With additional join filters

You can add additional conditions to the `ON` clause to filter the right table.
Here we restrict to quotes from a specific ECN:

```questdb-sql title="WINDOW JOIN with ECN filter" demo
SELECT
    t.symbol,
    t.timestamp,
    avg(c.bid_price) AS avg_bid
FROM fx_trades t
WINDOW JOIN core_price c
    ON (t.symbol = c.symbol) AND c.ecn = t.ecn
    RANGE BETWEEN 2 seconds PRECEDING AND 2 seconds FOLLOWING
    EXCLUDE PREVAILING
WHERE t.symbol = 'EURUSD'
    AND t.timestamp IN '$now-1h..$now'
ORDER BY t.timestamp
LIMIT -20;
```

### Past-only window

Look back at a historical window before each trade - useful for pre-trade
analytics:

```questdb-sql title="Historical window (2 to 1 seconds before)" demo
SELECT
    t.symbol,
    t.timestamp,
    avg(c.bid_price) AS pre_trade_bid
FROM fx_trades t
WINDOW JOIN core_price c
    ON (t.symbol = c.symbol)
    RANGE BETWEEN 2 seconds PRECEDING AND 1 second PRECEDING
    EXCLUDE PREVAILING
WHERE t.symbol = 'EURUSD'
    AND t.timestamp IN '$now-1h..$now'
LIMIT -20;
```

### Future-only window

Look ahead at a future window after each trade - useful for post-trade impact
analysis:

```questdb-sql title="Future window (1 to 5 seconds after)" demo
SELECT
    t.symbol,
    t.timestamp,
    avg(c.bid_price) AS post_trade_bid
FROM fx_trades t
WINDOW JOIN core_price c
    ON (t.symbol = c.symbol)
    RANGE BETWEEN 1 second FOLLOWING AND 5 seconds FOLLOWING
    EXCLUDE PREVAILING
WHERE t.symbol = 'EURUSD'
    AND t.timestamp IN '$now-1h..$now'
LIMIT -20;
```

### Cross-table aggregation (no symbol match)

When the left table is already filtered to a single symbol, you can omit the
`ON` clause to count all quotes in the window regardless of their symbol.
This shows market-wide quoting activity around each EURUSD trade:

```questdb-sql title="Aggregate all quotes in window" demo
SELECT
    t.symbol,
    t.timestamp,
    count() AS total_quotes
FROM fx_trades t
WINDOW JOIN core_price c
    RANGE BETWEEN 1 second PRECEDING AND 1 second FOLLOWING
    EXCLUDE PREVAILING
WHERE t.symbol = 'EURUSD'
    AND t.timestamp IN '$now-1h..$now'
LIMIT -20;
```

### Chained WINDOW JOINs

Chain multiple WINDOW JOINs to aggregate from different tables with different
time windows. Here we compare the consolidated book (1-second window) with
ECN-level quotes (5-second window) around each trade:

```questdb-sql title="Chained WINDOW JOINs" demo
SELECT
    t.symbol,
    t.timestamp,
    t.price,
    avg(m.best_bid) AS consolidated_bid_1s,
    avg(c.bid_price) AS ecn_bid_5s
FROM fx_trades t
WINDOW JOIN market_data m
    ON (t.symbol = m.symbol)
    RANGE BETWEEN 1 second PRECEDING AND 1 second FOLLOWING
WINDOW JOIN core_price c
    ON (t.symbol = c.symbol)
    RANGE BETWEEN 5 seconds PRECEDING AND 5 seconds FOLLOWING
WHERE t.symbol = 'EURUSD'
    AND t.timestamp IN '$now-1h..$now'
LIMIT -20;
```

Each WINDOW JOIN operates independently, allowing you to aggregate data from
multiple related tables with different time windows in a single query.

### Dynamic window bounds

Use column references or expressions as window boundaries so each row can
define its own window size. The examples below assume that `fx_trades` has
additional `lookback` and `lookahead` integer columns (not present in the demo
dataset):

```questdb-sql title="Per-row window size from column values"
SELECT
    t.symbol,
    t.timestamp,
    t.lookback,
    t.lookahead,
    avg(c.bid_price) AS avg_bid
FROM fx_trades t
WINDOW JOIN core_price c
    ON (t.symbol = c.symbol)
    RANGE BETWEEN t.lookback seconds PRECEDING AND t.lookahead seconds FOLLOWING
WHERE t.symbol = 'EURUSD'
    AND t.timestamp IN '$now-1h..$now';
```

You can mix static and dynamic bounds. Here only the lower bound is dynamic:

```questdb-sql title="Dynamic lower bound, static upper bound"
SELECT
    t.symbol,
    t.timestamp,
    avg(c.bid_price) AS avg_bid
FROM fx_trades t
WINDOW JOIN core_price c
    ON (t.symbol = c.symbol)
    RANGE BETWEEN t.lookback seconds PRECEDING AND 5 seconds FOLLOWING
WHERE t.symbol = 'EURUSD'
    AND t.timestamp IN '$now-1h..$now';
```

Expressions referencing left table columns are also supported:

```questdb-sql title="Expression-based dynamic bound"
SELECT
    t.symbol,
    t.timestamp,
    avg(c.bid_price) AS avg_bid
FROM fx_trades t
WINDOW JOIN core_price c
    ON (t.symbol = c.symbol)
    RANGE BETWEEN 2 * t.lookback seconds PRECEDING AND 10 seconds FOLLOWING
WHERE t.symbol = 'EURUSD'
    AND t.timestamp IN '$now-1h..$now';
```

### Using EXCLUDE PREVAILING

Exclude the prevailing value to only aggregate rows strictly within the time
window:

```questdb-sql title="WINDOW JOIN excluding prevailing value" demo
SELECT
    t.symbol,
    t.timestamp,
    avg(c.bid_price) AS avg_bid
FROM fx_trades t
WINDOW JOIN core_price c
    ON (t.symbol = c.symbol)
    RANGE BETWEEN 1 second PRECEDING AND 1 second FOLLOWING
    EXCLUDE PREVAILING
WHERE t.symbol = 'EURUSD'
    AND t.timestamp IN '$now-1h..$now'
LIMIT -20;
```

This is useful when you want strict window boundaries and do not need the last
known value before the window starts.

### With left table filter

Filter left table rows using a `WHERE` clause:

```questdb-sql title="WINDOW JOIN with WHERE filter" demo
SELECT
    t.symbol,
    t.timestamp,
    avg(c.bid_price) AS avg_bid
FROM fx_trades t
WINDOW JOIN core_price c
    ON (t.symbol = c.symbol)
    RANGE BETWEEN 1 second PRECEDING AND 1 second FOLLOWING
    EXCLUDE PREVAILING
WHERE t.symbol = 'EURUSD'
    AND t.side = 'buy'
    AND t.timestamp IN '$now-1h..$now'
ORDER BY t.timestamp
LIMIT -20;
```

## Query plan analysis

Use `EXPLAIN` to see the execution plan and verify optimization:

```questdb-sql title="Analyze WINDOW JOIN execution plan" demo
EXPLAIN SELECT t.symbol, avg(c.bid_price)
FROM fx_trades t
WINDOW JOIN core_price c ON (t.symbol = c.symbol)
RANGE BETWEEN 1 second PRECEDING AND 1 second FOLLOWING
EXCLUDE PREVAILING
WHERE t.symbol = 'EURUSD'
    AND t.timestamp IN '$now-1h..$now';
```

Look for these indicators in the plan:

- **Async Window Fast Join**: Optimized parallel execution with symbol-based
  join
- **Async Window Join**: Standard parallel execution
- **vectorized: true**: Indicates SIMD-optimized aggregation

## Limitations

1. `UNBOUNDED PRECEDING` and `UNBOUNDED FOLLOWING` are not supported
2. The right table must be a direct table, not a subquery
3. Cannot reference non-aggregated right table columns in `SELECT`
4. Window high boundary cannot be less than low boundary
5. Aggregate functions cannot reference columns from both tables simultaneously
6. WINDOW JOIN can be combined with another WINDOW JOIN, but not with other JOIN
   types
7. **`GROUP BY` and window functions are not supported with WINDOW JOIN** - use a CTE or subquery instead

### GROUP BY workaround

WINDOW JOIN cannot be combined with `GROUP BY` in the same query. To aggregate WINDOW JOIN results, wrap the join in a CTE first:

```questdb-sql title="Incorrect - GROUP BY with WINDOW JOIN not supported"
-- This will NOT work:
SELECT
    t.symbol,
    count(*) AS trade_count,
    avg(first(c.bid_price) - t.price) AS avg_slippage
FROM fx_trades t
WINDOW JOIN core_price c ON (t.symbol = c.symbol)
    RANGE BETWEEN 10 milliseconds FOLLOWING AND 10 milliseconds FOLLOWING
GROUP BY t.symbol;  -- ERROR: GROUP BY not supported
```

```questdb-sql title="Correct - use CTE then GROUP BY" demo
WITH trades_with_future_bid AS (
    SELECT
        t.symbol,
        t.price,
        first(c.bid_price) AS future_bid
    FROM fx_trades t
    WINDOW JOIN core_price c ON (t.symbol = c.symbol)
        RANGE BETWEEN 10 milliseconds FOLLOWING AND 10 milliseconds FOLLOWING
        INCLUDE PREVAILING
    WHERE t.timestamp IN '$now-1h..$now'
)
SELECT
    symbol,
    count(*) AS trade_count,
    avg(future_bid - price) AS avg_slippage
FROM trades_with_future_bid
GROUP BY symbol;
```

This pattern applies to any aggregation over WINDOW JOIN results - always perform the join first in a CTE, then aggregate in the outer query.

## Performance tips

1. **Use symbol-based joins**: When possible, join on symbol columns to enable
   the Fast Join optimization
2. **Prefer static bounds**: Static (constant) bounds enable the Fast Join and
   vectorized (SIMD) execution paths. Dynamic window bounds disable these
   optimizations, so use them only when per-row window sizes are needed
3. **Narrow time windows**: Smaller windows mean less data to aggregate
4. **Filter the left table**: Use `WHERE` clauses to reduce the number of rows
   processed
5. **Parallel execution**: WINDOW JOIN automatically leverages parallel
   execution based on your worker configuration
