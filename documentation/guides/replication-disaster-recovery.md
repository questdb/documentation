---
title: Database replication disaster recovery
sidebar_label: Replication disaster recovery
description:
  Explains the workflows to recover from the failure of a primary
  or replica instance.
---

Before we dig into it, consider:

- Performing regular [backups](/docs/operations/backup/)
- How to [enable and setup replication](/docs/operations/replication/)
- Learn [replication concepts](/docs/concept/replication/)
- Full
  [replication configuration options](/docs/configuration/#database-replication)

## Failure Scenarios

Things go wrong. It's a fact of software. This section will help you plan to
mitigate against data loss and provide you with the commands you need to run
to recover from a failed database instance and minimise downtime.

Note that the replication features in QuestDB rely on regular scheduled
[backups](/docs/operations/backup/). We recommend daily backups.

These are the core things that can go wrong and the workflows to handle them:

* **Instance degradation**: [Debug workflow](#debug-workflow) to investigate and
fix issues such as low disk, high CPU or memory usage, or network issues.

* **Primary instance failure**: Perform a [new primary election recovery](#new-primary-election-recovery)
to elect a new primary instance and resume availability after a primary instance
failed or is otherwise unreachable.

* **Replica instance rebuild**: Perform a [replica instance rebuild](#replica-instance-rebuild)
to rebuild a replica instance from backup.

* **Data or database corruption**: Restore from backup and perform a
[point-in-time recovery](#point-in-time-recovery) to epartially restore a "primary"
database up to a specific timestamp.

* **Object store corruption**: Perform a [new object store election](#new-object-store-election)
to elect a new object store and resume availability after taking a new object
store online.

## Workflows

### Debug workflow

TODO! TODO! TODO! TODO! TODO!

TODO! TODO! TODO! TODO! TODO!

TODO! TODO! TODO! TODO! TODO!

TODO! TODO! TODO! TODO! TODO!

### New primary election recovery

Should a primary instance fail, you can elect an existing replica instance as the
new primary, or bring up a new primary instance from backup.
Either way, the process is similar.

The next step depend if you still have access to the existing primary instance
to perform a controlled election, or if the primary instance is unavailable and
needs to be recovered in an emergency.

#### Non-emergency controlled election

At times, you may need to elect a new replica even if the current one is still
available.

Examples when you might want to do this include:

* Performing a careful QuestDB version upgrade, while retaining the old version
  available as fallback.

* Upgrading to new hardware

* Moving hardware so it is in a different datacenter for better ingestion
  throughput with lower latency to the ingestion clients.

In such case, first stop the primary instance:

##### Step 1: Stop the primary instance

```bash
$ ssh existing-primary.example.com
$ questdb.sh stop
```

##### Step 2: Complete writes to the object store

The primary writes its WAL data to the configured object store asynchronously.
You now need to start the database in a special mode that completes commiting
(uploading) the WAL data to the object store. You can do this by starting with
the `QDB_REPLICATION_ROLE` environment variable set to `primary-catchup-uploads`,
followed by a regular start.
The process should exit with a status code of `0` if successful.

```bash
$ ssh existing-primary.example.com
$ export QDB_REPLICATION_ROLE="primary-catchup-uploads"
$ questdb.sh start
$ echo $?  # checking the exit code
0
```

In addition to check the exit code, you should also inspect the logs, these
should include an INFO (` I `) message indicating that the upload is complete.

```log
2025-01-20T17:45:38.069686Z I qdb_ent::wal::uploader L1633 completed all WAL uploads to the object store as requested by QDB_REPLICATION_ROLE=primary-catchup-uploads.
```

**Note**: _This step is idempotent, if you're unsure, just start the database
again with the same `QDB_REPLICATION_ROLE` environment variable set._

#### Emergency lossy election

If instead the primary instance is unavailable (offline, irrecoverably crashed
or otherwise unreachable), then you should be aware that there is a risk of
data loss.

Primary instances upload data to the object store asynchronously, after
committing to the WAL data on disk first. You can continue electing a new
primary, but any data that was not uploaded to the object store will be lost
and will not be recoverable at a later point in time.

It is difficult to predict how much data will be lost, but it is likely to be
in the order of seconds to minutes, depending on the degradation of the primary
instance and its network access at the time of failure.

You now need to decide if you want to bring up a new primary database instance
from backup, or elect an existing replica as the new primary.

#### Restoring a new primary from backup

If you would rather bring up a new primary instance from backup, first restore
a [backups](/docs/operations/backup/) onto new hardware.

The backup should be as fresh as possible to minimise start-up time.

At this stage, keep the database instance offline and follow the same steps
as if you were electing an existing replica as the new primary. In other words,
continue with "Step 2: Reconfigure as primary".

#### Electing an existing replica as the new primary

The fastest way to resume availability is to elect an existing replica as the
new primary. This operation will ensure that the new primary is up to date with
the object store, so there is no need to wait.

##### Step 1: Stop the replica instance

Stop the replica instance you want to promote to primary:

```bash
$ ssh existing-db.example.com
$ questdb.sh stop
```

##### Step 2: Reconfigure as primary

Reconfigure the database instance as primary:
```bash
$ ssh existing-db.example.com
$ vim path/to/db/conf/server.conf
```

Edit the config, change the `replication.role` so it reads:

```
replication.role=primary
```

Save and exit the config file.

##### Step 3: Start with the new primary election recovery mode

Restart the database in the "new primary election recovery" mode:

```bash
$ ssh existing-db.example.com
$ export QDB_RECOVERY_TIMESTAMP="latest"
$ questdb.sh start
```

This process performs the following steps:
* Ensures that the instance is up to date with the object store.

* Waits a period of time to check to see if other primary instances are still
running.

* If no other primary instances are found, the instance will be elected as the
the new primary, adopting the state in the object store.

* The instance will then continue running as a "primary" instance, no restart
is required.

#### Future restarts

It is important that the `QDB_RECOVERY_TIMESTAMP` environment variable
is only ever used during a new primary election recovery. It should not be used
during normal restarts.

After a successful re-election, restart as normal:

```bash
$ ssh primary.example.com
$ questdb.sh stop
$ questdb.sh start   # no `QDB_RECOVERY_TIMESTAMP` environment variable
```

### Replica instance rebuild

If a replica instance fails:

* Delete all its state.
* Rebuild it from the most recent [backup](/docs/operations/backup/) of the primary.
* Edit `server.conf` to set `replication.role=replica`.
* Start it as normal.

So long as the `replication.object.store` config is the same as the primary,
it should catch up to the primary and resume replication.

### Point-in-time recovery

To avoid things going very wrong, you should perform regular
[backups](/docs/operations/backup/).

A typical schedule is to back up daily, for example at midnight.

This leaves out a window of time where data could be lost. If the instance
you're recovering is additionally set up as a "primary" instance (
`replication.role=primary` in `server.conf`), then you can perform a
point-in-time recovery immediately after recovering from a backup.

A point-in-time recovery will not recover the database to its latest state.
for that you should perform a [new primary election recovery](#new-primary-election-recovery).
Instead, it will recover up to a specified timestamp. This is useful if you
need to recover to a last known good state, or if you need to recover to a state
before a specific event.

#### Step 1: Restore the backup

Find the backup that is immediately before the point in time you wish to restore.
For example, if you need to restore to 5pm on the 20th of January 2025 and you perform
daily backups at 00:01 am, you should restore the backup from the 20th of January 2025.

```
$ ssh primary.example.com
$ cp -r /path/to/backup /path/to/primary  # or your backup restore tool
```

#### Step 2: Reconfigure replication

At this point, you need to decide how to reconfigure the replication setup.

This depends on why you are performing a point in time recovery.

* If you want to recover a database and make it a primary:
  * Edit `server.conf` and set `replication.role=primary`.
  * Edit the `replication.object.store` to point to a new empty object store location.
    It needs to be different from the original object store location, otherwise
    the database would attempt to overwrite it before its failsafe checks are
    triggered.

* If you are recovering simply for testing purposes and want to disable replication,
simply remove all the `replication.*` configuration from `server.conf`.

$ export QDB_RECOVERY_OBJECT_STORE="s3://my-bucket/path/to/primary"
$ export QDB_RECOVERY_TIMESTAMP="2025-01-20T17:45:38.069686Z"
$ questdb.sh start
```

The `QDB_RECOVERY_TIMESTAMP` environment variable is a UTC timestamp in the
format `YYYY-MM-DDTHH:MM:SS.ssssssZ`. It will recover the database from the
state present after the backup restore, applying transactions from the WAL data
taken from the specified recovery object store for all WAL tables.

Note that it will only work for WAL tables.

Do not use the `QDB_RECOVERY_TIMESTAMP` environment variable during normal
restarts.

Limitations:
* 