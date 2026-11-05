---
title: Disaster recovery
sidebar_label: Disaster recovery
description:
  Recover a replicated QuestDB Enterprise cluster from node failures, network
  partitions, and disk failures, including the primary migration procedures.
---

When a node in a [replicated](/docs/high-availability/overview/) cluster
fails, the recovery path depends on what failed and whether the surviving
nodes hold complete data. This page maps the failure scenarios to their
recovery paths and documents the migration procedures they rely on.

For switching roles between healthy nodes without a restart, see
[Failover and role switch](/docs/high-availability/failover/). To rebuild
the database as it stood at an arbitrary instant, see
[point-in-time recovery](/docs/operations/point-in-time-recovery/).

## Failure scenarios

| Node    | Recoverable | Unrecoverable                       |
| ------- | ----------- | ----------------------------------- |
| Primary | Restart     | [Promote a replica](/docs/high-availability/failover/#promote-a-replica-after-a-primary-loss), create new replica |
| Replica | Restart     | Destroy and recreate                |

## Network partitions

Temporary partitions cause replicas to lag, then catch up when connectivity
restores. This is normal operation.

Permanent partitions require [emergency primary migration](#emergency-primary-migration).

## Instance crashes

If a crash corrupts transactions, tables may suspend on restart. You can skip
the corrupted transaction and reload missing data, or follow the emergency
migration flow.

### A primary refuses to start after a power loss

In `nosync` and `async` [commit mode](/docs/concepts/durability/#commit-modes), a primary
uploads transactions to the object store before they are flushed to its own
disk. After a power loss or an operating system crash, its local transaction
log of a table can end before the last transaction in the object store. New
commits would then reuse transaction numbers that the replicas already hold
with other content, so since QuestDB Enterprise 4.2.0 the primary refuses to
start. The log line that names the table begins with (wrapped here):

```text
local sequencer log is behind the object store, refusing to start as primary
[t=..., local_txn=..., store_txn=...]
```

To recover, do one of the following:

- Start the node with `replication.role=replica`, so that it downloads the
  missing transactions, then promote it with
  [`SWITCH ROLE TO PRIMARY`](/docs/high-availability/failover/). No
  transaction is lost: the object store holds them.
- Add the table to
  [`replication.disabled.tables`](/docs/configuration/database-replication/#replicationdisabledtables)
  to stop replicating it. The table keeps its local state, without the
  transactions that only the object store holds. Its replicas hold a
  different history, so removing it from the list later does not resume its
  replication: the primary holds its uploads. To replicate it again, rebase it
  with [`ALTER TABLE ... REBASE WAL`](/docs/query/sql/alter-table-rebase-wal/).

In `sync` and `adaptive` mode, a primary uploads only transactions that are
already on its disk. QuestDB Enterprise 4.1.0 and earlier started in this
situation, and the primary's new transactions silently diverged from the
replicas.

## Disk failures

Symptoms: high latency, unmounted disk, suspended tables. Follow the emergency
migration flow to move to new storage.

## Migration procedures

:::note

If the cluster uses [cold storage](/docs/concepts/cold-storage/), the manager role does not move with the primary role. Migrating the primary leaves the cold storage manager where it was. Move it separately with [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/) if the instance holding it is being retired.

:::

### Planned primary migration

Since QuestDB Enterprise 3.3.3, the primary role moves without stopping either
node: demote the primary with `SWITCH ROLE TO REPLICA`, then promote the
replica with `SWITCH ROLE TO PRIMARY`. Clients stay connected and no data is
lost. The procedure, its timeout, and what to do when a switch is refused are in
[Failover and role switch](/docs/high-availability/failover/).

On older versions, or when the object store changes at the same time, use the
restart-based flow:

1. Stop the primary
2. Restart with `replication.role=primary-catchup-uploads`
3. Wait for uploads to complete (exits with code 0)
4. Follow emergency migration steps below

### Emergency primary migration

Use when the primary has failed and a replica cannot be promoted in place: the
surviving replica is behind the object store and you accept losing the
transactions that never reached it. If a caught-up replica exists,
[promote it in place](/docs/high-availability/failover/#promote-a-replica-after-a-primary-loss)
instead; that path refuses rather than losing data.

1. Stop the failed primary (ensure it cannot restart)
2. Stop the replica
3. Set `replication.role=primary` on the replica
4. Create an empty `_migrate_primary` file in the installation directory.
   This replays the object store to the **latest** state; for a recovery
   bounded to an earlier instant, use
   [point-in-time recovery](/docs/operations/point-in-time-recovery/) instead
5. Start the replica (now the new primary)
6. Create a new replica to replace the promoted one

:::warning
Data committed to the primary but not yet replicated will be lost. Use planned
migration if the primary is still functional.
:::

:::tip Keep clients connected across the switch
Promoting a replica only helps if your applications can find the new primary.
Configure clients with a multi-host address list so they fail over
automatically — see
[Client failover](/docs/high-availability/client-failover/concepts/).
:::

### Point-in-time recovery

To recover the database to an arbitrary instant, for example to undo an
accidental `DROP TABLE`, follow the
[point-in-time recovery](/docs/operations/point-in-time-recovery/) procedure.

## Next steps

- [Setup guide](/docs/high-availability/setup/) - Configure object storage,
  the primary, and replica nodes.
- [Failover and role switch](/docs/high-availability/failover/) - Switch
  roles in place and promote a replica without a restart.
- [Point-in-time recovery](/docs/operations/point-in-time-recovery/) -
  Rebuild the database as it stood at an arbitrary instant.
