---
title: BACKUP keyword
sidebar_label: BACKUP
description: BACKUP SQL keyword reference documentation.
---

Creates a backup for one, several, or all database tables.

---

:::caution

**The BACKUP statement is deprecated since QuestDB version 7.3.3 on all
operating systems except Windows.** We recommend the
[SNAPSHOT](/docs/reference/sql/snapshot/) statements instead.

:::

---

## Syntax

![Flow chart showing the syntax of the BACKUP keyword](/img/docs/diagrams/backup.svg)

## Backup directory

Backing up a database or tables requires a **backup directory** which is set
using the `cairo.sql.backup.root` [configuration key](/docs/configuration/) in a
[server.conf](/docs/concept/root-directory-structure/#serverconf) file:

```shell title="server.conf"
cairo.sql.backup.root=/Users/UserName/Desktop
```

The **backup directory** can be on a disk local to the server, a remote disk or
a remote filesystem. QuestDB will enforce that the backup is only written in a
location relative to the `backup directory`. This is a security feature to
disallow random file access by QuestDB.

The tables will be written in a directory with today's date with the default
format `yyyy-MM-dd` (e.g., `2020-04-20`). A custom date format can be specified
using the `cairo.sql.backup.dir.datetime.format`
[configuration key](/docs/configuration/):

```shell title="server.conf"
cairo.sql.backup.dir.datetime.format=yyyy-dd-MM
```

Given a `BACKUP` query run on `2021-02-25`, the data and metadata files will be
written following the
[db directory structure](/docs/concept/root-directory-structure/#db)

```filestructure title="/path/to/backup_directory"
├── 2021-02-25
│   ├── table1
│   │   ├── ...
│   ├── table2
│   │   ├── ...
│   ├── table3
│   ...
```

If a user performs several backups on the same date, each backup will be written
a new directory. Subsequent backups on the same date will look as follows:

```filestructure title="/path/to/backup_directory"
├── 2021-02-22    'first'
├── 2021-02-22.1  'second'
├── 2021-02-22.2  'third'
├── 2021-02-24    'first new date'
├── 2021-02-24.1  'first new date'
│   ...
```

## Creating a full backup

When creating a backup in QuestDB, you can specify that the whole database or
specific tables should be backed up. This process will create a backup in the
`backup directory`.

A backup can then be triggered via [SQL command](/docs/reference/sql/backup/)
and the backup is complete as soon as the SQL query has finished executing:

```questdb-sql
-- backup whole database
BACKUP DATABASE;
-- backup a specific table
BACKUP TABLE my_table;
```

Note that calling `BACKUP TABLE <table_name>` will only copy table data and
metadata to the destination folder. This form of backup will not copy entire
database configuration files required to perform a complete database restore.

Alternatively, the [REST API](/docs/reference/api/rest/#exec---execute-queries)
can be used to execute the SQL for a database backup:

```bash title="Backing up a database via curl"
curl -G --data-urlencode "query=BACKUP DATABASE;" \
  http://localhost:9000/exec
```

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

```questdb-sql title="Single table"
BACKUP TABLE table1;
```

```questdb-sql title="Multiple tables"
BACKUP TABLE table1, table2, table3;
```

```questdb-sql title="All tables"
BACKUP DATABASE;
```

The following example sets up a cronjob which triggers a daily backup via REST
API:

```bash
# this will add crontab record that will run trigger at backup every-day at 01:00 AM
# copy paste this into server terminal
crontab -l | { cat; echo "0 1 * * * /usr/bin/curl --silent -G --data-urlencode 'query=BACKUP DATABASE;' http://localhost:9000/exec &>/dev/null"; } | crontab -
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
