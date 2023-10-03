---
title: Analytic functions
sidebar_label: Analytic
description: Analytic functions reference documentation.
---

This page describes the available analytic functions. QuestDB is working on
adding more analytic functions.

An analytic function performs a calculation across a set of table rows that are
somehow related to the current row.

## Syntax

![Flow chart showing the syntax of an analytic function](/img/docs/diagrams/analyticFunction.svg)

Analytic functions are used with an `OVER` clause to define the way data is
grouped and processed. The `OVER` clause is used with `PARTITION BY` and
`ORDER BY` to set unique parameters and organize the rows.

## rank

`rank()` - returns the rank of the current row, with gaps; that is, the
`row_number` of the first row in its peer group.

**Arguments:**

- `rank()` does not require arguments.

**Return value:**

Return value type is `long`.

**Description**

`rank()` returns values dynamically and there is no guarantee that the rows
returned will be ordered exactly the same with each execution of the query.
Hence, an `ORDER BY` outside of the `OVER()` clause can be used to ensure the
output order.

**Examples:**

For a given table `housing`:

```questdb-sql
CREATE TABLE 'housing' (
  id INT,
  price DOUBLE,
  rating INT,
  location STRING,
  date_sold TIMESTAMP
);
```

| id  | price    | rating | location       | date_sold                   |
| --- | -------- | ------ | -------------- | --------------------------- |
| 2   | 246.3393 | 1      | alcatraz_ave   | 2021-02-01T00:00:00.000000Z |
| 10  | 69.2601  | 5      | alcatraz_ave   | 2021-02-01T04:00:00.000000Z |
| 15  | 616.2569 | 3      | westbrae       | 2021-02-01T08:00:00.000000Z |
| 3   | 112.7856 | 5      | south_side     | 2021-02-01T12:00:00.000000Z |
| 17  | 993.3345 | 1      | south_side     | 2021-02-01T16:00:00.000000Z |
| 8   | 937.4274 | 1      | berkeley_hills | 2021-02-01T20:00:00.000000Z |
| 4   | 207.7797 | 1      | alcatraz_ave   | 2021-02-02T00:00:00.000000Z |
| 17  | 352.3193 | 3      | downtown       | 2021-02-02T04:00:00.000000Z |
| 3   | 140.0437 | 1      | westbrae       | 2021-02-02T08:00:00.000000Z |
| 15  | 971.7142 | 1      | westbrae       | 2021-02-02T12:00:00.000000Z |

The following query uses `rank()` to display output based on the rating:

```questdb-sql
SELECT location, price, date_sold, rating,
  rank() OVER (ORDER BY rating ASC) rank
FROM 'housing'
ORDER BY rank;
```

| location       | price    | date_sold                   | rating | rank |
| -------------- | -------- | --------------------------- | ------ | ---- |
| westbrae       | 971.7142 | 2021-02-02T12:00:00.000000Z | 1      | 1    |
| westbrae       | 140.0437 | 2021-02-02T08:00:00.000000Z | 1      | 1    |
| alcatraz_ave   | 207.7797 | 2021-02-02T00:00:00.000000Z | 1      | 1    |
| berkeley_hills | 937.4274 | 2021-02-01T20:00:00.000000Z | 1      | 1    |
| south_side     | 993.3345 | 2021-02-01T16:00:00.000000Z | 1      | 1    |
| alcatraz_ave   | 246.3393 | 2021-02-01T00:00:00.000000Z | 1      | 1    |
| downtown       | 352.3193 | 2021-02-02T04:00:00.000000Z | 3      | 7    |
| westbrae       | 616.2569 | 2021-02-01T08:00:00.000000Z | 3      | 7    |
| south_side     | 112.7856 | 2021-02-01T12:00:00.000000Z | 5      | 9    |
| alcatraz_ave   | 69.2601  | 2021-02-01T04:00:00.000000Z | 5      | 9    |

## row_number

`row_number()` - assigns a row number to each row in a result set. For each
partition, the row number starts with one and increments by one.

**Arguments:**

- `row_number` does not require arguments.

**Return value:**

Return value type is `long`.

**Description**

`row_number()` returns values dynamically and there is no guarantee that the
rows returned will be ordered exactly the same with each execution of the query.
Hence, an `ORDER BY` outside of the `OVER()` clause can be used to ensure the
output order.

**Examples:**

Given a table `trades`, the queries below use `row_number()` with a `WHERE`
clause to filter trading records added within one day.

The following query assigns row numbers and orders output based on them:

```questdb-sql
SELECT
symbol,
side,
price,
amount,
row_number() OVER () AS row_num
FROM trades
WHERE timestamp > dateadd('d', -1, now())
ORDER BY row_num ASC;
-- The ORDER BY clause arranges the output based on the assigned row_num.
```

| symbol  | side | price    | amount     | row_num |
| :------ | :--- | :------- | :--------- | :------ |
| BTC-USD | sell | 20633.47 | 0.17569298 | 1       |
| ETH-USD | sell | 1560.04  | 1.3289     | 2       |
| ETH-USD | sell | 1560.04  | 0.3        | 3       |
| ETH-USD | sell | 1560     | 1.40426786 | 4       |
| BTC-USD | buy  | 20633.48 | 0.00179092 | 5       |

The following query groups the table based on `symbol` and assigns row numbers
to each group based on `price`:

```questdb-sql
SELECT
symbol,
side,
price,
amount,
row_number() OVER (PARTITION BY symbol ORDER BY price) AS row_num
FROM trades
WHERE timestamp > dateadd('d', -1, now())
ORDER BY row_num ASC;
-- The ORDER BY clause arranges the output based on the assigned row_num.
```

| symbol  | side | price   | amount     | row_num |
| :------ | :--- | :------ | :--------- | :------ |
| BTC-USD | Sell | 1479.41 | 0.10904633 | 1       |
| ETH-USD | Sell | 20000   | 0.1        | 1       |
| BTC-USD | Sell | 1479.45 | 0.02       | 2       |
| ETH-USD | Sell | 20000   | 0.000249   | 2       |
