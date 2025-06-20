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

`ASOF JOIN` joins two time-series on their timestamp, using the following
logic: for each row in the first time-series,

1. consider all timestamps in the second time-series **earlier or equal to**
the first one
2. choose **the latest** such timestamp

### Example

Let's use an example with two tables:

- `trades`: trade events on a single stock
- `order_book`: level-1 order book snapshots for that stock

`trades` data:

<div className="blue-table">

|    timestamp    |  price | size |
| --------------- | ------ | ---- |
| 08:00:00.007140 | 175.97 |  400 |
| 08:00:00.609618 | 178.55 |  400 |
| 08:00:00.672131 | 176.09 |  400 |
| 08:00:00.672147 | 176.03 |  400 |
| 08:00:01.146931 | 175.45 |  400 |
| 08:00:01.495188 | 177.90 |  400 |
| 08:00:01.991977 | 175.35 |  400 |
| 08:00:01.991991 | 175.36 |  400 |
| 08:00:02.039451 | 175.36 |  400 |
| 08:00:02.836413 | 175.55 |  400 |
| 08:00:03.447858 | 176.79 |  400 |
| 08:00:04.782191 | 181.00 |   15 |
| 08:00:05.408871 | 175.77 |  400 |
| 08:00:06.007145 | 176.52 |  400 |
| 08:00:06.740159 | 184.00 |    1 |
| 08:00:07.593841 | 175.75 |  400 |
| 08:00:10.310291 | 176.38 |   29 |
| 08:00:10.550535 | 175.86 |  400 |
| 08:00:10.761790 | 175.94 |  400 |
| 08:00:12.046660 | 176.15 |  400 |
| 08:00:12.897624 | 176.62 |  400 |
| 08:00:13.838193 | 176.51 |   25 |
| 08:00:15.125509 | 176.17 |  400 |
| 08:00:16.727077 | 176.48 |  400 |
| 08:00:18.813886 | 176.68 |  400 |
| 08:00:22.180535 | 176.05 |  400 |
| 08:00:25.125634 | 176.16 |  400 |
| 08:00:26.117889 | 176.33 |    1 |
| 08:00:26.184839 | 176.52 |  400 |
| 08:00:26.185102 | 176.41 |   25 |

</div>

`order_book` data:

<div className="pink-table">

| timestamp | bid_price | bid_size | ask_price | ask_size |
| --------- | --------- | -------- | --------- | -------- |
| 08:00:00  |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:01  |    176.33 |     4744 |    176.6  |     8404 |
| 08:00:02  |    176.07 |      136 |    176.76 |     4946 |
| 08:00:03  |    176.07 |       84 |    176.75 |     2182 |
| 08:00:04  |    176.07 |      112 |    176.59 |     2734 |
| 08:00:05  |    176.38 |      212 |    176.5  |     6966 |
| 08:00:06  |    176.33 |      176 |    176.52 |     8174 |
| 08:00:07  |    176.33 |      276 |    176.67 |     7345 |
| 08:00:08  |    176.33 |       48 |    176.67 |     1600 |
| 08:00:09  |    176.35 |       66 |    176.67 |     2400 |
| 08:00:10  |    176.36 |      695 |    176.38 |    20698 |
| 08:00:11  |    176.35 |       98 |    176.59 |     2800 |
| 08:00:12  |    176.48 |      104 |    176.59 |     4040 |
| 08:00:13  |    176.48 |      165 |    176.38 |     6035 |
| 08:00:14  |    176.35 |       56 |    176.38 |      720 |
| 08:00:15  |    176.35 |      119 |    176.38 |     1530 |
| 08:00:16  |    176.35 |      133 |    176.38 |     3710 |
| 08:00:18  |    176.35 |       84 |    176.38 |     1880 |
| 08:00:19  |    176.35 |       14 |    176.38 |      180 |
| 08:00:20  |    176.35 |       14 |    176.38 |      180 |
| 08:00:21  |    176.35 |      112 |    176.38 |     1440 |
| 08:00:22  |    176.35 |      133 |    176.38 |     1710 |
| 08:00:25  |    176.35 |      122 |    176.38 |     3929 |
| 08:00:26  |    176.35 |      300 |    176.37 |     6952 |
| 08:00:28  |    176.07 |       28 |    176.37 |      496 |

</div>

We want to join each trade event to the relevant order book snapshot. All
we have to write is

```questdb-sql title="A basic ASOF JOIN example" demo
trades ASOF JOIN order_book
```

and we get this result:

<div className="table-alternate">

