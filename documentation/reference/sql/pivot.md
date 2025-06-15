---
title: PIVOT keyword
sidebar_label: PIVOT
description: PIVOT SQL keyword reference documentation.
---

`PIVOT` allows you to pivot rows into a columns. This can be useful when you want to ingest narrow-schema data,
and then pivot it into a wide-schema.

This syntax is supported within `SELECT` queries.

## Syntax

![Flow chart showing the syntax of the PIVOT keyword](/images/docs/diagrams/pivot.svg)

## Components of a `PIVOT` query

The `PIVOT` keyword comes after a general table select, or a table name expression.

A `PIVOT` query tranposes row-oriented data to column-oriented. Put simply, you can turn a
multi-row dataset, into a multi-column dataset. This is particularly useful for charting purposes, or for transforming data from narrow to wide schemas. By

`PIVOT` will be executed using the normal optimisations for grouping, sorting and filtering rows.

A `PIVOT` query has several components:

### A `SELECT` statement

A `PIVOT` begins with a result set, which can be provided in three ways:

- With a table_name; `trades PIVOT ( ... )`
- With a wildcard select: `SELECT * FROM trades PIVOT ( ... )`
- With a subquery: `(trades LIMIT 10) PIVOT ( ... )`

### A list of aggregate functions

Next, a `PIVOT` query will define a series of aggregation columns, which can be provided:

- On their own: `... PIVOT (avg(price) ... )`
- With an alias: `... PIVOT (count(price) as total ... )`
- More than once, with comma separation: `... PIVOT (avg(price), avg(amount) ... )`

Each of these aggregates will be executed on the underlying dataset, for each combination of symbol filters.

### Pivot columns (`FOR-IN`)

Then `FOR-IN` expressions specify which column should be filtered, and which values should be selected.

These can be provided:

- As a constant list: `... FOR symbol IN ('BTC-USD', 'ETH-USD') ...`
- As an aliased constant list: `... FOR symbol IN ('BTC-USD' as bitcoin, 'ETH-USD' as ethereum) ...`
- As a dynamic subquery: `... FOR symbol IN (SELECT DISTINCT symbol FROM trades) ...`
- With an `ELSE` catch-all: `... FOR symbol IN ('BTC-USD') ELSE 'Rest' ...`
- More than once, with whitespace separation: ` ... FOR symbol IN ('BTC-USD', 'ETH-USD') side IN ('buy', 'sell') ...`

All combinations of values from the `IN` lists will be combined into filters, and the aggregate functions will be executed
for each of these combined filters.

The final results will be provided as individual columns.

### `GROUP BY` (optional)

`PIVOT` supports an  optional `GROUP BY` column, to specify grouping keys for your aggregate functions:

- `... IN ( ... ) GROUP BY side );`

### `ORDER BY` (optional)

`PIVOT` supports an  optional `ORDER BY` column, to specify a sort order for the final result set:

- `... IN ( ... ) GROUP BY side ORDER BY side );`

### `LIMIT` (optional)

`PIVOT` supports an  optional `ORDER BY` column, to specify a sort order for the final result set:

- `... IN ( ... ) GROUP BY side ORDER BY side LIMIT 1 );`


todo: continue refactoring

## Building a query

Let's start with our demo query and dataset.

```questdb-sql title="trades ddl" demo
SHOW CREATE TABLE trades;
```

```questdb-sql
CREATE TABLE 'trades' (
    symbol SYMBOL CAPACITY 256 CACHE,
    side SYMBOL CAPACITY 256 CACHE,
    price DOUBLE,
    amount DOUBLE,
    timestamp TIMESTAMP
) timestamp(timestamp) PARTITION BY DAY WAL;
```

```questdb-sql title="trades subset" demo
trades LIMIT 10;
```

| symbol  | side | price    | amount     | timestamp                   |
|---------|------|----------|------------|-----------------------------|
| ETH-USD | sell | 2615.54  | 0.00044    | 2022-03-08T18:03:57.609765Z |
| BTC-USD | sell | 39269.98 | 0.001      | 2022-03-08T18:03:57.710419Z |
| ETH-USD | buy  | 2615.4   | 0.002      | 2022-03-08T18:03:57.764098Z |
| ETH-USD | buy  | 2615.4   | 0.001      | 2022-03-08T18:03:57.764098Z |
| ETH-USD | buy  | 2615.4   | 0.00042698 | 2022-03-08T18:03:57.764098Z |
| ETH-USD | buy  | 2615.36  | 0.02593599 | 2022-03-08T18:03:58.194582Z |
| ETH-USD | buy  | 2615.37  | 0.03500836 | 2022-03-08T18:03:58.194582Z |
| ETH-USD | buy  | 2615.46  | 0.17260246 | 2022-03-08T18:03:58.194582Z |
| ETH-USD | buy  | 2615.47  | 0.14810976 | 2022-03-08T18:03:58.194582Z |
| BTC-USD | sell | 39265.31 | 0.000127   | 2022-03-08T18:03:58.357448Z |


