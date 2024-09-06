---
title: Backup and restore
sidebar_label: Backup and restore
description:
  Details and resources which describe backup functionality in QuestDB as means
  to prevent data loss.
---

QuestDB allows creating archive copies of the database that you can use in case the original
database or data is lost fully or partially, or database or table is corrupted. Backup is
also used to speed up creation of [replica instances](/docs/operations/replication/) in QuestDB Enterprise.

## Overview

To perform the backup, follow these steps:

- use SQL to switch the database into special mode
- create a copy of the QuestDB root directory
- use SQL to switch the database back to the regular mode

When in the special mode, the database instance remains available for both reads
and writes. However, the housekeeping tasks will be paused. While being paused
is not a big deal for database reads, database writes are likely to be consuming
more space than normal. When the database exits the special mode, it will resume
the housekeeping tasks and quickly reclaim the disk space.

In the second step, you must create a copy of the database using a tool of your
choice. These are some suggestions:

- cloud snapshot, e.g. EBS volume snapshot on AWS, Premium SSD Disk snapshot on
  Azure etc
- on-prem backup tools and software you typically use
- basic command line tools, such as `cp` or `rsync`

To recover the database, follow these steps:

- restore the QuestDB root directory from the backup copy
- touch the trigger file in the questdb root directory
- start QuestDB as usual

If the trigger file is present in the root directory, QuestDB performs the
recovery procedure during the startup. If this is successful, it deletes the
trigger file, so it won't perform recovery in future restarts. Should recovery
fail, QuestDB will exit with an error, and the trigger file will remain in
place.

## Terminology

The "special mode" in the database is called `CHECKPOINT`. Entering the special mode is
done via `CHECKPOINT CREATE`, existing the special mode is done via `CHECKPOINT RELEASE`.
From now on we will call the state of the database after `CHECKPOINT CREATE` the
"checkpoint mode"

## Data backup

### Pick a good time

We recommend to take a database backup at the times when the database write load
is at its lowest. If the database is under constant write load, a good
workaround is to ensure the disk has at least 50% free space. The more free
space, the safer it is to enter the checkpoint mode.

### Data copy methods

The goal of picking a good copy method is to:

- minimize the time QuestDB spends in checkpoint mode
- ensure the copy time remains sustainable as the database grows

Due to time partitioning, the older data is often unmodified, both at block and
file level. QuestDB backup lends itself relatively well to all types of
differential data copying.

If you're using cloud disks, such as EBS on AWS, SSD on Azure etc., we strongly
recommend using the cloud _snapshot_ infrastructure. The advantages of this
approach are that:

- snapshotting minimizes the time QuestDB spends in checkpoint mode
- snapshots are differential and easy enough to restore from

When the database is on-prem, we recommend using the existing file system backup
tools.

### Backup frequency

Backups should be taken at least daily. If you are using QuestDB Enterprise, the
frequency of backups impacts the time it takes to create a new [replica instance](/docs/operations/replication/) .
The process of creating replicas involves choosing a backup and having the
replica replay WAL files until it has caught up. The older the backup, the more
WAL files the replica will have to replay.

### Enter the checkpoint mode

 ```sql
 CHECKPOINT CREATE
 ```

You can have only one checkpoint in flight. Attempting to create second checkpoint will fail.

### Exit the checkpoint mode

 ```sql
 CHECKPOINT RELEASE
 ```

### Take a snapshot or copy

After a checkpoint is created and before it is released, you are allowed to
safely access the file system using tools external to the database instance.

In Cloud environments, you can use the volume snapshot functionality provided by
your cloud provider. See the guides for creating volume snapshots on the
following cloud platforms:

- [AWS](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-creating-snapshot.html) -
  creating EBS snapshots
- [Azure](https://docs.microsoft.com/en-us/azure/virtual-machines/snapshot-copy-managed-disk?tabs=portal) -
  creating snapshots of a virtual hard disk
- [GCP](https://cloud.google.com/compute/docs/disks/create-snapshots) - working
  with persistent disk snapshots

Even if you are not in a cloud environment, volume snapshots can be taken using
either the filesystem
([ZFS](https://ubuntu.com/tutorials/using-zfs-snapshots-clones#1-overview)) or a
volume manager
([LVM](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/8/html/configuring_and_managing_logical_volumes/snapshot-of-logical-volumes_configuring-and-managing-logical-volumes#snapshot-of-logical-volumes_configuring-and-managing-logical-volumes)).

Snapshot-based systems usually break down the backup in two steps:

- take snapshot
- backup the snapshot

With snapshots, you can exit the checkpoint mode as soon as the snapshot is taken
(which takes a minute or two), and before the backup is complete.

If filesystem or volume snapshots are not available, you can use file copy to
back up the QuestDB server root directory. We recommend using a copy tool that
can skip copying files based on the modification date.
[rsync](https://linux.die.net/man/1/rsync) is a popular tool for this purpose.
Make sure to back up the entire server root directory, including the `db`,
`snapshot`, and all other directories. 

Using file copy usually takes longer to back up files compared to snapshot. You
will have to wait until the data transfer is fully complete before exiting the
checkpoint mode.

It is very important to exit the checkpoint mode regardless of whether the copy
operation succeeded or failed.

## Checkpoint status check

In case you lost your database session and/or backup takes time, you can check
if the database is in the checkpoint mode:

```sql
SELECT * FROM checkpoint_status();
```

## Restoring from a checkpoint

Restoring from checkpoint will restore the entire database. We will assume that
you are setting up a new database instance using the data from a checkpoint,
rather than a blank database.

Follow these steps:

- Ensure QuestDB versions match
- Restore QuestDB root directory contents (`/var/lib/questdb/`) from the backup
- Touch the trigger file
- Start the database using the restored root directory

### Database versions

Restoring data is only possible if the original and the backup QuestDB versions
have the same major version number, for example: `8.1.0` and `8.1.1` are
compatible. `8.1.0` and `7.5.1` are not compatible.

### Restore the root directory

When using cloud tools, you can create a new disk from the snapshot. The entire disk
contents of the original database will be available when the compute instance
starts.

If you are not using cloud tools, you have to make sure that you restore the
root from the backup using your own tools of choice.

### The trigger file

When you are starting the database from the backup for the first time, the
database must perform a restore procedure. This ensures the data is consistent
and can be read and written. It only takes place on startup, and requires a
specific blank file to exist as the indication of user intent.

Touch the `_restore` file in the root directory. Assuming root directory is
`/var/lib/questdb/` the following command will do the trick:

```bash
touch /var/lib/questdb/_restore
```

### Start the database

Start the database using the root directory as your would normally. When the
`_restore` file is present, the database will perform the restore procedure.
There are two possible outcomes:

- restore is successful: the database continues to run normally and is ready to
  use; the `_restore` file is removed to prevent the same procedure running
  twice.
- restore failed: the database exits and the `_restore` file remains in place.
  An error message appears in `stderr`. If it can be resolved, starting the
  database again will retry the restore procedure.

## Supported filesystems

QuestDB supports the following filesystems:

- APFS
- EXT4
- NTFS
- OVERLAYFS (used by Docker)
- XFS
- ZFS

Other file systems are untested and while they may work, we do not officially
support them. See the
[filesystem compatibility](/docs/deployment/capacity-planning/#supported-filesystems)
section for more information.

## Further reading

- [Snapshot API](/docs/reference/sql/snapshot/) - Reference documentation for
  the SQL commands used to create and manage snapshots.
