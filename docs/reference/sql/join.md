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
following query performs a join on a table with one million rows based on a
column from a smaller table with one hundred rows:

```questdb-sql
SELECT * FROM 1_million_rows
INNER JOIN 1_hundred_rows
ON 1_million_rows.customer_id = 1_hundred_rows.referral_id;
```

The performance of this query can be improved by rewriting the query as follows:

```questdb-sql
SELECT * FROM 1_hundred_rows
INNER JOIN 1_million_rows
ON 1_million_rows.referral_id = 1_hundred_rows.customer_id;
```

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

For example, the following two tables contain identical column names `last_name`
and `first_name`:

`order_records`:

| last_name | first_name | total   | order_date                  |
| --------- | ---------- | ------- | --------------------------- |
| Tom       | Smith      | 34.5000 | 2023-01-05T11:31:35.808000Z |
| Jane      | Austen     | 4.5000  | 2023-01-05T15:34:25.378000Z |
| Eliot     | Flint      | 89.9000 | 2023-01-05T17:00:37.872000Z |

`customer_records`:

| last_name | first_name | cust_id |
| --------- | ---------- | ------- |
| Jane      | Austen     | 101     |
| Tom       | Smith      | 201     |
| Eliot     | Flint      | 301     |

It is possible to add multiple JOIN ON condition:

```questdb-sql

SELECT
  *
FROM
  'order_records'
  JOIN customer_records ON (
    order_records.last_name = customer_records.last_name
    AND order_records.first_name = customer_records.first_name
  );
```

The query can be simplified further since the column names are identical:

```questdb-sql

SELECT * FROM 'order_records'
JOIN customer_records
ON (last_name, first_name);
```

The result of both queries is the following:

| last_name | first_name | total   | order_date                  | last_name | first_name | cust_id |
| --------- | ---------- | ------- | --------------------------- | --------- | ---------- | ------- |
| Tom       | Smith      | 34.5000 | 2023-01-05T11:31:35.808000Z | Jane      | Austen     | 101     |
| Jane      | Austen     | 4.5000  | 2023-01-05T15:34:25.378000Z | Tom       | Smith      | 201     |
| Eliot     | Flint      | 89.9000 | 2023-01-05T17:00:37.872000Z | Eliot     | Flint      | 301     |

## (INNER) JOIN

`(INNER) JOIN` returns rows from two tables where the records on the compared
column have matching values in both tables. `JOIN` is interpreted as
`INNER JOIN` by default, making the `INNER` keyword implicit.

The following query returns the `movieId` and the average rating from table
`ratings`. It also adds a column for the `title` from the table `movies`. The
corresponding title will be identified based on the `movieId` in the `ratings`
table matching an `id` in the `movies` table.

```questdb-sql title="INNER JOIN ON"
SELECT movieId a, title, avg(rating)
FROM ratings
INNER JOIN (SELECT movieId id, title FROM movies)
ON ratings.movieId = id;

-- Omitting 'INNER' makes the query equivalent:
SELECT movieId a, title, avg(rating)
FROM ratings
JOIN (SELECT movieId id, title FROM movies)
ON ratings.movieId = id;
```

## LEFT (OUTER) JOIN

`LEFT OUTER JOIN` or simply `LEFT JOIN` returns **all** records from the left
table, and if matched, the records of the right table. When there is no match
for the right table, it returns `NULL` values in right table fields.

The general syntax is as follows:

```questdb-sql title="LEFT JOIN ON"
SELECT tab1.colA, tab2.colB
FROM table1 tab1
LEFT OUTER JOIN table2 tab2
ON tab1.colA = tab2.colB;

-- Omitting 'OUTER' makes the query equivalent:
SELECT tab1.colA, tab2.colB
FROM table1 tab1
LEFT JOIN table2 tab2
ON tab1.colA = tab2.colB;
```

A `LEFT OUTER JOIN` query can also be used to select all rows in the left table
that do not exist in the right table.

```questdb-sql
SELECT tab1.colA, tab2.colB
FROM table1 tab1
LEFT OUTER JOIN table2 tab2
ON tab1.colA = tab2.colB
WHERE tab2.colB = NULL;
```

## CROSS JOIN

`CROSS JOIN` returns the Cartesian product of the two tables being joined and
can be used to create a table with all possible combinations of columns. The
following query returns all possible combinations of `starters` and `deserts`:

