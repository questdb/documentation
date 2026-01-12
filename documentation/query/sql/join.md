---
title: JOIN keyword
sidebar_label: JOIN
description: JOIN SQL keyword reference documentation.
---

QuestDB supports the type of joins you can frequently find in
[relational databases](/glossary/relational-database/): `INNER`, `LEFT (OUTER)`,
`CROSS`. Additionally, it implements joins which are particularly useful for
time-series analytics: `ASOF`, `LT`, `SPLICE`, and `WINDOW`. `FULL` joins are
not yet implemented and are on our roadmap.

All supported join types can be combined in a single SQL statement; QuestDB
SQL's optimizer determines the best execution order and algorithms.

There are no known limitations on the size of tables or sub-queries used in
joins and there are no limitations on the number of joins, either.

## Syntax

High-level overview:

![Flow chart showing the syntax of the high-level syntax of the JOIN keyword](/images/docs/diagrams/joinOverview.svg)

- `selectClause` - see [SELECT](/docs/query/sql/select/) for more
  information.
- `whereClause` - see [WHERE](/docs/query/sql/where/) for more information.
- The specific syntax for `joinClause` depends on the type of `JOIN`:

  - `INNER` and `LEFT` `JOIN` has a mandatory `ON` clause allowing arbitrary
    `JOIN` predicates, `operator`:

  ![Flow chart showing the syntax of the INNER, LEFT JOIN keyword](/images/docs/diagrams/InnerLeftJoin.svg)

  - `ASOF`, `LT`, and `SPLICE` `JOIN` has optional `ON` clause allowing only the
    `=` predicate. 
  - `ASOF` and `LT` join additionally allows an optional `TOLERANCE` clause:

  ![Flow chart showing the syntax of the ASOF, LT, and SPLICE JOIN keyword](/images/docs/diagrams/AsofLtSpliceJoin.svg)

  - `CROSS JOIN` does not allow any `ON` clause:

  ![Flow chart showing the syntax of the CROSS JOIN keyword](/images/docs/diagrams/crossJoin.svg)

Columns from joined tables are combined in a single row. Columns with the same
name originating from different tables will be automatically aliased to create a
unique column namespace of the resulting set.

Though it is usually preferable to explicitly specify join conditions, QuestDB
will analyze `WHERE` clauses for implicit join conditions and will derive
transient join conditions where necessary.

## Execution order

Join operations are performed in order of their appearance in a SQL query. The
following query performs a join on a table with a very small table (just one row
in this example) and a bigger table with 10 million rows:

```questdb-sql
WITH
  Manytrades AS
    (SELECT * FROM trades limit 10000000),
  Lookup AS
    (SELECT  'BTC-USD' AS Symbol, 'Bitcoin/USD Pair' AS Description)
SELECT *
FROM Lookup
INNER JOIN ManyTrades
  ON Lookup.symbol = Manytrades.symbol;
```

The performance of this query can be improved by rewriting the query as follows:

```questdb-sql
WITH
  Manytrades AS
    (SELECT * FROM trades limit 10000000),
  Lookup AS
    (SELECT  'BTC-USD' AS Symbol, 'Bitcoin/USD Pair' AS Description)
SELECT *
FROM ManyTrades
INNER JOIN Lookup
  ON Lookup.symbol = Manytrades.symbol;
```

As a general rule, whenever you have a table significantly larger than the
other, try to use the large one first. If you use `EXPLAIN` with the queries
above, you should see the first version needs to Hash over 10 million rows,
while the second version needs to Hash only over 1 row.

## Implicit joins

It is possible to join two tables using the following syntax:

```questdb-sql
SELECT *
FROM a, b
WHERE a.id = b.id;
```

The type of join as well as the column are inferred from the `WHERE` clause, and
may be either an `INNER` or `CROSS` join. For the example above, the equivalent
explicit statement would be:

```questdb-sql
SELECT *
FROM a
JOIN b ON (id);
```

## Using the `ON` clause for the `JOIN` predicate

When tables are joined on a column that has the same name in both tables you can
use the `ON (column)` shorthand.

When the `ON` clause is permitted (all except `CROSS JOIN`), it is possible to
join multiple columns.

For example, the following two tables contain identical column names `symbol`
and `side`:

`mayTrades`:

<div className="pink-table">

| symbol  | side | total  |
| ------- | ---- | ------ |
| ADA-BTC | buy  | 8079   |
| ADA-BTC | sell | 7678   |
| ADA-USD | buy  | 308271 |
| ADA-USD | sell | 279624 |

</div>

`juneTrades`:

<div className="blue-table">

| symbol  | side | total  |
| ------- | ---- | ------ |
| ADA-BTC | buy  | 10253  |
| ADA-BTC | sell | 17460  |
| ADA-USD | buy  | 312359 |
| ADA-USD | sell | 245066 |

</div>

It is possible to add multiple JOIN ON condition:

```questdb-sql
WITH
  mayTrades AS (
    SELECT symbol, side, COUNT(*) as total
    FROM trades
    WHERE timestamp in '2024-05'
    ORDER BY Symbol
    LIMIT 4
  ),
  juneTrades AS (
    SELECT symbol, side, COUNT(*) as total
    FROM trades
    WHERE timestamp in '2024-06'
    ORDER BY Symbol
    LIMIT 4
  )
SELECT *
FROM mayTrades
JOIN JuneTrades
  ON mayTrades.symbol = juneTrades.symbol
    AND mayTrades.side = juneTrades.side;
```

The query can be simplified further since the column names are identical:

```questdb-sql
WITH
  mayTrades AS (
    SELECT symbol, side, COUNT(*) as total
    FROM trades
    WHERE timestamp in '2024-05'
    ORDER BY Symbol
    LIMIT 4
  ),
  juneTrades AS (
    SELECT symbol, side, COUNT(*) as total
    FROM trades
    WHERE timestamp in '2024-06'
    ORDER BY Symbol
    LIMIT 4
  )
SELECT *
FROM mayTrades
JOIN JuneTrades ON (symbol, side);
```

The result of both queries is the following:

<div className="table-alternate">

| symbol  | symbol1 | side | side1 | total  | total1 |
| ------- | ------- | ---- | ----- | ------ | ------ |
| ADA-BTC | ADA-BTC | buy  | buy   | 8079   | 10253  |
| ADA-BTC | ADA-BTC | sell | sell  | 7678   | 17460  |
| ADA-USD | ADA-USD | buy  | buy   | 308271 | 312359 |
| ADA-USD | ADA-USD | sell | sell  | 279624 | 245066 |

</div>

## ASOF JOIN

ASOF JOIN is a powerful time-series join extension.

It has its own page, [ASOF JOIN](/docs/query/sql/asof-join/).

## WINDOW JOIN

WINDOW JOIN aggregates data from a related table within a time-based window
around each row. It is useful for calculating rolling statistics, moving
averages, or aggregating readings within time windows.

It has its own page, [WINDOW JOIN](/docs/query/sql/window-join/).

## (INNER) JOIN

`(INNER) JOIN` returns rows from two tables where the records on the compared
column have matching values in both tables. `JOIN` is interpreted as
`INNER JOIN` by default, making the `INNER` keyword implicit.

The query we just saw above is an example. It returns the `symbol`, `side` and
`total` from the `mayTrades` subquery, and adds the `symbol`, `side`, and
`total` from the `juneTrades` subquery. Both tables are matched based on the
`symbol` and `side`, as specified on the `ON` condition.

## LEFT (OUTER) JOIN

`LEFT OUTER JOIN` or simply `LEFT JOIN` returns **all** records from the left
table, and if matched, the records of the right table. When there is no match
for the right table, it returns `NULL` values in right table fields.

The general syntax is as follows:

```questdb-sql title="LEFT JOIN ON"
WITH
  Manytrades AS
    (SELECT * FROM trades limit 100),
  Lookup AS
    (SELECT  'BTC-USD' AS Symbol, 'Bitcoin/USD Pair' AS Description)
SELECT *
FROM ManyTrades
LEFT OUTER JOIN Lookup
  ON Lookup.symbol = Manytrades.symbol;
```

In this example, the result will have 100 rows, one for each row on the
`ManyTrades` subquery. When there is no match with the `Lookup` subquery, the
columns `Symbol1` and `Description` will be `null`.

