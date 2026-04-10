---
title: GROUPING SETS, ROLLUP, and CUBE
sidebar_label: GROUPING SETS
description: GROUPING SETS, ROLLUP, and CUBE SQL keyword reference for computing multiple levels of aggregation in a single query.
---

`GROUPING SETS`, `ROLLUP`, and `CUBE` perform aggregation over multiple
dimensions within a single query. This can be used, for example, to compute
subtotals and grand totals alongside detail-level results, without multiple
passes over the data.

## Syntax

Grouping sets can be used with both `GROUP BY` and `SAMPLE BY`.

With `GROUP BY`:

```questdb-sql
SELECT column [, ...], aggregate(column) [, ...]
FROM table
[WHERE condition]
GROUP BY
    column [, ...],
    ROLLUP(column [, ...])
    | CUBE(column [, ...])
    | GROUPING SETS ((column [, ...]) [, ...])
```

With `SAMPLE BY`:

```questdb-sql
SELECT [column [, ...],] aggregate(column) [, ...]
FROM table
[WHERE condition]
SAMPLE BY n{units}
    [ROLLUP(column [, ...]) | CUBE(column [, ...]) | GROUPING SETS (...)]
    [FILL(...)]
    [ALIGN TO ...]
```

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

You can specify any combination of column subsets. `ROLLUP` and `CUBE` are
shorthand for common `GROUPING SETS` patterns.

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

`CUBE` is limited to 15 columns maximum (2^15 = 32,768 grouping sets).

## Composite syntax

Plain `GROUP BY` columns can be combined with `ROLLUP` or `CUBE`. The plain
columns are always included in every grouping set.

```questdb-sql title="symbol always grouped, side rolled up" demo
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
`symbol` is `NULL`). The timestamp column is never rolled up - it is always
present as the time bucket key.

### FILL support

`FILL` works with grouping sets. Missing time buckets are filled per key
combination - each distinct (symbol, grouping level) pair gets its own fill row.

```questdb-sql title="SAMPLE BY with FILL and ROLLUP" demo
SELECT timestamp, symbol, SUM(amount) AS total_amount, AVG(price) AS avg_price
FROM trades
WHERE timestamp IN '$now-1d..$now'
  AND symbol IN ('BTC-USDT', 'ETH-USDT')
SAMPLE BY 1h ROLLUP(symbol) FILL(0)
ORDER BY timestamp, symbol;
```

Supported FILL modes:

| FILL mode    | Supported |
| ------------ | --------- |
| `FILL(NONE)` | Yes       |
| `FILL(NULL)` | Yes       |
| `FILL(value)` | Yes      |
| `FILL(PREV)` | No        |
| `FILL(LINEAR)` | No      |

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

## Limitations

- **Expressions not allowed** in `ROLLUP`, `CUBE`, or `GROUPING SETS` - only
  column references are accepted. `ROLLUP(a + b)` is rejected; use a subquery or
  alias. Plain columns in composite syntax (`GROUP BY expr, ROLLUP(col)`) are not
  restricted.

- **No mixed qualified/unqualified references** to the same column -
  `ROLLUP(a, t.a)` is rejected. Use one form consistently.

- **Not supported with `LATEST ON`** - rejected with an error.

- **`FILL(PREV)` and `FILL(LINEAR)` not supported** with grouping sets.

- **`CUBE` limited to 15 columns** (2^15 = 32,768 grouping sets).

- **`GROUPING()` / `GROUPING_ID()` limited to 31 `GROUP BY` key columns** - the
  bitmask is int-based.

- **No multiple `ROLLUP`/`CUBE` in the same `GROUP BY`** -
  `GROUP BY ROLLUP(a), CUBE(b)` is not supported.

- **Maximum grouping sets per query** - controlled by the
  `cairo.sql.max.grouping.sets`
  [configuration property](/docs/configuration/overview/) (default 4096).
  `ROLLUP` produces N+1 sets, `CUBE` produces 2^N sets, and explicit
  `GROUPING SETS` produces one set per listed group. Queries exceeding this limit
  are rejected at parse time.

## See also

- [GROUP BY](/docs/query/sql/group-by/) - Standard grouping
- [SAMPLE BY](/docs/query/sql/sample-by/) - Time-series aggregation
- [PIVOT](/docs/query/sql/pivot/) - Transform GROUP BY results from rows to columns
- [Aggregation functions](/docs/query/functions/aggregation/) - Available aggregate functions
