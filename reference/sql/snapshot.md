---
title: SNAPSHOT keyword
sidebar_label: SNAPSHOT
description: SNAPSHOT SQL keyword reference documentation.
---

Prepares the database for a full backup or a filesystem (disk) snapshot.

**Snapshot statements are not supported on Windows OS.**

## Syntax

![Flow chart showing the syntax of the SNAPSHOT keyword](/img/docs/diagrams/snapshot.svg)

## Snapshot process

Snapshot recovery mechanism requires a **snapshot instance ID** to be specified
using the `cairo.snapshot.instance.id`
[configuration key](/docs/configuration/):

```shell title="server.conf"
cairo.snapshot.instance.id=your_id
```

A snapshot instance ID may be an arbitrary string value, such as string
representation of a UUID.

Database snapshots may be used in combination with filesystem snapshots or
together with file copying for a full data backup. Collecting a snapshot
involves the following steps:

1. Run `SNAPSHOT PREPARE` statement to acquire reader locks for all database
   tables, create table metadata file copies in the `snapshot` directory, and
   flush the committed data to disk.
2. Start a filesystem snapshot or copy the
   [root directory](/docs/concept/root-directory-structure/) to the backup
   location on the disk. Refer to the [next section](#filesystem-snapshot) to
   learn how to create a filesystem snapshot on the most common cloud providers.
3. Run `SNAPSHOT COMPLETE` statement to release the reader locks and delete the
   metadata file copies.

For some cloud vendors, filesystem snapshot creation operation is asynchronous,
i.e. the point-in-time snapshot is created immediately, as soon as the operation
starts, but the end snapshot artifact may become available later. In such case,
the `SNAPSHOT COMPLETE` statement (step 3) may be run without waiting for the
end artifact, but once the snapshot creation has started.

In case you prefer full backups over filesystem snapshots, you should keep in
mind that the database will retain older partition and column file files on disk
until `SNAPSHOT COMPLETE`. This means that you may run out of disk space if your
disk doesn't have enough free space at the time you call `SNAPSHOT PREPARE`.

## Filesystem snapshot

The most common ways to perform cloud-native filesystem snapshots are described
in the following resources, which rely on similar steps but have minor
differences in terminology and services:

- [AWS](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-creating-snapshot.html) -
  creating EBS snapshots
- [Azure](https://docs.microsoft.com/en-us/azure/virtual-machines/snapshot-copy-managed-disk?tabs=portal) -
  creating snapshots of a virtual hard disk
- [GCP](https://cloud.google.com/compute/docs/disks/create-snapshots) - working
  with persistent disk snapshots

## Snapshot recovery

In case of a full backup, you should also delete the old root directory and copy
the files from your backup to the same location or, alternatively, you can point
the database at the new root directory.

To start the database on a filesystem snapshot, you should make sure to
configure a different snapshot instance ID.

When the database starts, it checks the current instance ID and the ID stored in
the `snapshot` directory, if present. On IDs mismatch, the database runs a
snapshot recovery procedure restoring the metadata files from the snapshot. When
this happens, you should see something like the following in the server logs:

```
2022-03-07T08:24:12.348004Z I i.q.g.DatabaseSnapshotAgent starting snapshot recovery [currentId=`id2`, previousId=`id1`]
...
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
