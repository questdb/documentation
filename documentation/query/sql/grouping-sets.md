---
title: GROUPING SETS, ROLLUP, and CUBE
sidebar_label: GROUPING SETS
description: GROUPING SETS, ROLLUP, and CUBE SQL keyword reference for computing multiple levels of aggregation in a single query.
---

`GROUPING SETS`, `ROLLUP`, and `CUBE` compute several levels of aggregation in
one query, such as detail rows, subtotals, and a grand total. QuestDB computes
every level in a single scan of the data, instead of running a separate
`GROUP BY` per level and combining the results with `UNION ALL`.

## Syntax

Grouping sets can be used with both `GROUP BY` and `SAMPLE BY`.

```questdb-sql title="GROUP BY with ROLLUP or CUBE"
SELECT column [, ...], aggregate(column) [, ...]
FROM table
[WHERE condition]
GROUP BY [column [, ...],] { ROLLUP | CUBE } (column [, ...])
```

```questdb-sql title="GROUP BY with GROUPING SETS"
SELECT column [, ...], aggregate(column) [, ...]
FROM table
[WHERE condition]
GROUP BY GROUPING SETS ({ (column [, ...]) | () } [, ...])
```

```questdb-sql title="SAMPLE BY"
SELECT timestamp, [column [, ...],] aggregate(column) [, ...]
FROM table
[WHERE condition]
SAMPLE BY [count]unit
    { ROLLUP(column [, ...])
    | CUBE(column [, ...])
    | GROUPING SETS ({ (column [, ...]) | () } [, ...]) }
    [FROM timestamp TO timestamp]
    [FILL(...)]
    [ALIGN TO CALENDAR [TIME ZONE tz] [WITH OFFSET offset]]
```

