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

![Flow chart showing the syntax of the SELECT keyword](/images/docs/diagrams/select.svg)

Note: `table` can either a specified table in your database or passed forward as
the result of a sub-query.

## Simple select

### All columns

QuestDB supports `SELECT * FROM tablename`. When selecting all, you can also
omit most of the statement and pass the table name.

The two examples below are equivalent

```questdb-sql title="QuestDB dialect"
trades;
```

```questdb-sql title="Traditional SQL equivalent"
SELECT * FROM trades;
```

### Specific columns

To select specific columns, replace \* by the names of the columns you are
interested in.

Example:

```questdb-sql
SELECT timestamp, symbol, side FROM trades;
```

### Aliases

Using aliases allow you to give expressions or column names of your choice. You
can assign an alias to a column or an expression by writing the alias name you
want after that expression.

:::note

Alias names and column names must be unique.

:::

```questdb-sql
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

```questdb-sql
SELECT timestamp, symbol,
    price * 0.25 AS price25pct,
    amount > 10 AS over10
FROM trades
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
[aggregation reference](/docs/reference/function/aggregation/).

### Aggregation by group

QuestDB evaluates aggregation functions without need for traditional `GROUP BY`
whenever there is a mix of column names and aggregation functions
in a `SELECT` clause. You can have any number of discrete value columns and
any number of aggregation functions. The three statements below are equivalent.

```questdb-sql title="QuestDB dialect"
SELECT symbol, avg(price), count()
FROM trades;
```

```questdb-sql title="Traditional SQL equivalent"
SELECT symbol, avg(price), count()
FROM trades
GROUP BY Symbol;
```

```questdb-sql title="Traditional SQL equivalent with positional argument"
SELECT symbol, avg(price), count()
FROM trades
GROUP BY 1;
```

### Aggregation arithmetic

Aggregation functions can be used in arithmetic expressions. The following
computes `mid` of prices for every symbol.

```questdb-sql
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

![Flow chart showing the syntax of CASE](/images/docs/diagrams/case.svg)

For more information, please refer to the
[CASE reference](/docs/reference/function/conditional/)

### CAST

Convert values and expression between types.

#### Syntax

![Flow chart showing the syntax of the CAST keyword](/images/docs/diagrams/cast.svg)

For more information, please refer to the
[CAST reference](/docs/reference/sql/cast/)

### DISTINCT

Returns distinct values of the specified column(s).

#### Syntax

![Flow chart showing the syntax of the DISTINCT keyword](/images/docs/diagrams/distinct.svg)

For more information, please refer to the
[DISTINCT reference](/docs/reference/sql/distinct/).

### FILL

Defines filling strategy for missing data in aggregation queries. This function
complements [SAMPLE BY](/docs/reference/sql/sample-by/) queries.

#### Syntax

![Flow chart showing the syntax of the FILL keyword](/images/docs/diagrams/fill.svg)

For more information, please refer to the
[FILL reference](/docs/reference/sql/fill/).

### JOIN

Join tables based on a key or timestamp.

#### Syntax

![Flow chart showing the syntax of the high-level syntax of the JOIN keyword](/images/docs/diagrams/joinOverview.svg)

For more information, please refer to the
[JOIN reference](/docs/reference/sql/join/)

### LIMIT

Specify the number and position of records returned by a query.

#### Syntax

![Flow chart showing the syntax of the LIMIT keyword](/images/docs/diagrams/limit.svg)

For more information, please refer to the
[LIMIT reference](/docs/reference/sql/limit/).

### ORDER BY

Orders the results of a query by one or several columns.

#### Syntax

![Flow chart showing the syntax of the ORDER BY keyword](/images/docs/diagrams/orderBy.svg)

For more information, please refer to the
[ORDER BY reference](/docs/reference/sql/order-by)

### UNION, EXCEPT & INTERSECT

Combine the results of two or more select statements. Can include or ignore
duplicates.

#### Syntax

![Flow chart showing the syntax of the UNION, EXCEPT & INTERSECT keyword](/images/docs/diagrams/unionExceptIntersect.svg)

For more information, please refer to the
[UNION, EXCEPT & INTERSECT reference](/docs/reference/sql/union-except-intersect/)

### WHERE

Filters query results

#### Syntax

![Flow chart showing the syntax of the WHERE clause](/images/docs/diagrams/where.svg)

QuestDB supports complex WHERE clauses along with type-specific searches. For
more information, please refer to the
[WHERE reference](/docs/reference/sql/where/). There are different syntaxes for
[text](/docs/reference/sql/where/#symbol-and-string),
[numeric](/docs/reference/sql/where/#numeric), or
[timestamp](/docs/reference/sql/where/#timestamp-and-date) filters.

## Additional time-series clauses

QuestDB augments SQL with the following clauses.

### LATEST ON

Retrieves the latest entry by timestamp for a given key or combination of keys
This function requires a
[designated timestamp](/docs/concept/designated-timestamp/).

#### Syntax

![Flow chart showing the syntax of the LATEST ON keyword](/images/docs/diagrams/latestOn.svg)

For more information, please refer to the
[LATEST ON reference](/docs/reference/sql/latest-on/).

### SAMPLE BY

Aggregates [time-series data](/blog/what-is-time-series-data/) into homogeneous time chunks. For example daily
average, monthly maximum etc. This function requires a
[designated timestamp](/docs/concept/designated-timestamp/).

#### Syntax

![Flow chart showing the syntax of the SAMPLE BY keyword](/images/docs/diagrams/sampleBy.svg)

For more information, please refer to the
[SAMPLE BY reference](/docs/reference/sql/sample-by/).

### TIMESTAMP

Dynamically creates a
[designated timestamp](/docs/concept/designated-timestamp/) on the output of a
query. This allows to perform timestamp operations like [SAMPLE BY](#sample-by)
or [LATEST ON](#latest-on) on tables which originally do not have a designated
timestamp.

:::caution

The output query must be ordered by time. `TIMESTAMP()` does not check for order
and using timestamp functions on unordered data may produce unexpected results.

:::

#### Syntax

![Flow chart showing the syntax of the timestamp function](/images/docs/diagrams/dynamicTimestamp.svg)

For more information, refer to the
[TIMESTAMP reference](/docs/reference/function/timestamp/)
