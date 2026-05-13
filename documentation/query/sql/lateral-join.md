---
title: LATERAL JOIN keyword
sidebar_label: LATERAL JOIN
description:
  Learn how to use LATERAL JOIN in QuestDB to run a subquery once per outer
  row, with examples for top-N per group, per-row aggregates, and dynamic
  filters.
---

`LATERAL JOIN` allows a subquery on the right-hand side of a join to reference
columns from tables that appear earlier in the `FROM` clause. Conceptually the
subquery is evaluated once for every outer row, with the outer columns acting
as parameters. This unlocks queries that would otherwise require correlated
subqueries, window functions, or self-joins, such as:

- Top-N rows per group (e.g. the three largest fills for each order).
- Per-row aggregates that depend on values from the outer row.
- Dynamic filters whose thresholds come from the outer row.
- Combining a `SAMPLE BY`, `LATEST ON`, or `ASOF JOIN` with per-row
  parameters from the outer table.

It is a variant of the [`JOIN` keyword](/docs/query/sql/join/) and shares many
of its execution traits. Under the hood, QuestDB rewrites correlated lateral
subqueries into standard joins, so they execute as set-based operations rather
than nested loops.

## Syntax

`LATERAL` is a modifier on `JOIN`. It can be combined with `INNER`, `LEFT`, and
`CROSS` joins. Right and full outer variants are not supported.

```questdb-sql title="INNER lateral"
SELECT ...
FROM left_table [alias]
[INNER] JOIN LATERAL (subquery) [alias] [ON condition];
```

```questdb-sql title="LEFT lateral (unmatched outer rows kept, right columns become NULL)"
SELECT ...
FROM left_table [alias]
LEFT [OUTER] JOIN LATERAL (subquery) [alias] [ON condition];
```

```questdb-sql title="CROSS lateral (no ON clause)"
SELECT ...
FROM left_table [alias]
CROSS JOIN LATERAL (subquery) [alias];
```

```questdb-sql title="Comma syntax (implicit CROSS)"
SELECT ...
FROM left_table [alias],
     LATERAL (subquery) [alias];
```

The subquery body can reference columns from any table that appears to its
left in the `FROM` clause. References to outer columns must be qualified with
the outer alias (e.g. `o.id`) when the inner subquery would otherwise resolve
the name to one of its own columns.

:::note

`LATERAL` always requires a parenthesised subquery. A bare table reference
after `JOIN LATERAL` is rejected with `LATERAL requires a subquery`.

`LATERAL` is only valid with `INNER`, `LEFT`, or `CROSS` joins. Using it with
`RIGHT` or `FULL OUTER` joins fails with
`LATERAL is only supported with INNER, LEFT, or CROSS joins`.

:::

### INNER vs CROSS LATERAL

For most practical purposes, `INNER JOIN LATERAL` and `CROSS JOIN LATERAL`
(including the comma syntax) behave identically. The correlation between the
outer row and the subquery is expressed inside the subquery's `WHERE` clause,
not in an `ON` condition.

The only difference is that `INNER JOIN LATERAL` *allows* an optional `ON`
clause while `CROSS JOIN LATERAL` does not. In practice, `ON` is rarely
needed because the whole point of `LATERAL` is that the subquery itself
filters using outer-row columns.

`LEFT JOIN LATERAL` is distinct: it preserves outer rows that have no
matching subquery results, returning `NULL` for the subquery's columns.

## Examples

The examples in this section all run against the following schema and data,
unless a section explicitly defines additional tables:

```questdb-sql
CREATE TABLE orders (
    id        INT,
    desk      SYMBOL,
    min_qty   DOUBLE,
    ts        TIMESTAMP
) TIMESTAMP(ts) PARTITION BY DAY;

CREATE TABLE fills (
    id        INT,
    order_id  INT,
    qty       DOUBLE,
    ts        TIMESTAMP
) TIMESTAMP(ts) PARTITION BY DAY;

INSERT INTO orders VALUES
    (1, 'eq',  15.0, '2024-01-01T00:00:00.000000Z'),
    (2, 'fi',  35.0, '2024-01-01T01:00:00.000000Z'),
    (3, 'cmd',  5.0, '2024-01-01T02:00:00.000000Z');

INSERT INTO fills VALUES
    (1, 1, 10.0, '2024-01-01T00:10:00.000000Z'),
    (2, 1, 20.0, '2024-01-01T00:40:00.000000Z'),
    (3, 1, 30.0, '2024-01-01T01:10:00.000000Z'),
    (4, 2, 40.0, '2024-01-01T01:10:00.000000Z'),
    (5, 2, 50.0, '2024-01-01T01:40:00.000000Z');
```

Order 1 (equities desk) has three fills, order 2 (fixed income) has two fills,
and order 3 (commodities) has none.

### Per-row scan with `INNER JOIN LATERAL`

For each order, return every matching fill. The commodities desk has no fills
and is dropped because this is an inner join:

```questdb-sql
SELECT o.id, o.desk, t.qty
FROM orders o
JOIN LATERAL (
    SELECT qty FROM fills WHERE order_id = o.id
) t
ORDER BY o.id, t.qty;
```

| id | desk | qty  |
| -- | -------- | ---- |
| 1  | eq    | 10.0 |
| 1  | eq    | 20.0 |
| 1  | eq    | 30.0 |
| 2  | fi      | 40.0 |
| 2  | fi      | 50.0 |

### Preserving outer rows with `LEFT JOIN LATERAL`

`LEFT JOIN LATERAL` keeps every outer row even when the subquery is empty:

```questdb-sql
SELECT o.id, o.desk, t.qty
FROM orders o
LEFT JOIN LATERAL (
    SELECT qty FROM fills WHERE order_id = o.id
) t
ORDER BY o.id, t.qty;
```

| id | desk | qty  |
| -- | -------- | ---- |
| 1  | eq    | 10.0 |
| 1  | eq    | 20.0 |
| 1  | eq    | 30.0 |
| 2  | fi      | 40.0 |
| 2  | fi      | 50.0 |
| 3  | cmd  | null |

When the subquery aggregates with `count(*)`, missing groups are reported as
`0` rather than `NULL` so totals stay numeric. Other aggregates such as
`sum()` keep their natural empty-set semantics and return `NULL`:

```questdb-sql
SELECT o.id, t.cnt
FROM orders o
LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM fills WHERE order_id = o.id
) t
ORDER BY o.id;
```

| id | cnt |
| -- | --- |
| 1  | 3   |
| 2  | 2   |
| 3  | 0   |

### Top-N per group

A common use of `LATERAL JOIN` is selecting the top-N rows per outer row,
which is awkward with `GROUP BY` alone. Pair an `ORDER BY` with `LIMIT`
inside the subquery — both apply independently to each outer row's matches:

```questdb-sql
SELECT o.id, o.desk, t.qty
FROM orders o
JOIN LATERAL (
    SELECT qty
    FROM fills
    WHERE order_id = o.id
    ORDER BY qty DESC
    LIMIT 2
) t
ORDER BY o.id, t.qty DESC;
```

| id | desk | qty  |
| -- | -------- | ---- |
| 1  | eq    | 30.0 |
| 1  | eq    | 20.0 |
| 2  | fi      | 50.0 |
| 2  | fi      | 40.0 |

### Per-row aggregates

Aggregating inside the subquery returns one row per outer row:

```questdb-sql
SELECT o.id, o.desk, t.total_qty
FROM orders o
JOIN LATERAL (
    SELECT sum(qty) AS total_qty
    FROM fills
    WHERE order_id = o.id
) t
ORDER BY o.id;
```

| id | desk | total_qty |
| -- | -------- | --------- |
| 1  | eq    | 60.0      |
| 2  | fi      | 90.0      |

