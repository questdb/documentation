---
title: CREATE RESOURCE GROUP reference
sidebar_label: CREATE RESOURCE GROUP
description:
  "CREATE RESOURCE GROUP creates a query workload policy setting admission, CPU
  weight and memory limits. Applies to QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Resource groups isolate competing query workloads inside a single QuestDB
  instance.
</EnterpriseNote>

`CREATE RESOURCE GROUP` creates a query workload policy.

For what the limits actually guarantee, see
[resource groups](/docs/concepts/resource-groups/).

---

## Syntax

```questdb-sql
CREATE RESOURCE GROUP [IF NOT EXISTS] groupName
    [WITH ( parameter = value [, parameter = value ...] )];
```

## Parameters

Every parameter is optional. An unset parameter falls back to the instance
default, which is not always "unlimited":

| Parameter            | Accepted values                                                       | Unset behaviour  |
| -------------------- | --------------------------------------------------------------------- | ---------------- |
| `cpu_weight`         | integer, 1 to 10000                                                   | 100              |
| `max_active_queries` | integer, 1 or more                                                    | unlimited        |
| `max_queued_queries` | integer, 0 or more                                                    | unlimited        |
| `queue_timeout`      | whole milliseconds, or a duration such as `'15s'` or `'2m'`           | 30 seconds       |
| `memory_limit`       | a byte size such as `'8G'`, or `0` or `UNLIMITED` for no group ceiling | no group ceiling |

## Description

`CREATE RESOURCE GROUP` adds a policy with no principals mapped to it. Creating
the group alone changes nothing: map a user, ACL group or service account to it
with [`ALTER USER`](/docs/query/sql/acl/alter-user-set-resource-group/),
[`ALTER GROUP`](/docs/query/sql/acl/alter-group-set-resource-group/) or
[`ALTER SERVICE ACCOUNT`](/docs/query/sql/acl/alter-service-account-set-resource-group/) before it
governs anything.

The name must be unique across resource groups. If it is already taken the
statement fails, unless `IF NOT EXISTS` is included.

The statement requires the
[`SQL ENGINE ADMIN`](/docs/security/rbac/#permissions) permission.

Creating a second resource group engages CPU scheduling for the whole instance.
While `DEFAULT` is the only group there is no CPU slicing at all, so weights
have no effect until a second group exists. See
[when scheduling engages](/docs/concepts/resource-groups/#when-scheduling-engages).

A group ceiling only ever lowers what a query may use. `memory_limit` is capped
by `resource.groups.process.memory.limit.bytes`, and it never raises a limit set
on the principal or by `cairo.query.memory.limit.bytes`.

## Examples

```questdb-sql title="A policy with no limits of its own"
CREATE RESOURCE GROUP analytics;
```

```questdb-sql title="Half the default CPU share, four concurrent queries, 2 GiB"
CREATE RESOURCE GROUP reporting WITH (
    cpu_weight = 50,
    max_active_queries = 4,
    memory_limit = '2G'
);
```

```questdb-sql title="A background workload that yields to everything else"
CREATE RESOURCE GROUP IF NOT EXISTS exports WITH (
    cpu_weight = 10,
    max_active_queries = 1
);
```

Verify with [`resource_groups()`](/docs/query/functions/meta/#resource_groups):

```questdb-sql
SELECT name, cpu_weight, max_active_queries, memory_limit_bytes
FROM resource_groups()
ORDER BY name;
```

| name      | cpu_weight | max_active_queries | memory_limit_bytes |
| --------- | ---------- | ------------------ | ------------------ |
| DEFAULT   | 100        | null               | 0                  |
| analytics | 100        | null               | 0                  |
| exports   | 10         | 1                  | 0                  |
| reporting | 50         | 4                  | 2147483648         |

`max_active_queries` is `null` when the group sets no admission limit, and
`memory_limit_bytes` is `0` when it sets no memory ceiling. `cpu_weight` always
reports an effective value, so a group that sets none shows `100`.

## See also

- [ALTER RESOURCE GROUP](/docs/query/sql/acl/alter-resource-group/)
- [DROP RESOURCE GROUP](/docs/query/sql/acl/drop-resource-group/)
- [Configure and use resource groups](/docs/operations/resource-groups/)
