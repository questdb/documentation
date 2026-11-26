---
title: Operating cold storage
sidebar_label: Cold storage
description:
  Set up, monitor, and operate QuestDB Enterprise cold storage, including object
  store preparation, manager handoff, compaction, garbage collection, pins, and
  troubleshooting.
---

This page covers running [cold storage](/docs/concepts/cold-storage/) in production: preparing the object store root, configuring the cluster, moving the manager role between instances, and diagnosing partitions that are not progressing. Read the [concept page](/docs/concepts/cold-storage/) first for the partition lifecycle and the read path.

:::note

Cold storage is available in **QuestDB Enterprise** only, and is disabled by default.

:::

## Plan the deployment

Once `DROP LOCAL` evicts a partition, the object store holds the only copy of it. The cold storage root is part of the database rather than a copy of it, which shapes these decisions before the first policy goes on a production table:

- **Decide what happens to late rows.** By default, rows that arrive after `DROP LOCAL` are dropped, so set `DROP LOCAL` beyond the longest late-arrival, replay and correction window, or enable [late rows](/docs/concepts/cold-storage-late-rows/). See [What happens to late rows](/docs/concepts/cold-storage/#what-happens-to-late-rows).
- **`DROP REMOTE` sets the final retention boundary.** It is the one stage that physically deletes data, and there is no undo. Leave it out of the policy until remote retention is a deliberate decision.
- **QuestDB owns the root.** External tools may read `data.parquet`, but nothing else may write, delete or expire objects under the root, so disable provider lifecycle and archive rules for it.
- **One root per database**, shared by its primary and replicas. A [point-in-time recovery](/docs/operations/point-in-time-recovery/#cold-storage) needs a new root.
- **Back up with `BACKUP DATABASE`**, which keeps the cold objects a backup needs, see [Backup and restore](#backup-and-restore).
- **Upgrade the cold storage manager last**, see [Upgrading to ENTERPRISE_VERSION_TBD](/docs/operations/upgrade/#upgrading-to-enterprise_version_tbd).

## 1. Prepare the object store root

Use a root, such as a bucket and prefix, dedicated to one database. Do not share it with [replication](/docs/high-availability/setup/) or [backup](/docs/operations/backup/) storage, and do not point a second database at it: an instance of another database refuses it with [`ER010`](/docs/troubleshooting/error-codes/#er010).

Access requirements differ by role:

| Instances                                                                           | Required access                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Every instance                                                                      | Read                                                                            |
| The manager                                                                         | Read, create, conditional create, write, delete                                 |
| Every instance that takes backups                                                   | `GET`, `PUT` and `DELETE` on `_retention/*`, and `GET` on `*/_manifest.msgpack` |
| Every instance of a database restored onto a new root, as by point-in-time recovery | On the root it restored from: read, and `PUT` and `DELETE` on `_retention/*`    |

Without the `_retention/*` permissions, backups of cold partitions fail.

The object store must support conditional requests, `If-None-Match` on create and `If-Match` on replace and delete, as AWS S3, Azure Blob Storage and Google Cloud Storage do. An S3-compatible store must also support `If-Match` on `DeleteObject`. An `fs` root needs a filesystem with hard links, with `atomic_write_dir` on the same mount as `root`, and an NFS mount needs working file locks.

Prefer cloud instance roles, workload identities, or managed identities over long-lived credentials in `server.conf`. Where credentials are unavoidable, load them from a file with [`QDB_COLD_STORAGE_OBJECT_STORE_FILE`](/docs/configuration/overview/#enterprise-properties).

Disable any provider lifecycle rule that would transition objects to an archive tier or expire them. QuestDB manages object retention itself through `DROP REMOTE` and remote garbage collection.

Enable object versioning on the bucket or container: versioning on AWS S3, blob versioning on Azure Blob Storage, and Object Versioning or soft delete on Google Cloud Storage. After `DROP LOCAL`, the object store holds the only copy of a partition, and cold objects change far less often than replication objects, so versioning adds little cost. It keeps a deleted or overwritten object recoverable after remote garbage collection has run, which otherwise leaves only the [grace period](/docs/operations/point-in-time-recovery/#protect-dropped-cold-data-during-the-grace-period) to act after a mistaken drop.

Pair it with a lifecycle rule that expires only **noncurrent** versions, after the recovery window you want. That rule never touches the current objects QuestDB reads, so it is compatible with the rule above. Versioning applies to the whole S3 or GCS bucket and to the whole Azure storage account, so keep the cold storage root apart from [replication](/docs/high-availability/setup/#1-configure-object-storage) storage, which should not be versioned.

To recover an object, make the previous version current again, for example by removing the S3 delete marker. If the restored object comes back with a different ETag, the first read fails and the retry succeeds, as described in [Backup and restore](#backup-and-restore).

## 2. Configure every instance

Cold storage settings are not reloadable, so this step requires a restart.

Designate exactly one instance as the manager:

```ini title="server.conf on the manager"
cold.storage.enabled=true
cold.storage.role=manager
cold.storage.object.store=s3::bucket=${BUCKET_NAME};root=cold;region=${AWS_REGION};
```

Every other instance uses the same store specification and the default
refresher role:

```ini title="server.conf on every other instance"
cold.storage.enabled=true
cold.storage.role=refresher
cold.storage.object.store=s3::bucket=${BUCKET_NAME};root=cold;region=${AWS_REGION};
```

The manager can run on a primary or on a replica. Putting it on a replica moves upload, manifest, and garbage-collection work off the primary.

To keep [late rows](/docs/concepts/cold-storage-late-rows/), also set `cold.storage.delta.enabled=true` on every instance, after reading [Before you enable late rows](/docs/concepts/cold-storage-late-rows/#before-you-enable-late-rows).

### Object store connection strings

The same syntax as replication and backup storage. For provider setup in more depth, including bucket creation, credentials, and the NFS mount requirements, see [Configure object storage](/docs/high-availability/setup/#1-configure-object-storage).

```ini title="AWS S3"
cold.storage.object.store=s3::bucket=${BUCKET_NAME};root=cold;region=${AWS_REGION};
```

```ini title="Azure Blob Storage"
cold.storage.object.store=azblob::endpoint=https://${STORE_ACCOUNT}.blob.core.windows.net;container=${BLOB_CONTAINER};root=cold;account_name=${STORE_ACCOUNT};
```

```ini title="Google Cloud Storage"
cold.storage.object.store=gcs::bucket=${BUCKET_NAME};root=cold;
```

```ini title="Filesystem or NFS"
cold.storage.object.store=fs::root=/mnt/cold/final;atomic_write_dir=/mnt/cold/scratch;
```

Omitting the credential parameters lets the provider SDK resolve an instance role, workload identity, or managed identity.

## 3. Apply a policy

Confirm the table is WAL-backed and partitioned, then attach a policy with a `TO REMOTE` stage:

```questdb-sql title="Check eligibility"
SELECT table_name, walEnabled, partitionBy, designatedTimestamp
FROM tables()
WHERE table_name = 'trades';
```

```questdb-sql title="Convert at 7 days, upload at 14, evict locally at 30"
ALTER TABLE trades SET STORAGE POLICY(
    TO PARQUET 7 DAYS,
    TO REMOTE 14 DAYS,
    DROP LOCAL 30 DAYS
);
```

The first transition can wait for the periodic policy sweep, which runs every five minutes by default. Upload completions, manifest flushes, and seals also trigger a coalesced recheck, so convergence is not bound to the sweep interval.

## 4. Verify

```questdb-sql title="Policy is attached and active"
SELECT * FROM storage_policies
WHERE table_dir_name LIKE 'trades~%';
```

```questdb-sql title="Per-partition remote state"
SELECT * FROM table_cold_partitions('trades');
```

```questdb-sql title="Which partitions are served remotely"
SHOW PARTITIONS FROM trades;
```

A partition served from the object store reports `isRemotelyServed` as `true`, no longer has a local `data.parquet` file, and reports `readOnly` as `true` unless it keeps [late rows](/docs/concepts/cold-storage-late-rows/). With late rows, it becomes remotely served a few minutes after `DROP LOCAL`.

For the first read, use a narrow time interval and project only the columns you need, so request count and latency are easy to observe:

```questdb-sql title="First cold read"
SELECT timestamp, symbol, price
FROM trades
WHERE timestamp IN '2026-02-10';
```

## Compaction and maintenance

With [late rows](/docs/concepts/cold-storage-late-rows/) enabled, every instance merges its runs of late rows, and the manager writes them into new bases, as described under [Compaction](/docs/concepts/cold-storage-late-rows/#compaction). This background work appears in [`cold_storage_compactions()`](/docs/query/functions/meta/#cold_storage_compactions) with origin `background`. A refused or failed step is retried after `cold.storage.maintenance.retry.delay`, 30 seconds by default. To compact on demand, use [`ALTER TABLE COMPACT`](/docs/query/sql/alter-table-compact/).

Many small transactions can pause WAL apply for a table, see [Batch your writes](/docs/concepts/cold-storage-late-rows/#batch-your-writes). To alert on failed compactions and pauses, see [Detect cold storage maintenance problems](/docs/operations/monitoring-alerting/#detect-cold-storage-maintenance-problems).

## Manager handoff

The manager role moves between instances at runtime, with no restart. Role switching requires database administrator (system admin) privileges. See [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/) for the full syntax.

:::note

On a cluster managed by the
[Enterprise Kubernetes Operator](/docs/enterprise-kubernetes-operator/), do not
run these statements directly. Change `spec.coldStorage.manager` and follow the
[operator's manager-move runbook](/docs/enterprise-kubernetes-operator/operations/database/#move-the-cold-storage-manager):
the operator performs this same demote-then-promote sequence and would treat a
hand-switched role as drift.

:::

The supported handoff is two steps, in this order:

```questdb-sql title="1. On the current manager"
SWITCH COLD STORAGE ROLE TO REFRESHER;
SWITCH COLD STORAGE STATUS;
-- wait for state = REFRESHER
```

Demotion flushes pending manifest state and releases the manager lock.

```questdb-sql title="2. On the replacement"
SWITCH COLD STORAGE ROLE TO MANAGER;
SWITCH COLD STORAGE STATUS;
-- wait for state = MANAGER with a positive term
```

Then update `cold.storage.role` in `server.conf` on both instances. A hot-switched role does not survive a restart: each instance boots from its configuration again.

Uploads and garbage collection pause during the short interval when no instance holds the manager role. Reads continue everywhere throughout.

### Promoting a replica

Neither ordinary nor forced promotion waits for WAL apply. Before promoting a replica to manager, either verify it has caught up with replicated WAL, or set `cold.storage.gc.enabled=false` and re-enable garbage collection once catch-up is proven.

`cold.storage.gc.partition.grace.period` is the supported catch-up window, not a substitute for verifying catch-up. Lag beyond it can cause a live remote object to be reclaimed.

Promoting a replica to replication primary is guarded too: a replica behind what the root has published is refused with [`ER011`](/docs/troubleshooting/error-codes/#er011), and [`SWITCH STATUS`](/docs/query/sql/switch-role/) shows the refusal in `last_refusal`.

### Forced takeover

If the previous manager died before it could demote, changing configuration and restarting the replacement is not enough: it finds a foreign lock and starts as a refresher instead.

```questdb-sql title="Break glass only"
SWITCH COLD STORAGE ROLE TO MANAGER FORCE;
```

:::danger

`FORCE` deletes the existing lock and claims ownership. It is a recovery path, not a fencing protocol. Stop the old instance, or prove it is dead, before issuing it. Two active managers write byte-divergent Parquet for the same partition and corrupt cold reads.

:::

Deleting `_manager.lock` with object store tooling bypasses QuestDB's control path and carries the same fencing requirement. It is not a safer alternative.

## Remote garbage collection

Garbage collection is the only path that physically deletes remote objects. It runs on the manager, is enabled by default, and should stay enabled during normal operation.

The manager reclaims the bases that no partition of a table references any more: those of dropped partitions, and those replaced by a newer upload or a compaction. A base is first marked `deleting`, then deleted on a later pass once `cold.storage.gc.partition.grace.period` has elapsed, unless it is [pinned](#pins). The grace window lets in-flight readers drain, and lets WAL apply restore a partition that a lagging replica-turned-manager has not yet caught up on. A dropped table's local files go once the root's catalog records the drop, and its remote objects after `cold.storage.gc.table.grace.period`.

An instance stopped, or behind on replication, for longer than the grace periods fails reads of the partitions dropped or replaced meanwhile, until it catches up. Size the grace periods for the longest time an instance may stay stopped or behind.

Disable garbage collection with `cold.storage.gc.enabled=false` only as a temporary failover safeguard.

## Pins

A **pin** tells garbage collection that an owner still needs a base. Pins live under `_retention/` in the root that holds the bases, and have two kinds of owner:

- **`backup`**: one instance's backups to one destination. Each [`BACKUP DATABASE`](/docs/operations/backup/) pins the bases it refers to, and backup cleanup unpins them with the last backup that needs them.
- **`root`**: a database restored or recovered onto a new root, such as by [point-in-time recovery](/docs/operations/point-in-time-recovery/#cold-storage), which reads the partitions it inherited from this root. Its manager unpins a base once it drops or replaces the partition.

On the root's cold storage manager, with `SYSTEM ADMIN`, [`cold_storage_pin_owners()`](/docs/query/functions/meta/#cold_storage_pin_owners) and [`cold_storage_pins()`](/docs/query/functions/meta/#cold_storage_pins) list them:

```questdb-sql title="Owners of pins, and the pinned bases of one table"
SELECT * FROM cold_storage_pin_owners();
SELECT * FROM cold_storage_pins('trades');
```

To release the pins of an owner gone for good, such as a removed backup destination or a retired recovered database, pass its `owner_id`:

```questdb-sql title="Release an owner's pins"
SELECT cold_storage_release_pins('<owner_id>');
```

:::danger

Releasing pins cannot be undone. Releasing an owner still in use lets garbage collection delete the bases that its backups or reads need.

:::

## Monitoring

### Lifecycle state

```questdb-sql title="Partitions not yet durable in the object store"
SELECT timestamp, state, seq_txn, size, last_modified, partition_path
FROM table_cold_partitions('trades')
WHERE state = 'pending';
```

A manager reports its own in-memory view. A refresher reports its mirrored copy, which it refreshes when the catalog generation changes. While a role transition is in flight, `table_cold_partitions()` returns zero rows rather than blocking. `SWITCH COLD STORAGE STATUS` reports the live role at any time.

For compactions of late rows, see [Compaction and maintenance](#compaction-and-maintenance).

### Cold read metrics

The Prometheus endpoint exposes fifteen cold-read metrics under the `questdb_cold_chunk_` prefix. The ones worth alerting on:

```text
questdb_cold_chunk_download_started_total
questdb_cold_chunk_download_finished_total
questdb_cold_chunk_download_failed_total
questdb_cold_chunk_download_coalesced_total
questdb_cold_chunk_in_flight_downloads
questdb_cold_chunk_pending_batches
questdb_cold_chunk_busy_leases
questdb_cold_chunk_pinned_bytes
```

Watch rates and ratios rather than raw totals:

- **Sustained `download_failed_total`** points at credentials, network, or a missing object.
- **`pending_batches` at its configured cap** means queries are being rejected with backpressure errors. Narrow the queries before raising the cap.
- **`pinned_bytes` or `busy_leases` staying non-zero after query traffic stops** indicates leases that were never released, and is worth reporting.
- **`download_started_total` relative to `questdb_cold_chunk_acquire_miss_chunks_total`** is the coalescing factor. A ratio near one means requests are not being merged.

## Backup and restore

[Backups](/docs/operations/backup/) hold the local state of cold partitions, late rows included, but not their `data.parquet` objects. Instead, a backup [pins](#pins) the bases it needs, so garbage collection keeps them while the backup exists, even after their partition or table is dropped. A backup that cannot pin a base fails.

- **Back up right after upgrading** to QuestDB Enterprise ENTERPRISE_VERSION_TBD: earlier backups pin nothing.
- **Restore onto the same root** to rebuild an instance, such as a replica. The restore first checks that the root still holds every base the backup needs.
- **Restore onto a new root** when a standalone instance uploaded after its backup, or after a power loss in the `nosync` or `async` commit mode. Before the boot that restores the backup, set `cold.storage.object.store` to a new, empty root, and if needed add a [`cold.storage.linked.object.stores`](/docs/configuration/cold-storage/#coldstoragelinkedobjectstores) entry for the old root. The restored database reads its cold partitions from the old root, and pins them there.
- **A point-in-time recovery** always uses a new root, see [Point-in-time recovery](/docs/operations/point-in-time-recovery/#cold-storage).
- **A `CHECKPOINT CREATE` snapshot** pins nothing: after a restore, partitions whose bases were collected since then cannot be read.

A restore onto another database's root fails with [`ER010`](/docs/troubleshooting/error-codes/#er010). A restore onto another host or backend can change an object's version: the first read of an affected partition fails, and a retry succeeds, see [Integrity](/docs/concepts/cold-storage/#integrity).

Worth testing before relying on cold storage for retention:

- Restore of a backup onto the same root.
- Point-in-time recovery onto a new root.
- Query retry after a restore changes an object's version.
- The two-step manager handoff, after verifying WAL catch-up.
- Recovery of an accidentally removed object from a provider version or backup.

## Disabling cold storage

With `cold.storage.enabled=false`, partitions that only the object store holds stay in their tables, and a query that reads one fails with `partition <partition> of table <table> is in cold storage, which is disabled on this instance`. Only `DROP PARTITION` removes them. `DROP LOCAL` keeps removing partitions held locally, uploaded or not.

:::warning

This includes Delta partitions whose base is still local, with all their [late rows](/docs/concepts/cold-storage-late-rows/). To keep them, remove the `DROP LOCAL` stage from those tables' [storage policies](/docs/query/sql/alter-table-set-storage-policy/) before you disable cold storage.

:::

## Troubleshooting

| Symptom                                                                                                 | Likely cause                                                                                                                  | What to do                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `table_cold_partitions()` returns no rows                                                               | No eligible partition other than the table's last one, the first sweep has not run, or the role is still resolving at startup | Check the policy, `SHOW PARTITIONS`, and the role with `SWITCH COLD STORAGE STATUS`                                                                                                                                                    |
| A partition stays `pending`                                                                             | Upload is queued, or the manager cannot write the object and its `_pm` metadata                                               | Verify manager ownership, worker count, credentials, network, and quota. Do not edit the manifest                                                                                                                                      |
| A partition is `active` but stays local                                                                 | It has not reached `DROP LOCAL`, or the `DROP LOCAL` event has not applied                                                    | Check the `DROP LOCAL` horizon and WAL apply health on every instance. With late rows, allow a few minutes                                                                                                                             |
| `active` in `table_cold_partitions()` but `isRemotelyServed` is false                                   | The instance is waiting on catalog refresh, object access, or metadata staging                                                | Verify read access to `data.parquet` and `_pm`, then allow the next recheck                                                                                                                                                            |
| A query fails with `cold-storage partition stale: ... re-identify needed`                               | The object is not the version QuestDB installed, for example after a restore or a copy of the root                            | Retry the query. If it persists, restore the expected object under its key                                                                                                                                                             |
| A query fails with `manifest resolution timed out`                                                      | The instance restarted and has not loaded the table's manifest yet                                                            | Retry the query                                                                                                                                                                                                                        |
| A query fails with `remote base is absent from manifest`                                                | Garbage collection deleted a replaced base that the query, or a lagging instance, was reading                                 | Retry the query. If an instance keeps failing, let it catch up on replication                                                                                                                                                          |
| A cold query is slow or hits backpressure                                                               | Broad scan, wide projection, object store cold start, or saturated read limits                                                | Narrow the time range and columns, reduce concurrency, then inspect the metrics above before tuning                                                                                                                                    |
| Late rows are missing, and the log shows `o3 ignoring write on read-only partition`                     | Their partition was sealed                                                                                                    | Enable [late rows](/docs/concepts/cold-storage-late-rows/), or see [Partitions sealed before late rows were enabled](/docs/concepts/cold-storage-late-rows/#partitions-sealed-before-late-rows-were-enabled). Re-send the dropped rows |
| A deduplicated table is suspended with `cannot insert into read-only partition`                         | A transaction holds rows for a sealed partition                                                                               | See [Rows for read-only partitions](/docs/concepts/deduplication/#rows-for-read-only-partitions)                                                                                                                                       |
| A table is suspended with `cannot update read-only partition` or `cannot update delta-active partition` | A WAL `UPDATE` reached a sealed or Delta partition                                                                            | Skip the transaction with [`RESUME WAL FROM TRANSACTION`](/docs/query/sql/alter-table-resume-wal/) on every instance                                                                                                                   |
| A table is suspended when late rows switch a sealed partition                                           | The partition is local Parquet, and its `_pm` file is missing or corrupt                                                      | Restore the file, or run `FORCE DROP PARTITION` on every instance, then `RESUME WAL`                                                                                                                                                   |
| WAL apply lags but the table is not suspended                                                           | A partition holds too many runs of late rows                                                                                  | See [Batch your writes](/docs/concepts/cold-storage-late-rows/#batch-your-writes)                                                                                                                                                      |
| A compaction fails                                                                                      | See the `error` column of `cold_storage_compactions()`                                                                        | Fix the cause, then run [`COMPACT`](/docs/query/sql/alter-table-compact/) again, or wait for the background retry                                                                                                                      |
| A backup fails to pin a base                                                                            | Missing [permissions](#1-prepare-the-object-store-root) on `_retention/*` or the manifests                                    | Grant them                                                                                                                                                                                                                             |
| Cold storage promotion or cold reads fail with `ER010`                                                  | The root belongs to another database                                                                                          | See [`ER010`](/docs/troubleshooting/error-codes/#er010)                                                                                                                                                                                |
| A replica promotion fails with `ER011`                                                                  | The replica is behind what the root has published                                                                             | See [`ER011`](/docs/troubleshooting/error-codes/#er011)                                                                                                                                                                                |
| An older release logs `incompatible version: got 2.0, expected major version 1`                         | A manager of a newer release wrote the root                                                                                   | Upgrade the instance, see [Upgrading to ENTERPRISE_VERSION_TBD](/docs/operations/upgrade/#upgrading-to-enterprise_version_tbd)                                                                                                         |
| A table is suspended with `Unsupported WAL event type: 65`                                              | Late rows were enabled before every instance was upgraded                                                                     | Upgrade that instance, then run `ALTER TABLE ... RESUME WAL` on it                                                                                                                                                                     |
| `SWITCH COLD STORAGE STATUS` stays at `PROMOTING`                                                       | The instance cannot reach the root, for example because of wrong credentials                                                  | Check the logs and the instance's object store access                                                                                                                                                                                  |
| A cold object is missing                                                                                | External deletion, a lifecycle rule, or incomplete recovery of the root                                                       | Restore the exact expected object under its key. A cold partition cannot self-heal from local data                                                                                                                                     |

## See also

- [Cold storage](/docs/concepts/cold-storage/) for the lifecycle and read path
- [Late rows in cold storage](/docs/concepts/cold-storage-late-rows/)
- [Cold storage configuration](/docs/configuration/cold-storage/) for every key
- [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/)
- [`ALTER TABLE COMPACT`](/docs/query/sql/alter-table-compact/)
- [Storage Policy](/docs/concepts/storage-policy/)
- [Backup and restore](/docs/operations/backup/)
