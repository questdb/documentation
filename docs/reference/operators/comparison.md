---
title: Comparison operators
sidebar_label: Comparison
description: Comparison operators reference documentation.
---

This page describes the available operators to assist with comparison
operations.

If `string` or `char` values are used in the input, they are converted to `int`
using the [ASCII Table](https://www.asciitable.com/) for comparison.

## = (equal to)

`(value1) = (value2)` - returns true if the two values are the same.

`=` can be used with [`>` or `<`](#description).

### Arguments

- `value1` is any data type.
- `value2` is any data type.

### Return value

Return value type is boolean.

### Examples

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

## > (greater than) and < (less than)

- `(value1) > (value2)` - returns true if `value1` is greater than `value2`.
- `(value1) < (value2)` - returns true if `value1` is less than `value2`.

### Arguments

- `value1` and `value2` are one of the following data types:
    - any numeric data type
    - `char`
    - `date`
    - `timestamp` 
    - `symbol`
    - `string`

### Description

`>` and `<` can be used in combination with `=` for the following comparison:

- `>=` - greater than or equal to
- `<=` - less than or equal to

### Return value

Return value type is boolean.

### Examples

```questdb-sql

SELECT 'abc' > 'def';
-- Returns false

SELECT '123' < '456';
-- Returns true

SELECT '5' > '5';
-- Returns false

SELECT '5' >= '5';
-- Returns true

SELECT 5 < 5;
-- Returns false

SELECT 5 <= 5;
-- Returns true

SELECT 'a' > 'b';
-- Returns false

SELECT 5 < 3;
-- Returns false
```

## <\> or != (not equal to)

`(value1) <> (value2)` - returns true if `value1` is not equal to `value2`.

`!=` is an alias of `<>`.

### Arguments

- `value1` is any data type.
- `value2` is any data type.

### Return value

Return value type is boolean.

### Examples

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
