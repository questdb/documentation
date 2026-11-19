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

- **Decide what happens to late rows.** By default, `DROP LOCAL` seals a partition, and rows that arrive for it afterwards are dropped, or suspend a table with deduplication. With [late rows](/docs/concepts/cold-storage-late-rows/) enabled, tables without deduplication keep them. Without late rows, set `DROP LOCAL` beyond the longest late-arrival, replay, and correction window for the table, and test the boundary against your real ingestion pattern. See [What happens to late rows](/docs/concepts/cold-storage/#what-happens-to-late-rows).
- **`DROP REMOTE` sets the final retention boundary.** It is the one stage that physically deletes data, and there is no undo. Leave it out of the policy until remote retention is a deliberate decision.
- **QuestDB owns the root.** External tools may read `data.parquet`. Nothing else should write, replace, delete, or expire objects under the root, so disable any provider lifecycle or archive rule that covers it.
- **One root per database.** Every instance of a database, primary and replicas, uses the same root, and no other database may use it. A [point-in-time recovery](/docs/operations/point-in-time-recovery/#cold-storage) needs a new root.
- **Back up with `BACKUP DATABASE`.** Its backups pin the cold objects they need, so the root keeps them while the backup exists. See [Backup and restore](#backup-and-restore) below.

## 1. Prepare the object store root

Use a root, such as a bucket and prefix, dedicated to one database. Do not share it with [replication](/docs/high-availability/setup/) or [backup](/docs/operations/backup/) storage, and do not point a second database at it: an instance of another database refuses it with [`ER010`](/docs/troubleshooting/error-codes/#er010).

Access requirements differ by role:

| Instances                                                        | Required access                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every instance                                                   | Read                                                                                                                                                                                                                 |
| The manager                                                      | Read, create, conditional create, write, delete                                                                                                                                                                      |
| Every instance that takes backups                                | `GET`, `PUT` and `DELETE` on `_retention/*`, and `GET` on the table manifests, `<table>/_manifest.msgpack`                                                                                                           |
| Every instance of a database recovered by point-in-time recovery | On each source root it inherited partitions from: `GET` on the catalog, manifests and objects, and `GET` and `PUT` on `_retention/*`. `DELETE` on `_retention/*` also lets a failed restore remove the pins it wrote |

Without the `_retention/*` permissions, backups of cold partitions fail. See [Pins](#pins).

The object store must support conditional requests: `If-None-Match` to create an object, and `If-Match` to replace or delete one. AWS S3, Azure Blob Storage and Google Cloud Storage support them. An S3-compatible store must support both, including `If-Match` on `DeleteObject`. On Google Cloud Storage each manifest, catalog or lock write is a resumable upload, two requests per write.

An `fs` root must be on a filesystem that supports hard links. It can be shared across machines, for example over NFS.

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

To keep [late rows](/docs/concepts/cold-storage-late-rows/), add this line on every instance, once every instance runs a release that supports it:

```ini title="server.conf on every instance, optional"
cold.storage.delta.enabled=true
```

Set it the same on every instance. Only the primary acts on it, so a replica that may be promoted needs it too.

### Object store connection strings

The same syntax as replication and backup storage. For provider setup in more depth, including bucket creation and credentials, see [Configure object storage](/docs/high-availability/setup/#1-configure-object-storage).

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

A partition being served from the object store reports `isRemotelyServed` as `true` and no longer has a local `data.parquet` file. A sealed partition also reports `readOnly` as `true`; a partition that keeps [late rows](/docs/concepts/cold-storage-late-rows/) reports `readOnly` as `false`.

With late rows enabled, a partition takes minutes to become remotely served after it passes `DROP LOCAL`, since maintenance visits each table every `delta.maintenance.sweep.interval`, 5 minutes by default. Check maintenance progress with:

```questdb-sql title="Queued, running and failed compactions"
SELECT * FROM cold_storage_compactions();
```

For the first read, use a narrow time interval and project only the columns you need, so request count and latency are easy to observe:

```questdb-sql title="First cold read"
SELECT timestamp, symbol, price
FROM trades
WHERE timestamp IN '2026-02-10';
```

## Compaction and maintenance

With [late rows](/docs/concepts/cold-storage-late-rows/) enabled, background maintenance runs on every instance, as described under [Compaction](/docs/concepts/cold-storage-late-rows/#compaction):

- **Every instance merges runs**, the sorted batches of late rows that each transaction adds to a partition, on its own local disk. This work appears in `cold_storage_compactions()` with kind `residual` and origin `background`.
- **The manager writes new bases.** Once a partition's late rows pass the `cold.storage.maintenance.base.min.delta.bytes` and `cold.storage.maintenance.base.delta.ratio` thresholds, the manager folds them into a new Parquet base and uploads it. A refused or failed step is retried after `cold.storage.maintenance.retry.delay`. See [Maintenance](/docs/configuration/cold-storage/#maintenance) for the defaults. This work appears in `cold_storage_compactions()` with kind `base` and origin `background`.
- **Every instance switches to the new base** once no query, checkpoint or save point reads the old one. Garbage collection deletes the old base after its grace period, unless it is [pinned](#pins).

To compact on demand, use [`ALTER TABLE COMPACT (cold storage)`](/docs/query/sql/alter-table-compact/). It needs the `VACUUM TABLE` permission, and `BASE` and the default mode run only on the manager.

### WAL apply pauses on many small transactions

A partition that holds too many runs of late rows stops WAL apply for its table, without suspending it, until background merging reclaims enough of them. While it is stopped, the rows of waiting transactions are not visible, and `DROP PARTITION` or `TRUNCATE` queued behind it wait. The instance logs `Delta WAL apply stopped on Run pressure` when the stop starts, and `Delta WAL apply resumed` when it ends. See [Batch your writes](/docs/concepts/cold-storage-late-rows/#batch-your-writes) for the thresholds and the full log lines.

Long-running queries and checkpoints keep the runs they read, so they can extend a stop. The cure is fewer, larger transactions: see [Detect small transactions](/docs/operations/monitoring-alerting/#detect-small-transactions).

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

Promoting a replica to replication primary is guarded too: a replica whose tables are behind what the root has published is refused with [`ER011`](/docs/troubleshooting/error-codes/#er011). [`SWITCH STATUS`](/docs/query/sql/switch-role/) shows the reason in its `last_refusal` column. Let the replica catch up, then promote it again.

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

The manager reclaims the bases that no partition of a table references any more: those of dropped partitions, and those replaced by a newer upload or a compaction. A base is first marked `deleting`, then deleted on a later pass once `cold.storage.gc.partition.grace.period` has elapsed. The grace window lets in-flight readers drain, and lets WAL apply restore a partition that a lagging replica-turned-manager has not yet caught up on.

The local files of a dropped table go once the root's catalog records the drop. The manager deletes its remote objects once `cold.storage.gc.table.grace.period` has passed.

Garbage collection never deletes a [pinned](#pins) base: it waits until no backup or recovered database needs it.

Instances pin nothing. An instance stopped, or behind on replication, for longer than the grace periods fails reads of the partitions dropped or replaced meanwhile, until it catches up; it needs no base to apply WAL, and nothing is lost. Set the grace periods to cover the longest time an instance may stay stopped or behind, and no lower than 10 minutes.

Disable garbage collection with `cold.storage.gc.enabled=false` only as a temporary failover safeguard.

## Pins

A **pin** records that an owner still needs a base, so garbage collection keeps it. Pins live under `_retention/` in the root that holds the bases. There are two kinds of owner:

- **`backup`**: the backup index of one instance and backup destination. Each [`BACKUP DATABASE`](/docs/operations/backup/) pins the bases of the cold partitions it archives, and the backup cleanup unpins them when it expires the last backup that refers to them.
- **`root`**: the root of a database recovered by [point-in-time recovery](/docs/operations/point-in-time-recovery/#cold-storage), which keeps reading the partitions it inherited from this root. Its manager unpins a base once it drops or replaces the partition.

These functions run on the cold storage manager of the root, and need `SYSTEM ADMIN`:

```questdb-sql title="Owners of pins in this root"
SELECT * FROM cold_storage_pin_owners();
```

```questdb-sql title="Pinned bases of one table"
SELECT * FROM cold_storage_pins('trades');
```

See [`cold_storage_pins()`](/docs/query/functions/meta/#cold_storage_pins) for the columns, and for `cold_storage_pins()` over every table, dropped tables included.

Release the pins of an owner that is gone for good, such as a backup destination removed from the configuration or a retired recovered database:

```questdb-sql title="Release an owner's pins"
SELECT cold_storage_release_pins('<owner_id>');
```

:::danger

Releasing pins cannot be undone. Releasing a backup index still in use drops the pins of its older backups, so a restore from them can fail; its next backup pins only its own bases. Releasing the `root` owner of a recovered database still in use lets garbage collection delete the bases that database reads, and its reads of those partitions then fail.

:::

## Monitoring

### Lifecycle state

```questdb-sql title="Partitions not yet durable in the object store"
SELECT timestamp, state, seq_txn, size, last_modified, partition_path
FROM table_cold_partitions('trades')
WHERE state = 'pending';
```

A manager reports its own in-memory view. A refresher reports its mirrored copy, which it refreshes when the catalog generation changes. While a role transition is in flight, `table_cold_partitions()` returns zero rows rather than blocking. `SWITCH COLD STORAGE STATUS` reports the live role at any time.

### Compactions

```questdb-sql title="Failed compactions on this instance"
SELECT table_name, partition_name, kind, origin, since, error
FROM cold_storage_compactions()
WHERE status = 'failed';
```

`cold_storage_compactions()` lists this instance's queued and running compactions and its last 128 failures, and needs `SYSTEM ADMIN`. There are no metrics for the late rows waiting to be compacted; alert on failed compactions and on the run-pressure log lines in [Compaction and maintenance](#compaction-and-maintenance).

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

[Backups](/docs/operations/backup/) capture the local transaction state, Parquet metadata, and symbol indexes needed to reopen a cold partition, and the late rows of partitions that keep them. They do **not** copy the object store's `data.parquet` bytes into the backup.

Instead, each backup records the base each cold partition needs and [pins](#pins) it, so garbage collection keeps the base while the backup exists, also after the partition or its table is dropped. A backup fails when it cannot pin a base. Expect the root to keep dropped data for as long as a kept backup needs it.

- **Take a backup right after upgrading** to a release that pins. Backups taken before pin nothing, so garbage collection may delete a base one of them needs once its partition is dropped.
- **A restore onto the same root** checks that the root still holds every base the backup refers to, and fails before it changes the database otherwise. This is how replicas are built.
- **A restore onto another database's root** fails with [`ER010`](/docs/troubleshooting/error-codes/#er010).
- **A standalone instance that uploaded after its backup**, or after a power loss in the `nosync` or `async` commit mode, must restore onto a new root.
- **A point-in-time recovery** starts a new database on a new, empty root, and reads the inherited partitions from the source root. See [Point-in-time recovery](/docs/operations/point-in-time-recovery/#cold-storage).
- **A disk snapshot** taken with `CHECKPOINT CREATE` pins nothing: cold partitions whose bases were dropped or replaced after the snapshot, and collected after their grace period, cannot be read after restoring it. Use `BACKUP DATABASE` for tables with cold partitions.

A restore onto a different host or backend can change an object's version even when the bytes are identical. The first read of an affected partition fails, QuestDB re-checks the object in the background, and a retry after that succeeds; a partition with late rows can take longer, see [Integrity](/docs/concepts/cold-storage/#integrity). An object that is genuinely different is refused rather than silently accepted.

Worth testing before relying on cold storage for retention:

- Restore of a backup onto the same root.
- Point-in-time recovery onto a new root.
- Query retry after a restore changes an object's version.
- The two-step manager handoff, after verifying WAL catch-up.
- Recovery of an accidentally removed object from a provider version or backup.

## Disabling cold storage

Setting `cold.storage.enabled=false` on an instance that holds cold partitions keeps them in their tables:

- A partition that only the object store holds stays in the table. A query that reads it fails with `partition <partition> of table <table> is in cold storage, which is disabled on this instance`, instead of returning the other partitions only. Enable cold storage again to read it. Only `DROP PARTITION` removes such a partition while cold storage is disabled.
- `DROP LOCAL` keeps removing partitions held locally, including those already uploaded, and Delta partitions whose base is still on local disk, with their late rows, also those not yet in a base. A Delta partition whose base the object store serves stays, like any partition that only the object store holds.

## Troubleshooting

| Symptom                                                                               | Likely cause                                                                                             | What to do                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `table_cold_partitions()` returns no rows                                             | No eligible non-active partition, the first sweep has not run, or the role is still resolving at startup | Check the policy, `SHOW PARTITIONS`, and the role with `SWITCH COLD STORAGE STATUS`                                                                                       |
| A partition stays `pending`                                                           | Upload is queued, or the manager cannot write the object and its `_pm` metadata                          | Verify manager ownership, worker count, credentials, network, and quota. Do not edit the manifest                                                                         |
| A partition is `active` but stays local                                               | It has not reached `DROP LOCAL`, or the `DROP LOCAL` event has not applied                               | Check the `DROP LOCAL` horizon and WAL apply health on every instance. With late rows, allow a few `delta.maintenance.sweep.interval` periods                             |
| `active` in `table_cold_partitions()` but `isRemotelyServed` is false                 | The instance is waiting on catalog refresh, object access, or metadata staging                           | Verify read access to `data.parquet` and `_pm`, then allow the next recheck                                                                                               |
| A query fails with `cold-storage partition stale: ... re-identify needed`             | The object is not the version QuestDB installed, for example after a restore or a copy of the root       | Retry the query; QuestDB re-checks the object in the background. If it persists, restore the expected object under its key, since a genuinely different one is refused    |
| A query fails with `manifest resolution timed out`                                    | The instance restarted and has not loaded the table's manifest within 10 seconds                         | Retry the query                                                                                                                                                           |
| A query fails with `remote base is absent from manifest`                              | Garbage collection deleted a replaced base the query, or a lagging instance, was reading                 | Run the query again. If an instance keeps failing, let it catch up on replication                                                                                         |
| A cold query is slow or hits backpressure                                             | Broad scan, wide projection, object store cold start, or saturated read limits                           | Narrow the time range and columns, reduce concurrency, then inspect the metrics above before tuning                                                                       |
| Late rows are missing                                                                 | Late rows are disabled, so their partition was sealed                                                    | Check `o3 ignoring write on read-only partition` in the logs. Enable [late rows](/docs/concepts/cold-storage-late-rows/) to keep later ones; dropped rows must be re-sent |
| A table with deduplication is suspended with `cannot insert into read-only partition` | A transaction holds rows for a sealed partition                                                          | Skip the transaction and re-insert its other rows, see [Deduplication](/docs/concepts/deduplication/)                                                                     |
| WAL apply lags but the table is not suspended                                         | A partition holds too many runs of late rows                                                             | Check for `Delta WAL apply stopped on Run pressure` in the logs, and batch writes into larger transactions                                                                |
| A compaction fails                                                                    | See the `error` column of `cold_storage_compactions()`                                                   | Fix the cause, then run [`COMPACT`](/docs/query/sql/alter-table-compact/) again or wait for the background retry                                                          |
| A backup fails to pin a base                                                          | Missing `GET`, `PUT` or `DELETE` on `_retention/*`, or `GET` on the manifests                            | Grant the [permissions](#1-prepare-the-object-store-root)                                                                                                                 |
| Cold storage promotion or cold reads fail with `ER010`                                | The root belongs to another database                                                                     | Point the instance at its own database's root. See [`ER010`](/docs/troubleshooting/error-codes/#er010)                                                                    |
| A replica promotion fails with `ER011`                                                | The replica is behind what the root has published                                                        | Let it catch up and check `SWITCH STATUS`. See [`ER011`](/docs/troubleshooting/error-codes/#er011)                                                                        |
| An older release logs `incompatible version: got 2.0, expected major version 1`       | A manager of a newer release wrote the root                                                              | Upgrade the instance. Downgrading is not supported                                                                                                                        |
| A table is suspended with `Unsupported WAL event type: 65`                            | Late rows were enabled before every instance was upgraded                                                | Upgrade that instance, then run `ALTER TABLE ... RESUME WAL` on it                                                                                                        |
| `SWITCH COLD STORAGE STATUS` stays at `PROMOTING`                                     | The instance cannot reach the root, for example because of wrong credentials                             | Check the logs and the instance's object store access                                                                                                                     |
| A cold object is missing                                                              | External deletion, a lifecycle rule, or incomplete recovery of the root                                  | Restore the exact expected object under its key. A cold partition cannot self-heal from local data                                                                        |

## See also

- [Cold storage](/docs/concepts/cold-storage/) for the lifecycle and read path
- [Late rows in cold storage](/docs/concepts/cold-storage-late-rows/)
- [Cold storage configuration](/docs/configuration/cold-storage/) for every key
- [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/)
- [`ALTER TABLE COMPACT (cold storage)`](/docs/query/sql/alter-table-compact/)
- [Storage Policy](/docs/concepts/storage-policy/)
- [Backup and restore](/docs/operations/backup/)
