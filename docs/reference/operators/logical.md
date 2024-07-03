---
title: Logical Operators
sidebar_label: Logical
description: Logical operators
---

## `OR` Logical OR

`OR` represents a logical OR operation, which takes two predicates and filters for either one being true.

#### Examples

```questdb-sql
SELECT * FROM (SELECT 5 AS a, 10 AS b) WHERE A = 5 OR B = 2
```

| a | b  |
| - | -- |
| 5 | 10 |

```questdb-sql
SELECT * FROM (SELECT 5 AS a, 10 AS b) WHERE A = 3 OR B = 2
```

| a | b  |
| - | -- |

## `AND` Logical AND

`AND` represents a logical AND operation, which takes two predicates and filters for both being true.

#### Examples

```questdb-sql
SELECT * FROM (SELECT 5 AS a, 10 AS b) WHERE A = 5 AND B = 2
```

| a | b  |
| - | -- |

```questdb-sql
SELECT * FROM (SELECT 5 AS a, 10 AS b) WHERE A = 5 AND B = 10
```

| a | b  |
| - | -- |
| 5 | 10 |

## `NOT` Logical NOT

`NOT` inverts the boolean value. This can be combined with other operators to create their inverse operations, i.e `NOT IN`, `NOT WITHIN`.

#### Example

```questdb-sql
SELECT NOT TRUE
```

| column |
| ------ |
| false  |