```questdb-sql
SELECT *
FROM starters
CROSS JOIN deserts;
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

Table `bids` (the left table):

<div class="pink-table">


| ts                          | bid |
| --------------------------- | --- |
| 2019-10-17T00:00:00.000000Z | 100 |
| 2019-10-17T00:00:00.100000Z | 101 |
| 2019-10-17T00:00:00.300000Z | 102 |
| 2019-10-17T00:00:00.500000Z | 103 |
| 2019-10-17T00:00:00.600000Z | 104 |

</div>


The `asks` table (the right table):

<div class="blue-table">


| ts                          | ask |
| --------------------------- | --- |
| 2019-10-17T00:00:00.100000Z | 100 |
| 2019-10-17T00:00:00.300000Z | 101 |
| 2019-10-17T00:00:00.400000Z | 102 |

</div>


An `ASOF JOIN` query can look like the following:

```questdb-sql
SELECT bids.ts timebid, asks.ts timeask, bid, ask
FROM bids
ASOF JOIN asks;
```

This is the JOIN result:

<div class="table-alternate">


| timebid                     | timeask                     | bid | ask  |
| --------------------------- | --------------------------- | --- | ---- |
| 2019-10-17T00:00:00.000000Z | NULL                        | 101 | NULL |
| 2019-10-17T00:00:00.100000Z | 2019-10-17T00:00:00.100000Z | 101 | 100  |
| 2019-10-17T00:00:00.300000Z | 2019-10-17T00:00:00.300000Z | 102 | 101  |
| 2019-10-17T00:00:00.500000Z | 2019-10-17T00:00:00.400000Z | 103 | 102  |
| 2019-10-17T00:00:00.600000Z | 2019-10-17T00:00:00.400000Z | 104 | 102  |

</div>


The result has all rows from the `bids` table joined with rows from the `asks`
table. For each timestamp from the `bids` table, the query looks for a timestamp
that is equal or prior to it from the `asks` table. If no matching timestamp is
found, NULL is inserted.

### Using `ON` for matching column value

An additional `ON` clause can be used to join the tables based on the value of a
selected column.

The query above does not use the optional `ON` clause. If both tables store data
for multiple stocks, `ON` clause provides a way to find asks for bids with
matching stock value.

Table `bids` (the left table):

| ts                          | bid | stock |
| --------------------------- | --- | :---- |
| 2019-10-17T00:00:00.000000Z | 500 | AAPL  |
| 2019-10-17T00:00:00.100000Z | 101 | GOOG  |
| 2019-10-17T00:00:00.200000Z | 102 | GOOG  |
| 2019-10-17T00:00:00.300000Z | 501 | AAPL  |
| 2019-10-17T00:00:00.500000Z | 103 | GOOG  |
| 2019-10-17T00:00:00.600000Z | 502 | AAPL  |
| 2019-10-17T00:00:00.600000Z | 200 | IBM   |

Table `asks` (the right table):

| ts                          | ask | stock |
| --------------------------- | --- | :---- |
| 2019-10-17T00:00:00.000000Z | 500 | AAPL  |
| 2019-10-17T00:00:00.100000Z | 501 | AAPL  |
| 2019-10-17T00:00:00.100000Z | 100 | GOOG  |
| 2019-10-17T00:00:00.400000Z | 502 | AAPL  |
| 2019-10-17T00:00:00.700000Z | 200 | IBM   |

Notice how both tables have a new column `stock` that stores the stock name. The
`ON` clause allows you to match the value of the `stock` column in the `bids`
table with that in the `asks` table:

```questdb-sql
SELECT bids.stock stock, bids.ts timebid, asks.ts timeask, bid, ask
FROM bids
ASOF JOIN asks ON (stock);
```

The above query returns these results:

| stock | timebid                     | timeask                     | bid | ask  |
| :---- | --------------------------- | --------------------------- | --- | ---- |
| AAPL  | 2019-10-17T00:00:00.000000Z | 2019-10-17T00:00:00.000000Z | 500 | 500  |
| GOOG  | 2019-10-17T00:00:00.100000Z | 2019-10-17T00:00:00.100000Z | 101 | 100  |
| GOOG  | 2019-10-17T00:00:00.200000Z | 2019-10-17T00:00:00.100000Z | 102 | 100  |
| AAPL  | 2019-10-17T00:00:00.300000Z | 2019-10-17T00:00:00.100000Z | 501 | 501  |
| GOOG  | 2019-10-17T00:00:00.500000Z | 2019-10-17T00:00:00.100000Z | 103 | 100  |
| AAPL  | 2019-10-17T00:00:00.600000Z | 2019-10-17T00:00:00.400000Z | 502 | 502  |
| IBM   | 2019-10-17T00:00:00.600000Z | NULL                        | 200 | NULL |

This query returns all rows from the `bids` table joined with records from the
`asks` table that meet both the following criterion:

- The `stock` column of the two tables has the same value
- The timestamp of the `asks` record is prior to or equal to the timestamp of
  the `bids` record.

The IBM record in the `bids` table is not joined with any record in the `asks`
table because there is no record in the `asks` table with the same stock name
and a timestamp prior to or equal to the timestamp of the IBM record. The asks
table has a record with the IBM stock name but its timestamp is
`2019-10-17T00:00:00.700000Z` which is after the timestamp of the IBM record in
the `bids` table and therefore not joined.

### Timestamp considerations

`ASOF` join can be performed only on tables or result sets that are ordered by
time. When a table is created with a
[designated timestamp](/docs/concept/designated-timestamp/) the order of records
is enforced and the timestamp column name is in the table metadata. `ASOF` join
uses this timestamp column from metadata.

In case tables do not have a designated timestamp column, but data is in
chronological order, timestamp columns can be specified at runtime:

```questdb-sql
SELECT bids.ts timebid, bid, ask
FROM (bids timestamp(ts))
ASOF JOIN (asks timestamp (ts));
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

