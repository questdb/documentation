---
title: DECLARE keyword
sidebar_label: DECLARE
description: DECLARE SQL keyword reference documentation.
---

`DECLARE` is used to specify a series of variables bindings to be used
throughout your query. 

This syntax is supported specifically for `SELECT` queries.

:::note 

`DECLARE` was added to QuestDB in version 8.2.2 (TBD provisional).

Versions prior to this do not support this syntax.

:::

## Syntax

![Flow chart showing the syntax of the DECLARE keyword](/images/docs/diagrams/declare.svg)

## Mechanics

The `DECLARE` keyword comes before the `SELECT` clause in your query:

```questdb-sql title="Basic DECLARE" demo
DECLARE
    @x := 5
SELECT @x;
```

Use the variable binding operator `:=` (walrus) to associate expressions to names.

In the above example, a single binding is declared, which states that the variable `@x` should
be replaced with the constant integer `5`.

The variables are resolved at parse-time, meaning that variable is no longer present
when the query is compiled. So the above example reduces to this simple query:

```questdb-sql title="basic DECLARE post-reduction" demo
SELECT 5;
```

| 5 |
|---|
| 5 |


:::note

It is easy to accidentally omit the `:` when writing variable binding expressions.

Don't confuse the `:=` operator with a simple equality `=`!

You should see an error message like this:
> expected variable assignment operator `:=`
>
:::

### Multiple bindings

You can declare multiple variables by setting the bind expressions with commas `,`:

```questdb-sql title="Multiple variable bindings" demo
DECLARE 
    @x := 5,
    @y := 2
SELECT @x + @y;
```

| column |
|--------|
| 7      |

### Variables as functions

A variable need not be just a constant, it could be a function call, 
and variables with function values can be nested:

```questdb-sql title="declaring function variable" demo
DECLARE
  @today := today(),
  @start := interval_start(@today),
  @end := interval_end(@today)
SELECT @today = interval(@start, @end);
```

| column |
|--------|
| true   |


### Declarations in subqueries

Declarations made in parent queries are available in subqueries. 

```questdb-sql title="variable shadowing" demo
DECLARE
    @x := 5
SELECT y FROM (
    SELECT @x AS y
);
```

| y |
|---| 
| 5 |

#### Shadowing

If a subquery declares a variable of the same name, then the variable is shadowed
and takes on the new value. However, any queries above this subquery are unaffected - the
variable bind is not globally mutated.

```questdb-sql title="variable shadowing" demo
DECLARE
    @x := 5
SELECT @x + y FROM (
    DECLARE @x := 10
    SELECT @x AS y
);
```

| column |
|--------|
| 15     |

### Declarations as subqueries

Declarations themselves can be subqueries. We suggest that this
is not overused, as removing the subquery definition from its execution
location may make queries harder to debug.

Nevertheless, it is possible to define a variable as a subquery:

```questdb-sql title="table cursor as a variable" demo
DECLARE
    @subquery := (SELECT timestamp FROM trades)
SELECT * FROM @subquery;
```

You can even use already-declared variables to define your subquery variable:

```questdb-sql title="nesting decls inside decl subqueries" demo
DECLARE
    @timestamp := timestamp,
    @symbol := symbol,
    @subquery := (SELECT @timestamp, @symbol FROM trades)
SELECT * FROM @subquery;
```

### Declarations in CTEs

Naturally, `DECLARE` also works with CTEs:

```questdb-sql title="declarations inside CTEs" demo
DECLARE 
  @x := 5
WITH first AS (
  DECLARE @x := 10
  SELECT @x as a -- a = 10
),
second AS (
  DECLARE @y := 4
  SELECT 
    @x + @y as b, -- b = 5 + 4 = 9
    a -- a = 10
    FROM first
)
SELECT a, b
FROM second;
```

| a  | b |
|----|---|
| 10 | 9 |


### Bind variables

`DECLARE` syntax will work with prepared statements over PG Wire, so long as the client library
does not perform syntax validation that rejects the `DECLARE` syntax.


```questdb-sql
DECLARE @x := ?, @y := ? 
SELECT @x::int + @y::int;

-- Then bind the following values: (1, 2)
```

| column |
|--------|
| 3      |


## Limitations

Most basic expressions are supported, and we provide examples later in this document. We suggest
you use variables to simplify repeated constants within your code, and minimise
how many places you need to update the constant.

However, not all expressions are supported. The following are explicitly disallowed:

#### Bracket lists

```questdb-sql title="bracket lists are not allowed"
DECLARE
    @symbols := ('BTC-USD', 'ETH-USD')
SELECT timestamp, price, symbol
FROM trades
WHERE symbol IN @symbols;

-- error: unexpected bind expression - bracket lists not supported
```


## Examples

### SAMPLE BY

```questdb-sql title="DECLARE with SAMPLE BY" demo
DECLARE 
    @period := 1m,
    @window := '2024-11-25',
    @symbol := 'ETH-USD'
SELECT 
   timestamp, symbol, side, sum(amount) as volume 
FROM trades
WHERE side = 'sell' 
AND timestamp IN @window 
AND symbol = @symbol
SAMPLE BY @period 
FILL(NULL);
```

| timestamp                   | symbol  | side | volume           |
|-----------------------------|---------|------|------------------|
| 2024-11-25T00:00:00.000000Z | ETH-USD | sell | 153.470574999999 | 
| 2024-11-25T00:01:00.000000Z | ETH-USD | sell | 298.927738       |
| 2024-11-25T00:02:00.000000Z | ETH-USD | sell | 66.253058        |
| ...                         | ...     | ...  | ...              |

### INSERT INTO SELECT

```questdb-sql
INSERT INTO trades SELECT * FROM 
(
    DECLARE 
        @x := now(), 
        @y := 'ETH-USD' 
    SELECT @x as timestamp, @y as symbol
);
```

### CREATE TABLE AS SELECT

```questdb-sql
CREATE TABLE trades AS (
    DECLARE 
        @x := now(), 
        @y := 'ETH-USD' 
    SELECT @x as timestamp, @y as symbol, 123 as price
);
```