|     timestamp   |  price | size | timestamp1 | bid_price | bid_size | ask_price | ask_size |
| --------------- | ------ | ---- | ---------- | --------- | -------- | --------- | -------- |
| 08:00:00.007140 | 175.97 |  400 |   08:00:00 |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:00.609618 | 178.55 |  400 |   08:00:00 |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:00.672131 | 176.09 |  400 |   08:00:00 |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:00.672147 | 176.03 |  400 |   08:00:00 |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:01.146931 | 175.45 |  400 |   08:00:01 |    176.33 |     4744 |    176.60 |     8404 |
| 08:00:01.495188 | 177.90 |  400 |   08:00:01 |    176.33 |     4744 |    176.60 |     8404 |
| 08:00:01.991977 | 175.35 |  400 |   08:00:01 |    176.33 |     4744 |    176.60 |     8404 |
| 08:00:01.991991 | 175.36 |  400 |   08:00:01 |    176.33 |     4744 |    176.60 |     8404 |
| 08:00:02.039451 | 175.36 |  400 |   08:00:02 |    176.07 |      136 |    176.76 |     4946 |
| 08:00:02.836413 | 175.55 |  400 |   08:00:02 |    176.07 |      136 |    176.76 |     4946 |
| 08:00:03.447858 | 176.79 |  400 |   08:00:03 |    176.07 |       84 |    176.75 |     2182 |
| 08:00:04.782191 | 181.00 |   15 |   08:00:04 |    176.07 |      112 |    176.59 |     2734 |
| 08:00:05.408871 | 175.77 |  400 |   08:00:05 |    176.38 |      212 |    176.50 |     6966 |
| 08:00:06.007145 | 176.52 |  400 |   08:00:06 |    176.33 |      176 |    176.52 |     8174 |
| 08:00:06.740159 | 184.00 |    1 |   08:00:06 |    176.33 |      176 |    176.52 |     8174 |
| 08:00:07.593841 | 175.75 |  400 |   08:00:07 |    176.33 |      276 |    176.67 |     7345 |
| 08:00:10.310291 | 176.38 |   29 |   08:00:10 |    176.36 |      695 |    176.38 |    20698 |
| 08:00:10.550535 | 175.86 |  400 |   08:00:10 |    176.36 |      695 |    176.38 |    20698 |
| 08:00:10.761790 | 175.94 |  400 |   08:00:10 |    176.36 |      695 |    176.38 |    20698 |
| 08:00:12.046660 | 176.15 |  400 |   08:00:12 |    176.48 |      104 |    176.59 |     4040 |
| 08:00:12.897624 | 176.62 |  400 |   08:00:12 |    176.48 |      104 |    176.59 |     4040 |
| 08:00:13.838193 | 176.51 |   25 |   08:00:13 |    176.48 |      165 |    176.38 |     6035 |
| 08:00:15.125509 | 176.17 |  400 |   08:00:15 |    176.35 |      119 |    176.38 |     1530 |
| 08:00:16.727077 | 176.48 |  400 |   08:00:16 |    176.35 |      133 |    176.38 |     3710 |
| 08:00:18.813886 | 176.68 |  400 |   08:00:18 |    176.35 |       84 |    176.38 |     1880 |
| 08:00:22.180535 | 176.05 |  400 |   08:00:22 |    176.35 |      133 |    176.38 |     1710 |
| 08:00:25.125634 | 176.16 |  400 |   08:00:25 |    176.35 |      122 |    176.38 |     3929 |
| 08:00:26.117889 | 176.33 |    1 |   08:00:26 |    176.35 |      300 |    176.37 |     6952 |
| 08:00:26.184839 | 176.52 |  400 |   08:00:26 |    176.35 |      300 |    176.37 |     6952 |
| 08:00:26.185102 | 176.41 |   25 |   08:00:26 |    176.35 |      300 |    176.37 |     6952 |

</div>

### Using `ON` for matching column value

The tables in the above example are just about one stock; in reality the same
table covers many stocks, and you want the results not to get mixed between
them. This is what the `ON` clause is for -- you can point out the key (ticker)
column and get results separate for each key.

Here's the trades table expanded to include two stocks, and a new `symbol` column:

<div className="pink-table">