```sql
-- Omitting 'OUTER' makes no difference:
WITH
  Manytrades AS
    (SELECT * FROM trades limit 100),
  Lookup AS
    (SELECT  'BTC-USD' AS Symbol, 'Bitcoin/USD Pair' AS Description)
SELECT *
FROM ManyTrades
LEFT JOIN Lookup
  ON Lookup.symbol = Manytrades.symbol;
```

A `LEFT OUTER JOIN` query can also be used to select all rows in the left table
that do not exist in the right table.

```questdb-sql
WITH
  Manytrades AS
    (SELECT * FROM trades limit 100),
  Lookup AS
    (SELECT  'BTC-USD' AS Symbol, 'Bitcoin/USD Pair' AS Description)
SELECT *
FROM ManyTrades
LEFT OUTER JOIN Lookup
  ON Lookup.symbol = Manytrades.symbol
WHERE Lookup.Symbol = NULL;
```

In this case, the result has 71 rows out of the 100 in the larger table, and the
columns corresponding to the `Lookup` table are all `NULL`.

## CROSS JOIN

`CROSS JOIN` returns the Cartesian product of the two tables being joined and
can be used to create a table with all possible combinations of columns.

The following query is joining a table (a subquery in this case) with itself, to
compare row by row if we have any rows with exactly the same values for all the
columns except the timestamp, and if the timestamps are within 10 seconds from
each other:

```questdb-sql
-- detect potential duplicates, with same values
-- and within a 10 seconds range

WITH t AS (
  SELECT * FROM trades WHERE timestamp IN '2024-06-01'
)
SELECT * from t CROSS JOIN t AS t2
WHERE t.timestamp < t2.timestamp
  AND datediff('s', t.timestamp , t2.timestamp ) < 10
  AND t.symbol = t2.symbol
  AND t.side = t2.side
  AND t.price = t2.price
  AND t.amount = t2.amount;
```

:::note

`CROSS JOIN` does not have an `ON` clause.

:::

## LT JOIN

Similar to [`ASOF JOIN`](/docs/query/sql/asof-join/), `LT JOIN` joins two different time-series measured. For
each row in the first time-series, the `LT JOIN` takes from the second
time-series a timestamp that meets both of the following criteria:

- The timestamp is the closest to the first timestamp.
- The timestamp is **strictly prior to** the first timestamp.

In other words: `LT JOIN` won't join records with equal timestamps.

### Example

Consider the following tables:

Table `tradesA`:

<div className="pink-table">

| timestamp                   | price    |
| --------------------------- | -------- |
| 2022-03-08T18:03:57.710419Z | 39269.98 |
| 2022-03-08T18:03:58.357448Z | 39265.31 |
| 2022-03-08T18:03:58.357448Z | 39265.31 |

</div>

Table `tradesB`:

<div className="blue-table">

| timestamp                   | price    |
| --------------------------- | -------- |
| 2022-03-08T18:03:57.710419Z | 39269.98 |
| 2022-03-08T18:03:58.357448Z | 39265.31 |
| 2022-03-08T18:03:58.357448Z | 39265.31 |

</div>

An `LT JOIN` can be built using the following query:

```questdb-sql
WITH miniTrades AS (
  SELECT timestamp, price
  FROM TRADES
  WHERE symbol = 'BTC-USD'
  LIMIT 3
)
SELECT tradesA.timestamp, tradesB.timestamp, tradesA.price
FROM miniTrades tradesA
LT JOIN miniTrades tradesB;
```

The query above returns the following results:

<div className="table-alternate">

| timestamp                   | timestamp1                  | price    |
| --------------------------- | --------------------------- | -------- |
| 2022-03-08T18:03:57.710419Z | NULL                        | 39269.98 |
| 2022-03-08T18:03:58.357448Z | 2022-03-08T18:03:57.710419Z | 39265.31 |
| 2022-03-08T18:03:58.357448Z | 2022-03-08T18:03:57.710419Z | 39265.31 |

</div>

Notice how the first record in the `tradesA` table is not joined with any record
in the `tradesB` table. This is because there is no record in the `tradesB`
table with a timestamp prior to the timestamp of the first record in the
`tradesA` table.

