---
title: Cold storage
sidebar_label: Overview
description:
  Move historical partitions to S3, Google Cloud Storage, Azure Blob Storage or
  a filesystem store as Parquet, and keep querying them with normal SQL.
---

Cold storage moves eligible historical partitions off local disk and into an object store as Apache Parquet. The partitions stay in the same table and answer the same SQL: a single query can span native, local Parquet, and remote Parquet partitions without the application knowing which is which. Recent data continues to live on local disk at local-disk latency, so the practical effect is a much smaller local footprint for tables with long retention.

import Screenshot from "@theme/Screenshot"

<Screenshot
  alt="Three QuestDB instances keep recent partitions on local disk while a single shared object store holds the historical Parquet partitions that every instance reads directly with range reads"
  src="images/docs/concepts/cold-storage-architecture.svg"
  width={660}
  forceTheme="dark"
/>

History is written once, by one instance, and read by all of them. A replica does
not receive a copy of a cold partition: it reads the same object the manager
uploaded. Adding instances therefore adds query capacity over the history without
adding storage.

Cold storage is driven by a [storage policy](/docs/concepts/storage-policy/).

:::note

Cold storage is available in **QuestDB Enterprise** only, and is disabled by default.

:::

## Requirements

Cold storage runs on top of a [storage policy](/docs/concepts/storage-policy/), so a table must first meet that page's [requirements](/docs/concepts/storage-policy/#requirements). The remote stages then add:

