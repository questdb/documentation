---
title: Comparison Operators
sidebar_label: Comparison
description: Comparison operators
---

This page describes the available operators to assist with comparison
operations.

If `string` or `char` values are used in the input, they are converted to `int`
using the [ASCII Table](https://www.asciitable.com/) for comparison.

## `IN` (list)

`X IN (a, b, c)` returns true if X is present in the list.

#### Example

```questdb-sql
SELECT 5 IN (1, 2, 7, 5, 8)
```

| column |
| ------ |
| true   |

## `=` Equals

`(value1) = (value2)` - returns true if the two values are the same.

#### Arguments

- `value1` is any data type.
- `value2` is any data type.

#### Return value

Return value type is boolean.

#### Examples

```questdb-sql

SELECT '5' = '5';
-- Returns true

SELECT 5 = 5;
-- Returns true

SELECT '5' = '3';
-- Returns false

SELECT 5 = 3;
-- Returns false
```

## `>` Greater than

- `(value1) > (value2)` - returns true if `value1` is greater than `value2`.

#### Arguments

- `value1` and `value2` are one of the following data types:
    - any numeric data type
    - `char`
    - `date`
    - `timestamp`
    - `symbol`
    - `string`

#### Return value

Return value type is boolean.

#### Examples

```questdb-sql

SELECT 'abc' > 'def';
-- Returns false

SELECT '5' > '5';
-- Returns false

SELECT 'a' > 'b';
-- Returns false
```

## `>=` Greater than or equal to

- `(value1) >= (value2)` - returns true if `value1` is greater than `value2`.

#### Arguments

- `value1` and `value2` are one of the following data types:
    - any numeric data type
    - `char`
    - `date`
    - `timestamp`
    - `symbol`
    - `string`

#### Return value

Return value type is boolean.

#### Examples

```questdb-sql

SELECT 'abc' >= 'def';
-- Returns false

SELECT '5' >= '5';
-- Returns true

SELECT '7' >= '5';
-- Returns true

SELECT 'a' >= 'b';
-- Returns false
```

## `<` Lesser than

- `(value1) < (value2)` - returns true if `value1` is less than `value2`.

#### Arguments

- `value1` and `value2` are one of the following data types:
    - any numeric data type
    - `char`
    - `date`
    - `timestamp`
    - `symbol`
    - `string`

#### Return value

Return value type is boolean.

#### Examples

```questdb-sql
SELECT '123' < '456';
-- Returns true

SELECT 5 < 5;
-- Returns false

SELECT 5 < 3;
-- Returns false
```

## `<=` Lesser than or equal to

- `(value1) <= (value2)` - returns true if `value1` is less than `value2`.

#### Arguments

- `value1` and `value2` are one of the following data types:
    - any numeric data type
    - `char`
    - `date`
    - `timestamp`
    - `symbol`
    - `string`

#### Return value

Return value type is boolean.

#### Examples

```questdb-sql
SELECT '123' <= '456';
-- Returns true

SELECT 5 <= 5;
-- Returns true

SELECT 5 <= 3;
-- Returns false
```

## `<>` or `!=` Not equals

`(value1) <> (value2)` - returns true if `value1` is not equal to `value2`.

`!=` is an alias of `<>`.

#### Arguments

- `value1` is any data type.
- `value2` is any data type.

#### Return value

Return value type is boolean.

#### Examples

```questdb-sql

SELECT '5' <> '5';
-- Returns false

SELECT 5 <> 5;
-- Returns false

SELECT 'a' <> 'b';
-- Returns true

SELECT 5 <> 3;
-- Returns true

```

## `IN` (value1, value2, ...)

The `IN` operator, when used with more than one argument, behaves as the
standard SQL `IN`. It provides a concise way to represent multiple OR-ed
equality conditions.

#### Arguments

- `value1`, `value2`, ... are string type values representing dates or
  timestamps.

#### Examples

Consider the following query:

```questdb-sql title="IN list"
SELECT * FROM scores
WHERE ts IN ('2018-01-01', '2018-01-01T12:00', '2018-01-02');
```

This query is equivalent to:

```questdb-sql title="IN list equivalent OR"
SELECT * FROM scores
WHERE ts = '2018-01-01' or ts = '2018-01-01T12:00' or ts = '2018-01-02';
```

| ts                          | value |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| 2018-01-01T12:00:00.000000Z | 589.1 |
| 2018-01-02T00:00:00.000000Z | 131.5 |