Similarly, the second record in the `tradesB` table is joined with the first
record in the `tradesA` table because the timestamp of the first record in the
`tradesB` table is prior to the timestamp of the second record in the `tradesA`
table.

:::note

As seen on this example, `LT` join is often useful to join a table to itself in
order to get preceding values for every row.

:::

The `ON` clause can also be used in combination with `LT JOIN` to join both by
timestamp and column values.

### TOLERANCE clause

The `TOLERANCE` clause enhances LT JOIN by limiting how far back in time the join should look for a match in the right
table. The `TOLERANCE` parameter accepts a time interval value (e.g., 2s, 100ms, 1d).

When specified, a record from the left table t1 at t1.ts will only be joined with a record from the right table t2 at
t2.ts if both conditions are met: `t2.ts < t1.ts` and `t1.ts - t2.ts <= tolerance_value`

This ensures that the matched record from the right table is not only the latest one on or before t1.ts, but also within
the specified time window.

```questdb-sql title="LT JOIN with a TOLERANCE parameter"
SELECT ...
FROM table1
LT JOIN table2 TOLERANCE 10s
[WHERE ...]
```

The interval_literal must be a valid QuestDB interval string, like '5s' (5 seconds), '100ms' (100 milliseconds),
'2m' ( 2 minutes), '3h' (3 hours), or '1d' (1 day).

#### Supported Units for interval_literal

The `TOLERANCE` interval literal supports the following time unit qualifiers:

- n: Nanoseconds
- U: Microseconds
- T: Milliseconds
- s: Seconds
- m: Minutes
- h: Hours
- d: Days
- w: Weeks

For example, '100U' is 100 microseconds, '50T' is 50 milliseconds, '2s' is 2 seconds, '30m' is 30 minutes,
'1h' is 1 hour, '7d' is 7 days, and '2w' is 2 weeks. Please note that months (M) and years (Y) are not supported as
units for the `TOLERANCE` clause.

See [`ASOF JOIN documentation`](/docs/query/sql/asof-join#tolerance-clause) for more examples with the `TOLERANCE` clause.

## SPLICE JOIN

`SPLICE JOIN` is a full `ASOF JOIN`. It will return all the records from both
tables. For each record from left table splice join will find prevailing record
from right table and for each record from right table - prevailing record from
left table.

Considering the following tables:

Table `buy` (the left table):

<div className="pink-table">

| timestamp                   | price    |
| --------------------------- | -------- |
| 2024-06-22T00:00:00.039906Z | 0.092014 |
| 2024-06-22T00:00:00.343909Z | 9.805    |

</div>

The `sell` table (the right table):

<div className="blue-table">

| timestamp                   | price    |
| --------------------------- | -------- |
| 2024-06-22T00:00:00.222534Z | 64120.28 |
| 2024-06-22T00:00:00.222534Z | 64120.28 |

</div>

A `SPLICE JOIN` can be built as follows:

```questdb-sql
WITH
buy AS (  -- select the first 5 buys in June 22
  SELECT timestamp, price FROM trades
  WHERE timestamp IN '2024-06-22' AND side = 'buy' LIMIT 2
),
sell AS ( -- select the first 5 sells in June 22
  SELECT timestamp, price FROM trades
  WHERE timestamp IN '2024-06-22' AND side = 'sell' LIMIT 2
)
SELECT
  buy.timestamp, sell.timestamp, buy.price, sell.price
FROM buy
SPLICE JOIN sell;
```

This query returns the following results:

<div className="table-alternate">

| timestamp                   | timestamp1                  | price    | price1   |
| --------------------------- | --------------------------- | -------- | -------- |
| 2024-06-22T00:00:00.039906Z | NULL                        | 0.092014 | NULL     |
| 2024-06-22T00:00:00.039906Z | 2024-06-22T00:00:00.222534Z | 0.092014 | 64120.28 |
| 2024-06-22T00:00:00.039906Z | 2024-06-22T00:00:00.222534Z | 0.092014 | 64120.28 |
| 2024-06-22T00:00:00.343909Z | 2024-06-22T00:00:00.222534Z | 9.805    | 64120.28 |

</div>

Note that the above query does not use the optional `ON` clause. In case you
need additional filtering on the two tables, the `ON` clause can also be used.
