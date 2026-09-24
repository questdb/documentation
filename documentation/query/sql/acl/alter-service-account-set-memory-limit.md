---
title: ALTER SERVICE ACCOUNT SET MEMORY LIMIT reference
sidebar_label: SET MEMORY LIMIT
description:
  "ALTER SERVICE ACCOUNT SET MEMORY LIMIT caps the native memory each of a
  service account's queries may allocate. Applies to QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER SERVICE ACCOUNT ... SET MEMORY LIMIT` caps the native memory each of the
service account's queries may allocate.

---

## Syntax

```questdb-sql
ALTER SERVICE ACCOUNT serviceAccountName SET MEMORY LIMIT { size | UNLIMITED };
```

## Description

- `ALTER SERVICE ACCOUNT serviceAccountName SET MEMORY LIMIT size` caps the
  native memory each of the service account's queries may allocate. `size` is a
  byte count or a size with a `K`, `M`, or `G` suffix, such as `512M` or `2G`.
- `ALTER SERVICE ACCOUNT serviceAccountName SET MEMORY LIMIT UNLIMITED` clears
  the service account's limit. The workload limit
  (`cairo.query.memory.limit.bytes`) then applies. `SET MEMORY LIMIT 0` does the
  same.

A user who assumes the service account runs under its memory limit. No group
limit can apply, because a service account cannot belong to an ACL group, so
either it has a limit of its own or only the workload limit applies.

Setting it requires the `SET MEMORY LIMIT` permission. See
[memory limits](/docs/security/rbac/#memory-limits) for how the limit interacts
with the
[`cairo.query.memory.limit.bytes`](/docs/configuration/cairo-engine/#cairoquerymemorylimitbytes)
workload limit.

This is a per-query ceiling. To bound what a whole workload may hold at once
instead, use a
[resource group](/docs/query/sql/acl/alter-service-account-set-resource-group/).

## Examples

```questdb-sql
-- cap the service account's queries at 1 GiB of native memory
ALTER SERVICE ACCOUNT client_app SET MEMORY LIMIT 1G;
-- remove the limit
ALTER SERVICE ACCOUNT client_app SET MEMORY LIMIT UNLIMITED;
```

The configured value can be verified with
[`SHOW SERVICE ACCOUNTS`](/docs/query/sql/show/#show-service-accounts), which
reports it in the `memory_limit` column.

## See also

- [Memory limits](/docs/security/rbac/#memory-limits)
