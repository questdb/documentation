---
title: JOIN keyword
sidebar_label: JOIN
description: JOIN SQL keyword reference documentation.
---

QuestDB supports the type of joins you can frequently find in
[relational databases](/glossary/relational-database/): `INNER`, `LEFT (OUTER)`,
`CROSS`. Additionally, it implements joins which are particularly useful for
time-series analytics: `ASOF`, `LT`, and `SPLICE`. `FULL` joins are not yet
implemented and are on our roadmap.

All supported join types can be combined in a single SQL statement; QuestDB
SQL's optimizer determines the best execution order and algorithms.

There are no known limitations on the size of tables or sub-queries used in
joins and there are no limitations on the number of joins, either.

## Syntax

High-level overview:

![Flow chart showing the syntax of the high-level syntax of the JOIN keyword](/img/docs/diagrams/joinOverview.svg)

- `selectClause` - see [SELECT](/docs/reference/sql/select/) for more
  information.
- `whereClause` - see [WHERE](/docs/reference/sql/where/) for more information.
- The specific syntax for `joinClause` depends on the type of `JOIN`:

  - `INNER` and `LEFT` `JOIN` has a mandatory `ON` clause allowing arbitrary
    `JOIN` predicates, `operator`:

  ![Flow chart showing the syntax of the INNER, LEFT JOIN keyword](/img/docs/diagrams/InnerLeftJoin.svg)

  - `ASOF`, `LT`, and `SPLICE` `JOIN` has optional `ON` clause allowing only the
    `=` predicate:

  ![Flow chart showing the syntax of the ASOF, LT, and SPLICE JOIN keyword](/img/docs/diagrams/AsofLtSpliceJoin.svg)

  - `CROSS JOIN` does not allow any `ON` clause:

  ![Flow chart showing the syntax of the CROSS JOIN keyword](/img/docs/diagrams/crossJoin.svg)

Columns from joined tables are combined in a single row. Columns with the same
name originating from different tables will be automatically aliased to create a
unique column namespace of the resulting set.

Though it is usually preferable to explicitly specify join conditions, QuestDB
will analyze `WHERE` clauses for implicit join conditions and will derive
transient join conditions where necessary.

## Execution order

Join operations are performed in order of their appearance in a SQL query. The
following query performs a join on a table with a very small table (just one
row in this example) and a bigger table with 10 million rows:

```questdb-sql
WITH
  Manytrades AS
    (SELECT * FROM trades limit 10000000),
  Lookup AS
    (SELECT  'BTC-USD' AS Symbol, 'Bitcoin/USD Pair' AS Description)
SELECT * from Lookup
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
SELECT * from ManyTrades
INNER JOIN Lookup
  ON Lookup.symbol = Manytrades.symbol;
```

As a general rule, whenever you have a table significantly larger than the other, try
to use the large one first. If you use `EXPLAIN` with the queries above, you should
see the first version needs to Hash over 10 million rows, while the second version
needs to Hash only over 1 row.

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
SELECT * from mayTrades
JOIN JuneTrades
  ON mayTrades.symbol = juneTrades.symbol
  AND mayTrades.side = juneTrades.side ;
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
SELECT * from mayTrades
JOIN JuneTrades
  ON (symbol, side);
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

## (INNER) JOIN

`(INNER) JOIN` returns rows from two tables where the records on the compared
column have matching values in both tables. `JOIN` is interpreted as
`INNER JOIN` by default, making the `INNER` keyword implicit.

The query we just saw above is an example. It returns the `symbol`, `side`
and `total` from the `mayTrades` subquery, and adds the `symbol`, `side`,
and `total` from the `juneTrades` subquery. Both tables are matched based
on the `symbol` and `side`, as specified on the `ON` condition.

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
SELECT * from ManyTrades
LEFT OUTER JOIN Lookup
  ON Lookup.symbol = Manytrades.symbol;
```

In this example, the result will have 100 rows, one for each row on the `ManyTrades`
subquery. When there is no match with the `Lookup` subquery, the columns `Symbol1`
and `Description` will be `null`.

```sql
-- Omitting 'OUTER' makes no difference:
WITH
    Manytrades AS
      (SELECT * FROM trades limit 100),
    Lookup AS
      (SELECT  'BTC-USD' AS Symbol, 'Bitcoin/USD Pair' AS Description)
SELECT * from ManyTrades
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
SELECT * from ManyTrades LEFT OUTER JOIN Lookup
  ON Lookup.symbol = Manytrades.symbol
  WHERE Lookup.Symbol = NULL;
