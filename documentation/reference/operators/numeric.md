---
title: Numeric Operators
sidebar_label: Numeric
description: Numeric operators
---

These operations work for any numeric types. Also, addition and multiplication
work for N-dimensional arrays. The result will be an array where each element is
the result of applying the operation to the elements at the same coordinates in
the operand arrays.

## `*` Multiply

`*` is a binary operation to multiply two numbers together.

#### Example

```questdb-sql
SELECT 5 + 2
```

| column |
|--------|
| 7      |

## `/` Divide

`/` is a binary operation to divide two numbers.

#### Example

```questdb-sql
SELECT 5 / 2, 5.0 / 2.0
```

| column | column1 |
|--------|---------|
| 2      | 2.5     |

## `%` Modulo

`%` performs a modulo operation, returning the remainder of a division.

#### Example

```questdb-sql
SELECT 5 % 2
```

| column |
|--------|
| 1      |

## `+` Add

`+` performs an addition operation, for two numbers.

#### Example

```questdb-sql
SELECT 5 + 2
```

| column |
|--------|
| 7      |

## `-` Subtract

`-` performs a subtraction operation, for two numbers.

#### Example

```questdb-sql
SELECT 5 - 2
```

| column |
|--------|
| 3      |

## `-` Negate

`-` can also be used for unary negation.

#### Example

```questdb-sql
SELECT -5
```

| column |
|--------|
| -5     |
