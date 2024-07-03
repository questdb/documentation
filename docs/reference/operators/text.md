---
title: Text Operators
sidebar_label: Text
description: Text operators
---

## `||` Concat

`||` concatenates strings, similar to [concat()](/docs/reference/function/text/#concat).

#### Example

```questdb-sql
SELECT 'a' || 'b'
```

| concat |
| ------ |
| ab     |

## `~` Regex match

Performs a regular-expression match on a string.

#### Example

```questdb-sql
SELECT address FROM (SELECT 'abc@foo.com' as address) WHERE address ~ '@foo.com'
```

| address     |
| ----------- |
| abc@foo.com |

## `!~` Regex doesn't match

The inverse of the `~` regex matching operator.

```questdb-sql
SELECT address FROM (SELECT 'abc@foo.com' as address) WHERE address !~ '@bah.com'
```

| address     |
| ----------- |
| abc@foo.com |

## `LIKE`

`LIKE` performs a case-sensitive match, based on a pattern.

The `%` wildcard represents 0, 1 or n characters.

The `_` wildcard represents a single character.

#### Example

```questdb-sql
SELECT 'abc' LIKE '%c', 'abc' LIKE 'a_c'
```

| column | column1 |
| ------ | ------- |
| true   | true    |

## `ILIKE`

`ILIKE` is the same as `LIKE`, but performs a case insensitive match,

#### Example

```questdb-sql
SELECT 'abC' LIKE '%c', 'abC' ILIKE '%c'
```

| column | column1 |
| ------ | ------- |
| false  | true    |
