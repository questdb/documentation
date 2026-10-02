---
title: LATEST ON keyword
sidebar_label: LATEST ON
description:
  LATEST ON ... PARTITION BY returns the most recent row per key, such as the
  latest price per symbol. Syntax, supported column types, and examples.
---

Returns the latest row per group: the most recent entry by timestamp for each
key or combination of keys. Use it when many time series share one table, for
example to get the latest price per symbol or the latest balance per account.

## Syntax

```questdb-sql
[SELECT { * | columnName [, columnName ...] } FROM] { tableName | (subQuery) }
[WHERE condition]
LATEST ON timestampColumn PARTITION BY partitionColumn [, partitionColumn ...];
```

where:

- `timestampColumn` is a `TIMESTAMP` or `TIMESTAMP_NS` column. When querying a
  table directly, it must be the table's
  [designated timestamp](/docs/concepts/designated-timestamp/).
- `partitionColumn` is one or more columns that identify each time series.
- `SELECT * FROM` can be omitted, for example
  `trades LATEST ON timestamp PARTITION BY symbol;`.

### Supported PARTITION BY column types

`PARTITION BY` in `LATEST ON` accepts columns of any type except `BINARY`,
`ARRAY`, and `DECIMAL`. Using one of these types fails with an
`invalid type ... are supported in LATEST ON` error.

## Description

`LATEST ON` is used as part of a [SELECT statement](/docs/query/sql/select/)
for returning the most recent records per unique time series identified by the
`PARTITION BY` column values.

