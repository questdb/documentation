---
title: HORIZON JOIN keyword
sidebar_label: HORIZON JOIN
description:
  Reference documentation for HORIZON JOIN, a specialized time-series join
  for markout analysis and event impact studies in QuestDB.
---

HORIZON JOIN is a specialized time-series join designed for **markout analysis**
— a common financial analytics pattern where you need to analyze how prices or
metrics evolve at specific time offsets relative to events (e.g., trades,
orders).

It is a variant of the [`JOIN` keyword](/docs/query/sql/join/) that runs an
[ASOF JOIN](/docs/query/sql/asof-join/) match at each of a set of forward (or
backward) time offsets from every left-hand row, in a single pass. Without
aggregate functions, the query returns one row per left-hand row and offset.
Adding aggregate functions collapses those matches into one row per offset, or
per offset and key, which is how markout curves are built.

HORIZON JOIN supports joining against **multiple right-hand-side tables** in a
single query, matching columns from several time-series sources against a
common left-hand table and offset grid.

To see how it compares with WINDOW JOIN and the other time-series joins, read
[Which time-series join?](/blog/questdb-time-series-joins-guide/)

## Syntax

### RANGE form

Generate offsets at regular intervals from `FROM` to `TO` (inclusive) with the
given `STEP`:

```questdb-sql title="HORIZON JOIN with RANGE"
SELECT [<keys>,] [<aggregations>]
FROM <left_table> AS <left_alias>
HORIZON JOIN <right_table_1> AS <alias_1> [ON (<join_keys_1>)]
[HORIZON JOIN <right_table_2> AS <alias_2> [ON (<join_keys_2>)]]
...
HORIZON JOIN <right_table_N> AS <alias_N> [ON (<join_keys_N>)]
RANGE FROM <from_expr> TO <to_expr> STEP <step_expr> AS <horizon_alias>
[WHERE <left_table_filter>]
[GROUP BY <keys>]
[ORDER BY ...]
```

For example, `RANGE FROM -3m TO 3m STEP 1m` generates offsets at -3m, -2m, -1m,
0m, 1m, 2m, 3m.

### LIST form

Specify explicit offsets as interval literals:

```questdb-sql title="HORIZON JOIN with LIST"
SELECT [<keys>,] [<aggregations>]
FROM <left_table> AS <left_alias>
HORIZON JOIN <right_table_1> AS <alias_1> [ON (<join_keys_1>)]
[HORIZON JOIN <right_table_2> AS <alias_2> [ON (<join_keys_2>)]]
...
HORIZON JOIN <right_table_N> AS <alias_N> [ON (<join_keys_N>)]
LIST (<offset_expr>, ...) AS <horizon_alias>
[WHERE <left_table_filter>]
[GROUP BY <keys>]
[ORDER BY ...]
```

For example, `LIST (-1m, -5s, -1s, 0, 1s, 5s, 1m)` generates offsets at those
specific points. Offsets must be monotonically increasing. Unitless `0` is
allowed as shorthand for zero offset.

When using multiple HORIZON JOINs, only the **last** HORIZON JOIN in the chain
carries the `RANGE`/`LIST` and `AS` clauses. Preceding HORIZON JOINs omit them.
Each right-hand table can independently use or omit the `ON` clause — you can
freely mix keyed and non-keyed (timestamp-only ASOF) joins within the same
query.

## How it works

For each row in the left-hand table and each offset in the horizon:

1. Compute `left_timestamp + offset`
2. Perform an ASOF match against each right-hand table at that computed
   timestamp
3. When join keys are provided (via `ON`), consider only the right-hand rows
   matching the keys

With multiple right-hand tables, QuestDB matches each table, at each offset,
independently. If a right-hand table has no match for a given row/offset
combination, its columns resolve to `NULL`.

Aggregate functions are optional, and the shape of the result depends on
whether the `SELECT` list has them:

- **Without aggregate functions**, the query returns every match: one row per
  left-hand row and offset. See
  [Queries without aggregate functions](#queries-without-aggregate-functions).
- **With aggregate functions**, QuestDB implicitly groups the results by the
  non-aggregate `SELECT` columns (horizon offset, left-hand table keys, etc.),
  and applies the aggregate functions across all matched rows. Aggregate
  expressions can reference columns from different right-hand tables (e.g.,
  `avg(b.bid + a.ask)`).

## The horizon pseudo-table

The `RANGE` or `LIST` clause defines a virtual table of time offsets, aliased by
the `AS` clause. This pseudo-table exposes two columns:

| Column | Type | Description |
|--------|------|-------------|
| `<alias>.offset` | `LONG` | The offset value in the left-hand table's designated timestamp resolution. For example, with microsecond timestamps, `h.offset / 1_000_000` converts to seconds; with nanosecond timestamps, `h.offset / 1_000_000_000` converts to seconds. |
| `<alias>.timestamp` | `TIMESTAMP` | The computed horizon timestamp (`left_timestamp + offset`). Available for grouping or expressions. |

## Interval units

All offset values in `RANGE` (`FROM`, `TO`, `STEP`) and `LIST` **must include a
unit suffix**. Bare numbers are not valid — write `5s`, not `5` or
`5_000_000_000`. The only exception is `0`, which is allowed without a unit as
shorthand for zero offset.

Both `RANGE` and `LIST` use the same interval expression syntax as
[SAMPLE BY](/docs/query/sql/sample-by/):

| Unit | Meaning |
|------|---------|
| `n` | Nanoseconds |
| `U` | Microseconds |
| `T` | Milliseconds |
| `s` | Seconds |
| `m` | Minutes |
| `h` | Hours |
| `d` | Days |

Note that `h.offset` is always returned as a `LONG` in the left-hand table's
timestamp resolution (e.g., nanoseconds for `TIMESTAMP_NS` tables), regardless
of the unit used in the `RANGE` or `LIST` definition. When matching offset
values in a `PIVOT ... FOR offset IN (...)` clause, use the raw numeric value
(e.g., `1_800_000_000_000` for 30 minutes in nanoseconds), not the interval
literal.

## Queries without aggregate functions

A HORIZON JOIN with no aggregate function in its `SELECT` list, no `GROUP BY`
and no `DISTINCT` returns one row per left-hand row and offset. A left-hand
table of N rows and a horizon of M offsets produce N × M rows:

- Left-hand rows that are exact duplicates each keep their own rows.
- A row/offset combination with no match in a right-hand table is still
  returned, with `NULL` in that table's columns.

```questdb-sql title="Mid-price at each horizon for every trade" demo
SELECT
    t.timestamp,
    t.symbol,
    t.price,
    h.offset / 1_000_000_000 AS horizon_sec,
    (m.best_bid + m.best_ask) / 2 AS mid
FROM fx_trades AS t
HORIZON JOIN market_data AS m ON (symbol)
LIST (0, 5s, 30s, 1m) AS h
WHERE t.timestamp IN '$now-1m..$now';
```

Each trade in the interval produces four rows, one per offset.

Aggregating these rows in an outer query gives the same result as writing the
aggregate functions in the HORIZON JOIN itself.

### Row order and designated timestamp

Rows are returned in left-hand row order and, within each left-hand row, in
ascending offset order.

When the query selects the left-hand table's designated timestamp, that column
is the designated timestamp of the result. An `ORDER BY` on it needs no sort,
and an outer query can use the result as the input of
[SAMPLE BY](/docs/query/sql/sample-by/) or as the left-hand side of a
time-series join such as [ASOF JOIN](/docs/query/sql/asof-join/):

```questdb-sql title="30-second markout per symbol in 5-minute buckets" demo
SELECT timestamp, symbol, avg(mid - price) AS avg_markout
FROM (
    SELECT
        t.timestamp,
        t.symbol,
        t.price,
        (m.best_bid + m.best_ask) / 2 AS mid
    FROM fx_trades AS t
    HORIZON JOIN market_data AS m ON (symbol)
    LIST (30s) AS h
    WHERE t.timestamp IN '$now-1h..$now'
)
SAMPLE BY 5m;
```

The rows are not in `h.timestamp` order, and `h.timestamp` is never the
designated timestamp of the result. To read the rows by horizon timestamp, add
an explicit `ORDER BY`. An outer `SAMPLE BY` needs the left-hand timestamp in
the `SELECT` list of the HORIZON JOIN.

### Removing duplicates

To get one row per distinct combination of the selected columns, use
`SELECT DISTINCT` or an explicit `GROUP BY` that lists every selected column:

```questdb-sql title="Distinct symbol and offset combinations" demo
SELECT DISTINCT t.symbol, h.offset
FROM fx_trades AS t
HORIZON JOIN market_data AS m ON (symbol)
LIST (0, 5s) AS h
WHERE t.timestamp IN '$now-1h..$now';
```

:::note

Before QuestDB 10.0.2, a HORIZON JOIN without aggregate functions grouped its
result by every selected column, as `SELECT DISTINCT` does, and the result had
no designated timestamp. Such a query returns more rows after the upgrade
whenever several left-hand rows produce identical output rows. This also
applies to views over such queries, because a view runs its stored SQL. Add
`DISTINCT` or an explicit `GROUP BY` to keep the previous result.

:::

## GROUP BY rules

The `GROUP BY` clause is optional. When it is omitted and the `SELECT` list has
aggregate functions, results are implicitly grouped by all non-aggregate
`SELECT` columns. When it is omitted and there are no aggregate functions,
nothing is grouped: see
[Queries without aggregate functions](#queries-without-aggregate-functions).
When `GROUP BY` is present, it follows stricter rules than regular `GROUP BY`:

- Each `GROUP BY` expression must **exactly match** a non-aggregate `SELECT`
  expression (with table prefix tolerance, e.g., `t.symbol` matches `symbol`) or
  a `SELECT` column alias.
- Every non-aggregate `SELECT` column must appear in `GROUP BY`.
- Column index references are supported (e.g., `GROUP BY 1, 2`).

For example, if the `SELECT` list contains `h.offset / 1_000_000_000 AS
horizon_sec`, the `GROUP BY` must use either the alias `horizon_sec` or the full
expression `h.offset / 1_000_000_000` — using just `h.offset` is not valid
because it does not exactly match any non-aggregate `SELECT` expression.

## Examples

The examples below use the [demo dataset](/docs/cookbook/demo-data-schema/)
tables `fx_trades` (trade executions) and `market_data` (order book snapshots
with 2D arrays for bids/asks).

### Post-trade markout at uniform horizons

Measure the average mid-price at 5-second intervals after each trade — a classic
way to evaluate execution quality and price impact:

```questdb-sql title="Post-trade markout curve" demo
SELECT
    h.offset / 1_000_000_000 AS horizon_sec,
    t.symbol,
    avg((m.best_bid + m.best_ask) / 2) AS avg_mid
FROM fx_trades AS t
HORIZON JOIN market_data AS m ON (symbol)
RANGE FROM 0s TO 1m STEP 5s AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY t.symbol, horizon_sec;
```

Since `fx_trades` uses nanosecond timestamps (`TIMESTAMP_NS`), `h.offset` is in
nanoseconds. Dividing by 1,000,000,000 converts to seconds.

### Markout P&L at non-uniform horizons

Compute the average post-trade markout value at specific horizons using `LIST`:

```questdb-sql title="Markout at specific time points" demo
SELECT
    h.offset / 1_000_000_000 AS horizon_sec,
    t.symbol,
    avg((m.best_bid + m.best_ask) / 2 - t.price) AS avg_markout
FROM fx_trades AS t
HORIZON JOIN market_data AS m ON (symbol)
LIST (0, 5s, 30s, 1m) AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY t.symbol, horizon_sec;
```

### Pre- and post-trade price movement

Use negative offsets to see price levels before and after trades — useful for
detecting information leakage or adverse selection:

```questdb-sql title="Price movement around trade events" demo
SELECT
    h.offset / 1_000_000_000 AS horizon_sec,
    t.symbol,
    avg((m.best_bid + m.best_ask) / 2) AS avg_mid,
    count() AS sample_size
FROM fx_trades AS t
HORIZON JOIN market_data AS m ON (symbol)
RANGE FROM -5s TO 5s STEP 1s AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY t.symbol, horizon_sec;
```

### Volume-weighted markout

Compute an overall volume-weighted markout value without grouping by symbol:

```questdb-sql title="Volume-weighted markout across all symbols" demo
SELECT
    h.offset / 1_000_000_000 AS horizon_sec,
    sum(((m.best_bid + m.best_ask) / 2 - t.price) * t.quantity)
        / sum(t.quantity) AS vwap_markout
FROM fx_trades AS t
HORIZON JOIN market_data AS m ON (symbol)
RANGE FROM 0s TO 5m STEP 30s AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY horizon_sec;
```

### Multi-table: consolidated and ECN-level quotes around trades

Join against two right-hand tables in a single query - `market_data` for
consolidated book prices and `core_price` for ECN-level quotes - to compare
how both track around each EURUSD trade:

```questdb-sql title="Multi-table HORIZON JOIN with demo data" demo
SELECT
    h.offset / 1000000 AS horizon_ms,
    t.symbol,
    avg(m.best_bid) AS consolidated_bid,
    avg(c.bid_price) AS ecn_bid
FROM fx_trades AS t
HORIZON JOIN market_data AS m
    ON (t.symbol = m.symbol)
HORIZON JOIN core_price AS c
    ON (t.symbol = c.symbol AND t.ecn = c.ecn)
    LIST (-1s, 0, 1s, 5s) AS h
WHERE t.symbol = 'EURUSD'
    AND t.timestamp IN '$now-1h..$now'
GROUP BY horizon_ms, t.symbol
ORDER BY t.symbol, horizon_ms;
```

Note that the `LIST` clause appears only on the last HORIZON JOIN. Each
right-hand table can independently use or omit `ON`.

### Multi-table: bid and ask spread (synthetic example)

Join against two separate tables (bids and asks) in a single HORIZON JOIN query
to compute the average spread at each horizon:

```questdb-sql title="Multi-table HORIZON JOIN with bid/ask spread"
SELECT
    h.offset / 1_000_000_000 AS horizon_sec,
    t.symbol,
    avg(b.bid) AS avg_bid,
    avg(a.ask) AS avg_ask,
    avg(a.ask - b.bid) AS avg_spread
FROM trades AS t
HORIZON JOIN bids AS b ON (t.symbol = b.symbol)
HORIZON JOIN asks AS a ON (t.symbol = a.symbol)
    RANGE FROM -2s TO 2s STEP 2s AS h
GROUP BY horizon_sec, t.symbol
ORDER BY t.symbol, horizon_sec;
```

### Multi-table: keyed and non-keyed mix

Combine a keyed join (matching by symbol) with a non-keyed join (timestamp-only
ASOF) in the same query — useful when one source is symbol-specific and another
is market-wide:

```questdb-sql title="Mixed keyed and non-keyed HORIZON JOIN"
SELECT
    avg(p.price) AS avg_price,
    avg(r.rate) AS avg_rate
FROM trades AS t
HORIZON JOIN prices AS p ON (t.symbol = p.symbol)
HORIZON JOIN rates AS r
    LIST (0, 1s, 5s) AS h;
```

Here `prices` is matched by symbol (keyed), while `rates` uses timestamp-only
ASOF matching (non-keyed).

### Multi-table: three right-hand tables

HORIZON JOIN supports more than two right-hand tables:

```questdb-sql title="Three-table HORIZON JOIN"
SELECT
    avg(b.bid) AS avg_bid,
    avg(a.ask) AS avg_ask,
    avg(m.mid) AS avg_mid
FROM trades AS t
HORIZON JOIN bids AS b ON (t.symbol = b.symbol)
HORIZON JOIN asks AS a ON (t.symbol = a.symbol)
HORIZON JOIN mids AS m ON (t.symbol = m.symbol)
    LIST (0) AS h;
```

## Mixed-precision timestamps

The left-hand and right-hand tables can use different timestamp resolutions
(e.g., `TIMESTAMP` with microseconds and `TIMESTAMP_NS` with nanoseconds).
QuestDB aligns the timestamps internally — no explicit casting is needed.

When the tables differ in resolution, `h.offset` uses the resolution of the
**left-hand table** (the event table).

## Parallel execution

QuestDB can execute HORIZON JOIN queries in parallel across multiple worker
threads. Use [`EXPLAIN`](/docs/query/sql/explain/) to see the execution plan and
verify parallelization:

```questdb-sql title="Analyze HORIZON JOIN execution plan" demo
EXPLAIN SELECT
    h.offset / 1_000_000_000 AS horizon_sec,
    t.symbol,
    avg((m.best_bid + m.best_ask) / 2) AS avg_mid
FROM fx_trades AS t
HORIZON JOIN market_data AS m ON (symbol)
RANGE FROM -1m TO 1m STEP 5s AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY t.symbol, horizon_sec;
```

Look for these indicators in the plan:

- **Async Horizon Join**: Parallel execution using Java-evaluated expressions
- **Async JIT Horizon Join**: Parallel execution using Just-In-Time-compiled
  expressions for better performance
- **Async Multi Horizon Join**: Parallel execution with multiple right-hand
  tables (shown with `tables: N` indicating the number of right-hand tables)
- **Async Horizon Join Projection**: Parallel execution of a HORIZON JOIN
  without aggregate functions
- **Async JIT Horizon Join Projection**: The same, with a
  Just-In-Time-compiled `WHERE` filter

A HORIZON JOIN without aggregate functions that runs on a single thread shows
as **Horizon Join Projection**.

## Current limitations

- **No other join types**: HORIZON JOIN cannot be combined with other join types
  (e.g., `JOIN`, `ASOF JOIN`) in the same level of the query. Multiple HORIZON
  JOINs are allowed, but mixing with non-HORIZON joins is not. Other joins can
  be done in an outer query.
- **No window functions**: Window functions cannot be used in HORIZON JOIN
  queries. Wrap the HORIZON JOIN in a subquery and apply window functions in the
  outer query.
- **No SAMPLE BY**: `SAMPLE BY` cannot be used in the same query as HORIZON
  JOIN. Use `GROUP BY` with a time-bucketing expression instead, or apply
  `SAMPLE BY` in an outer query over a HORIZON JOIN
  [without aggregate functions](#row-order-and-designated-timestamp).
- **WHERE filters left-hand table only**: The `WHERE` clause can only reference
  columns from the left-hand table. References to any right-hand table columns
  or horizon pseudo-table columns (`h.offset`, `h.timestamp`) are not allowed.
- **All tables must have a designated timestamp**: The left-hand and all
  right-hand tables must each have a designated timestamp column.
- **Right-hand side must be a table**: Each right-hand side of HORIZON JOIN must
  be a table with an optional filter, more complex subqueries aren't supported.
- **Left-hand side queries are restricted as well**. On the left hand side, the
  query that works best is a table with an optional filter. Some other query
  types are also supported, but they degrade the query plan to single-threaded
  processing.
- **RANGE constraints**: `STEP` must be positive; `FROM` must be less than or
  equal to `TO`.
- **LIST constraints**: Offsets must be interval literals (e.g., `1s`, `-2m`,
  `0`) and monotonically increasing.

:::tip Hand-rolled markout curves

If you express a markout curve as a `CROSS JOIN` against a table of offsets
rather than as a HORIZON JOIN, the
[`markout_horizon` hint](/docs/concepts/deep-dive/sql-optimizer-hints/#markout_horizon)
avoids materializing and sorting the whole join output.

:::

:::info Related documentation
- [ASOF JOIN](/docs/query/sql/asof-join/)
- [JOIN](/docs/query/sql/join/)
- [PIVOT](/docs/query/sql/pivot/)
- [SAMPLE BY](/docs/query/sql/sample-by/)
- [Markout analysis recipe](/docs/cookbook/sql/finance/markout/)
- [`markout_horizon` optimizer hint](/docs/concepts/deep-dive/sql-optimizer-hints/#markout_horizon)
:::
