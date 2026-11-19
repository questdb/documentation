---
title: List of  QuestDB Error Codes
sidebar_label: QuestDB Error Codes
description:
  A list of error codes that QuestDB may generate, with explanations and suggested actions.
---

## Replication Errors

Error codes may appear during start-up if an instance is misconfigured.

When a primary instance is running, QuestDB checks that other primary instances are not running. 

It does so by keeping a rolling ID locally and in the object store in sync. 

If these two IDs are out of sync, the primary instance will raise an error.

For additional information, refer to the [replication overview](/docs/high-availability/overview), the [replication setup guide](/docs/high-availability/setup), and the [disaster recovery guide](/docs/high-availability/disaster-recovery/).

### ER001

Raised at startup when a node that has just completed a
[point-in-time recovery](/docs/operations/point-in-time-recovery/) is
configured with `replication.role=primary` while its
`replication.object.store` points at a non-empty location.

A recovered node is a new cluster, so the configured location may contain WAL data from a different replication "timeline".

**As such, this error is raised to prevent an overwrite of the existing data.**

To resolve, shut down the database and reconfigure the `replication.object.store` to point to a new empty location. 

Once restarted, if the old location is no longer needed, you can delete it.

### ER002

The database cannot read or write its local copy of the replication sync ID stored in the `_replication_sync_id.d` file.

If you recently recovered the database from a backup, check that the file permissions of the restored directory (and its contents recursively) are readable and writable.

If the error indicates a "Could not read" error, perform a primary migration to recreate it. 

To do so, place an empty `_migrate_primary` file into your databases installation directory - for example, the parent of `conf` and `db` directories.

This will trigger the database instance to resync with the latest state in the object store and restart as primary.

### ER003

When you create a replica from a snapshot that is too old, this error may occur. 

The workflow to enable replication on the primary instance and create replicas is:
* Reconfigure the primary instance with `replication.role=primary` and configure its `replication.object.store` to point to the object store and start it.
* While running, snapshot the primary instance and copy the snapshot and restore it on the replica instance.
* Reconfigure the replica instance with `replication.role=replica` and ensure its `replication.object.store` points to the same object store as the primary. Also, set a new and unique value to the `cairo.snapshot.instance.id` configuration.
* Start the replica instance.

See the [checkpointing](/docs/query/sql/checkpoint/) page for more details
on how to create and restore snapshots.

### ER004

This error is very similar to ER003. 

It indicates that the transactions in the object store and the replica are out of sync.

This can happen if you created the replica from a database that replicated on a different timeline or from a database unrelated to the primary instance.

To resolve this, recreate the replica using a recent primary instance snapshot. 

Use a snapshot you created after enabling replication on the primary instance. 

See the workflow in ER003 for detailed steps.


### ER005

A primary instance started which is not in sync with the configured object store.

Verify the `replication.object.store` configuration and ensure that the object store is not in use by another primary instance.

Alternatively, you might have migrated the primary role to a different
instance which has committed more transactions than the current instance.

If you are certain that the `replication.object.store` configuration is correct and that the object store is not in use by another primary instance, perform
a primary migration.

To do so, place an empty `_migrate_primary` file in your database installation directory, the parent of `conf` and `db` directories.

This will update the primary instance to the latest state from the object
store and have it take over as the new primary instance.