### Simple pivoting

Let's say we want to get the average price for each symbol. A simple query would be this:

```questdb-sql title="sum group by" demo
SELECT symbol, avg(price)
FROM (trades LIMIT 10);
```

:::note 

QuestDB will infer the `GROUP BY` clause automatically if not provided.

:::

| symbol  | avg                |
| ------- | ------------------ |
| ETH-USD | 2615.425           |
| BTC-USD | 39267.645000000004 |

This gives us multiple rows, one for each symbol. What if we instead wanted one column per symbol?

A regular query would look like this:

```questdb-sql title="manual pivot with case" demo
SELECT avg(CASE WHEN symbol = 'BTC-USD' THEN price END) AS "BTC-USD",
       avg(CASE WHEN symbol = 'ETH-USD' THEN price END) AS "ETH-USD"
FROM (trades LIMIT 10);
```

| BTC-USD            | ETH-USD  |
| ------------------ | -------- |
| 39267.645000000004 | 2615.425 |

This can quickly get verbose, and does not support a dynamic number of symbols. `PIVOT` helps to simplify this pattern:

```questdb-sql title="simple pivot" demo
(trades LIMIT 10)
PIVOT (
    avg(price)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
);
```

| BTC-USD            | ETH-USD  |
| ------------------ | -------- |
| 39267.645000000004 | 2615.425 |


### Multiple aggregate columns

You can `PIVOT` using more than one aggregate function, with each function separated by a comma.

The functions will be applied for each symbol combination (here, there are two).

A regular group by might look like this:

```questdb-sql title="group by with multiple aggregates" demo
SELECT symbol, 
       avg(price) as avg_price, 
       avg(amount) as avg_amount
FROM (trades LIMIT 10)
WHERE symbol IN ('BTC-USD', 'ETH-USD');
```

| symbol  | avg_price          | avg_amount           |
| ------- | ------------------ | -------------------- |
| ETH-USD | 2615.425           | 0.048190443750000006 |
| BTC-USD | 39267.645000000004 | 0.0005635            |

When you have duplicate usage of an aggregate (here, `avg` is used twice), aliases will automatically be generated.

```questdb-sql title="pivot with multiple aggregates" demo
(trades LIMIT 10)
PIVOT (
    avg(price),
    avg(amount)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
);
```

| BTC-USD_avg_price  | BTC-USD_avg_amount | ETH-USD_avg_price | ETH-USD_avg_amount   |
| ------------------ | ------------------ | ----------------- | -------------------- |
| 39267.645000000004 | 0.0005635          | 2615.425          | 0.048190443750000006 |

If you use non-duplicate aggregates, the aliases are simpler:

```questdb-sql title="pivot with multiple aggregates no dup" demo
(trades LIMIT 10)
PIVOT (
    avg(price),
    sum(price)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
);
```

| BTC-USD_avg        | BTC-USD_sum       | ETH-USD_avg | ETH-USD_sum |
| ------------------ | ----------------- | ----------- | ----------- |
| 39267.645000000004 | 78535.29000000001 | 2615.425    | 20923.4     |

### Multiple FOR matches

You can also have multiple `FOR` conditions. Each `IN` clause has a list of constants that will
be permuted with all other `IN` lists. 

Here is a standard `GROUP BY`:

```questdb-sql title="group by with multiple FORs" demo
SELECT symbol,
       side,
       avg(price)
FROM (trades LIMIT 10)
WHERE symbol IN ('BTC-USD', 'ETH-USD')
  AND side = 'buy'
  OR symbol IN ('BTC-USD', 'ETH-USD')
  AND side = 'sell'
```

| symbol  | side | avg                |
| ------- | ---- | ------------------ |
| ETH-USD | buy  | 2615.4085714285716 |
| BTC-USD | sell | 39267.645000000004 |
| ETH-USD | sell | 2615.54            |

Within the `PIVOT`, each `IN` condition is whitespace separated.

```questdb-sql title="pivot with multiple FOR-IN lists" demo
(trades LIMIT 10)
PIVOT (
    avg(price)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
        side   IN ('buy', 'sell')
);
```

