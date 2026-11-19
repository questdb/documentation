---
title: ALTER RESOURCE GROUP reference
sidebar_label: ALTER RESOURCE GROUP
description:
  "ALTER RESOURCE GROUP changes a group's admission, CPU weight, CPU limit,
  scheduling and memory policy, clears parameters, or renames the group.
  Applies to QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Resource groups isolate competing query workloads inside a single QuestDB
  instance.
</EnterpriseNote>

`ALTER RESOURCE GROUP` changes an existing query workload policy.

For what the limits actually guarantee, see
[resource groups](/docs/concepts/resource-groups/).

---

## Syntax

```questdb-sql title="Set parameters"
ALTER RESOURCE GROUP groupName
    SET ( parameter = value [, parameter = value ...] );
```

```questdb-sql title="Clear parameters back to the instance defaults"
ALTER RESOURCE GROUP groupName RESET ( parameter [, parameter ...] );
```

```questdb-sql title="Rename"
ALTER RESOURCE GROUP groupName RENAME TO newName;
```

The parameters are the same ones
[`CREATE RESOURCE GROUP`](/docs/query/sql/acl/create-resource-group/#parameters)
accepts: `cpu_limit`, `cpu_weight`, `max_active_queries`, `max_queued_queries`,
`memory_limit`, `queue_timeout` and `scheduling_policy`.

## Description

`SET` changes only the parameters named; anything else the group already sets is
left alone. `RESET` clears a parameter so it falls back to the instance default,
which is not always "unlimited": `RESET (cpu_weight)` returns the group to a
weight of 100, `RESET (queue_timeout)` returns it to 30 seconds, and
`RESET (scheduling_policy)` returns it to `fifo`. `RESET (cpu_limit)` removes
the CPU limit, as `SET (cpu_limit = '0%')` does.

The statement requires the
[`RESOURCE GROUP ADMIN`](/docs/security/rbac/#permissions) permission.

`DEFAULT` can be altered but not renamed. `ALTER RESOURCE GROUP DEFAULT RENAME TO`
fails with `built-in Resource Group cannot be renamed`.

Renaming preserves the policy, every principal mapping and every
`USE RESOURCE GROUP` grant on the group, because they attach to the group's
identity rather than its name. A session that chose the group with
[`SET RESOURCE GROUP`](/docs/query/sql/acl/set-resource-group/), or an HTTP
client that sends its name in the `resource_group` parameter, refers to it by
name instead: its next managed query fails until it uses the new name or, for a
session, runs `RESET RESOURCE GROUP`.

### Effect on queries already running

A policy change applies online. It does not cancel anything running at the
moment `ALTER` executes:

| Change                 | Effect on existing work                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `cpu_limit`            | Running and waiting queries are held to the new limit from their next CPU slice. A query that was running before CPU scheduling engaged is reached when it next suspends |
| `cpu_weight`           | Subsequent scheduling uses the new policy                                                         |
| `max_active_queries`   | Existing slots are retained; subsequent admission, including a resumed cursor, uses the new limit |
| `max_queued_queries`, `queue_timeout` | New admission requests use the new settings; an already queued request keeps its deadline |
| `memory_limit`         | Subsequent allocations check the new budget; existing memory is released normally                 |
| `scheduling_policy`    | Work waiting for CPU is re-queued in arrival order and then served under the new policy; subsequent admission uses the new policy |

Lowering `memory_limit` below current usage does not fail running queries
retroactively, but it can make their subsequent allocations fail. The
single-query ceiling is captured when a query starts, so changing the group
budget does not replace a principal's own limit.

A query that starts under a CPU limit puts its parallel work on reduce queues
reserved for limited groups, so waiting for its group's budget does not hold up
the queries of groups without a limit. A parallel query that was already running
when the limit appeared stays on the shared queue it started on until it
finishes, and can hold up other queries there while it waits.

## Examples

```questdb-sql title="Raise the weight and cap concurrency"
ALTER RESOURCE GROUP analytics SET (cpu_weight = 300, max_active_queries = 8);
```

```questdb-sql title="Cap the group at half the node and share it fairly between its users"
ALTER RESOURCE GROUP analytics SET (
    cpu_limit = '50%',
    scheduling_policy = 'fair'
);
```

```questdb-sql title="Remove the CPU limit and return to arrival order"
ALTER RESOURCE GROUP analytics RESET (cpu_limit, scheduling_policy);
```

```questdb-sql title="Remove the group's memory ceiling"
ALTER RESOURCE GROUP reporting SET (memory_limit = UNLIMITED);
```

`RESET (memory_limit)` and `SET (memory_limit = 0)` do the same thing.

```questdb-sql title="Clear parameters back to the instance defaults"
ALTER RESOURCE GROUP analytics RESET (memory_limit, max_active_queries);
```

```questdb-sql title="Rename"
ALTER RESOURCE GROUP analytics RENAME TO reporting;
```

`DEFAULT` takes limits like any other group, which is how you bound everything
that is not explicitly mapped, including the built-in admin, which cannot be
mapped:

```questdb-sql title="Cap the default workload"
ALTER RESOURCE GROUP DEFAULT SET (max_active_queries = 16);
```

## See also

- [CREATE RESOURCE GROUP](/docs/query/sql/acl/create-resource-group/)
- [DROP RESOURCE GROUP](/docs/query/sql/acl/drop-resource-group/)
- [Configure and use resource groups](/docs/operations/resource-groups/)
