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

It is a variant of the [`JOIN` keyword](/docs/query/sql/join/) that combines
[ASOF JOIN](/docs/query/sql/asof-join/) matching with a set of forward (or
backward) time offsets, computing aggregations at each offset in a single pass.

## Syntax

### RANGE form

Generate offsets at regular intervals from `FROM` to `TO` (inclusive) with the
given `STEP`:

```questdb-sql title="HORIZON JOIN with RANGE"
SELECT [<keys>,] <aggregations>
FROM <left_table> AS <left_alias>
HORIZON JOIN <right_table> AS <right_alias> [ON (<join_keys>)]
RANGE FROM <from_expr> TO <to_expr> STEP <step_expr> AS <horizon_alias>
[WHERE <left_table_filter>]
[GROUP BY <keys>]
[ORDER BY ...]
```

For example, `RANGE FROM 0s TO 5m STEP 1m` generates offsets at 0s, 1m, 2m,
3m, 4m, 5m.

### LIST form

Specify explicit offsets as interval literals:

```questdb-sql title="HORIZON JOIN with LIST"
SELECT [<keys>,] <aggregations>
FROM <left_table> AS <left_alias>
HORIZON JOIN <right_table> AS <right_alias> [ON (<join_keys>)]
LIST (<offset_expr>, ...) AS <horizon_alias>
[WHERE <left_table_filter>]
[GROUP BY <keys>]
[ORDER BY ...]
```

For example, `LIST (0, 1s, 5s, 30s, 1m)` generates offsets at those specific
points. Offsets must be monotonically increasing. Unitless `0` is allowed as
shorthand for zero offset.

## How it works

For each row in the left-hand table and each offset in the horizon:

1. Compute `left_timestamp + offset`
2. Perform an ASOF match against the right-hand table at that computed timestamp
3. When join keys are provided (via `ON`), only right-hand rows matching the
   keys are considered

Results are implicitly grouped by the non-aggregate SELECT columns (horizon
offset, left-hand table keys, etc.), and aggregate functions are applied across
all matched rows.

## The horizon pseudo-table

The `RANGE` or `LIST` clause defines a virtual table of time offsets, aliased by
the `AS` clause. This pseudo-table exposes two columns:

| Column | Type | Description |
|--------|------|-------------|
| `<alias>.offset` | `LONG` | The offset value in the left-hand table's designated timestamp resolution. For example, with microsecond timestamps, `h.offset / 1000000` converts to seconds; with nanosecond timestamps, `h.offset / 1000000000` converts to seconds or `h.offset / 1000000` converts to milliseconds. |
| `<alias>.timestamp` | `TIMESTAMP` | The computed horizon timestamp (`left_timestamp + offset`). Available for grouping or expressions. |

## Interval units

All offset values in `RANGE` (`FROM`, `TO`, `STEP`) and `LIST` **must include a
unit suffix**. Bare numbers are not valid — write `5s`, not `5` or `5000000000`.
The only exception is `0`, which is allowed without a unit as shorthand for zero
offset.

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
(e.g., `1800000000000` for 30 minutes in nanoseconds), not the interval literal.

## GROUP BY rules

HORIZON JOIN queries always require aggregate functions in the `SELECT` list.
The `GROUP BY` clause is optional — when omitted, results are implicitly grouped
by all non-aggregate `SELECT` columns. When `GROUP BY` is present, it follows
stricter rules than regular `GROUP BY`:

- Each `GROUP BY` expression must **exactly match** a non-aggregate `SELECT`
  expression (with table prefix tolerance, e.g., `t.symbol` matches `symbol`)
  or a `SELECT` column alias.
- Every non-aggregate `SELECT` column must appear in `GROUP BY`.
- Column index references are supported (e.g., `GROUP BY 1, 2`).

For example, if the `SELECT` list contains `h.offset / 1000000000 AS
horizon_sec`, the `GROUP BY` must use either the alias `horizon_sec` or the full
expression `h.offset / 1000000000` — using just `h.offset` is not valid because
it does not exactly match any non-aggregate `SELECT` expression.

## Examples

The examples below use the [demo dataset](/docs/cookbook/demo-data-schema/) tables
`fx_trades` (trade executions) and `market_data` (order book snapshots with 2D
arrays for bids/asks).

