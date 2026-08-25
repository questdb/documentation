---
title: Cold storage
sidebar_label: Cold storage
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
Four independent age thresholds control local Parquet conversion, upload to the object store, local eviction, and final remote retention.

:::note

Cold storage is available in **QuestDB Enterprise** only, and is disabled by default.

:::

## Requirements

- QuestDB Enterprise, with `cold.storage.enabled=true` on every instance
- A [WAL-enabled table](/docs/concepts/write-ahead-log/) with a [designated timestamp](/docs/concepts/designated-timestamp/) and [partitioning](/docs/concepts/partitions/)
- A [storage policy](/docs/concepts/storage-policy/) carrying a `TO REMOTE` stage
- An object store prefix that every instance can read and exactly one instance can write

Remote stages are rejected on non-WAL tables. Materialized views accept no storage policy at all, so they cannot be tiered to object storage. The active partition is never eligible.

For the configuration keys and the setup procedure, see [Cold storage configuration](/docs/configuration/cold-storage/) and [Operating cold storage](/docs/operations/cold-storage/).

## Partition lifecycle

Cold storage is a lifecycle for whole time partitions, not a whole-table migration and not a local cache of remote data. The unit of movement is always a complete partition.

| Phase              | Where the data is                                    | Behaviour                                     |
| ------------------ | ---------------------------------------------------- | --------------------------------------------- |
| **Hot local**      | Native columns or local Parquet                      | Writable, local-disk latency                  |
| **Remote durable** | Local disk, plus a Parquet copy in the object store  | Still served locally, still accepts late data |
| **Cold**           | Object store, with metadata and symbol indexes local | Read-only, served by range reads              |
| **Expired**        | Removed from the table                               | Objects reclaimed after the grace period      |

Each transition is triggered by one storage policy stage:

```text
             TO PARQUET        TO REMOTE         DROP LOCAL       DROP REMOTE
   Native ───────┬───────────────────┬───────────────┬─────────────────┬──────
                 ▼                   ▼               ▼                 ▼
          Local Parquet      Uploaded, still    Sealed, served    Removed and
                             served locally     from the store    reclaimed
```

`TO PARQUET` and `TO REMOTE` are independent of each other. QuestDB can upload a compact Parquet snapshot while continuing to serve a native local partition, and it can convert to local Parquet without ever uploading.

Retaining data after local eviction requires **both** `TO REMOTE` and `DROP LOCAL`.

:::warning

`DROP LOCAL` without `TO REMOTE` is plain local retention: the partition is deleted and nothing queryable is left behind. Include `TO REMOTE` whenever the partition must stay online after local eviction.

:::

## Reads

A cold query does not download the partition. When a partition is switched to remote service, QuestDB keeps its Parquet metadata and symbol indexes on local disk and removes only the large `data.parquet` file. That local metadata maps row groups and column chunks to byte ranges inside the remote object.

1. The planner prunes partitions and resolves the projected columns as usual.
2. The Parquet decoder uses the local metadata to select the row groups and column chunks the query needs.
3. QuestDB issues range reads for exactly those byte ranges.
4. The returned buffers are decoded in memory and SQL execution continues normally.

Adjacent ranges are coalesced into fewer requests, and concurrent reads of the same chunk from the same object share a single in-flight download rather than fetching the same bytes twice. Downloaded chunks are held only while an active read holds a lease on them, and are evicted when the last lease is released. There is no idle warm cache.

Compressed bytes pinned by a query count against that query's memory budget, so a runaway cold scan trips the normal query memory limit rather than exhausting a shared pool. When the coordinator's pending-batch limit is exhausted the query fails fast with a backpressure error instead of queueing without bound.

A query that reaches cold data waits on the object store round trip, so expect higher latency than the same query over local partitions. Narrow timestamp ranges, partition pruning, and projecting only the columns you need all have a direct effect on latency, request count, and memory.

## Immutability after `DROP LOCAL`

`DROP LOCAL` is the point at which a partition stops being writable. QuestDB
marks the boundary with a seal event in the table's WAL, so every write is
ordered either before the seal or after it, and every instance in the cluster
agrees on where the line falls.

Before the seal, an out-of-order write can still land in an uploaded partition.
QuestDB invalidates the uploaded copy and schedules a replacement upload, so the
remote snapshot never drifts from the table.

After the seal, the partition is read-only:

- Inserts and out-of-order rows targeting a sealed partition are not applied.
- A WAL `UPDATE` that touches a sealed partition is skipped as a whole transaction, including the writable partitions that the same statement matched.
- Disabling or removing the storage policy does not unseal a partition.
- There is no conversion back to native format and no rehydration.

:::warning

