---
title: ASOF JOIN keyword
sidebar_label: ASOF JOIN
description:
  Learn how to use the powerful time-series ASOF JOIN SQL keyword from our
  concise and clear reference documentation.
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
- Join clause
- Where clause

This document will demonstrate the JOIN clause, where the other keywords
demonstrate their respective clauses.

Visualized, a JOIN operation looks like this:

![Flow chart showing the syntax of the high-level syntax of the JOIN keyword](/images/docs/diagrams/joinOverview.svg)

- `selectClause` - see the [SELECT](/docs/reference/sql/select/) reference docs
  for more information.

- `joinClause` `ASOF JOIN` with an optional `ON` clause which allows only the
  `=` predicate:

  ![Flow chart showing the syntax of the ASOF, LT, and SPLICE JOIN keyword](/images/docs/diagrams/AsofLtSpliceJoin.svg)

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

Given a table of cryptocurrency trades with both buy and sell orders:

Table `buy` (filtered for ETH-USD buy orders):

<div className="pink-table">

| timestamp                   | symbol  | price   | amount   |
| --------------------------- | ------- | ------- | -------- |
| 2022-03-08T18:03:57.764098Z | ETH-USD | 2615.40 | 0.002000 |
| 2022-03-08T18:03:57.764098Z | ETH-USD | 2615.40 | 0.001000 |
| 2022-03-08T18:03:57.764098Z | ETH-USD | 2615.40 | 0.000427 |
| 2022-03-08T18:03:58.194582Z | ETH-USD | 2615.36 | 0.025936 |
| 2022-03-08T18:03:58.194582Z | ETH-USD | 2615.37 | 0.035008 |

</div>

The `sell` table (filtered for ETH-USD sell orders):

<div className="blue-table">

| timestamp                   | symbol  | price   | amount   |
| --------------------------- | ------- | ------- | -------- |
| 2022-03-08T18:03:57.609765Z | ETH-USD | 2615.54 | 0.000440 |
| 2022-03-08T18:03:57.710419Z | ETH-USD | 2615.54 | 0.000440 |
| 2022-03-08T18:03:57.764097Z | ETH-USD | 2615.53 | 0.000440 |
| 2022-03-08T18:03:57.764098Z | ETH-USD | 2615.52 | 0.000440 |
| 2022-03-08T18:03:58.194581Z | ETH-USD | 2615.51 | 0.000440 |

</div>

An `ASOF JOIN` query to calculate the price spread between buy and sell orders:

```questdb-sql title="A basic ASOF JOIN example" demo
WITH
buy AS (
   SELECT timestamp, symbol, price, amount
   FROM trades
   WHERE symbol = 'ETH-USD'
   AND side = 'buy'
   AND timestamp IN '2022-03-08T18:03:57;2s'
   LIMIT 5
),
sell AS (
   SELECT timestamp, symbol, price, amount
   FROM trades
   WHERE symbol = 'ETH-USD'
   AND side = 'sell'
   AND timestamp IN '2022-03-08T18:03:57;2s'
   LIMIT 5
)
SELECT
   buy.timestamp buy_ts,
   sell.timestamp sell_ts,
   buy.price buy_price,
   sell.price sell_price,
   buy.price - sell.price spread
FROM buy ASOF JOIN sell;
```

This query returns:

<div className="table-alternate">

| buy_ts                      | sell_ts                     | buy_price | sell_price | spread  |
| --------------------------- | --------------------------- | --------- | ---------- | ------- |
| 2022-03-08T18:03:57.764098Z | 2022-03-08T18:03:57.710419Z | 2615.40   | 2615.54    | -0.14   |
| 2022-03-08T18:03:57.764098Z | 2022-03-08T18:03:57.710419Z | 2615.40   | 2615.54    | -0.14   |
| 2022-03-08T18:03:57.764098Z | 2022-03-08T18:03:57.710419Z | 2615.40   | 2615.54    | -0.14   |
| 2022-03-08T18:03:58.194582Z | 2022-03-08T18:03:58.194581Z | 2615.36   | 2615.51    | -0.15   |
| 2022-03-08T18:03:58.194582Z | 2022-03-08T18:03:58.194581Z | 2615.37   | 2615.51    | -0.14   |

