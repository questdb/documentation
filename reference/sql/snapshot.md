---
title: SNAPSHOT keyword
sidebar_label: SNAPSHOT
description: SNAPSHOT SQL keyword reference documentation.
---

Prepares the database for a full backup or a filesystem (disk) snapshot.

## Syntax

![Flow chart showing the syntax of the SNAPSHOT keyword](/img/docs/diagrams/snapshot.svg)


:::caution

QuestDB currently does not support creating snapshots on Windows.
If you are a Windows user and require backup functionality, please let us know by [commenting on this issue](https://github.com/questdb/questdb/issues/4811).

:::

**Tip: Are you looking for a detailed guide on how to create backups and restore them? Check out our [Backup and Restore](/docs/operations/backup/) guide!**

## Snapshot process
Database snapshots may be used in combination with filesystem snapshots or
together with file copying for a full data backup. Collecting a snapshot
involves the following steps:

1. Run `SNAPSHOT PREPARE` statement to acquire reader locks for all database
   tables, create table metadata file copies in the `snapshot` directory, and
   flush the committed data to disk.
2. Start a filesystem snapshot or copy the
   [root directory](/docs/concept/root-directory-structure/) to the backup
   location on the disk. 
   learn how to create a filesystem snapshot on the most common cloud providers.
3. Run `SNAPSHOT COMPLETE` statement to release the reader locks and delete the
   metadata file copies.


## Snapshot recovery

In case of a full backup, you should also delete the old root directory and copy
the files from your backup to the same location or, alternatively, you can point
the database at the new root directory.

When the database starts, it checks the presence of a file named `_restore` in
the root directory. If the file is present, the database runs a
snapshot recovery procedure restoring the metadata files from the snapshot. When
this happens, you should see the following in the server logs:

```
2022-03-07T08:24:12.348004Z I i.q.g.DatabaseSnapshotAgent starting snapshot recovery [trigger=file]
[...]
2022-03-07T08:24:12.349922Z I i.q.g.DatabaseSnapshotAgent snapshot recovery finished [metaFilesCount=1, txnFilesCount=1, cvFilesCount=1]
```

Snapshot recovery can be disabled using the `cairo.snapshot.recovery.enabled`
configuration key:

```shell title="server.conf"
cairo.snapshot.recovery.enabled=false
```

## Examples

```questdb-sql
SNAPSHOT PREPARE;
-- Start a filesystem snapshot.
SNAPSHOT COMPLETE;
```

```questdb-sql
SNAPSHOT PREPARE;
-- Copy the root directory:
-- $ cp -r /root/dir/path /backup/dir/path
SNAPSHOT COMPLETE;
```

## Further reading
- [Backup and Restore](/docs/operations/backup/) - Detailed guide on how to create backups and restore them.