|    timestamp    | symbol |  price | size |
| --------------- | ------ | ------ | ---- |
| 08:00:00.007168 |   AAPL | 176.91 |  400 |
| 08:00:00.834205 |   AAPL | 175.93 |  400 |
| 08:00:00.988111 |   AAPL | 176.47 |  100 |
| 08:00:01.199577 |   AAPL | 175.46 |  400 |
| 08:00:01.495172 |   AAPL | 177.95 |  400 |
| 08:00:01.538683 |   GOOG | 175.82 |  400 |
| 08:00:01.555565 |   AAPL | 176.33 |   25 |
| 08:00:02.006636 |   GOOG |  150.0 |   10 |
| 08:00:02.039451 |   AAPL | 175.36 |  400 |
| 08:00:02.460454 |   GOOG | 175.45 |  400 |
| 08:00:03.012909 |   GOOG |  175.5 |    1 |
| 08:00:03.494927 |   GOOG |  185.0 |    5 |
| 08:00:03.524212 |   AAPL | 175.48 |  400 |
| 08:00:04.648333 |   AAPL | 175.66 |  400 |
| 08:00:04.943421 |   GOOG | 175.48 |  400 |
| 08:00:05.884890 |   AAPL | 176.54 |   28 |
| 08:00:05.961856 |   GOOG | 175.66 |  400 |
| 08:00:06.589806 |   GOOG | 175.65 |  400 |
| 08:00:06.740159 |   AAPL |  184.0 |    1 |
| 08:00:07.342978 |   GOOG | 176.55 |  400 |
| 08:00:07.345877 |   AAPL | 176.73 |  400 |
| 08:00:10.419065 |   AAPL | 176.41 |  400 |
| 08:00:11.636237 |   AAPL | 176.69 |  400 |
| 08:00:11.683078 |   GOOG | 176.67 |  400 |
| 08:00:13.650868 |   AAPL | 176.52 |  124 |
| 08:00:13.650880 |   AAPL | 176.59 |  124 |
| 08:00:14.055762 |   AAPL | 176.66 |  400 |
| 08:00:14.083022 |   GOOG | 176.81 |  400 |
| 08:00:15.088091 |   GOOG | 176.52 |  400 |
| 08:00:15.125494 |   AAPL | 176.12 |  400 |
| 08:00:15.147691 |   GOOG | 176.54 |  400 |

</div>

Order book, similarly extended with the `symbol` column:

<div className="blue-table">

| timestamp | symbol | bid_price | bid_size | ask_price | ask_size |
| --------- | ------ | --------- | -------- | --------- | -------- |
|  08:00:00 |   AAPL |    176.47 |     5542 |    176.82 |    13054 |
|  08:00:01 |   GOOG |    130.32 |     7516 |    130.9  |    25652 |
|  08:00:01 |   AAPL |    176.33 |     4744 |    176.6  |     8404 |
|  08:00:02 |   GOOG |    130.59 |     9046 |    130.68 |     9264 |
|  08:00:02 |   AAPL |    176.07 |      136 |    176.76 |     4946 |
|  08:00:03 |   GOOG |    130.34 |     4086 |    130.82 |    12676 |
|  08:00:03 |   AAPL |    176.07 |       84 |    176.75 |     2182 |
|  08:00:04 |   GOOG |    130.29 |      350 |    130.79 |     8780 |
|  08:00:04 |   AAPL |    176.07 |      112 |    176.59 |     2734 |
|  08:00:05 |   GOOG |    130.29 |      182 |    130.68 |     6060 |
|  08:00:05 |   AAPL |    176.38 |      212 |    176.5  |     6966 |
|  08:00:06 |   GOOG |    130.48 |      394 |    130.65 |     6828 |
|  08:00:06 |   AAPL |    176.33 |      176 |    176.52 |     8174 |
|  08:00:07 |   GOOG |    130.52 |      366 |    130.61 |    21260 |
|  08:00:07 |   AAPL |    176.33 |      276 |    176.67 |     7345 |
|  08:00:08 |   GOOG |    130.48 |      480 |    130.76 |    13032 |
|  08:00:08 |   AAPL |    176.33 |       48 |    176.67 |     1600 |
|  08:00:09 |   GOOG |    130.48 |      216 |    130.74 |     6458 |
|  08:00:09 |   AAPL |    176.35 |       66 |    176.67 |     2400 |
|  08:00:10 |   GOOG |    130.48 |       72 |    130.74 |     2400 |
|  08:00:10 |   AAPL |    176.36 |      695 |    176.38 |    20698 |
|  08:00:11 |   GOOG |    130.51 |     1236 |    130.52 |    26596 |
|  08:00:11 |   AAPL |    176.35 |       98 |    176.59 |     2800 |
|  08:00:12 |   GOOG |    130.5 |       378 |    130.68 |    22000 |
|  08:00:12 |   AAPL |    176.48 |      104 |    176.59 |     4040 |
|  08:00:13 |   GOOG |    130.6 |       174 |    130.68 |     5200 |
|  08:00:13 |   AAPL |    176.48 |      165 |    176.38 |     6035 |
|  08:00:14 |   GOOG |    130.6 |       138 |    130.62 |     8616 |
|  08:00:14 |   AAPL |    176.35 |       56 |    176.38 |      720 |
|  08:00:15 |   GOOG |    130.6 |       394 |    130.52 |     9374 |

