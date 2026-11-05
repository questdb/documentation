---
title: Identity and access management (IAM)
sidebar_label: Identity and access management
description:
  Configuration settings for Identity and Access Management in QuestDB
  Enterprise.
---

:::note

Identity and Access Management is available within
[QuestDB Enterprise](/enterprise/).

:::

Identity and Access Management (IAM) controls authentication and authorization
for all QuestDB interfaces. These settings cover the built-in admin user,
password hashing, REST token behavior, ACL audit retention, and permission
compaction.

For a full explanation of IAM, see the
[Identity and Access Management (IAM) documentation](/docs/security/rbac).

## Authentication and authorization

### acl.admin.password

- **Default**: `quest`
- **Reloadable**: yes

The password of the built-in admin user.

### acl.admin.user

- **Default**: `admin`
- **Reloadable**: no

Name of the built-in admin user.

### acl.admin.user.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables the built-in admin user.

### acl.basic.auth.realm.enabled

- **Default**: `false`
- **Reloadable**: no

When enabled, the browser's basic auth popup window is used instead of the Web
Console's login screen. Present for backwards compatibility only.

### acl.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables Identity and Access Management.

### acl.entity.name.max.length

- **Default**: `255`
- **Reloadable**: no

Maximum length of user, group, and service account names.

### acl.password.hash.iteration.count

- **Default**: `100000`
- **Reloadable**: no

Number of hash iterations used in password hashing. QuestDB Enterprise never
stores passwords in plain text. Higher values are safer but slower. This should
almost never be changed.

### acl.rest.token.refresh.threshold

- **Default**: `10`
- **Reloadable**: no

When a REST token is created in REFRESH mode, its TTL is extended on every
successful authentication, unless the last authentication was within this
threshold (in seconds). Removes unnecessary overhead of continuously refreshing
tokens that are used frequently.

### line.tcp.acl.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables authentication for the ILP over TCP endpoint only. Keep it
enabled to enforce write protections on system-managed tables, including the
[ACL audit log](/docs/security/acl-audit-log/#protection-and-administration).

## ACL audit log

### acl.audit.storage.policy

- **Default**: `TO PARQUET 1d`
- **Reloadable**: no

:::note Upcoming Enterprise setting

This setting belongs to the upcoming ACL audit log feature. It is not available
in QuestDB Enterprise 4.1.0 or earlier.

:::

[Storage policy](/docs/concepts/storage-policy/) used when the server creates
`sys.acl_audit_log`. The value is a comma-separated list of stages, without
surrounding parentheses.

The default policy, `TO PARQUET 1d`, never deletes rows. It makes inactive daily
partitions eligible for Parquet conversion when the reference time is at least
one day after the partition's start, not its end. By default, the reference time
is the earlier of the latest audit timestamp and the wall clock. Conversion runs
asynchronously.

Add `DROP LOCAL` to delete older audit evidence automatically. It uses the same
[partition-start rule](/docs/concepts/storage-policy/#ttl-evaluation) as
conversion: with daily partitions, `DROP LOCAL 365d` can delete a row almost a
day before it is 365 days old. For a minimum 365-day retention window based on
`change_id`, include a one-day partition allowance:

```ini title="server.conf: 365-day minimum timestamp-based retention"
acl.audit.storage.policy=TO PARQUET 1d, DROP LOCAL 366d
```

This is timestamp-based retention, not elapsed time since a change was recorded.
A quiet log may retain partitions longer while its latest timestamp does not
advance.

- Only `TO PARQUET` and `DROP LOCAL` are supported. `TO REMOTE` and
  `DROP REMOTE` are rejected.
- Set the property on every node before the table is first created. Replicas
  normally receive the primary's table and policy, but a replica promoted before
  receiving the table creates it using its own setting.
- Changing this setting does not change an existing table's policy, even after a
  restart. Only the built-in admin can change it with
  [`ALTER TABLE SET STORAGE POLICY`](/docs/query/sql/alter-table-set-storage-policy/).
- An empty value creates the table without a policy. If the policy is rejected,
  the server logs the error and creates the table without it. Check the result
  with `SHOW CREATE TABLE 'sys.acl_audit_log'`.
- On a database restored from a backup, creation of the log and its policy can
  be deferred to preserve restore compatibility. See
  [Restoring access control tables](/docs/operations/backup/#restoring-access-control-tables).

See [ACL audit log retention](/docs/security/acl-audit-log/#retention) for
administration when the built-in admin is disabled.

## Permission compaction

### acl.permissions.compaction.row.threshold

- **Default**: `10000`
- **Reloadable**: no

Number of rows in `sys.acl_permissions` above which the table is compacted. Set
to `0` or below to disable compaction.

`sys.acl_permissions` is an append-only log of grants and revokes, collapsed at
read time to give each entity its current permissions. A deployment that
re-grants on a schedule accumulates rows indefinitely, and past a certain size
every replicated `GRANT` makes a replica reload a progressively larger access
list, slowing logins. Compaction rewrites the log to keep only the rows that
still matter.

Archived rows in `sys.acl_permissions_history` retain their `change_id`, which
links them to the
[ACL audit log](/docs/security/acl-audit-log/#link-changes-to-acl-rows),
provided the history table has the column.

### acl.permissions.compaction.startup.delay

- **Default**: `300000`
- **Reloadable**: no

Grace period in milliseconds before the backlog check runs after a boot or a
promotion. The delay keeps compaction from competing with a node that is still
starting up or taking over as primary.
