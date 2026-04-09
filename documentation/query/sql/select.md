---
title: SELECT keyword
sidebar_label: SELECT OVERVIEW
description: SELECT SQL keyword reference documentation.
---

`SELECT` allows you to specify a list of columns and expressions to be selected
and evaluated from a table.

:::tip

Looking for SELECT best practices? Checkout our
[**Maximize your SQL efficiency: SELECT best practices**](/blog/2024/03/11/sql-select-statement-best-practices/)
blog.

:::

## Syntax

```questdb-sql
[SELECT [DISTINCT] (column | expression | function) [[AS] alias]
        [, (column | expression | function) [[AS] alias] ...]
FROM]
    { table | (query) } [[AS] alias]
    [joinClause ...]
    [WHERE booleanExpression]
    [LATEST ON timestampColumn PARTITION BY column [, column ...]]
    [{ GROUP BY column [, column ...] | SAMPLE BY interval [FILL ...] }]
    [ORDER BY column [ASC | DESC] [, ...]]
    [LIMIT { n | lower, upper }];
```

Note: `table` can either a specified table in your database or passed forward as
the result of a sub-query.

## Simple select

### All columns

QuestDB supports `SELECT * FROM tablename`. When selecting all, you can also
omit most of the statement and pass the table name.

The two examples below are equivalent

```questdb-sql title="QuestDB dialect" demo
trades;
```

```questdb-sql title="Traditional SQL equivalent" demo
SELECT * FROM trades;
```

### Specific columns

To select specific columns, replace \* by the names of the columns you are
interested in.

Example:

```questdb-sql title="Select specific columns" demo
SELECT timestamp, symbol, side FROM trades;
```

### Aliases

Using aliases allow you to give expressions or column names of your choice. You
can assign an alias to a column or an expression by writing the alias name you
want after that expression.

:::note

Alias names and column names must be unique.

:::

```questdb-sql title="Column aliases" demo
SELECT timestamp, symbol,
    price AS rate,
    amount quantity
FROM trades;
```

Notice how you can use or omit the `AS` keyword.

### Arithmetic expressions

`SELECT` is capable of evaluating multiple expressions and functions. You can
mix comma separated lists of expressions with the column names you are
selecting.

```questdb-sql title="Arithmetic expressions" demo
SELECT timestamp, symbol,
    price * 0.25 AS price25pct,
    amount > 10 AS over10
FROM trades;
```

The result of `amount > 10` is a boolean. The column will be named "over10" and
take values true or false.

## Boolean expressions

Supports `AND`/`OR`, `NOT` & `XOR`.

### AND and OR

AND returns true if both operands are true, and false otherwise.

OR returns true if at least one of the operands is true.

```questdb-sql
SELECT
    (true AND false) AS this_will_return_false,
    (true OR false) AS this_will_return_true;
```

### NOT

NOT inverts the truth value of the operand.

```questdb-sql
SELECT
    NOT (true AND false) AS this_will_return_true;
```

### XOR

^ is the bitwise XOR operator. It applies only to the Long data type.
Depending on what you need, you might prefer to cast the input and
output to boolean values.

```questdb-sql
SELECT
    (1 ^ 1) AS will_return_0,
    (1 ^ 20) AS will_return_21,
    (true::int ^ false::long)::boolean AS will_return_true,
    (true::int ^ true::long)::boolean AS will_return_false;
```

## Aggregation

Supported aggregation functions are listed on the
[aggregation reference](/docs/query/functions/aggregation/).

### Aggregation by group

QuestDB evaluates aggregation functions without need for traditional `GROUP BY`
whenever there is a mix of column names and aggregation functions
in a `SELECT` clause. You can have any number of discrete value columns and
any number of aggregation functions. The three statements below are equivalent.

```questdb-sql title="QuestDB dialect" demo
SELECT symbol, avg(price), count()
FROM trades;
```

```questdb-sql title="Traditional SQL equivalent" demo
SELECT symbol, avg(price), count()
FROM trades
GROUP BY symbol;
```

```questdb-sql title="Traditional SQL equivalent with positional argument" demo
SELECT symbol, avg(price), count()
FROM trades
GROUP BY 1;
```

### Aggregation arithmetic

Aggregation functions can be used in arithmetic expressions. The following
computes `mid` of prices for every symbol.

```questdb-sql title="Aggregation arithmetic" demo
SELECT symbol, (min(price) + max(price))/2 mid, count() count
FROM trades;
```

:::tip

Whenever possible, it is recommended to perform arithmetic `outside` of
aggregation functions as this can have a dramatic impact on performance. For
example, `min(price/2)` is going to execute considerably more slowly than
`min(price)/2`, although both return the same result.

:::

## Supported clauses

