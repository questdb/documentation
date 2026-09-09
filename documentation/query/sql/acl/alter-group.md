---
title: ALTER GROUP reference
sidebar_label: ALTER GROUP
description:
  "ALTER GROUP sets a per-group query memory limit or maps an external OIDC or
  LDAP group alias. Applies to RBAC in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER GROUP` caps the query memory of a group's members with
`SET MEMORY LIMIT`, so one team's runaway query cannot exhaust shared memory,
and maps or unmaps an external OIDC or LDAP group with `WITH` or
`DROP EXTERNAL ALIAS`, so logins from that identity provider inherit the
group's permissions.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

---

## Syntax

```questdb-sql title="Set or clear memory limit"
ALTER GROUP groupName SET MEMORY LIMIT { size | UNLIMITED };
```

```questdb-sql title="Add or remove external alias"
ALTER GROUP groupName { WITH | DROP } EXTERNAL ALIAS externalAlias;
```

## Description

- `ALTER GROUP groupName SET MEMORY LIMIT size` - caps the native memory that
  each query run by a member of the group may allocate. `size` is a byte count
  or a size with a `K`, `M`, or `G` suffix, such as `512M` or `2G`.
- `ALTER GROUP groupName SET MEMORY LIMIT UNLIMITED` - clears the group's limit.
  Members without a limit of their own then fall back to the most restrictive
  limit among their other groups, or to the workload limit
  (`cairo.query.memory.limit.bytes`). `SET MEMORY LIMIT 0` does the same.
- `ALTER GROUP groupName WITH EXTERNAL ALIAS externalAlias` - maps an external
  OIDC or LDAP group to this group.
- `ALTER GROUP groupName DROP EXTERNAL ALIAS externalAlias` - removes an external
  group mapping.

A group limit applies to a member only when that member has no limit of its own.
When several of a user's groups set a limit, the most restrictive one applies.
Setting a group limit requires the `SET MEMORY LIMIT` permission. See
[memory limits](/docs/security/rbac/#memory-limits) for how a group limit
interacts with the
[`cairo.query.memory.limit.bytes`](/docs/configuration/cairo-engine/#cairoquerymemorylimitbytes)
workload limit.

Adding an alias requires the `ADD EXTERNAL ALIAS` permission and removing one
requires `REMOVE EXTERNAL ALIAS`. Quote the alias when it contains commas,
spaces, or `=`, as LDAP distinguished names do. For external group mapping with
OIDC or LDAP, see the
[OpenID Connect (OIDC) integration](/docs/security/oidc/#mapping-user-permissions)
guide.

## Examples

### Set memory limit

```questdb-sql
-- cap queries of the group's members at 2 GiB of native memory
ALTER GROUP analysts SET MEMORY LIMIT 2G;
-- remove the limit
ALTER GROUP analysts SET MEMORY LIMIT UNLIMITED;
```

The configured value can be verified with
[`SHOW GROUPS`](/docs/query/sql/show/#show-groups), which reports it in the
`memory_limit` column.

### Map an external group

```questdb-sql
ALTER GROUP analysts WITH EXTERNAL ALIAS 'CN=Analysts,OU=Users,DC=example,DC=com';
ALTER GROUP analysts DROP EXTERNAL ALIAS 'CN=Analysts,OU=Users,DC=example,DC=com';
```
