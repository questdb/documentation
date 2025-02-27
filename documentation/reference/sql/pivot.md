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

## Mechanics

The `PIVOT` keyword comes after a general table select.

There are two components:

#### Aggregate Columns

These columns appear immediately after the `PIVOT` keyword. These are aggregates that will be
calculated for each of the Pivot columns. These are the values that will be placed in the output columns.

#### Pivot Columns

These columns appear after the `FOR` keyword, and define the filtering and final column names. The aggregate
functions will be run for each of these.

### Single aggregate and pivot

```questdb-sql title="basic PIVOT" demo
(trades LIMIT 1000) 
    PIVOT (
      avg(price) 
      FOR symbol IN ('BTC-USD', 'ETH-USD')
    );
```

| BTC-USD            | ETH-USD           |
| ------------------ | ----------------- |
| 39282.200736543906 | 2616.588454404948 |


This query calculates an average `price` based on filtering rows that contain the `symbol`s defined in the queries.

In short, this shifts the `symbol` names into the column position, and fills it with the corresponding aggregate value.

An equivalent non-pivot query might look like this:

```questdb-sql title="basic PIVOT without PIVOT demo
SELECT
  avg(CASE WHEN symbol = 'BTC-USD' THEN price END) AS 'BTC-USD',
  avg(CASE WHEN symbol = 'ETH-USD' THEN price END) AS 'ETH-USD'
FROM trades
```

### Multiple aggregates, single pivot

```questdb-sql title="multiple aggregates" demo
(trades LIMIT 1000) 
    PIVOT (
      avg(price),
      count(price) 
      FOR symbol IN ('BTC-USD', 'ETH-USD')
    );
```

| BTC-USD_avg        | BTC-USD_count | ETH-USD_avg       | ETH-USD_count |
| ------------------ | ------------- | ----------------- | ------------- |
| 39282.200736543906 | 353           | 2616.588454404948 | 647           |

In this case, the aggregate functions are applied to each of the filtered symbols, so the final output has $2 \times 2 = 4$ columns.

### Single aggregate, multiple pivots

```questdb-sql title="multiple pivots" demo
(trades LIMIT 1000) 
    PIVOT (
      avg(price) 
      FOR symbol IN ('BTC-USD', 'ETH-USD')
          side IN ('buy', 'sell')
    );
```

| BTC-USD_buy        | BTC-USD_sell      | ETH-USD_buy       | ETH-USD_sell      |
| ------------------ | ----------------- | ----------------- | ----------------- |
| 39286.997461139894 | 39276.41468750003 | 2616.850413223139 | 2616.253626760561 |

In this case, the aggregate function is applied to each of the symbols, combinatorially.

Therefore, the output dataset is $1 x (2 x 2) = 4$ columns.

### Multiple aggregates, multiple pivots

```questdb-sql title="multiple aggregates and pivots" demo
(trades LIMIT 1000)
    PIVOT (
      avg(price),
      count(price) 
      FOR symbol IN ('BTC-USD', 'ETH-USD')
          side IN ('buy', 'sell')
    );
```

| BTC-USD_buy_avg    | BTC-USD_buy_count | BTC-USD_sell_avg  | BTC-USD_sell_count | ETH-USD_buy_avg   | ETH-USD_buy_count | ETH-USD_sell_avg  | ETH-USD_sell_count |
| ------------------ | ----------------- | ----------------- | ------------------ | ----------------- | ----------------- | ----------------- | ------------------ |
| 39286.997461139894 | 193               | 39276.41468750003 | 160                | 2616.850413223139 | 363               | 2616.253626760561 | 284                |

Each of the aggregates is applied to each combination of pivot columns. Therefore, the output column count is $2 x 2 x 2 = 8$.

### Aliasing aggregate columns

If you wish to control the column output name, or need to override it to avoid duplicate issues, you can set an alias.