QuestDB supports the following standard SQL clauses within SELECT statements.

### CASE

Conditional results based on expressions.

#### Syntax

```questdb-sql
CASE
    WHEN condition THEN value
    [WHEN condition THEN value ...]
    [ELSE value]
END
```

For more information, please refer to the
[CASE reference](/docs/query/functions/conditional/)

### CAST

Convert values and expression between types.

#### Syntax

```questdb-sql
CAST(expression AS type)
```

For more information, please refer to the
[CAST reference](/docs/query/sql/cast/)

### DISTINCT

Returns distinct values of the specified column(s).

#### Syntax

```questdb-sql
SELECT DISTINCT columnName [, columnName ...]
FROM tableName;
```

For more information, please refer to the
[DISTINCT reference](/docs/query/sql/distinct/).

### FILL

Defines filling strategy for missing data in aggregation queries. This function
complements [SAMPLE BY](/docs/query/sql/sample-by/) queries.

#### Syntax

```questdb-sql
SELECT ... SAMPLE BY ... FILL({ NONE | NULL | PREV | LINEAR | constant }
    [, { NONE | NULL | PREV | LINEAR | constant } ...]);
```

For more information, please refer to the
[FILL reference](/docs/query/sql/fill/).

### JOIN

Join tables based on a key or timestamp.

#### Syntax

```questdb-sql
selectClause joinClause [WHERE whereClause];
```

For more information, please refer to the
[JOIN reference](/docs/query/sql/join/)

### PIVOT

Transforms rows into columns by aggregating data across specified values.
Useful for analytics, charting, and reshaping time-series data.

For more information, please refer to the
[PIVOT reference](/docs/query/sql/pivot/)

### LIMIT

Specify the number and position of records returned by a query.

#### Syntax

```questdb-sql
SELECT ... LIMIT { numberOfRecords | lowerBound, upperBound };
```

For more information, please refer to the
[LIMIT reference](/docs/query/sql/limit/).

### ORDER BY

Orders the results of a query by one or several columns.

#### Syntax

```questdb-sql
SELECT ...
ORDER BY columnName [ASC | DESC] [, columnName [ASC | DESC] ...];
```

For more information, please refer to the
[ORDER BY reference](/docs/query/sql/order-by)

### UNION, EXCEPT & INTERSECT

Combine the results of two or more select statements. Can include or ignore
duplicates.

#### Syntax

```questdb-sql
query1 { UNION | EXCEPT | INTERSECT } [ALL] query2;
```

For more information, please refer to the
[UNION, EXCEPT & INTERSECT reference](/docs/query/sql/union-except-intersect/)

### WHERE

Filters query results

#### Syntax

```questdb-sql
SELECT ... FROM tableName
WHERE booleanExpression;
```

QuestDB supports complex WHERE clauses along with type-specific searches. For
more information, please refer to the
[WHERE reference](/docs/query/sql/where/). There are different syntaxes for
[text](/docs/query/sql/where/#symbol-varchar-and-string),
[numeric](/docs/query/sql/where/#numeric), or
[timestamp](/docs/query/sql/where/#timestamp-and-date) filters.

## Additional time-series clauses

QuestDB augments SQL with the following clauses.

### LATEST ON

Retrieves the latest entry by timestamp for a given key or combination of keys
This function requires a
[designated timestamp](/docs/concepts/designated-timestamp/).

#### Syntax

```questdb-sql
SELECT columnName [, columnName ...]
FROM tableName
LATEST ON timestampColumn PARTITION BY columnName [, columnName ...];
```

For more information, please refer to the
[LATEST ON reference](/docs/query/sql/latest-on/).

### SAMPLE BY

Aggregates [time-series data](/blog/what-is-time-series-data/) into homogeneous time chunks. For example daily
average, monthly maximum etc. This function requires a
[designated timestamp](/docs/concepts/designated-timestamp/).

#### Syntax

```questdb-sql
SELECT ... FROM tableName
SAMPLE BY n { n | U | T | s | m | h | d | M | y };
```

For more information, please refer to the
[SAMPLE BY reference](/docs/query/sql/sample-by/).

### TIMESTAMP

Dynamically creates a
[designated timestamp](/docs/concepts/designated-timestamp/) on the output of a
query. This allows to perform timestamp operations like [SAMPLE BY](#sample-by)
or [LATEST ON](#latest-on) on tables which originally do not have a designated
timestamp.

:::caution

The output query must be ordered by time. `TIMESTAMP()` does not check for order
and using timestamp functions on unordered data may produce unexpected results.

:::

#### Syntax

```questdb-sql
SELECT ... FROM tableName timestamp(columnName);
```

For more information, refer to the
[TIMESTAMP reference](/docs/query/functions/timestamp/)