</div>

For each buy order, the query finds the most recent sell order that occurred at or before the buy timestamp. The spread shows the difference between buy and sell prices, indicating market conditions at that moment.

### Using `ON` for matching column value

An additional `ON` clause can be used to join the tables based on the value of a
selected column. This is particularly useful when dealing with multiple trading pairs.

Table `buy` (filtered for multiple symbols):

<div className="pink-table">

| timestamp                   | symbol  | price    | amount    |
| --------------------------- | ------- | -------- | --------- |
| 2022-03-08T18:03:57.764098Z | ETH-USD | 2615.40  | 0.002000  |
| 2022-03-08T18:03:57.764098Z | BTC-USD | 39269.98 | 0.001000  |
| 2022-03-08T18:03:58.194582Z | ETH-USD | 2615.36  | 0.025936  |
| 2022-03-08T18:03:58.194582Z | BTC-USD | 39265.31 | 0.000127  |
| 2022-03-08T18:03:58.194582Z | ETH-USD | 2615.37  | 0.035008  |

</div>

The `sell` table (filtered for multiple symbols):

<div className="blue-table">

| timestamp                   | symbol  | price    | amount    |
| --------------------------- | ------- | -------- | --------- |
| 2022-03-08T18:03:57.609765Z | ETH-USD | 2615.54  | 0.000440  |
| 2022-03-08T18:03:57.710419Z | BTC-USD | 39269.98 | 0.001000  |
| 2022-03-08T18:03:57.764097Z | ETH-USD | 2615.53  | 0.000440  |
| 2022-03-08T18:03:58.194581Z | BTC-USD | 39265.31 | 0.000245  |
| 2022-03-08T18:03:58.194581Z | ETH-USD | 2615.51  | 0.000440  |

</div>

The `ON` clause ensures we match trades of the same symbol:

```questdb-sql title="ASOF JOIN with symbol matching" demo
WITH
buy AS (
   SELECT timestamp, symbol, price, amount
   FROM trades
   WHERE timestamp IN '2022-03-08T18:03:57;2s'
   AND side = 'buy'
   AND (symbol = 'ETH-USD' OR symbol = 'BTC-USD')
   LIMIT 5
),
sell AS (
   SELECT timestamp, symbol, price, amount
   FROM trades
   WHERE timestamp IN '2022-03-08T18:03:57;2s'
   AND side = 'sell'
   AND (symbol = 'ETH-USD' OR symbol = 'BTC-USD')
   LIMIT 5
)
SELECT
   buy.timestamp buy_ts,
   buy.symbol,
   buy.price buy_price,
   sell.price sell_price,
   buy.price - sell.price spread
FROM buy
ASOF JOIN sell
ON (symbol);
```

This query returns:

<div className="table-alternate">

| buy_ts                      | symbol  | buy_price | sell_price | spread  |
| --------------------------- | ------- | --------- | ---------- | ------- |
| 2022-03-08T18:03:57.764098Z | ETH-USD | 2615.40   | 2615.53    | -0.13   |
| 2022-03-08T18:03:57.764098Z | BTC-USD | 39269.98  | 39269.98   | 0.00    |
| 2022-03-08T18:03:58.194582Z | ETH-USD | 2615.36   | 2615.51    | -0.15   |
| 2022-03-08T18:03:58.194582Z | BTC-USD | 39265.31  | 39265.31   | 0.00    |
| 2022-03-08T18:03:58.194582Z | ETH-USD | 2615.37   | 2615.51    | -0.14   |

</div>

The query matches each buy order with the most recent sell order of the same symbol. This ensures we're comparing prices within the same market, giving us meaningful spread calculations for each trading pair.

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

## SPLICE JOIN

Want to join all records from both tables?

`SPLICE JOIN` is a full `ASOF JOIN`.

Read the [JOIN reference](/docs/reference/sql/join/#splice-join) for more
information on SPLICE JOIN.
