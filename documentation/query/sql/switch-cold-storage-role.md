---
title: SWITCH COLD STORAGE ROLE
sidebar_label: SWITCH COLD STORAGE ROLE
description:
  SWITCH COLD STORAGE ROLE and SWITCH COLD STORAGE STATUS SQL keyword reference
  documentation.
---

Moves the [cold storage](/docs/concepts/cold-storage/) manager role between instances at runtime, and reports the role an instance currently holds. Exactly one instance in a cluster owns uploads, manifest writes, and remote garbage collection; these statements move that ownership without restarting either instance, which is how a manager is replaced during maintenance or after a failure.

:::note

Cold storage is available in **QuestDB Enterprise** only.

:::

## Syntax

```questdb-sql title="Switch role"
SWITCH COLD STORAGE ROLE TO { MANAGER | REFRESHER }
    [FORCE]
    [TIMEOUT milliseconds];
```

```questdb-sql title="Report role"
SWITCH COLD STORAGE STATUS;
```

## Description

Both statements act on the instance that executes them, not on the cluster.
Issue them against the specific node whose role you want to change or inspect.

| Clause         | Effect                                                                              |
| -------------- | ----------------------------------------------------------------------------------- |
| `TO MANAGER`   | Claims the manager lock and opens manager work on this instance                     |
| `TO REFRESHER` | Flushes pending manifest state, releases the lock, and drops to read-only mirroring |
| `FORCE`        | Deletes an existing foreign lock before claiming it                                 |
| `TIMEOUT`      | Bounds how long the calling session waits, in milliseconds                          |

The role is independent of the [replication](/docs/high-availability/overview/) primary and replica roles. Promoting a replica to primary does not move the manager role, and moving the manager role does not affect replication.

A role set this way does **not** survive a restart. Update `cold.storage.role` in `server.conf` after a durable handoff, otherwise the instance boots back into its configured role.

### Status columns

`SWITCH COLD STORAGE STATUS` returns a single row with two columns:

| Column  | Type     | Description                                                        |
| ------- | -------- | ------------------------------------------------------------------ |
| `state` | _STRING_ | `REFRESHER`, `PROMOTING`, `MANAGER`, or `DEMOTING`                 |
| `term`  | _LONG_   | Ownership term, positive only while manager work is being accepted |

`PROMOTING` and `DEMOTING` are transient. A stable role is `REFRESHER` or `MANAGER`; treat a `MANAGER` state with a non-positive `term` as not yet accepting work.

### Timeout behaviour

`TIMEOUT` bounds only the calling session. The transition itself continues to a stable state regardless, and a timeout never rolls it back. If a statement times out, poll `SWITCH COLD STORAGE STATUS` to see where the transition settled rather than reissuing the switch.

### Permissions

Both statements require the `SYSTEM ADMIN` [permission](/docs/security/rbac/permissions-reference/), including with `FORCE`. There is no narrower grant for the cold storage role: granting `SYSTEM ADMIN` also grants every other system function.

## Examples

The supported handoff is two steps, on two different instances, in this order:

```questdb-sql title="1. Demote the current manager"
SWITCH COLD STORAGE ROLE TO REFRESHER;
```

```questdb-sql title="2. Confirm it released the role"
SWITCH COLD STORAGE STATUS;
```

| state     | term |
| --------- | ---- |
| REFRESHER | 0    |

```questdb-sql title="3. Promote the replacement"
SWITCH COLD STORAGE ROLE TO MANAGER;
```

```questdb-sql title="4. Confirm it is accepting work"
SWITCH COLD STORAGE STATUS;
```

| state   | term |
| ------- | ---- |
| MANAGER | 4    |

Bound the caller's wait to 30 seconds:

```questdb-sql
SWITCH COLD STORAGE ROLE TO REFRESHER TIMEOUT 30000;
```

Take over when the previous manager cannot demote itself:

```questdb-sql
SWITCH COLD STORAGE ROLE TO MANAGER FORCE;
```

:::danger

`FORCE` deletes the existing manager lock and claims ownership. It is a recovery path, not a fencing protocol: stop the previous manager, or prove it is dead, before issuing it. Two active managers write byte-divergent Parquet for the same partition and corrupt cold reads.

:::

## See also

- [Cold storage](/docs/concepts/cold-storage/) for roles and the object store layout
- [Operating cold storage](/docs/operations/cold-storage/#manager-handoff) for the full handoff procedure and its preconditions
- [`cold.storage.role`](/docs/configuration/cold-storage/#coldstoragerole) for the boot role
- [Replication overview](/docs/high-availability/overview/) for the primary and replica roles this one is independent of
