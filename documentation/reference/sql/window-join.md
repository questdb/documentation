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

It is a variant of the [`JOIN` keyword](/docs/reference/sql/join/) and shares
many of its execution traits.

## Syntax

```questdb-sql
SELECT
    left_columns,
    aggregate_function(right_column) AS result
FROM left_table [alias]
WINDOW JOIN right_table [alias]
    [ON join_condition]
    RANGE BETWEEN <lo_bound> AND <hi_bound>
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

Supported time units:

- `microseconds`
- `milliseconds`
- `seconds`
- `minutes`
- `hours`
- `days`

:::note

`UNBOUNDED PRECEDING` and `UNBOUNDED FOLLOWING` are not supported in WINDOW
JOIN.

:::

### INCLUDE/EXCLUDE PREVAILING

- `INCLUDE PREVAILING` (default): Includes right table rows within the time window
  plus the most recent right row with a timestamp equal to or earlier than the
  window start (similar to [ASOF JOIN](/docs/reference/sql/asof-join/) behavior),
  useful for "last known value" scenarios
- `EXCLUDE PREVAILING`: Only includes right table rows strictly within the time window

## Requirements

1. Both tables must have [designated timestamps](/docs/concept/designated-timestamp/)
   and be partitioned
2. The right table must be a direct table reference, not a subquery
3. Aggregate functions are required - you cannot select non-aggregated columns
   from the right table
4. Symbol-based join conditions enable "Fast Join" optimization when matching on
   symbol columns

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

For the following examples, consider two tables:

- `trades`: A table of executed trades with `sym`, `price`, and `ts` columns
- `prices`: A table of price quotes with `sym`, `price`, `bid`, and `ts` columns

### Basic example: Rolling sum

Calculate the sum of prices from the `prices` table within ±1 minute of each
trade:

```questdb-sql title="Rolling sum within a time window"
SELECT
    t.sym,
    t.price,
    t.ts,
    sum(p.price) AS window_sum
FROM trades t
WINDOW JOIN prices p
    ON (t.sym = p.sym)
    RANGE BETWEEN 1 minute PRECEDING AND 1 minute FOLLOWING
    EXCLUDE PREVAILING
ORDER BY t.ts;
```

### Symbol-based Fast Join

When joining on symbol columns, QuestDB uses an optimized "Fast Join" path for
improved performance:

```questdb-sql title="Fast Join with symbol matching"
SELECT
    t.sym,
    t.ts,
    avg(p.bid) AS avg_bid,
    count() AS num_prices
FROM trades t
WINDOW JOIN prices p
    ON (t.sym = p.sym)
    RANGE BETWEEN 5 seconds PRECEDING AND 5 seconds FOLLOWING
    EXCLUDE PREVAILING;
```

### With additional join filters

You can add additional conditions to the `ON` clause to filter the right table:

```questdb-sql title="WINDOW JOIN with price filter"
SELECT
    t.sym,
    t.ts,
    avg(p.price) AS avg_price
FROM trades t
WINDOW JOIN prices p
    ON (t.sym = p.sym) AND p.price < 300
    RANGE BETWEEN 2 minutes PRECEDING AND 2 minutes FOLLOWING
    EXCLUDE PREVAILING
ORDER BY t.ts;
```

### Past-only window

Look back at a historical window before each trade:

```questdb-sql title="Historical window (2 to 1 minutes before)"
SELECT
    t.sym,
    t.ts,
    sum(p.price) AS past_sum
FROM trades t
WINDOW JOIN prices p
    ON (t.sym = p.sym)
    RANGE BETWEEN 2 minutes PRECEDING AND 1 minute PRECEDING
    EXCLUDE PREVAILING;
```

### Future-only window

Look ahead at a future window after each trade:

```questdb-sql title="Future window (1 to 2 minutes after)"
SELECT
    t.sym,
    t.ts,
    sum(p.price) AS future_sum
FROM trades t
WINDOW JOIN prices p
    ON (t.sym = p.sym)
    RANGE BETWEEN 1 minute FOLLOWING AND 2 minutes FOLLOWING
    EXCLUDE PREVAILING;
```

### Cross-table aggregation (no symbol match)

Aggregate all prices within the time window regardless of symbol:

```questdb-sql title="Aggregate all prices in window"
SELECT
    t.sym,
    t.ts,
    count() AS total_prices
FROM trades t
WINDOW JOIN prices p
    RANGE BETWEEN 1 minute PRECEDING AND 1 minute FOLLOWING
    EXCLUDE PREVAILING;
```

### Chained WINDOW JOINs

You can chain multiple WINDOW JOINs together to aggregate from different tables
or with different time windows:

```questdb-sql title="Chained WINDOW JOINs"
SELECT
    t.sym,
    t.ts,
    t.price,
    sum(p.bid) AS sum_bids,
    avg(q.ask) AS avg_asks
FROM trades t
WINDOW JOIN bids p
    ON (t.sym = p.sym)
    RANGE BETWEEN 1 minute PRECEDING AND 1 minute FOLLOWING
WINDOW JOIN asks q
    ON (t.sym = q.sym)
    RANGE BETWEEN 30 seconds PRECEDING AND 30 seconds FOLLOWING;
```

Each WINDOW JOIN operates independently, allowing you to aggregate data from
multiple related tables with different time windows in a single query.

### Using EXCLUDE PREVAILING

Exclude the prevailing value to only aggregate rows strictly within the time
window:

```questdb-sql title="WINDOW JOIN excluding prevailing value"
SELECT
    t.sym,
    t.ts,
    sum(p.price) AS window_sum
FROM trades t
WINDOW JOIN prices p
    ON (t.sym = p.sym)
    RANGE BETWEEN 1 minute PRECEDING AND 1 minute FOLLOWING
    EXCLUDE PREVAILING;
```

This is useful when you want strict window boundaries and do not need the last
known value before the window starts.

### With left table filter

Filter left table rows using a `WHERE` clause:

```questdb-sql title="WINDOW JOIN with WHERE filter"
SELECT
    t.sym,
    t.ts,
    sum(p.price) AS window_sum
FROM trades t
WINDOW JOIN prices p
    ON (t.sym = p.sym)
    RANGE BETWEEN 1 minute PRECEDING AND 1 minute FOLLOWING
    EXCLUDE PREVAILING
WHERE t.price < 450
ORDER BY t.ts;
```

## Query plan analysis

Use `EXPLAIN` to see the execution plan and verify optimization:

```questdb-sql title="Analyze WINDOW JOIN execution plan"
EXPLAIN SELECT t.sym, sum(p.price)
FROM trades t
WINDOW JOIN prices p ON (t.sym = p.sym)
RANGE BETWEEN 1 minute PRECEDING AND 1 minute FOLLOWING
EXCLUDE PREVAILING;
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

## Performance tips

1. **Use symbol-based joins**: When possible, join on symbol columns to enable
   the Fast Join optimization
2. **Narrow time windows**: Smaller windows mean less data to aggregate
3. **Filter the left table**: Use `WHERE` clauses to reduce the number of rows
   processed
4. **Parallel execution**: WINDOW JOIN automatically leverages parallel
   execution based on your worker configuration
