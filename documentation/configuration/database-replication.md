---
title: Replication
description: Configuration settings for database replication in QuestDB Enterprise.
---

:::note

Replication is [Enterprise](/enterprise/) only.

:::

Replication enables high availability clusters by streaming WAL segments to an
object store, where replica instances pick them up. These settings control
the primary's upload behavior, replica polling, object store request handling,
and WAL cleanup.

For setup instructions, see the
[replication operations](/docs/high-availability/setup/) guide.

For an overview of the concept, see the
[replication concept](/docs/high-availability/overview/) page.

For a tuning guide, see the
[replication tuning guide](/docs/high-availability/tuning/).

## General

### replication.object.store

- **Default**: none
- **Reloadable**: no

A configuration string for connecting to an object store. The format is
`scheme::key1=value;key2=value2;…`. Ignored if replication is disabled.

### replication.role

- **Default**: `none`
- **Reloadable**: no

Defaults to `none` for stand-alone instances. To enable replication, set to
one of: `primary`, `replica`.

### replication.summary.interval

- **Default**: `1m`
- **Reloadable**: no

Frequency for printing replication progress summary in the logs.

## Primary settings

### cairo.wal.segment.rollover.size

- **Default**: `2097152`
- **Reloadable**: no

The size of the WAL segment before it is rolled over. Default is 2 MiB.
Defaults to `0` unless `replication.role=primary` is set.

### cairo.writer.command.queue.capacity

- **Default**: `32`
- **Reloadable**: no

Maximum writer ALTER TABLE and replication command capacity. Shared between
all tables.

### replication.primary.checksum

- **Default**: service-dependent
- **Reloadable**: no

Whether a checksum should be calculated for each uploaded artifact. Required
for some object stores. Options: `never`, `always`.

### replication.primary.compression.level

- **Default**: `1`
- **Reloadable**: no

Zstd compression level. Valid values are from 1 to 22.

### replication.primary.compression.threads

- **Default**: calculated (half the number of CPU cores)
- **Reloadable**: no

Maximum number of threads used to perform file compression operations before
uploading to the object store.

### replication.primary.sequencer.part.txn.count

- **Default**: `5000`
- **Reloadable**: no

Sets the transaction chunking size for each compressed batch. Smaller is
better for constrained networks but more costly.

### replication.primary.throttle.window.duration

- **Default**: `10000`
- **Reloadable**: no

The millisecond duration of the sliding window used to process replication
batches.

### replication.primary.upload.truncated

- **Default**: `true`
- **Reloadable**: no

Skip trailing, empty column data inside a WAL column file.

## Replica settings

### replication.replica.poll.interval

- **Default**: `1000`
- **Reloadable**: no

Millisecond polling rate for a replica instance to check for new changes.

## Request settings

### replication.requests.base.timeout

- **Default**: `10s`
- **Reloadable**: no

Replication upload/download request timeout.

### replication.requests.buffer.size

- **Default**: `32768`
- **Reloadable**: no

Buffer size used for object-storage downloads.

### replication.requests.max.batch.size.fast

- **Default**: `64`
- **Reloadable**: no

Number of parallel requests allowed during the fast process (non-resource
constrained).

### replication.requests.max.batch.size.slow

- **Default**: `2`
- **Reloadable**: no

Number of parallel requests allowed during the slow process (error/resource
constrained path).

### replication.requests.max.concurrent

- **Default**: `0`
- **Reloadable**: no

Limit on the number of concurrent object store requests. `0` means unlimited.

### replication.requests.min.throughput

- **Default**: `262144`
- **Reloadable**: no

Expected minimum network speed for replication transfers. Used to expand the
timeout and account for network delays.

### replication.requests.retry.attempts

- **Default**: `3`
- **Reloadable**: no

Maximum number of times to retry a failed object store request before logging
an error and reattempting later after a delay.

### replication.requests.retry.interval

- **Default**: `200`
- **Reloadable**: no

How long to wait in milliseconds before retrying a failed operation.

## Metrics

### replication.metrics.dropped.table.poll.count

- **Default**: `10`
- **Reloadable**: no

How many scrapes of the Prometheus metrics endpoint before dropped tables
will no longer appear.

### replication.metrics.per.table

- **Default**: `true`
- **Reloadable**: no

Enable per-table replication metrics on the Prometheus metrics endpoint.

## WAL cleaner

The WAL cleaner removes obsolete WAL data from object storage after it has
been consumed by all replicas and retained for the configured backup window.

### replication.primary.cleaner.backup.window.count

- **Default**: `backup.cleanup.keep.latest.n` or `5`
- **Reloadable**: no

Minimum complete backups/checkpoints per instance before cleanup starts.
Defaults to `backup.cleanup.keep.latest.n` if backups are enabled, otherwise
`5`.

### replication.primary.cleaner.checkpoint.source

- **Default**: `true`
- **Reloadable**: no

Use checkpoint history as a cleanup trigger source.

### replication.primary.cleaner.delete.concurrency

- **Default**: 4 to 12 (auto)
- **Reloadable**: no

Concurrent deletion tasks. Derived from `replication.requests.max.concurrent`.
Range: 4 to 32.

### replication.primary.cleaner.dropped.table.cooloff

- **Default**: `1h`
- **Reloadable**: no

Wait time after `DROP TABLE` before removing the table's data from object
storage. Guards against clock skew.

### replication.primary.cleaner.enabled

- **Default**: `true`
- **Reloadable**: no

Master switch for the WAL cleaner.

### replication.primary.cleaner.interval

- **Default**: `10m`
- **Reloadable**: no

Time between cleanup cycles. Range: 1s to 24h.

### replication.primary.cleaner.max.requests.per.second

- **Default**: service-dependent
- **Reloadable**: no

Rate limit for object store delete requests. Set to `0` for unlimited.
Range: 0 to 10000.

### replication.primary.cleaner.progress.write.interval

- **Default**: `5s`
- **Reloadable**: no

How often progress is persisted during a cleanup cycle. Lower values mean
less re-work after a crash but more writes. Range: 100ms to 60s.

### replication.primary.cleaner.retry.attempts

- **Default**: `20`
- **Reloadable**: no

Retries for transient object store failures during cleanup. Range: 0 to 100.

### replication.primary.cleaner.retry.interval

- **Default**: `2s`
- **Reloadable**: no

Delay between cleanup retries. Range: 0 to 5m.

## Checkpoint history

### checkpoint.history.enabled

- **Default**: `true` (when replication is enabled)
- **Reloadable**: no

Enable the checkpoint history tracker. Requires replication.

### checkpoint.history.keep.count

- **Default**: `100`
- **Reloadable**: no

Maximum checkpoint records retained per instance.

### checkpoint.history.long.retry.interval

- **Default**: `1m`
- **Reloadable**: no

Retry interval for syncing checkpoint history to the object store after burst
retries fail.

## Native I/O threads

### native.async.io.threads

- **Default**: CPU count
- **Reloadable**: no

The number of async (network) I/O threads used for replication and cold
storage. The default should be appropriate for most use cases.

### native.max.blocking.threads

- **Default**: CPU count x 4
- **Reloadable**: no

Maximum number of threads for parallel blocking disk I/O read/write
operations for replication. These threads are ephemeral: spawned as needed
and shut down after a short idle period. They are not CPU-bound, hence the
relatively large count. The default should be appropriate for most use cases.
