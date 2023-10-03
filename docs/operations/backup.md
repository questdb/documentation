---
title: Backup and restore
sidebar_label: Backup and restore
description:
  Details and resources which describe how to perform database backup and
  restore operations for a QuestDB instance using point-in-time backups and
  filesystem images.
---

This document provides practical details of using the point-in-time backup
functionality in QuestDB along with filesystem backup as means to prevent data
loss. Alongside backup details, this document describes how to restore from
backups and hints for performing filesystem backups on common cloud providers.

QuestDB provides two strategies for creating backups:

- **Point-in-time** (PIT) backup
- **Filesystem** backup

For a backup to be successful, the database backup must contain database
metadata files and directories (`db`, `config` etc.) See the
[root directory](/docs/concept/root-directory-structure) documentation for
details about these directories.

## Limitations

QuestDB officially supports the following filesystems:

- APFS
- EXT4
- NTFS
- OVERLAYFS (used by Docker)
- XFS

Other file systems supporting
[mmap](https://man7.org/linux/man-pages/man2/mmap.2.html) feature may work with
QuestDB but they should not be used in production, as QuestDB does not run tests
on them.

:::caution

- A backup includes the contents of the database up to the point of executing a
  backup. Any data inserted while a backup is underway is not stored as part of
  the backup.

- Users can't use NFS or a similar distributed filesystem directly with QuestDB,
  but users may copy a backup to such a filesystem after a backup has been made.

:::

## Creating a point-in-time backup

When creating a point-in-time (PIT) backup in QuestDB, you can specify that the
whole database or specific tables should be backed up. This process will create
a backup in a directory specified by the user in the `cairo.sql.backup.root`
[configuration key](/docs/reference/configuration/). For more details on passing
configuration in this manner, see the
[server configuration](/docs/concept/root-directory-structure/#serverconf)
documentation.

```ini title="/path/to/server.conf"
cairo.sql.backup.root=/path/to/backup/dir
```

A backup can then be triggered via [SQL command](/docs/reference/sql/backup/) and
the backup is complete as soon as the SQL query has finished executing:

```questdb-sql
-- backup whole database
BACKUP database;
-- backup a specific table
BACKUP table my_table;
```

Note that calling `BACKUP TABLE <table_name>` will only copy table data and
metadata to the destination folder. This form of backup will not copy entire
database configuration files required to perform a complete database restore.

Alternatively, the [REST API](/docs/reference/api/rest/#exec---execute-queries)
can be used to execute the SQL for a database backup:

```bash title="Backing up a database via curl"
curl -G --data-urlencode "query=BACKUP database;" \
  http://localhost:9000/exec
```

## Creating a filesystem backup (disk snapshot)

:::caution

To run a reliable filesystem backup without database downtime, you should use
`SNAPSHOT PREPARE`/`SNAPSHOT COMPLETE`
[SQL statements](/docs/reference/sql/snapshot/).

:::

The most common ways to perform cloud-native filesystem snapshots are described
in the following resources, which rely on similar steps but have minor
differences in terminology and services:

- [AWS](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-creating-snapshot.html) -
  creating EBS snapshots
- [Azure](https://docs.microsoft.com/en-us/azure/virtual-machines/snapshot-copy-managed-disk?tabs=portal) -
  creating snapshots of a virtual hard disk
- [GCP](https://cloud.google.com/compute/docs/disks/create-snapshots/) - working
  with persistent disk snapshots

## Restoring from a backup

In order to restore a backup, the QuestDB executable must be provided with the
directory location of an existing backup as the **root directory**. This can
done via the `-d` flag as `-d /path/to/backup` when starting up QuestDB.

```bash
java -p /path/to/questdb-<version>.jar \
     -m io.questdb/io.questdb.ServerMain \
     -d /path/to/backup_directory
```

Users who are starting QuestDB via `systemd` or the official AWS AMI may refer
to the
[systemd file](https://github.com/questdb/questdb/blob/master/pkg/ami/marketplace/assets/systemd.service#L21)
for reference. To verify that database information has been successfully
imported, check logs via `journalctl -u questdb` which will contain a list
existing tables.

Docker instances may have a backup directory mounted to the root directory as
follows:

```bash
docker run \
 -p 9000:9000  -p 9009:9009 \
 -p 8812:8812 -p 9003:9003 \
 -v "/path/to/backup_directory:/root/.questdb/" questdb/questdb
```

## Examples

The following example sets up a cronjob which triggers a daily backup via REST
API:

```bash
# this will add crontab record that will run trigger at backup every-day at 01:00 AM
# copy paste this into server terminal
crontab -l | { cat; echo "0 1 * * * /usr/bin/curl --silent -G --data-urlencode 'query=BACKUP database;' http://localhost:9000/exec &>/dev/null"; } | crontab -
```

This example shows how to compress a backup using the `tar` utility. An archive
file `questdb_backup.tar.gz` will be created in the directory that the command
is run:

```bash
tar -zcvf questdb_backup.tar.gz /path/to/backup
```

The backup file can be expanded using the same utility:

```bash
tar -xf questdb_backup.tar.gz
```
