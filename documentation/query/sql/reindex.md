---
title: REINDEX
sidebar_label: REINDEX
description: REINDEX SQL keyword reference documentation.
---

Rebuilds one or more [index](/docs/concepts/deep-dive/indexes/) columns of the
given table from the column data. Use it after a hardware or software crash,
when the index data are corrupted and the table cannot be opened for writes.

`REINDEX` works on native partitions only. To rebuild indexes on Parquet
partitions while the table stays online, use
[`ALTER TABLE FORCE REINDEX PARQUET`](/docs/query/sql/alter-table-force-reindex-parquet/)
instead.

## Syntax

```questdb-sql
REINDEX TABLE tableName
    [COLUMN columnName]
    [PARTITION partitionName]
    LOCK EXCLUSIVE;
```

## Options

By default, `REINDEX` rebuilds every index of the table in every native
partition. The following options narrow down the scope of the operation:

- `COLUMN`: rebuilds the index of the selected column only.
- `PARTITION`: rebuilds index files in the selected partition only. The
  partition name must match the name of the directory for the given
  partition. The naming convention is detailed in
  [Partitions](/docs/concepts/partitions/).

## LOCK EXCLUSIVE

`LOCK EXCLUSIVE` is required. It is not an optional clause, and the statement
fails with `LOCK EXCLUSIVE expected` without it. The keywords state that
`REINDEX` takes the table's exclusive writer lock for the whole operation, so
nothing else can write to the table while its indexes are rebuilt.

If another process or an open table writer already holds the lock, `REINDEX`
fails with `cannot lock table` rather than waiting. Stop ingestion into the
table before running it. Readers are not locked out, but queries should not run
against the table during the operation, because they may read an index that is
only partly rebuilt.

## Parquet partitions

[Parquet partitions](/docs/concepts/parquet/) have no native column files for
`REINDEX` to rebuild an index from:

- Without `PARTITION`, `REINDEX` skips every Parquet partition and leaves its
  existing index files untouched. Only the native partitions are rebuilt.
- With `PARTITION` naming a Parquet partition, `REINDEX` fails with
  `cannot reindex parquet partition`.

Use
[`ALTER TABLE FORCE REINDEX PARQUET`](/docs/query/sql/alter-table-force-reindex-parquet/)
for Parquet partitions. It needs no exclusive lock.

## Examples

Rebuilding all the indexes in the table `trades`:

```questdb-sql title="Rebuilding an index"
REINDEX TABLE trades LOCK EXCLUSIVE;
```

Rebuilding the index in the column `instruments`:

```questdb-sql title="Rebuilding an index"
REINDEX TABLE trades COLUMN instruments LOCK EXCLUSIVE;
```

Rebuilding one partition (`2021-12-17`) of the index in the column
`instruments`:

```questdb-sql title="Rebuilding an index"
REINDEX TABLE trades COLUMN instruments PARTITION '2021-12-17' LOCK EXCLUSIVE;
```

## See also

- [ALTER TABLE FORCE REINDEX PARQUET](/docs/query/sql/alter-table-force-reindex-parquet/)
- [Indexes](/docs/concepts/deep-dive/indexes/)
- [Partitions](/docs/concepts/partitions/)
