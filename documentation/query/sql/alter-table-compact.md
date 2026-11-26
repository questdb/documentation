---
title: ALTER TABLE COMPACT (cold storage)
sidebar_label: COMPACT
description:
  ALTER TABLE COMPACT SQL keyword reference documentation. Compact the late
  rows of cold storage partitions on demand, or cancel requested compactions.
---

Moves the [late rows](/docs/concepts/cold-storage-late-rows/) that cold storage partitions keep on local disk into new Parquet objects now, instead of when background maintenance reaches its thresholds, for example before an external tool reads the objects. `COMPACT CANCEL` cancels such requests.

:::note

`ALTER TABLE COMPACT` is available in **QuestDB Enterprise** ENTERPRISE_VERSION_TBD and later. It is unrelated to the compaction of [merge-append partitions](/docs/concepts/merge-append-partitions/#compaction).

:::

## Syntax

```questdb-sql title="Compact partitions"
ALTER TABLE tableName COMPACT [BASE | RESIDUAL] PARTITION
    { LIST 'partitionName' [, 'partitionName' ...] | WHERE timestampCondition };
```

```questdb-sql title="Cancel requested compactions"
ALTER TABLE tableName COMPACT CANCEL;
```

## Description

`COMPACT` queues the selected [Delta partitions](/docs/concepts/cold-storage-late-rows/#delta-partitions) and returns at once. The work runs on the instance that received the statement, and appears in that instance's [`cold_storage_compactions()`](/docs/query/functions/meta/#cold_storage_compactions).

| Mode              | What it does                                                 | Runs on                  | `kind`     |
| ----------------- | ------------------------------------------------------------ | ------------------------ | ---------- |
| `BASE`            | Writes the late rows into a new Parquet base, and uploads it | The cold storage manager | `base`     |
| `RESIDUAL`        | Merges the runs of late rows on local disk                   | Any instance             | `residual` |
| Neither (default) | Both                                                         | The cold storage manager | `full`     |

- **`LIST`** names partitions in the table's partition name format, such as `'2026-02-10'`. If one is refused, nothing is queued.
- **`WHERE`** is a condition on the designated timestamp, tested against each partition's start, as for [`DROP PARTITION`](/docs/query/sql/alter-table-drop-partition/). Partitions that `COMPACT` does not accept are skipped.

`COMPACT` accepts a Delta partition once it has received a late row, or once its local copy is due for removal at `DROP LOCAL`. `COMPACT CANCEL` stops the table's requested compactions on this instance, not background maintenance.

### When a compaction waits or fails

A request waits while maintenance works on the same partition, or while a query, checkpoint or save point still reads the base it would replace. A `BASE` or default request fails, with the reason in `cold_storage_compactions()`, when:

- this instance still keeps the partition's base local, because of `DROP LOCAL` or [`storage.policy.drop.local.override`](/docs/configuration/storage-policy/#storagepolicydroplocaloverride). After a restart, this applies to every Delta partition until the storage policies are loaded,
- replication or a save point stalls for 60 seconds short of the partition's transaction,
- the table lags behind the partition, as a suspended table does, or ingestion into the partition leaves no gap.

Run the statement again once the cause is gone.

### Confirm the result

A finished compaction leaves `cold_storage_compactions()`. Its new base is the partition's `active` row in [`table_cold_partitions()`](/docs/query/functions/meta/#table_cold_partitions), with a higher `seq_txn`. Its `partition_path` is the object an external tool should read:

```questdb-sql title="Current object of each cold partition"
SELECT timestamp, seq_txn, partition_path
FROM table_cold_partitions('trades')
WHERE state = 'active';
```

## Permissions

`COMPACT` and `COMPACT CANCEL` need `VACUUM TABLE` on the table, and `cold_storage_compactions()` needs `SYSTEM ADMIN`. See [RBAC](/docs/security/rbac/).

## Errors

| Error                                                | Cause                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `compaction requires a partitioned WAL table`        | The table is not a partitioned WAL table                                   |
| `not a Delta partition: <name>`                      | A listed partition is not a Delta partition that `COMPACT` accepts         |
| `partition does not exist: <name>`                   | A listed partition does not exist                                          |
| `no cold delta partition matches the WHERE clause`   | `COMPACT` accepts none of the partitions that `WHERE` selects              |
| `no partitions matched WHERE clause`                 | `WHERE` selects no partition                                               |
| `cold storage is not enabled`                        | `BASE` or default mode with `cold.storage.enabled=false`                   |
| `compaction requires an active cold storage manager` | `BASE` or default mode on an instance that is not the cold storage manager |
| `Delta maintenance is not running`                   | The instance is starting or shutting down                                  |

## Examples

```questdb-sql title="Compact one day on the cold storage manager"
ALTER TABLE trades COMPACT PARTITION LIST '2026-02-10';
```

```questdb-sql title="Merge only the local runs, on any instance"
ALTER TABLE trades COMPACT RESIDUAL PARTITION LIST '2026-02-10', '2026-02-11';
```

```questdb-sql title="Write new bases for the partitions that start before March 2026"
ALTER TABLE trades COMPACT BASE PARTITION WHERE timestamp < '2026-03-01';
```

```questdb-sql title="Cancel the table's requested compactions on this instance"
ALTER TABLE trades COMPACT CANCEL;
```

```questdb-sql title="Check progress on this instance"
SELECT * FROM cold_storage_compactions() WHERE table_name = 'trades';
```

### Release a partition kept local on another instance

An instance other than the manager can keep on disk a partition that an earlier release sealed, for example because of `storage.policy.drop.local.override`. Once the partition is a Delta partition, that copy leaves only when the object store holds a base at least as new. If the manager serves an older base, write a new one on the manager:

```questdb-sql title="Write a new base for a partition kept local elsewhere"
ALTER TABLE trades COMPACT BASE PARTITION LIST '2026-02-10';
```

## See also

- [Late rows in cold storage](/docs/concepts/cold-storage-late-rows/) for background compaction and its thresholds
- [`cold_storage_compactions()`](/docs/query/functions/meta/#cold_storage_compactions)
- [Operating cold storage](/docs/operations/cold-storage/#compaction-and-maintenance)
