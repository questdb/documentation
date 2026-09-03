---
title: Failover and role switch
sidebar_label: Failover
description:
  Switch a QuestDB Enterprise node between the primary and replica roles in
  place, promote a replica after a primary loss, and recover from a refused
  switch.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  In-place role switching is a QuestDB Enterprise feature, available since
  version 3.3.3. This page describes the behaviour of version 4.0.0.
</EnterpriseNote>

A replicated cluster has one primary that accepts writes and one or more
replicas that follow it through the object store. `SWITCH ROLE` moves the
primary role between nodes while both keep running: no JVM restart, the health
endpoints keep answering `200`, and most client connections survive. Use it for
a planned switchover before maintenance, for a rolling upgrade, and to promote
a caught-up replica after the primary is lost.

This page is the operator guide. The statement grammar is on the
[`SWITCH ROLE`](/docs/query/sql/switch-role/) reference page.

## Roles at a glance

| Role      | Writes   | Replication                                          |
| --------- | -------- | ---------------------------------------------------- |
| `PRIMARY` | accepted | uploads WAL transactions to the object store         |
| `REPLICA` | refused  | downloads and applies WAL transactions               |
| `UNKNOWN` | refused  | none. A switch was aborted part-way, see [below](#refusals-and-the-torn-state) |

Three surfaces report the role. Use the first two for monitoring; the third
needs the `SWITCH ROLE` permission.

| Surface                                   | Access                                            | Reports                                              |
| ----------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| [`node_role()`](/docs/query/functions/meta/#node_role) | any authenticated SQL session         | the role                                             |
| [`GET /lifecycle`](#lifecycle-api)        | port 9003, health-check credentials               | `currentRole`, `switchInFlight`, `ready`, components |
| [`SWITCH STATUS`](/docs/query/sql/switch-role/) | SQL session with `SWITCH ROLE`              | `current_role`, `switch_in_flight`, `captured_at`    |

## Prerequisites

- QuestDB Enterprise 4.0.0 or later on every node. Version 3.3.3 introduced the
  switch; 4.0.0 added the `SWITCH ROLE` permission and the refusal of a demote
  that would abandon un-uploaded transactions.
- Both nodes configured for [replication](/docs/high-availability/setup/) with
  the same `replication.object.store`.
- The replica caught up. On the primary, the
  `questdb_replication_pending_upload_txn` metric reads `0`; on the replica, no
  table is suspended and the WAL lag is nil.
- An account with the `SWITCH ROLE` permission and with `PGWIRE` (for SQL) or
  `HTTP` (for the REST endpoint). See
  [Failover operator](/docs/security/rbac/#failover-operator).
- Clients configured with a multi-host address list, so writers follow the
  primary role on their own. See
  [Client failover](/docs/high-availability/client-failover/concepts/).

The [cold storage](/docs/concepts/cold-storage/) manager role is independent of
the replication role and does not move with it. If the cluster is managed by
the [Kubernetes Operator](/docs/enterprise-kubernetes-operator/high-availability/),
use its promotion object instead; the operator does not use the in-place
switch and does not expect roles to move underneath it.

## Planned switchover

Demote first, then promote. The object store accepts one owner at a time, so a
promotion issued while the old primary still owns the store is refused; the
demote releases that ownership.

1. Confirm the primary has nothing pending: `questdb_replication_pending_upload_txn`
   is `0` on the primary's `/metrics`.
2. On the primary, demote it. A busy primary needs a budget larger than the
   default 5 seconds:

   ```questdb-sql
   SWITCH ROLE TO REPLICA TIMEOUT 60000;
   ```

   New writes are refused from this moment; connected clients stay connected
   and receive `replica access is read-only` on their next write.

3. Poll until the switch settles:

   ```questdb-sql
   SWITCH STATUS;
   ```

   | current_role | switch_in_flight | captured_at                 |
   | ------------ | ---------------- | --------------------------- |
   | REPLICA      | false            | 2026-08-28T10:15:02.114233Z |

   If `current_role` is `UNKNOWN`, stop here and follow
   [Refusals and the torn state](#refusals-and-the-torn-state).

4. On the replica, promote it:

   ```questdb-sql
   SWITCH ROLE TO PRIMARY;
   ```

5. Poll `SWITCH STATUS` on the new primary until `current_role` is `PRIMARY`,
   then check that `GET /lifecycle` reports `"ready":true` and run a test write.
6. Update `replication.role` in `server.conf` on both nodes, see
   [Restarts](#restarts).

Writers with a multi-host list reconnect to the new primary on their own. A
writer pointed at a single address must be repointed.

## Promote a replica after a primary loss

1. Make sure the failed primary is stopped and cannot restart as a primary. If
   its disk survives, set `replication.role=replica` in its `server.conf`
   before it is ever started again.
2. On the replica:

   ```questdb-sql
   SWITCH ROLE TO PRIMARY;
   ```

3. Poll `SWITCH STATUS` and `GET /lifecycle` as above.

The promotion is refused if the replica has not yet applied everything that is
in the object store. The node then stays a replica and keeps downloading;
promote it again once it has caught up. A promotion never accepts data loss:
transactions the failed primary committed but never uploaded are not in the
store, and the in-place switch cannot recover them. When the loss is accepted
and the replica cannot catch up, use the restart-based
[emergency primary migration](/docs/high-availability/setup/#emergency-primary-migration).

Once the old primary is repaired, start it with `replication.role=replica`. It
rejoins as a replica; any transactions it committed but never uploaded are
superseded by the new primary's stream.

## Choosing the timeout

`TIMEOUT` is the budget for each stage of the switch: the drain of in-flight
writers, the upload of pending transactions, the uploader shutdown, and the
materialized view quiesce. A demote spanning many tables shares one deadline
across them. The default is 5 seconds and cannot be changed in configuration;
the ceiling is 600 seconds, chosen to stay inside a typical Kubernetes
termination grace period.

Two things happen when the budget runs out during a demote:

- Client writers still busy when the drain expires: the demote is refused and
  the node stays a writable primary.
- Committed transactions still not uploaded when the upload drain expires: the
  demote is not completed and the node parks in the `UNKNOWN` state rather
  than abandoning acknowledged writes.

Size the budget from what the primary is doing. A quiet primary settles well
under a second; a primary under sustained ingestion with a backlog on the
uploader needs tens of seconds. Checking
`questdb_replication_pending_upload_txn` before the demote removes most of the
guesswork.

A promotion rarely needs a long budget: its slow part is the object-store
ownership check, which is bounded by the request timeouts of the store.

## Refusals and the torn state

A switch is accepted immediately and can still fail while it runs. The
session that submitted it does not learn about the failure; `SWITCH STATUS`,
`GET /lifecycle` and the server log do.

| Outcome                                              | Role afterwards                        | How to see it                                                                               | What to do                                                                 |
| ---------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Busy writers outlived the timeout                    | unchanged, still a writable primary    | `GET /lifecycle` reports `"ready":false` with the `replication` component `DEGRADED`; the log says `switch refused: drain budget expired with busy writers` | Quiet the writers or retry with a larger `TIMEOUT` |
| Promotion refused: the replica is behind the store   | unchanged, still replicating           | `"ready":false`, `replication` component `DEGRADED`, [ER005](/docs/troubleshooting/error-codes/#er005) text in the log | Wait for the replica to catch up, `RESUME WAL` any suspended table, retry |
| Boot in progress, switch in flight, shutting down    | unchanged                              | Statement error, or `503` / `409` from the REST endpoint                                    | Retry later                                                                |
| Demote could not upload every committed transaction  | `UNKNOWN`: read-only, not replicating  | `node_role()` returns `UNKNOWN`, `"ready":false`, log names the pending transaction count | Heal, see below                                                            |
| Any other failure part-way through the cascade       | `UNKNOWN`                              | same                                                                                        | Heal, see below                                                            |

A node in the `UNKNOWN` state refuses writes, does not upload or download, and
advertises itself as a replica to clients, so no writer selects it and no
coordinator can mistake it for a healthy primary.

To heal it:

1. Switch it back toward primary. This rebuilds the uploader, which resumes
   shipping the backlog:

   ```questdb-sql
   SWITCH ROLE TO PRIMARY;
   ```

   Either direction is accepted from `UNKNOWN`, and the node lands on the
   target of the retry if the cascade completes. Prefer `PRIMARY` when the
   cause was pending uploads.

2. Remove the cause: run `RESUME WAL` on a suspended table, restore
   connectivity to the object store, and so on.
3. Wait for `questdb_replication_pending_upload_txn` to reach `0`.
4. Retry the demote with a larger `TIMEOUT`.

If a table's backlog cannot be shipped and losing it is acceptable, add the
table to the reloadable
[`replication.disabled.tables`](/docs/configuration/database-replication/#replicationdisabledtables)
setting and retry the demote. That is the only way to make a demote abandon
committed transactions.

:::warning

Never restart a node in the `UNKNOWN` state with `replication.role=replica`.
A replica boot performs no upload audit and completes the abandoned demote,
discarding the backlog the refusal protected. Restart it as `primary`, which
replays the pending uploads at boot.

:::

## Restarts

`SWITCH ROLE` changes the role in memory only. Nothing is written to
`server.conf` or to any other file, and on the next start the node boots into
the role given by
[`replication.role`](/docs/configuration/database-replication/#replicationrole):
`replica` boots as a replica, every other value boots as a primary.

:::danger

Set `replication.role` to the node's current role on both nodes as soon as a
switch has settled, before either node can restart.

A demoted node that restarts with `replication.role=primary` can come back as a
second primary. While it ran as a replica it kept its object-store ownership
token current, so the ownership check at boot passes when it was caught up. The
conflict is only detected later, as
[ER006](/docs/troubleshooting/error-codes/#er006), and the node that detects it
halts, which may be the legitimate primary.

A promoted node that restarts with `replication.role=replica` silently demotes
itself. Transactions it committed as primary but had not yet uploaded are
superseded by the store, and if the other node is also a replica the cluster
has no primary and reports no error.

:::

## What clients see

The switch never closes a socket by itself. A demote refuses writes, drains the
in-flight writers, and swaps the authorization backend; the protocol servers are
not told anything. What a connected client observes depends on its protocol.

| Protocol                                | Connection through a demote                                                                                             | Write in the demote window                                                                                                                                                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PGWire                                  | kept open, not re-authenticated. The same session writes again after a later promotion                                  | Error `replica access is read-only` for INSERT, UPDATE, ALTER, TRUNCATE, RENAME, CREATE and DROP, view and storage policy changes. A `COMMIT` of a transaction opened before the demote is refused with the same error and the transaction is rolled back                          |
| HTTP `/exec`, Web Console               | kept open                                                                                                               | HTTP `403` with `"error":"replica access is read-only"`, same statement set                                                                                                                                                                                                      |
| ILP over HTTP                           | kept open                                                                                                               | HTTP `421` with `"code":"not accepting writes"`. A request already in flight when the demote lands gets `403` with `"code":"unauthorised"` and the read-only message                                                                                                          |
| ILP over TCP                            | kept open                                                                                                               | Rows are **silently dropped**: the protocol has no error channel and the server only logs `commit failed … replica access is read-only`. The socket is closed only when a refusal reaches the connection, for instance a write to a table first seen after the demote, and only when [`line.tcp.disconnect.on.error`](/docs/configuration/ingestion/#linetcpdisconnectonerror) is `true` |
| ILP over UDP                            | connectionless                                                                                                          | Buffered rows are dropped, with no client-visible signal                                                                                                                                                                                                                         |
| QWP ingestion                           | closed with WebSocket code `1000` and reason `replica access is read-only` on the first refused frame; idle connections are not closed. For durable acknowledgements the close waits, bounded by 10 seconds, until the committed work is durably uploaded and the final ack is flushed | The refused frame is not acknowledged and is replayed by the client after reconnecting. On reconnect the node answers `421` with `X-QuestDB-Role: REPLICA` and the client walks to the next host                                                                              |
| QWP queries, PGWire and HTTP `SELECT`   | kept open; an in-flight result keeps streaming its snapshot                                                             | not affected. The `target=` role filter of a query client is evaluated only when it connects                                                                                                                                                                                      |

ILP over TCP is the one protocol where a demote loses data without telling the
client. Move ingestion that must survive a switchover to ILP over HTTP or to
QWP with [store-and-forward](/docs/high-availability/store-and-forward/concepts/).

A demoted node advertises itself as a replica to the QWP role gate, and so does
a node in the `UNKNOWN` state. Sessions keep their identity across a switch,
but an assumed service account does not survive it.

## After the switch

- Update `replication.role` on both nodes, see [Restarts](#restarts).
- Scheduled backups run on the primary only. The schedule pauses on the
  demoted node and resumes on the promoted one. A backup that was still running
  when the node was demoted is reported by the
  `questdb_backup_active_at_last_demote` metric, see
  [Backup and restore](/docs/operations/backup/#schedules-on-a-replica).
- Materialized views are refreshed by the new primary from where the old one
  left off.
- [Storage policies](/docs/concepts/storage-policy/) are enforced on every node
  regardless of role; nothing changes there.
- The cold storage manager role stays where it was. Move it separately with
  [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/) if
  the demoted node is being retired.

## Lifecycle API

The [minimal HTTP server](/docs/operations/logging-metrics/#minimal-http-server)
on port 9003 exposes the same switch to external coordinators. It accepts the
same credentials as the main HTTP server: HTTP basic authentication, a
[REST token](/docs/connect/compatibility/rest-api/#authentication-via-token-in-questdb-enterprise)
as `Authorization: Bearer`, or an OIDC token. Which of the two OIDC tokens to
send is decided by `acl.oidc.groups.encoded.in.token`; see
[which token to send](/docs/security/oidc/#which-token-to-send). The principal needs the
`HTTP` endpoint permission and, for the switch, `SWITCH ROLE`. With access
control disabled no credentials are needed. TLS for this port is configured with
the `http.min.tls.*` settings on the [TLS](/docs/configuration/tls/) page.

### GET /lifecycle

Returns the role and the state of every server component:

```shell
curl -H "Authorization: Bearer $QDB_REST_TOKEN" \
  https://primary.example.com:9003/lifecycle
```

```json
{
  "capturedAtMicros": 1756380000123456,
  "currentRole": "PRIMARY",
  "switchInFlight": false,
  "ready": true,
  "components": [
    {
      "name": "engine",
      "state": "READY",
      "lastTransitionMicros": 1756379991204000,
      "latestProgress": null,
      "hardRequiredDependencies": ["factory-provider", "backup-restore"],
      "softDependencies": []
    },
    {
      "name": "replication",
      "state": "READY",
      "lastTransitionMicros": 1756379991650000,
      "latestProgress": null,
      "hardRequiredDependencies": ["engine"],
      "softDependencies": []
    }
  ]
}
```

- `currentRole` is `PRIMARY`, `REPLICA`, or `UNKNOWN`. During a switch it keeps
  the previous role.
- `switchInFlight` is `true` while a switch is running.
- `ready` is `false` while any component is `DEGRADED` or `FAILED`: during
  boot, and after a refused or torn switch until a later switch succeeds. The
  health check on `/status` stays `200` throughout, so a readiness probe should
  read this flag rather than the health check.
- `components` lists every server component, in registration order, with its
  `state` (`INIT`, `STARTING`, `DEGRADED`, `READY`, `SWITCHING`, `STOPPING`,
  `STOPPED`, `FAILED`), its last transition time, and its dependencies. During
  a switch the role-aware components move through `SWITCHING` one at a time.

This endpoint follows
[`http.health.check.authentication.required`](/docs/configuration/http-min-server/#httphealthcheckauthenticationrequired):
set it to `false` to let a probe read the role without credentials. The
response is chunked. QuestDB open source serves the same endpoint without the
three role fields.

### POST /lifecycle/switch

Submits a switch. `role` is `primary` or `replica` (case-insensitive);
`timeout_ms` is optional and follows the same rules as the SQL `TIMEOUT`:

```shell
curl -X POST -H "Authorization: Bearer $QDB_REST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"replica","timeout_ms":60000}' \
  https://primary.example.com:9003/lifecycle/switch
```

| Status | Body                                                                                | Meaning                                                                                                                  |
| ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `202`  | `{"accepted":true}`                                                                 | Submitted. Poll `GET /lifecycle`                                                                                         |
| `400`  | `{"error":"invalid_request","message":"…"}`                                         | Missing or invalid `role`, `timeout_ms` out of range, unknown or duplicate field, nested object                          |
| `401`  | `Unauthorized`                                                                      | No or invalid credentials. This endpoint always requires them                                                            |
| `403`  | `{"error":"permission_denied"}`                                                     | The principal lacks `SWITCH ROLE`. Audit-logged                                                                          |
| `405`  | `{"error":"method_not_allowed","message":"POST required"}`                          | Not a `POST`                                                                                                             |
| `409`  | `{"error":"switch_in_flight","current_role":"PRIMARY","target_role":"REPLICA"}`     | A switch is already running                                                                                              |
| `413`  | `{"error":"request_entity_too_large","message":"…"}`                                | Body larger than 8 KiB                                                                                                   |
| `500`  | `{"error":"internal_error"}`                                                        | The authorization check failed for a reason other than a denial. See the server log                                     |
| `503`  | `{"error":"service_unavailable","message":"…"}`                                     | `boot in progress; switch not yet available`, `server is shutting down`, or `server is busy`. Retry                      |

The `400` messages name the problem: `role required and must be one of
[primary, replica]`, `timeout_ms must be integer`, `timeout_ms must be positive;
0 strands committed-but-not-uploaded WAL`, `timeout_ms must not exceed 600000
ms`, `unknown field: …`.

A coordinator drives a switch as follows:

1. `GET /lifecycle` on the target node. Do not act on a stale read, and treat
   `UNKNOWN` on any node as a signal not to promote another one.
2. `POST /lifecycle/switch`. Treat `409` and `503` as "retry later".
3. Poll `GET /lifecycle` until `switchInFlight` is `false` and `currentRole`
   is the target. Then check `ready`; `false` means the switch was refused and
   the log has the reason.

## Next steps

- [`SWITCH ROLE`](/docs/query/sql/switch-role/) reference, with the statement
  errors and the result columns.
- [Replication setup guide](/docs/high-availability/setup/) for the
  restart-based migration procedures and point-in-time recovery.
- [Client failover](/docs/high-availability/client-failover/concepts/) for how
  clients follow the primary role.
- [Failover operator](/docs/security/rbac/#failover-operator) for the account
  that runs switches.
