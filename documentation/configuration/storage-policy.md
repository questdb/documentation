---
title: Storage policy
description: Configuration settings for storage policies in QuestDB Enterprise.
---

:::note

Storage policy is [Enterprise](/enterprise/) only.

:::

Storage policies automate partition lifecycle management: they convert older
partitions to Parquet, upload them to object storage, and drop local and remote
copies on a schedule. These settings control the scan interval, retry behavior,
and worker threads for the storage policy engine, which drives every lifecycle
stage including the remote ones.

For details, see the
[storage policy concept](/docs/concepts/storage-policy/) page. The object store
connection and the cold-read path are configured separately, under
[cold storage](/docs/configuration/cold-storage/).

## storage.policy.check.interval

- **Default**: `5m`
- **Reloadable**: no

How often QuestDB scans for partitions to process. This is a backstop full
sweep: lifecycle transitions such as an applied partition seal or a manifest
flush also trigger a recheck, so convergence is not bound to this interval.

## storage.policy.recheck.drain.interval

- **Default**: `1s`
- **Reloadable**: no

How often coalesced recheck requests are drained, off the worker hot loop.
Requests coalesce per table, so a burst affecting one table costs a single
recheck. This paces convergence latency rather than `storage.policy.check.interval`.

## storage.policy.max.reschedule.count

- **Default**: `20`
- **Reloadable**: no

Maximum number of retries before abandoning a storage policy task.

## storage.policy.retry.interval

- **Default**: `1m`
- **Reloadable**: no

Retry interval for failed storage policy tasks.

## storage.policy.worker.affinity

- **Default**: `-1`
- **Reloadable**: no

CPU affinity for each storage policy worker thread (comma-separated list).
`-1` means no affinity.

## storage.policy.worker.count

- **Default**: `4`
- **Reloadable**: no

Number of storage policy worker threads. Setting to `0` disables the feature,
including the upload and cold-switch path used by
[cold storage](/docs/concepts/cold-storage/), so it must be greater than `0` for
remote stages to run.

## storage.policy.worker.haltOnError

- **Default**: `false`
- **Reloadable**: no

Whether a storage policy worker thread halts when it hits an unhandled error.

## storage.policy.worker.nap.threshold

- **Default**: `100`
- **Reloadable**: no

Number of idle worker-loop iterations before a storage policy worker naps.

## storage.policy.worker.sleep.threshold

- **Default**: `500`
- **Reloadable**: no

Number of idle worker-loop iterations before a storage policy worker sleeps.

## storage.policy.worker.sleep.timeout

- **Default**: `100ms`
- **Reloadable**: no

Sleep duration when a storage policy worker has no tasks to process.

## storage.policy.worker.yield.threshold

- **Default**: `10`
- **Reloadable**: no

Number of idle worker-loop iterations before a storage policy worker yields.
