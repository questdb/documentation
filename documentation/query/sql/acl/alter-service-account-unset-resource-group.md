---
title: ALTER SERVICE ACCOUNT UNSET RESOURCE GROUP reference
sidebar_label: UNSET RESOURCE GROUP
description:
  "ALTER SERVICE ACCOUNT UNSET RESOURCE GROUP removes a service account's
  resource group mapping. Applies to QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Resource groups isolate competing query workloads inside a single QuestDB
  instance.
</EnterpriseNote>

`ALTER SERVICE ACCOUNT ... UNSET RESOURCE GROUP` removes the service account's
[resource group](/docs/concepts/resource-groups/) mapping.

---

## Syntax

```questdb-sql
ALTER SERVICE ACCOUNT serviceAccountName UNSET RESOURCE GROUP;
```

## Description

The service account returns to `DEFAULT`. Unlike a user, it has no ACL group
mapping to fall back to, because a service account cannot belong to a group.
Unsetting therefore leaves it governed only by `DEFAULT`'s policy.

The statement requires the
[`RESOURCE GROUP ADMIN`](/docs/security/rbac/#permissions) permission, and affects
queries that start after the change rather than one already running.

Unmapping is also the prerequisite for dropping a resource group:
[`DROP RESOURCE GROUP`](/docs/query/sql/acl/drop-resource-group/) is refused
while any principal is still mapped to it.

## Examples

```questdb-sql
ALTER SERVICE ACCOUNT client_app UNSET RESOURCE GROUP;
```

`SHOW SERVICE ACCOUNTS` then reports `null` in the `resource_group` column,
which for a service account means `DEFAULT`:

```questdb-sql
SELECT name, resource_group FROM (SHOW SERVICE ACCOUNTS);
```

| name       | resource_group |
| ---------- | -------------- |
| client_app | null           |

## See also

- [ALTER SERVICE ACCOUNT SET RESOURCE GROUP](/docs/query/sql/acl/alter-service-account-set-resource-group/)
- [DROP RESOURCE GROUP](/docs/query/sql/acl/drop-resource-group/)
- [Resource groups](/docs/concepts/resource-groups/)