```questdb-sql title="aggregate with alias" demo
(trades LIMIT 1000)
    PIVOT (
      avg(price) as average_price
      FOR symbol IN ('BTC-USD', 'ETH-USD')
    );
```

| BTC-USD_average_price | ETH-USD_average_price |
| --------------------- | --------------------- |
| 39282.200736543906    | 2616.588454404948     |

### With `GROUP BY`

You can add an explicit group by to the PIVOT clause to modify the output result set.

Consider this basic case, where we are just taking an average price:

```questdb-sql title="pivot without explicit group by" demo
(trades LIMIT 1000) 
  PIVOT (
    avg(price) 
    FOR symbol IN ('BTC-USD')
  );
```

| BTC-USD            |
| ------------------ |
| 39282.200736543906 |


Perhaps we actually want to run this for both `buy` and `sell` sides? In earlier examples, we demonstrated how
you can do this with multiple output columns:

```questdb-sql title="multiple pivots without explicit group by" demo
(trades LIMIT 1000) 
  PIVOT (
    avg(price) 
    FOR symbol IN ('BTC-USD')
        side IN ('buy', 'sell')
  );
```

| BTC-USD_buy        | BTC-USD_sell      |
| ------------------ | ----------------- |
| 39286.997461139894 | 39276.41468750003 |

But perhaps we'd rather just have a `side` and `BTC-USD` column, with two rows in the output?

```questdb-sql title="pivot with explicit group by" demo
(trades LIMIT 1000) 
  PIVOT (
    avg(price) 
    FOR symbol IN ('BTC-USD')
    GROUP BY side
  );
```

| side | BTC-USD            |
| ---- | ------------------ |
| buy  | 39286.997461139894 |
| sell | 39276.41468750003  |

You can imagine that the above query is equivalent to:

```questdb-sql title="above without using pivot" demo
SELECT side,
       avg(price) as 'BTC-USD'
  FROM (trades LIMIT 1000)
  WHERE symbol = 'BTC-USD'
  GROUP BY side, symbol
```

This then scales up as you add more clauses to the `PIVOT`:

```questdb-sql title="explicit group by and multiple clauses" demo
(trades LIMIT 1000) 
  PIVOT (
    avg(price),
    count(price)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
    GROUP BY side
  );
```

| side | BTC-USD_avg        | BTC-USD_count | ETH-USD_avg       | ETH-USD_count |
| ---- | ------------------ | ------------- | ----------------- | ------------- |
| sell | 39276.41468750003  | 160           | 2616.253626760561 | 284           |
| buy  | 39286.997461139894 | 193           | 2616.850413223139 | 363           |

### With `ORDER BY`

We can add an `ORDER BY` clause to sort the final result set by a column. For example, if
we wanted to guarantee the ordering to be the `buy` row, then `sell`:

```questdb-sql title="explicit group by and order by" demo
(trades LIMIT 1000) 
  PIVOT (
    avg(price),
    count(price)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
    GROUP BY side
    ORDER BY side
  );
```

| side | BTC-USD_avg        | BTC-USD_count | ETH-USD_avg       | ETH-USD_count |
| ---- | ------------------ | ------------- | ----------------- | ------------- |
| buy  | 39286.997461139894 | 193           | 2616.850413223139 | 363           |
| sell | 39276.41468750003  | 160           | 2616.253626760561 | 284           |


### With `LIMIT`

Additionally, you can tag a `LIMIT` on the query. So we could take the above result set and select just the first row.

```questdb-sql title="explicit group by and order by and limit" demo
(trades LIMIT 1000) 
  PIVOT (
    avg(price),
    count(price)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
    GROUP BY side
    ORDER BY side
    LIMIT 1
  );
```

| side | BTC-USD_avg        | BTC-USD_count | ETH-USD_avg       | ETH-USD_count |
| ---- | ------------------ | ------------- | ----------------- | ------------- |
| buy  | 39286.997461139894 | 193           | 2616.850413223139 | 363           |

