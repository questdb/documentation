---
title: Backup and restore
sidebar_label: Backup and restore
description:
  Details and resources which describe backup functionality in QuestDB as means
  to prevent data loss.
---

The recommended QuestDB backup method is to create a
[SNAPSHOT](/docs/reference/sql/snapshot/).

A snapshot:

- Supports both full backup and incremental snapshots
- All OSes except Windows
- Provides both a full data backup as well as filesystem snapshot

It is an easy and reliable way to back up your database.

If you see "backup" indicated, assume we are referencing SNAPSHOT and not BACKUP
unless clearly indicated.

Alternatively, such as for windows users, there is a a more limited - and
deprecated - [BACKUP](/docs/reference/sql/backup/) operation.

- Supports full database or table backup only
- Windows OS only, deprecated on other OSes such as Linux

---

:::caution

- A backup includes the contents of the database up to the point of executing a
  backup. Any data inserted while a backup is underway is not stored as part of
  the backup.

- Users can't use NFS or a similar distributed filesystem directly with QuestDB,
  but users may copy a backup to such a filesystem after a backup has been made.

:::

---

## Supported filesystems

QuestDB open source supports the following filesystems:

- APFS
- EXT4
- NTFS
- OVERLAYFS (used by Docker)
- XFS
- ZFS

Other file systems supporting
[mmap](https://man7.org/linux/man-pages/man2/mmap.2.html) feature are untested
but may work with QuestDB.

They should not be used in production.