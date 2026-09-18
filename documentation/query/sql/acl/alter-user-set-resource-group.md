---
title: ALTER USER SET RESOURCE GROUP reference
sidebar_label: SET RESOURCE GROUP
description:
  "ALTER USER SET RESOURCE GROUP places a user's queries under a resource group,
  overriding any ACL group mapping. Applies to QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Resource groups isolate competing query workloads inside a single QuestDB
  instance.
</EnterpriseNote>

`ALTER USER ... SET RESOURCE GROUP` places the user's queries under a
[resource group](/docs/concepts/resource-groups/), which governs their
admission, CPU share and memory budget.

---

## Syntax

```questdb-sql
ALTER USER userName SET RESOURCE GROUP resourceGroupName;
```

## Description

A direct mapping on the user beats any mapping it would inherit from an ACL
group, whatever that group's priority. That is how you make one person an
exception without touching the groups.

`MAPPING PRIORITY` is **not** accepted here, because a user has exactly one
direct mapping and there is nothing to break a tie between. It belongs to
[`ALTER GROUP SET RESOURCE GROUP`](/docs/query/sql/acl/alter-group-set-resource-group/).

The statement requires the
[`SQL ENGINE ADMIN`](/docs/security/rbac/#permissions) permission, and affects
queries that start after the change rather than one already running.

## Examples

```questdb-sql
ALTER USER john SET RESOURCE GROUP reporting;
```

Verify with [`SHOW USERS`](/docs/query/sql/show/#show-users), which reports the
direct mapping in its `resource_group` column:

```questdb-sql
SELECT name, resource_group FROM (SHOW USERS);
```

| name  | resource_group |
| ----- | -------------- |
| admin | null           |
| john  | reporting      |

To see the group a session actually resolved to, which may come from an ACL
group rather than a direct mapping, use
[`current_resource_group()`](/docs/query/functions/meta/#current_resource_group).

## See also

- [ALTER USER UNSET RESOURCE GROUP](/docs/query/sql/acl/alter-user-unset-resource-group/)
- [CREATE RESOURCE GROUP](/docs/query/sql/acl/create-resource-group/)
- [Resource groups](/docs/concepts/resource-groups/)
