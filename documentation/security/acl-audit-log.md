---
title: ACL audit log
sidebar_label: ACL audit log
description:
  Track changes to users, groups, service accounts, credentials, and permissions
  in QuestDB Enterprise, with principal attribution and configurable retention.
---

The ACL audit log records changes to access control in `sys.acl_audit_log`, so
you can investigate who granted access, changed credentials, or modified a
principal. Each row identifies the authenticated principal, the principal it
acted as, and the statement that caused the change.

:::note

The ACL audit log is available in [QuestDB Enterprise](/enterprise/). For read
auditing rather than access control changes, see
[Audited views](/docs/security/audited-views/).

:::

## Read the log

Reading the log requires all three permissions:

- `LIST USERS`.
- `USER DETAILS`.
- `SELECT` on `sys.acl_audit_log`, or on all tables.

The statement texts disclose identities, memberships, grants, and external group
aliases, so `SELECT ON ALL TABLES` alone is not enough. Without both
`LIST USERS` and `USER DETAILS`, the table looks missing. Permissions may be
inherited through a group. The built-in admin and principals with
`DATABASE ADMIN` can read the log.

For an existing user named `auditor`, grant:

```questdb-sql title="Allow an auditor to read ACL changes"
GRANT LIST USERS, USER DETAILS TO auditor;
GRANT SELECT ON 'sys.acl_audit_log' TO auditor;
```