This particular query is equivalent to a regular `GROUP BY` join — the inner
subquery only references the outer row through an equality. `LATERAL JOIN`
becomes essential when the subquery needs the outer row in less trivial ways,
as in the next example.

### Dynamic filters using outer-row values

The subquery can reference any outer column in its `WHERE`, including in
non-equality predicates. Below, each order's `min_qty` is used as a per-row
threshold for the fills it sums:

```questdb-sql
SELECT o.id, o.desk, t.total_qty
FROM orders o
JOIN LATERAL (
    SELECT sum(qty) AS total_qty
    FROM fills
    WHERE order_id = o.id
      AND qty > o.min_qty
) t
ORDER BY o.id;
```

| id | desk | total_qty |
| -- | -------- | --------- |
| 1  | eq    | 50.0      |
| 2  | fi      | 90.0      |

The equities desk fills above 15 are 20 and 30 (sum 50); the fixed income desk
fills above 35 are 40 and 50 (sum 90). The commodities desk has no fills and
is dropped by the inner join.

### Window functions inside `LATERAL`

The subquery may contain window functions. The window's `PARTITION BY` and
`ORDER BY` are evaluated independently for each outer row, so a single
`OVER (ORDER BY ts)` becomes a per-order running total:

```questdb-sql
SELECT o.id, t.qty, t.running_total
FROM orders o
JOIN LATERAL (
    SELECT qty,
           sum(qty) OVER (ORDER BY ts) AS running_total
    FROM fills
    WHERE order_id = o.id
) t
ORDER BY o.id, t.qty;
```

| id | qty  | running_total |
| -- | ---- | ------------- |
| 1  | 10.0 | 10.0          |
| 1  | 20.0 | 30.0          |
| 1  | 30.0 | 60.0          |
| 2  | 40.0 | 40.0          |
| 2  | 50.0 | 90.0          |

### `SAMPLE BY` inside `LATERAL`

