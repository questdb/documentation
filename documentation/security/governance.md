---
title: Data governance and auditing
sidebar_label: Governance and auditing
description:
  How QuestDB controls who can reach your data, records who read it, traces
  the lineage of derived data, and retains and recovers it, with links to
  each feature.
---

Data governance is the set of controls that answer, for any piece of data, who
can access it, who did access it, where it came from, how long it is kept, and
whether it can be recovered. QuestDB covers these questions with features spread
across several parts of the documentation. This page groups them by the question
each one answers, so you can map QuestDB to your own policy or to an auditor's
checklist, and states where the coverage ends.

Most of these features are part of QuestDB Enterprise. Views, query tracing,
`SHOW CREATE`, metrics, read-only interfaces, and checkpoint backups are
available in all editions.

## At a glance

| Question | Feature | Edition |
| -------- | ------- | ------- |
| Who is connecting? | [OIDC single sign-on](/docs/security/oidc/), [users and service accounts](/docs/security/rbac/#users-and-service-accounts), [TLS](/docs/security/tls/) | QuestDB Enterprise |
| What may they read or change? | [Permissions](/docs/security/rbac/), down to [column](/docs/security/rbac/#column-level-access) and [row](/docs/security/rbac/#row-level-access-with-views) level | QuestDB Enterprise |
| What may they even see? | [Object visibility](/docs/security/rbac/#object-visibility) | QuestDB Enterprise 4.1.0+ |
| How much may they consume? | [Resource groups](/docs/concepts/resource-groups/) and [per-principal memory limits](/docs/security/rbac/#memory-limits) | QuestDB Enterprise 4.1.0+ |
| Who can do what, right now? | [Access control functions](/docs/query/functions/access-control/), [`SHOW CREATE DATABASE`](/docs/query/sql/show/#enterprise-access-control) | QuestDB Enterprise |
| Who read this data? | [Audited views](/docs/security/audited-views/) | QuestDB Enterprise |
| What queries ran recently? | [Query tracing](/docs/concepts/deep-dive/query-tracing/), [`query_activity()`](/docs/query/functions/meta/#query_activity) | All |
| Where does this data come from? | [`SHOW CREATE`](/docs/query/sql/show/), [`views()`](/docs/query/functions/meta/#views), [`materialized_views()`](/docs/query/functions/meta/#materialized_views) | All |
| How long is it kept? | [Storage policies](/docs/concepts/storage-policy/) | QuestDB Enterprise |
| How long is it kept? | [TTL](/docs/concepts/ttl/) | QuestDB open source |
| Can it still change? | [Immutability after `DROP LOCAL`](/docs/concepts/cold-storage/#immutability-after-drop-local) | QuestDB Enterprise |
| Can we recover it? | [Backup](/docs/operations/backup/), [point-in-time recovery](/docs/operations/point-in-time-recovery/), [replication](/docs/high-availability/overview/) | QuestDB Enterprise |
| Can we recover it? | [Checkpoints](/docs/operations/backup/#questdb-oss-manual-backups-with-checkpoints) | All |

## Control access

### Identity

Every connection in QuestDB Enterprise runs as a principal: a user, or a
[service account](/docs/security/rbac/#users-and-service-accounts) for
applications. Principals authenticate with passwords, JWK tokens for ILP, or
REST tokens with an expiry, and [OIDC](/docs/security/oidc/) delegates
authentication to an identity provider such as Microsoft Entra ID or
PingFederate. With OIDC, group claims from the provider
[map to QuestDB groups](/docs/security/oidc/#mapping-user-permissions), so
access follows the directory instead of being maintained in two places.

[TLS](/docs/security/tls/) encrypts traffic on the HTTP, PGWire, and ILP
endpoints, and certificates can be rotated without a restart.

### Permissions

[Role-based access control](/docs/security/rbac/) grants permissions to users,
groups, and service accounts at database, table, and column level, and
[per endpoint](/docs/security/rbac/#endpoint-permissions), so a service account
can be limited to ILP ingestion only. A grant carries the
[grant option](/docs/security/rbac/#the-grant-option) only when you say so,
which keeps delegation explicit.

QuestDB stores no owner for an object. Its creator, or the user or group named
in [`OWNED BY`](/docs/query/sql/create-table/#owned-by), receives all
permissions on it with the grant option, and from then on these are ordinary
grants. To find who controls an object, look for the principals that hold
permissions on it with the grant option, as shown in
[Review entitlements](#review-entitlements).

Column-level grants hide sensitive columns from a principal:

```questdb-sql title="Every column of fx_trades except the counterparty"
GRANT SELECT ON fx_trades(* EXCLUDE (counterparty)) TO analyst;
```

Row-level restrictions use [views](/docs/concepts/views/): a view captures
its creator's permissions, so granting `SELECT` on a filtered view, and not on its
table, exposes only the matching rows. See
[row-level security](/docs/cookbook/sql/advanced/row-level-security/) for a
worked multi-tenant example.

Since QuestDB Enterprise 4.1.0,
[object visibility](/docs/security/rbac/#object-visibility) hides tables and
views from principals that hold no permission on them. A hidden object is left
out of `SHOW TABLES`, `tables()`, `information_schema`, and `pg_catalog`, and
statements that name it fail as if it did not exist. A few paths still reveal a
hidden object, listed in the RBAC
[limitations](/docs/security/rbac/#limitations).

### Read-only interfaces

[`http.security.readonly`](/docs/configuration/http-server/#httpsecurityreadonly)
and
[`pg.security.readonly`](/docs/configuration/postgres-wire-protocol/#pgsecurityreadonly)
make an interface refuse statements that modify data or structure. This is
available in all editions, and in QuestDB open source it is the main way to protect data from a
reporting tool. It is a data boundary, not an administrative lockdown.

### Resource limits

[Resource groups](/docs/concepts/resource-groups/) cap how many queries a set
of principals may run at once, their share of CPU, and their query memory, so
one tenant cannot starve another.
[Per-principal memory limits](/docs/security/rbac/#memory-limits) override the
server-wide limit for a single user, group, or service account. Both are
available since QuestDB Enterprise 4.1.0.

## Review entitlements

The [access control functions](/docs/query/functions/access-control/) return
permissions as rows, so an entitlement review is a query rather than one
`SHOW PERMISSIONS` per principal. `active_permissions()` resolves group
membership and reports what each principal can effectively do:

```questdb-sql title="Who can read fx_trades, and who can pass that on"
SELECT entity_name, entity_type, column_name, grant_option
FROM active_permissions()
WHERE permission = 'SELECT'
  AND (table_name = 'fx_trades' OR table_name IS NULL)
ORDER BY entity_name;
```

A row with an empty `table_name` is a database-level grant, which covers every
table. `active_grants()` lists only direct grants, and
`active_permissions() EXCEPT active_grants()` shows what was inherited. The
functions have
[limitations](/docs/query/functions/access-control/#limitations): the built-in
admin and OIDC users are not listed, for example.

For a point-in-time snapshot of the whole access control layer,
[`SHOW CREATE DATABASE`](/docs/query/sql/show/#enterprise-access-control)
dumps every user, group, service account, membership, and grant as replayable
SQL, without credentials:

```questdb-sql title="Snapshot of identities, memberships, and grants"
SHOW CREATE DATABASE INCLUDE (ACL);
```

Storing that output on a schedule gives you a history of entitlements that you
can diff between two reviews.

## Audit data access

### Audited views

An [audited view](/docs/security/audited-views/), created `WITH AUDIT`, records
a row in `sys.view_audit` for each read: the principal, when the read finished,
how long it took, whether it succeeded, and the values of the view parameters
marked `AUDITED`. Put sensitive data behind an audited view, grant `SELECT` on
the view and not on its tables, and the trail answers who looked at which
symbols, accounts, or time ranges:

```questdb-sql title="Who read the positions view in the last week"
SELECT ts, principal, params, status
FROM sys.view_audit
WHERE view_name = 'positions_by_book'
  AND ts IN '$now-7d..$now'
ORDER BY ts DESC;
```

No principal, the built-in admin included, can insert into, update, rename, or
drop the audit table, see
[tamper protection](/docs/security/audited-views/#protection). Read the
[delivery guarantees](/docs/security/audited-views/#delivery) and
[limitations](/docs/security/audited-views/#limitations) before relying on the
trail as evidence: recording is best-effort, and some paths read the same data
without an audit row.

### Query tracing

[Query tracing](/docs/concepts/deep-dive/query-tracing/) records the text,
duration, and principal of every query in the `_query_trace` table. It is off
by default and keeps 24 hours of history, so treat it as a short-term
investigation tool rather than an audit log.

### Running queries

[`query_activity()`](/docs/query/functions/meta/#query_activity) lists the
queries running now, with the user, the query text, and the memory used, and
[`CANCEL QUERY`](/docs/query/sql/cancel-query/) stops one.

## Trace lineage

Views, materialized views, and live views are defined in SQL, and that
definition is the lineage of the data they return.
[`views()`](/docs/query/functions/meta/#views) and
[`materialized_views()`](/docs/query/functions/meta/#materialized_views) list
each view with its SQL, and `materialized_views()` also names the base table
and the last refresh times:

```questdb-sql title="Materialized views and the tables they derive from" demo
SELECT view_name, base_table_name, last_refresh_finish_timestamp
FROM materialized_views();
```

[`SHOW CREATE`](/docs/query/sql/show/) returns the full DDL of a single table or
view, and `SHOW CREATE DATABASE` returns every object in dependency order, so
each view appears after the objects it reads from. Running it on a schedule and
keeping the output records how the schema changed over time.

## Retain and protect data

A [storage policy](/docs/concepts/storage-policy/) moves each partition through
its lifecycle on a schedule: conversion to Parquet, upload to
[cold storage](/docs/concepts/cold-storage/) in an object store, removal of
the local copy, and final deletion. This makes retention a property of the
table, declared once, instead of a script that has to keep running:

```questdb-sql title="Keep 90 days locally and three years in object storage"
ALTER TABLE fx_trades SET STORAGE POLICY(
    TO PARQUET 7d,
    TO REMOTE 14d,
    DROP LOCAL 90d,
    DROP REMOTE 3Y
);
```

Once `DROP LOCAL` runs, a partition is
[sealed](/docs/concepts/cold-storage/#immutability-after-drop-local): later
inserts and updates that target it are not applied, and removing the policy does
not unseal it. Partitions in cold storage remain queryable with normal SQL.

To check that retention is applied,
[`storage_policies`](/docs/query/functions/meta/#storage_policies) lists the
policy on each table, including system tables such as `sys.view_audit`, and
[`table_cold_partitions()`](/docs/query/functions/meta/#table_cold_partitions)
shows which partitions of a table are uploaded and sealed.

In QuestDB open source, [TTL](/docs/concepts/ttl/) drops partitions older than a set
age. QuestDB Enterprise rejects TTL on user tables in favor of storage
policies. See [data retention](/docs/operations/data-retention/) for the manual
options.

## Recover and verify

QuestDB Enterprise [backups](/docs/operations/backup/) upload only changed data
to object storage and run on a schedule, and an optional BLAKE3 hash of every partition file is
[verified on restore](/docs/operations/backup/#backup-validation).
[Point-in-time recovery](/docs/operations/point-in-time-recovery/) replays
replicated WAL on top of a backup to rebuild the database as it stood at any
instant, for example just before an accidental `DROP TABLE`.
[Replication](/docs/high-availability/overview/) keeps hot copies on other
nodes. In all editions, you can also use
[checkpoints](/docs/operations/backup/#questdb-oss-manual-backups-with-checkpoints)
with your own snapshot tooling.

To find when a destructive change was committed, use the server log, or
`wal_transactions()` while the table still exists, as described in
[choosing a recovery timestamp](/docs/operations/point-in-time-recovery/#choosing-a-recovery-timestamp).

## Monitor

QuestDB exposes [metrics](/docs/operations/logging-metrics/#metrics) to
Prometheus and records them every second in
[`sys.metrics`](/docs/operations/logging-metrics/#persisted-metrics), including
[resource group metrics](/docs/operations/logging-metrics/#resource-group-metrics)
that show admission waits and rejections per group. These are operational
signals and do not include authentication events.

## Coverage limits

Check these gaps against your requirements before mapping QuestDB to a
compliance control:

- **Read auditing is best-effort.** Audited views can
  [lose rows](/docs/security/audited-views/#delivery) under overload, a failed
  write, or a crash, and there is no lossless mode. Each node keeps its own
  trail, which is not replicated. Old rows can be removed by retention, and the
  removal itself is not recorded.
- **Only reads through an audited view are audited.** A principal with `SELECT`
  on the underlying tables reads the same rows with no audit row, and denied
  reads are usually not recorded.
- **There is no durable query log.** Query tracing keeps 24 hours.
- **There is no audit log of DDL, grants, or logins.** Schema changes, grants
  and revokes, and authentication attempts are not recorded in a queryable
  table. Snapshots from `SHOW CREATE DATABASE` and the server log are the
  closest substitutes.
- **There is no session listing.** `query_activity()` shows running queries,
  not idle connections.
- **There is no encryption at rest or data masking.** Use storage-level
  encryption for data at rest, and column grants or views to keep sensitive
  values from a principal.
- **There are no table or column comments**, so data classification has to live
  outside the database.
