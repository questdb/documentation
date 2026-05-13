---
title: BACKUP keyword
sidebar_label: BACKUP
description: "BACKUP SQL keyword reference documentation. Applies to QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Object storage backups with incremental and point-in-time recovery support.
</EnterpriseNote>

`BACKUP` - start and abort incremental backups to object storage.

_Looking for a detailed guide on backup creation and restoration? Check out our
[Backup and Restore](/docs/operations/backup/) guide!_

## Syntax

```questdb-sql
BACKUP DATABASE;

BACKUP ABORT;
```

### BACKUP DATABASE

Starts a new incremental backup. Returns immediately with the backup timestamp.
The backup runs asynchronously in the background.

### BACKUP ABORT

Aborts a running backup. Returns a single row:

| Column | Type | Description |
|--------|------|-------------|
| `status` | `VARCHAR` | `aborted` or `not running` |
| `backup_id` | `TIMESTAMP` | Timestamp of aborted backup, or `NULL` |

Example when backup was running:

| status  | backup_id                   |
|---------|-----------------------------|
| aborted | 2024-01-15T10:30:00.000000Z |

Example when no backup was running:

| status      | backup_id |
|-------------|-----------|
| not running | NULL      |

## Monitoring backups

Use the `backups()` table function to monitor backup progress and history:

```questdb-sql
SELECT * FROM backups();
```

Returns:

| Column | Type | Description |
|--------|------|-------------|
| `status` | `VARCHAR` | Current status (see below) |
| `progress_percent` | `INT` | Completion percentage (0-100) |
| `start_ts` | `TIMESTAMP` | When the backup started |
| `end_ts` | `TIMESTAMP` | When the backup completed (NULL if running) |
| `backup_error` | `VARCHAR` | Error message if backup failed |
| `cleanup_error` | `VARCHAR` | Error message if cleanup failed |

### Status values

`backup in progress`, `backup complete`, `backup failed`, `cleanup in progress`,
`cleanup complete`, `cleanup failed`

See [status values](/docs/operations/backup/#monitor-and-abort) in the Backup
guide for descriptions and recommended actions.

## Examples

Start a backup:

```questdb-sql
BACKUP DATABASE;
```

Result:

| backup_timestamp            |
|-----------------------------|
| 2024-08-24T12:34:56.789123Z |

Check current backup status:

```questdb-sql
SELECT status, progress_percent FROM backups() ORDER BY start_ts DESC LIMIT 1;
```

## Configuration

Backups must be configured before use. At minimum:

```conf
backup.enabled=true
backup.object.store=s3::bucket=my-bucket;region=eu-west-1;...
```

See the [Backup and Restore guide](/docs/operations/backup/#configure) for full
configuration options.

## Limitations

- Only one backup can run at a time
- Primary and replica backups are separate (each has its own `backup_instance_name`)

## See also

- [Backup and Restore guide](/docs/operations/backup/) - Complete backup
  configuration and restore procedures
- [CHECKPOINT](/docs/query/sql/checkpoint/) - Manual checkpoint mode for
  QuestDB OSS backups
