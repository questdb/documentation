---
title: Conditional functions
sidebar_label: Conditional
description: Conditional functions reference documentation.
---

Conditional functions allow for conditionally selecting input values.

## case

![Flow chart showing the syntax of CASE](/images/docs/diagrams/case.svg)

`CASE` goes through a set of conditions and returns a value corresponding to the
first condition met. Each new condition follows the `WHEN condition THEN value`
syntax. The user can define a return value when no condition is met using
`ELSE`. If `ELSE` is not defined and no conditions are met, then case returns
`null`.

**Examples:**

Assume the following data

| name  | age |
| ----- | --- |
| Tom   | 4   |
| Jerry | 19  |
| Anna  | 25  |
| Jack  | 8   |

```questdb-sql title="CASE with ELSE"
SELECT
name,
CASE
    WHEN age > 18 THEN 'major'
    ELSE 'minor'
END
FROM my_table
```

Result

| name  | case  |
| ----- | ----- |
| Tom   | minor |
| Jerry | major |
| Anna  | major |
| Jack  | minor |

```questdb-sql title="CASE without ELSE"
SELECT
name,
CASE
    WHEN age > 18 THEN 'major'
END
FROM my_table
```

Result

| name  | case  |
| ----- | ----- |
| Tom   | null  |
| Jerry | major |
| Anna  | major |
| Jack  | null  |


## coalesce

`coalesce(value [, ...])` - returns the first non-null argument in a provided
list of arguments in cases where null values should not appear in query results.

This function is an implementation of the `COALESCE` expression in PostgreSQL
and as such, should follow the expected behavior described in the
[coalesce PostgreSQL documentation](https://www.postgresql.org/docs/current/functions-conditional.html#FUNCTIONS-COALESCE-NVL-IFNULL)

**Arguments:**

- `coalesce(value [, ...])` `value` and subsequent comma-separated list of
  arguments which may be of any type except binary. If the provided arguments
  are of different types, one should be `CAST`able to another.

**Return value:**

The returned value is the first non-null argument passed.

**Examples:**

Given a table with the following records:

| timestamp                   | amount |
| :-------------------------- | :----- |
| 2021-02-11T09:39:16.332822Z | 1      |
| 2021-02-11T09:39:16.333481Z | null   |
| 2021-02-11T09:39:16.333511Z | 3      |

The following example demonstrates how to use `coalesce()` to return a default
value of `0` for an expression if the `amount` column contains `null` values.

```questdb-sql
SELECT timestamp,
       coalesce(amount, 0) as amount_not_null
FROM transactions
```

| timestamp                   | amount_not_null |
| :-------------------------- | :-------------- |
| 2021-02-11T09:39:16.332822Z | 1               |
| 2021-02-11T09:39:16.333481Z | 0               |
| 2021-02-11T09:39:16.333511Z | 3               |

## nullif

`nullif(value1, value2)` - returns a null value if `value1` is equal to `value2`
or otherwise returns `value1`.

This function is an implementation of the `NULLIF` expression in PostgreSQL and
as such, should follow the expected behavior described in the
[nullif PostgreSQL documentation](https://www.postgresql.org/docs/current/functions-conditional.html#FUNCTIONS-COALESCE-NVL-IFNULL).

**Arguments:**

- `value1` is any numeric, char, or string value.
- `value2` is any numeric, char, or string value.

**Return value:**

The returned value is either `NULL`, or the first argument passed.

**Examples:**

Given a table with the following records:

| timestamp                   | amount |
| :-------------------------- | :----- |
| 2021-02-11T09:39:16.332822Z | 0      |
| 2021-02-11T09:39:16.333481Z | 11     |
| 2021-02-11T09:39:16.333511Z | 3      |

The following example demonstrates how to use `nullif()` to return a `null` if
the `amount` column contains `0` values.

```questdb-sql
SELECT timestamp,
       nullif(amount, 0) as amount_null_if_zero
FROM transactions
```

| timestamp                   | amount_null_if_zero |
| :-------------------------- | :------------------ |
| 2021-02-11T09:39:16.332822Z | null                |
| 2021-02-11T09:39:16.333481Z | 11                  |
| 2021-02-11T09:39:16.333511Z | 3                   |
