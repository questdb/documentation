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

## storage.policy.drop.local.override

- **Default**: none
- **Reloadable**: no

Keeps this instance's local copies of partitions longer than the table's
`DROP LOCAL` stage, as `<tableDirName>=<interval>` entries separated by `;`.
`*` sets the interval for every table, and a table's own entry wins. The
interval takes the same values as `DROP LOCAL`, such as `90 DAYS` or `3M`, and
must be positive; an invalid entry stops startup.

```ini
storage.policy.drop.local.override=trades~5=90 DAYS;*=45 DAYS
```

`DROP LOCAL` then removes a partition on this instance only once both the
table's `DROP LOCAL` and the override have passed. The other instances drop
their copies on schedule. Lengthening the override brings sealed cold partitions
back to local disk, but not
[Delta partitions](/docs/concepts/cold-storage-late-rows/#delta-partitions),
which stay served from the object store. Enabling late rows switches most sealed
partitions, cold ones included, to Delta partitions. On the primary, a partition
the override still keeps also holds back `DROP REMOTE` for the whole cluster.

The table directory name is the `directoryName` column of
[`tables()`](/docs/query/functions/meta/#tables), such as `trades~5`.

## storage.policy.max.reschedule.count

This setting is obsolete and has no effect. With
[`config.validation.strict=true`](/docs/configuration/overview/#config-validation),
it stops startup; otherwise startup logs it as obsolete. Remove it from
`server.conf`.

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