The following examples use the [`fx_trades`](https://demo.questdb.io/) and
`core_price` tables from the QuestDB demo instance.

Each outer row gets its own sampled time-series. Here we compute a 1-hour
volume profile per symbol for the most recently traded symbols:

```questdb-sql title="Per-symbol hourly volume" demo
SELECT t.symbol, sub.ts, sub.volume
FROM (
    SELECT * FROM fx_trades
    LATEST ON timestamp PARTITION BY symbol
) t
JOIN LATERAL (
    SELECT timestamp AS ts, sum(quantity) AS volume
    FROM fx_trades
    WHERE symbol = t.symbol
      AND timestamp IN '$now-6h..$now'
    SAMPLE BY 1h
) sub
ORDER BY t.symbol, sub.ts;
```

### `LATEST ON` inside `LATERAL`

`LATEST ON ... PARTITION BY` returns the latest record per partition. Inside
a `LATERAL` subquery, the partitions are computed independently for each
outer row. Here, for each symbol we find the latest trade on each side
(buy/sell):

```questdb-sql title="Latest trade per side for each symbol" demo
SELECT t.symbol, sub.side, sub.price, sub.quantity
FROM (
    SELECT DISTINCT symbol FROM fx_trades
    WHERE timestamp IN '$now-1h..$now'
) t
JOIN LATERAL (
    SELECT side, price, quantity
    FROM fx_trades
    WHERE symbol = t.symbol
    LATEST ON timestamp PARTITION BY side
) sub
ORDER BY t.symbol, sub.side;
```

### `ASOF JOIN` inside `LATERAL`

Combine `LATERAL` with `ASOF JOIN` to enrich each symbol's recent trades with
the prevailing bid/ask from the `core_price` table. For each symbol's latest
trade, the subquery finds the top 3 trades by quantity in the last minute and
attaches the corresponding quote:

```questdb-sql title="Top fills with prevailing quotes per symbol" demo
SELECT
    t.symbol,
    sub.timestamp,
    sub.side,
    sub.price,
    sub.quantity,
    sub.ecn,
    sub.bid_price,
    sub.ask_price
FROM (
    SELECT * FROM fx_trades
    LATEST ON timestamp PARTITION BY symbol
) t
JOIN LATERAL (
    SELECT
        f.timestamp, f.side, f.price,
        f.quantity, f.ecn,
        c.bid_price, c.ask_price
    FROM fx_trades f
    ASOF JOIN core_price c
        ON (f.symbol = c.symbol AND f.ecn = c.ecn)
    WHERE f.symbol = t.symbol
        AND f.timestamp IN '$now-1m..$now'
    ORDER BY f.quantity DESC
    LIMIT 3
) sub;
```

For each symbol, the three largest recent trades are returned alongside
the prevailing bid and ask from the same ECN at the time of the trade.

### `UNION ALL` of correlated branches

Each branch of a `UNION` / `UNION ALL` may reference outer columns
independently. The example below splits each order's fills into "small"
and "large" buckets in a single subquery:

```questdb-sql
SELECT o.id, t.qty, t.bucket
FROM orders o
JOIN LATERAL (
    SELECT qty, 'small' AS bucket FROM fills
        WHERE order_id = o.id AND qty < 30
    UNION ALL
    SELECT qty, 'large' AS bucket FROM fills
        WHERE order_id = o.id AND qty >= 30
) t
ORDER BY o.id, t.qty;
```

| id | qty  | bucket |
| -- | ---- | ------ |
| 1  | 10.0 | small  |
| 1  | 20.0 | small  |
| 1  | 30.0 | large  |
| 2  | 40.0 | large  |
| 2  | 50.0 | large  |

### Standalone `LATERAL` (implicit `CROSS`)

`LATERAL` may appear directly in a comma-separated `FROM` list. This is
equivalent to `CROSS JOIN LATERAL`:

```questdb-sql
SELECT o.id, t.qty
FROM orders o,
     LATERAL (SELECT qty FROM fills WHERE order_id = o.id) t
ORDER BY o.id, t.qty;
```

This produces the same `id`/`qty` pairs as the per-row scan example above —
only the syntax differs.

### Multiple correlation columns

The subquery can correlate on more than one outer column at the same time.
This example uses an alternate schema to show how a master/detail
relationship keyed on `(mm_id, symbol)` can drive a per-row aggregate:

```questdb-sql
CREATE TABLE master (
    mm_id  INT,
    symbol STRING,
    ts     TIMESTAMP
) TIMESTAMP(ts) PARTITION BY DAY;

CREATE TABLE detail (
    mm_id  INT,
    symbol STRING,
    qty    DOUBLE,
    ts     TIMESTAMP
) TIMESTAMP(ts) PARTITION BY DAY;
```

```questdb-sql
SELECT m.mm_id, m.symbol, t.total
FROM master m
LEFT JOIN LATERAL (
    SELECT sum(qty) AS total
    FROM detail
    WHERE mm_id = m.mm_id
      AND symbol = m.symbol
) t
ORDER BY m.mm_id;
```

## Restrictions

- `LATERAL` requires a parenthesised subquery — bare table references are
  rejected.
- `LATERAL` may only modify `INNER`, `LEFT`, or `CROSS` joins. `RIGHT JOIN
  LATERAL` and `FULL OUTER JOIN LATERAL` are not supported.
- `CROSS JOIN LATERAL` does not accept an `ON` clause, in line with regular
  `CROSS JOIN`.

## How it executes

QuestDB's optimiser rewrites correlated lateral subqueries into standard joins
during query planning, so they execute set-based rather than as a per-row
nested loop. The rewrite preserves semantics for `GROUP BY`, `SAMPLE BY`,
`DISTINCT`, `LIMIT`, window functions, `LATEST ON`, and set operations
(`UNION` / `INTERSECT` / `EXCEPT`). When every correlation reduces to an
equality, the lateral is further reduced to a plain hash join.

You can inspect the rewritten plan with [`EXPLAIN`](/docs/query/sql/explain/)
to see the join strategy QuestDB chose for a given query.
