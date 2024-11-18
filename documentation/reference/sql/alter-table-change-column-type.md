---
title: ALTER TABLE COLUMN TYPE
sidebar_label: COLUMN TYPE
description: ALTER TABLE COLUMN TYPE SQL keyword reference documentation.
---

Changes the data type of an existing column in a table.

The data type of the column is altered without affecting the data already stored
in the table. However, it's important to note that altering the column type can
result in data loss or errors if the new type cannot accommodate the existing
data. Therefore, it's recommended to review the data and backup the table before
altering the column type.

:::caution

- Changing the column type may lead to data loss or errors if the new type
  cannot accommodate the existing data.

- The new data type must be compatible with the existing data in the column.

:::

## Syntax

![Flow chart showing the syntax of ALTER TABLE with ALTER COLUMN TYPE keyword](/images/docs/diagrams/alterColumnType.svg)

## Supported Data Types

The `ALTER TABLE COLUMN TYPE` command supports changing the column type to any
compatible data type.

## Examples

Change the data type of the column `age` in the table `employees` to `INT`:

```questdb-sql
ALTER TABLE employees ALTER COLUMN age TYPE INT;
```

When changing the column type, ensure that the new type is compatible with the
existing data. For instance, changing a column type from STRING to DOUBLE might
result in data loss or conversion errors if the existing data contains
non-numeric values.

```questdb-sql
ALTER TABLE tbl ALTER COLUMN col_name TYPE DOUBLE;
```

It is possible to specify all the additional column type parameters, like
`CAPACITY` & `CACHE`:

```questdb-sql
ALTER TABLE tbl ALTER COLUMN department TYPE SYMBOL CAPACITY 10000 CACHE;
```

## Available Conversions

QuestDB supports a wide range of conversions. However, certain type conversions
may lead to data precision loss (e.g., converting a `FLOAT` type to an `INT`) or
range overflow (e.g., converting a `LONG` type to an `INT`). The matrices below
depict fully compatible conversions marked with `X` and conversions that may
result in data loss marked with `L`.

Numeric types support a wide range of conversions, but many of them can result
in the data / precision loss.

| From \ To | boolean | byte | short | int | float | long | double | date | timestamp |
| --------- | ------- | ---- | ----- | --- | ----- | ---- | ------ | ---- | --------- |
| boolean   |         | X    | X     | X   | X     | X    | X      | X    | X         |
| byte      | L       |      | X     | X   | X     | X    | X      | X    | X         |
| short     | L       | L    |       | X   | X     | X    | X      | X    | X         |
| int       | L       | L    | L     |     | L     | X    | X      | X    | X         |
| float     | L       | L    | L     | L   |       | L    | X      | L    | L         |
| long      | L       | L    | L     | L   | L     |      | L      | X    | X         |
| double    | L       | L    | L     | L   | X     | L    |        | L    | L         |

Conversions between `TIMESTAMP` and `DATE` types and numeric types are fully
supported. Timestamp values are represented in microseconds since the EPOCH,
while Date values are represented in milliseconds since the EPOCH. The EPOCH is
defined as `1970-01-01T00:00:00.000000Z`.

Additionally, when converting from `BOOLEAN` values to numerics, `false` is
represented as `0`, and `true` is represented as `1`. On the way back `0` and
`NULL` are converted to `false` and all other values converted to `true`.

| From \ To | boolean | byte | short | int | float | long | double | date | timestamp |
| --------- | ------- | ---- | ----- | --- | ----- | ---- | ------ | ---- | --------- |
| date      | L       | L    | L     | L   | L     | X    | X      |      | X         |
| timestamp | L       | L    | L     | L   | L     | X    | X      | L    |           |

Conversions to `SYMBOL`, `STRING` and `VARCHAR` are supported from most of the
data types.

| From \ To | symbol | string | varchar |
| --------- | ------ | ------ | ------- |
| boolean   | X      | X      | X       |
| byte      | X      | X      | X       |
| short     | X      | X      | X       |
| int       | X      | X      | X       |
| float     | X      | X      | X       |
| long      | X      | X      | X       |
| date      | X      | X      | X       |
| timestamp | X      | X      | X       |
| double    | X      | X      | X       |
| ipv4      | X      | X      | X       |
| char      | X      | X      | X       |
| uuid      | X      | X      | X       |
| symbol    |        | X      | X       |
| string    | X      |        | X       |
| varchar   | X      | X      |         |

However conversion from `SYMBOL`, `STRING` and `VARCHAR` to other types can
result in `NULL` values for inconvertable string values.

| From \ To | boolean | byte | short | char | int | float | long | date | timestamp | double | uuid |
| --------- | ------- | ---- | ----- | ---- | --- | ----- | ---- | ---- | --------- | ------ | ---- |
| string    | L       | L    | L     | L    | L   | L     | L    | L    | L         | L      | L    |
| varchar   | L       | L    | L     | L    | L   | L     | L    | L    | L         | L      | L    |
| symbol    | L       | L    | L     | L    | L   | L     | L    | L    | L         | L      | L    |

When column type change results into range overflow or precision loss, the same
rules as explicit [CAST](/docs/reference/sql/cast/) apply.

## Unsupported Conversions

Converting from the type to itself is not supported.

If the column `department` is of type `SYMBOL`, then the following query will
result in error, even if the capacity parameter changes:

```questdb-sql
ALTER TABLE employees ALTER COLUMN department TYPE SYMBOL CAPACITY 4096;
```
