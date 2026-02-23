---
title: Backup and restore
sidebar_label: Backup and restore
description:
  Instructions and advice on performing backup/restore operations on QuestDB
---

You should back up QuestDB to be prepared for the case where your original
database or data is lost, or if your database or table is corrupted. Backups are
also required to create [replica instances](/docs/high-availability/setup/) in
QuestDB Enterprise.

## Overview

QuestDB supports two backup methods:

- **Built-in incremental backup** (Enterprise only): Fully automated—configure
  once, set a schedule, and backups run automatically. Supports point-in-time
  recovery to any backup timestamp.

- **[Manual checkpoint backup](#questdb-oss-manual-backups-with-checkpoints)**
  (OSS and Enterprise): Relies on external tools to copy data. Requires manual
  coordination: `CHECKPOINT CREATE` → copy data with external tools →
  `CHECKPOINT RELEASE`. Works well with cloud disk snapshots (AWS EBS, Azure
  disks, etc.) where you simply trigger a snapshot. For on-premises environments
  without snapshot capabilities, you'll need external tools or custom scripts
  (e.g., rsync), which do not provide point-in-time recovery.

## QuestDB Enterprise: built-in backup and restore

QuestDB Enterprise provides an incremental backup system that stores your data
in object storage. Backups are incremental—only changed data is uploaded—making
them fast and bandwidth-efficient. You can monitor progress and check for errors
while backups run.

### Prerequisites

#### License

Built-in backup requires QuestDB Enterprise. This feature is not available in
the open source version. See
[QuestDB Enterprise](/enterprise/) for licensing information.

#### Supported storage backends

Backup supports the following storage backends:

- **Amazon S3** and S3-compatible storage (MinIO, etc.)
- **Azure Blob Storage**
- **Google Cloud Storage (GCS)**
- **Filesystem** - Local or network-attached storage (NFS, etc.). Backup is not
  sensitive to the underlying filesystem type.

See [Configure object storage](/docs/high-availability/setup/#1-configure-object-storage)
for connection string formats.

#### Permissions

The backup process requires write access to the target storage. Authentication
is optional—you can use instance credentials (IAM roles, managed identities) or
provide explicit credentials in the connection string.

#### Network

Network requirements depend on your chosen storage backend. Ensure QuestDB can
reach the storage endpoint on the appropriate port (typically HTTPS/443 for
cloud storage).

#### Storage capacity

Plan your backup storage before starting. A safe estimate is **2× your
uncompressed database size**. See
[Estimate backup storage](#estimate-backup-storage) for detailed calculations.

### Quick start

Minimal configuration to enable backups:

```conf
backup.enabled=true
backup.object.store=s3::bucket=my-bucket;region=eu-west-1;access_key_id=...;secret_access_key=...;
```

Then run `BACKUP DATABASE;` in SQL. See [Run a backup](#run-a-backup) for details.

### Configure

#### Backup retention

Control how many backups to keep before automatic cleanup removes older ones:

```conf
backup.cleanup.keep.latest.n=7
```

#### Filesystem backups

For local testing or air-gapped environments, you can back up to a local
filesystem path instead of cloud object storage:

```conf
backup.object.store=fs::root=/mnt/backups;atomic_write_dir=/mnt/backups/atomic;
```

The `atomic_write_dir` parameter is required for filesystem backends and
specifies a directory for atomic write operations during backup.

#### Configuration reference

| Property | Description | Default |
|----------|-------------|---------|
| `backup.enabled` | Enable backup functionality | `false` |
| `backup.object.store` | Object store connection string | None (required) |
| `backup.schedule.cron` | Cron expression for [scheduled backups](#scheduled-backups) | None (manual only) |
| `backup.schedule.tz` | <a href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones" target="_blank">IANA timezone</a> for cron [schedule](#scheduled-backups) | `UTC` |
| `backup.cleanup.keep.latest.n` | Number of backups to retain | `5` |
| `backup.compression.level` | Compression level (1-22) | `5` |
| `backup.compression.threads` | Threads for compression | CPU count |
| `backup.enable.partition.hashes` | Compute BLAKE3 hashes during backup | `false` |
| `backup.verify.partition.hashes` | Verify hashes during restore | `false` |

### Run a backup

Once configured, you can run a backup at any time using the following command:

```questdb-sql title="Backup database"
BACKUP DATABASE;
```

Example output:

| backup_timestamp              |
| ----------------------------- |
| 2024-08-24T12:34:56.789123Z   |

The backup captures the committed database state at the moment the command
executes. In-flight transactions are not included.

### Monitor and abort

You can monitor backup progress and history using the `backups()` table function:

```questdb-sql title="Backup history"
SELECT * FROM backups();
```

Example output:

| status              | progress_percent | start_ts                    | end_ts                      | backup_error     | cleanup_error |
|---------------------|------------------|-----------------------------|-----------------------------|------------------|---------------|
| backup complete     | 100              | 2025-07-30T12:49:30.554262Z | 2025-07-30T16:19:48.554262Z |                  |               |
| backup complete     | 100              | 2025-08-06T14:15:22.882130Z | 2025-08-06T17:09:57.882130Z |                  |               |
| backup failed       | 35               | 2025-08-20T11:58:03.675219Z | 2025-08-20T12:14:07.675219Z | connection error |               |
| backup in progress  | 10               | 2025-08-27T15:42:18.281907Z |                             |                  |               |
| cleanup in progress | 100              | 2025-08-13T13:37:41.103729Z | 2025-08-13T16:44:25.103729Z |                  |               |

Status values:

| Status                | Meaning                          | Action                          |
|-----------------------|----------------------------------|---------------------------------|
| `backup in progress`  | Backup is currently running      | Wait or run `BACKUP ABORT`      |
| `backup complete`     | Backup finished successfully     | None required                   |
| `backup failed`       | Backup encountered an error      | Check `backup_error` column     |
| `cleanup in progress` | Old backup data is being removed | Wait for completion             |
| `cleanup complete`    | Cleanup finished successfully    | None required                   |
| `cleanup failed`      | Cleanup encountered an error     | Check `cleanup_error` column    |

To abort a running backup:

```questdb-sql title="Abort backup"
BACKUP ABORT;
```

### Scheduled backups

You can configure automatic scheduled backups using cron syntax. The example
below runs a backup every day at midnight UTC.

```conf
backup.schedule.cron=0 0 * * *
backup.schedule.tz=UTC
```

#### Cron format

QuestDB uses the standard **5-field cron format**:

```text
              FIELD            VALUES             SPECIAL CHARS
┌──────────── minute ───────── 0-59 ───────────── * , - /
│ ┌────────── hour ─────────── 0-23 ───────────── * , - /
│ │ ┌──────── day of month ─── 1-31 ───────────── * , - / L W
│ │ │ ┌────── month ────────── 1-12 or JAN-DEC ── * , - /
│ │ │ │ ┌──── day of week ──── 0-7 or SUN-SAT ─── * , - / L #
│ │ │ │ │
* * * * *
```

Special character meanings:

- `*` — matches any value
- `,` — separates multiple values (e.g., `1,15` for 1st and 15th)
- `-` — defines a range (e.g., `1-5` for Monday through Friday)
- `/` — specifies intervals (e.g., `*/15` for every 15 units)
- `L` — last day of the month, or last specific weekday (e.g., `5L` = last Friday)
- `W` — nearest weekday to the given day (e.g., `15W` = nearest weekday to the 15th)
- `#` — nth weekday of the month (e.g., `5#3` = third Friday)

For day-of-week, 0 and 7 both represent Sunday; 1-6 represent Monday through Saturday.

:::tip
Use [crontab.guru](https://crontab.guru/) to build and validate your cron expressions.
:::

#### Timezone

The `backup.schedule.tz` property accepts any valid
<a href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones" target="_blank">IANA timezone name</a>
(e.g., `America/New_York`, `Europe/London`) or `UTC`.

If `backup.schedule.tz` not specified, the default is `UTC`.

#### Resetting schedule without restart

The `backup.schedule.cron` and `backup.schedule.tz` settings can be modified in `server.conf` and hot-reloaded without
restarting the server:

```questdb-sql
SELECT reload_config();
```

You can also use this to enable and disable the schedule by adding or commenting out the `backup.schedule.cron` config setting.


### Backup instance name

Each QuestDB instance has a backup instance name (three random words like
`gentle-forest-orchid`). This name is generated on the first backup and
organizes backups in the object store under `backup/<backup_instance_name>/`.

To find your instance name, run:

```questdb-sql
SELECT backup_instance_name;
```

Returns `null` if no backup has been run yet.

### Replication WAL cleanup integration

When replication is enabled, the
[WAL cleaner](/docs/high-availability/wal-cleanup/) uses backup manifests to
determine which replicated WAL data in object storage can be safely deleted.
By default, the cleaner retains replication data needed by your most recent
backups, controlled by the
[`backup.cleanup.keep.latest.n`](#backup-retention) setting (default 5), and
deletes the rest. No additional configuration is required — enabling
backups on a replicated instance is sufficient.

### Performance characteristics

Backup is designed to prioritize database availability over backup speed. Key
characteristics:

- **Pressure-sensitive**: Backup automatically throttles itself to avoid
  overwhelming the database instance during normal operations
- **Batch uploads**: Data uploads in batches rather than continuously - you may
  see surges of activity followed by quieter periods in logs
- **Compressed**: Data is compressed before upload to reduce transfer time and
  storage costs
- **Multi-threaded**: Backup uses multiple threads but is deliberately
  throttled to maintain instance reliability

Backup duration depends on data size. Large databases (1TB+) may take several
hours for a full initial backup. Subsequent incremental backups are faster as
only changed data is uploaded.

### Estimate backup storage

A safe estimate for total backup storage is **2× your uncompressed database
size on disk**. This provides headroom for the full backup plus incremental
history and edge cases.

#### How storage accumulates

| Backup type | What's uploaded | Estimated size |
|-------------|-----------------|----------------|
| Initial (full) | Entire database | DB size ÷ 4 (default compression) |
| Incremental | Changed partitions only | Changed data ÷ 4 |

Total storage = full backup + (average incremental × retention count)

The default compression level (5) achieves approximately 4× reduction. Higher
`backup.compression.level` values (up to 22) improve compression at the cost
of CPU time.

#### Partition-level granularity

Partitions are the smallest backup unit. Any modification to a partition—even
a single row or column update—causes the entire partition to be re-uploaded in
the next incremental backup.

This means:

- **Append-only workloads** (typical time-series): Very efficient. Only the
  latest partition changes between backups.
- **Cross-partition updates**: Less efficient. An `UPDATE` without a
  constraining `WHERE` clause touches all partitions, causing them all to be
  re-uploaded.
- **Schema changes**: Column type changes cause affected partitions to be
  re-uploaded.

#### Example calculation

A 500 GB database with daily backups, 7-day retention, and ~5% daily change:

| Component | Calculation | Size |
|-----------|-------------|------|
| Full backup | 500 GB ÷ 4 | 125 GB |
| Daily incremental | 25 GB ÷ 4 | ~6 GB |
| 7 incrementals | 6 GB × 7 | ~42 GB |
| **Total** | | **~170 GB** |

In this example, actual usage (~170 GB) is well under the 2× planning estimate
(1 TB). The 2× rule is intentionally conservative—use it for initial capacity
planning before you know your actual change patterns, then refine based on
observed usage.

#### Check actual usage

To verify your estimates against actual storage, browse your backup data in
the object store. Backups are stored under `backup/<backup_instance_name>/`.

To find your instance name, see [Backup instance name](#backup-instance-name).

### Limitations

- **Database-wide only**: Backup captures the entire database. You cannot
  exclude tables or backup selected tables individually. Every backup includes
  all user tables, materialized views, and metadata.
- **One backup at a time**: Only one backup can run at any given time. Starting
  a new backup while one is running will return an error.
- **Primary and replica backups are separate**: Each QuestDB instance has its
  own [`backup_instance_name`](#backup-instance-name), so backing up both
  a primary and its replica creates two separate backup sets in the object
  store. Typically, backing up the primary is sufficient since replicas sync
  from the same data.
- **Same backup object store for all nodes**: When using replication, all
  nodes in the cluster should use the same `backup.object.store` connection
  string. The [WAL cleaner](/docs/high-availability/wal-cleanup/) reads
  backup manifests from every node to determine what replication data can be
  safely deleted. If nodes back up to different object stores, the cleaner
  cannot see all manifests and will not trigger correctly.

### Backup validation

Backup integrity is verified during restore, not as a standalone operation.

#### Verification during restore

QuestDB performs the following checks when restoring:

- **Transaction log verification**: Header, hash, and size validation of
  transaction log entries (always enabled)
- **Partition hash verification**: Optional BLAKE3 hash comparison for each
  file in every partition
- **Manifest validation**: Version compatibility and path safety checks

To enable partition hash verification, set these properties in `server.conf`:

```conf
backup.enable.partition.hashes=true    # Compute hashes during backup
backup.verify.partition.hashes=true    # Verify hashes during restore
```

If verification fails, restore stops immediately with an error such as:
`hash mismatch [path=col1.d, expected=..., actual=...]`

#### What's not available

- No standalone `VALIDATE BACKUP` command
- No dry-run restore option
- Object store integrity relies on the storage provider (e.g., S3's built-in
  checksums)

### Restore

Restore is fast—approximately 1.8 TiB can be restored in under 20 minutes,
depending on network bandwidth and storage performance.

:::caution

Enterprise backup restore uses a different trigger file (`_backup_restore`) than
OSS checkpoint restore (`_restore`). Do not confuse these two mechanisms.

:::

To restore from an object store backup, create a `_backup_restore` file in the
QuestDB install root. This is a properties file with the object store
configuration and optional selector fields. On startup, QuestDB reads this file,
selects the requested backup timestamp (or the latest available), downloads the
backup data, and reconstructs the local database state.

```conf
backup.object.store=s3::bucket=my-bucket;region=eu-west-1;access_key_id=...;secret_access_key=...;
backup.instance.name=gentle-forest-orchid
backup.restore.timestamp=2024-08-24T12:34:56.789123Z
```

Parameters:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `backup.object.store` | Sometimes | Object store connection string; required unless already specified in `server.conf` |
| `backup.instance.name` | Sometimes | Required when multiple instance names exist in the bucket; see [Backup instance name](#backup-instance-name) |
| `backup.restore.timestamp` | No | Timestamp for point-in-time recovery; omit for latest backup |

#### Point-in-time recovery

Use `backup.restore.timestamp` to restore to a specific point in time. QuestDB
finds the most recent successful backup at or before the specified timestamp.

To find available backup timestamps, query the source instance:

```questdb-sql
SELECT start_ts FROM backups() WHERE status = 'backup complete';
```

You can also specify an arbitrary timestamp (e.g., just before an accidental
deletion). QuestDB restores from the nearest available backup before that time.

If no backup exists at or before the specified timestamp, QuestDB fails to start
with the error: `backup restore error: No backup timestamp found that is <=`.

:::warning

Restore requires an empty database directory. If the target database already
has data (indicated by the presence of `db/.data_id`), restore fails with:
"The local database is not empty." Use a fresh installation directory for
restore operations.

:::

The QuestDB version performing the restore must have the same major version as
the version that created the backup (e.g., 8.1.0 and 8.1.1 are compatible).

Restart QuestDB. If restore succeeds, `_backup_restore` is removed automatically.

#### Restore failure recovery

If restore fails, QuestDB creates artifacts to help diagnose and recover:

| Artifact | Purpose |
|----------|---------|
| `.restore_failed/` | Directory containing tables that failed to restore |
| `_restore_failed` | File listing the names of failed tables |

To recover from a failed restore:

1. Check the `.restore_failed/` directory and `_restore_failed` file for details
2. Investigate and fix the underlying issue (connectivity, permissions, etc.)
3. Remove both `.restore_failed/` directory and `_restore_failed` file
4. Restart QuestDB to retry the restore

If you see the error "Failed restore directory found", a previous restore
attempt failed. Remove the artifacts listed above before restarting.

### Create a replica from a backup

You can use a backup to bootstrap a new replica instance instead of relying
solely on WAL replay from the object store. This is faster when the backup is
more recent than the oldest available WAL data.

1. **Ensure the primary is running and has replication configured**

   The primary must have `replication.role=primary` and a configured
   `replication.object.store`.

2. **Create a `_backup_restore` file on the new replica machine**

   Point it to the same backup location used by the primary:

   ```conf
   backup.object.store=s3::bucket=my-bucket;region=eu-west-1;access_key_id=...;secret_access_key=...;
   backup.instance.name=gentle-forest-orchid
   ```

3. **Configure the replica**

   Set `replication.role=replica` and ensure `replication.object.store` points
   to the same object store as the primary.

4. **Start the replica**

   QuestDB restores from the backup first, then switches to WAL replay to catch
   up with the primary.

For more details on replication setup, see the
[replication guide](/docs/high-availability/setup/).

### Troubleshooting

If you encounter errors during backup or restore:

- **ER007 - Data ID mismatch**: The local database and object store have
  different Data IDs. See [error code ER007](/docs/troubleshooting/error-codes/#er007)
  for resolution steps.
- **Backup stuck at 0%**: Check network connectivity to the object store and
  verify credentials are correct.
- **"Failed restore directory found"**: A previous restore attempt failed.
  Remove the `.restore_failed/` directory and `_restore_failed` file, then
  restart. See [Restore failure recovery](#restore-failure-recovery).
- **"The local database is not empty"**: Restore requires an empty database
  directory. Use a fresh installation or remove the existing `db/` directory.

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

We recommend daily backups for disaster recovery purposes.

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

- Cloud snapshots minimize the time QuestDB spends in checkpoint mode
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

**Exit the `CHECKPOINT` mode as soon as the snapshotting stage is complete.**

Specifically, exit checkpoint mode at the following snapshot stage:

| Cloud Provider                | State               | Exit checkpoint mode                                     |
| ----------------------------- | ------------------- | -------------------------------------------------------- |
| **Google Cloud** (GCP)        | RUNNING (UPLOADING) | When RUNNING substate changes from CREATING to UPLOADING |
| **Amazon Web Services** (AWS) | PENDING             | When status is PENDING                                   |
| **Microsoft Azure**           | PENDING             | Before the longer running "CREATING" stage               |

##### Volume snapshots

When the database is on-prem, we recommend using existing file system backup
tools. For example, volume snapshots can be taken via
[LVM](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/7/html/logical_volume_manager_administration/lvm_overview).

##### File copy

If filesystem or volume snapshots are not available, consider using a file copy
method to back up the QuestDB server root directory. We recommend using a copy
tool that can skip copying files based on the modification date. One such
popular tool to accomplish this is [rsync](https://linux.die.net/man/1/rsync).

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

Restoring from a local checkpoint will restore the entire database.

:::caution

OSS checkpoint restore uses the `_restore` trigger file. This is different from
Enterprise backup restore which uses `_backup_restore`.

:::

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

:::warning

**AWS EBS lazy loading**: By default, EBS volumes created from snapshots load
data lazily (on first access), which can cause slow reads after restore. To
mitigate this:

- **Option 1**: Enable [Fast Snapshot Restore (FSR)](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-fast-snapshot-restore.html)
  on the snapshot before creating the volume
- **Option 2**: Pre-warm the volume by reading all blocks after restore:
  ```bash
  sudo fio --filename=/dev/nvme1n1 --rw=read --bs=1M --iodepth=32 \
    --ioengine=libaio --direct=1 --name=volume-initialize
  ```

This issue may also affect other cloud providers with similar snapshot behavior.

:::

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

## Further reading

- [`BACKUP` SQL reference](/docs/query/sql/backup/) - Enterprise backup command syntax
- [`CHECKPOINT` SQL reference](/docs/query/sql/checkpoint/) - OSS checkpoint command syntax
