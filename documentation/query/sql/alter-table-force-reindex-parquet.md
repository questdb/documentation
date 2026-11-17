---
title: ALTER TABLE FORCE REINDEX PARQUET
sidebar_label: FORCE REINDEX PARQUET
description:
  Rebuild bitmap and posting indexes on Parquet partitions online, without an
  exclusive lock, and repair partitions affected by stale column metadata.
---

Rebuilds the [indexes](/docs/concepts/deep-dive/indexes/) of
[Parquet partitions](/docs/concepts/parquet/) while the table stays online.
Queries keep running against the current partition data until the rebuild
commits, so you can repair indexes without the downtime that
[`REINDEX ... LOCK EXCLUSIVE`](/docs/query/sql/reindex/) requires.

The main use is repairing tables written by QuestDB 9.3.4 through 10.0.1.
Those versions could leave stale column-top metadata on a Parquet partition
after merging out-of-order rows into it, leaving the partition's indexes out of
step with its data. `FORCE REINDEX PARQUET` corrects that metadata and rebuilds
the indexes from the Parquet file. It also rebuilds an index that is damaged
for any other reason, such as a missing index file.

`FORCE REINDEX PARQUET` is available from QuestDB 10.2.0 and QuestDB
Enterprise 4.2.0.

## Syntax

```questdb-sql
ALTER TABLE tableName FORCE REINDEX PARQUET
    [COLUMN columnName]
    [PARTITION LIST partitionName [, partitionName ...]];
```

- `COLUMN columnName` rebuilds only the index of `columnName`, which must be an
  indexed column. Without it, every index of the table is rebuilt.
- `PARTITION LIST` rebuilds only the listed partitions. The partition name
  must match the name of the partition's directory, as described in
  [Partitions](/docs/concepts/partitions/). Without it, every Parquet partition
  of the table is rebuilt.

Both [bitmap](/docs/concepts/deep-dive/indexes/) and
[posting](/docs/concepts/deep-dive/posting-index/) indexes are rebuilt,
including the covering columns of a posting index.

## Examples

```questdb-sql title="Rebuild every index on every Parquet partition"
ALTER TABLE trades FORCE REINDEX PARQUET;
```

```questdb-sql title="Rebuild the index of one column"
ALTER TABLE trades FORCE REINDEX PARQUET COLUMN symbol;
```

```questdb-sql title="Rebuild one column's index on selected partitions"
ALTER TABLE trades FORCE REINDEX PARQUET COLUMN symbol
    PARTITION LIST '2026-03-01', '2026-03-02';
```

To find the partitions that are in Parquet format, filter
[`table_partitions()`](/docs/query/functions/meta/#table_partitions) on its
`isParquet` column:

```questdb-sql title="List Parquet partitions"
SELECT name FROM table_partitions('trades') WHERE isParquet;
```

## How it works

Each partition is rebuilt into a new partition directory version. The new
version shares the Parquet file with the old one through hard links and gets
freshly built index files of its own. Queries that started before the rebuild
keep reading the old version until they finish, and QuestDB removes the old
version once nothing references it. Retired index files are also reclaimed by
[`VACUUM TABLE`](/docs/query/sql/vacuum-table/).

The statement commits each partition separately. If it stops partway, the
partitions it already rebuilt stay rebuilt, and running the statement again
finishes the rest.

The statement has no timeout. A
[`CANCEL QUERY`](/docs/query/sql/cancel-query/) or a dropped client connection
stops it once the partition in progress is committed.

The statement runs outside the
[write-ahead log](/docs/concepts/write-ahead-log/) and changes only the node it
runs on. It is not replicated.

### Partitions that are skipped

- **Native partitions** are never rebuilt. On a non-WAL table the active
  partition stays in native format, so it is left out. Use
  [`REINDEX TABLE ... LOCK EXCLUSIVE`](/docs/query/sql/reindex/) for native
  partitions.
- **Cold partitions** that live only in
  [object storage](/docs/concepts/cold-storage/) have no local files to
  rebuild. They are skipped, and the statement fails if every selected
  partition is cold.
- **Partitions attached from a soft link** are skipped, because a new
  directory version would move them off their attached volume.

## Automatic repair

You do not need `FORCE REINDEX PARQUET` for affected partitions that are
rewritten for another reason. QuestDB repairs stale column metadata on its own
when:

- [`ALTER TABLE ALTER COLUMN ADD INDEX`](/docs/query/sql/alter-table-alter-column-add-index/)
  runs. It repairs every affected local Parquet partition in the same
  transaction, so the new index is built over correct metadata.
- An out-of-order write lands in an affected Parquet partition. The partition
  is rewritten with correct metadata.

[Deduplication](/docs/concepts/deduplication/) on Parquet partitions reads key
values from the Parquet data rather than from the stale metadata, so it removes
duplicates correctly whether or not the partition has been repaired.

## Permissions

In QuestDB Enterprise, the statement requires the `REINDEX` permission on the
table, or on the column when `COLUMN` is given. See
[permissions](/docs/security/rbac/#permissions).

## Replication

In QuestDB Enterprise, the statement also runs on
[read-only replicas](/docs/high-availability/setup/). Its changes stay on the
local node and do not advance the replica's replicated transaction sequence.
Because nothing is replicated, run it on the primary and on every replica that
holds affected partitions.

## Errors

| Error                                                                                    | Cause                                                                           |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `'parquet' expected`                                                                     | The `PARQUET` keyword is missing after `FORCE REINDEX`.                         |
| `Invalid column: columnName`                                                             | The column does not exist.                                                      |
| `column is not indexed`                                                                  | The `COLUMN` clause names a column without an index.                            |
| `partition does not exist`                                                               | A partition in `PARTITION LIST` does not exist.                                 |
| `partition is not parquet, use REINDEX TABLE ... LOCK EXCLUSIVE for native partitions`   | A partition in `PARTITION LIST` is in native format. No partition is rebuilt.   |
| `cannot reindex cold partitions, they have no local data`                                | Every selected partition is cold.                                               |
| `table is not partitioned, use REINDEX TABLE ... LOCK EXCLUSIVE`                         | The table has no partitions, so it has no Parquet partitions.                   |

The statement also fails, rather than waiting, when another operation holds the
table writer, for example while WAL transactions are being applied. Retry it
once the writer is free.

## See also

- [Parquet](/docs/concepts/parquet/)
- [Indexes](/docs/concepts/deep-dive/indexes/)
- [Posting index](/docs/concepts/deep-dive/posting-index/)
- [REINDEX](/docs/query/sql/reindex/), for native partitions
- [ALTER TABLE ALTER COLUMN ADD INDEX](/docs/query/sql/alter-table-alter-column-add-index/)
- [ALTER TABLE ALTER COLUMN DROP INDEX](/docs/query/sql/alter-table-alter-column-drop-index/)
- [`table_partitions()`](/docs/query/functions/meta/#table_partitions)
- [VACUUM TABLE](/docs/query/sql/vacuum-table/)
