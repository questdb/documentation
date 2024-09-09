---
title: ASOF JOIN keyword
sidebar_label: ASOF JOIN
description:
  Learn how to use the powerful time-series ASOF JOIN SQL keyword from our
  concise and clea reference documentation.
---

ASOF JOIN is a powerful SQL keyword that allows you to join two time-series
tables.

It is a variant of the [`JOIN` keyword](/docs/reference/sql/join/) and shares
many of its execution traits.

This document will demonstrate how to utilize them, and link to other relevant
JOIN context.

## JOIN overview

The JOIN operation is broken into three components:

- Select clause
- Join claus
- Where clause

This document will demosntrate the JOIN clause, where the other keywords
demonstrate their respective clauses.

Visualized, a JOIN operation looks like this:

![Flow chart showing the syntax of the high-level syntax of the JOIN keyword](/img/docs/diagrams/joinOverview.svg)

- `selectClause` - see the [SELECT](/docs/reference/sql/select/) reference docs
  for more information.

- `joinClause` `ASOF JOIN` with an optional `ON` clause which allows only the
  `=` predicate:

  ![Flow chart showing the syntax of the ASOF, LT, and SPLICE JOIN keyword](/img/docs/diagrams/AsofLtSpliceJoin.svg)

- `whereClause` - see the [WHERE](/docs/reference/sql/where/) reference docs for
  more information.

In addition, the following are items of import:

- Columns from joined tables are combined in a single row.

- Columns with the same name originating from different tables will be
  automatically aliased into a unique column namespace of the result set.

- Though it is usually preferable to explicitly specify join conditions, QuestDB
  will analyze `WHERE` clauses for implicit join conditions and will derive
  transient join conditions where necessary.

### Execution order

Join operations are performed in order of their appearance in a SQL query.

Read more about execution order in the
[JOIN reference documentation](/docs/reference/sql/join/).

## ASOF JOIN

`ASOF JOIN` joins two different time-series measured.

For each row in the first time-series, the `ASOF JOIN` takes from the second
time-series a timestamp that meets both of the following criteria:

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

Notice how both tables have a new column `symbol` that stores the stock name.

The `ON` clause allows you to match the value of the `symbol` column in the
`buys` table with that in the `sells` table:

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

The XLM-USD record in the `buy` table is not joined with any record in the
`sell` table because there is no record in the `sell` table with the same stock
name and a timestamp prior to or equal to the timestamp of the XLM-USD record.
Note how the `sell` table has three rows with the SOL-USD symbol, but both of
the SOL-USD in the `buy` table are matching to the first entry, as it is the
only timestamp which is equal or prior.

### Timestamp considerations

`ASOF` join can be performed only on tables or result sets that are ordered by
time. When a table is created with a
[designated timestamp](/docs/concept/designated-timestamp/) the order of records
is enforced and the timestamp column name is in the table metadata. `ASOF` join
uses this timestamp column from metadata.

:::caution

`ASOF` join does not check timestamp order, if data is not in chronological
order, the join result is non-deterministic.

:::

In case tables do not have a designated timestamp column, but data is in
chronological order, timestamp columns can be specified at runtime:

```questdb-sql
SELECT *
FROM (a timestamp(ts))
ASOF JOIN (b timestamp (ts));
```
