---
title: ALTER TABLE DEDUP ENABLE
sidebar_label: DEDUP ENABLE 
description: ENABLE DEDUPLICATION SQL command reference documentation.
---

Enable storage level data deduplication on inserts and configures `UPSERT KEYS`.

:::note
- Deduplication can only be enabled for [Write-Ahead Log (WAL)](/docs/concept/write-ahead-log) tables.
- Enabling deduplication does not have any effect on the existing data and only applies to newly inserted data. This means that a table with deduplication enabled can still contain duplicate data.
- Enabling deduplication does not have any effect on modifying data with `UPDATE` statements.
:::

## Syntax

![Flow chart showing the syntax of the ALTER TABLE DEDUP ENABLE statement](/img/docs/diagrams/enableDedup.svg)

`UPSERT KEYS` list can include one or more columns with the following rules:

- The [designated Timestamp](/docs/concept/designated-timestamp) column must be included in the `UPSERT KEYS` list.
- Columns of [STRING and BINARY](/docs/reference/sql/datatypes) types cannot be used in the `UPSERT KEYS` list.

Running `ALTER TABLE DEDUP ENABLE` on a table that already has deduplication enabled is not an error. 

In such cases, the `UPSERT KEYS` list overrides the previously set key column list.

## Example

To enable deduplication on the `TICKER_PRICE` table for the `ts` and `ticker` columns, where `ts` is the designated timestamp for the table, use the following command:

```sql
ALTER TABLE TICKER_PRICE DEDUP ENABLE UPSERT KEYS(ts, ticker)
```

See more example at [data deduplication](/docs/concept/deduplication#example) page

## See also

[ALTER TABLE DEDUP DISABLE](/docs/reference/sql/alter-table-disable-deduplication)