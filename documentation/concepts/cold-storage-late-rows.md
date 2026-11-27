---
title: Late rows in cold storage
sidebar_label: Late rows
description:
  Keep late and out-of-order rows that arrive after DROP LOCAL in QuestDB
  Enterprise cold storage partitions, and compact them into new Parquet objects.
---

By default, `DROP LOCAL` seals a [cold storage](/docs/concepts/cold-storage/) partition, and rows that arrive for it later are dropped. With late rows enabled, the partition keeps accepting them: queries return the late rows, and background compaction moves them into the object store. Tables that receive late or backfilled rows can then use cold storage without a `DROP LOCAL` sized for the longest delay. Only tables without deduplication keep late rows, so a row sent again to correct an earlier one is added next to it, not merged.

Late rows are off by default, apply to every eligible table, and cannot be turned off for the partitions that already keep them. Read [Before you enable late rows](#before-you-enable-late-rows) first.

:::note

Late rows are available in **QuestDB Enterprise** ENTERPRISE_VERSION_TBD and later.

:::

## Which tables keep late rows

With `cold.storage.delta.enabled=true`, every [WAL table](/docs/concepts/write-ahead-log/) without deduplication whose [storage policy](/docs/concepts/storage-policy/) has a `TO REMOTE` stage keeps late rows. There is no per-table setting. Tables with [deduplication](/docs/concepts/deduplication/) never keep late rows, see [What happens to late rows](/docs/concepts/cold-storage/#what-happens-to-late-rows).

## How late rows work

### Delta partitions

At `DROP LOCAL`, the primary switches the partition to a **Delta partition** instead of sealing it, with an event in the table's WAL that every instance applies. A Delta partition is:

- its **[base](/docs/concepts/cold-storage/#object-store-layout)**, the Parquet object in the object store, read like any cold partition,
- its late rows, which each instance keeps on its own local disk, one sorted **run** per transaction that wrote into the partition.

Queries merge the base and the runs, so late rows are visible as soon as their transaction is applied. Error messages call Delta partitions `delta` or `delta-active`. A query fails when the base rows and late rows within the time range of one Parquet row group exceed 2,147,483,647.

### Compaction

Background maintenance, unrelated to the compaction of [merge-append partitions](/docs/concepts/merge-append-partitions/#compaction):

1. merges runs on every instance, in groups of 1,024,
2. on the [cold storage manager](/docs/concepts/cold-storage/#roles), writes the late rows into a new base and uploads it, once they reach, by default, 128 MiB and 25% of the base's size, at most once an hour per partition,
3. switches every instance to the new base once nothing reads the old one. Garbage collection then deletes the old base.

Late rows below these thresholds stay on local disk only. To move them to the object store now, use [`ALTER TABLE COMPACT`](/docs/query/sql/alter-table-compact/). Maintenance visits each table every 5 minutes by default, so a partition becomes remotely served a few minutes after `DROP LOCAL`. See the [Maintenance settings](/docs/configuration/cold-storage/#maintenance).

## Enable or disable

### Before you enable late rows

- **Upgrade every instance that uses the cold storage root**, see [Upgrading to ENTERPRISE_VERSION_TBD](/docs/operations/upgrade/#upgrading-to-enterprise_version_tbd). An older instance suspends the table with `Unsupported WAL event type: 65`: upgrade it, then run `ALTER TABLE ... RESUME WAL` on it.
- **Take a [`BACKUP DATABASE`](/docs/operations/backup/) backup on this release.** It is the only way back, see [Roll back](#roll-back).
- **Expect the restrictions at once.** The next storage policy pass also switches the partitions already sealed, so every eligible table refuses `DEDUP ENABLE` and `ADD COLUMN ... INDEX` until its Delta partitions are dropped. Other operations are refused on every cold storage table, see [Restrictions on cold storage tables](/docs/concepts/cold-storage/#restrictions-on-cold-storage-tables).

### Enable late rows

Set the same value on every instance, then restart them in any order:

```ini title="server.conf on every instance"
cold.storage.enabled=true
cold.storage.delta.enabled=true
```

Only the primary acts on the setting, but a replica needs it in case it is promoted.

### Disable late rows

Setting `cold.storage.delta.enabled=false` stops new switches. Existing Delta partitions keep accepting late rows, and keep their restrictions, until they are dropped. Do not disable cold storage itself instead: `DROP LOCAL` would then delete the Delta partitions still on local disk, with their late rows, see [Disabling cold storage](/docs/operations/cold-storage/#disabling-cold-storage).

### Partitions sealed before late rows were enabled

When you enable late rows, the next storage policy pass switches the partitions already sealed, except:

- the table's last partition, until a newer partition exists,
- a cold partition with a split part, listed by [`SHOW PARTITIONS`](/docs/query/sql/show/#show-partitions) as the partition name with a timestamp suffix. Only a local `FORCE DROP PARTITION`, `SET FORMAT PARQUET` and a new row, together, create one.

These partitions still drop late rows, and log `o3 ignoring write on read-only partition`. To switch a day with a split part, copy it out and back in on the primary, while no rows arrive for that day:

```questdb-sql title="Switch a sealed day with a split part"
CREATE TABLE trades_2026_02_10 AS (
  SELECT * FROM trades WHERE timestamp IN '2026-02-10'
);
ALTER TABLE trades DROP PARTITION LIST '2026-02-10';
INSERT INTO trades SELECT * FROM trades_2026_02_10;
DROP TABLE trades_2026_02_10;
```

Check that the copy holds all of the day's rows before the `DROP PARTITION`. The day reads empty until the `INSERT` completes.

## Batch your writes

Each transaction that writes into a Delta partition adds a run, so send more rows per transaction rather than more transactions. When one partition holds 16,384 runs not yet reclaimed, WAL apply pauses for its table, without suspending it, until merging brings the partition back to 8,192 runs. Meanwhile new rows are not visible, and a queued `DROP PARTITION` or `TRUNCATE` waits. Long queries and checkpoints hold the runs they read, so they can extend a pause. The instance logs `Delta WAL apply stopped on Run pressure` and `Delta WAL apply resumed`, see [Detect cold storage maintenance problems](/docs/operations/monitoring-alerting/#detect-cold-storage-maintenance-problems).

Clients that flush automatically batch well: QWP over WebSocket at 1,000 rows or 100 ms, ILP over HTTP at 75,000 rows or 1 s. The C, C++ and Rust clients send rows only when your code calls `flush`, so add many rows before each call. A `wal_tx_size_p90` below 100 rows in `tables()` shows a client that does not batch, see [Detect small transactions](/docs/operations/monitoring-alerting/#detect-small-transactions).

## Monitor late rows

Compactions appear in [`cold_storage_compactions()`](/docs/query/functions/meta/#cold_storage_compactions) on the instance that runs them, and Delta partitions report `readOnly` as `false` in `table_partitions()`. No metric reports the late rows waiting for compaction.

```questdb-sql title="Compactions queued, running or failed on this instance"
SELECT * FROM cold_storage_compactions();
```

```questdb-sql title="Remotely served partitions that keep late rows"
SELECT name, readOnly, isRemotelyServed
FROM table_partitions('trades')
WHERE isRemotelyServed AND readOnly = false;
```

A Delta partition whose base is still local looks like any writable local partition.

## Roll back

Turning the setting off does not convert Delta partitions back. Releases before ENTERPRISE_VERSION_TBD refuse to open a table that holds them, and with `cairo.commit.mode=adaptive` they refuse to start. To roll back, restore a backup taken on this release before you enabled late rows. The whole database returns to that backup, so every write since then, on every table, is lost. Restore onto a new, empty root, because the manager has uploaded to the current one after the backup, as described under [Backup and restore](/docs/operations/cold-storage/#backup-and-restore).

## See also

- [Cold storage](/docs/concepts/cold-storage/) for the partition lifecycle and the object store layout
- [Operating cold storage](/docs/operations/cold-storage/) for maintenance and troubleshooting
- [`ALTER TABLE COMPACT`](/docs/query/sql/alter-table-compact/) for on-demand compaction
- [Cold storage configuration](/docs/configuration/cold-storage/#late-rows) for the late-row and maintenance settings