The user also needs an
[endpoint permission](/docs/security/rbac/#endpoint-permissions) such as `HTTP`
or `PGWIRE` to connect.

```questdb-sql title="Review access control changes in the last week"
SELECT change_id, session_principal, effective_principal,
       is_external, statement_kind, statement_text
FROM 'sys.acl_audit_log'
WHERE change_id IN '$now-7d..$now'
ORDER BY change_id DESC;
```

## Log columns

`sys.acl_audit_log` is a WAL table partitioned by day, with `change_id` as its
[designated timestamp](/docs/concepts/designated-timestamp/).

| Column                | Type        | Description                                                                                                                                    |
| --------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `change_id`           | `TIMESTAMP` | Microsecond timestamp identifying the change. Rows written by the same change to ACL and credential tables carry this value.                   |
| `session_principal`   | `VARCHAR`   | Principal that authenticated the session. `NULL` when no principal is available.                                                               |
| `effective_principal` | `VARCHAR`   | Principal whose permissions were used, such as an assumed service account. `NULL` when no principal is available.                              |
| `is_external`         | `BOOLEAN`   | Whether the session principal is managed by an external identity provider, such as OIDC. Assuming a service account does not change this flag. |
| `origin`              | `VARCHAR`   | `user` for changes caused by user statements, or `migration` for changes made by an internal ACL migration.                                    |
| `statement_kind`      | `VARCHAR`   | Statement category, such as `CREATE USER`, `GRANT`, or `ALTER SERVICE ACCOUNT`.                                                                |
| `statement_text`      | `VARCHAR`   | Statement text with passwords and REST token values replaced by `'****'`. `NULL` when the text is unavailable.                                 |

With [`ASSUME SERVICE ACCOUNT`](/docs/query/sql/acl/assume-service-account/),
`session_principal` remains the user who connected, while `effective_principal`
names the service account. Otherwise, the two normally match. Use `is_external`
to distinguish an OIDC identity from a local user with the same name.

```questdb-sql title="Find changes made through an assumed service account"
SELECT change_id, session_principal, is_external, statement_text
FROM 'sys.acl_audit_log'
WHERE effective_principal = 'risk_admin'
  AND session_principal != effective_principal
ORDER BY change_id DESC;
```

## Recorded changes

The log covers changes to users, groups, service accounts, group membership,
external aliases, grants and revokes, passwords, JWK tokens, and persistent REST
tokens. It also records per-principal memory limit changes and resource group
assignments. Creating, altering, or dropping a resource group itself is not an
ACL change and is not recorded here.

An audited statement produces one audit row even when it writes multiple ACL or
credential rows. For example, `CREATE USER ... WITH PASSWORD` records the
creation and password assignment under one `change_id`, and a cascading `REVOKE`
uses the same ID for all affected grants. Each statement in a batch records its
own text, not the entire batch.

DDL can produce audit rows for its permission changes, but this is not a
complete DDL log:

- Owner grants on new tables, views, materialized views, live views, and columns
  record the creator as the principal, with no statement text.
- Grant cleanup after dropping or renaming a table or column records the
  statement kind, with `NULL` principals and statement text. Its origin is still
  `user`.
- DDL that writes no ACL rows leaves no audit row.

The following also leave no audit row:

- Authentication attempts and ordinary queries.
- Statements that fail before their first write, or write nothing, such as
  `CREATE USER IF NOT EXISTS` when the user already exists.
- Transient REST token creation or removal. These tokens exist only in memory on
  the node that issued them.
- REST token TTL refreshes. Refreshed credential rows retain the issuing
  change's ID instead of creating another audit row. `DROP TOKEN TYPE REST` is
  audited only when it removes a persistent token.

## Link changes to ACL rows

The following system tables carry a `change_id` column linking a row to its
audit entry:

- `sys.acl_entities`
- `sys.acl_external_groups`
- `sys.acl_jwk_tokens`
- `sys.acl_links`
- `sys.acl_passwords`
- `sys.acl_permissions`
- `sys.acl_permissions_history`
- `sys.acl_rest_tokens`

These are [protected tables](/docs/security/rbac/#visibility-rules): only the
built-in admin can query them, even when another principal can read the audit
log. For example, run this as the built-in admin:

```questdb-sql title="Trace permission rows back to the statement that wrote them"
SELECT p.name, p.table_name, p.column_name, p.status,
       a.change_id, a.session_principal, a.statement_text
FROM 'sys.acl_permissions' p
JOIN 'sys.acl_audit_log' a ON p.change_id = a.change_id
WHERE p.name = 'risk_analyst'
ORDER BY a.change_id DESC;
```

[Permission compaction](/docs/configuration/iam/#aclpermissionscompactionrowthreshold)
preserves `change_id` when archiving rows to `sys.acl_permissions_history`.
Query that table instead for archived grants and revokes. Rows written before
the column was added keep a `NULL` ID and do not join to the log. Audit
retention can also remove the corresponding log row.

## Delivery and failure behavior

Before an ACL statement writes its first change, QuestDB commits its audit row
to the log's WAL. If that commit fails, the ACL change does not proceed. The row
becomes queryable after WAL apply, so it may not appear immediately. An audit
row is not proof that the whole statement succeeded: a later write can fail
after the audit row was committed.

Two post-DDL operations are best-effort exceptions: grant cleanup after a drop
or rename, and the owner grant on a newly added column. The DDL has already
committed, so these permission changes still proceed if their audit row cannot
be written. The server logs the failure, and the affected rows have no
`change_id`.

:::warning Audit write availability

With
[`cairo.wal.apply.suspended.write.denied=true`](/docs/configuration/wal/#cairowalapplysuspendedwritedenied),
listing `sys.acl_audit_log` in
[`cairo.wal.apply.suspended.tables`](/docs/configuration/wal/#cairowalapplysuspendedtables)
blocks ACL statements. It also blocks creating objects for owners other than the
built-in admin, including tables created by ingestion, because these operations
must grant permissions to the owner. Remove the audit table from the list to
restore those operations.

:::

Change IDs increase even when the system clock moves backward. Audit, ACL, and
credential timestamps can therefore be ahead of the wall clock until it catches
up. Do not assume that an ID is an exact wall-clock event time, or that a query
bounded by `$now` includes every recent change after a clock correction.

## Protection and administration

The log is system-managed. With access control enabled, no principal, including
the built-in admin, can insert or update its rows through SQL or authenticated
ingestion.

Only the built-in admin, without an assumed service account, can truncate the
log, drop partitions, set TTL, or change its storage policy. Ordinary table
grants, `ALL`, `DATABASE ADMIN`, and `SYSTEM ADMIN` do not authorize these
operations. These capabilities mean the log is not an immutable archive.

The following are refused even to the built-in admin:

- Creating an object under the reserved name `sys.acl_audit_log`. Only the
  server creates the log.
- Dropping or renaming the log, or renaming another table to its name.
- Structural changes to its columns or deduplication settings.
- `SUSPEND WAL` and `RESUME WAL FROM TXN`. Skipping transactions could discard
  audit rows for changes that already took effect. `REBASE WAL` is also
  unavailable because it requires a manually suspended table.

A failed WAL apply can still suspend the table. Plain
[`RESUME WAL`](/docs/query/sql/alter-table-resume-wal/) applies waiting rows
without skipping them and remains available with the `RESUME WAL` permission.
`SYSTEM ADMIN` and `DATABASE ADMIN` holders can inspect the log's WAL state
through WAL diagnostics even without permission to read its rows.

:::warning Keep authentication enabled

Keep both [`acl.enabled`](/docs/configuration/iam/#aclenabled) and
[`line.tcp.acl.enabled`](/docs/configuration/iam/#linetcpaclenabled) enabled,
and restrict network access to ingestion endpoints. Unauthenticated ILP over TCP
does not enforce the system-managed table write protections.

:::

## Retention

The default policy, `TO PARQUET 1d`, converts daily partitions to Parquet one
day after each partition ends and never deletes rows. Set
[`acl.audit.storage.policy`](/docs/configuration/iam/#aclauditstoragepolicy) on
every node before the log is first created if you need automatic retention:

```ini title="server.conf: Keep one year of ACL changes"
acl.audit.storage.policy=TO PARQUET 1d, DROP LOCAL 365d
```

The setting applies only at table creation. To change an existing log's policy,
run this as the built-in admin on the primary:

```questdb-sql title="Set retention on an existing ACL audit log"
ALTER TABLE 'sys.acl_audit_log'
SET STORAGE POLICY(TO PARQUET 1d, DROP LOCAL 365d);
```

Only `TO PARQUET` and `DROP LOCAL` stages are supported. `TO REMOTE` and
`DROP REMOTE` are rejected, even though the log replicates. Without remote
storage, `DROP LOCAL` deletes the affected partitions, so keep backups or export
the log before retention removes evidence you need.

An empty setting creates the table without a policy. A rejected policy is logged
and the table is created without it. Verify the policy after the first startup
and after a replica's first promotion:

```questdb-sql title="Check the ACL audit log's storage policy"
SHOW CREATE TABLE 'sys.acl_audit_log';
```

A non-zero TTL blocks setting a storage policy. Clear it first with
`ALTER TABLE 'sys.acl_audit_log' SET TTL 0 HOURS`.

If the [built-in admin](/docs/security/rbac/#built-in-admin) is disabled, nobody
can change the policy or manually remove rows. Configure retention before
disabling it. An existing policy keeps running without an enabled admin;
changing it later requires temporarily enabling the built-in admin and
restarting the server.

## Replication, upgrades, and restores

Unlike `sys.view_audit`, both the definition and rows of `sys.acl_audit_log`
[replicate](/docs/high-availability/overview/). The primary writes the log, and
replicas receive it along with its storage policy. A replica promoted before
receiving the log creates its own, using its local `acl.audit.storage.policy`
setting. An ACL statement that finds the log missing during promotion creates it
with the same policy.

On an ordinary upgrade, the server creates the log and adds `change_id` to
existing ACL and credential tables. It does not reconstruct past changes. Tables
with suspended WAL apply get the column at a later startup after they are
resumed. Until the permissions history table has the column, compaction archives
rows without their change IDs.

A backup taken before the log was introduced is handled differently: startup
neither creates the missing log nor adds `change_id` to restored tables. This
allows continued restore updates from an older source. See
[Restoring access control tables](/docs/operations/backup/#restoring-access-control-tables)
for when the log and columns appear, and what to do after the final restore.

Before upgrading or rolling back, review the
[ACL audit log upgrade considerations](/docs/operations/upgrade/#acl-audit-log).
Older versions do not enforce the log's protections and cannot compact the
permissions table after it gains `change_id`.
