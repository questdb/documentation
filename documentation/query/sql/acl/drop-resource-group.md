---
title: DROP RESOURCE GROUP reference
sidebar_label: DROP RESOURCE GROUP
description:
  "DROP RESOURCE GROUP removes a query workload policy once no principal is
  mapped to it. Applies to QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Resource groups isolate competing query workloads inside a single QuestDB
  instance.
</EnterpriseNote>

`DROP RESOURCE GROUP` removes a query workload policy.

For what the limits actually guarantee, see
[resource groups](/docs/concepts/resource-groups/).

---

## Syntax

```questdb-sql
DROP RESOURCE GROUP [IF EXISTS] groupName;
```

## Description

The drop is refused while any principal is still mapped to the group. Unmap them
first with `UNSET RESOURCE GROUP` on each user, ACL group or service account.
The error names one of the blocking principals:

```
Resource Group is assigned to an ACL entity [entity=analyst]
```

Without `IF EXISTS`, dropping a group that does not exist raises an error.

The statement requires the
[`RESOURCE GROUP ADMIN`](/docs/security/rbac/#permissions) permission.

`DEFAULT` cannot be dropped. `DROP RESOURCE GROUP DEFAULT` fails with
`built-in Resource Group cannot be dropped`.

### What happens to queries still using it

Once no principal is mapped, the group can be dropped even while its queries are
still running. It disappears from
[`resource_groups()`](/docs/query/functions/meta/#resource_groups) immediately,
but running and queued queries, including suspended cursors, carry on under the
settings the group had, and their memory still counts towards the process
budget.

Recreating a group with the same name produces a new group with fresh counters.
Queries still running under the dropped group do not move to it. Map principals
to the new group to place their subsequent queries under it.

Dropping the last group other than `DEFAULT` disengages CPU scheduling for the
instance once those queries finish. See
[when scheduling engages](/docs/concepts/resource-groups/#when-scheduling-engages).

## Examples

```questdb-sql title="Unmap the principals, then drop"
ALTER USER analyst UNSET RESOURCE GROUP;
ALTER GROUP analysts UNSET RESOURCE GROUP;

DROP RESOURCE GROUP reporting;
```

```questdb-sql title="Drop only if present"
DROP RESOURCE GROUP IF EXISTS reporting;
```

To find every principal mapped to a group before dropping it:

```questdb-sql title="List the principals blocking a drop"
SELECT name FROM (SHOW USERS) WHERE resource_group = 'reporting';
SELECT name FROM (SHOW GROUPS) WHERE resource_group = 'reporting';
SELECT name FROM (SHOW SERVICE ACCOUNTS) WHERE resource_group = 'reporting';
```

## See also

- [CREATE RESOURCE GROUP](/docs/query/sql/acl/create-resource-group/)
- [ALTER RESOURCE GROUP](/docs/query/sql/acl/alter-resource-group/)
- [Configure and use resource groups](/docs/operations/resource-groups/)
