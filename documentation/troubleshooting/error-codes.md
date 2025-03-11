---
title: List of  QuestDB Error Codes
description:
  A list of error codes that QuestDB may generate, with explanations and suggested actions.
---

# Replication Errors

Most of the error codes below will happen during start-up if an instance is misconfigured.
When a primary instance is running it checks that other primary instances are not running.
It does so by keeping a rolling ID locally and in the object store in sync.
If these two IDs are out of sync, the primary instance will raise an error.

You may want to refer to the [replication overview](/docs/concept/replication) and [replication setup guide](/docs/operations/replication), especially its "Disaster Recovery" section.

## ER001
The database performed a point in time recovery that has completed successfully.
The database is also configured with `replication.role=primary`, however the configured 
object store is not empty. This error is raised to prevent overwriting existing data
since the configured location contains WAL data from a different replication "timeline."

To resolve, shut down the database and reconfigure the `replication.object.store` to point to a new empty location. Once restarted, if the old location is no longer needed, you can delete it.

## ER002
The database cannot read or write its local copy of the replication sync ID stored in the `_replication_sync_id.d` file.

If you recently recovered the database from a backup, check that the file permissions of the restored directory (and its contents recursively) are readable and writable.

If the error indicates a "Could not read" error,
you should perform a primary migration to recreate it. You can do this by
placing an empty `_migrate_primary` file in your database installation directory (i.e. the parent of `conf` and `db` directories).
This will trigger the database instance to resync with the latest state in the object store and restart as primary.

## ER003
This error usually occurs when you create a replica from a snapshot that is too old.

The workflow to enable replication on the primary instance and create replicas is:
* Reconfigure the primary instance with `replication.role=primary` and configure its `replication.object.store` to point to the object store and start it.
* While running, snapshot the primary instance and copy the snapshot and restore it on the replica instance.
* Reconfigure the replica instance with `replication.role=replica` and ensure its `replication.object.store` points to the same object store as the primary. Also, set a new and unique value to the `cairo.snapshot.instance.id` configuration.
* Start the replica instance.

See the [checkpointing](https://questdb.com/docs/reference/sql/checkpoint/) page for more details
on how to create and restore snapshots.

## ER004

This error is very similar to ER003. It indicates that the transactions in the object store and the replica are out of sync.
This can happen if the replica was created from a database that was replicated on a different timeline (e.g. a database that is unrelated
to the primary instance).

To resolve this, recreate the replica from a recent snapshot of the primary instance:
The most recent snapshot that was taken _after_ replication was first enabled on the primary instance. For details, refer to the workflow detailed in ER003.

## ER005

You have started a primary instance that is not in sync with the configured object store.

Verify the `replication.object.store` configuration and ensure that the object store is not in use by another primary instance.

Alternatively, you might have migrated the primary role to a different
instance which has committed more transactions than the current instance.

If you are certain that the `replication.object.store` configuration is correct and that the object store is not in use by another primary instance, you can perform
a primary migration by placing an empty `_migrate_primary` file in your database installation directory (i.e. the parent of `conf` and `db` directories).

This will update the primary instance to the latest state from the object
store and have it take over as the new primary instance.

## ER006

This error occurs when a primary instance is started and it detects that another instance has already taken over the primary replication role.

This is usually caused by a network partition between following an emergency primary migration.

You should assess the situation and determine how many primary instances
are actually running.

You have the following options:
* Destroy this instance.
* Reconfigure it as `replication.role=replica` and restart it.
* Perform a planned primary migration and resume the primary role on this instance.
