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

While `cold.storage.enabled` is `false`, cold storage keys are skipped entirely during configuration parsing, so a malformed value cannot prevent startup with the feature off.

The partition lifecycle itself is driven by the shared storage policy worker pool. See [Storage policy configuration](/docs/configuration/storage-policy/) for `storage.policy.*`.

## General

### cold.storage.enabled

- **Default**: `false`
- **Reloadable**: no

Master switch. When `false`, cold storage is inert and all other `cold.storage.*` keys are ignored.

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

Use a prefix dedicated to one cluster, and prefer instance roles or workload identities over embedded credentials. The value can be loaded from a file with `QDB_COLD_STORAGE_OBJECT_STORE_FILE`.

The format is `scheme::key1=value1;key2=value2;` and is shared by every QuestDB object store setting, so provider setup is documented once. For bucket creation, credentials, and the NFS mount requirements, see [Configure object storage](/docs/high-availability/setup/#1-configure-object-storage); the connection strings shown there apply unchanged here.

For a store fronted by a private, internal, or self-signed CA, the string also accepts the `ca_cert_file` and `ca_builtin_roots` TLS parameters. See [TLS with a private or self-signed CA](/docs/high-availability/setup/#tls-with-a-private-or-self-signed-ca).

### cold.storage.role

- **Default**: `refresher`
- **Reloadable**: no

The role this instance boots into, either `manager` or `refresher`. Designate exactly **one** instance in the cluster as `manager`; it owns uploads, catalog and manifest writes, and remote garbage collection.

The role is independent of the replication primary and replica roles, and is enforced at runtime by a lock at the object store root. A second instance configured as `manager` finds the foreign lock and starts as a refresher rather than competing.

The live role can be moved at runtime with [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/), but a hot-switched role reverts to this value on restart.

## Garbage collection

### cold.storage.gc.enabled

- **Default**: `true`
- **Reloadable**: no

Whether the manager reclaims remote objects for partitions the table no longer references. This is the only path that physically deletes remote data, and it should stay enabled during normal operation. Disable it temporarily when promoting a replica to manager and replica catch-up cannot be verified.

### cold.storage.gc.partition.grace.period

- **Default**: `30m`
- **Reloadable**: no

How long a partition stays marked for deletion before its objects are removed. The window lets in-flight readers drain, and lets WAL apply restore a partition that a lagging replica-turned-manager has not caught up on. Capped at 24 hours.

### cold.storage.gc.table.grace.period

- **Default**: `60m`
- **Reloadable**: no

How long a dropped table's objects are retained before removal. Local removal of the table is also gated on its remote objects being reclaimed. Capped at 7 days.

## Catalog

### cold.storage.catalog.refresh.interval

- **Default**: `10s`
- **Reloadable**: no

How often a refresher polls the cold table catalog for a generation change. This bounds how quickly a refresher notices new remote partitions.

## Upload

### cold.storage.max.concurrent.uploads

- **Default**: `32`
- **Reloadable**: no

Cap on concurrent partition uploads across the whole instance.

### cold.storage.multipart.part.size

- **Default**: `64 MiB`
- **Reloadable**: no

Multipart upload part size. Must be between 5 MiB and 5 GiB.

### cold.storage.upload.settle.interval

- **Default**: `5m`
- **Reloadable**: no

Debounce between re-uploads of a partition that a later out-of-order write re-dirtied. The initial upload is immediate; only re-uploads are debounced, which rate-limits a churning historical partition to one upload per window. `0` disables the debounce.

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

## Object store requests

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