An in-place promotion with
[`SWITCH ROLE TO PRIMARY`](/docs/high-availability/failover/#promote-a-replica-after-a-primary-loss)
runs the same check before it changes anything. A replica that has not yet
applied everything in the object store is refused: it stays a replica and
keeps replicating, `GET /lifecycle` reports the `replication` component as
`DEGRADED`, and the reason is in the server log. Promote it again once it has
caught up.

### ER006

This error occurs when you start a primary instance and discover another instance is already acting as the primary.

This typically happens after an emergency primary migration, usually due to a network partition that separated your database instances.

Before proceeding, check your infrastructure to determine exactly how many primary instances are currently running.

You have the following options:
* Destroy the extra instance
* Reconfigure it as `replication.role=replica` and restart it
* Perform a planned primary migration and resume the primary role on this instance

This error is also the expected outcome when a node that was demoted in place
with [`SWITCH ROLE`](/docs/query/sql/switch-role/) is restarted while
`server.conf` still says `replication.role=primary`. Set `replication.role` to
the node's current role before any restart, see
[Restarts](/docs/high-availability/failover/#restarts).

### ER007

This error indicates a Data ID mismatch between the local database and the backup or replication object store.

Each QuestDB database has a unique Data ID (stored in `<install_root>/db/.data_id`) that identifies it for backup and replication purposes. This error occurs when:

* Attempting to back up to an object store that contains backups from a different database instance
* A replication object store contains data from a different primary instance

To resolve:

* **For backup creation**: Verify the `backup.object.store` points to the correct location for this database instance. If intentionally backing up to a new location, the location must be empty.
* **For replication**: Verify the `replication.object.store` configuration matches the primary instance that owns the data.

Note: Restore operations check for an empty database separately. If the target
database already has a Data ID, restore fails with: "The local database is not
empty. It already has an associated data ID."

#### Starting fresh with a new Data ID

A Data ID is automatically generated when QuestDB first starts with an empty
database. To intentionally start fresh:

**Recommended**: Create a new, empty database directory and configure QuestDB
to use it.

**Alternative**: Delete the existing `.data_id` file (stop QuestDB first):

```bash
# Stop QuestDB first!
rm <install_root>/db/.data_id
# Restart QuestDB - a new Data ID will be generated
```

:::warning

Changing the Data ID on a database with existing data will:
- Break any existing replication configuration
- Make existing backups incompatible for restore
- Cause ER007 errors when connecting to the original object store

:::

See the [Backup and Restore guide](/docs/operations/backup/) for more information.

### ER008

```text
ER008 - Bad replication source. Data ID mismatch. [remote=<data id>, local=<data id>]
```

Raised on a replica when the replication object store it downloads from belongs to another database: the Data ID recorded in the store differs from the replica's own.

To resolve, check that the replica's `replication.object.store` points at the store of its primary. If the replica was built from another database's backup or snapshot, rebuild it from a backup of its primary, see [Create a replica from a backup](/docs/operations/backup/#create-a-replica-from-a-backup).

### ER009

```text
ER009 - replication consistency error: the in-memory replication index sync id has run more than one step ahead of the persisted `_replication_sync_id.d` value, ...
```

Raised on a primary when its replication sync ID in memory is more than one step ahead of the copy in `_replication_sync_id.d`. Uploading the replication index could then corrupt the index in the object store, so the primary stops replicating instead.

This is not a configuration error. Keep the logs, check the disk that holds the database for errors, and contact QuestDB support before restarting the instance.

## Cold Storage Errors

These errors protect a [cold storage](/docs/concepts/cold-storage/) root, which belongs to one database. For the setup, see [Operating cold storage](/docs/operations/cold-storage/).

### ER010

```text
ER010 - Connected to a cold storage root that holds another database's data. The local and cold storage DataIDs do not match [local=<data id>, cold_storage=<data id>].
```

The catalog of a cold storage root records the Data ID of the database that writes the root. An instance of another database refuses that root: it starts, but its cold storage promotion fails, its cold reads fail, and it writes nothing to the root. A restore from a backup that holds cold partitions fails with this error, before it changes the database, when the root belongs to another database.

Common causes:

- Two databases configured with the same `cold.storage.object.store`.
- A database recovered with [point-in-time recovery](/docs/operations/point-in-time-recovery/#cold-storage), which has a new Data ID, pointed at the source root.
- A database whose `.data_id` was deleted or replaced.

To resolve, point `cold.storage.object.store` at the root of this database, or at a new, empty root for a new database. Replicas of a database, and a plain restore of its backup, keep its Data ID and can use its root.

### ER011

```text
promote refused: ER011 - The cold storage root holds data this instance does not have. Restore the database from a backup onto a new cold storage root [table=<table>, coldStorageSeqTxn=<txn>, localSeqTxn=<txn>]
```

Raised when a replica is promoted to primary while one of its tables is behind what the cold storage root has published for it: the root holds data for transactions this instance does not have. [`SWITCH STATUS`](/docs/query/sql/switch-role/) shows the refusal in its `last_refusal` column.

To resolve:

- If the replica is still catching up, wait until its tables have applied the replicated WAL, then promote it again.
- If it cannot catch up, because the transactions it misses are lost, restore the database from a backup onto a new cold storage root.

A table whose WAL transaction numbers restarted on a release before QuestDB Enterprise ENTERPRISE_VERSION_TBD, through `ALTER TABLE ... REBASE WAL` or a `SET TYPE` round trip, can keep the root ahead of the replica and block promotion in the same way. Catching up with the primary is not enough here: promotion goes ahead once the table's `sequencerTxn` in [`wal_tables()`](/docs/query/functions/meta/#wal_tables) reaches the `coldStorageSeqTxn` in the message, which takes new transactions on the table. If you cannot wait for that, restore the database from a backup onto a new cold storage root.

## Operating system error codes

Refer to the [OS error codes](/docs/troubleshooting/os-error-codes/) page for any
file or network related errors that QuestDB may raise.
