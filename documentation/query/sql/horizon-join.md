---
title: HORIZON JOIN keyword
sidebar_label: HORIZON JOIN
description:
  Reference documentation for HORIZON JOIN, a QuestDB time-series join for
  markout analysis and event impact studies.
---

HORIZON JOIN is a time-series join for **markout analysis**: measuring how
prices or other metrics evolve at fixed time offsets from events such as trades
or orders.

It is a variant of the [`JOIN` keyword](/docs/query/sql/join/) that runs an
[ASOF JOIN](/docs/query/sql/asof-join/) match at each of a set of forward (or
backward) time offsets from every left-hand row. Without aggregate functions,
the query returns one row per left-hand row and offset. With aggregate
functions, it returns one row per group, such as one row per offset and symbol,
which is how markout curves are built.

A single query can join **multiple right-hand tables** against the same
left-hand table and offsets, and each right-hand table can have its own
[filter](#filtering-right-hand-tables).

To see how it compares with WINDOW JOIN and the other time-series joins, read
[Which time-series join?](/blog/questdb-time-series-joins-guide/)

## Syntax

### RANGE form

Generate offsets at regular intervals from `FROM` to `TO` (inclusive) with the
given `STEP`:

```questdb-sql title="HORIZON JOIN with RANGE"
[WITH <cte_name> AS (<query>) [, ...]]
SELECT [DISTINCT] <select_list>
FROM <left_table> [[AS] <left_alias>]
HORIZON JOIN <right_side> [[AS] <alias>] [ON <on_condition>]
[HORIZON JOIN <right_side> [[AS] <alias>] [ON <on_condition>] ...]
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
[WITH <cte_name> AS (<query>) [, ...]]
SELECT [DISTINCT] <select_list>
FROM <left_table> [[AS] <left_alias>]
HORIZON JOIN <right_side> [[AS] <alias>] [ON <on_condition>]
[HORIZON JOIN <right_side> [[AS] <alias>] [ON <on_condition>] ...]
LIST (<offset_expr>, ...) AS <horizon_alias>
[WHERE <left_table_filter>]
[GROUP BY <keys>]
[ORDER BY ...]
```

For example, `LIST (-1m, -5s, -1s, 0, 1s, 5s, 1m)` generates offsets at those
specific points. Offsets must be monotonically increasing. Unitless `0` is
allowed as shorthand for zero offset.

### Select list, right-hand side and ON condition

`<select_list>` can use columns and expressions from the left-hand table, the
right-hand tables and the [horizon pseudo-table](#the-horizon-pseudo-table).
Aggregate functions are optional, see [How it works](#how-it-works).

Each `<right_side>` takes one of these forms:

```questdb-sql title="Right-hand side"
<right_side> ::= <table>
               | (<table> WHERE <filter>)
               | (SELECT <column> [, <column> ...] FROM <table>
                  [WHERE <filter>])
               | <cte_name>
```

- The `WHERE` forms filter the table before matching, see
  [Filtering right-hand tables](#filtering-right-hand-tables).
- The `SELECT` form picks a subset of the table's columns, in any order.
- A CTE works when its query has one of the other forms.
- Other subqueries, such as ones with computed columns, `LIMIT`, aggregation
  or joins, aren't supported, see [Filter restrictions](#filter-restrictions).

`<on_condition>` holds the join keys, either in the shorthand form `(symbol)`
or as equalities such as `t.symbol = c.symbol AND t.ecn = c.ecn`. Parentheses
around equalities are optional. To filter the right-hand table, add predicates
on its columns with `AND`, such as `t.symbol = c.symbol AND c.ecn = 'LMAX'`.
The shorthand form can't be combined with filters.

When using multiple HORIZON JOINs, only the **last** HORIZON JOIN in the chain
carries the `RANGE`/`LIST` and `AS` clauses. Preceding HORIZON JOINs omit them.
Each right-hand table can use or omit the `ON` clause independently, so one
query can mix keyed and non-keyed (timestamp-only ASOF) joins.

Table aliases don't need `AS`, but the horizon alias does: `LIST (0) AS h`, not
`LIST (0) h`.

## How it works

For each row in the left-hand table and each offset in the horizon:

1. Compute the horizon timestamp, `left_timestamp + offset`
2. In each right-hand table, find the latest row at or before the horizon
   timestamp that matches the join keys and passes the table's
   [filter](#filtering-right-hand-tables), if any

With multiple right-hand tables, QuestDB matches each table, at each offset,
independently. If a right-hand table has no match for a given row/offset
combination, its columns resolve to `NULL`.

Without aggregate functions, the query returns one row per left-hand row and
offset, see
[Queries without aggregate functions](#queries-without-aggregate-functions).

With aggregate functions, QuestDB groups the matches by the non-aggregate
`SELECT` columns, such as the offset and the symbol, and aggregates each group.
Aggregate expressions can combine columns from different right-hand tables,
such as `avg(b.bid + a.ask)`.

## The horizon pseudo-table

The `RANGE` or `LIST` clause defines a virtual table of time offsets, aliased by
the `AS` clause. This pseudo-table exposes two columns:

| Column | Type | Description |
|--------|------|-------------|
| `<alias>.offset` | `LONG` | The offset value in the left-hand table's designated timestamp resolution. For example, with microsecond timestamps, `h.offset / 1_000_000` converts to seconds; with nanosecond timestamps, `h.offset / 1_000_000_000` converts to seconds. |
| `<alias>.timestamp` | Same as the left-hand designated timestamp (`TIMESTAMP` or `TIMESTAMP_NS`) | The computed horizon timestamp (`left_timestamp + offset`). Available for grouping or expressions. |

## Interval units

All offset values in `RANGE` (`FROM`, `TO`, `STEP`) and `LIST` **must include a
unit suffix**. Bare numbers are not valid: write `5s`, not `5` or
`5_000_000_000`. The only exception is `0`, which is allowed without a unit as
shorthand for zero offset.

`RANGE` and `LIST` accept the units below. Unlike
[SAMPLE BY](/docs/query/sql/sample-by/), they don't accept `w`, `M` or `y`,
which fail with `unsupported HORIZON time unit`:

| Unit | Meaning |
|------|---------|
| `n` | Nanoseconds |
| `U` | Microseconds |
| `T` | Milliseconds |
| `s` | Seconds |
| `m` | Minutes |
| `h` | Hours |
| `d` | Days |

`h.offset` is a `LONG` in the left-hand table's timestamp resolution, such as
nanoseconds for `TIMESTAMP_NS` tables, whatever unit `RANGE` or `LIST` uses. In
a `PIVOT ... FOR offset IN (...)` clause, match offsets by this raw value, such
as `1_800_000_000_000` for 30 minutes in nanoseconds, not by the interval
literal.

## Mixed-precision timestamps

The left-hand and right-hand tables can use different timestamp resolutions,
such as `TIMESTAMP` (microseconds) and `TIMESTAMP_NS` (nanoseconds), without
casting. `h.offset` uses the resolution of the **left-hand table** (the event
table).

## GROUP BY rules

`GROUP BY` is optional. Without it, a query with aggregate functions is grouped
by all non-aggregate `SELECT` columns, and a query without aggregate functions
isn't grouped. An explicit `GROUP BY` follows stricter rules than a regular
`GROUP BY`:

- Each `GROUP BY` expression must **exactly match** a non-aggregate `SELECT`
  expression (with table prefix tolerance, e.g., `t.symbol` matches `symbol`) or
  a `SELECT` column alias.
- Every non-aggregate `SELECT` column must appear in `GROUP BY`.
- Column index references are supported (e.g., `GROUP BY 1, 2`).

For example, if the `SELECT` list contains `h.offset / 1_000_000_000 AS
horizon_sec`, the `GROUP BY` must use either the alias `horizon_sec` or the full
expression `h.offset / 1_000_000_000`. Using just `h.offset` is not valid,
because it does not exactly match any non-aggregate `SELECT` expression.

## Queries without aggregate functions

Without aggregate functions, `DISTINCT` or `GROUP BY`, a HORIZON JOIN returns
one row per left-hand row and offset, so N left-hand rows and M offsets produce
N × M rows. Duplicate left-hand rows each produce their own rows, and rows
without a right-hand match are kept, with `NULL` in that table's columns.

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

If you only need aggregated values, put the aggregate functions in the HORIZON
JOIN rather than in an outer query. Both return the same result, but the
HORIZON JOIN computes it faster.

:::warning Breaking change in QuestDB 10.1.0

Before QuestDB 10.1.0, a HORIZON JOIN without aggregate functions returned
only distinct rows, as `SELECT DISTINCT` does, and the result had no
designated timestamp. See
[Upgrading to QuestDB 10.1.0](#upgrading-to-questdb-1010).

:::

### Row order and designated timestamp

Rows come in left-hand row order and, for each left-hand row, in ascending
offset order. To sort them by horizon timestamp, select `h.timestamp` and add
`ORDER BY` on it.

If the query selects the left-hand table's designated timestamp, that column is
the designated timestamp of the result. `h.timestamp` never is. You can then
use the result in an outer [SAMPLE BY](/docs/query/sql/sample-by/) or as the
left-hand side of a time-series join such as
[ASOF JOIN](/docs/query/sql/asof-join/):

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

Unless you need `FILL` or `ALIGN TO`, bucketing with `timestamp_floor()` in the
HORIZON JOIN itself returns the same values faster:

```questdb-sql title="The same markout, aggregated in the HORIZON JOIN" demo
SELECT
    timestamp_floor('5m', t.timestamp) AS ts,
    t.symbol,
    avg((m.best_bid + m.best_ask) / 2 - t.price) AS avg_markout
FROM fx_trades AS t
HORIZON JOIN market_data AS m ON (symbol)
LIST (30s) AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY ts, t.symbol;
```

To store the rows in a table, use `INSERT INTO ... SELECT` or
`CREATE TABLE AS SELECT` and select the left-hand designated timestamp. List
the `INSERT` target columns in the order of the `SELECT` list:

```questdb-sql title="Store the 30-second markout of every trade"
CREATE TABLE markouts (
    ts TIMESTAMP_NS,
    symbol SYMBOL,
    price DOUBLE,
    mid DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY;

INSERT INTO markouts (symbol, price, ts, mid)
SELECT
    t.symbol,
    t.price,
    t.timestamp,
    (m.best_bid + m.best_ask) / 2
FROM fx_trades AS t
HORIZON JOIN market_data AS m ON (symbol)
LIST (30s) AS h
WHERE t.timestamp IN '$now-1h..$now';
```

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

## Filtering right-hand tables

A right-hand filter applies **before** matching. At each offset, a left-hand
row matches the latest right-hand row that passes the filter, skipping newer
rows that don't. If no row passes, that table's columns are `NULL`.

Write the filter in the `ON` clause, after the join keys:

```questdb-sql title="Markout against LMAX quotes only" demo
SELECT
    h.offset / 1_000_000_000 AS horizon_sec,
    t.symbol,
    avg((c.bid_price + c.ask_price) / 2 - t.price) AS avg_markout
FROM fx_trades AS t
HORIZON JOIN core_price AS c ON (t.symbol = c.symbol AND c.ecn = 'LMAX')
LIST (0, 5s, 30s, 1m) AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY t.symbol, horizon_sec;
```

Every trade is measured against the LMAX quote, wherever it executed. To match
each trade against the quotes of its own ECN instead, make the ECN a join key:
`ON (t.symbol = c.symbol AND t.ecn = c.ecn)`.

Or write it in a subquery on the right-hand table:

```questdb-sql title="Mid-price around trades, excluding event-driven quotes" demo
SELECT
    h.offset / 1_000_000_000 AS horizon_sec,
    t.symbol,
    avg((c.bid_price + c.ask_price) / 2) AS avg_mid
FROM fx_trades AS t
HORIZON JOIN (core_price WHERE reason = 'normal') AS c ON (symbol)
RANGE FROM -5s TO 5s STEP 1s AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY t.symbol, horizon_sec;
```

Both forms return the same result. Since each right-hand table has its own
filter, you can join the same table twice with different filters. The second
join below also selects only the columns that the query needs:

```questdb-sql title="LMAX and EBS markouts side by side" demo
SELECT
    h.offset / 1_000_000_000 AS horizon_sec,
    t.symbol,
    avg((l.bid_price + l.ask_price) / 2 - t.price) AS lmax_markout,
    avg((e.bid_price + e.ask_price) / 2 - t.price) AS ebs_markout
FROM fx_trades AS t
HORIZON JOIN core_price AS l ON (t.symbol = l.symbol AND l.ecn = 'LMAX')
HORIZON JOIN (
    SELECT timestamp, symbol, bid_price, ask_price
    FROM core_price
    WHERE ecn = 'EBS'
) AS e ON (symbol)
LIST (0, 5s, 30s) AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY t.symbol, horizon_sec;
```

You can also define the filtered table in a CTE:

```questdb-sql title="Markout against LMAX quotes, filtered in a CTE" demo
WITH lmax AS (
    SELECT * FROM core_price WHERE ecn = 'LMAX'
)
SELECT
    h.offset / 1_000_000_000 AS horizon_sec,
    t.symbol,
    avg((c.bid_price + c.ask_price) / 2 - t.price) AS avg_markout
FROM fx_trades AS t
HORIZON JOIN lmax AS c ON (symbol)
LIST (0, 5s, 30s, 1m) AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY t.symbol, horizon_sec;
```

A filter can use the right-hand table's columns, constants, bind variables and
functions, with or without join keys and aggregate functions. A designated
timestamp interval in a right-hand subquery, such as
`(core_price WHERE timestamp IN '$now-30m..$now' AND ecn = 'EBS')`, limits the
matches to that interval.

The `WHERE` clause filters left-hand rows and can't reference right-hand
columns. To filter the output by matched values, use an outer query.

When the right-hand side is a table, an `ON` predicate that references no
columns, such as a bind variable, switches that table's matches on or off. When
it's false, no row of that table matches.

A filter that few right-hand rows pass makes the query slower.

:::warning Breaking change in QuestDB 10.1.0

Before QuestDB 10.1.0, HORIZON JOIN ignored `ON` predicates other than the
join keys, and a right-hand subquery could only filter by a designated
timestamp interval. See [Upgrading to QuestDB 10.1.0](#upgrading-to-questdb-1010).

:::

### Filter restrictions

- An `ON` clause can only filter its own right-hand table. A predicate on
  left-hand columns (`t.quantity > 0`), on both tables
  (`t.price > c.bid_price`), on the horizon pseudo-table (`h.offset > 0`) or
  on another right-hand table fails with
  `unsupported HORIZON join expression`. Filter left-hand rows in the `WHERE`
  clause instead.
- An `ON` clause can't contain a subquery, such as `c.ecn IN (SELECT ...)`.
  Move it into the right-hand side: `(core_price WHERE ecn IN (SELECT ...))`.
- A right-hand subquery or CTE can select columns in any order, but can't
  compute new ones, and can rename columns only when it has no `WHERE` clause.
  `LIMIT`, `SAMPLE BY`, `DISTINCT`, `GROUP BY` and joins aren't supported.
  These fail with
  `right-hand side of HORIZON JOIN can only be a table with an optional filter`
  or with an error about a missing timestamp.
- A false constant in the `ON` clause fails when the right-hand side is a
  subquery or a CTE.

## Examples

The examples below use the [demo dataset](/docs/cookbook/demo-data-schema/)
tables `fx_trades` (trade executions) and `market_data` (order book snapshots
with 2D arrays for bids/asks).

### Post-trade markout at uniform horizons

Measure the average mid-price at 5-second intervals after each trade to
evaluate execution quality and price impact:

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

Use negative offsets to see price levels before and after trades, which helps
detect information leakage or adverse selection:

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

Join `market_data` for consolidated book prices and `core_price` for ECN-level
quotes in a single query to compare how both track around each EURUSD trade:

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

The `LIST` clause appears only on the last HORIZON JOIN.

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
ASOF) in the same query when one source is symbol-specific and another is
market-wide:

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

## Parallel execution

QuestDB runs HORIZON JOIN queries in parallel. To disable this, set
[`cairo.sql.parallel.horizon.join.enabled`](/docs/configuration/cairo-engine/#cairosqlparallelhorizonjoinenabled)
to `false`. Use [`EXPLAIN`](/docs/query/sql/explain/) to check that a query
runs in parallel:

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

A parallel plan shows one of these nodes:

- **Async Horizon Join**: a HORIZON JOIN with aggregate functions
- **Async Multi Horizon Join**: a HORIZON JOIN with aggregate functions and
  multiple right-hand tables, with `tables: N` showing their number
- **Async Horizon Join Projection**: a HORIZON JOIN without aggregate
  functions

`JIT` in the node name, as in `Async JIT Horizon Join`, means that the `WHERE`
filter is [JIT-compiled](/docs/concepts/deep-dive/jit-compiler/).

A query without aggregate functions may not run in parallel when the number of
offsets multiplied by the number of right-hand tables exceeds 100. Its plan
then shows `Horizon Join Projection`, without `Async`.

## Upgrading to QuestDB 10.1.0

QuestDB 10.1.0 changes two HORIZON JOIN behaviors. Existing queries and views
can return different results without an error, and some `ON` predicates that
used to work now fail.

### Results without aggregate functions

A HORIZON JOIN without aggregate functions now returns one row per left-hand
row and offset. Before 10.1.0, it returned only distinct rows, with no
designated timestamp, so queries now return more rows when several left-hand
rows produce the same output. To keep the previous result, add `DISTINCT` or
an explicit `GROUP BY` that lists every selected column.

The change also affects:

- Outer aggregation and [PIVOT](/docs/query/sql/pivot/) over such a query:
  `count()`, `sum()` and `avg()` now include every row, while identical rows
  used to count once. To aggregate every row faster, put the aggregate
  functions in the HORIZON JOIN and use `PIVOT` with `first()` only to reshape
  the result, as in
  [Permanent vs temporary impact per order](/docs/cookbook/sql/finance/implementation-shortfall-order/#permanent-vs-temporary-impact-per-order).
- [Views](/docs/concepts/views/) over such queries, which return the new rows.
- `INSERT INTO ... SELECT` without a column list, which fails when the
  selected left-hand designated timestamp and the target table's designated
  timestamp are at different positions, with an error such as
  `designated timestamp of existing table (0) does not match designated
  timestamp in select query (2)`. List the target columns in the order of the
  `SELECT` list, as in the
  [`INSERT` example](#row-order-and-designated-timestamp).
- `CREATE TABLE AS SELECT` over a query that selects the left-hand designated
  timestamp, which now makes that column the new table's designated timestamp.

### ON predicates

Before 10.1.0, HORIZON JOIN ignored `ON` predicates other than the join keys.
Now:

- A predicate on the right-hand table alone, such as `c.ecn = 'LMAX'`, filters
  that table, and the query returns different results without an error.
- Any other predicate fails with `unsupported HORIZON join expression`, see
  [Filter restrictions](#filter-restrictions).

To get the previous results, remove these predicates. Moving a left-hand
predicate to the `WHERE` clause filters the left-hand rows, which also changes
the results. Recreate affected [views](/docs/concepts/views/) with
[`CREATE OR REPLACE VIEW`](/docs/query/sql/create-view/).

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
  To filter a right-hand table before matching, use a
  [right-hand filter](#filtering-right-hand-tables).
- **ORDER BY selected columns only**: `ORDER BY` must use selected columns or
  their aliases. When `t.price` isn't selected, `ORDER BY t.price` fails with
  `ORDER BY expressions must appear in select list`. An expression such as
  `ORDER BY t.price * 2` is accepted, but with aggregate functions it also
  becomes a grouping key and splits the groups.
- **All tables must have a designated timestamp**: The left-hand and all
  right-hand tables must each have a designated timestamp column.
- **Restricted right-hand side**: Each right-hand side must be a table with an
  optional filter, in one of the
  [forms in the grammar](#select-list-right-hand-side-and-on-condition), see
  [Filter restrictions](#filter-restrictions).
- **Restricted left-hand side**: A table with an optional filter works best.
  Some other queries are supported, but don't run in parallel.
- **RANGE constraints**: `STEP` must be positive; `FROM` must be less than or
  equal to `TO`.
- **LIST constraints**: Offsets must be interval literals (e.g., `1s`, `-2m`,
  `0`) and monotonically increasing.
- **Offset count**: `RANGE` and `LIST` can generate at most 10,000 offsets, set
  by
  [`cairo.sql.horizon.join.max.offsets`](/docs/configuration/cairo-engine/#cairosqlhorizonjoinmaxoffsets).
  More fail with `RANGE generates too many offsets` or
  `LIST has too many offsets`.

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