`LATEST ON` requires a
[designated timestamp](/docs/concepts/designated-timestamp/) column. Use
[sub-queries](#latest-on-over-sub-query) for tables without the designated
timestamp.

The query syntax has an impact on the [execution order](#execution-order) of the
`LATEST ON` clause and the `WHERE` clause.

To illustrate how `LATEST ON` is intended to be used, consider the `fx_trades`
table [in the QuestDB demo instance](https://demo.questdb.io/). This table has a
`symbol` column as `SYMBOL` type which specifies the traded currency pair. We
can find the most recent trade for each symbol with the following query:

```questdb-sql demo title="Latest trade per symbol"
SELECT symbol, timestamp, price
FROM fx_trades
LATEST ON timestamp PARTITION BY symbol;
```

The query returns one row per distinct value of the `PARTITION BY` column(s),
here one row per symbol. The `LATEST ON` column is the timestamp used to decide
which row is the most recent.

Rows with `NULL` in a `PARTITION BY` column form their own group, and the
latest of them is returned like any other key.

## Examples

For the next examples, we can create a table called `balances` with the
following SQL:

```questdb-sql
CREATE TABLE balances (
    cust_id SYMBOL,
    balance_ccy SYMBOL,
    balance DOUBLE,
    ts TIMESTAMP
) TIMESTAMP(ts) PARTITION BY DAY;

insert into balances values ('1', 'USD', 600.5, '2020-04-21T16:03:43.504432Z');
insert into balances values ('2', 'USD', 950, '2020-04-21T16:08:34.404665Z');
insert into balances values ('2', 'EUR', 780.2, '2020-04-21T16:11:22.704665Z');
insert into balances values ('1', 'USD', 1500, '2020-04-21T16:11:32.904234Z');
insert into balances values ('1', 'EUR', 650.5, '2020-04-22T16:11:32.904234Z');
insert into balances values ('2', 'USD', 900.75, '2020-04-22T16:12:43.504432Z');
insert into balances values ('2', 'EUR', 880.2, '2020-04-22T16:18:34.404665Z');
insert into balances values ('1', 'USD', 330.5, '2020-04-22T16:20:14.404997Z');
```

This provides us with a table with the following content:

| cust_id | balance_ccy | balance | ts                          |
| ------- | ----------- | ------- | --------------------------- |
| 1       | USD         | 600.5   | 2020-04-21T16:03:43.504432Z |
| 2       | USD         | 950     | 2020-04-21T16:08:34.404665Z |
| 2       | EUR         | 780.2   | 2020-04-21T16:11:22.704665Z |
| 1       | USD         | 1500    | 2020-04-21T16:11:32.904234Z |
| 1       | EUR         | 650.5   | 2020-04-22T16:11:32.904234Z |
| 2       | USD         | 900.75  | 2020-04-22T16:12:43.504432Z |
| 2       | EUR         | 880.2   | 2020-04-22T16:18:34.404665Z |
| 1       | USD         | 330.5   | 2020-04-22T16:20:14.404997Z |

### Single column

When `PARTITION BY` has a single `SYMBOL` column, the query ends as soon as the
latest row for every distinct symbol value is found.

```questdb-sql title="Latest records by customer ID"
SELECT * FROM balances
LATEST ON ts PARTITION BY cust_id;
```

The query returns two rows with the most recent records per unique `cust_id`
value:

| cust_id | balance_ccy | balance | ts                          |
| ------- | ----------- | ------- | --------------------------- |
| 2       | EUR         | 880.2   | 2020-04-22T16:18:34.404665Z |
| 1       | USD         | 330.5   | 2020-04-22T16:20:14.404997Z |

### Multiple columns

When `PARTITION BY` has multiple columns, the query returns the most recent row
for each **unique combination** of the column values. This example returns the
latest balance per customer ID and balance currency:

```questdb-sql title="Latest balance by customer and currency"
SELECT cust_id, balance_ccy, balance, ts
FROM balances
LATEST ON ts PARTITION BY cust_id, balance_ccy;
```

The results return the most recent records for each unique combination of
`cust_id` and `balance_ccy`.

| cust_id | balance_ccy | balance | ts                          |
| ------- | ----------- | ------- | --------------------------- |
| 1       | EUR         | 650.5   | 2020-04-22T16:11:32.904234Z |
| 2       | USD         | 900.75  | 2020-04-22T16:12:43.504432Z |
| 2       | EUR         | 880.2   | 2020-04-22T16:18:34.404665Z |
| 1       | USD         | 330.5   | 2020-04-22T16:20:14.404997Z |

#### Performance considerations

When `PARTITION BY` has a single `SYMBOL` column, QuestDB knows all distinct
values upfront and stops scanning once the latest row has been found for each
distinct symbol value.

When `PARTITION BY` has only `SYMBOL` columns, QuestDB stops once it has found
every possible combination of symbol values. In practice many combinations never
occur, so the query often scans the whole table.

When `PARTITION BY` has any non-`SYMBOL` column, QuestDB scans the whole table
(or the time range selected by `WHERE`) to find the distinct values.

Scanning is fast, but it slows down on hundreds of millions of rows.

### LATEST ON over sub-query

For this example, we can create another table called `unordered_balances` with
the following SQL:

```questdb-sql
CREATE TABLE unordered_balances (
    cust_id SYMBOL,
    balance_ccy SYMBOL,
    balance DOUBLE,
    ts TIMESTAMP
);

insert into unordered_balances values ('2', 'USD', 950, '2020-04-21T16:08:34.404665Z');
insert into unordered_balances values ('1', 'USD', 330.5, '2020-04-22T16:20:14.404997Z');
insert into unordered_balances values ('2', 'USD', 900.75, '2020-04-22T16:12:43.504432Z');
insert into unordered_balances values ('1', 'USD', 1500, '2020-04-21T16:11:32.904234Z');
insert into unordered_balances values ('1', 'USD', 600.5, '2020-04-21T16:03:43.504432Z');
insert into unordered_balances values ('1', 'EUR', 650.5, '2020-04-22T16:11:32.904234Z');
insert into unordered_balances values ('2', 'EUR', 880.2, '2020-04-22T16:18:34.404665Z');
insert into unordered_balances values ('2', 'EUR', 780.2, '2020-04-21T16:11:22.704665Z');
```

Note that this table doesn't have a designated timestamp column and also
contains time series that are unordered by `ts` column.

Due to the absent designated timestamp column, we can't use `LATEST ON` directly
on this table, but it's possible to use `LATEST ON` over a sub-query:

```questdb-sql title="Latest balance by customer over unordered data"
(SELECT * FROM unordered_balances)
LATEST ON ts PARTITION BY cust_id;
```

Just like with the `balances` table, the query returns two rows with the most
recent records per unique `cust_id` value:

| cust_id | balance_ccy | balance | ts                          |
| ------- | ----------- | ------- | --------------------------- |
| 2       | EUR         | 880.2   | 2020-04-22T16:18:34.404665Z |
| 1       | USD         | 330.5   | 2020-04-22T16:20:14.404997Z |

### Execution order

The following queries illustrate how to change the execution order in a query by
using brackets.

#### WHERE first

```questdb-sql
SELECT * FROM balances
WHERE balance > 800
LATEST ON ts PARTITION BY cust_id;
```

This query executes `WHERE` before `LATEST ON` and returns the most recent
balance which is above 800. The execution order is as follows:

- keep only balances above 800
- find the latest balance by `cust_id`

| cust_id | balance_ccy | balance | ts                          |
| ------- | ----------- | ------- | --------------------------- |
| 1       | USD         | 1500    | 2020-04-21T16:11:32.904234Z |
| 2       | EUR         | 880.2   | 2020-04-22T16:18:34.404665Z |

#### LATEST ON first

```questdb-sql
(SELECT * FROM balances LATEST ON ts PARTITION BY cust_id) --note the brackets
WHERE balance > 800;
```

This query executes `LATEST ON` before `WHERE` and returns the most recent
records, then filters out those below 800. The steps are:

1. Find the latest balances by customer ID.
2. Keep only balances above 800. Since the latest balance for customer 1 is
   equal to 330.5, it is filtered out in this step.

| cust_id | balance_ccy | balance | ts                          |
| ------- | ----------- | ------- | --------------------------- |
| 2       | EUR         | 880.2   | 2020-04-22T16:18:34.404665Z |

#### Combination

Combine a time filter with the balance filter from the previous example to get
the latest balance per customer on `2020-04-21`, then keep only balances above
800:

```questdb-sql title="Filter a time slice, then apply LATEST ON"
(balances WHERE ts IN '2020-04-21' LATEST ON ts PARTITION BY cust_id)
WHERE balance > 800;
```

| cust_id | balance_ccy | balance | ts                          |
| ------- | ----------- | ------- | --------------------------- |
| 1       | USD         | 1500    | 2020-04-21T16:11:32.904234Z |

On `2020-04-21`, the latest balance for customer 2 is 780.2, so it is filtered
out. `SELECT * FROM` is omitted to keep the query compact.

The same pattern works on the demo instance:

```questdb-sql demo title="Latest trade per symbol today, above a price"
(fx_trades WHERE timestamp IN '$today' LATEST ON timestamp PARTITION BY symbol)
WHERE price > 1;
```