```

In this case, the result has 71 rows out of the 100 in the larger table, and
the columns corresponding to the `Lookup` table are all `NULL`.

## CROSS JOIN

`CROSS JOIN` returns the Cartesian product of the two tables being joined and
can be used to create a table with all possible combinations of columns.

The following query is joining a table (a subquery in this case) with itself,
to compare row by row if we have any rows with exactly the same values for
all the columns except the timestamp, and if the timestamps are within 10
seconds from each other:

```questdb-sql
-- detect potential duplicates, with same values
-- and within a 10 seconds range

WITH t AS (
  SELECT * FROM trades WHERE timestamp IN '2024-06-01'
  )
SELECT * from t CROSS JOIN t AS t2
WHERE
t.timestamp < t2.timestamp
AND datediff('s', t.timestamp , t2.timestamp ) < 10
AND t.symbol = t2.symbol
AND t.side = t2.side
AND t.price = t2.price
AND t.amount = t2.amount;
```

:::note

`CROSS JOIN` does not have an `ON` clause.

:::

## ASOF JOIN

`ASOF JOIN` joins two different time-series measured. For each row in the first
time-series, the `ASOF JOIN` takes from the second time-series a timestamp that
meets both of the following criteria:

- The timestamp is the closest to the first timestamp.
- The timestamp is **strictly prior or equal to** the first timestamp.

### Example

Given the following tables:

Table `buy` (the left table):

<div className="pink-table">

| timestamp                   | price    |
| --------------------------- | -------- |
| 2024-06-22T00:00:00.039906Z | 0.092014 |
| 2024-06-22T00:00:00.343909Z | 9.805    |
| 2024-06-22T00:00:00.349387Z | 134.56   |
| 2024-06-22T00:00:00.349387Z | 134.56   |
| 2024-06-22T00:00:00.446196Z | 9.805    |

</div>

The `sell` table (the right table):

<div className="blue-table">

| timestamp                   | price    |
| --------------------------- | -------- |
| 2024-06-22T00:00:00.222534Z | 64120.28 |
| 2024-06-22T00:00:00.222534Z | 64120.28 |
| 2024-06-22T00:00:00.222534Z | 64116.74 |
| 2024-06-22T00:00:00.222534Z | 64116.5  |
| 2024-06-22T00:00:00.543826Z | 134.56   |

</div>

An `ASOF JOIN` query can look like the following:

```questdb-sql
WITH
buy AS (  -- select the first 5 buys in June 22
   SELECT timestamp, price FROM trades
   WHERE timestamp IN '2024-06-22' AND side = 'buy' LIMIT 5
   ),
sell AS ( -- select the first 5 sells in June 22
   SELECT timestamp, price FROM trades
   WHERE timestamp IN '2024-06-22' AND side = 'sell' LIMIT 5
   )
SELECT
   buy.timestamp, sell.timestamp, buy.price, sell.price
FROM buy ASOF JOIN sell;
```

This is the JOIN result:

<div className="table-alternate">

| timestamp                   | timestamp1                  | price    | price1  |
| --------------------------- | --------------------------- | -------- | ------- |
| 2024-06-22T00:00:00.039906Z | NULL                        | 0.092014 | NULL    |
| 2024-06-22T00:00:00.343909Z | 2024-06-22T00:00:00.222534Z | 9.805    | 64116.5 |
| 2024-06-22T00:00:00.349387Z | 2024-06-22T00:00:00.222534Z | 134.56   | 64116.5 |
| 2024-06-22T00:00:00.349387Z | 2024-06-22T00:00:00.222534Z | 134.56   | 64116.5 |
| 2024-06-22T00:00:00.446196Z | 2024-06-22T00:00:00.222534Z | 9.805    | 64116.5 |

</div>

The result has all rows from the `buys` table joined with rows from the `sells`
table. For each timestamp from the `buys` table, the query looks for a timestamp
that is equal or prior to it from the `sells` table. If no matching timestamp is
found, NULL is inserted.

### Using `ON` for matching column value

An additional `ON` clause can be used to join the tables based on the value of a
selected column.

The query above does not use the optional `ON` clause. If both tables store data
for multiple symbols, `ON` clause provides a way to find sells for buys with
matching symbol value.

Table `buy` (the left table):

<div className="pink-table">

| timestamp                   | symbol  | price    |
| --------------------------- | ------- | -------- |
| 2024-06-22T00:00:00.039906Z | XLM-USD | 0.092014 |
| 2024-06-22T00:00:00.039906Z | UNI-USD | 9.805    |
| 2024-06-22T00:00:00.349387Z | SOL-USD | 134.56   |
| 2024-06-22T00:00:00.349387Z | SOL-USD | 134.56   |
| 2024-06-22T00:00:00.446196Z | UNI-USD | 9.805    |

</div>

The `sell` table (the right table):

<div className="blue-table">

| timestamp                   | symbol  | price    |
| --------------------------- | ------- | -------- |
| 2024-06-21T23:59:59.187884Z | SOL-USD | 134.54   |
| 2024-06-21T23:59:59.878276Z | UNI-USD | 9.804    |
| 2024-06-22T00:00:00.222534Z | BTC-USD | 64120.28 |
| 2024-06-22T00:00:00.543826Z | SOL-USD | 134.56   |
| 2024-06-22T00:00:00.644399Z | SOL-USD | 134.56   |

</div>

Notice how both tables have a new column `symbol` that stores the stock name. The
`ON` clause allows you to match the value of the `symbol` column in the `buys`
table with that in the `sells` table:

```questdb-sql
WITH
buy AS (  -- select the first 5 buys in June 22
   SELECT * FROM trades
   WHERE timestamp IN '2024-06-22' AND side = 'buy' LIMIT 5
   ),