Treat `DROP LOCAL` as a hard cutoff. Set it beyond the longest late-arrival, replay, and correction window for the table. Writes that arrive for a sealed partition are skipped at apply time, not rejected at insert time, so test this boundary against your real ingestion pattern.

:::

:::note

Accepting late writes into a sealed partition is in development. Size `DROP LOCAL` for the correction window you have today rather than one you expect to gain: until this ships, the cutoff above is the behaviour to plan against.

:::

## Object store layout

Objects are laid out Hive-style, one directory per partition, so external tools can read `data.parquet` directly:

```text
<root>/
  _manager.lock
  _tables
  trades~5/
    _manifest
    year=2026/month=02/day=10/
      data.parquet
      _pm.a
```

The date segments follow the table's `PARTITION BY` unit. `data.parquet` is standard Parquet and can be catalogued into a data lake, for example by [registering it as Apache Iceberg tables](/docs/tutorials/questdb-to-iceberg/). Every underscore-prefixed object, whatever file extension it carries, is QuestDB control data: it is invisible to Hive readers and must not be edited.

:::danger

QuestDB must be the only writer to the prefix. External tools may read `data.parquet`, but replacing, rewriting, or deleting a live object is a data-loss event, as are provider lifecycle rules that archive or expire objects. Do not point two clusters at the same prefix.

:::

Each table has a manifest recording the remote state of every partition. The states surface in [`table_cold_partitions()`](/docs/query/functions/meta/#table_cold_partitions):

| State      | Meaning                                                                  |
| ---------- | ------------------------------------------------------------------------ |
| `pending`  | Upload work is registered but the object is not yet durable              |
| `live`     | The uploaded snapshot is durable and can be considered for sealing       |
| `sealed`   | The partition is read-only and approved for remote service               |
| `deleting` | The table no longer references the partition; the grace timer is running |

## Roles

Cold storage splits work between two roles, both of which are independent of the [replication](/docs/high-availability/overview/) primary and replica roles:

| Role          | Responsibility                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| **Manager**   | Uploads snapshots, writes the catalog and manifests, runs remote garbage collection. Exactly one per cluster. |
| **Refresher** | The default. Mirrors the catalog and manifests, and installs or removes local cold-partition metadata.        |

All four combinations of cold-storage role and replication role are valid.
Running the manager on a replica moves upload, manifest, and garbage-collection work off the primary.

Partition bytes never travel through the replication stream. The seal replicates like any other WAL event, and each instance then reads the shared `data.parquet` object and installs its own local metadata.

The manager role can be moved between instances at runtime with [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/). See [Operating cold storage](/docs/operations/cold-storage/#manager-handoff) for the handoff procedure.

## Integrity

When a partition switches to remote service, QuestDB records which version of the object it installed, and pins every later read to it. If a read returns anything other than that version, it fails rather than handing back data from the wrong one. Object stores enforce this on QuestDB's behalf; on a filesystem store the check is weaker, which is one more reason QuestDB must be the only writer to the prefix.

This is a version guard, not an end-to-end checksum.

A legitimate change of version, after restoring onto a different host or migrating between backends, heals itself. The first affected read fails, QuestDB re-checks the object in the background, and adopts it if it is still the partition it expects. Retry the query and it succeeds. An object that is genuinely different is refused rather than adopted.

## Limitations

- **No rehydration.** A cold partition cannot be converted back to native format or made writable again.
- **WAL tables only.** Remote stages are rejected on non-WAL tables, and the active partition is always excluded.
- **No materialized views.** A materialized view accepts no storage policy at all, so it cannot be tiered to object storage. It uses [TTL](/docs/query/sql/alter-mat-view-set-ttl/) for retention instead.
- **No downgrade after the first upload.** Enabling remote upload is a one-way version change.
- **Upgrade replicas first.** Older instances and open source nodes do not understand the seal event and suspend WAL apply rather than skipping it.
- **Operator-driven manager failover.** The manager role moves at runtime, but nothing detects manager death or elects a replacement, and a hot-switched role does not survive a restart.
- **No idle warm cache.** Chunks are shared only while an active read holds a lease.
- **Fixed key layout.** Object key templates are not configurable.
- **`SHOW PARTITIONS` gained two columns.** `seqTxn` and `isRemotelyServed` are appended, so tools binding result columns by position must be updated.

## See also

- [Storage Policy](/docs/concepts/storage-policy/) for the lifecycle stages and their TTLs
- [Operating cold storage](/docs/operations/cold-storage/) for setup, failover, monitoring, and troubleshooting
- [Cold storage configuration](/docs/configuration/cold-storage/) for every `cold.storage.*` key
- [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/) for moving the manager role
- [`table_cold_partitions()`](/docs/query/functions/meta/#table_cold_partitions) for per-partition remote state
