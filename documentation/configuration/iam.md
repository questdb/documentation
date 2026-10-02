---
title: Identity and Access Management (IAM)
sidebar_label: Identity and Access Management
description: Configuration settings for Identity and Access Management in QuestDB Enterprise.
---

:::note

Identity and Access Management is available within
[QuestDB Enterprise](/enterprise/).

:::

Identity and Access Management (IAM) controls authentication and authorization
for all QuestDB interfaces. These settings cover the built-in admin user,
password hashing, and REST token behavior.

For a full explanation of IAM, see the
[Identity and Access Management (IAM) documentation](/docs/security/rbac).

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

When enabled, the browser's basic auth popup window is used instead of the
Web Console's login screen. Present for backwards compatibility only.

Cannot be enabled together with
[`acl.oidc.enabled`](/docs/configuration/oidc/#acloidcenabled). Setting both
to `true` fails server startup.

### acl.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables Identity and Access Management.

### acl.permissions.compaction.row.threshold

- **Default**: `10000`
- **Reloadable**: no

Number of rows in `sys.acl_permissions` above which the table is compacted.
Set to `0` or below to disable compaction.

`sys.acl_permissions` is an append-only log of grants and revokes, collapsed
at read time to give each entity its current permissions. A deployment that
re-grants on a schedule accumulates rows indefinitely, and past a certain size
every replicated `GRANT` makes a replica reload a progressively larger access
list, slowing logins. Compaction rewrites the log to keep only the rows that
still matter.

### acl.permissions.compaction.startup.delay

- **Default**: `300000`
- **Reloadable**: no

Grace period in milliseconds before the backlog check runs after a boot or a
promotion. The delay keeps compaction from competing with a node that is still
starting up or taking over as primary.

### acl.entity.name.max.length

- **Default**: `255`
- **Reloadable**: no

Maximum length of user, group, and service account names.

### acl.password.hash.iteration.count

- **Default**: `100000`
- **Reloadable**: no

Number of hash iterations used in password hashing. QuestDB Enterprise never
stores passwords in plain text. Higher values are safer but slower. This
should almost never be changed.

### acl.rest.token.refresh.threshold

- **Default**: `10`
- **Reloadable**: no

When a REST token is created in REFRESH mode, its TTL is extended on every
successful authentication, unless the last authentication was within this
threshold (in seconds). Removes unnecessary overhead of continuously
refreshing tokens that are used frequently.

### line.tcp.acl.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables authentication for the ILP over TCP endpoint only.
