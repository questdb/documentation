---
title: Point-in-time recovery
sidebar_label: Point-in-time recovery
description:
  Recover QuestDB Enterprise to an arbitrary instant by restoring a backup
  base and replaying replicated WAL, typically to undo an accidental drop or
  a destructive update.
---

Point-in-time recovery (PITR) rebuilds the database as it stood at an
arbitrary instant, typically to undo an accidental `DROP TABLE` or a
destructive `UPDATE`. [Restoring a backup](/docs/operations/backup/#restore)
returns the database as it stood at a backup snapshot; PITR goes further,
replaying replicated WAL on top of a restored backup until it reaches the
instant you request, then stopping.

:::note

Point-in-time recovery requires **QuestDB Enterprise** with
[replication](/docs/high-availability/setup/) configured, since it replays
transactions from the replication object store.

:::

## Prerequisites

- QuestDB Enterprise, with the original primary replicating to an object
  store.
- A backup at or before the target instant, and the replication store still
  retaining WAL from that backup forward. Retention is tied to backup
  retention through the [WAL cleaner](/docs/high-availability/wal-cleanup/):
  **the target instant must be after the cleanup boundary**.
- A target host with an empty `db/` directory, such as a fresh installation.
- Connection strings for both object stores: the backup store, and the
  **source** replication store the original primary uploaded to.
- If the database uses cold storage: a new, empty cold storage root for the
  recovered database, read access to the source root, and a backup taken after
  the upgrade to a release that pins cold objects. See
  [Cold storage](#cold-storage), and act within the garbage collection grace
  period after a drop.

## How it works

Recovery is two sequential boots on the same data root, one trigger file per
boot, never both at once:

1. **Restore a backup as the base.** A boot with
   [`_backup_restore`](/docs/operations/backup/#restore) lands the most
   recent backup at or before the target instant. No replication is
   configured, so nothing replays yet.
2. **Roll forward.** A second boot with `_recover_point_in_time` replays WAL
   from the source replication object store on top of the base and stops at
   the target instant. Everything committed later is left behind.

The restored backup carries the source cluster's DataID, so the base and the
replication store are on the same timeline; a base from a different cluster
fails with [ER007](/docs/troubleshooting/error-codes/#er007).

## Choosing a recovery timestamp

The recovery timestamp is compared against each transaction's **commit
time**: the wall-clock time at which the primary committed and uploaded it,
as recorded in the object store. It is **not** the designated timestamp of
the rows. For a time-series table the two can be far apart: rows timestamped
last year but ingested this morning are recovered by this morning's commit
time.

Choose an instant comfortably between the last good transaction and the
destructive one.

To find the moment of the destructive statement, use the primary's server
log, which records when the statement ran. If the affected table still
exists, `wal_transactions()` lists each of its transactions with the commit
time in the `timestamp` column:

```questdb-sql title="Locate the destructive transaction"
SELECT sequencerTxn, timestamp, rowCount, alterCommandType
FROM wal_transactions('trades');
```

After a `DROP TABLE` the function no longer works for that table, so the
server log is the reliable source.

## Procedure

### Step 1: restore the backup

1. **Stop the target node** and confirm its `db/` directory is empty. On a
   host that held data before, use a fresh installation directory instead.

2. **Remove
   [`_migrate_primary`](/docs/high-availability/disaster-recovery/#emergency-primary-migration)
   if present.** It conflicts with the recovery file, and on its own it
   replays to the **latest** state, not to a bounded instant.

3. **Ensure the node has no replication configured**: neither
   `replication.role` nor `replication.object.store` in `server.conf`, and
   the `QDB_REPLICATION_ROLE` and `QDB_REPLICATION_OBJECT_STORE` environment
   variables unset. This is the single most important instruction in the
   procedure: with a replication store configured, the node catches up to
   the latest state during this boot and there is nothing left to bound.

4. **Cold storage, if the database uses it**: before this boot, set
   `cold.storage.object.store` to a new, empty root, and add the
   `cold.storage.linked.object.stores` entries the source root needs. The boot
   that restores the backup prepares the new root; the recovery boot in step 2
   does not. See [Cold storage](#cold-storage).

5. **Restore the backup**, following
   [Restore](/docs/operations/backup/#restore): write `_backup_restore` in
   the install root, with `backup.restore.timestamp` set at or before the
   target unless the latest backup already qualifies.

6. **Start the node, verify the base landed, and stop it.** The restored
   tables are present and `_backup_restore` has been removed.

### Step 2: roll forward to the target

1. **Write `_recover_point_in_time` in the install root**, the parent of the
   `conf/` and `db/` directories. The file accepts exactly two keys, both
   required; any other key aborts startup:

   ```ini title="_recover_point_in_time"
   replication.object.store=s3::bucket=<source-bucket>;root=<source-root>;region=<region>;
   replication.recovery.timestamp=2024-08-24T12:34:56.000000Z
   ```

   `replication.object.store` is the source store the original primary
   uploaded to.

2. **Start the node.** On success the log shows the lines below and the
   trigger file is removed. With no replication role configured, the node
   comes up standalone and cannot write to the live replication store.

   ```
   recovered server state up to: <timestamp>
   generated fresh DataID after PITR: <data id>
   ```

3. **Verify the recovered data.** This step is not optional.

   :::danger

   A successful-looking recovery log line is not evidence that the target
   was reachable. If the target instant sits before the WAL cleanup
   boundary, recovery does **not** fail: it logs
   `recovered server state up to: <your target>` and starts healthy, with
   the missing data silently absent. Before trusting the recovery, confirm
   the dropped table is back and check row counts and the most recent rows
   against the chosen instant.

   :::

4. **Promote to primary as a separate, deliberate step.** Set
   `replication.role=primary` and point `replication.object.store` at a
   **new, empty** bucket or prefix. A recovered node that starts as primary
   against a non-empty store fails with
   [ER001](/docs/troubleshooting/error-codes/#er001).

## After recovery

The recovered node has a fresh DataID, so it is a **new cluster**:

- It can never rejoin the original replication object store.
- Existing replicas cannot follow it. Re-seed replicas from the recovered
  node, following the
  [replication setup guide](/docs/high-availability/setup/).
- The original store remains as-is; delete it once you no longer need it.

Materialized view state is adopted and re-hydrated as part of recovery.

## Cold storage

This section applies only if the database uses
[cold storage](/docs/operations/cold-storage/). It has two parts: an urgent
one that applies only when the drop touched cold partitions, and a mandatory
one that applies to every recovery on a cold storage database.

### Protect dropped cold data during the grace period

This part is needed only when the destructive statement dropped cold
partitions. Dropping a table or partition hands its remote cold objects to
garbage collection, which holds them for a grace period and then reclaims
them:

| What was dropped | Objects are reclaimed after              | Default    |
| ---------------- | ---------------------------------------- | ---------- |
| A partition      | `cold.storage.gc.partition.grace.period` | 30 minutes |
| A whole table    | `cold.storage.gc.table.grace.period`     | 60 minutes |

Recovering to a point before the drop brings the cold data back only while
those objects still exist, so do this before anything else: run
[`SWITCH COLD STORAGE ROLE TO REFRESHER`](/docs/query/sql/switch-cold-storage-role/)
on the cold storage manager. That halts garbage collection immediately and
needs no restart.

### Give the recovered database its own root

If the original database was already using cold storage, this part is not optional. A point-in-time recovery starts a new database, with a new DataID, and a cold storage root belongs to one database. The recovered database writes to a new, empty root of its own, and keeps reading the cold partitions it inherited from the source root, where they are.

Configure the recovering node before the boot that restores the backup, in [step 1](#step-1-restore-the-backup):

```ini title="server.conf on the recovering node"
cold.storage.enabled=true
cold.storage.object.store=s3::bucket=<new-bucket>;root=<new-root>;region=<region>;
cold.storage.linked.object.stores=<source root_id>=s3::bucket=<source-bucket>;root=<source-root>;region=<region>;
```

- `cold.storage.object.store` is a new, empty root, or the root this same recovery started to write and did not finish. The restore refuses any other root before it changes the database: a root with a catalog, a root another restore wrote to, or a root that holds cold tables but no catalog.
- [`cold.storage.linked.object.stores`](/docs/configuration/cold-storage/#coldstoragelinkedobjectstores) tells the node how to open the source root. Every instance of the source database logs the root's `root_id` when it loads the root's catalog, as `rootId` in `loaded the cold storage root's identity [role=..., instance=..., rootId=<root_id>, dataId=...]`. Without an entry, the node opens the source root at its recorded location with its ambient credentials, which works only for S3 or GCS without a custom `endpoint`. Every instance of the recovered database needs the same entries.
- Every instance of the recovered database needs read access to the source root's catalog, manifests and objects, and `GET` and `PUT` on its `_retention/*`, plus `DELETE` so that a failed restore can remove the pins it wrote. See [Prepare the object store root](/docs/operations/cold-storage/#1-prepare-the-object-store-root).

The restore pins the inherited bases in the source root, so the source root's garbage collection keeps them. When the recovered database later drops or replaces such a partition, its manager unpins the base instead of deleting it. Keep the source root readable for as long as the recovered database pins bases there: on the source root's manager, [`cold_storage_pin_owners()`](/docs/query/functions/meta/#cold_storage_pin_owners) lists the recovered database as an owner of kind `root`.

A point-in-time recovery needs a backup taken after the upgrade to a release that pins cold objects. When the backup was taken earlier and holds cold partitions, the recovery refuses to start, since the recovered database could read them from no root. A plain [restore](/docs/operations/backup/#restore) of such a backup still works.

Once the recovery is verified, the next move depends on what happens to the original database. If it stays in service, promote its demoted manager again so garbage collection resumes. On the recovered database, promote a cold storage manager for its new root.

## Troubleshooting

Startup errors, verbatim, with cause and fix:

| Error                                                                                                                                   | Cause                                                                                                 | Fix                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `The _recover_point_in_time file must contain the replication.object.store setting`                                                     | The source store key is missing                                                                       | Add the source store connection string to the file                                                                                                                                         |
| `The _recover_point_in_time file must contain the replication.recovery.timestamp setting`                                               | The target instant key is missing                                                                     | Add `replication.recovery.timestamp` to the file                                                                                                                                           |
| `The _recover_point_in_time file contains unexpected settings: ...`                                                                     | The file contains a key other than the two accepted ones                                              | Remove the extra keys; the file accepts exactly two                                                                                                                                        |
| ``The _recover_point_in_time file can't be used if the instance has the setting `replication.role=replica`.``                           | The node is configured as a replica                                                                   | Remove or comment `replication.role` in `server.conf`; recovery runs with the role unset or set to `primary`                                                                               |
| `The _migrate_primary file can't be used in conjunction with _recover_point_in_time file.`                                              | Both trigger files exist in the install root                                                          | Remove [`_migrate_primary`](/docs/high-availability/disaster-recovery/#emergency-primary-migration); on its own it replays to the latest state, not to a bounded instant                   |
| `ER001 - Attempted to start a primary instance over a non-empty object store after a point in time recovery.`                           | The recovered node started as primary against a non-empty store                                       | Point `replication.object.store` at a new, empty bucket or prefix; see [ER001](/docs/troubleshooting/error-codes/#er001)                                                                   |
| `recover from a backup taken after the upgrade`                                                                                         | The backup holds cold partitions and was taken before the upgrade to a release that pins cold objects | Recover from a backup taken after the upgrade. The trigger file stays in place, and nothing was replayed                                                                                   |
| `configure the new empty cold storage root, and cold.storage.linked.object.stores, before the boot that restores the backup`            | The database has cold partitions, and no restore prepared the configured root                         | Start again from step 1 on a fresh data root, with the new root configured before the restore boot. The trigger file stays in place                                                        |
| `the linked cold storage root has no entry in cold.storage.linked.object.stores, and its location needs one [rootId=..., location=...]` | The node cannot open the source root without an entry                                                 | Add an entry for the `rootId` in the error to [`cold.storage.linked.object.stores`](/docs/configuration/cold-storage/#coldstoragelinkedobjectstores) on every instance, then restore again |

A recovery that comes up healthy with data missing did not necessarily fail:
confirm that step 1 restored a backup base and that the target instant is
after the [WAL cleanup boundary](/docs/high-availability/wal-cleanup/), then
repeat the procedure on a fresh data root.

## Further reading

- [Backup and restore](/docs/operations/backup/) for the `_backup_restore`
  trigger file and restore failure recovery
- [Replication setup](/docs/high-availability/setup/) for promoting the
  recovered node and re-seeding replicas
- [WAL cleanup](/docs/high-availability/wal-cleanup/) for how far back a
  recovery can reach
- [Operating cold storage](/docs/operations/cold-storage/) for root
  ownership, pins and the manager role
- [Error codes](/docs/troubleshooting/error-codes/) for ER001 and ER007
