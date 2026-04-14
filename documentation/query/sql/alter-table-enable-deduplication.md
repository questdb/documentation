---
title: ALTER TABLE DEDUP ENABLE
sidebar_label: DEDUP ENABLE
description: ENABLE DEDUPLICATION SQL command reference documentation.
---

Enable storage level data deduplication on inserts and configures `UPSERT KEYS`.

:::note

- Deduplication can only be enabled for
  [Write-Ahead Log (WAL)](/docs/concepts/write-ahead-log) tables.
- Enabling deduplication does not have any effect on the existing data and only
  applies to newly inserted data. This means that a table with deduplication
  enabled can still contain duplicate data.
- Enabling deduplication does not have any effect on modifying data with
  `UPDATE` statements.

:::

## Syntax

```questdb-sql
ALTER TABLE tableName DEDUP ENABLE UPSERT KEYS(columnName [, columnName ...]);
```

`UPSERT KEYS` list can include one or more columns. The [designated timestamp](/docs/concepts/designated-timestamp) column must be
  included in the `UPSERT KEYS` list.

Running `ALTER TABLE DEDUP ENABLE` on a table that already has deduplication
enabled is not an error.

In such cases, the `UPSERT KEYS` list overrides the previously set key column
list.

## Example

To enable deduplication on the `fx_trades` table for the `timestamp` and
`trade_id` columns, where `timestamp` is the designated timestamp for the
table, use the following command:

```sql
ALTER TABLE fx_trades DEDUP ENABLE UPSERT KEYS(timestamp, trade_id);
```

See more example at [data deduplication](/docs/concepts/deduplication/#quick-example)
page

## See also

[ALTER TABLE DEDUP DISABLE](/docs/query/sql/alter-table-disable-deduplication)
