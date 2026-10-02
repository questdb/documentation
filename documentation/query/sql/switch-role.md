---
title: SWITCH ROLE
sidebar_label: SWITCH ROLE
description:
  SWITCH ROLE and SWITCH STATUS SQL keyword reference documentation. Moves a
  running QuestDB Enterprise instance between the primary and replica roles.
---

Moves the instance that executes the statement between the
[replication](/docs/high-availability/overview/) primary and replica roles
without a restart, and reports the role the instance currently holds. A demoted
primary stops accepting writes and starts following the object store; a
promoted replica starts uploading and admits writes. This is how a planned
switchover, or a promotion after a primary loss, is performed while clients
stay connected.

:::note

Replication and `SWITCH ROLE` are available in **QuestDB Enterprise** only,
since version 3.3.3. The permission and the refusal behaviour described here are
those of version 4.0.0.

:::

## Syntax

```questdb-sql title="Switch role"
SWITCH ROLE TO { PRIMARY | REPLICA } [TIMEOUT milliseconds];
```

```questdb-sql title="Report role"
SWITCH STATUS;
```

## Description

Both statements act on the instance that executes them, not on the cluster.
Issue them against the specific node whose role you want to change or inspect.

| Clause       | Effect                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `TO PRIMARY` | Stops the WAL downloader, verifies that this instance owns the object store, starts the uploader, and admits writes last                  |
| `TO REPLICA` | Refuses new writes first, drains in-flight writers, uploads the transactions still pending, closes the uploader, and starts the downloader |
| `TIMEOUT`    | Bounds each stage of the switch, in milliseconds. `1` to `600000`, default `5000`                                                         |

`SWITCH ROLE` returns as soon as the switch is accepted. The switch itself runs
in the background: poll `SWITCH STATUS`, or
[`GET /lifecycle`](/docs/high-availability/failover/#lifecycle-api), until
`switch_in_flight` is `false` and `current_role` matches the target.

### Result columns

`SWITCH ROLE` returns a single row:

| Column        | Type      | Description                                                        |
| ------------- | --------- | ------------------------------------------------------------------ |
| `accepted`    | _BOOLEAN_ | Always `true`. A switch that cannot be accepted raises an error instead |
| `target_role` | _STRING_  | `PRIMARY` or `REPLICA`                                             |

`SWITCH STATUS` returns a single row:

| Column             | Type        | Description                                                                                    |
| ------------------ | ----------- | ---------------------------------------------------------------------------------------------- |
| `current_role`     | _STRING_    | `PRIMARY`, `REPLICA`, or `UNKNOWN`                                                             |
| `switch_in_flight` | _BOOLEAN_   | `true` while a switch is running. `current_role` keeps the previous role until it completes    |
| `captured_at`      | _TIMESTAMP_ | When the status was read                                                                       |

`UNKNOWN` means a switch was aborted part-way and the instance holds neither
role: it is read-only and is not replicating. Retry the switch to heal it, see
[Refusals and the torn state](/docs/high-availability/failover/#refusals-and-the-torn-state).

### Timeout behaviour

`TIMEOUT` bounds the stages of the switch, not the calling session. The writer
drain, the upload of pending transactions, the uploader shutdown, and the
materialized view quiesce each settle within the budget, while the statement
returns immediately.

A demote whose writer drain outlives the budget is refused and the instance
stays primary. A demote whose pending uploads outlive the budget leaves the
instance in the `UNKNOWN` state rather than abandoning acknowledged writes. On a
busy primary, pass an explicit `TIMEOUT` larger than the default 5 seconds.

The default of `5000` milliseconds is not configurable. The upper bound of
`600000` (10 minutes) keeps a switch inside a typical Kubernetes termination
grace period. The value applies to that switch only.

This differs from
[`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/), where
`TIMEOUT` bounds the caller's wait and the transition continues regardless.

### Instances without replication

The statement is accepted on an instance that has no
`replication.object.store` configured. `SWITCH ROLE TO REPLICA` then leaves the
instance read-only with nothing to replicate from. It is not a way to make a
standalone instance read-only; use the read-only settings of the interfaces
instead.

:::warning

A role set this way does **not** survive a restart. The instance boots into the
role given by `replication.role` in `server.conf`. Update that setting on every
switched node before any restart, otherwise a demoted node can come back as a
second primary. See [Restarts](/docs/high-availability/failover/#restarts).

:::

### Permissions

Both statements require the `SWITCH ROLE` permission, granted with
`GRANT SWITCH ROLE TO entity`. `SYSTEM ADMIN` does not imply it; `DATABASE ADMIN`
does. A denied session receives `Access denied for <principal> [SWITCH ROLE]`.
When access control is disabled, both statements are open to every session. See
[Failover operator](/docs/security/rbac/common-scenarios/#failover-operator).

Before version 4.0.0, both statements required `SYSTEM ADMIN`.

### Errors

Errors raised by the statement itself:

| Error                                                      | Cause                                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `timeout must be within [1, 600000] ms`                    | `TIMEOUT` out of range. `0` is rejected because it would abandon pending uploads |
| `switch already in flight [current=PRIMARY, target=REPLICA]` | A switch is running. Poll `SWITCH STATUS`                                    |
| `boot in progress; switch not yet available`               | The instance has not finished starting                                        |
| `server is shutting down`                                  | The instance is stopping                                                      |
| `server is busy`                                           | The switch executor could not take the request. Retry                          |

A switch that is accepted and later refused does not raise an error in the
session that submitted it. The outcome is visible through `SWITCH STATUS`,
`GET /lifecycle`, and the server log. See
[Refusals and the torn state](/docs/high-availability/failover/#refusals-and-the-torn-state).

## Examples

A planned switchover runs on two instances, in this order:

```questdb-sql title="1. Demote the current primary"
SWITCH ROLE TO REPLICA TIMEOUT 60000;
```

| accepted | target_role |
| -------- | ----------- |
| true     | REPLICA     |

```questdb-sql title="2. Confirm it settled, on the same instance"
SWITCH STATUS;
```

| current_role | switch_in_flight | captured_at                 |
| ------------ | ---------------- | --------------------------- |
| REPLICA      | false            | 2026-08-28T10:15:02.114233Z |

```questdb-sql title="3. Promote the replica, on the other instance"
SWITCH ROLE TO PRIMARY;
```

```questdb-sql title="4. Confirm it is accepting writes"
SWITCH STATUS;
```

| current_role | switch_in_flight | captured_at                 |
| ------------ | ---------------- | --------------------------- |
| PRIMARY      | false            | 2026-08-28T10:15:09.771902Z |

Read the role from any session, without the `SWITCH ROLE` permission:

```questdb-sql
SELECT node_role();
```

| node_role |
| --------- |
| PRIMARY   |

## See also

- [Failover and role switch](/docs/high-availability/failover/) for the full
  procedure, the REST endpoint, and recovery from a refused switch
- [`node_role()`](/docs/query/functions/meta/#node_role) for the open role read
- [RBAC](/docs/security/rbac/common-scenarios/#failover-operator) for the `SWITCH ROLE` permission
- [`replication.role`](/docs/configuration/database-replication/#replicationrole)
  for the boot role
- [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/) for
  the cold storage manager role, which is independent of the replication role
