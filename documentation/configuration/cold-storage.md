---
title: Cold storage
description:
  Configuration settings for QuestDB Enterprise cold storage, covering the
  object store connection, roles, upload, read path, and garbage collection.
---

:::note

Cold storage is [Enterprise](/enterprise/) only.

:::

[Cold storage](/docs/concepts/cold-storage/) moves historical partitions to an object store as Parquet and serves them with range reads. These settings control the store connection, which instance owns write access, how partitions are uploaded, how cold reads fetch and cache bytes, and when remote objects are reclaimed.

Cold storage runs on its own dedicated async runtime, isolated from WAL, backup, and replication I/O.

None of these settings are reloadable: changing any of them requires a restart.

While `cold.storage.enabled` is `false`, `cold.storage.*` keys are skipped entirely during configuration parsing, so a malformed value cannot prevent startup with the feature off. The `delta.*` keys are always parsed: an invalid value stops startup even with cold storage disabled.

The partition lifecycle itself is driven by the shared storage policy worker pool. See [Storage policy configuration](/docs/configuration/storage-policy/) for `storage.policy.*`.

## General

### cold.storage.enabled

- **Default**: `false`
- **Reloadable**: no

Master switch. When `false`, cold storage is inert and all other `cold.storage.*` keys are ignored.