</div>

And here's the ASOF JOIN query with the `ON` clause added:

```questdb-sql title="ASOF JOIN with symbol matching" demo
SELECT t.timestamp, t.symbol, price, size, bid_price, bid_size, ask_price, ask_size
FROM trades t ASOF JOIN order_book ON (symbol);
```

Result:

<div className="table-alternate">

|    timestamp    | symbol |  price | size | bid_price | bid_size | ask_price | ask_size |
| --------------- | ------ | ------ | ---- | --------- | -------- | --------- | -------- |
| 08:00:00.007168 |   AAPL | 176.91 |  400 |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:00.834205 |   AAPL | 175.93 |  400 |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:00.988111 |   AAPL | 176.47 |  100 |    176.47 |     5542 |    176.82 |    13054 |
| 08:00:01.199577 |   AAPL | 175.46 |  400 |    176.33 |     4744 |    176.60 |     8404 |
| 08:00:01.495172 |   AAPL | 177.95 |  400 |    176.33 |     4744 |    176.60 |     8404 |
| 08:00:01.538683 |   GOOG | 175.82 |  400 |    130.32 |     7516 |    130.90 |    25652 |
| 08:00:01.555565 |   AAPL | 176.33 |   25 |    176.33 |     4744 |    176.60 |     8404 |
| 08:00:02.006636 |   GOOG | 150.00 |   10 |    130.59 |     9046 |    130.68 |     9264 |
| 08:00:02.039451 |   AAPL | 175.36 |  400 |    176.07 |      136 |    176.76 |     4946 |
| 08:00:02.460454 |   GOOG | 175.45 |  400 |    130.59 |     9046 |    130.68 |     9264 |
| 08:00:03.012909 |   GOOG | 175.50 |    1 |    130.34 |     4086 |    130.82 |    12676 |
| 08:00:03.494927 |   GOOG | 185.00 |    5 |    130.34 |     4086 |    130.82 |    12676 |
| 08:00:03.524212 |   AAPL | 175.48 |  400 |    176.07 |       84 |    176.75 |     2182 |
| 08:00:04.648333 |   AAPL | 175.66 |  400 |    176.07 |      112 |    176.59 |     2734 |
| 08:00:04.943421 |   GOOG | 175.48 |  400 |    130.29 |      350 |    130.79 |     8780 |
| 08:00:05.884890 |   AAPL | 176.54 |   28 |    176.38 |      212 |    176.50 |     6966 |
| 08:00:05.961856 |   GOOG | 175.66 |  400 |    130.29 |      182 |    130.68 |     6060 |
| 08:00:06.589806 |   GOOG | 175.65 |  400 |    130.48 |      394 |    130.65 |     6828 |
| 08:00:06.740159 |   AAPL | 184.00 |    1 |    176.33 |      176 |    176.52 |     8174 |
| 08:00:07.342978 |   GOOG | 176.55 |  400 |    130.52 |      366 |    130.61 |    21260 |
| 08:00:07.345877 |   AAPL | 176.73 |  400 |    176.33 |      276 |    176.67 |     7345 |
| 08:00:10.419065 |   AAPL | 176.41 |  400 |    176.36 |      695 |    176.38 |    20698 |
| 08:00:11.636237 |   AAPL | 176.69 |  400 |    176.35 |       98 |    176.59 |     2800 |
| 08:00:11.683078 |   GOOG | 176.67 |  400 |    130.51 |     1236 |    130.52 |    26596 |
| 08:00:13.650868 |   AAPL | 176.52 |  124 |    176.48 |      165 |    176.38 |     6035 |
| 08:00:13.650880 |   AAPL | 176.59 |  124 |    176.48 |      165 |    176.38 |     6035 |
| 08:00:14.055762 |   AAPL | 176.66 |  400 |    176.35 |       56 |    176.38 |      720 |
| 08:00:14.083022 |   GOOG | 176.81 |  400 |    130.60 |      138 |    130.62 |     8616 |
| 08:00:15.088091 |   GOOG | 176.52 |  400 |    130.60 |      394 |    130.52 |     9374 |
| 08:00:15.125494 |   AAPL | 176.12 |  400 |    176.35 |       56 |    176.38 |      720 |
| 08:00:15.147691 |   GOOG | 176.54 |  400 |    130.60 |      394 |    130.52 |     9374 |

