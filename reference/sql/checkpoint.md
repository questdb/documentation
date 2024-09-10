---
title: CHECKPOINT keyword
sidebar_label: CHECKPOINT
description: CHECKPOINT SQL keyword reference documentation.
---

Checkpoint SQL toggles database "checkpoint mode". In this mode the databases file system
can be safely backed up using external tools, such as disk snapshots or copy utilities.

_For a detailed guide backup creation and restoration? Check out our
[Backup and Restore](/docs/operations/backup/) guide!_

## Syntax

![Flow chart showing the syntax of the CHECKPOINT keyword](/img/docs/diagrams/checkpoint.svg)

:::caution

QuestDB currently does not support creating checkpoints on Windows.

If you are a Windows user and require backup functionality, please
[comment on this issue](https://github.com/questdb/questdb/issues/4811).

:::

### EXAMPLES

To enter checkpoint mode execute:

```sql
CHECKPOINT CREATE
```

To exit checkpoint mode execute:

```sql
CHECKPOINT RELEASE
```

### DESCRIPTION

Data in QuestDB is mutated either via file append or using copy-on-write of files to enable
online backup. Checkpoint leverages this storage methods to achieve reliable and consistent
restore from backup. To understand the process better, lets dive into what `CHECKPOINT CREATE`
does:

- disables background jobs that housekeep stale files and data blocks.
- takes snapshot of table transactions across the whole database (all tables).
- creates a new on-disk data structure that captures append offsets and versions of files that.
  represent the data for the above transactions. Typically it is stored in `/var/lib/questdb/db/.checkpoint` directory. Do
  not alter contents of this directory manually.
- fsync - flushing page cache and buffers to disk, synchronously.

Database is allowed to continue taking in writes after checkpoing is created. However, it will start consuming more disk space.
How much more depends on the shape of the data that is being written. Data that is written via append method will
yeild almost no additional disk space consumtion other that for the data itself, however copy-on-write method 
will be making data copies, which are usually copies of non-recent table partitions.

It is strongly recommended to minimize the time database is in checkpoint mode and monitor the free disk space closely.
Best way to achive this is to utilize file system SNAPSHOTS as we describe in [our backup and restore guide](/docs/operations/backup/)

When database is already in checkpoing mode - creating new checkpoints will fail with the appropriate message.

After snapshot is complete, checkpoing mode must be existed via `CHECKPOINT RELEASE` SQL. It will reinstate the
housekeeping and reclaim the disk space.

The database restore is preformed semi-automatically on the database startup. This is done deliberately to
avoid the restore procedure running accidentally on the source database instance. The database will attempt
restore when empty file, typically `/var/lib/questdb/_restore` is present.

The restore procedure will use `/var/lib/questdb/db/.checkpoint` to adjust the database files and remove extra data copies.
After the restore is successful the database is avaialble as normal with no extra intervantion required.

