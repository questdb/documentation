---
title: ALTER TABLE ATTACH PARTITION
sidebar_label: ATTACH PARTITION
description: ATTACH PARTITION SQL keyword reference documentation.
---

Restores one or more partitions to the table where they have been detached from
by using the SQL
[ALTER TABLE DETACH PARTITION](/docs/query/sql/alter-table-detach-partition/)
statement.

This feature is part of the manual S3/cold storage solution, allowing restoring
data manually.

## Syntax

![Flow chart showing the syntax of ALTER TABLE with ATTACH PARTITION keyword](/images/docs/diagrams/alterTableAttachPartition.svg)

The `WHERE` clause is not supported when attaching partitions.

## Description

Before executing `ATTACH PARTITION`, the partition folders to be attached must
be made available to QuestDB using one of the following methods:

- Copying the partition folders manually
- Using a [symbolic link](https://en.wikipedia.org/wiki/Symbolic_link)

This section describes the details of each method.

### Manual copy

Partition folders can be manually moved from where they are stored into the
table folder in `db`. To make the partitions available for the attach operation,
the files need to be renamed `<partition_name>.attachable`.

For example, in a table partitioned by year, given a partition folder named
`2020.detached`, rename it as `2020.attachable`, and move it to the table
folder.

### Symbolic links

[Symbolic links](https://en.wikipedia.org/wiki/Symbolic_link) can be used to
attach partition folders that exist potentially in a different volume as cold
storage. The partitions attached in this way will be **read-only**. To make
detached partition folders in cold storage available for attaching, for each
partition folder, create a symbolic link with the name
format`<partition_name>.attachable` from the table's folder, and set the target
path to the detached partition folder.

In Windows, symbolic links require admin privileges, and thus this method is not
recommended.

:::note

SQL statements that hit partitions attached via symbolic links may have slower
runtime if their volumes have a slower disk.

:::

#### Properties using symbolic links

Partitions attached via the symbolic link approach are **read-only** for the
following operations:

- [`DETACH PARTITION`](/docs/query/sql/alter-table-detach-partition/) and
  [`DROP PARTITION`](/docs/query/sql/alter-table-drop-partition/): Once the
  partition folders are unlinked, the symbolic links are removed, but the
  content remains. Detaching a partition that was attached via symbolic link
  does not create a copy `<partition_name>.detached`.
- [`UPDATE`](/docs/query/sql/update/): Attempts to update the read-only
  partitions result in an error.
- [`INSERT`](/docs/query/sql/insert/): Attemps to insert data into a
  read-only partition result in a critical-level log message being logged by the
  server, and the insertion is a no-op. If
  [Prometheus monitoring](/docs/integrations/other/prometheus/) is configured, an
  alert will be triggered.

For read-only partitions, the following operations are supported:

- [`ADD COLUMN`](/docs/query/sql/alter-table-add-column/)
- [`DROP COLUMN`](/docs/query/sql/alter-table-drop-column/)
- [`RENAME COLUMN`](/docs/query/sql/alter-table-rename-column/)
- [`ADD INDEX`](/docs/query/sql/alter-table-alter-column-add-index/)
- [`DROP INDEX`](/docs/query/sql/alter-table-alter-column-drop-index/)

## Example

### Manual copy

Assuming the QuestDB data directory is `/var/lib/questdb/db`, for a table `x`
with AWS S3 for cold storage:

1. Copy files from S3:

   ```bash
   cd /var/lib/questdb/db/x
   # Table x is the original table where the partition were detached from.

   mkdir 2019-02-01.attachable && aws s3 cp s3://questdb-internal/blobs/20190201.tar.gz - | tar xvfz - -C 2019-02-01.attachable --strip-components 1
   mkdir 2019-02-02.attachable && aws s3 cp s3://questdb-internal/blobs/20190202.tar.gz - | tar xvfz - -C 2019-02-01.attachable --strip-components 1
   ```

2. Execute the SQL `ALTER TABLE ATTACH PARTITION` command:

   ```questdb-sql
   ALTER TABLE x ATTACH PARTITION LIST '2019-02-01', '2019-02-02';
   ```

3. After the SQL is executed, the partitions will be available to read.

### Symbolic link

The following example creates a table `tab` with some data, detaches all but the
last partition, and demonstrates how to attach the partitions using symbolic
links.

These SQL statements create table `tab` partitioned by year, and insert seven
rows that result in a total of seven partitions:

```sql
CREATE TABLE tab (name STRING, age INT, dob TIMESTAMP) TIMESTAMP(dob) PARTITION BY YEAR;

INSERT INTO tab VALUES('B', 1, '2022-11-08T12:00:00.000000Z');
INSERT INTO tab VALUES('C', 2, '2023-11-08T12:00:00.000000Z');
INSERT INTO tab VALUES('D', 3, '2024-11-08T12:00:00.000000Z');
INSERT INTO tab VALUES('E', 4, '2025-11-08T12:00:00.000000Z');
INSERT INTO tab VALUES('F', 5, '2026-11-08T12:00:00.000000Z');
INSERT INTO tab VALUES('A', 0, '2027-11-08T12:00:00.000000Z');
INSERT INTO tab VALUES('0', 0, '2028-11-08T12:00:00.000000Z');
```

This SQL statement detaches partitions 2022, 2023, 2024, 2025, 2026, and 2027:

```sql
ALTER TABLE tab DETACH PARTITION WHERE dob < '2028';
```

Assuming QuestDB's root directory to be `/opt/homebrew/var/questdb/db`, the
content of the table folder is:

```shell
2022.detached
2023.detached
2024.detached
2025.detached
2026.detached
2027.detached
2028.5
_cv
_meta
_todo_
_txn
_txn_scoreboard
seq
```

You can now move those `<partition_name.detached>` folders to a different path,
potentially a different volume:

```shell
mv /opt/homebrew/var/questdb/db/tab/*.detached /cold_storage/tab
```

When you want to attach these partitions back, create a symlink for every
partition to be attached from the table folder
`/opt/homebrew/var/questdb/db/tab`:

```shell
ln -s /cold_storage/tab/2022.detached 2022.attachable
ln -s /cold_storage/tab/2023.detached 2023.attachable
ln -s /cold_storage/tab/2024.detached 2024.attachable
ln -s /cold_storage/tab/2025.detached 2025.attachable
ln -s /cold_storage/tab/2026.detached 2026.attachable
ln -s /cold_storage/tab/2027.detached 2027.attachable
```

The content of the table folder should look like this now:

```shell
2022.attachable -> /cold_storage/tab/2022.detached
2023.attachable -> /cold_storage/tab/2023.detached
2024.attachable -> /cold_storage/tab/2024.detached
2025.attachable -> /cold_storage/tab/2025.detached
2026.attachable -> /cold_storage/tab/2026.detached
2027.attachable -> /cold_storage/tab/2027.detached
2028.5
_cv
_meta
_todo_
_txn
_txn_scoreboard
seq
```

After the symbolic links have been created, the partitions can be attached with
the following SQL statement:

```sql
ALTER TABLE tab ATTACH PARTITION LIST '2022', '2023', '2024', '2025', '2026', '2027';
```

The SQL reference to the partitions does not include the suffix `.attachable`.

## Limitation

- S3/Cold storage interaction is manual. Partitions can only be attached to the
  same table they were detached from. The table name must be the same. Moving
  partitions between tables or database instances is not supported.
- The operation will fail if a partition already exists. We are working on
  functionality to allow merging data in the same partition for attaching.
