---
title: Late rows in cold storage
sidebar_label: Late rows
description:
  Keep late and out-of-order rows that arrive after DROP LOCAL in QuestDB
  Enterprise cold storage partitions, and compact them into new Parquet objects.
---

Available since QuestDB Enterprise ENTERPRISE_VERSION_TBD, the opt-in `cold.storage.delta.enabled` setting lets a [cold storage](/docs/concepts/cold-storage/) partition keep the rows that arrive after its `DROP LOCAL` boundary. Without it, `DROP LOCAL` seals the partition and later rows for it are dropped. With it, the partition keeps accepting late rows, queries return them, and the partition still moves to the object store. Tables whose data keeps arriving late can therefore use cold storage without a `DROP LOCAL` sized for the longest delay.

:::note

Late rows in cold storage are available in **QuestDB Enterprise** only, and are disabled by default.

:::

## When to use it

Enable late rows when rows can arrive for a partition after it passed `DROP LOCAL`, and dropping them is not acceptable. Typical cases are devices that buffer data and flush it hours or days later, replays and backfills from an upstream system, and corrections to recent history.

It does not apply to every table:

- **Tables with [deduplication](/docs/concepts/deduplication/) never keep late rows.** Their partitions are sealed at `DROP LOCAL` as before, and a transaction with rows for a sealed partition suspends the table. See [What happens to late rows](/docs/concepts/cold-storage/#what-happens-to-late-rows).
- **Tables that need `UPDATE`, column type changes, new indexes or deduplication later** should not take late rows: these operations are refused once the table holds partitions in this mode. See [Restrictions](#restrictions).

## How it works

A table takes late rows when `cold.storage.enabled` and `cold.storage.delta.enabled` are `true` on the primary, the table is a [WAL table](/docs/concepts/write-ahead-log/) without deduplication, and its [storage policy](/docs/concepts/storage-policy/) has a `TO REMOTE` stage.

When such a partition reaches `DROP LOCAL`, the primary writes a replicated event to the table's WAL that switches the partition to accept late rows, instead of the seal that makes it read-only. Every instance applies the event at the same point in the WAL, so all instances agree on which rows came before the switch.

### Delta partitions

A partition switched to accept late rows is called a **Delta partition**. The `cold.storage.delta.enabled` setting and error messages use this name, for example `cannot update table with delta partitions` or `table has a delta-active partition`.

A Delta partition consists of:

- Its **[base](/docs/concepts/cold-storage/#object-store-layout)**: the Parquet object that holds its rows as of one point in the WAL. After `DROP LOCAL`, the base is served from the object store like any cold partition.
- Its late rows, kept on the local disk of each instance. Each transaction that writes rows into a Delta partition adds one sorted batch of late rows, called a **run**.

Queries read the base and the runs together, merged in timestamp order, so a query returns the late rows as soon as WAL apply has applied their transaction. Each instance applies the WAL itself and keeps its own runs; late rows never travel through the object store until they are compacted into a new base.

### Compaction

Background maintenance keeps the number of runs bounded and moves late rows into the object store:

1. **Every instance merges runs.** Each time WAL apply fills a group of 1,024 runs in a partition, maintenance merges them, then merges runs of similar size together.
2. **The cold storage manager writes new bases.** Once a partition's late rows reach `cold.storage.maintenance.base.min.delta.bytes` (128 MiB by default) and `cold.storage.maintenance.base.delta.ratio` (25% by default) of its base, the manager folds them into a new Parquet base and uploads it under a key of its own. It does this at most once an hour per partition.
3. **Every instance switches to the new base.** Each instance installs the new base once no query, checkpoint or save point still reads the old one, and drops the runs it replaced. The manager's garbage collection later deletes the old base.

`delta.maintenance.sweep.interval` (5 minutes by default) sets how often maintenance visits every table, so a partition takes minutes, not seconds, to become remotely served after it passes `DROP LOCAL`. To compact on demand, use [`ALTER TABLE COMPACT (cold storage)`](/docs/query/sql/alter-table-compact/).

:::note

This compaction is a cold storage mechanism, separate from the partition compaction of [merge-append partitions](/docs/concepts/merge-append-partitions/#compaction) and its `cairo.partition.compaction.*` settings.

:::

## Enable or disable

Set the same value in `server.conf` on every instance, then restart:

```ini title="server.conf on every instance"
cold.storage.enabled=true
cold.storage.delta.enabled=true
```

The default is `false`, the setting is not reloadable, and it takes effect only with `cold.storage.enabled=true`. Only the primary acts on it, since only the primary writes the switch event, but a replica promoted to primary needs it too.

:::warning

Enable late rows only once every instance in the cluster, and every instance that uses the same cold storage root, runs a release that supports them. An older instance suspends the table on its first switch event, with `Unsupported WAL event type: 65`. To recover, upgrade that instance, then run `ALTER TABLE ... RESUME WAL` on it.

:::

Setting it back to `false` stops new switches. Existing Delta partitions stay in that mode: they keep accepting late rows and the table keeps its [restrictions](#restrictions) until those partitions are dropped.

:::warning

Disabling cold storage itself, with `cold.storage.enabled=false`, keeps the Delta partitions that the object store serves, but `DROP LOCAL` then deletes the Delta partitions whose base is still on local disk, with their late rows, including those not yet in a base in the object store. See [Disabling cold storage](/docs/operations/cold-storage/#disabling-cold-storage).

:::

### Partitions sealed before late rows were enabled

When you enable the setting, the primary also switches the partitions that are already sealed to Delta partitions, on the first storage policy pass. These partitions then accept late rows too, and the table immediately refuses the operations listed under [Restrictions](#restrictions), such as `UPDATE`. Three kinds of partition stay sealed:

- **Soft-linked partitions**, attached from a symbolic link.
- **The table's last partition**, which the storage policy never visits. A sealed last partition switches once a newer partition exists.
- **A cold partition that has a split sibling.** Only a local `FORCE DROP PARTITION`, `SET FORMAT PARQUET` and a new row can leave a cold partition in that shape. Late rows for its time range are still dropped and logged with `o3 ignoring write on read-only partition`. To switch such a day, run on the primary, when no late rows arrive for that day:

  ```questdb-sql title="Switch a sealed day with a split sibling"
  CREATE TABLE tmp AS (SELECT * FROM trades WHERE timestamp IN '2026-02-10');
  ALTER TABLE trades DROP PARTITION LIST '2026-02-10';
  INSERT INTO trades SELECT * FROM tmp;
  DROP TABLE tmp;
  ```

  The day reads empty between the `DROP PARTITION` and the `INSERT`, and `tmp` needs local disk for the day's rows.

A sealed local Parquet partition whose `_pm` file is missing or corrupt suspends the table when its switch applies. Restore the file, or run `FORCE DROP PARTITION` on every instance, since it bypasses the WAL, then [`RESUME WAL`](/docs/query/sql/alter-table-resume-wal/).

## Batch your writes

Each transaction that writes rows into a Delta partition adds a run, so send more rows per transaction rather than more transactions. Background merging keeps up with steady ingestion, but many small transactions into one partition keep more runs on disk.

When a Delta partition holds 16,384 runs that are not yet reclaimed, WAL apply stops for its table before the next transaction that writes rows into a Delta partition. The table is not suspended, and WAL apply resumes on its own once the partition is back to 8,192 runs. While it is stopped:

- rows of the waiting transactions are not visible to queries yet,
- `DROP PARTITION` and `TRUNCATE` queued behind the stop wait until WAL apply resumes,
- maintenance starts no new base for that partition, and its local base is not evicted.

Open queries and checkpoints keep the runs they read. On a primary with `cairo.commit.mode=adaptive`, runs that merges replaced since the table's last save point also stay until its next one, so under run pressure the table takes extra save points, at most once a second.

The instance logs each stop and resume:

```text
Delta WAL apply stopped on Run pressure [tableDirName=<dir>, partition=<partition>, retainedRuns=<runs>, oldestSnapshot=Some(<seqTxn>)]
Delta WAL apply resumed [tableDirName=<dir>, stoppedMicros=<micros>]
```

`oldestSnapshot` is the oldest open snapshot, as `Some(<seqTxn>)`, or `None`.

When reclaiming runs fails, it logs `Delta WAL apply stopped, reclaim failed [...]` as an error, with the cause.

The client libraries batch rows by default: QWP over WebSocket flushes at 1,000 rows or 100 ms, and ILP over HTTP at 75,000 rows or 1 s, whichever comes first. A `wal_tx_size_p90` below 100 rows in `tables()` shows a client that does not batch; see [Detect small transactions](/docs/operations/monitoring-alerting/#detect-small-transactions).

## Restrictions

Once a table holds a Delta partition, it refuses:

- `UPDATE`
- `ALTER TABLE ... ALTER COLUMN ... TYPE`
- `ALTER TABLE ... DEDUP ENABLE`
- `ALTER TABLE ... ALTER COLUMN ... ADD INDEX` and `ADD COLUMN ... INDEX`
- `ALTER TABLE ... SET TYPE` and `ALTER TABLE ... REBASE WAL`
- `DETACH PARTITION` and `CONVERT PARTITION` on a Delta partition

`REINDEX` skips Delta partitions. These refusals last until the table's Delta partitions are dropped. The error messages, and the restrictions that apply to every cold storage table, are listed under [Restrictions on cold storage tables](/docs/concepts/cold-storage/#restrictions-on-cold-storage-tables).

## Limits

- **Rows per time range.** A query fails when the base rows and late rows within the time range of one Parquet row group of a Delta partition exceed 2,147,483,647.
- **No backlog metrics.** No metric reports the number of runs or late-row bytes waiting for compaction. Use the log lines above and [`cold_storage_compactions()`](/docs/query/functions/meta/#cold_storage_compactions).

## Monitor

```questdb-sql title="Queued, running and failed compactions on this instance"
SELECT * FROM cold_storage_compactions();
```

`cold_storage_compactions()` reports this instance only, and requires the `SYSTEM ADMIN` permission.

```questdb-sql title="Remotely served partitions that keep late rows"
SELECT name, readOnly, isRemotelyServed
FROM table_partitions('trades')
WHERE isRemotelyServed AND readOnly = false;
```

A Delta partition reports `readOnly` as `false`, also once it is remotely served, and a sealed cold partition reports `readOnly` as `true`. No column marks a Delta partition whose base is still on local disk, for example in the minutes after `DROP LOCAL` or while [`storage.policy.drop.local.override`](/docs/configuration/storage-policy/#storagepolicydroplocaloverride) keeps it: it reports the same values as a writable local partition.

Also watch for the run-pressure log lines above, and for WAL lag on a table whose [`wal_tables()`](/docs/query/functions/meta/#wal_tables) row shows `suspended` as `false`.

## Downgrade safely

:::warning

QuestDB Enterprise releases before ENTERPRISE_VERSION_TBD refuse to open a table that holds Delta partitions. With `cairo.commit.mode=adaptive` they refuse to start. Turning the setting off does not convert Delta partitions back.

To roll back after enabling late rows, restore a [backup](/docs/operations/backup/) taken before you enabled them.

:::

## See also

- [Cold storage](/docs/concepts/cold-storage/) for the partition lifecycle and the object store layout
- [Operating cold storage](/docs/operations/cold-storage/#compaction-and-maintenance) for maintenance, monitoring and troubleshooting
- [`ALTER TABLE COMPACT (cold storage)`](/docs/query/sql/alter-table-compact/) for on-demand compaction
- [Cold storage configuration](/docs/configuration/cold-storage/#late-rows) for the late-row and maintenance settings
