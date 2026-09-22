---
title: ALTER GROUP UNSET RESOURCE GROUP reference
sidebar_label: UNSET RESOURCE GROUP
description:
  "ALTER GROUP UNSET RESOURCE GROUP removes an ACL group's resource group
  mapping. Applies to QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Resource groups isolate competing query workloads inside a single QuestDB
  instance.
</EnterpriseNote>

`ALTER GROUP ... UNSET RESOURCE GROUP` removes the ACL group's
[resource group](/docs/concepts/resource-groups/) mapping, along with its
priority.

---

## Syntax

```questdb-sql
ALTER GROUP groupName UNSET RESOURCE GROUP;
```

## Description

Members stop inheriting the mapping from this group. Each one falls back to the
highest-priority mapping among its remaining ACL groups, or to `DEFAULT`. A
member with a direct mapping of its own is unaffected, because a direct mapping
always won anyway.

The priority is removed with the mapping; there is no way to clear one while
keeping the other.

The statement requires the
[`RESOURCE GROUP ADMIN`](/docs/security/rbac/#permissions) permission, and affects
queries that start after the change rather than one already running.

Unmapping is also the prerequisite for dropping a resource group:
[`DROP RESOURCE GROUP`](/docs/query/sql/acl/drop-resource-group/) is refused
while any principal is still mapped to it.

## Examples

```questdb-sql
ALTER GROUP analysts UNSET RESOURCE GROUP;
```

`SHOW GROUPS` then reports `null` in both columns:

```questdb-sql
SELECT name, resource_group, resource_group_priority FROM (SHOW GROUPS);
```

| name     | resource_group | resource_group_priority |
| -------- | -------------- | ----------------------- |
| analysts | null           | null                    |

## See also

- [ALTER GROUP SET RESOURCE GROUP](/docs/query/sql/acl/alter-group-set-resource-group/)
- [DROP RESOURCE GROUP](/docs/query/sql/acl/drop-resource-group/)
- [Resource groups](/docs/concepts/resource-groups/)
