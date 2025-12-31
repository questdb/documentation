---
title: SQL extensions
description:
  QuestDB attempts to implement standard ANSI SQL with time-based extensions for
  convenience. This document describes SQL extensions in QuestDB and how users
  can benefit from them.
---

QuestDB attempts to implement standard ANSI SQL. We also try to be compatible
with PostgreSQL, although parts of this are a work in progress. This page
presents the main extensions we bring to SQL and the main differences that one
might find in SQL but not in QuestDB's dialect.

## SQL extensions

We have extended SQL to support our data storage model and simplify semantics of
time series analytics.

### LATEST ON

[LATEST ON](/docs/query/sql/latest-on/) is a clause introduced to help find
the latest entry by timestamp for a given key or combination of keys as part of
a `SELECT` statement.

```questdb-sql title="LATEST ON symbol ID and side" demo
SELECT * FROM trades
WHERE timestamp IN today()
LATEST ON timestamp PARTITION BY symbol, side;
```

### Timestamp search

Timestamp search can be performed with regular operators, e.g `>`, `<=` etc.
However, QuestDB provides a
[native notation](/docs/query/sql/where/#timestamp-and-date) which is faster
and less verbose.

```questdb-sql title="Results in a given year" demo
SELECT * FROM trades WHERE timestamp IN '2025';
```

### SAMPLE BY

[SAMPLE BY](/docs/query/sql/select/#sample-by) is used for time-based
[aggregations](/docs/query/functions/aggregation/) with an efficient syntax.
The short query below will return the average price from a list of
symbols by one hour buckets.

```questdb-sql title="SAMPLE BY one month buckets" demo
SELECT timestamp, symbol, sum(price) FROM trades
WHERE timestamp in today()
SAMPLE BY 1h;
```


## Differences from standard SQL

### SELECT \* FROM is optional

In QuestDB, using `SELECT * FROM` is optional, so `SELECT * FROM my_table;` will
return the same result as `my_table;`. While adding `SELECT * FROM` makes SQL
look more complete, there are examples where omitting these keywords makes
queries a lot easier to read.

```questdb-sql title="Optional use of SELECT * FROM" demo
trades;
-- equivalent to:
SELECT * FROM trades;
```

### GROUP BY is optional

The `GROUP BY` clause is optional and can be omitted as the QuestDB optimizer
derives group-by implementation from the `SELECT` clause. In standard SQL, users
might write a query like the following:

```questdb-sql title="Standard SQL GROUP BY" demo
SELECT symbol, side, sum(price) FROM trades
WHERE timestamp IN today()
GROUP BY symbol, side;
```

However, enumerating a subset of `SELECT` columns in the `GROUP BY` clause is
redundant and therefore unnecessary. The same SQL in QuestDB SQL-dialect can be
written as:

```questdb-sql title="QuestDB Implicit GROUP BY" demo
SELECT symbol, side, sum(price) FROM trades
WHERE timestamp IN today();
```

### Implicit HAVING

Let's look at another more complex example using `HAVING` in standard SQL:

```questdb-sql title="Standard SQL GROUP BY/HAVING"
SELECT symbol, side, sum(price) FROM trades
WHERE timestamp IN today()
GROUP BY symbol, side
HAVING sum(price) > 1000;
```

In QuestDB's dialect, featherweight sub-queries come to the rescue to create a
smaller, more readable query, without unnecessary repetitive aggregations.
`HAVING` functionality can be obtained implicitly as follows:

```questdb-sql title="QuestDB Implicit HAVING equivalent" demo
(
  SELECT symbol, side, sum(price) as total_price
  FROM trades WHERE timestamp IN today()
)
WHERE total_price > 10_000_000;
```
