---
title: List of  QuestDB Error Codes
sidebar_label: QuestDB Error Codes
description:
  A list of error codes that QuestDB may generate, with explanations and suggested actions.
---

# Replication Errors

Error codes may appear during start-up if an instance is misconfigured.

When a primary instance is running, QuestDB checks that other primary instances are not running. 

It does so by keeping a rolling ID locally and in the object store in sync. 

If these two IDs are out of sync, the primary instance will raise an error.

For additional information, refer to the [replication overview](/docs/high-availability/overview) and [replication setup guide](/docs/high-availability/setup), especially its "Disaster Recovery" section.

## ER001

This code indicates that a point in time recovery completed successfully.

It confirms that the database is configured with `replication.role=primary`, and that the associated object store is not empty. 

However, the configured location may contain WAL data from a different replication "timeline".

**As such, this error is raised to prevent an overwrite of the existing data.**

To resolve, shut down the database and reconfigure the `replication.object.store` to point to a new empty location. 

Once restarted, if the old location is no longer needed, you can delete it.

## ER002

The database cannot read or write its local copy of the replication sync ID stored in the `_replication_sync_id.d` file.

If you recently recovered the database from a backup, check that the file permissions of the restored directory (and its contents recursively) are readable and writable.

If the error indicates a "Could not read" error, perform a primary migration to recreate it. 

To do so, place an empty `_migrate_primary` file into your databases installation directory - for example, the parent of `conf` and `db` directories.

This will trigger the database instance to resync with the latest state in the object store and restart as primary.

## ER003

When you create a replica from a snapshot that is too old, this error may occur. 

The workflow to enable replication on the primary instance and create replicas is:
* Reconfigure the primary instance with `replication.role=primary` and configure its `replication.object.store` to point to the object store and start it.
* While running, snapshot the primary instance and copy the snapshot and restore it on the replica instance.
* Reconfigure the replica instance with `replication.role=replica` and ensure its `replication.object.store` points to the same object store as the primary. Also, set a new and unique value to the `cairo.snapshot.instance.id` configuration.
* Start the replica instance.

See the [checkpointing](/docs/query/sql/checkpoint/) page for more details
on how to create and restore snapshots.

## ER004

This error is very similar to ER003. 

It indicates that the transactions in the object store and the replica are out of sync.

This can happen if you created the replica from a database that replicated on a different timeline or from a database unrelated to the primary instance.

To resolve this, recreate the replica using a recent primary instance snapshot. 

Use a snapshot you created after enabling replication on the primary instance. 

See the workflow in ER003 for detailed steps.


## ER005

A primary instance started which is not in sync with the configured object store.

Verify the `replication.object.store` configuration and ensure that the object store is not in use by another primary instance.

Alternatively, you might have migrated the primary role to a different
instance which has committed more transactions than the current instance.

If you are certain that the `replication.object.store` configuration is correct and that the object store is not in use by another primary instance, perform
a primary migration.

To do so, place an empty `_migrate_primary` file in your database installation directory, the parent of `conf` and `db` directories.

This will update the primary instance to the latest state from the object
store and have it take over as the new primary instance.

## ER006

This error occurs when you start a primary instance and discover another instance is already acting as the primary.

This typically happens after an emergency primary migration, usually due to a network partition that separated your database instances.

Before proceeding, check your infrastructure to determine exactly how many primary instances are currently running.

You have the following options:
* Destroy the extra instance
* Reconfigure it as `replication.role=replica` and restart it
* Perform a planned primary migration and resume the primary role on this instance

# Operating system error codes

Refer to the [OS error codes](/docs/troubleshooting/os-error-codes/) page for any
file or network related errors that QuestDB may raise.
