---
title: Backup and restore
sidebar_label: Backup and restore
description:
  Instructions and advice on performing backup/restore operations on QuestDB
---

You should back up QuestDB to be prepared for the case where your original
database or data is lost, or if your database or table is corrupted. Backups are
also required to create [replica instances](/docs/operations/replication/) in
QuestDB Enterprise.

## Overview

QuestDB provides two different backup workflows:

- **QuestDB Enterprise**: built-in incremental backups to object storage using
  `BACKUP DATABASE` and a restore trigger file (`_backup_restore`). No manual
  checkpoints are required.
- **QuestDB OSS**: manual backups using `CHECKPOINT CREATE/RELEASE` and external
  snapshot or file copy tools.

If you are running **QuestDB Enterprise**, follow the Enterprise section below
and do not use the manual checkpoint workflow.

## QuestDB Enterprise: built-in backup and restore

QuestDB Enterprise provides an incremental backup system that uploads database
metadata and partition data to object storage. When you run a backup, QuestDB
creates a checkpoint internally, builds a manifest of tables and partitions, and
uploads only the changed data. Progress and errors are tracked in an index stored
alongside the backup data.

### Configure

At minimum, configure an object store and enable backups. See
[object store URLs](/docs/operations/replication/#setup-object-storage) for how
to build the connection string.

```conf
backup.enabled=true
backup.object.store=s3::bucket=my-bucket;region=eu-west-1;access_key_id=...;secret_access_key=...;
```

#### Scheduled backups

You can configure automatic scheduled backups using cron syntax. The example
below runs a backup every day at midnight UTC.

```conf
backup.schedule.cron=0 0 * * *
backup.schedule.tz=UTC
```

### Run a backup

Once configured, you can run a backup at any time using the following command:

```questdb-sql title="Backup database"
BACKUP DATABASE;
```

Example output:

| backup_timestamp              |
| ----------------------------- |
| 2024-08-24T12:34:56.789123Z   |

### Monitor and abort

You can monitor backup progress and history using the `backups()` table function:

```questdb-sql title="Backup history"
SELECT * FROM backups();
```

Example output:

| status          | progress_percent | start_ts                    | end_ts                      | backup_error | cleanup_error |
| --------------- | ---------------- | --------------------------- | --------------------------- | ------------ | ------------- |
| backup complete | 100              | 2025-12-23T13:15:26.690440Z | 2025-12-23T13:15:26.944184Z | null         | null          |

```questdb-sql title="Abort backup"
BACKUP ABORT;
```

### Restore

To restore, create a `_backup_restore` file in the QuestDB install root. It is a
properties file with the object store configuration and optional selector
fields. On startup, QuestDB reads this file, selects the requested backup
timestamp (or the latest available), downloads the backup data, and reconstructs
the local database state.

```
backup.object.store=s3::bucket=my-bucket;region=eu-west-1;access_key_id=...;secret_access_key=...;
backup.instance.name=gentle-forest-orchid
backup.restore.timestamp=2024-08-24T12:34:56.789123Z
```

Notes:

- `backup.object.store` is required unless a default object store is already
  configured.
- `backup.instance.name` is required when multiple instance names exist in the
  bucket.
- `backup.restore.timestamp` is optional; omit it to restore the latest backup.

Restart QuestDB. If restore succeeds, `_backup_restore` is removed
automatically. Restore fails if the target database is not empty.

## QuestDB OSS: manual backups with checkpoints

The OSS workflow relies on the `CHECKPOINT` mode and external snapshot or file
copy tools. When in `CHECKPOINT` mode, QuestDB remains available for reads and
writes, but some housekeeping tasks are paused. This is safe in principle, but
database writes may consume more space than normal. When the database exits
`CHECKPOINT` mode, it resumes the housekeeping tasks and reclaims disk space.

You must create a copy of the database using a tool of your choice. These are
some suggestions:

- Cloud snapshot, e.g. EBS volume snapshot on AWS, Premium SSD Disk snapshot on
  Azure etc
- On-prem backup tools and software you typically use
- Basic command line tools, such as `cp` or `rsync`

### Data backup checklist

Before backing up QuestDB, consider these items:

#### Pick a good time

We recommend that teams take a database backup when the database write load is
at its lowest. If the database is under constant write load, a helpful
workaround is to ensure that the disk has at least 50% free space. The more free
space, the safer it is to enter the checkpoint mode.

#### Determine backup frequency

We recommend daily backups.

If you are using QuestDB Enterprise replication, the frequency of backups
impacts the time it takes to create a new
[replica instance](/docs/operations/replication/).
Creating replicas involves choosing a backup and having the replica replay WAL
files until it has caught up. The older the backup, the more WAL files the
replica will have to replay, and thus there is a longer time-frame. For these
reasons, we recommend a daily backup schedule to keep the process rapid.

#### Choose your data copy method

When choosing the right copy method, consider the following goals:

- Minimize the time QuestDB spends in checkpoint mode
- Ensure that the copy time remains sustainable as the database grows

QuestDB backup lends itself relatively well to all types of differential data
copying. Due to time partitioning, older data is often unmodified, at both block
and file levels.

##### Cloud snapshots

If you're using cloud disks, such as EBS on AWS, SSD on Azure, or similar, we
strongly recommend using their existing cloud _snapshot_ infrastructure. The
advantages of this approach are that:

- Cloud snapshots minimizes the time QuestDB spends in checkpoint mode
- Cloud snapshots are differential and can be restored cleanly

See the following guides for volume snapshot creation on the following cloud
platforms:

- [AWS](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-creating-snapshot.html) -
  creating EBS snapshots
- [Azure](https://docs.microsoft.com/en-us/azure/virtual-machines/snapshot-copy-managed-disk?tabs=portal) -
  creating snapshots of a virtual hard disk
- [GCP](https://cloud.google.com/compute/docs/disks/create-snapshots) - working
  with persistent disk snapshots

Cloud snapshot-based systems usually break down their backup process into two
steps:

1. Take a snapshot
2. Back up the snapshot

**Exit the `CHECKPOINT` mode as soon the snapshoting stage is complete.**

Specifically, exit checkpoint mode at the following snapshot stage:

| Cloud Provider                | State               | Exit checkpoint mode                                     |
| ----------------------------- | ------------------- | -------------------------------------------------------- |
| **Google Cloud** (GCP)        | RUNNING (UPLOADING) | When RUNNING substate changes from CREATING to UPLOADING |
| **Amazon Web Services** (AWS) | PENDING             | When status is PENDING                                   |
| **Microsoft Azure**           | PENDING             | Before the longer running "CREATING" stage               |

##### Volume snapshots

When the database is on-prem, we recommend using the existing file system backup
tools. Volume snapshots by, for example, can be taken via LVM:
([LVM](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/7/html/logical_volume_manager_administration/lvm_overview)).

##### File copy

If filesystem or volume snapshots are not available, consider using a file copy
method to back up the QuestDB server root directory. We recommend using a copy
tool that can skip copying files based on the modification date. One such
popular tool to accomplish this is [rsync](https://linux.die.net/man/1/rsync).

Leaving this step, you should know:

- Whether your method is cloud or file-system snapshot-based, or file copy-based
- When to enter and exit checkpoint mode
- How to perform your snapshot/backup method

### Steps in the backup procedure

While explaining the steps, we'll assume the database root directory is
`/var/lib/questdb`.

#### Enter checkpoint mode

To enter the checkpoint mode:

```questdb-sql title="Creating a Checkpoint"
CHECKPOINT CREATE
```

You can create only one checkpoint. Attempting to create a second checkpoint
will fail.

#### Check checkpoint status

You can double-check at any time that the database is in the checkpoint mode:

```questdb-sql title="Checking Checkpoint Status"
SELECT * FROM checkpoint_status();
```

Having confirmed that QuestDB has entered the checkpoint mode, we now create the
backup.

#### Take a snapshot or begin file copy

After a checkpoint is created and before it is released, you may safely access
the file system using tools external to the database instance. In other words,
you're now OK to begin your backup.

If your data copy method is a volume snapshot, you can exit the checkpoint mode
as soon as the snapshot is taken (which takes a minute or two).

**Make sure to back up the entire server root directory, including the `db`,
`snapshot`, and all other directories.**

File copy may take longer to back up files compared to snapshot. You will have
to wait until the data transfer is fully complete before exiting checkpoint
mode.

**It is very important to exit the checkpoint mode regardless of whether the
copy operation succeeded or failed!**

#### Exit checkpoint mode

With your backup complete, exit checkpoint mode:

```questdb-sql title="Releasing a Checkpoint"
CHECKPOINT RELEASE
```

This concludes the backup process.

Now, with our additional copy, we're ready to restore QuestDB.

### Restore to a saved checkpoint

Restoring to a checkpoint will restore the entire database.

Follow these steps:

- Ensure your QuestDB version matches the one that did the backup
- Restore QuestDB root directory contents (`/var/lib/questdb/`) from the backup
- Touch the `_restore` file
- Start the database using the restored root directory

#### Database versions

Restoring data is only possible if the backup and restore QuestDB versions have
the same major version number, for example: `8.1.0` and `8.1.1` are compatible.
`8.1.0` and `7.5.1` are not compatible.

#### Restore the root directory

When using cloud tools, create a new disk from the snapshot. The entire disk
contents of the original database will be available when the compute instance
starts.

If you are not using cloud tools, you have to make sure that you restore the
root from the backup using your own tools of choice!

#### The trigger file

When you are starting the database from the backup for the first time, the
database must perform a restore procedure. This ensures the data is consistent
and can be read and written. It only takes place on startup, and requires a
specific blank file to exist as the indication of user intent.

Touch the `_restore` file in the root directory. The following command will do
the trick:

```bash
touch /var/lib/questdb/_restore
```

#### Start the database

Start the database using the root directory as usual. When the `_restore` file
is present, the database will perform the restore procedure. There are two
possible outcomes:

- Restore is successful: the database continues to run normally and is ready to
  use; the `_restore` file is removed to prevent the same procedure running
  twice
- Restore fails: the database exits and the `_restore` file remains in place. An
  error message appears in `stderr`. If it can be resolved, starting the
  database again will retry the restore procedure

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
[filesystem compatibility](/docs/operations/capacity-planning/#supported-filesystems)
section for more information.

## Further reading

To learn more, see the
[`CHECKPOINT` SQL reference documentation](/docs/reference/sql/checkpoint/).
