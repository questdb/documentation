---
title: ALTER USER SET MEMORY LIMIT reference
sidebar_label: SET MEMORY LIMIT
description:
  "ALTER USER SET MEMORY LIMIT caps the native memory each of a user's queries
  may allocate. Applies to RBAC in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER USER ... SET MEMORY LIMIT` caps the native memory each of the user's
queries may allocate.

---

## Syntax

```questdb-sql
ALTER USER userName SET MEMORY LIMIT { size | UNLIMITED };
```

## Description

- `ALTER USER username SET MEMORY LIMIT size` caps the native memory each of the
  user's queries may allocate. `size` is a byte count or a size with a `K`, `M`,
  or `G` suffix, such as `512M` or `2G`.
- `ALTER USER username SET MEMORY LIMIT UNLIMITED` clears the user's own limit. A
  group limit or the workload limit (`cairo.query.memory.limit.bytes`) then
  applies. `SET MEMORY LIMIT 0` does the same.

The limit applies to the user's queries on both the primary and replicas.
Setting it requires the `SET MEMORY LIMIT` permission.

The built-in admin and external (SSO/OIDC) users cannot be given a limit; the
statement is rejected for both. An external user inherits a limit from its
groups instead.

A limit set here takes priority over the user's groups and over the
[`cairo.query.memory.limit.bytes`](/docs/configuration/cairo-engine/#cairoquerymemorylimitbytes)
workload limit; see [memory limits](/docs/security/rbac/#memory-limits) for how
limits resolve.

This is a per-query ceiling. To bound what a whole workload may hold at once
instead, use a
[resource group](/docs/query/sql/acl/alter-user-set-resource-group/).

## Examples

```questdb-sql
-- cap the user's queries at 512 MiB of native memory
ALTER USER john SET MEMORY LIMIT 512M;
-- remove the limit
ALTER USER john SET MEMORY LIMIT UNLIMITED;
```

Use [`SHOW USERS`](/docs/query/sql/show/#show-users) to inspect the user's own or
inherited group limit in the `memory_limit` column.

## See also

- [Memory limits](/docs/security/rbac/#memory-limits)
