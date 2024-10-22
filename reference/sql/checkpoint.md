---
title: CHECKPOINT keyword
sidebar_label: CHECKPOINT
description: CHECKPOINT SQL keyword reference documentation.
---

Checkpoint SQL toggles the database into and out of "checkpoint mode". In this
mode the databases file system can be safely backed up using external tools,
such as disk snapshots or copy utilities.

_Looking for a detailed guide backup creation and restoration? Check out our
[Backup and Restore](/docs/operations/backup/) guide!_

:::caution

QuestDB currently does not support creating checkpoints on Windows.

If you are a Windows user and require backup functionality, please
[comment on this issue](https://github.com/questdb/questdb/issues/4811).

:::

## CHECKPOINT syntax

![Flow chart showing the syntax of the CHECKPOINT keyword](/img/docs/diagrams/checkpoint.svg)

## CHECKPOINT overview

To enable online backups, data in QuestDB is mutated via either file append or
via copy-on-write. Checkpoint leverages these storage methods to achieve
reliable and consistent restorations from your database backups.

### What happens during CHECKPOINT CREATE?

When initiatied, `CHECKPOINT CREATE`:

- Disables background jobs that housekeep stale files and data blocks
- Takes snapshot of table transactions across the whole database (all tables)
- Creates a new on-disk data structure that captures append offsets and versions
  of files that represent data for the above transactions. Typically this data
  is stored in the `/var/lib/questdb/.checkpoint` directory.
  - **Do not alter contents of this directory manually**!
- `fsync` - synchronously flushes page cache and buffers to disk

### What happens after a checkpoint has been created?

Once a checkpoint is created, QuestDB continues taking in writes. However, it
will consume more disk space. How much more depends on the shape of the data
that is being written. Data that is written via the append method will yeild
almost no additional disk space consumption other that of the data itself. In
contrast, the copy-on-write method will make data copies, which are usually
copies of non-recent table partitions. This will lead to an increase in disk
space consumption.

**It is strongly recommended that you minimize the time database is in
checkpoint mode and monitor the free disk space closely. The recommended way to
achive this is to utilize file system SNAPSHOTS as described in
[our backup and restore guide](/docs/operations/backup/).**

Also note that QuestDB can only enter checkpoint mode once. After that period of
time, the next checkpoint operation must be to exit checkpoint mode. Attempts to
create a new checkpoint when once exists will fail with the appropriate message.

When in checkpoint mode, you can safely access the file system to take your
snapshot.

### What happens after my snapshot is complete?

After your snapshot is complete, checkpoint mode must be exited via the
`CHECKPOINT RELEASE` SQL. Once executed, QuestDB will reinstate the usual
housekeeping and reclaim disk space.

The database restore is preformed semi-automatically on the database startup.
This is done deliberately to avoid the restore procedure running accidentally on
the source database instance. The database will attempt a restore when empty an
file, typically `/var/lib/questdb/_restore` is present.

The restore procedure will use `/var/lib/questdb/.checkpoint` to adjust the
database files and remove extra data copies. After the restore is successful the
database is avaialble as normal with no extra intervantion required.

## CHECKPOINT examples

To enter checkpoint mode:

```sql
CHECKPOINT CREATE
```

To exit checkpoint mode:

```sql
CHECKPOINT RELEASE
```
