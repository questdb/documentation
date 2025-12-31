---
title: ALTER MATERIALIZED VIEW SYMBOL CAPACITY
sidebar_label: SYMBOL CAPACITY
description:
  ALTER MATERIALIZED VIEW SYMBOL CAPACITY SQL keyword reference documentation.
---

Changes the capacity of an existing SYMBOL column in a
[materialized view](/docs/concepts/materialized-views/).

The capacity of the SYMBOL column is altered without rewriting the data already
stored in the materialized view. This operation allows you to adjust the maximum
number of distinct values that can be stored in a SYMBOL column.

## Syntax

![Flow chart showing the syntax of ALTER MATERIALIZED VIEW SYMBOL CAPACITY command](/images/docs/diagrams/alterMatViewSymbolCapacity.svg)

## Examples

Change the capacity of the SYMBOL column `symbol` in materialized view
`trades_1h` to 10000:

```questdb-sql
ALTER MATERIALIZED VIEW trades_1h ALTER COLUMN symbol SYMBOL CAPACITY 10000;
```

## Notes

- The operation does not rewrite existing data in materialized view partitions,
  making it an efficient way to adjust SYMBOL column configurations.
- The new capacity value must be a positive integer.
- The specified capacity will be automatically rounded to the next power of two.