### Post-trade markout at uniform horizons

Measure the average mid-price at 1-second intervals after each trade — a classic
way to evaluate execution quality and price impact:

```questdb-sql title="Post-trade markout curve"
SELECT
    h.offset / 1000000000 AS horizon_sec,
    t.symbol,
    avg((m.best_bid + m.best_ask) / 2) AS avg_mid
FROM fx_trades AS t
HORIZON JOIN market_data AS m ON (symbol)
RANGE FROM 1s TO 1m STEP 1s AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY t.symbol, horizon_sec;
```

Since `fx_trades` uses nanosecond timestamps (`TIMESTAMP_NS`), `h.offset` is in
nanoseconds. Dividing by 1,000,000,000 converts to seconds.

### Markout P&L at non-uniform horizons

Compute the average post-trade markout at specific horizons using `LIST`:

```questdb-sql title="Markout at specific time points"
SELECT
    h.offset / 1000000000 AS horizon_sec,
    t.symbol,
    avg((m.best_bid + m.best_ask) / 2 - t.price) AS avg_markout
FROM fx_trades AS t
HORIZON JOIN market_data AS m ON (symbol)
LIST (1s, 5s, 30s, 1m) AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY t.symbol, horizon_sec;
```

### Pre- and post-trade price movement

Use negative offsets to see price levels before and after trades — useful for
detecting information leakage or adverse selection:

```questdb-sql title="Price movement around trade events"
SELECT
    h.offset / 1000000000 AS horizon_sec,
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

Compute an overall volume-weighted markout without grouping by symbol:

```questdb-sql title="Volume-weighted markout across all symbols"
SELECT
    h.offset / 1000000000 AS horizon_sec,
    sum(((m.best_bid + m.best_ask) / 2 - t.price) * t.quantity)
        / sum(t.quantity) AS vwap_markout
FROM fx_trades AS t
HORIZON JOIN market_data AS m ON (symbol)
RANGE FROM 1s TO 1m STEP 1s AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY horizon_sec;
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

```questdb-sql title="Analyze HORIZON JOIN execution plan"
EXPLAIN SELECT
    h.offset / 1000000000 AS horizon_sec,
    t.symbol,
    avg((m.best_bid + m.best_ask) / 2) AS avg_mid
FROM fx_trades AS t
HORIZON JOIN market_data AS m ON (symbol)
RANGE FROM 1s TO 1m STEP 1s AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY t.symbol, horizon_sec;
```

Look for these indicators in the plan:

- **Async Horizon Join**: Parallel execution using Java-evaluated expressions
- **Async JIT Horizon Join**: Parallel execution using Just-In-Time-compiled
  expressions for better performance

## Current limitations

- **No other joins**: HORIZON JOIN cannot be combined with other joins in the
  same level of the query. Joins can be done in an outer query.
- **No window functions**: Window functions cannot be used in HORIZON JOIN
  queries. Wrap the HORIZON JOIN in a subquery and apply window functions in the
  outer query.
- **No SAMPLE BY**: `SAMPLE BY` cannot be used with HORIZON JOIN. Use `GROUP BY`
  with a time-bucketing expression instead.
- **WHERE filters left-hand table only**: The `WHERE` clause can only reference
  columns from the left-hand table. References to right-hand table columns or
  horizon pseudo-table columns (`h.offset`, `h.timestamp`) are not allowed.
- **Both tables must have a designated timestamp**: The left-hand and right-hand
  tables must each have a designated timestamp column.
- **Right-hand side must be a table**: The right-hand side of HORIZON JOIN must
  be a table, not a subquery.
- **RANGE constraints**: `STEP` must be positive; `FROM` must be less than or
  equal to `TO`.
- **LIST constraints**: Offsets must be interval literals (e.g., `1s`, `-2m`,
  `0`) and monotonically increasing.

:::info Related documentation
- [ASOF JOIN](/docs/query/sql/asof-join/)
- [JOIN](/docs/query/sql/join/)
- [PIVOT](/docs/query/sql/pivot/)
- [SAMPLE BY](/docs/query/sql/sample-by/)
- [Markout analysis recipe](/docs/cookbook/sql/finance/markout/)
:::
