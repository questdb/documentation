---
title: Storage policy
description: Configuration settings for storage policies in QuestDB Enterprise.
---

:::note

Storage policy is [Enterprise](/enterprise/) only.

:::

Storage policies automate partition lifecycle management, including local
deletion and cold storage offloading. These settings control the scan interval,
retry behavior, and worker threads for the storage policy engine.

For details, see the
[storage policy concept](/docs/concepts/storage-policy/) page.

## storage.policy.check.interval

- **Default**: `15m`
- **Reloadable**: no

How often QuestDB scans for partitions to process.

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

- **Default**: `2`
- **Reloadable**: no

Number of storage policy worker threads. Setting to `0` disables the feature.

## storage.policy.worker.sleep.timeout

- **Default**: `100ms`
- **Reloadable**: no

Sleep duration when a storage policy worker has no tasks to process.

## storage.policy.writer.wait.timeout

- **Default**: `30s`
- **Reloadable**: no

Timeout for acquiring the table writer during storage policy operations.