| BTC-USD_buy | BTC-USD_sell       | ETH-USD_buy        | ETH-USD_sell |
| ----------- | ------------------ | ------------------ | ------------ |
| null        | 39267.645000000004 | 2615.4085714285716 | 2615.54      |

There are four output columns - since each list had two entries each, there are $2 \times 2$ combinations.

### Multiple aggregates and FOR-IN lists

Both of the above scenarios can be combined, creating more and more powerful column generation patterns:

```questdb-sql title="pivot with multiple aggregates and FOR-IN expressions" demo
(trades LIMIT 10)
PIVOT (
    avg(price),
    sum(price)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
        side   IN ('buy', 'sell')
);
```

| BTC-USD_buy_avg | BTC-USD_buy_sum | BTC-USD_sell_avg   | BTC-USD_sell_sum  | ETH-USD_buy_avg    | ETH-USD_buy_sum | ETH-USD_sell_avg | ETH-USD_sell_sum |
| --------------- | --------------- | ------------------ | ----------------- | ------------------ | --------------- | ---------------- | ---------------- |
| null            | null            | 39267.645000000004 | 78535.29000000001 | 2615.4085714285716 | 18307.86        | 2615.54          |

In this case, we get eight output columns, since there are four columns per aggregation function.


### Aliasing aggregates and filters

If you are unhappy with the default aliasing for the output columns, you can influence what will be generated.

For example, you can place an alias on the aggregate functions:

```questdb-sql title="aliasing aggregate functions" demo
(trades LIMIT 10)
PIVOT (
    count(price) as total
    FOR symbol IN ('BTC-USD', 'ETH-USD')
        side   IN ('buy', 'sell')
);
```

| BTC-USD_buy_total | BTC-USD_sell_total | ETH-USD_buy_total | ETH-USD_sell_total |
| ----------------- | ------------------ | ----------------- | ------------------ |
| 0                 | 2                  | 7                 | 1                  |

You can also alias individual values inside the `IN` expressions:


```questdb-sql title="aliasing FOR-IN lists" demo
(trades LIMIT 10)
PIVOT (
    count(price) as total
    FOR symbol IN ('BTC-USD' as 'bitcoin', 'ETH-USD' as 'ethereum')
        side   IN ('buy', 'sell')
);
```

| bitcoin_buy_total | bitcoin_sell_total | ethereum_buy_total | ethereum_sell_total |
| ----------------- | ------------------ | ------------------ | ------------------- |
| 0                 | 2                  | 7                  | 1                   |


### PIVOT with GROUP BY

We have shown how you can `PIVOT` the result of a `GROUP BY` query and turn the rows into columns.

You may also want to pivot only a few fields to columns, and continue grouping by others. You can use an additional `GROUP BY` expression for this:

```questdb-sql title="pivot with group by" demo
(trades LIMIT 10)
    PIVOT (
    avg(price)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
    GROUP BY side
);
```

| side | BTC-USD            | ETH-USD            |
| ---- | ------------------ | ------------------ |
| sell | 39267.645000000004 | 2615.54            |
| buy  | null               | 2615.4085714285716 |

You can add as many additional `GROUP BY` expressions as needed.


### PIVOT with ORDER BY

In the prior example, we had a result set like this:

| side | BTC-USD            | ETH-USD            |
| ---- | ------------------ | ------------------ |
| sell | 39267.645000000004 | 2615.54            |
| buy  | null               | 2615.4085714285716 |

`PIVOT` also supports an optional `ORDER BY` clause, allowing you to sort the output result set. In this
case, we will sort by `side`:


```questdb-sql title="pivot with order by" demo
(trades LIMIT 10)
    PIVOT (
    avg(price)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
    GROUP BY side
    ORDER BY side
);
```

| side | BTC-USD            | ETH-USD            |
| ---- | ------------------ | ------------------ |
| buy  | null               | 2615.4085714285716 |
| sell | 39267.645000000004 | 2615.54            |

Again, you can order by as many columns as you wish.

### PIVOT with LIMIT

`PIVOT` also supports an optional `LIMIT` clause, allowing you to limit that output rows in your dataset.

You can use this to select just the `buy` row or just the `sell` row:

```questdb-sql title="pivot with limit" demo
(trades LIMIT 10)
    PIVOT (
    avg(price)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
    GROUP BY side
    ORDER BY side
    LIMIT 1
);
```

| side | BTC-USD | ETH-USD            |
| ---- | ------- | ------------------ |
| buy  | null    | 2615.4085714285716 |

```questdb-sql title="pivot with limit" demo
(trades LIMIT 10)
    PIVOT (
    avg(price)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
    GROUP BY side
    ORDER BY side
    LIMIT -1
);
```

