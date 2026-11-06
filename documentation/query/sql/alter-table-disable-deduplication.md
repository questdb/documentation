---
title: ALTER TABLE DEDUP DISABLE
sidebar_label: DEDUP DISABLE
description:
  ALTER TABLE DEDUP DISABLE turns off deduplication on a WAL table and removes
  its key columns and its UPSERT or SKIP mode.
---

Disables storage-level [deduplication](/docs/concepts/deduplication/) on a
table. The statement removes the key columns and the mode, so new rows are
stored as they arrive, including rows whose keys match stored rows. Rows
already stored are not changed.

## Syntax

```questdb-sql
ALTER TABLE tableName DEDUP DISABLE;
```

To switch between `UPSERT` and `SKIP`, or to change the key columns, run
[`ALTER TABLE DEDUP ENABLE`](/docs/query/sql/alter-table-enable-deduplication/)
with the new mode and keys instead. You don't need to disable deduplication
first.

## Example

Disable deduplication on table `fx_trades`:

```sql
ALTER TABLE fx_trades DEDUP DISABLE;
```

See more examples on the
[deduplication](/docs/concepts/deduplication/#quick-example) page.

## See also

- [ALTER TABLE DEDUP ENABLE](/docs/query/sql/alter-table-enable-deduplication/)
- [Deduplication](/docs/concepts/deduplication/)
