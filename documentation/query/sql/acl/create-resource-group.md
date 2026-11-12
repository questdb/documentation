---
title: CREATE RESOURCE GROUP reference
sidebar_label: CREATE RESOURCE GROUP
description:
  "CREATE RESOURCE GROUP creates a query workload policy setting admission, CPU
  weight, CPU limit, scheduling policy and memory limits. Applies to QuestDB
  Enterprise."
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

| Parameter            | Accepted values                                                                         | Unset behaviour  |
| -------------------- | --------------------------------------------------------------------------------------- | ---------------- |
| `cpu_limit`          | a quoted whole-number percentage of the node's CPUs, `'1%'` to `'100%'`, or `'0%'` for none | no limit         |
| `cpu_weight`         | integer, 1 to 10000                                                                     | 100              |
| `max_active_queries` | integer, 1 or more                                                                      | unlimited        |
| `max_queued_queries` | integer, 0 or more                                                                      | unlimited        |
| `memory_limit`       | a byte size such as `'8G'`, or `0` or `UNLIMITED` for no group ceiling                   | no group ceiling |
| `queue_timeout`      | whole milliseconds, or a duration such as `'15s'` or `'2m'`                             | 30 seconds       |
| `scheduling_policy`  | `'fifo'` or `'fair'`, in any case                                                       | `fifo`           |

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
[`RESOURCE GROUP ADMIN`](/docs/security/rbac/#permissions) permission.

Creating a second resource group engages CPU scheduling for the whole instance,
and so does a CPU limit or the `fair` policy on any group. Until then there is
no CPU slicing at all, so weights have no effect while `DEFAULT` is the only
group. See
[when scheduling engages](/docs/concepts/resource-groups/#when-scheduling-engages).

`cpu_limit` is a ceiling: the group gets at most that share of the node's CPUs
on average, even while the rest of the node is idle. The percentage
is of the CPUs available to the QuestDB process, and
[`resource_groups()`](/docs/query/functions/meta/#resource_groups) shows what it
comes to on this node in `cpu_limit_cores`. A value without the `%` sign fails
with `CPU limit must be a percentage of the node's CPUs, for example '50%'`, and
a percentage above 100 or with a fraction fails with
`invalid Resource Group policy value`. How the limit is enforced, and when a
group can briefly exceed it, is described in
[A CPU limit is a ceiling](/docs/concepts/resource-groups/#a-cpu-limit-is-a-ceiling-not-a-share).

`scheduling_policy` decides how the group divides its CPU between its own users
and queries: `fifo` serves them in arrival order, and `fair` divides the group
by user first, then by query. An unknown name fails with
`unknown scheduling policy, expected 'fifo' or 'fair'`. See
[the scheduling policy](/docs/concepts/resource-groups/#the-scheduling-policy-divides-a-group-between-its-users).

`cpu_limit` and `scheduling_policy` are available from QuestDB Enterprise 4.2.0.

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

```questdb-sql title="A tenant capped at a quarter of the node, shared fairly by its users"
CREATE RESOURCE GROUP tenant_a WITH (
    cpu_limit = '25%',
    scheduling_policy = 'fair'
);
```

Verify with [`resource_groups()`](/docs/query/functions/meta/#resource_groups):

```questdb-sql
SELECT name, cpu_weight, cpu_limit_pct, scheduling_policy,
       max_active_queries, memory_limit_bytes
FROM resource_groups()
ORDER BY name;
```

| name      | cpu_weight | cpu_limit_pct | scheduling_policy | max_active_queries | memory_limit_bytes |
| --------- | ---------- | ------------- | ----------------- | ------------------ | ------------------ |
| DEFAULT   | 100        | 0             | fifo              | null               | 0                  |
| analytics | 100        | 0             | fifo              | null               | 0                  |
| exports   | 10         | 0             | fifo              | 1                  | 0                  |
| reporting | 50         | 0             | fifo              | 4                  | 2147483648         |
| tenant_a  | 100        | 25            | fair              | null               | 0                  |

`max_active_queries` is `null` when the group sets no admission limit,
`memory_limit_bytes` is `0` when it sets no memory ceiling, and `cpu_limit_pct`
is `0` when it sets no CPU limit. `cpu_weight` and `scheduling_policy` always
report an effective value, so a group that sets neither shows `100` and `fifo`.

## See also

- [ALTER RESOURCE GROUP](/docs/query/sql/acl/alter-resource-group/)
- [DROP RESOURCE GROUP](/docs/query/sql/acl/drop-resource-group/)
- [Configure and use resource groups](/docs/operations/resource-groups/)