With `GROUP BY`, plain columns can precede `ROLLUP` or `CUBE`, as described in
[Composite syntax](#composite-syntax).

With `SAMPLE BY`, the grouping clause comes directly after the sample interval,
before `FROM ... TO` and `FILL`. See
[SAMPLE BY integration](#sample-by-integration) for the rules that differ from
a regular `SAMPLE BY` query.

## GROUPING SETS

`GROUPING SETS` gives explicit control over which grouping combinations to
compute. Each set in the list produces its own group of aggregated rows.

```questdb-sql title="Explicit grouping sets" demo
SELECT symbol, side, SUM(amount) AS total_amount, COUNT(*) AS trade_count
FROM trades
WHERE timestamp IN '$now-1m..$now'
  AND symbol IN ('BTC-USDT', 'ETH-USDT')
GROUP BY GROUPING SETS (
    (symbol, side),
    (symbol),
    ()
);
```

- `(symbol, side)` groups by both columns (detail rows)
- `(symbol)` groups by symbol only (subtotals per symbol, `side` is `NULL`)
- `()` is the empty set, producing a single grand total row (both columns `NULL`)

The grand total row is returned even when no rows match the `WHERE` clause. In
that case `COUNT(*)` returns `0` and `SUM()` returns `NULL`.

You can specify any combination of column subsets. `ROLLUP` and `CUBE` are
shorthand for common `GROUPING SETS` patterns.

QuestDB does not remove duplicate grouping sets. Listing the same set twice,
as in `GROUPING SETS ((symbol), (symbol))`, returns its rows twice.

## ROLLUP

`ROLLUP` generates hierarchical subtotals, progressively dropping columns from
right to left. With N columns, `ROLLUP` produces N+1 grouping sets.

```questdb-sql title="Trade volume breakdown with ROLLUP" demo
SELECT symbol, side,
       SUM(price * amount) AS volume,
       COUNT(*) AS trades
FROM trades
WHERE timestamp IN '$now-1m..$now'
  AND symbol IN ('BTC-USDT', 'ETH-USDT')
GROUP BY ROLLUP(symbol, side)
ORDER BY symbol, side;
```

This produces:

- Per-symbol, per-side detail rows
- Per-symbol subtotals (`side` is `NULL`)
- A single grand total row (both `NULL`)

`ROLLUP(symbol, side)` is equivalent to:

```questdb-sql
GROUP BY GROUPING SETS (
    (symbol, side),
    (symbol),
    ()
)
```

With three columns, `ROLLUP(a, b, c)` produces four grouping sets:

```questdb-sql
GROUP BY GROUPING SETS (
    (a, b, c),
    (a, b),
    (a),
    ()
)
```

## CUBE

`CUBE` generates all possible combinations of the specified columns. With N
columns, `CUBE` produces 2^N grouping sets.

```questdb-sql title="Cross-tabulation with CUBE" demo
SELECT symbol, side,
       SUM(amount) AS total_amount,
       GROUPING_ID(symbol, side) AS grp
FROM trades
WHERE timestamp IN '$now-1m..$now'
  AND symbol IN ('BTC-USDT', 'ETH-USDT')
GROUP BY CUBE(symbol, side)
ORDER BY grp, symbol, side;
```

`CUBE(symbol, side)` is equivalent to:

```questdb-sql
GROUP BY GROUPING SETS (
    (symbol, side),   -- both grouped
    (symbol),         -- symbol only
    (side),           -- side only
    ()                -- grand total
)
```

Ordering by `GROUPING_ID` groups the output by aggregation level:

- `grp=0`: all detail combinations
- `grp=1`: per-symbol totals (side rolled up)
- `grp=2`: per-side totals (symbol rolled up)
- `grp=3`: grand total

`CUBE` accepts at most 15 columns. The number of grouping sets is also capped
by `cairo.sql.max.grouping.sets`, which defaults to 4096. With the default,
`CUBE` accepts at most 12 columns (2^12 = 4,096 sets). Using 13 to 15 columns
requires raising that property.

## Composite syntax

Plain `GROUP BY` columns can be combined with `ROLLUP` or `CUBE`. The plain
columns are always included in every grouping set.

```questdb-sql title="Symbol always grouped, side rolled up" demo
SELECT symbol, side, SUM(amount) AS total_amount
FROM trades
WHERE timestamp IN '$now-1m..$now'
  AND symbol IN ('BTC-USDT', 'ETH-USDT')
GROUP BY symbol, ROLLUP(side);
```

This is equivalent to:

```questdb-sql
GROUP BY GROUPING SETS (
    (symbol, side),
    (symbol)
)
```

There is no empty set `()` here because `symbol` is always present.

Plain columns must come before `ROLLUP` or `CUBE`. The following forms are
rejected:

- Columns after the construct: `GROUP BY ROLLUP(side), symbol`
- More than one construct: `GROUP BY ROLLUP(symbol), CUBE(side)`
- Plain columns with `GROUPING SETS`: `GROUP BY symbol, GROUPING SETS (...)`

For any of these, write out the sets you need with `GROUPING SETS`. For
example, `GROUP BY symbol, GROUPING SETS ((side), ())` is written as
`GROUP BY GROUPING SETS ((symbol, side), (symbol))`.

## GROUPING() and GROUPING_ID() functions

When columns are rolled up, they appear as `NULL` in the result. The data might
also contain genuine `NULL` values. `GROUPING()` and `GROUPING_ID()` distinguish
between the two.

### GROUPING(column)

Accepts a single column. Returns:

- `0` if the column is actively grouped (a `NULL` is a real data value)
- `1` if the column is rolled up (the `NULL` is a placeholder)

```questdb-sql title="Identify rolled-up rows" demo
SELECT symbol, side, SUM(amount) AS total_amount,
       GROUPING(symbol) AS gs,
       GROUPING(side) AS gsd
FROM trades
WHERE timestamp IN '$now-1m..$now'
  AND symbol IN ('BTC-USDT', 'ETH-USDT')
GROUP BY ROLLUP(symbol, side)
ORDER BY gs, gsd, symbol, side;
```

In the results:

| gs | gsd | Meaning |
| -- | --- | ------- |
| 0  | 0   | Detail row: both columns actively grouped |
| 0  | 1   | Subtotal: grouped by symbol, side rolled up |
| 1  | 1   | Grand total: both columns rolled up |

### GROUPING_ID(column1, column2, ...)

Accepts one or more columns. Returns an integer bitmask combining the
`GROUPING()` values of all specified columns. Bit positions are assigned
right-to-left: the rightmost argument occupies bit 0 (least significant bit).

```questdb-sql title="Bitmask for aggregation levels" demo
SELECT symbol, side, SUM(amount) AS total_amount,
       GROUPING_ID(symbol, side) AS grp
FROM trades
WHERE timestamp IN '$now-1m..$now'
  AND symbol IN ('BTC-USDT', 'ETH-USDT')
GROUP BY CUBE(symbol, side)
ORDER BY grp, symbol, side;
```

For `GROUPING_ID(symbol, side)`, bit 1 is assigned to `symbol` and bit 0 to
`side`:

| grp | Binary | Meaning |
| --- | ------ | ------- |
| 0   | 0b00   | Both columns grouped |
| 1   | 0b01   | `side` rolled up |
| 2   | 0b10   | `symbol` rolled up |
| 3   | 0b11   | Both rolled up (grand total) |

Writing `GROUPING_ID(side, symbol)` would reverse the bit assignments.

## SAMPLE BY integration

Grouping sets work with QuestDB's `SAMPLE BY` clause for time-bucketed
aggregation with multiple rollup levels.

```questdb-sql title="Hourly breakdown with ROLLUP" demo
SELECT timestamp, symbol, SUM(amount) AS total_amount, AVG(price) AS avg_price
FROM trades
WHERE timestamp IN '$now-1d..$now'
  AND symbol IN ('BTC-USDT', 'ETH-USDT')
SAMPLE BY 1h ROLLUP(symbol)
ORDER BY timestamp, symbol;
```

Each time bucket contains one row per symbol plus one grand total row (where
`symbol` is `NULL`). The timestamp column is never rolled up. It is always
present as the time bucket key. A bucket with no input rows produces no rows,
including no grand total row, unless `FILL` is used.

In a regular `SAMPLE BY` query, every non-aggregated column in the `SELECT`
list becomes a key. With grouping sets, this does not happen: every
non-aggregated column other than the timestamp must appear in the `ROLLUP`,
`CUBE`, or `GROUPING SETS` clause. `SAMPLE BY` also does not support
[composite syntax](#composite-syntax). To keep a column grouped at every level,
list it in each set:

```questdb-sql title="Symbol in every set, side rolled up" demo
SELECT timestamp, symbol, side, SUM(amount) AS total_amount
FROM trades
WHERE timestamp IN '$now-1d..$now'
  AND symbol IN ('BTC-USDT', 'ETH-USDT')
SAMPLE BY 1h GROUPING SETS ((symbol, side), (symbol))
ORDER BY timestamp, symbol, side;
```

`ALIGN TO FIRST OBSERVATION` is not supported with grouping sets. The `FROM`
bound of `FROM ... TO` must be a timestamp literal; functions, expressions, and
bind variables are not supported there.

### FILL support

`FILL` works with grouping sets. Missing time buckets are filled per key
combination: each distinct (symbol, grouping level) pair gets its own fill row.

```questdb-sql title="SAMPLE BY with FILL and ROLLUP" demo
SELECT timestamp, symbol, SUM(amount) AS total_amount, AVG(price) AS avg_price
FROM trades
WHERE timestamp IN '$now-1d..$now'
  AND symbol IN ('BTC-USDT', 'ETH-USDT')
SAMPLE BY 1h ROLLUP(symbol) FILL(0)
ORDER BY timestamp, symbol;
```

Supported FILL modes:

| FILL mode      | Supported |
| -------------- | --------- |
| `FILL(NONE)`   | Yes       |
| `FILL(NULL)`   | Yes       |
| `FILL(value)`  | Yes       |
| `FILL(PREV)`   | No        |
| `FILL(LINEAR)` | No        |

`GROUPING()` and `GROUPING_ID()` values are preserved in fill rows. They are not
replaced by the fill value.

```questdb-sql title="GROUPING values preserved in fill rows" demo
SELECT GROUPING(symbol) AS gs, timestamp, symbol, SUM(amount) AS total_amount
FROM trades
WHERE timestamp IN '$now-1d..$now'
  AND symbol IN ('BTC-USDT', 'ETH-USDT')
SAMPLE BY 1h ROLLUP(symbol) FILL(NULL)
ORDER BY timestamp, gs, symbol;
```

A fill row for a missing hour shows `gs=0` for detail-level fills and `gs=1` for
grand-total-level fills, just like real data rows. Only aggregate columns get the
fill value.

## Execution

QuestDB computes all grouping sets in a single scan of the input. When
[parallel GROUP BY](/docs/configuration/cairo-engine/#cairosqlparallelgroupbyenabled)
is enabled, the query runs on multiple worker threads, and `EXPLAIN` shows an
`Async Group By` node with `groupingSets: true`. Queries with more than 31 key
columns, or with many grouping sets relative to the number of query workers,
run on a single thread.

Grouping sets aggregation is never vectorized. When you only need one level of
aggregation, a plain `GROUP BY` over the same keys can be faster.

Rows are not returned in any guaranteed order. Use `ORDER BY` when order
matters.

## Limitations

- **Expressions not allowed** in `ROLLUP`, `CUBE`, or `GROUPING SETS`. Only
  column references are accepted, so `ROLLUP(a + b)` is rejected, and so is a
  `SELECT` alias of an expression. Compute the expression in a subquery and
  group by its output column instead. Plain columns in composite syntax
  (`GROUP BY expr, ROLLUP(col)`) are not restricted.

- **No mixed qualified/unqualified references** to the same column.
  `ROLLUP(a, t.a)` is rejected. Use one form consistently.

- **One `ROLLUP` or `CUBE` per `GROUP BY`**, placed last.
  `GROUP BY ROLLUP(a), CUBE(b)` and `GROUP BY ROLLUP(a), b` are rejected, and
  `GROUPING SETS` cannot be combined with plain columns. See
  [Composite syntax](#composite-syntax).

- **Not supported with `LATEST ON`**. Rejected with an error.

- **Not supported in materialized views**. A
  [materialized view](/docs/concepts/materialized-views/) query cannot use
  `GROUPING SETS`, `ROLLUP`, or `CUBE`.

- **`FILL(PREV)` and `FILL(LINEAR)` not supported** with grouping sets.

- **`ALIGN TO FIRST OBSERVATION` not supported** with grouping sets in
  `SAMPLE BY`.

- **`SAMPLE BY ... FROM` requires a timestamp literal**. Functions,
  expressions, and bind variables in the `FROM` bound are not supported with
  grouping sets.

- **`GROUPING()` / `GROUPING_ID()` limited to 31 `GROUP BY` key columns**. The
  bitmask is int-based.

- **Maximum grouping sets per query**, controlled by the
  [`cairo.sql.max.grouping.sets`](/docs/configuration/cairo-engine/#cairosqlmaxgroupingsets)
  configuration property (default 4096). `ROLLUP` produces N+1 sets, `CUBE`
  produces 2^N sets, and explicit `GROUPING SETS` produces one set per listed
  group. Queries exceeding this limit are rejected at parse time. `CUBE` also
  has a hard limit of 15 columns, so with the default it accepts at most 12.

## See also

- [GROUP BY](/docs/query/sql/group-by/) - Standard grouping
- [SAMPLE BY](/docs/query/sql/sample-by/) - Time-series aggregation
- [PIVOT](/docs/query/sql/pivot/) - Transform GROUP BY results from rows to columns
- [Aggregation functions](/docs/query/functions/aggregation/) - Available aggregate functions