| side | BTC-USD            | ETH-USD |
| ---- | ------------------ | ------- |
| sell | 39267.645000000004 | 2615.54 |

### PIVOT with subqueries

So far, we have specified exactly which constants we would like to filter for.

`PIVOT` also supports `IN` lists which are generated by the result of an arbitrary query.

This subquery must return a single output column. It is recommended to use `DISTINCT` to ensure that values are
not repeated, otherwise you may end up with many output columns with duplicate contents.

:::warning

Subqueries in the `IN` expression are executed eagerly at parse-time, and do not follow the
same rules as other subqueries.

:::

```questdb-sql title="pivot with dynamic list" demo
(trades LIMIT 10)
    PIVOT (
    avg(price)
    FOR symbol IN (SELECT DISTINCT symbol FROM (trades LIMIT 10))
);
```

This can be powerful if you are using a dimensional schema, where you store dimensions for your data
in separate tables. 

:::tip

If the subquery runs on a large table, it can slow down the overall `PIVOT` speed. This functionality should be 
prioritised for exploratory data analysis.

Once your data is stable, it is recommended to use a straightforward constant list to minimise query overhead.

Alternatively, you can store the keys in a separate, small, dimension table, which will be very quick to query.

:::

### PIVOT with CTEs

In the above example, we had to use the same table expression twice:

```questdb-sql
(trades LIMIT 10);
```

This is a good candidate for a `WITH` statement (CTE), allows you to re-use the table expression:


```questdb-sql title="pivot with CTE" demo
WITH limited_trades AS (
    trades LIMIT 10
)
SELECT * FROM limited_trades
 PIVOT (
    avg(price)
    FOR symbol IN (SELECT DISTINCT symbol FROM limited_trades))
);
```

| BTC-USD            | ETH-USD  |
| ------------------ | -------- |
| 39267.645000000004 | 2615.425 |

Quite simply, we first create the `limited_trades` named subquery. Then this is used both
for the `PIVOT` select, and for the `IN` list subquery.


### PIVOT with ELSE

We can build some more complex queries using the prior dynamic `IN` lists. Let's consider dynamically
selecting symbols by a pattern:

```questdb-sql title="else motivator" demo
WITH limited_trades AS (
    trades LIMIT 10
)
SELECT * FROM limited_trades
 PIVOT (
    avg(price)
    FOR symbol IN (SELECT DISTINCT symbol FROM limited_trades WHERE symbol LIKE '%BTC%')
    GROUP BY side
);
```

| side | BTC-USD            |
| ---- | ------------------ |
| sell | 39267.645000000004 |

In this example, we filter for any symbols in the table that match `%BTC%`.

What if we want to compare this group of `%BTC%` symbols against any other symbols in the dataset?

`PIVOT` supports an `ELSE` clause which acts as a 'catch-all' for any data not included in the `IN` filter.

Without `ELSE`, this might like look like the following query:

```questdb-sql title="true and false sets without else" demo
WITH limited_trades AS (
    trades LIMIT 10
), true_set AS (
    limited_trades
    PIVOT (
        avg(price)
        FOR symbol IN (SELECT DISTINCT symbol FROM limited_trades WHERE symbol LIKE '%BTC%')
        GROUP BY side
        ORDER BY side
    )
), false_set AS (
    SELECT side, avg(price) AS 'REST' 
    FROM limited_trades
    WHERE symbol NOT LIKE '%BTC%'
), joined AS (
    SELECT * FROM false_set LEFT JOIN true_set ON (side)
)
SELECT side, "BTC-USD", "REST" FROM joined;
```

| side | BTC-USD            | REST               |
| ---- | ------------------ | ------------------ |
| buy  | null               | 2615.4085714285716 |
| sell | 39267.645000000004 | 2615.54            |

This query uses a `PIVOT` for the true set (bitcoin-like symbol), and a plain `GROUP BY` for the rest.

The two result sets are then joined together and projected.

With `ELSE`, we can simplify things, removing the `JOIN` and additional `GROUP BY` CTE.

```questdb-sql title="removing left join with else" demo
WITH limited_trades AS (
    trades LIMIT 10
)
SELECT * FROM limited_trades
PIVOT (
    avg(price)
    FOR symbol IN (
        SELECT DISTINCT symbol FROM limited_trades WHERE symbol LIKE '%BTC%'
    ) ELSE 'REST'
    GROUP BY side
    ORDER BY side
);
```
| side | BTC-USD            | REST               |
| ---- | ------------------ | ------------------ |
| buy  | null               | 2615.4085714285716 |
| sell | 39267.645000000004 | 2615.54            |

