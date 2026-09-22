---
title: ALTER GROUP SET RESOURCE GROUP reference
sidebar_label: SET RESOURCE GROUP
description:
  "ALTER GROUP SET RESOURCE GROUP places every member's queries under a resource
  group, with MAPPING PRIORITY breaking ties. Applies to QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Resource groups isolate competing query workloads inside a single QuestDB
  instance.
</EnterpriseNote>

`ALTER GROUP ... SET RESOURCE GROUP` places the queries of every user in the
group under a [resource group](/docs/concepts/resource-groups/), which governs
their admission, CPU share and memory budget.

---

## Syntax

```questdb-sql
ALTER GROUP groupName SET RESOURCE GROUP resourceGroupName
    [MAPPING PRIORITY priority];
```

## Description

Mapping an ACL group is how you cover a team without naming each member. It
requires the [`RESOURCE GROUP ADMIN`](/docs/security/rbac/#permissions) permission,
and affects queries that start after the change rather than one already running.

This is workload mapping: it decides how much of the instance the group's
queries may consume. It is unrelated to
[`WITH EXTERNAL ALIAS`](/docs/query/sql/acl/alter-group-with-external-alias/),
which decides which QuestDB group an external identity lands in.

### MAPPING PRIORITY

A user can belong to several ACL groups, so each ACL group mapping carries a
priority and the highest one wins. `MAPPING PRIORITY` is a non-negative integer
that defaults to 0.

If two carry the same priority, the tie falls to whichever resource group was
created first. That is rarely intended, so give them distinct priorities when
the order matters.

The clause is accepted only here. It is rejected on
[`ALTER USER`](/docs/query/sql/acl/alter-user-set-resource-group/) and
[`ALTER SERVICE ACCOUNT`](/docs/query/sql/acl/alter-service-account-set-resource-group/),
which are one-to-one and have nothing to break a tie between.

A direct mapping on a user beats every ACL group mapping regardless of priority.

## Examples

```questdb-sql
-- every member's queries run under the adhoc workload policy
ALTER GROUP analysts SET RESOURCE GROUP adhoc MAPPING PRIORITY 10;
-- oncall wins for anyone who is in both groups
ALTER GROUP oncall SET RESOURCE GROUP dashboards MAPPING PRIORITY 20;
```

Verify with [`SHOW GROUPS`](/docs/query/sql/show/#show-groups), which reports the
mapping in its `resource_group` and `resource_group_priority` columns:

```questdb-sql
SELECT name, resource_group, resource_group_priority FROM (SHOW GROUPS);
```

| name     | resource_group | resource_group_priority |
| -------- | -------------- | ----------------------- |
| analysts | adhoc          | 10                      |
| oncall   | dashboards     | 20                      |

Both columns are `null` for a group that is not mapped.

## See also

- [ALTER GROUP UNSET RESOURCE GROUP](/docs/query/sql/acl/alter-group-unset-resource-group/)
- [CREATE RESOURCE GROUP](/docs/query/sql/acl/create-resource-group/)
- [Resource groups](/docs/concepts/resource-groups/)
