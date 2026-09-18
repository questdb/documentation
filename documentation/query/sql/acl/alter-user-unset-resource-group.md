---
title: ALTER USER UNSET RESOURCE GROUP reference
sidebar_label: UNSET RESOURCE GROUP
description:
  "ALTER USER UNSET RESOURCE GROUP removes a user's direct resource group
  mapping. Applies to QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Resource groups isolate competing query workloads inside a single QuestDB
  instance.
</EnterpriseNote>

`ALTER USER ... UNSET RESOURCE GROUP` removes the user's direct
[resource group](/docs/concepts/resource-groups/) mapping.

---

## Syntax

```questdb-sql
ALTER USER userName UNSET RESOURCE GROUP;
```

## Description

Removing the direct mapping does not leave the user ungoverned. Its queries fall
back to the highest-priority mapping among its ACL groups, or to `DEFAULT` when
it belongs to none that are mapped.

The statement requires the
[`SQL ENGINE ADMIN`](/docs/security/rbac/#permissions) permission, and affects
queries that start after the change rather than one already running.

Unmapping is also the prerequisite for dropping a resource group:
[`DROP RESOURCE GROUP`](/docs/query/sql/acl/drop-resource-group/) is refused
while any principal is still mapped to it.

## Examples

```questdb-sql
ALTER USER john UNSET RESOURCE GROUP;
```

`SHOW USERS` then reports `null` in the `resource_group` column:

```questdb-sql
SELECT name, resource_group FROM (SHOW USERS);
```

| name  | resource_group |
| ----- | -------------- |
| admin | null           |
| john  | null           |

`null` means no direct mapping, not that the user is ungoverned. Use
[`current_resource_group()`](/docs/query/functions/meta/#current_resource_group)
from the user's own session to see the group its queries actually resolve to.

## See also

- [ALTER USER SET RESOURCE GROUP](/docs/query/sql/acl/alter-user-set-resource-group/)
- [DROP RESOURCE GROUP](/docs/query/sql/acl/drop-resource-group/)
- [Resource groups](/docs/concepts/resource-groups/)
