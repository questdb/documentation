---
title: ALTER TABLE DEDUP ENABLE
sidebar_label: DEDUP ENABLE
description:
  ALTER TABLE DEDUP ENABLE turns on deduplication for a WAL table, or changes
  its keys or mode. UPSERT keeps the latest row per key, SKIP keeps the first.
---

Enables storage-level [deduplication](/docs/concepts/deduplication/) on a
table, or changes the key columns or the mode of a table that already
deduplicates. The mode decides what happens when a new row matches a stored
row, or an earlier row of the same commit, on every key column: `UPSERT`
replaces the stored row, and `SKIP` keeps it and discards the new row.

## Syntax

```questdb-sql
ALTER TABLE tableName DEDUP ENABLE { UPSERT | SKIP }
    KEYS (columnName [, columnName ...]);
```

- `UPSERT`: a new row replaces every stored row with the same key values. The
  latest write wins.
- `SKIP`: a new row is discarded when a row with the same key values exists.
  The first write wins.
- `KEYS`: one or more columns of any type except `ARRAY`. The list must include
  the [designated timestamp](/docs/concepts/designated-timestamp/) column.

:::note

- Deduplication can only be enabled for
  [Write-Ahead Log (WAL)](/docs/concepts/write-ahead-log/) tables.
- Enabling deduplication does not have any effect on the existing data and only
  applies to newly inserted data. This means that a table with deduplication
  enabled can still contain duplicate data.
- Enabling deduplication does not have any effect on modifying data with
  `UPDATE` statements.

:::

## Change the keys or the mode

Running `ALTER TABLE DEDUP ENABLE` on a table that already has deduplication
enabled is not an error. The statement replaces both the key list and the mode,
so you can switch between `UPSERT` and `SKIP` without disabling deduplication
first. Stored rows are not rewritten.

Each transaction applies with the mode in effect when it was committed: rows
committed before the `ALTER` follow the old mode, and rows committed after it
follow the new one.

## Examples

Keep the latest row for each `timestamp` and `trade_id` of the `fx_trades`
table, where `timestamp` is the designated timestamp:

```questdb-sql title="Enable UPSERT deduplication"
ALTER TABLE fx_trades DEDUP ENABLE UPSERT KEYS(timestamp, trade_id);
```

Switch the table to keep the first row and discard later rows with the same
keys:

```questdb-sql title="Switch to SKIP deduplication"
ALTER TABLE fx_trades DEDUP ENABLE SKIP KEYS(timestamp, trade_id);
```

`SHOW CREATE TABLE` prints the mode in effect. The `dedup` column of `tables()`
reports only whether deduplication is enabled:

```questdb-sql title="Check the mode"
SHOW CREATE TABLE fx_trades;
```

The output includes the `DEDUP` clause, here
`DEDUP SKIP KEYS(timestamp,trade_id)`. See more examples on the
[deduplication](/docs/concepts/deduplication/#quick-example) page.

:::caution

QuestDB versions before 10.2.0 and QuestDB Enterprise versions before 4.2.0
deduplicate a `SKIP` table as `UPSERT`, and suspend a table when they meet a
logged `ALTER TABLE ... DEDUP ENABLE SKIP`. Upgrade every node of a replicated
cluster, replicas first, before you use `SKIP`. See
[Compatibility with earlier versions](/docs/concepts/deduplication/#compatibility-with-earlier-versions).

:::

## See also

- [ALTER TABLE DEDUP DISABLE](/docs/query/sql/alter-table-disable-deduplication/)
- [CREATE TABLE ... DEDUP](/docs/query/sql/create-table/#deduplication)
- [Deduplication](/docs/concepts/deduplication/)
