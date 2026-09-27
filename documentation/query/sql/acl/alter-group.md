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

`ALTER GROUP` changes a QuestDB group's query memory limit or adds and removes
external Identity Provider aliases. For an end-to-end OIDC example, see
[Mapping groups and permissions](/docs/security/oidc/group-mapping/).

---

## Syntax

```questdb-sql title="Set or clear memory limit"
ALTER GROUP groupName SET MEMORY LIMIT { size | UNLIMITED };
```

```questdb-sql title="Add an external alias"
ALTER GROUP groupName WITH EXTERNAL ALIAS externalAlias;
```

```questdb-sql title="Remove an external alias"
ALTER GROUP groupName DROP EXTERNAL ALIAS externalAlias;
```

## Set memory limit

`SET MEMORY LIMIT size` caps the tracked native memory each query run by a
member of the group may allocate. `size` is a byte count or a size with a `K`,
`M`, or `G` suffix, such as `512M` or `2G`. `UNLIMITED` or `0` clears the group's
limit. Members without a limit of their own then fall back to the most
restrictive limit among their other groups, or to the workload limit
(`cairo.query.memory.limit.bytes`).

A group limit applies to a member only when that member has no limit of their
own. When several of a user's groups set a limit, the most restrictive one
applies. For details, see [RBAC memory limits](/docs/security/rbac/memory-limits/)
and the [`cairo.query.memory.limit.bytes`](/docs/configuration/cairo-engine/#cairoquerymemorylimitbytes)
workload limit.

Setting a group limit requires the `SET MEMORY LIMIT` permission.

```questdb-sql
-- Cap each query run by a member of the group at 2 GiB of native memory
ALTER GROUP analysts SET MEMORY LIMIT 2G;
-- Remove the group limit
ALTER GROUP analysts SET MEMORY LIMIT UNLIMITED;
```

Verify the configured value with [`SHOW GROUPS`](/docs/query/sql/show/#show-groups),
which reports it in the `memory_limit` column.

## External aliases

`WITH EXTERNAL ALIAS` maps a group name or identifier supplied by an OIDC or
LDAP Identity Provider to `groupName`. An external user receives the QuestDB
group's permissions when their group claim contains that alias. External aliases
are globally unique: if an alias is already reserved, adding it fails instead
of replacing the existing mapping. Quote an alias when it contains commas,
spaces, or `=`, as LDAP distinguished names do.

`DROP EXTERNAL ALIAS` removes the named mapping without dropping the QuestDB
group or changing permissions granted to it. Adding an alias requires
`ADD EXTERNAL ALIAS`; removing one requires `REMOVE EXTERNAL ALIAS`.

```questdb-sql
-- Map an Entra ID group identifier to the QuestDB group
ALTER GROUP analysts
WITH EXTERNAL ALIAS '87654321-1234-1234-1234-123456789abc';

-- Remove the mapping without dropping the QuestDB group
ALTER GROUP analysts
DROP EXTERNAL ALIAS '87654321-1234-1234-1234-123456789abc';
```

For external group mapping with OIDC, see
[Mapping groups and permissions](/docs/security/oidc/group-mapping/).
