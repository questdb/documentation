---
title: ALTER SERVICE ACCOUNT SET RESOURCE GROUP reference
sidebar_label: SET RESOURCE GROUP
description:
  "ALTER SERVICE ACCOUNT SET RESOURCE GROUP places a service account's queries
  under a resource group. Applies to QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Resource groups isolate competing query workloads inside a single QuestDB
  instance.
</EnterpriseNote>

`ALTER SERVICE ACCOUNT ... SET RESOURCE GROUP` places the service account's
queries under a [resource group](/docs/concepts/resource-groups/), which governs
their admission, CPU share and memory budget.

---

## Syntax

```questdb-sql
ALTER SERVICE ACCOUNT serviceAccountName SET RESOURCE GROUP resourceGroupName;
```

## Description

A session that assumes the service account keeps the resource group of the
principal that logged in. The account's own mapping applies to sessions that
authenticate as it.

`MAPPING PRIORITY` is **not** accepted here, because a service account has
exactly one mapping and there is nothing to break a tie between. It belongs to
[`ALTER GROUP SET RESOURCE GROUP`](/docs/query/sql/acl/alter-group-set-resource-group/).

The statement requires the
[`SQL ENGINE ADMIN`](/docs/security/rbac/#permissions) permission, and affects
queries that start after the change rather than one already running.

This governs the queries the account runs. It does not throttle ingestion, which
resource groups do not manage.

## Examples

```questdb-sql
ALTER SERVICE ACCOUNT client_app SET RESOURCE GROUP automation;
```

Verify with
[`SHOW SERVICE ACCOUNTS`](/docs/query/sql/show/#show-service-accounts), which
reports the mapping in its `resource_group` column:

```questdb-sql
SELECT name, resource_group FROM (SHOW SERVICE ACCOUNTS);
```

| name       | resource_group |
| ---------- | -------------- |
| client_app | automation     |

## See also

- [ALTER SERVICE ACCOUNT UNSET RESOURCE GROUP](/docs/query/sql/acl/alter-service-account-unset-resource-group/)
- [CREATE RESOURCE GROUP](/docs/query/sql/acl/create-resource-group/)
- [Resource groups](/docs/concepts/resource-groups/)
