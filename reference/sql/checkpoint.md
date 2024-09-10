---
title: SNAPSHOT keyword
sidebar_label: SNAPSHOT
description: SNAPSHOT SQL keyword reference documentation.
---

Checkpoint SQL toggels database "checkpoint mode". In this mode the databases file system
can be safely backed up using external tools, such as disk snapshots or copy utilities.

_For a detailed guide backup creation and restoration? Check out our
[Backup and Restore](/docs/operations/backup/) guide!_

## Syntax

![Flow chart showing the syntax of the SNAPSHOT keyword](/img/docs/diagrams/snapshot.svg)

:::caution

QuestDB currently does not support creating snapshots on Windows.

If you are a Windows user and require backup functionality, please
[comment on this issue](https://github.com/questdb/questdb/issues/4811).

:::

### SYNOPSIS

Enters and exists the database checkpoint mode. In this mode QuestDB instance
enables the external systems to take snapshot and/or copy the database's data directory.

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

Data in QuestDB is mutated either via file append or using copy-on-write of files to achieve
two goals: reader concurrency and online backup. Creating `CHECKPOINT` involves the following:

- disabling bacground jobs that housekeep stale files and data blocks
- taking snapshot of the last transaction numbers across all tables in the database
- creating a new on-disk data structure that captures append offsets and versions of files that
  represent the data for the above transactions. Typically in /var/lib/questdb/db/.checkpoint directory.
- fsync - flushing page cache and buffers to disk, synchronously.

Database is allowed to take in writes after checkpoing is created. However, it will start consuming more disk space.
How much more depends on the shape of the data that is being written. Data that is written via append method will
yeild almost no additional writes, however copy-on-write method will be leaving unused data copies behind.

It is recommended to minimize the time database is in checkpoint mode and monitor the free disk space closely.
Best way to achive that is to utilize file system snapshot as we describe in our backup and restore guide.

When database is in checkpoing mode - creating new checkpoints will fail with the appropriate message.

After snapshot is complete, checkpoing mode is existed via `CHECKPOINT RELEASE` SQL. It will reinstate the
housekeeping and reclaim the disk space.

The database restore is preformed semi-automatically on the database startup. This is done deliberately to
avoid the restore procedure running accidentally on the source database instance. The database will attempt
restore when empty file, typically /var/lib/questdb/_restore is present.

The restore procedure will use /var/lib/questdb/db/.checkpoint to adjust the database files and remove extra data copies.
After the restore is successful the database is avaialble as normal with no extra intervantion required.

