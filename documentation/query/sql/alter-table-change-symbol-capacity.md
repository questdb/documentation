---
title: ALTER TABLE SYMBOL CAPACITY
sidebar_label: SYMBOL CAPACITY
description: ALTER TABLE SYMBOL CAPACITY SQL keyword reference documentation.
---

Changes the capacity of an existing SYMBOL column in a table.

The capacity is the number of distinct values the column holds before its
symbol table is resized. It is altered without rewriting the data already
stored in the table partitions.

This is rarely needed, as capacity grows on its own after each commit (see
[symbol capacity](/docs/query/sql/create-table/#symbol-capacity)). Use it to
presize a column before a load that adds many distinct values at once.

## Syntax

```questdb-sql
ALTER TABLE tableName ALTER COLUMN columnName SYMBOL CAPACITY capacity;
```

## Examples

Change the capacity of the SYMBOL column `counterparty` in table `fx_trades`
to 512:

```questdb-sql
ALTER TABLE fx_trades ALTER COLUMN counterparty SYMBOL CAPACITY 512;
```

## Notes

- The operation does not rewrite existing data in partitions, making it an
  efficient way to adjust SYMBOL column configurations.
- The new capacity value must be a positive integer.
- The specified capacity will be automatically rounded to the next power of two.
- If you need to both change the data type and capacity, refer to the
  [ALTER TABLE COLUMN TYPE](/docs/query/sql/alter-table-change-column-type/)
  documentation.
