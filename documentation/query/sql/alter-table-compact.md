---
title: ALTER TABLE COMPACT (cold storage)
sidebar_label: COMPACT
description:
  ALTER TABLE COMPACT SQL keyword reference documentation. Compact the late
  rows of cold storage partitions on demand, or cancel requested compactions.
---

Queues [Delta partitions](/docs/concepts/cold-storage-late-rows/#delta-partitions) for compaction, or cancels the compactions queued for a table. Compaction merges the late rows that a cold storage partition keeps on local disk, and folds them into a new Parquet base in the object store.

Background maintenance compacts Delta partitions on its own. Use `COMPACT` to move late rows into the object store sooner than the background thresholds would, for example before an external tool reads the Parquet objects.

:::note

`ALTER TABLE COMPACT` is available in **QuestDB Enterprise** only, since ENTERPRISE_VERSION_TBD. It acts only on tables that keep [late rows in cold storage](/docs/concepts/cold-storage-late-rows/).

`COMPACT` is not the partition compaction of [merge-append partitions](/docs/concepts/merge-append-partitions/#compaction), which runs in the background and has no SQL statement.

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

`COMPACT` queues the selected partitions and returns at once. The work runs in the background on the instance that received the statement, and its progress and failures appear in [`cold_storage_compactions()`](/docs/query/functions/meta/#cold_storage_compactions).

| Mode              | What it does                                                                                                            | Where it runs                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `BASE`            | Folds the partition's late rows into a new Parquet base, uploads it to the object store, and replaces the previous base | The active cold storage manager only |
| `RESIDUAL`        | Merges the partition's runs of late rows on this instance's local disk                                                  | Any instance                         |
| Neither (default) | Both of the above                                                                                                       | The active cold storage manager only |

Other instances switch to a new base once they see it, as they do for bases that background maintenance writes.

The partitions to compact are selected with:

- **`LIST`**: the named partitions, in the partition name format of the table, such as `'2026-02-10'` for a `DAY`-partitioned table. A listed partition without late rows is refused.
- **`WHERE`**: a condition on the designated timestamp, as for [`DROP PARTITION`](/docs/query/sql/alter-table-drop-partition/). Partitions without late rows are skipped, and the statement fails when no selected partition has any.

A partition that switched to a Delta partition but never received a late row counts as having no late rows.

`COMPACT CANCEL` stops the table's queued and running requested compactions.

### When a compaction waits or fails

A request waits, rather than fails, while background maintenance works on the same partition. A `BASE` or default-mode request also waits while an open query, a checkpoint or a save point still reads the base that the partition's previous base compaction replaced, and retries while the table commits a transaction into the partition.

A `BASE` or default-mode request fails, with the reason in `cold_storage_compactions()`, when:

- this instance keeps the partition's base local, because the table's `DROP LOCAL` stage or [`storage.policy.drop.local.override`](/docs/configuration/storage-policy/#storagepolicydroplocaloverride) has not removed it yet. Until the instance has loaded its storage policies after a start, this applies to every Delta partition,
- replication or a save point stops advancing for 60 seconds short of the partition's transaction. Run the statement again once it advances,
- the table stays behind the partition, as a suspended table does, or ingestion into the partition is too fast for the retries to find a gap. Run the statement again.

## Permissions

`COMPACT` and `COMPACT CANCEL` require the `VACUUM TABLE` permission on the table. Following a request in [`cold_storage_compactions()`](/docs/query/functions/meta/#cold_storage_compactions), including why it failed, requires the `SYSTEM ADMIN` permission. See [RBAC](/docs/security/rbac/).

## Errors

| Error                                                | Cause                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `compaction requires a partitioned WAL table`        | The table is not a partitioned WAL table                                              |
| `not a Delta partition: <name>`                      | A partition named in `LIST` has no late rows                                          |
| `partition does not exist: <name>`                   | A partition named in `LIST` does not exist                                            |
| `no cold delta partition matches the WHERE clause`   | The `WHERE` condition selects partitions, but none of them has late rows              |
| `no partitions matched WHERE clause`                 | The `WHERE` condition selects no partition                                            |
| `cold storage is not enabled`                        | `BASE` or the default mode on an instance with `cold.storage.enabled=false`           |
| `compaction requires an active cold storage manager` | `BASE` or the default mode on an instance that is not the active cold storage manager |
| `Delta maintenance is not running`                   | The instance runs no late-row maintenance, for example while it starts or shuts down  |

## Examples

Compact one day on the cold storage manager, merging its runs and writing a new base:

```questdb-sql
ALTER TABLE trades COMPACT PARTITION LIST '2026-02-10';
```

Merge only the local runs, on any instance, including a replica:

```questdb-sql
ALTER TABLE trades COMPACT RESIDUAL PARTITION LIST '2026-02-10', '2026-02-11';
```

Write new bases for every partition with late rows before March 2026:

```questdb-sql
ALTER TABLE trades COMPACT BASE PARTITION WHERE timestamp < '2026-03-01';
```

Cancel the table's requested compactions:

```questdb-sql
ALTER TABLE trades COMPACT CANCEL;
```

Check progress:

```questdb-sql
SELECT * FROM cold_storage_compactions() WHERE table_name = 'trades';
```

### Release a partition kept local on another instance

A partition sealed by an earlier release, and kept local on an instance that is not the manager, for example by `storage.policy.drop.local.override`, can stay on that instance's disk after it switches to a Delta partition. It leaves local disk only through a base at least as new as its own copy. If the manager already serves the partition from an older base, write a new one on the manager:

```questdb-sql
ALTER TABLE trades COMPACT BASE PARTITION LIST '2026-02-10';
```

## See also

- [Late rows in cold storage](/docs/concepts/cold-storage-late-rows/) for background compaction and its thresholds
- [`cold_storage_compactions()`](/docs/query/functions/meta/#cold_storage_compactions)
- [Operating cold storage](/docs/operations/cold-storage/#compaction-and-maintenance)
- [Merge-append partitions](/docs/concepts/merge-append-partitions/#compaction) for the unrelated native partition compaction
