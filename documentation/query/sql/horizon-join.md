---
title: HORIZON JOIN keyword
sidebar_label: HORIZON JOIN
description:
  Reference documentation for HORIZON JOIN, a QuestDB time-series join for
  markout analysis, with right-hand filters and per-row or aggregated results.
---

HORIZON JOIN is a specialized time-series join designed for **markout analysis**
— a common financial analytics pattern where you need to analyze how prices or
metrics evolve at specific time offsets relative to events (e.g., trades,
orders).

It is a variant of the [`JOIN` keyword](/docs/query/sql/join/) that runs an
[ASOF JOIN](/docs/query/sql/asof-join/) match at each of a set of forward (or
backward) time offsets from every left-hand row, in a single pass. Without
aggregate functions, `DISTINCT` or `GROUP BY`, the query returns one row per
left-hand row and offset. Adding aggregate functions collapses those matches
into one row per combination of the selected non-aggregate columns, typically
the offset and keys, which is how markout curves are built.

HORIZON JOIN supports joining against **multiple right-hand-side tables** in a
single query, matching columns from several time-series sources against a
common left-hand table and offset grid. Each right-hand table can carry its own
[filter](#filtering-right-hand-tables), which applies before the ASOF match.

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

In both forms, `<select_list>` can mix left-hand, right-hand and horizon
columns and expressions, with or without aggregate functions. Whether it has
aggregate functions decides the shape of the result, see
[How it works](#how-it-works).

Each `<right_side>` takes one of these forms:

```questdb-sql title="Right-hand side"
<right_side> ::= <table>
               | (<table> WHERE <filter>)
               | (SELECT <column> [, <column> ...] FROM <table>
                  [WHERE <filter>])
               | <cte_name>
```

- The `WHERE` forms filter the table before the ASOF match. See
  [Filtering right-hand tables](#filtering-right-hand-tables).
- The `SELECT` form can pick a subset of the table's columns, in any order.
- A CTE name works when the CTE's query has one of the other forms.
- Anything more complex, such as a computed column, `LIMIT`, `DISTINCT`,
  aggregation or a join, fails. See
  [Filter restrictions](#filter-restrictions).

`<on_condition>` holds the join keys, as the shorthand `(symbol)` or as
equalities such as `t.symbol = c.symbol AND t.ecn = c.ecn`. Parentheses around
it are optional. It can also hold predicates on that right-hand table alone,
joined with `AND`, such as `t.symbol = c.symbol AND c.ecn = 'LMAX'`. The
shorthand form can't be combined with other predicates.

When using multiple HORIZON JOINs, only the **last** HORIZON JOIN in the chain
carries the `RANGE`/`LIST` and `AS` clauses. Preceding HORIZON JOINs omit them.
Each right-hand table can independently use or omit the `ON` clause — you can
freely mix keyed and non-keyed (timestamp-only ASOF) joins within the same
query.

Table aliases don't need `AS`, but the horizon alias does: `LIST (0) AS h`, not
`LIST (0) h`.

## How it works

For each row in the left-hand table and each offset in the horizon:

1. Compute the horizon timestamp, `left_timestamp + offset`
2. In each right-hand table, find the latest row at or before the horizon
   timestamp that matches the join keys, when `ON` provides them, and passes
   the table's [filter](#filtering-right-hand-tables), when it has one

With multiple right-hand tables, QuestDB matches each table, at each offset,
independently. If a right-hand table has no match for a given row/offset
combination, its columns resolve to `NULL`.

Aggregate functions are optional, and the shape of the result depends on
whether the `SELECT` list has them:

- **Without aggregate functions, `DISTINCT` or `GROUP BY`**, the query returns
  one row per left-hand row and offset, including those with no match in a
  right-hand table, which have `NULL` in that table's columns. See
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
| `<alias>.timestamp` | Same as the left-hand designated timestamp (`TIMESTAMP` or `TIMESTAMP_NS`) | The computed horizon timestamp (`left_timestamp + offset`). Available for grouping or expressions. |

## Interval units

All offset values in `RANGE` (`FROM`, `TO`, `STEP`) and `LIST` **must include a
unit suffix**. Bare numbers are not valid — write `5s`, not `5` or
`5_000_000_000`. The only exception is `0`, which is allowed without a unit as
shorthand for zero offset.

Both `RANGE` and `LIST` accept these units. Unlike
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

Note that `h.offset` is always returned as a `LONG` in the left-hand table's
timestamp resolution (e.g., nanoseconds for `TIMESTAMP_NS` tables), regardless
of the unit used in the `RANGE` or `LIST` definition. When matching offset
values in a `PIVOT ... FOR offset IN (...)` clause, use the raw numeric value
(e.g., `1_800_000_000_000` for 30 minutes in nanoseconds), not the interval
literal.

## Mixed-precision timestamps

The left-hand and right-hand tables can use different timestamp resolutions
(e.g., `TIMESTAMP` with microseconds and `TIMESTAMP_NS` with nanoseconds).
QuestDB aligns the timestamps internally — no explicit casting is needed.

When the tables differ in resolution, `h.offset` uses the resolution of the
**left-hand table** (the event table).

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
aggregate functions in the HORIZON JOIN itself. When you don't need the
individual rows, write the aggregate functions in the HORIZON JOIN: there, the
aggregation runs on the
[query workers](/docs/configuration/shared-workers/#sharedqueryworkercount),
while an outer query aggregates on the thread that reads the rows.

:::warning Breaking change in QuestDB 10.1.0

Before QuestDB 10.1.0, a HORIZON JOIN without aggregate functions grouped its
result by every selected column, as `SELECT DISTINCT` does, and the result had
no designated timestamp. See
[Upgrading to QuestDB 10.1.0](#upgrading-to-questdb-1010).

:::

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

The rows aren't necessarily in `h.timestamp` order, and `h.timestamp` is never
the designated timestamp of the result. To read the rows by horizon timestamp,
add an explicit `ORDER BY`. An outer `SAMPLE BY` needs the left-hand timestamp
in the `SELECT` list of the HORIZON JOIN.

The HORIZON JOIN matches in parallel, but the outer `SAMPLE BY` aggregates on a
single thread. Use it when you need `FILL`, `ALIGN TO` or a
[materialized view](#materialized-views). Otherwise, bucket the timestamp in the
HORIZON JOIN itself, which aggregates on the query workers and returns the same
values:

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

With the designated timestamp selected, `INSERT INTO ... SELECT` and
`CREATE TABLE AS SELECT` carry the rows into a table. When `INSERT` lists the
target columns, list them in the order of the `SELECT` list:

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

### Materialized views

A [materialized view](/docs/concepts/materialized-views/) needs a designated
timestamp in the result of its query. The result of a HORIZON JOIN with
aggregate functions, `DISTINCT` or `GROUP BY` has no designated timestamp, so a
materialized view over it is created, then invalidated on its first refresh
with
`timestamp type mismatch between materialized view and query`.

Instead, apply `SAMPLE BY` in the view query to a HORIZON JOIN without
aggregate functions that selects the left-hand designated timestamp. The query
reads several tables, so `WITH BASE` must name the left-hand table:

```questdb-sql title="Hourly 30-second markout per symbol"
CREATE MATERIALIZED VIEW markout_30s_1h WITH BASE fx_trades AS (
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
    )
    SAMPLE BY 1h
);
```

Only inserts into the base table, here `fx_trades`, trigger a refresh. A
refresh that runs before the quotes at a forward offset arrive matches older
quotes, and quotes that arrive later don't update the view by themselves. To
wait for them, create the view with a
[`PERIOD`](/docs/query/sql/create-mat-view/#period-clause) whose `DELAY` covers
the largest offset plus the quote delivery delay, such as
`WITH BASE fx_trades REFRESH PERIOD (LENGTH 1h DELAY 2m)`. To recompute a time
range after late quotes arrive, run
[`REFRESH MATERIALIZED VIEW ... RANGE FROM ... TO ...`](/docs/query/sql/refresh-mat-view/#range).

## Filtering right-hand tables

A filter on a right-hand table restricts the rows that the ASOF match
considers. QuestDB applies it **before** matching: at each offset, a left-hand
row matches the latest right-hand row at or before the horizon timestamp that
passes the filter, even when newer rows fail it. When no row passes, that
table's columns are `NULL`.

Write the filter in the `ON` clause, combined with the join keys using `AND`:

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

Or write the filter in a subquery on the right-hand table:

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

The same predicate gives the same result in either form, and a query can use
both. Each right-hand table takes its own filter, so the same table can be
joined twice with different filters. Here, the second side is a `SELECT` of
only the columns that the query reads:

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

A CTE on the right-hand side works as the same subquery would:

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

A filter:

- can use the right-hand table's columns, constants and bind variables, with
  comparisons, `IN` lists, regular expressions and functions
- works with or without join keys, and with or without aggregate functions
- applies only to its own table when the query has several right-hand tables

A designated timestamp interval in the subquery, such as
`(core_price WHERE timestamp IN '$now-30m..$now' AND ecn = 'EBS')`, also limits
the right-hand rows to that interval, and QuestDB scans only that interval.

A right-hand filter differs from the `WHERE` clause, which filters the
left-hand rows and can't reference right-hand columns. To drop output rows
based on the values that the match returned, filter in an outer query.

When the right-hand side is a table, an `ON` predicate that references no
columns, such as `1 = 0` or a bind variable, applies to the right-hand table of
that `ON` clause: a true value has no effect, and a false value leaves every
left-hand row without a match in that table.

### Filter restrictions

- Besides the join keys, an `ON` clause can only hold predicates on its own
  right-hand table. A predicate on left-hand columns (`t.quantity > 0`), on both
  sides (`t.price > c.bid_price`), on the horizon pseudo-table
  (`h.offset > 0`) or on another right-hand table fails with
  `unsupported HORIZON join expression`. Filter left-hand rows in the `WHERE`
  clause instead.
- A subquery in the `ON` clause, such as `c.ecn IN (SELECT ...)`, fails with
  `query is not allowed here`. Move it into the right-hand subquery:
  `(core_price WHERE ecn IN (SELECT ...))`.
- A right-hand subquery can select a subset of the table's columns, in any
  order. Columns it doesn't select are not available to the rest of the query.
  It can't compute new columns, and it can rename columns only when it has no
  `WHERE` clause. A computed column, a renamed column next to a filter,
  `LIMIT` or `SAMPLE BY` fails with
  `right-hand side of HORIZON JOIN can only be a table with an optional filter`.
  `DISTINCT`, `GROUP BY` and joins fail with an error about the missing
  timestamp, such as `TIMESTAMP column is required but not provided` or
  `right side of time series join has no timestamp`. A CTE on the right-hand
  side follows the same rules.
- A false constant in the `ON` clause fails with
  `right-hand side of HORIZON JOIN can only be a table with an optional filter`
  when the right-hand side is a subquery or a CTE.

The filter runs row by row during the ASOF lookup, without
[JIT compilation](/docs/concepts/deep-dive/jit-compiler/) or symbol indexes. A
filter that few rows pass can make each lookup scan far back through the
right-hand table. In [`EXPLAIN`](/docs/query/sql/explain/) output, the filter
appears as `slave filter` under the HORIZON JOIN node.

:::warning Breaking change in QuestDB 10.1.0

Before QuestDB 10.1.0, HORIZON JOIN ignored every `ON` predicate other than the
join keys, so right-hand rows that failed it still matched, and it rejected a
filter in a right-hand subquery unless the filter was a designated timestamp
interval. See [Upgrading to QuestDB 10.1.0](#upgrading-to-questdb-1010).

:::

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

## Parallel execution

QuestDB can execute HORIZON JOIN queries in parallel on the
[query workers](/docs/configuration/shared-workers/#sharedqueryworkercount).
[`cairo.sql.parallel.horizon.join.enabled`](/docs/configuration/cairo-engine/#cairosqlparallelhorizonjoinenabled)
turns this off. Use [`EXPLAIN`](/docs/query/sql/explain/) to see the execution
plan and verify parallelization:

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
  without aggregate functions, with one or more right-hand tables
- **Async JIT Horizon Join Projection**: The same, with a
  Just-In-Time-compiled `WHERE` filter

A HORIZON JOIN without aggregate functions matches in parallel only while,
among other conditions, the number of offsets times the number of right-hand
tables is at most 100. Above that, it usually matches on a single thread and
shows as **Horizon Join Projection**, while its `WHERE` filter still runs in
parallel, as an `Async Filter` or `Async JIT Filter` node below it.

## Upgrading to QuestDB 10.1.0

QuestDB 10.1.0 changes two HORIZON JOIN behaviors. Both can change the results
of existing queries and views without an error, and some `ON` predicates that
were accepted now fail. No materialized view over a HORIZON JOIN could be valid
before 10.1.0, because the result had no designated timestamp, so there are
none to migrate. To build one now, see
[Materialized views](#materialized-views).

### Results without aggregate functions

A HORIZON JOIN without aggregate functions now returns one row per left-hand
row and offset. Before 10.1.0, it grouped its result by every selected column,
and the result had no designated timestamp. After the upgrade:

- **Queries** return more rows whenever several left-hand rows produce
  identical output rows. Add `DISTINCT` or an explicit `GROUP BY` to keep the
  previous result.
- **Outer aggregation and [PIVOT](/docs/query/sql/pivot/)** over such a query
  see every row, so `count()`, `sum()` and `avg()` return different values:
  before 10.1.0, identical rows counted once. The outer aggregation also runs
  on a single thread. To count every row and keep the aggregation parallel,
  write the aggregate functions in the HORIZON JOIN, and use `PIVOT` with
  `first()` only to reshape the result, as in
  [Permanent vs temporary impact per order](/docs/cookbook/sql/finance/implementation-shortfall-order/#permanent-vs-temporary-impact-per-order).
- **[Views](/docs/concepts/views/)** over such queries return the new rows,
  because a view runs its stored SQL.
- **`INSERT INTO ... SELECT` without a column list** fails when the query
  selects the left-hand designated timestamp at a different position than the
  target table's designated timestamp, with an error such as
  `designated timestamp of existing table (0) does not match designated
  timestamp in select query (2)`. List the target columns in the order of the
  `SELECT` list, as in the
  [`INSERT` example](#row-order-and-designated-timestamp).
- **`CREATE TABLE AS SELECT`** over a query that selects the left-hand
  designated timestamp creates a table with that column as its designated
  timestamp. Before 10.1.0, the new table had none.

### ON predicates

`ON` predicates other than the join keys now filter the right-hand table, or
fail. Before 10.1.0, HORIZON JOIN ignored them. After the upgrade:

- **Predicates on the right-hand table alone**, such as `c.ecn = 'LMAX'`, filter
  it, and the query returns different results without an error. To get the
  previous result, remove the predicate.
- **Other predicates**, of the shapes listed in
  [Filter restrictions](#filter-restrictions), fail with
  `unsupported HORIZON join expression`. To get the previous result, remove
  the predicate. Moving a left-hand predicate to the `WHERE` clause filters
  the left-hand rows, which gives a different result from before.
- **[Views](/docs/concepts/views/)** whose stored SQL has such predicates
  return different results or fail when queried. Recreate them with
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
- **ORDER BY selected columns only**: `ORDER BY` can't reference a column that
  isn't in the `SELECT` list. `ORDER BY t.price` fails with
  `ORDER BY expressions must appear in select list`. An expression over such a
  column, such as `ORDER BY t.price * 2`, is accepted. Without aggregate
  functions, it only sorts the rows. With aggregate functions, it becomes an
  extra grouping key, so the query returns one row per combination of the
  selected keys and the expression's value. Order by selected columns or their
  aliases.
- **All tables must have a designated timestamp**: The left-hand and all
  right-hand tables must each have a designated timestamp column.
- **Restricted right-hand side**: Each right-hand side of HORIZON JOIN must
  be a table with an optional filter, in one of the
  [forms in the grammar](#select-list-right-hand-side-and-on-condition). More
  complex subqueries aren't supported, see
  [Filter restrictions](#filter-restrictions).
- **Left-hand side queries are restricted as well**. On the left hand side, the
  query that works best is a table with an optional filter. Some other query
  types are also supported, but they degrade the query plan to single-threaded
  processing.
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