- `cold.storage.enabled=true` on every instance
- A [WAL-enabled](/docs/concepts/write-ahead-log/) table, since remote stages are rejected on non-WAL tables
- A policy carrying a `TO REMOTE` stage
- A cold storage **root**: the object store location set by `cold.storage.object.store`, such as a bucket and prefix. It belongs to one database, and each instance needs the access listed under [Prepare the object store root](/docs/operations/cold-storage/#1-prepare-the-object-store-root)

The active partition is never eligible.

For the configuration keys and the setup procedure, see [Cold storage configuration](/docs/configuration/cold-storage/) and [Operating cold storage](/docs/operations/cold-storage/).

## Partition lifecycle

Cold storage is a lifecycle for whole time partitions, not a whole-table migration and not a local cache of remote data. The unit of movement is always a complete partition.

The [storage policy](/docs/concepts/storage-policy/) stages decide when each transition fires. What they mean for the data is:

| Phase              | Where the data is                                    | Behaviour                                                                                                |
| ------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Hot local**      | Native columns or local Parquet                      | Writable, local-disk latency                                                                             |
| **Remote durable** | Local disk, plus a Parquet copy in the object store  | Still served locally, still accepts late data                                                            |
| **Cold**           | Object store, with metadata and symbol indexes local | Served by range reads. Read-only, unless [late rows](/docs/concepts/cold-storage-late-rows/) are enabled |
| **Expired**        | Removed from the table                               | Objects reclaimed after the grace period                                                                 |

Retaining data after local eviction requires **both** `TO REMOTE` and `DROP LOCAL`. Which stage fires when, and how the four relate, is covered under [storage policy](/docs/concepts/storage-policy/#partition-lifecycle).

## Reads

A cold query does not download the partition. When a partition is switched to remote service, QuestDB keeps its Parquet metadata and symbol indexes on local disk and removes only the large `data.parquet` file. That local metadata maps row groups and column chunks to byte ranges inside the remote object.

1. The planner prunes partitions and resolves the projected columns as usual.
2. The Parquet decoder uses the local metadata to select the row groups and column chunks the query needs.
3. QuestDB issues range reads for exactly those byte ranges.
4. The returned buffers are decoded in memory and SQL execution continues normally.

Adjacent ranges are coalesced into fewer requests, and concurrent reads of the same chunk from the same object share a single in-flight download rather than fetching the same bytes twice. Downloaded chunks are held only while an active read holds a lease on them, and are evicted when the last lease is released. There is no idle warm cache.

Compressed bytes pinned by a query count against that query's memory budget, so a runaway cold scan trips the normal query memory limit rather than exhausting a shared pool. When the coordinator's pending-batch limit is exhausted the query fails fast with a backpressure error instead of queueing without bound.

A query that reaches cold data waits on the object store round trip, so expect higher latency than the same query over local partitions. Narrow timestamp ranges, partition pruning, and projecting only the columns you need all have a direct effect on latency, request count, and memory.

After a restart, a cold read waits up to 10 seconds for the instance to load the table's manifest, then fails with `manifest resolution timed out`. Retry the query once the instance has loaded it.

## What happens to late rows

`DROP LOCAL` is marked by an event in the table's WAL, so every instance agrees on which writes came before it. Before `DROP LOCAL`, an out-of-order write can still land in an uploaded partition, and QuestDB uploads a replacement. After it, what happens to a late row depends on the table:

| Table                                                                              | At `DROP LOCAL`                                                                      | Late rows for the partition                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Without deduplication, [late rows](/docs/concepts/cold-storage-late-rows/) enabled | Becomes a [Delta partition](/docs/concepts/cold-storage-late-rows/#delta-partitions) | Kept, and returned by queries                                                                                                                                          |
| Without deduplication, late rows disabled                                          | Sealed as read-only                                                                  | Dropped, and logged with `o3 ignoring write on read-only partition`. The rest of the transaction applies                                                               |
| With [deduplication](/docs/concepts/deduplication/)                                | Sealed as read-only                                                                  | The table is suspended with `cannot insert into read-only partition`, see [Rows for read-only partitions](/docs/concepts/deduplication/#rows-for-read-only-partitions) |

Removing the storage policy does not unseal a partition. Lengthening `DROP LOCAL`, or [`storage.policy.drop.local.override`](/docs/configuration/storage-policy/#storagepolicydroplocaloverride), downloads a sealed cold partition back to local disk, still read-only, while a Delta partition stays in the object store. Enabling late rows switches sealed partitions to Delta partitions, with [a few exceptions](/docs/concepts/cold-storage-late-rows/#partitions-sealed-before-late-rows-were-enabled).

:::warning

Without late rows, treat `DROP LOCAL` as a hard cutoff, and set it beyond the longest late-arrival, replay and correction window of the table. Late rows are dropped, or suspend a deduplicated table, when they are applied, not rejected at insert time, so test this boundary against your real ingestion.

:::

## Object store layout

Each uploaded version of a partition is a **base**: a standard Parquet file, `data.parquet`, with QuestDB metadata, `_pm`, written once under a key of its own:

```text
<root>/
  _manager.lock
  _tables.msgpack
  _retention/
  trades~5/
    _manifest.msgpack
    1770681600000000-1234-7/
      data.parquet
      _pm
```

The key is `<table directory>/<partition timestamp>-<seqTxn>-<metadata version>/`, with the partition timestamp in the table's timestamp unit. A new upload or a [compaction](/docs/concepts/cold-storage-late-rows/#compaction) writes a new base, and garbage collection deletes the replaced one after a grace period. Bases uploaded before QuestDB Enterprise ENTERPRISE_VERSION_TBD keep their earlier paths, such as `trades~5/year=2026/month=02/day=10/data.parquet`.

External tools may read `data.parquet`, but must take each partition's current object from [`table_cold_partitions()`](/docs/query/functions/meta/#table_cold_partitions), since a partition can have several bases, and late rows are in none until they are [compacted](/docs/query/sql/alter-table-compact/). See [Register QuestDB Parquet as Apache Iceberg tables](/docs/tutorials/questdb-to-iceberg/). Underscore-prefixed objects are QuestDB control data that must not be edited: the catalog of tables, the manifests of bases, and the [pins](/docs/operations/cold-storage/#pins) under `_retention/`.

:::danger

QuestDB must be the only writer to the root. External tools may read `data.parquet`, but replacing, rewriting, or deleting a live object is a data-loss event, as are provider lifecycle rules that archive or expire objects. Do not point two databases at the same root.

:::

Each table's manifest records the bases of every partition. Their states surface in [`table_cold_partitions()`](/docs/query/functions/meta/#table_cold_partitions), one row per partition:

| State      | Meaning                                                                |
| ---------- | ---------------------------------------------------------------------- |
| `pending`  | Upload work is registered but the object is not yet durable            |
| `active`   | The base is durable, and is the one the partition serves or will serve |
| `deleting` | The table no longer references the base; the grace timer is running    |
| `unknown`  | The manifest holds a state this instance does not recognise            |

## Roles

Cold storage splits work between two roles, both of which are independent of the [replication](/docs/high-availability/overview/) primary and replica roles:

| Role          | Responsibility                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manager**   | Uploads snapshots, writes new bases for late rows, writes the catalog and manifests, runs remote garbage collection. Exactly one per database. |
| **Refresher** | The default. Mirrors the catalog and manifests, and installs or removes local cold-partition metadata.                                         |

All four combinations of cold-storage role and replication role are valid.
Running the manager on a replica moves upload, manifest, and garbage-collection work off the primary.

Partition bytes never travel through the replication stream. The `DROP LOCAL` event replicates like any other WAL event, and each instance then reads the shared `data.parquet` object and installs its own local metadata.

The manager role can be moved between instances at runtime with [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/). See [Operating cold storage](/docs/operations/cold-storage/#manager-handoff) for the handoff procedure.

### One root per database

A root records the Data ID of its database, the UUID that [`current_data_id()`](/docs/query/functions/meta/#current_data_id) returns. An instance of another database refuses the root with [`ER010`](/docs/troubleshooting/error-codes/#er010), and a replica behind what the root has published cannot be promoted, with [`ER011`](/docs/troubleshooting/error-codes/#er011). Replicas and restores of a database keep its Data ID, while a [point-in-time recovery](/docs/operations/point-in-time-recovery/#cold-storage) starts a new database, which needs a root of its own.

## Integrity

When a partition switches to remote service, QuestDB records which version of the object it installed, and pins every later read to it. If a read returns anything other than that version, it fails rather than handing back data from the wrong one. Object stores enforce this on QuestDB's behalf; on a filesystem store the check is weaker, which is one more reason QuestDB must be the only writer to the root.

This is a version guard, not an end-to-end checksum.

A legitimate change of version, after restoring onto another host, copying an `fs` root or migrating between backends, heals itself. The first affected read fails with `cold-storage partition stale: ... re-identify needed`, QuestDB re-checks the object in the background, and a retry then succeeds; for a Delta partition, this can take longer. An object with different content, or no longer under its key, keeps failing its reads.

## Restrictions on cold storage tables

These operations would rewrite data that only the object store holds, or break the link between a table's transactions and its bases. A table is *tracked* by cold storage when the root's catalog lists it or it has a manifest, and every table counts as tracked while an instance changes its cold storage role. Each statement's page quotes its error message.

| Operation                                                                                | Refused when                                                                                                   | Instead                                   |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| [`ATTACH PARTITION`](/docs/query/sql/alter-table-attach-partition/)                      | The table is tracked, or its policy has a `TO REMOTE` stage                                                    | Insert the rows                           |
| [`DETACH PARTITION`](/docs/query/sql/alter-table-detach-partition/)                      | The table is tracked, or its policy has a `TO REMOTE` stage. On any table, the partition is read-only or Delta | `DROP PARTITION`                          |
| [`REBASE WAL`](/docs/query/sql/alter-table-rebase-wal/)                                  | The table is tracked, or has a Delta partition                                                                 | None                                      |
| [`SET TYPE`](/docs/query/sql/alter-table-set-type/)                                      | The table is tracked, its policy has a `TO REMOTE` stage, or it has a Delta partition                          | Copy the rows into a new table            |
| [`ALTER COLUMN ... ADD INDEX`](/docs/query/sql/alter-table-alter-column-add-index/)      | A partition is served from cold storage, or is a Delta partition                                               | Create indexes before partitions go cold  |
| [`ADD COLUMN ... INDEX`](/docs/query/sql/alter-table-add-column/)                        | The table has a Delta partition                                                                                | None                                      |
| [`UPDATE`](/docs/query/sql/update/)                                                      | The table has a Parquet partition, cold ones included, or a Delta partition                                    | None                                      |
| [`ALTER COLUMN ... TYPE`](/docs/query/sql/alter-table-change-column-type/)               | The table has a read-only, cold or Delta partition                                                             | Add a column of the new type              |
| [`DEDUP ENABLE`](/docs/query/sql/alter-table-enable-deduplication/)                      | The table has a Delta partition                                                                                | Enable deduplication before late rows     |
| [`CONVERT PARTITION TO NATIVE`](/docs/concepts/parquet/#converting-to-native)            | The partition is read-only, cold, or a Delta partition                                                         | Query the partition in place              |
| [`CONVERT PARTITION TO PARQUET`](/docs/concepts/parquet/#converting-to-parquet)          | The partition is a native Delta partition                                                                      | None                                      |
| [`REINDEX`](/docs/query/sql/reindex/)                                                    | The named partition is a native Delta partition. Without a name, Delta partitions are skipped                  | None                                      |
| [`SET STORAGE POLICY`](/docs/query/sql/alter-table-set-storage-policy/) with `TO REMOTE` | A `SET TYPE` conversion is pending                                                                             | `SET TYPE` to the current type cancels it |

## Limitations

- **WAL tables only.** Remote stages are rejected on non-WAL tables, and the active partition is always excluded.
- **No materialized views.** A materialized view accepts no storage policy at all, so it cannot be tiered to object storage. It uses [TTL](/docs/query/sql/alter-mat-view-set-ttl/) for retention instead.
- **One root per database.** See [One root per database](#one-root-per-database).
- **No downgrade.** Once a cold storage manager of QuestDB Enterprise ENTERPRISE_VERSION_TBD or later starts on a root, earlier releases cannot manage it, so upgrade the manager last. See [Upgrading to ENTERPRISE_VERSION_TBD](/docs/operations/upgrade/#upgrading-to-enterprise_version_tbd).
- **Operator-driven manager failover.** The manager role moves at runtime, but nothing detects manager death or elects a replacement, and a hot-switched role does not survive a restart. On Kubernetes, the [Enterprise Kubernetes Operator](/docs/enterprise-kubernetes-operator/configuration/#cold-storage) declares the manager in `spec.coldStorage.manager` and re-applies it across restarts; electing a replacement is still a human decision.
- **Backups do not contain cold data.** A [`BACKUP DATABASE`](/docs/operations/cold-storage/#backup-and-restore) backup pins the bases it needs in the object store instead. A `CHECKPOINT CREATE` snapshot pins nothing.
- **Lagging instances.** An instance that lags longer than the garbage collection grace periods fails some cold reads until it catches up, see [Remote garbage collection](/docs/operations/cold-storage/#remote-garbage-collection).
- **No idle warm cache.** Chunks are shared only while an active read holds a lease.
- **Fixed key layout.** Object key templates are not configurable.
- **`SHOW PARTITIONS` gained two columns.** `seqTxn` and `isRemotelyServed` are appended, so tools binding result columns by position must be updated.

## See also

- [Late rows in cold storage](/docs/concepts/cold-storage-late-rows/) for keeping rows that arrive after `DROP LOCAL`
- [Storage Policy](/docs/concepts/storage-policy/) for the lifecycle stages and their TTLs
- [Operating cold storage](/docs/operations/cold-storage/) for setup, failover, monitoring, and troubleshooting
- [Cold storage configuration](/docs/configuration/cold-storage/) for every `cold.storage.*` key
- [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/) for moving the manager role
- [`table_cold_partitions()`](/docs/query/functions/meta/#table_cold_partitions) for per-partition remote state
- [Backup and restore](/docs/operations/backup/#cold-storage-partitions) for what a backup does and does not contain
