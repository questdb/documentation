---
title: DECLARE keyword
sidebar_label: DECLARE
description:
  "DECLARE binds @variables in QuestDB SQL: scalar values, value lists for IN
  filters, bind variables, and OVERRIDABLE and AUDITED view parameters."
---

`DECLARE` specifies a series of variable bindings used throughout your query.
A variable can hold a scalar value, a [value list](#value-lists) for an `IN`
filter such as `symbol IN @symbols`, or a bind variable. In a view definition,
a variable can be a parameter that the caller overrides or that an audited view
records.

This syntax is supported within `SELECT` queries.

## Syntax

```questdb-sql title="Standalone query"
DECLARE @variable := expression [, @variable := expression ...]
[WITH ...]
SELECT ...
```

```questdb-sql title="Inside a view definition (with optional OVERRIDABLE and AUDITED)"
DECLARE [OVERRIDABLE] [AUDITED] @variable := expression
    [, [OVERRIDABLE] [AUDITED] @variable := expression ...]
[WITH ...]
SELECT ...
```

```questdb-sql title="Value list, for the right-hand side of IN"
DECLARE @variable := ( expression , [ expression [, expression ...] [,] ] )
```

```questdb-sql title="Use a value list"
WHERE expression [ NOT ] IN { @variable | $n | ( item [, item ...] ) }
```

A value list has at least one comma. Its members are expressions, including
bind variables, but not lists or list variables. In `IN`, an `item` is a value
or a list variable. A `$n` that holds a text array, directly or through a
variable, must be the whole list: see
[Lists of bind variables](#lists-of-bind-variables).

The `OVERRIDABLE` keyword only takes effect inside a
[view definition](/docs/query/sql/create-view/#declare-with-overridable). It
marks a variable as a parameter that the caller of the view can override at
query time. Variables without `OVERRIDABLE` use the value set in the view and
cannot be changed by the caller.

The `AUDITED` keyword only takes effect inside the definition of an
[audited view](/docs/security/audited-views/), a QuestDB Enterprise feature. It
marks a variable whose resolved value each read of the view records in the
audit trail. It is independent of `OVERRIDABLE`, and the two may appear in
either order. It is allowed only in the `DECLARE` block that opens a view body
or a statement: in a subquery, a CTE, or a set-operation branch after the
first, it fails with `AUDITED is only allowed in the top-level DECLARE block`.
In a statement's own block, or in a view that is not audited, it is accepted
and has no effect.

A [value list](#value-lists) declares the set of values an `IN` filter tests
against.

## Mechanics

The `DECLARE` keyword comes before the `SELECT` clause in your query:

```questdb-sql title="Basic DECLARE" demo
DECLARE
    @x := 5
SELECT @x;
```

Use the variable binding operator `:=` (walrus) to associate expressions to names.

:::tip

It is easy to accidentally omit the `:` when writing variable binding expressions.

Don't confuse the `:=` operator with a simple equality `=`!

You should see an error message like this:
> expected variable assignment operator `:=`

:::

The above example declares a single binding, which states that the variable `@x` is replaced with the constant integer `5`.

The variables are substituted at parse time: each reference is replaced by the
variable's expression, so the variable is no longer present when the query is
compiled.

So the above example reduces to this simple query:

```questdb-sql title="basic DECLARE post-reduction" demo
SELECT 5;
```

| 5 |
|---|
| 5 |


### Multiple bindings

To declare multiple variables, set the bind expressions with commas `,`:

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

A variable need not be just a constant. It could also be a function call,
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
and takes on the new value.

However, any queries above this subquery are unaffected - the
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

Declarations themselves can be subqueries.

We suggest that this is not overused, as removing the subquery definition from its execution
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
does not perform syntax validation that rejects the `DECLARE` syntax:

```questdb-sql
DECLARE @x := $1, @y := $2
SELECT @x::int + @y::int;

-- Then bind the following values: (1, 2)
```

| column |
|--------|
| 3      |

Write bind variables as `$1`, `$2`, and so on. JDBC rewrites `?` placeholders
to that form before it sends the query, but the server does not accept a raw
`?`.

`DECLARE` can also minimise repeated bind variables.

For example, rather than passing the same value to multiple positional arguments,
you could instead use a declared variable and send a single bind variable:


```questdb-sql
-- instead of this:
SELECT $1 as name, id FROM users WHERE name = $2;

-- do this:
DECLARE @name := $1
SELECT @name as name, id FROM users WHERE name = @name;
```

A bind variable carries a value, not a column name. To repeat a column, declare
the column itself, and bind only the values:

```questdb-sql
DECLARE
    @col := price,
    @symbol := $1
SELECT avg(@col), min(@col), max(@col)
FROM trades
WHERE symbol = @symbol;
```

## Value lists

A parenthesised, comma-separated list declares the values of an `IN` filter
once, so that a query or a view can name the set instead of spelling it out:

```questdb-sql title="Declare the values of an IN filter"
DECLARE @symbols := ('BTC-USDT', 'ETH-USDT')
SELECT timestamp, symbol, price, amount
FROM trades
WHERE symbol IN @symbols AND timestamp IN '$now-1h..$now';
```

```questdb-sql title="Exclude the values of a list"
DECLARE @symbols := ('BTC-USDT', 'ETH-USDT')
SELECT timestamp, symbol, price, amount
FROM trades
WHERE symbol NOT IN @symbols AND timestamp IN '$now-1h..$now';
```

The list is expanded into the `IN` when the query is parsed, so the first query
above is exactly `symbol IN ('BTC-USDT', 'ETH-USDT')`. Each member keeps its
own type, and every form of `IN` works as it does with a written-out list,
including `NOT IN` and interval scans on the designated timestamp.

- `IN @symbols` and `IN (@symbols)` are equivalent.
- A list mixes with literals: `symbol IN ('SOL-USDT', @symbols)`. A variable
  that holds an [array bind](#lists-of-bind-variables) does not.
- One list variable can be assigned to another: `@majors := @symbols`.
- A list of one needs a trailing comma, `('BTC-USDT',)`. Without it,
  `('BTC-USDT')` is a parenthesised value. A trailing comma is also accepted
  after the last member of a longer list.
- A bracketed subquery, `(SELECT ...)` or `(DECLARE ... SELECT ...)`, is a
  subquery and not a list.

### Lists of timestamps

A list of timestamps follows the rules of a written-out `IN`, which depend on
the list's length:

- With two or more members, each member is one instant.
  `('2026-01-05', '2026-01-12')` matches only rows at midnight on those days,
  not the whole days.
- A list of one is an interval, like a single string. `('2026-01-05',)`
  matches the whole day.

So a view parameter that a caller overrides with one date instead of two
changes from instants to a whole day. To match whole days, declare a
[TICK](/docs/query/operators/tick/) date list, which is a single string:

```questdb-sql title="Rows on three days"
DECLARE @days := '[2026-01-05,2026-01-12,2026-01-19]'
SELECT timestamp, symbol, price, amount
FROM trades
WHERE timestamp IN @days;
```

### Lists of bind variables

To filter a `SYMBOL`, `VARCHAR` or `STRING` value on any number of values with
one prepared statement, bind one text array over the PostgreSQL wire protocol.
Bind it directly, as `symbol IN $1`, or through a variable:

```questdb-sql title="Bind one text array for any number of values"
DECLARE @symbols := $1
SELECT timestamp, symbol, price FROM trades WHERE symbol IN @symbols;
-- bind $1 as a text array, such as {BTC-USDT,ETH-USDT,SOL-USDT}
```

With JDBC, bind `connection.createArrayOf("varchar", symbols)`. With psql,
`\bind '{BTC-USDT,ETH-USDT,SOL-USDT}'`. The same works for a parameter of a
[view](/docs/concepts/views/#list-parameters), but not of an audited view.

A bind variable that holds an array, directly or through a variable, must be
the whole `IN` list: `IN $1`, `IN ($1)` or `NOT IN $1`. It cannot be mixed with
other values, as in `IN ('ETH-USDT', $1)`. A typed array bind, as from JDBC,
fails there with `STRING constant expected`. An untyped one, as from psql
`\bind`, is not refused: it is taken as one string, such as
`'{SOL-USDT,BTC-USDT}'`, which matches no row, so the query returns only the
rows of the other values.

Members of a list can also be bind variables. Reads of an
[audited view](/docs/security/audited-views/) need this form, because an
`AUDITED` parameter cannot hold an array:

```questdb-sql title="A list of bind variables"
DECLARE @symbols := ($1, $2)
SELECT timestamp, symbol, price FROM trades WHERE symbol IN @symbols;
```

The statement text fixes the number of members: `($1, $2)` always takes two
values, so prepare one statement for each count. A single bind variable needs
the trailing comma, `($1,)`. With a client that sends parameters untyped, such
as psql `\bind`, it also needs a cast, `($1::varchar,)`: untyped, `($1,)` is
taken as one array bind variable for the whole list. An audited view refuses
both an array and an untyped `($1,)` with
`audited view parameter has a type that cannot be audited`.

### Lists in views

In a [view](/docs/concepts/views/#parameterized-views), an `OVERRIDABLE` list
can be overridden with a list of a different length:

```questdb-sql title="A list parameter in a view"
CREATE VIEW trades_for AS (
  DECLARE OVERRIDABLE @symbols := ('BTC-USDT', 'ETH-USDT')
  SELECT timestamp, symbol, price FROM trades WHERE symbol IN @symbols
);

DECLARE @symbols := ('SOL-USDT',) SELECT * FROM trades_for;
```

### Errors

A list has no value of its own, so it can only be used on the right-hand side
of `IN`. These fail:

- `SELECT @symbols`, `WHERE symbol = @symbols`, `OVER (PARTITION BY @symbols)`
  or `@all := (@symbols, 'SOL-USDT')`:<br/>
  `declared list can only be used on the right-hand side of IN`
- `@x := ('BTC-USDT', ('ETH-USDT', 'SOL-USDT'))`:<br/>
  `nested lists are not supported, list members have to be values`
- `@x := ()`:<br/>
  `value expected in list`

To combine a list with more values, write both in the `IN`:
`symbol IN (@symbols, 'SOL-USDT')`. This does not work for an array bind: add
the values to the array instead.

## Limitations

Most basic expressions are supported, and we provide examples later in this document.

We suggest you use variables to simplify repeated constants within your code, and minimise
how many places you need to update the constant.

### Disallowed expressions

However, not all expressions are supported. The following are explicitly disallowed:

#### SQL statement fragments

```questdb-sql title="sql fragments are not allowed"
DECLARE
    @x := FROM trades
SELECT 5 @x;

-- table and column names that are SQL keywords have to be enclosed in double quotes, such as "FROM"```
```

### Language client support

Some language SQL clients do not allow identifiers to be passed as if it was a normal value. One example is `psycopg`.
In this case, you should use an alternate API to splice in identifiers, for example:


```python title="psycopg"
cur.execute(
    sql.SQL("""
        DECLARE @col := {}
        SELECT max(@col), min(@col), avg(price)
        FROM btc_trades;
    """).format(sql.Identifier('price')))
```

## Examples

### SAMPLE BY

```questdb-sql title="DECLARE with SAMPLE BY" demo
DECLARE
    @period := 1m,
    @window := '2024-11-25',
    @symbol := 'ETH-USDT'
SELECT
   timestamp, symbol, side, sum(amount) as volume
FROM trades
WHERE side = 'sell'
AND timestamp IN @window
AND symbol = @symbol
SAMPLE BY @period
FILL(NULL);
```

| timestamp                   | symbol   | side | volume           |
|-----------------------------|----------|------|------------------|
| 2024-11-25T00:00:00.000000Z | ETH-USDT | sell | 153.470574999999 |
| 2024-11-25T00:01:00.000000Z | ETH-USDT | sell | 298.927738       |
| 2024-11-25T00:02:00.000000Z | ETH-USDT | sell | 66.253058        |
| ...                         | ...      | ...  | ...              |

### INSERT INTO SELECT

```questdb-sql
INSERT INTO trades (timestamp, symbol)
SELECT * FROM
(
    DECLARE
        @x := now(),
        @y := 'ETH-USDT'
    SELECT @x as timestamp, @y as symbol
);
```

### CREATE TABLE AS SELECT

```questdb-sql
CREATE TABLE trades AS (
    DECLARE
        @x := now(),
        @y := 'ETH-USDT'
    SELECT @x as timestamp, @y as symbol, 123 as price
);
```

