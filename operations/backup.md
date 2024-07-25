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
If you are a Windows user and require backup functionality, please let us know
by [commenting on this issue](https://github.com/questdb/questdb/issues/4811).
:::


## Overview

Snapshot is a feature that instructs QuestDB to record the state of the database
at a specific point in time. This state includes all data, metadata, and indexes
required to restore the database to the condition it was in when the snapshot was taken.

### Terminology

This guide uses the word "snapshot" in 2 different meanings:

- **Database snapshot**: Instructs QuestDB to record the state of the database at a specific point in time. This is done
  via `SNAPSHOT PREPARE` SQL command.
- **Filesystem and volume snapshot**: A point-in-time copy of the filesystem that can be used to create a backup. This is done
  using filesystem-specific tools or commands.

Database backup involves creating a database snapshot and then using a filesystem snapshot or file copying to create a
backup.

## Creating a database snapshot

QuestDB database files, including snapshots, are stored inside the server root
directory provided at startup. The root directory contains the following subdirectories:

- `db`: Contains database files
- `log`: Contains log files
- `conf`: Contains configuration files
- `public`: Contains static files for the web console
- `snapshot`: Contains snapshot files, if any

:::tip
The default location of the server root directory varies by operating system:

- MacOS: When using Homebrew, the server root directory is located at /opt/homebrew/var/questdb/.
- Linux: The default location is ~/.questdb.

If you are unsure of the server root directory's location, you can determine it by
inspecting the QuestDB logs. Look for a line that
reads, `QuestDB configuration files are in /opt/homebrew/var/questdb/conf`. The server root directory is one level up
from the conf directory indicated in this log entry.
See the [root directory structure](/docs/concept/root-directory-structure/) for more information.
:::

Typically, the `db` directory is the largest and contains the most critical data.
As you ingest data, the `db` directory will grow in size. To create a backup,
you cannot simply copy the `db` directory, as it may be in an inconsistent state.
Instead, you have to instruct QuestDB to create a database snapshot.

To create a database snapshot, execute the following SQL command:

```sql
SNAPSHOT PREPARE;
```

This command creates a snapshot of the database inside the `db` directory and records
additional metadata in the `snapshot` directory.

When `SNAPSHOT PREPARE` command finishes, you can copy all directories inside
the server root directory to a backup location.

### Data backup

After issuing the `SNAPSHOT PREPARE` command, it's your responsibility to back up the database files.
You can use any backup method that suits your infrastructure, such as filesystem snapshots or file-based backups.

In Cloud environments, you can use the volume snapshot functionality provided by your cloud provider.
See guides for creating volume snapshots on the following cloud platforms:

- [AWS](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-creating-snapshot.html) -
  creating EBS snapshots
- [Azure](https://docs.microsoft.com/en-us/azure/virtual-machines/snapshot-copy-managed-disk?tabs=portal) -
  creating snapshots of a virtual hard disk
- [GCP](https://cloud.google.com/compute/docs/disks/create-snapshots) - working
  with persistent disk snapshots

Even if you are not in a cloud environment volume snapshots can be taken using either the
filesystem ([ZFS](https://ubuntu.com/tutorials/using-zfs-snapshots-clones#1-overview)) or a volume
manager ([LVM](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/8/html/configuring_and_managing_logical_volumes/snapshot-of-logical-volumes_configuring-and-managing-logical-volumes#snapshot-of-logical-volumes_configuring-and-managing-logical-volumes)).

If filesystem or volume snapshots are not available, you can use file-based backups to back up the QuestDB server root directory.
We recommend using a backup tool that supports incremental backups to reduce the amount of data transferred during each
backup. [rsync](https://linux.die.net/man/1/rsync) is a popular tool for this purpose. Make sure to back up
the entire server root directory, including the `db`, `snapshot`, and all other directories.

Once the backup is complete, you must issue the following command to clean up the database snapshot:

```sql
SNAPSHOT COMPLETE;
```

This command informs QuestDB that the database snapshot is no longer needed,
allowing it to clean up any temporary files created during the snapshot process.

:::note
For some cloud vendors, volume snapshot creation operation is asynchronous,
i.e. the point-in-time snapshot is created immediately, as soon as the operation
starts, but the end snapshot artifact may become available later. In such case,
the `SNAPSHOT COMPLETE` statement (step 3) may be run without waiting for the
end artifact, but once the snapshot creation has started.
:::

Failing to issue the `SNAPSHOT COMPLETE` command will result in the snapshot files
being retained indefinitely, potentially leading to disk space exhaustion.

## Restoring from a snapshot

To restore a database from a snapshot, follow these steps:

1. Stop the QuestDB server.
2. Remove everything inside the server root directory.
3. Copy the backup directories to the server root directory. If you are using a filesystem snapshot, you restore the
   snapshot.
4. Create an empty file named `_restore` in the server root directory. You can use a simple touch command to create this
   file.
   This file serves as a signal to QuestDB that it should restore the database from the snapshot.
5. Start the QuestDB server.

Make sure the `_restore` file is present in the server root directory before starting the server,
otherwise QuestDB will start normally without restoring the database.

After starting the server, QuestDB will restore the database to the state it was in when the snapshot was taken.
If a snapshot recovery cannot be completed, for example, if the snapshot files are missing or corrupted,
QuestDB will log an error message and abort startup. In this case, you should investigate the cause of the error
and attempt to restore the database again.

## Supported filesystems

QuestDB supports the following filesystems:

- APFS
- EXT4
- NTFS
- OVERLAYFS (used by Docker)
- XFS
- ZFS

Other file systems supporting are untested and while they may work,
they are not officially supported. See
the [filesystem compatibility](/docs/deployment/capacity-planning/#supported-filesystems) section for more information.

## Further reading

- [Snapshot API](/docs/reference/sql/snapshot/) - Reference documentation for the SQL commands used to create and manage
  snapshots.