---
title: Backup and restore
sidebar_label: Backup and restore
description:
  Details and resources which describe backup functionality in QuestDB as means
  to prevent data loss.
---

QuestDB allows creating copies of the database that you can use in case the original
database or data is lost fully or partially, or database or table is corrupted. Backup is
also used to speed up creation of replica instances in QuestDB Enterprise.

## Overview

The backup step involves:
- switching the database into special mode via SQL
- creating a copy of the QuestDB root directory
- switching the database back into the regular mode of operation via SQL

When in the special mode, the database instance remains available for both reads and writes.
However, the "garbage collection" sub-system for copy-on-write data mutations is paused.
Having this sub-system paused is not a big deal for database reads, however under
heavy write load the database will be consuming more space than normal. When
database exits the special mode, the "garbage collection" sub-system is resumed and
the disk space is rapidly reclaimed.

The second step, creating a copy of the database, is performed using tools of your choice:

- cloud snapshot, e.g. EBS volume snapshot on AWS, Premium SSD Disk snapshot on Azure etc
- using the existing on-prem backup tools and software
- using basic command line tools, such as `cp` or `rsync`

The recovery step involves:
- restoring contents of the QuestDB root directory from a copy, made during the backup
- touching the trigger file in the questdb root directory
- starting QuestDB using the restored data directory as normal

If the special file is present in the root directory, QuestDB will perform the recovery
procedure during the startup. If recovery procedure is successful the trigger file is
removed to enable future restarts to skip the recovery step. Should recovery fail, the
database will exit with an error and the trigger file will remain in place.

## Terminology

The "special mode" in the database is called `CHECKPOINT`. Entering the special mode is
done via `CHECKPOINT CREATE`, existing the special mode is done via `CHECKPOINT RELEASE`.
From now on we will call the state of the database after `CHECKPOINT CREATE` the
"checkpoint mode"

## Data backup

### Pick a good time

We recommend to take database backup at the times when the database write load is at
its lowest. If the database is under constant write load, with no light at the end
of the tunnel, a good workaround is to ensure the disk has at least 50% free space.
The more free space the better.

### Data copy type

The goal of picking a good copy method is to:

- minimize the amount of time QuestDB spends in the *checkpoint mode*
- ensure that copy time remains sustainable as the database size grows

// TODO: reword
Thanks to time partitioning, QuestDB does not have to make all database files
"dirty". This helps with incremental backups that are based on file modification times. We
recommend exercising incremental backups where possible.

If you're using cloud disks, such as EBS on AWS, SSD on Azure etc. we strongly recommend
using cloud *snapshot( infrastructure. The advantages of this approach is that:

- snapshot minimizes the time QuestDB is in the *checkpoint mode*
- snapshots are incremental and easy enough to restore from

When database is on-prem we recommend using the existing file system backup
tools.

### Backup frequency

Backup should be taken at least daily. If you
are using QuestDB Enterprise, the frequency of backups impacts the
time it takes to create a new replica instances. The process of creating
replicas involves choosing a backup and having the replica replay WAL files until
it caught up. The older the backup the more WAL files replica will have to
replay.

### The backup steps

- Put the database in the "checkpoint mode"
- Take snapshot of or copy the data outside the database instance
- Exit the "checkpoint mode"


### Entering checkpoint mode

 ```sql
 CHECKPOINT CREATE
 ```

You can have only one checkpoint in flight. Attempting to create second checkpoint will fail.

### Exiting checkpoint mode

 ```sql
 CHECKPOINT RELEASE
 ```

### Taking snapshot or copy

After checkpoint is created and before it is released you are allowed to safely access the
file system using tools external to the database instance.

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

Snapshot based systems usually break down the backup in two steps:
- take snapshot
- backup the snapshot

With snapshots, you can release the `CHECKPOINT` as soon as snapshot is taken (which takes a minute or two),
and before the backup is complete.

If filesystem or volume snapshots are not available, you can use file copy to back up the QuestDB server root directory.
We recommend using a copy tool that can skip copying files based on the modification date.
[rsync](https://linux.die.net/man/1/rsync) is a popular tool for this purpose. Make sure to back up
the entire server root directory, including the `db`, `snapshot`, and all other directories.

Using file copy usually takes longer to back up files compared to snapshot. You will have to wait until
the data transfer is fully complete before releasing the `CHECKPOINT`.

It is very important to exit the *checkpoint mode* regardless if data copy succeed or failed.

## Checkpoint status check

In case you lost your database session and/or backup takes time, you can check if the database is
in the *checkpoint mode*:

```sql
SELECT * FROM checkpoint_status();
```

## Restoring from a checkpoint

Restoring from checkpoint will restore the entire database. We will assume that you are setting up
a new database instance using the data from checkpoint rather than blank database.

Follow these steps:

- Ensure QuestDB version match
- Restore QuestDB root directory contents (`/var/lib/questdb/`) from the backup
- Touch the trigger file
- Start the database using the restored root directory

### Database versions

The data restore is only possible if the original and the backup QuestDB versions have the same
major version number, for example: `8.1.0` and `8.1.1` are compatible. `8.1.0` and `7.5.1` are incompatible.

### Restore the root directory

When using cloud tools you can create a new disk from snapshot. The entire disk contents of the original
database will be available when compute instance starts.

If you are not using cloud tools you have to make sure that root directory is restored from the backup using
your own tools of choice.

### The trigger file

When you are starting database on the backup for the first time, the database will have to perform
a restore procedure to ensure data is consistent and can be read and written. This procedure only
takes place on startup, and it requires a blank file to exist as the indication of user intent.

Touch `_restore` file in the root directory. Assuming root directory is `/var/lib/questdb/` the following
command will do the trick:

```bash
touch /var/lib/questdb/_restore
```
### Start the database

Start the database using the root directory as your would normally. When `_restore` file is present
the database will perform the restore procedure. There are two outcomes of this procedure:

- restore is successful: database continues to run normally and is ready to use; the `_restore` file is removed to
  prevent the same procedure running twice.
- restore failed: database will exit and `_restore` file will remain in place. The error will be printed to `stderr`. If
  this error can be resolved, starting the database again will retry the restore procedure.


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