sell AS ( -- sells in the last second of June 21 and 1 second later
   SELECT * FROM trades
   WHERE timestamp IN '2024-06-21T23:59:59;1s' AND side = 'sell'
   )
SELECT
   buy.timestamp,  sell.timestamp, buy.symbol,
   (buy.price - sell.price) spread
FROM buy ASOF JOIN sell ON (symbol);

```

The above query returns these results:

<div className="table-alternate">

| timestamp                   | timestamp1                  | symbol  | spread |
| --------------------------- | --------------------------- | ------- | ------ |
| 2024-06-22T00:00:00.039906Z | NULL                        | XLM-USD | NULL   |
| 2024-06-22T00:00:00.343909Z | 2024-06-21T23:59:59.878276Z | UNI-USD | 0.0009 |
| 2024-06-22T00:00:00.349387Z | 2024-06-21T23:59:59.187884Z | SOL-USD | 0.02   |
| 2024-06-22T00:00:00.349387Z | 2024-06-21T23:59:59.187884Z | SOL-USD | 0.02   |
| 2024-06-22T00:00:00.446196Z | 2024-06-21T23:59:59.878276Z | UNI-USD | 0.0009 |

</div>

This query returns all rows from the `buy` table joined with records from the
`sell` table that meet both the following criterion:

- The `symbol` column of the two tables has the same value
- The timestamp of the `sell` record is prior to or equal to the timestamp of
  the `buy` record.

The XLM-USD record in the `buy` table is not joined with any record in the `sell`
table because there is no record in the `sell` table with the same stock name
and a timestamp prior to or equal to the timestamp of the XLM-USD record. Note
how the `sell` table has three rows with the SOL-USD symbol, but both of the
SOL-USD in the `buy` table are matching to the first entry, as it is the only
timestamp which is equal or prior.

### Timestamp considerations

`ASOF` join can be performed only on tables or result sets that are ordered by
time. When a table is created with a
[designated timestamp](/docs/concept/designated-timestamp/) the order of records
is enforced and the timestamp column name is in the table metadata. `ASOF` join
uses this timestamp column from metadata.

In case tables do not have a designated timestamp column, but data is in
chronological order, timestamp columns can be specified at runtime:

```questdb-sql
SELECT *
FROM (a timestamp(ts))
ASOF JOIN (b timestamp (ts));
```

:::caution

`ASOF` join does not check timestamp order, if data is not in chronological
order, the join result is non-deterministic.

:::

## LT JOIN

Similar to `ASOF JOIN`, `LT JOIN` joins two different time-series measured. For
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

Notice how the first record in the `tradesA` table is not joined with any record in
the `tradesB` table. This is because there is no record in the `tradesB` table with a
timestamp prior to the timestamp of the first record in the `tradesA` table.

Similarly, the second record in the `tradesB` table is joined with the first record
in the `tradesA` table because the timestamp of the first record in the `tradesB`
table is prior to the timestamp of the second record in the `tradesA` table.

:::note

As seen on this example, `LT` join is often useful to join a table to itself in order
to get preceding values for every row.

:::

The `ON` clause can also be used in combination with `LT JOIN` to join both by
timestamp and column values.

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