Table `bids`:

| ts                          | bid |
| --------------------------- | --- |
| 2019-10-17T00:00:00.000000Z | 101 |
| 2019-10-17T00:00:00.300000Z | 102 |
| 2019-10-17T00:00:00.500000Z | 103 |

Table `asks`:

| ts                          | ask |
| --------------------------- | --- |
| 2019-10-17T00:00:00.000000Z | 100 |
| 2019-10-17T00:00:00.300000Z | 101 |
| 2019-10-17T00:00:00.400000Z | 102 |

An `LT JOIN` can be built using the following query:

```questdb-sql
SELECT bids.ts timebid, asks.ts timeask, bid, ask
FROM bids
LT JOIN asks;
```

The query above returns the following results:

| timebid                     | timeask                     | bid | ask  |
| --------------------------- | --------------------------- | --- | ---- |
| 2019-10-17T00:00:00.000000Z | NULL                        | 101 | NULL |
| 2019-10-17T00:00:00.300000Z | 2019-10-17T00:00:00.000000Z | 102 | 100  |
| 2019-10-17T00:00:00.500000Z | 2019-10-17T00:00:00.400000Z | 103 | 102  |

Notice how the first record in the `bids` table is not joined with any record in
the `asks` table. This is because there is no record in the `asks` table with a
timestamp prior to the timestamp of the first record in the `bids` table.

Similarly, the second record in the `bids` table is joined with the first record
in the `asks` table because the timestamp of the first record in the `asks`
table is prior to the timestamp of the second record in the `bids` table.

:::note

`LT` join is often useful to join a table to itself in order to get preceding
values for every row.

:::

## SPLICE JOIN

`SPLICE JOIN` is a full `ASOF JOIN`. It will return all the records from both
tables. For each record from left table splice join will find prevailing record
from right table and for each record from right table - prevailing record from
left table.

Considering the following tables:

Table `asks`:

| ts                          | ask |
| --------------------------- | --- |
| 2019-10-17T00:00:00.000000Z | 100 |
| 2019-10-17T00:00:00.200000Z | 101 |
| 2019-10-17T00:00:00.400000Z | 102 |

Table `bids`:

| ts                          | bid |
| --------------------------- | --- |
| 2019-10-17T00:00:00.100000Z | 101 |
| 2019-10-17T00:00:00.300000Z | 102 |
| 2019-10-17T00:00:00.500000Z | 103 |

A `SPLICE JOIN` can be built as follows:

```questdb-sql
SELECT bids.ts timebid, bid, ask
FROM bids
SPLICE JOIN asks;
```

This query returns the following results:

| timebid                     | bid  | ask |
| --------------------------- | ---- | --- |
| null                        | null | 100 |
| 2019-10-17T00:00:00.100000Z | 101  | 100 |
| 2019-10-17T00:00:00.100000Z | 101  | 101 |
| 2019-10-17T00:00:00.300000Z | 102  | 101 |
| 2019-10-17T00:00:00.300000Z | 102  | 102 |
| 2019-10-17T00:00:00.500000Z | 103  | 102 |

Note that the above query does not use the optional `ON` clause. In case you
need additional filtering on the two tables, the `ON` clause can be used as
follows:

```questdb-sql
SELECT ts timebid, stock bidStock, bid, ask
FROM bids
SPLICE JOIN
    (
    SELECT ts timesask, stock askStock, ask ask
    FROM asks
    )
    ON bidStock=askStock;
```
