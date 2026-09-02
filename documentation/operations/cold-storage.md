---
title: Operating cold storage
sidebar_label: Cold storage
description:
  Set up, monitor, and operate QuestDB Enterprise cold storage, including object
  store preparation, manager handoff, garbage collection, and troubleshooting.
---

This page covers running [cold storage](/docs/concepts/cold-storage/) in production: preparing the object store prefix, configuring the cluster, moving the manager role between instances, and diagnosing partitions that are not progressing. Read the [concept page](/docs/concepts/cold-storage/) first for the partition lifecycle and the read path.

:::note

Cold storage is available in **QuestDB Enterprise** only, and is disabled by default.

:::

## Plan the deployment

Once `DROP LOCAL` evicts a partition, the object store holds the only copy of it. The prefix is part of the database rather than a copy of it, which shapes four decisions worth making before the first policy goes on a production table:

- **`DROP LOCAL` is an immutability cutoff, not just a disk-space setting.** Once a partition is sealed, writes targeting it are skipped at apply time. Set it beyond the longest late-arrival, replay, and correction window for the table, and test the boundary against your real ingestion pattern.
- **`DROP REMOTE` sets the final retention boundary.** It is the one stage that physically deletes data, and there is no undo. Leave it out of the policy until remote retention is a deliberate decision.
- **QuestDB owns the prefix.** External tools may read `data.parquet`. Nothing else should write, replace, delete, or expire objects under the root, so disable any provider lifecycle or archive rule that covers it.
- **Back up the database and the prefix together.** They restore as a pair. See [Backup and restore](#backup-and-restore) below.

## 1. Prepare the object store prefix

Use a prefix dedicated to one QuestDB cluster. Do not share it with [replication](/docs/high-availability/setup/) or [backup](/docs/operations/backup/) storage, and do not point a second cluster at it.

Access requirements differ by role:

| Instances        | Required access                                 |
| ---------------- | ----------------------------------------------- |
| Every instance   | Read                                            |
| The manager only | Read, create, conditional create, write, delete |

Prefer cloud instance roles, workload identities, or managed identities over long-lived credentials in `server.conf`. Where credentials are unavoidable, load them from a file with [`QDB_COLD_STORAGE_OBJECT_STORE_FILE`](/docs/configuration/overview/#enterprise-properties).

Disable any provider lifecycle rule that would transition objects to an archive tier or expire them. QuestDB manages object retention itself through `DROP REMOTE` and remote garbage collection.

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

A partition being served from the object store reports `isRemotelyServed` as `true` and `readOnly` as `true`, and no longer has a local `data.parquet` file.

For the first read, use a narrow time interval and project only the columns you need, so request count and latency are easy to observe:

```questdb-sql title="First cold read"
SELECT timestamp, symbol, price
FROM trades
WHERE timestamp IN '2026-02-10';
```

## Manager handoff

The manager role moves between instances at runtime, with no restart. Role switching requires database administrator (system admin) privileges. See [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/) for the full syntax.

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

Garbage collection is the only path that physically deletes remote objects. It is enabled by default and should stay enabled during normal operation.

The manager reclaims objects for partitions the table no longer references. A partition is first marked `deleting`, then deleted on a later pass once `cold.storage.gc.partition.grace.period` has elapsed. The grace window lets in-flight readers drain, and lets WAL apply restore a partition that a lagging replica-turned-manager has not yet caught up on.

Dropping a whole table is gated the same way: the table is marked for removal, further writes are rejected, and local removal waits on remote objects being reclaimed within `cold.storage.gc.table.grace.period`.

Disable garbage collection with `cold.storage.gc.enabled=false` only as a temporary failover safeguard.

## Monitoring

### Lifecycle state

```questdb-sql title="Partitions not yet durable in the object store"
SELECT timestamp, state, seq_txn, size, last_modified, partition_path
FROM table_cold_partitions('trades')
WHERE state = 'pending';
```

A manager reports its own in-memory view. A refresher reports its mirrored copy, which it refreshes when the catalog generation changes. While a role transition is in flight, `table_cold_partitions()` returns zero rows rather than blocking. `SWITCH COLD STORAGE STATUS` reports the live role at any time.

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

[Backups](/docs/operations/backup/) capture the local transaction state, Parquet metadata, and symbol indexes needed to reopen a cold partition. They do **not** copy the object store's `data.parquet` bytes into the backup.

Protect the database backup and the cold storage prefix as a single recovery set. A restored instance must be able to reach the same objects, or a deliberately copied equivalent. If a cold object is lost after local eviction, QuestDB has no local source from which to regenerate it.

A restore onto a different host or backend can change an object's version even when the bytes are identical. The first read of an affected partition fails, QuestDB re-checks the object in the background, and the retry succeeds. An object that is genuinely different is refused rather than silently accepted.

Worth testing before relying on cold storage for retention:

- Restore with access to the existing prefix.
- Restore from a copied prefix, where object versions differ.
- Query retry after a restore changes an object's version.
- The two-step manager handoff, after verifying WAL catch-up.
- Recovery of an accidentally removed object from a provider version or backup.

## Troubleshooting

| Symptom                                                | Likely cause                                                                                             | What to do                                                                                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `table_cold_partitions()` returns no rows              | No eligible non-active partition, the first sweep has not run, or the role is still resolving at startup | Check the policy, `SHOW PARTITIONS`, and the role with `SWITCH COLD STORAGE STATUS`                                                                                   |
| A partition stays `pending`                            | Upload is queued, or the manager cannot write the object and its sidecar                                 | Verify manager ownership, worker count, credentials, network, and quota. Do not edit the manifest                                                                     |
| A partition stays `live`                               | It has not reached `DROP LOCAL`, or the seal has not applied                                             | Check the `DROP LOCAL` horizon and WAL apply health on every instance                                                                                                 |
| Manifest says `sealed` but `isRemotelyServed` is false | The instance is waiting on catalog refresh, object access, or metadata staging                           | Verify read access to `data.parquet` and `_pm.a`, then allow the next recheck                                                                                         |
| A query reports a stale partition                      | The object is not the version QuestDB installed                                                          | Retry the query; QuestDB re-checks the object in the background. If it persists, restore the expected object, since a genuinely different one is refused deliberately |
| A cold query is slow or hits backpressure              | Broad scan, wide projection, object store cold start, or saturated read limits                           | Narrow the time range and columns, reduce concurrency, then inspect the metrics above before tuning                                                                   |
| Historical writes are missing                          | Their partition was already sealed                                                                       | Review apply logs and the `DROP LOCAL` horizon. There is no in-place unseal                                                                                           |
| A cold object is missing                               | External deletion, a lifecycle rule, or incomplete recovery of the prefix                                | Restore the exact expected object. A cold partition cannot self-heal from local data                                                                                  |

## See also

- [Cold storage](/docs/concepts/cold-storage/) for the lifecycle and read path
- [Cold storage configuration](/docs/configuration/cold-storage/) for every key
- [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/)
- [Storage Policy](/docs/concepts/storage-policy/)
- [Backup and restore](/docs/operations/backup/)