</div>

### How ASOF JOIN uses timestamps

`ASOF JOIN` requires tables or subqueries to be ordered by time. The best way to meet this requirement is to use a
[designated timestamp](/docs/concept/designated-timestamp/), which is set when you create a table. 
This not only enforces the chronological order of your data but also tells QuestDB which column to use for time-series
operations automatically.

#### Default behavior

By default, an `ASOF JOIN` will always use the designated timestamp of the tables involved.

This behavior is so fundamental that it extends to subqueries in a unique way: even if you do not explicitly SELECT the
designated timestamp column in a subquery, QuestDB implicitly propagates it. The join is performed correctly under the
hood using this hidden timestamp, which is then omitted from the final result set.

This makes most `ASOF JOIN` queries simple and intuitive.

```questdb-sql title="ASOF JOIN with designated timestamp"
-- The 'trades' table has 'trade_ts' as its designated timestamp.
-- Even though 'trade_ts' is not selected in the subquery,
-- it is used implicitly for the ASOF JOIN.
WITH trades_subset AS (
  SELECT symbol, price, amount FROM trades
)
SELECT *
FROM trades_subset ASOF JOIN quotes ON (symbol);
```

In more complicated subqueries, the implicit propagation of the designated timestamp may not work QuestDB responses with an error
`left side of time series join has no timestamp`. In such cases, your subquery should explicitly include the designated
timestamp column in the `SELECT` clause to ensure it is used for the join.

#### The standard override method: Using ORDER BY

The easiest and safest way to join on a different timestamp column is to use an `ORDER BY ... ASC` clause in your subquery.

When you sort a subquery by a `TIMESTAMP` column, QuestDB makes that column the new designated timestamp for the subquery's results. The subsequent `ASOF JOIN` will automatically detect and use this new timestamp.

Example: Joining on `ingestion_time` instead of the default `trade_ts`

```questdb-sql title="ASOF JOIN with custom timestamp"
WITH trades_ordered_by_ingestion AS (
  SELECT symbol, price, ingestion_time
  FROM trades
  WHERE symbol = 'QDB'
  -- This ORDER BY clause tells QuestDB to use 'ingestion_time'
  -- as the new designated timestamp for this subquery.
  ORDER BY ingestion_time ASC
)
-- No extra syntax is needed here. The ASOF JOIN automatically uses
-- the new designated timestamp from the subquery.
SELECT *
FROM trades_ordered_by_ingestion
ASOF JOIN quotes ON (symbol);
```

#### Using the timestamp() syntax

The `timestamp()` syntax is an expert-level hint for the query engine. It should only be used to manually assign a
timestamp to a dataset that does not have one, without forcing a sort.

You should only use this when you can guarantee that your data is already sorted by that timestamp column. Using
`timestamp()` incorrectly on unsorted data will lead to incorrect join results.

The primary use case is performance optimization on a table that has no designated timestamp in its schema, but where
you know the data is physically stored in chronological order. Using the `timestamp()` hint avoids a costly ORDER BY
operation.

```questdb-sql title="ASOF JOIN with timestamp()"
-- Use this ONLY IF 'my_unsorted_table' has NO designated timestamp,
-- but you can guarantee its data is already physically ordered by 'event_time'.

SELECT *
FROM (my_unsorted_table timestamp(event_time))
ASOF JOIN another_table ON (symbol);
```

To summarize:

1. By default, the table's designated timestamp is used.
2. To join on a different column, the standard method is to `ORDER BY` that column in a subquery.
3. Use the `timestamp()` syntax as an expert-level hint to avoid a sort on a table with no designated timestamp, if and
   only if you are certain the data is already sorted.

### SQL performance hints for ASOF JOIN

QuestDB supports SQL hints that can optimize non-keyed ASOF join performance when filters are applied to the joined table:

```questdb-sql title="ASOF JOIN with optimization hint"
SELECT /*+ USE_ASOF_BINARY_SEARCH(trades order_book) */ *
FROM trades 
ASOF JOIN (
  SELECT * FROM order_book 
  WHERE state = 'VALID'
) order_book;
```

For more information on when and how to use these optimization hints, see the [SQL Hints](/concept/sql-optimizer-hints/)
documentation.

## SPLICE JOIN

Want to join all records from both tables?

`SPLICE JOIN` is a full `ASOF JOIN`.

Read the [JOIN reference](/docs/reference/sql/join/#splice-join) for more
information on SPLICE JOIN.
