---
title: ALTER GROUP SET MEMORY LIMIT reference
sidebar_label: SET MEMORY LIMIT
description:
  "ALTER GROUP SET MEMORY LIMIT caps the native memory each query run by a
  member of the group may allocate. Applies to RBAC in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER GROUP ... SET MEMORY LIMIT` caps the native memory each query run by a
member of the group may allocate.

---

## Syntax

```questdb-sql
ALTER GROUP groupName SET MEMORY LIMIT { size | UNLIMITED };
```

## Description

- `ALTER GROUP groupName SET MEMORY LIMIT size` caps the native memory that each
  query run by a member of the group may allocate. `size` is a byte count or a
  size with a `K`, `M`, or `G` suffix, such as `512M` or `2G`.
- `ALTER GROUP groupName SET MEMORY LIMIT UNLIMITED` clears the group's limit.
  Members without a limit of their own then fall back to the most restrictive
  limit among their other groups, or to the workload limit
  (`cairo.query.memory.limit.bytes`). `SET MEMORY LIMIT 0` does the same.

A group limit applies to a member only when that member has no limit of its own.
When several of a user's groups set a limit, the most restrictive one applies.

Setting a group limit requires the `SET MEMORY LIMIT` permission. See
[memory limits](/docs/security/rbac/#memory-limits) for how a group limit
interacts with the
[`cairo.query.memory.limit.bytes`](/docs/configuration/cairo-engine/#cairoquerymemorylimitbytes)
workload limit.

This is a per-query ceiling for the group's members. To bound what a whole
workload may hold at once instead, use a
[resource group](/docs/query/sql/acl/alter-group-set-resource-group/).

## Examples

```questdb-sql
-- cap queries of the group's members at 2 GiB of native memory
ALTER GROUP analysts SET MEMORY LIMIT 2G;
-- remove the limit
ALTER GROUP analysts SET MEMORY LIMIT UNLIMITED;
```

The configured value can be verified with
[`SHOW GROUPS`](/docs/query/sql/show/#show-groups), which reports it in the
`memory_limit` column.

## See also

- [Memory limits](/docs/security/rbac/#memory-limits)
