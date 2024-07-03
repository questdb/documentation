---
title: REINDEX
sidebar_label: REINDEX
description: REINDEX SQL keyword reference documentation.
---

Rebuilds one or more [index](/docs/concept/indexes/) columns of the given table.
This operation is intended to be used after a hardware or software crash, when
the index data are corrupted and the table cannot be opened for writes.

The operation can only be performed when there is no other reader and writer
working on the table. During the operation, the table is locked and no read and
write should be performed on the selected table.

## Syntax

![Flow chart showing the syntax of the REINDEX keyword](/img/docs/diagrams/reindex.svg)

## Options

By default, `REINDEX` rebuilds all indexes in the selected table. The following
options can be used to narrow down the scope of the operation:

- `COLUMN`: When defined, `REINDEX` rebuilds the index for the selected column.
- `PARTITION`: When defined, `REINDEX` rebuilds index files in the selected
  partition only. The partition name must match the name of the directory for
  the given partition. The naming convention is detailed in
  [Partitions](/docs/concept/partitions/).

## Example

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
