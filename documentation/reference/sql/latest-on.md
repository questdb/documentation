---
title: LATEST ON keyword
sidebar_label: LATEST ON
description:
  Reference documentation for using LATEST ON keywords with examples for
  illustration.
---

Retrieves the latest entry by timestamp for a given key or combination of keys,
for scenarios where multiple time series are stored in the same table.

## Syntax

![Flow chart showing the syntax of the LATEST ON keyword](/images/docs/diagrams/latestOn.svg)

where:

- `columnName` used in the `LATEST ON` part of the clause is a `TIMESTAMP`
  column.
- `columnName` list used in the `PARTITION BY` part of the clause is a list of
  columns of one of the following types: `SYMBOL`, `STRING`, `BOOLEAN`, `SHORT`,
  `INT`, `LONG`, `LONG256`, `CHAR`.

## Description

`LATEST ON` is used as part of a [SELECT statement](/docs/reference/sql/select/)
for returning the most recent records per unique time series identified by the
`PARTITION BY` column values.

`LATEST ON` requires a
[designated timestamp](/docs/concept/designated-timestamp/) column. Use
[sub-queries](#latest-on-over-sub-query) for tables without the designated
timestamp.

The query syntax has an impact on the [execution order](#execution-order) of the
`LATEST ON` clause and the `WHERE` clause.

To illustrate how `LATEST ON` is intended to be used, consider the `trips` table
[in the QuestDB demo instance](https://demo.questdb.io/). This table has a
`payment_type` column as `SYMBOL` type which specifies the method of payment per
trip. We can find the most recent trip for each unique method of payment with
the following query:

```questdb-sql
SELECT payment_type, pickup_datetime, trip_distance
FROM trips
LATEST ON pickup_datetime PARTITION BY payment_type;
```

| payment_type | pickup_datetime             | trip_distance |
| ------------ | --------------------------- | ------------- |
| Dispute      | 2014-12-31T23:55:27.000000Z | 1.2           |
| Voided       | 2019-06-27T17:56:45.000000Z | 1.9           |
| Unknown      | 2019-06-30T23:57:42.000000Z | 3.9           |
| No Charge    | 2019-06-30T23:59:30.000000Z | 5.2           |
| Cash         | 2019-06-30T23:59:54.000000Z | 2             |
| Card         | 2019-06-30T23:59:56.000000Z | 1             |

The above query returns the latest value within each time series stored in the
table. Those time series are determined based on the values in the column(s)
specified in the `LATEST ON` clause. In our example those time series are
represented by different payment types. Then the column used in the `LATEST ON`
part of the clause stands for the designated timestamp column for the table.
This allows the database to find the latest value within each time series.

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
| 1       | USD         | 600.5   | 2020-04-21T16:01:22.104234Z |
| 2       | USD         | 950     | 2020-04-21T16:03:43.504432Z |
| 2       | EUR         | 780.2   | 2020-04-21T16:08:34.404665Z |
| 1       | USD         | 1500    | 2020-04-21T16:11:22.704665Z |
| 1       | EUR         | 650.5   | 2020-04-22T16:11:32.904234Z |
| 2       | USD         | 900.75  | 2020-04-22T16:12:43.504432Z |
| 2       | EUR         | 880.2   | 2020-04-22T16:18:34.404665Z |
| 1       | USD         | 330.5   | 2020-04-22T16:20:14.404997Z |

### Single column

When a single `symbol` column is specified in `LATEST ON` queries, the query
will end after all distinct symbol values are found.

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

When multiple columns are specified in `LATEST ON` queries, the returned results
are the most recent **unique combinations** of the column values. This example
query returns `LATEST ON` customer ID and balance currency:

```questdb-sql title="Latest balance by customer and currency"
SELECT cust_id, balance_ccy, balance
FROM balances
LATEST ON ts PARTITION BY cust_id, balance_ccy;
```

The results return the most recent records for each unique combination of
`cust_id` and `balance_ccy`.

| cust_id | balance_ccy | balance | inactive | ts                          |
| ------- | ----------- | ------- | -------- | --------------------------- |
| 1       | EUR         | 650.5   | FALSE    | 2020-04-22T16:11:32.904234Z |
| 2       | USD         | 900.75  | FALSE    | 2020-04-22T16:12:43.504432Z |
| 2       | EUR         | 880.2   | FALSE    | 2020-04-22T16:18:34.404665Z |
| 1       | USD         | 330.5   | FALSE    | 2020-04-22T16:20:14.404997Z |

#### Performance considerations

When the `LATEST ON` clause contains a single `symbol` column, QuestDB will know
all distinct values upfront and stop scanning table contents once the latest
entry has been found for each distinct symbol value.

When the `LATEST ON` clause contains multiple columns, QuestDB has to scan the
entire table to find distinct combinations of column values.

Although scanning is fast, performance will degrade on hundreds of millions of
records. If there are multiple columns in the `LATEST ON` clause, this will
result in a full table scan.

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

- filter out all balances below 800
- find the latest balance by `cust_id`

| cust_id | balance_ccy | balance | ts                          |
| ------- | ----------- | ------- | --------------------------- |
| 1       | USD         | 1500    | 2020-04-22T16:11:22.704665Z |
| 2       | EUR         | 880.2   | 2020-04-22T16:18:34.404665Z |

#### LATEST ON first

```questdb-sql
(SELECT * FROM balances LATEST ON ts PARTITION BY cust_id) --note the brackets
WHERE balance > 800;
```

This query executes `LATEST ON` before `WHERE` and returns the most recent
records, then filters out those below 800. The steps are:

1. Find the latest balances by customer ID.
2. Filter out balances below 800. Since the latest balance for customer 1 is
   equal to 330.5, it is filtered out in this step.

| cust_id | balance_ccy | balance | inactive | ts                          |
| ------- | ----------- | ------- | -------- | --------------------------- |
| 2       | EUR         | 880.2   | FALSE    | 2020-04-22T16:18:34.404665Z |

#### Combination

It's possible to combine a time-based filter with the balance filter from the
previous example to query the latest values for the `2020-04-21` date and filter
out those below 800.

```questdb-sql
(balances WHERE ts in '2020-04-21' LATEST ON ts PARTITION BY cust_id)
WHERE balance > 800;
```

Since QuestDB allows you to omit the `SELECT * FROM` part of the query, we
omitted it to keep the query compact.

Such a combination is very powerful since it allows you to find the latest
values for a time slice of the data and then apply a filter to them in a single
query.
