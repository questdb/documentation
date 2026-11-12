---
title: SET RESOURCE GROUP reference
sidebar_label: SET RESOURCE GROUP
description:
  "SET RESOURCE GROUP runs the rest of a session's queries in another resource
  group, and RESET RESOURCE GROUP returns to the mapped one. Applies to QuestDB
  Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Resource groups isolate competing query workloads inside a single QuestDB
  instance.
</EnterpriseNote>

`SET RESOURCE GROUP` runs the rest of a session's queries in a resource group
other than the one its principal is mapped to. One account can then send urgent
and routine work to groups with different policies: a monitoring account, for
example, can evaluate its alert rules in a heavily weighted group while its
dashboards stay in an ordinary one. `RESET RESOURCE GROUP` returns the session
to the mapped group.

HTTP has no SQL session, so a request chooses its group with the
`resource_group` parameter of
[`/execute`](/docs/connect/compatibility/rest-api/#execute) instead, under the
same rules.

`SET RESOURCE GROUP`, `RESET RESOURCE GROUP` and the `resource_group` parameter
are available from QuestDB Enterprise 4.2.0.

For how a query is assigned to a group otherwise, see
[who a resource group applies to](/docs/concepts/resource-groups/#who-a-resource-group-applies-to).

---

## Syntax

```questdb-sql title="Choose a group for the rest of the session"
SET [SESSION] RESOURCE GROUP groupName;
```

```questdb-sql title="Return to the mapped group"
RESET RESOURCE GROUP;
```

`SESSION` is optional and changes nothing.

## Description

The chosen group applies to every query the session starts afterwards, until
`RESET RESOURCE GROUP`, `RESET ALL` or `DISCARD ALL`, or until the session ends.
It replaces the principal's mapping: the group's admission, CPU and memory
policy apply exactly as they would to a principal mapped to it, and
[`current_resource_group()`](/docs/query/functions/meta/#current_resource_group)
returns its name. A query that started earlier, including a cursor that is
still being paged, keeps the group it started in.

Like a mapping, the choice governs only the statements that resource groups
manage, such as `SELECT`. See
[which statements are managed](/docs/concepts/resource-groups/#which-statements-are-managed).

`SET LOCAL RESOURCE GROUP` fails with
`SET LOCAL RESOURCE GROUP is not supported, use SET RESOURCE GROUP to switch the session`,
because the group applies to the whole session, not to one transaction. Any
other statement that starts with `SET RESOURCE` or `RESET RESOURCE` fails as
well, so a misspelled statement is reported instead of being accepted and
ignored like an unknown PostgreSQL setting. A setting written as
`SET resource_group = alerts` is not this statement: QuestDB accepts and ignores
it like any other unknown PostgreSQL setting, and the session's group does not
change.

### Which connections can switch

Only a PostgreSQL wire connection has a SQL session. On any other connection the
statement fails with
`Resource Group switching needs a session, over HTTP send the group in the resource_group parameter of /exec`.
Over HTTP, send the group with each request, as in the
[example below](#choose-the-group-for-one-http-request).

### Permissions

The group the principal is mapped to, or `DEFAULT` for an unmapped principal,
needs no permission. Any other group needs `USE RESOURCE GROUP` on it, granted
for one group or for all of them. That includes `DEFAULT` for a principal that
is mapped to another group.

```questdb-sql title="Allow one group, or every group"
GRANT USE ON RESOURCE GROUP alerts TO monitoring;
GRANT USE RESOURCE GROUP TO monitoring;
```

The built-in admin and principals holding `DATABASE ADMIN` can use every group,
and a grant to an ACL group covers its members. In a session that has
[assumed a service account](/docs/query/sql/acl/assume-service-account/), the
user who logged in decides: both the mapped group and the permission are that
user's, not the service account's.

Without the permission, the statement fails with
`Access denied for <principal> [USE RESOURCE GROUP on <group>]`. A group that
does not exist fails with `Resource Group does not exist [name=<group>]`.

The permission is checked again at the start of every query that resource
groups manage, not only when the group is chosen. A revoke therefore applies to
the session's next such query, which fails with the same access-denied error
until the session chooses a group it may use or returns to its own.

The session remembers the group by name. If the group is dropped or renamed, the
next managed query fails with
`Resource Group chosen by SET RESOURCE GROUP or the resource_group parameter does not exist [name=<group>]`
until the session runs `SET RESOURCE GROUP`, with the new name after a rename,
or `RESET RESOURCE GROUP`. A group created later under the old name would be
used instead, subject to the same permission check.

With access control disabled nothing is checked. Mapping statements need access
control, so on such an instance choosing a group per session or request is the
only way to run queries outside `DEFAULT`.

### Connection pools

A connection pooler resets a session with `DISCARD ALL` or `RESET ALL` before it
hands the connection to its next client. Both statements clear the session's
resource group, so the next client starts in the mapped group instead of
inheriting the previous client's choice.

## Examples

### Send alerts and dashboards to different groups

```questdb-sql title="Create the groups and let the account use the urgent one"
CREATE RESOURCE GROUP alerts WITH (cpu_weight = 400);
CREATE RESOURCE GROUP dashboards WITH (cpu_weight = 100);

ALTER USER monitoring SET RESOURCE GROUP dashboards;
GRANT USE ON RESOURCE GROUP alerts TO monitoring;
```

On the connection that evaluates alert rules:

```questdb-sql title="Run the rest of this session in the alerts group"
SET RESOURCE GROUP alerts;

SELECT current_resource_group();
```

| current_resource_group |
| ---------------------- |
| alerts                 |

Connections that do not switch keep running in `dashboards`, the group
`monitoring` is mapped to.

### Choose the group for one HTTP request

```bash title="Run one query in the alerts group"
curl -G --data-urlencode "query=SELECT count() FROM fx_trades;" \
    --data-urlencode "resource_group=alerts" \
    -u monitoring \
    http://localhost:9000/api/v1/sql/execute
```

curl prompts for the password of `monitoring`. The parameter applies to that
request only, and needs the same permission as `SET RESOURCE GROUP`.

### Return to the mapped group

```questdb-sql
RESET RESOURCE GROUP;
```

## See also

- [Choosing a group per session or request](/docs/concepts/resource-groups/#choosing-a-group-per-session-or-request)
- [GRANT USE ON RESOURCE GROUP](/docs/query/sql/acl/grant/#grant-use-of-resource-groups)
- [REVOKE USE ON RESOURCE GROUP](/docs/query/sql/acl/revoke/#revoke-use-of-resource-groups)
- [`current_resource_group()`](/docs/query/functions/meta/#current_resource_group)
- [Configure and use resource groups](/docs/operations/resource-groups/)
