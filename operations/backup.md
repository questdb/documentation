---
title: Backup and restore
sidebar_label: Backup and restore
description:
  Details and resources which describe backup functionality in QuestDB as means
  to prevent data loss.
---

QuestDB provides a snapshot feature that allows users to create backups of their
databases. This feature is essential for preventing data loss and ensuring that
data can be restored in the event of a failure.

A snapshot:

- Support both full backups and incremental snapshots
- Are available on all operating systems except Windows
- Can be created while the database is running

:::caution

QuestDB currently does not support creating snapshots on Windows.
If you are a Windows user and require backup functionality, please let us know by [commenting on this issue](https://github.com/questdb/questdb/issues/4811).


:::


---
## Overview
Snapshot is a feature that instructs QuestDB to record the state of the database
at a specific point in time. This state includes all data, metadata, and indexes
required to restore the database to the condition it was in when the snapshot was taken.

## Creating a snapshot
QuestDB database files, including snapshots, are stored inside the server root
directory provided at startup. The root directory contains the following subdirectories:
- `db`: Contains database files
- `log`: Contains log files
- `conf`: Contains configuration files
- `public`: Contains static files for the web console
- `snapshot`: Contains snapshot files, if any

:::tip

Locating the Server Root Directory

The default location of the server root directory varies by operating system:
- MacOS: When using Homebrew, the server root directory is located at /opt/homebrew/var/questdb/.
- Linux: The default location is ~/.questdb.

If you are unsure of the server root directory's location, you can determine it by
inspecting the QuestDB logs. Look for a line that reads, `QuestDB configuration files are in /opt/homebrew/var/questdb/conf`. The server root directory is one level up from the conf directory indicated in this log entry.

:::

Typically, the `db` directory is the largest and contains the most critical data.
As you ingest data, the `db` directory will grow in size. To create a backup,
you cannot simply copy the `db` directory, as it may be in an inconsistent state.
Instead, you should instruct QuestDB to create a snapshot.

To create a snapshot, execute the following SQL command:

```sql
SNAPSHOT PREPARE;
```

This command creates a snapshot of the database inside the db directory and records
additional metadata in the snapshot directory.

After issuing the `SNAPSHOT PREPARE` command, you can copy all directories inside
the server root directory to a backup location. You can use volume snapshots
or any other backup method suitable for your infrastructure.

Once the backup is complete, you must issue the following command to clean up the snapshot:

```sql
SNAPSHOT COMPLETE;
```

This command informs QuestDB that the snapshot is no longer needed,
allowing it to clean up any temporary files created during the snapshot process.

Failing to issue the `SNAPSHOT COMPLETE` command will result in the snapshot files
being retained indefinitely, potentially leading to disk space exhaustion.

## Restoring from a snapshot
To restore a database from a snapshot, follow these steps:
1. Stop the QuestDB server.
2. Remove everything inside the server root directory.
3. Copy the backup directories to the server root directory.
4. Create an empty file named `_restore` in the server root directory. You can use a simple touch command to create this file.
   This file serves as a signal to QuestDB that it should restore the database from the snapshot.
5. Start the QuestDB server.

After starting the server, QuestDB will restore the database to the state it was in when the snapshot was taken.

## Supported filesystems

QuestDB supports the following filesystems:

- APFS
- EXT4
- NTFS
- OVERLAYFS (used by Docker)
- XFS
- ZFS

Other file systems supporting are untested and while they may work,
they are not officially supported. See the [filesystem compatibility](/docs/deployment/capacity-planning/#supported-filesystems) section for more information.

## Further reading
- [Snapshot API](/docs/reference/sql/snapshot/) - Reference documentation for the SQL commands used to create and manage snapshots.