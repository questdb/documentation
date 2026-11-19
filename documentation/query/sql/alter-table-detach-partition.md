---
title: ALTER TABLE DETACH PARTITION
sidebar_label: DETACH PARTITION
description: DETACH PARTITION SQL keyword reference documentation.
---

Makes partition data unavailable for reads and prepares partition directory for
transportation. This is a manual archiving workflow, separate from QuestDB
Enterprise [cold storage](/docs/concepts/cold-storage/). A partition detached by this SQL keyword can be "re-attached"
using the complementary SQL keyword
[ALTER TABLE ATTACH PARTITION](/docs/query/sql/alter-table-attach-partition/).

## Syntax

```questdb-sql title="By partition name list"
ALTER TABLE tableName DETACH PARTITION LIST partitionName [, partitionName ...];
```

```questdb-sql title="By timestamp comparison"
ALTER TABLE tableName DETACH PARTITION
    WHERE timestampColumn { = | > | < | >= | <= } 'timestamp';
```

```questdb-sql title="By timestamp IN list"
ALTER TABLE tableName DETACH PARTITION
    WHERE timestampColumn IN ('timestamp' [, 'timestamp' ...]);
```

## Example

To detach one or more partitions, let's assume table `x` with 3 partitions,
`2019-02-01`, `2019-02-02`, and `2019-02-03`, and designated timestamp column
named `timestamp`:

1. Detach two partitions using the SQL `ALTER TABLE DETACH PARTITION` command:

   ```questdb-sql
   ALTER TABLE x DETACH PARTITION LIST '2019-02-01', '2019-02-02';

   -- It is also possible to use WHERE clause to define the partition list:

   ALTER TABLE sensors DETACH PARTITION WHERE timestamp < '2019-02-03T00';
   ```

2. Users can move the partition, for example, to an S3 bucket:

   ```bash
   cd /var/lib/questdb/db/x/
   tar cfz - '2019-02-01.detached' | aws s3 cp -  s3://questdb-internal/blobs/20190201.tar.gz
   tar cfz - '2019-02-02.detached' | aws s3 cp -  s3://questdb-internal/blobs/20190202.tar.gz
   ```

   The table directory is nested in the root directory. The root directory is
   set by `cairo.root` and is set to `db` by default. The detached partition
   files have the suffix `.detached`.

## Limitation

- QuestDB does not compress partitions after detaching nor does it change
  partition format significantly. In most cases, compression will have to be
  done manually before partitions are transported to cold storage.
- The operation does not support detaching:
  - An active (the last) partition.
  - The only partition in case of non-partitioned tables.
  - A read-only partition, such as one [attached from a symbolic link](/docs/query/sql/alter-table-attach-partition/#symbolic-links): `cannot detach partition, partition is read-only`. Use [`DROP PARTITION`](/docs/query/sql/alter-table-drop-partition/) instead, which removes the link and keeps its target.
- In QuestDB Enterprise, `DETACH PARTITION` is refused on a table tracked by [cold storage](/docs/concepts/cold-storage/), or whose storage policy has a `TO REMOTE` stage, with `cannot detach partition, table is tracked by cold storage`, and on a partition that keeps [late rows in cold storage](/docs/concepts/cold-storage-late-rows/), with `cannot detach partition, partition is delta-active`. See [Restrictions on cold storage tables](/docs/concepts/cold-storage/#restrictions-on-cold-storage-tables).
