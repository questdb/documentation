---
title: ALTER TABLE SYMBOL CAPACITY
sidebar_label: SYMBOL CAPACITY
description: ALTER TABLE SYMBOL CAPACITY SQL keyword reference documentation.
---

Changes the capacity of an existing SYMBOL column in a table.

The capacity of the SYMBOL column is altered without rewriting the data already
stored in the table partitions. This operation allows you to adjust the maximum
number of distinct values that can be stored in a SYMBOL column without the
overhead of rebuilding the entire table.

## Syntax

![Flow chart showing the syntax of ALTER TABLE SYMBOL CAPACITY command](/images/docs/diagrams/alterTableSymbolCapacity.svg)

## Examples

Change the capacity of the SYMBOL column `ik` in table `x` to 512:

```questdb-sql
ALTER TABLE x ALTER COLUMN ik SYMBOL CAPACITY 512;
```

Increase the capacity of the SYMBOL column `department` in the table `employees`
to 10000:

```questdb-sql
ALTER TABLE employees ALTER COLUMN department SYMBOL CAPACITY 10000;
```

## Notes

- The operation does not rewrite existing data in partitions, making it an
  efficient way to adjust SYMBOL column configurations.
- The new capacity value must be a positive integer.
- The specified capacity will be automatically rounded to the next power of two.
- If you need to both change the data type and capacity, refer to the
  [ALTER TABLE COLUMN TYPE](/docs/reference/sql/alter-table-change-column-type/)
  documentation.