Turning it off on an instance that already holds cold partitions keeps them in their tables: a query that reads a partition only the object store holds fails with `partition <partition> of table <table> is in cold storage, which is disabled on this instance`, and `DROP LOCAL` deletes local partitions that keep [late rows](/docs/concepts/cold-storage-late-rows/), including late rows not yet uploaded. See [Disabling cold storage](/docs/operations/cold-storage/#disabling-cold-storage).

### cold.storage.object.store

- **Default**: none, required when cold storage is enabled
- **Reloadable**: no

Object store connection string, using the same syntax as `replication.object.store` and `backup.object.store`:

```ini
cold.storage.object.store=s3::bucket=my-bucket;root=cold;region=eu-west-1;
cold.storage.object.store=azblob::endpoint=https://acct.blob.core.windows.net;container=data;root=cold;account_name=acct;
cold.storage.object.store=gcs::bucket=my-bucket;root=cold;
cold.storage.object.store=fs::root=/mnt/cold/final;atomic_write_dir=/mnt/cold/scratch;
```

Use a root dedicated to one database: an instance of another database refuses it with [`ER010`](/docs/troubleshooting/error-codes/#er010). Prefer instance roles or workload identities over embedded credentials. The value can be loaded from a file with `QDB_COLD_STORAGE_OBJECT_STORE_FILE`.

The format is `scheme::key1=value1;key2=value2;` and is shared by every QuestDB object store setting, so provider setup is documented once. The store must support conditional requests, and an `fs` root must be on a filesystem that supports hard links, see [Prepare the object store root](/docs/operations/cold-storage/#1-prepare-the-object-store-root). For bucket creation and credentials, see [Configure object storage](/docs/high-availability/setup/#1-configure-object-storage); the connection strings shown there apply unchanged here.

For a store fronted by a private, internal, or self-signed CA, the string also accepts the `ca_cert_file` and `ca_builtin_roots` TLS parameters. See [TLS with a private or self-signed CA](/docs/high-availability/setup/#tls-with-a-private-or-self-signed-ca).

### cold.storage.role

- **Default**: `refresher`
- **Reloadable**: no

The role this instance boots into, either `manager` or `refresher`. Designate exactly **one** instance in the cluster as `manager`; it owns uploads, catalog and manifest writes, and remote garbage collection.

The role is independent of the replication primary and replica roles, and is enforced at runtime by a lock at the object store root. A second instance configured as `manager` finds the foreign lock and starts as a refresher rather than competing.

The live role can be moved at runtime with [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/), but a hot-switched role reverts to this value on restart.

### cold.storage.linked.object.stores

- **Default**: empty
- **Reloadable**: no

Connection strings for the roots a database inherited cold partitions from in a [point-in-time recovery](/docs/operations/point-in-time-recovery/#cold-storage), as comma-separated `<root_id>=<connection string>` entries:

```ini
cold.storage.linked.object.stores=<root_id>=s3::bucket=old-bucket;root=cold;region=eu-west-1;
```

The restore, and the manager of each root, log the `root_id` to use. Without an entry, an instance opens a source root at the location the restore recorded, with its ambient credentials, and only for an S3 or GCS location without `endpoint`. Set an entry on every instance of the recovered database for a root on Azure or `fs`, behind a custom endpoint, a private CA (`ca_cert_file`) or an assumed role (`role_arn`), and whenever the instance's ambient credentials cannot reach the root. Without an entry for a location that needs one, the restore fails with `the linked cold storage root has no entry in cold.storage.linked.object.stores, and its location needs one`.

The value is sensitive, like `cold.storage.object.store`, and can be loaded from a file with `QDB_COLD_STORAGE_LINKED_OBJECT_STORES_FILE`. An entry that does not parse fails startup; the error names it by position or `root_id`, never by its connection string.

## Runtime

### cold.storage.async.io.threads

- **Default**: half the CPU cores, at least `1`
- **Reloadable**: no

Threads of the cold storage runtime that run object store requests and other asynchronous I/O.

### cold.storage.max.blocking.threads

- **Default**: twice the CPU cores, at least `4`
- **Reloadable**: no

Maximum number of threads the cold storage runtime starts for blocking work, such as local disk I/O. They start on demand and stop when idle.

## Garbage collection

### cold.storage.gc.enabled

- **Default**: `true`
- **Reloadable**: no

Whether the manager reclaims remote objects for partitions the table no longer references. This is the only path that physically deletes remote data, and it should stay enabled during normal operation. Disable it temporarily when promoting a replica to manager and replica catch-up cannot be verified.

### cold.storage.gc.partition.grace.period

- **Default**: `30m`
- **Reloadable**: no

How long a partition stays marked for deletion before its objects are removed. The window lets in-flight readers drain, and lets WAL apply restore a partition that a lagging replica-turned-manager has not caught up on. Capped at 24 hours.

The same grace applies to a base replaced by a newer upload or a compaction. An instance stopped or behind on replication for longer than the grace fails reads of the partitions dropped or replaced meanwhile, until it catches up, so set both grace periods to cover the longest time an instance may stay stopped or behind, and no lower than 10 minutes. A [pinned](/docs/operations/cold-storage/#pins) base outlives the grace until it is unpinned.

### cold.storage.gc.table.grace.period

- **Default**: `60m`
- **Reloadable**: no

How long a dropped table's objects are retained before removal. The table's local files go once the catalog records the drop, without waiting for this period. A [pinned](/docs/operations/cold-storage/#pins) base, and the table's manifest, outlive it until they are unpinned. Capped at 7 days. Size it as advised under [`cold.storage.gc.partition.grace.period`](#coldstoragegcpartitiongraceperiod).

## Catalog and manifests

### cold.storage.catalog.refresh.interval

- **Default**: `10s`
- **Reloadable**: no

How often a refresher polls the cold table catalog for a generation change. This bounds how quickly a refresher notices new remote partitions.

### cold.storage.manifest.flush.interval

- **Default**: `1s`
- **Reloadable**: no

How often the manager writes pending partition state changes to the table manifests in the object store. Changes within one interval are written together, so this bounds how long a change waits before it is durable. Must be greater than `0`.

## Upload

### cold.storage.max.concurrent.uploads

- **Default**: `10`
- **Reloadable**: no

How many cold storage transfers run at once across the whole instance. Rehydrates, which download a sealed cold partition back to local disk after its `DROP LOCAL` was lengthened, share this limit and may use up to half of it.

The upload bandwidth must exceed this value multiplied by `cold.storage.object.store.upload.requests.min.throughput`, 256 KiB/s by default. Otherwise large uploads can repeatedly time out and stop cold offload from progressing; lower the concurrency on slower links.

### cold.storage.multipart.part.size

- **Default**: `64 MiB`
- **Reloadable**: no

Multipart upload part size. Must be between 5 MiB and 5 GiB.

### cold.storage.policy.cold.switch.lease.interval

- **Default**: `1m`
- **Reloadable**: no

How long the storage policy waits for a step it started on a partition, such as a cold switch, to apply before it starts that step again. Set it above the time such a step normally takes; a step started twice applies once. Must be greater than `0` and at most 76 hours.

### cold.storage.policy.max.partitions.in.flight.per.table

- **Default**: `8`
- **Reloadable**: no

Per table, how many partitions upload at once, and separately how many rehydrate at once, so one table cannot take every transfer. `0` removes the cap.

### cold.storage.policy.rehydrate.retry.interval

- **Default**: `5m`
- **Reloadable**: no

How long a failed rehydrate waits before it is retried. `0` retries without waiting. Must be at most 76 hours.

### cold.storage.upload.settle.interval

- **Default**: `5m`
- **Reloadable**: no

Debounce between re-uploads of a partition that a later out-of-order write re-dirtied. The initial upload is immediate; only re-uploads are debounced, which rate-limits a churning historical partition to one upload per window. `0` disables the debounce.

## Late rows

### cold.storage.delta.enabled

- **Default**: `false`
- **Reloadable**: no

Whether partitions keep [late rows](/docs/concepts/cold-storage-late-rows/) after `DROP LOCAL`, instead of being sealed as read-only. It applies to WAL tables without deduplication whose storage policy has a `TO REMOTE` stage, and is read only when `cold.storage.enabled` is `true`.

Set it only once every instance runs a release that supports it, and set it the same on every instance: only the primary acts on it, so a replica that may be promoted needs it too. Turning it off again stops new switches, but existing [Delta partitions](/docs/concepts/cold-storage-late-rows/#delta-partitions) keep accepting late rows.

## Maintenance

These settings control the background work that merges late rows and moves them into new Parquet bases. See [Compaction](/docs/concepts/cold-storage-late-rows/#compaction).

### cold.storage.maintenance.base.delta.ratio

- **Default**: `0.25`
- **Reloadable**: no

The manager writes a new base for a partition once its late rows reach this fraction of the size of its base, and at least `cold.storage.maintenance.base.min.delta.bytes`. Must be finite and `0` or greater.

### cold.storage.maintenance.base.min.delta.bytes

- **Default**: `128M`
- **Reloadable**: no

The least amount of late rows, in bytes, for which the manager writes a new base in the background. Must be `0` or greater.

### cold.storage.maintenance.retry.delay

- **Default**: `30s`
- **Reloadable**: no

How long a refused or failed maintenance step waits before its retry. Must be greater than `0`.

### cold.storage.maintenance.worker.count

- **Default**: half the CPU cores, at least `1`
- **Reloadable**: no

Threads of the cold storage maintenance pool, which writes and installs new bases. Must be greater than `0`.

### delta.maintenance.hint.delay

- **Default**: `2s`
- **Reloadable**: no

How long maintenance waits after a write before it visits the table, so that several writes are handled together. Must be `0` or greater. Read even when cold storage is disabled.

### delta.maintenance.sweep.interval

- **Default**: `5m`
- **Reloadable**: no

How often maintenance visits every table with late rows. It bounds how soon a partition that keeps late rows becomes remotely served after `DROP LOCAL`. Must be greater than `0`. Read even when cold storage is disabled.

### delta.maintenance.worker.count

- **Default**: half the CPU cores, at least `1`
- **Reloadable**: no

Threads of the pool that merges runs of late rows on local disk. Must be greater than `0`. Read even when cold storage is disabled.

## Read path

### cold.storage.read.coalesce.max.gap

- **Default**: `0`
- **Reloadable**: no

Largest byte gap that may be bridged when merging two chunk reads into one range request. `0` merges only adjacent chunks, so no unselected bytes are ever fetched. Raising it trades wasted bytes for fewer requests. Must be `0` or greater.

### cold.storage.read.coalesce.max.span

- **Default**: `64 MiB`
- **Reloadable**: no

Upper bound on the span of a single coalesced range request. A lone chunk larger than this is never split. `0` disables coalescing, producing one request per chunk.

### cold.storage.read.max.in.flight

- **Default**: `64`
- **Reloadable**: no

Cap on concurrent cold read chunk downloads.

### cold.storage.read.max.pending.batches

- **Default**: `10000`
- **Reloadable**: no

Cap on the cold read batches waiting for downloads at once on this instance. When it is reached, a query that needs chunks not yet downloaded fails at once with `cold-storage backpressure exceeded: too many pending batches` rather than waiting.

## Object store requests

A transfer times out once it runs longer than its base timeout plus the time its bytes take at its minimum throughput, so a large transfer gets more time.

### cold.storage.object.store.download.requests.base.timeout

- **Default**: `30000` (milliseconds)
- **Reloadable**: no

Base timeout of a download from the object store, cold reads and rehydrates included. Must be greater than `0`.

### cold.storage.object.store.download.requests.min.throughput

- **Default**: `262144` (bytes per second)
- **Reloadable**: no

Minimum average throughput a download must keep. `0` leaves only the base timeout.

### cold.storage.object.store.requests.per.second

- **Default**: `0`
- **Reloadable**: no

Client-side request rate limit against the object store. `0` disables the limit.

### cold.storage.object.store.requests.retry.attempts

- **Default**: `3`
- **Reloadable**: no

Retries beyond the initial attempt on transient transport errors.

### cold.storage.object.store.requests.retry.interval

- **Default**: `5s`
- **Reloadable**: no

Base interval between retries, jittered by plus or minus 20 percent.

### cold.storage.object.store.upload.requests.base.timeout

- **Default**: `30000` (milliseconds)
- **Reloadable**: no

Base timeout of an upload to the object store. Must be greater than `0`.

### cold.storage.object.store.upload.requests.min.throughput

- **Default**: `262144` (bytes per second)
- **Reloadable**: no

Minimum average throughput an upload must keep. `0` leaves only the base timeout. See [`cold.storage.max.concurrent.uploads`](#coldstoragemaxconcurrentuploads) for sizing it against the link.

## Advanced late-row storage

These settings tune how late rows are stored on local disk. The defaults suit most deployments. They are read at every startup, even with cold storage disabled, and an invalid value stops startup.

### delta.catalog.validation

- **Default**: `none`
- **Reloadable**: no

Optional checks when QuestDB opens the local catalog of a partition's late rows: `none`, or `crc` to also verify checksums. Structural checks always run.

### delta.index.sort.max.bytes

- **Default**: `64M`
- **Reloadable**: no

Memory used to sort one index of late rows before the writer spills sorted parts to disk. Must be `8` or greater.

### delta.placement.roots

- **Default**: empty
- **Reloadable**: no

Local directories that hold the late-row files, as comma-separated `<class>=<absolute directory>` entries. QuestDB writes late rows in class `0`, so `0=/mnt/fast/delta` places new late-row files under `/mnt/fast/delta` instead of the partition directory. Empty keeps them in the partition directory. Each directory must exist; an invalid entry or a missing directory stops startup. Files never move once written, so keep a directory configured while it holds files.

### delta.run.page.target.rows

- **Default**: `65536`
- **Reloadable**: no

Target number of rows per independently decodable page in a run of late rows. Must be a multiple of `1024`, from `1024` to `2147482624`.
