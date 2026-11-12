---
title: SET RESOURCE GROUP reference
sidebar_label: SET / RESET RESOURCE GROUP
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

`SET RESOURCE GROUP` runs the rest of a PostgreSQL session's queries in a
resource group other than the one its principal is mapped to. One account can
then send urgent and routine work to groups with different policies: a
monitoring account, for example, can evaluate its alert rules in a heavily
weighted group while its dashboards stay in an ordinary one.
`RESET RESOURCE GROUP` returns the session to the mapped group.

HTTP has no SQL session, so a request chooses its group with the
`resource_group` parameter of
[`/execute`](/docs/connect/compatibility/rest-api/#execute) instead, under the
same permission rules.

The choice lasts for one session or one request. To change the group that a
principal's queries run in by default, map the principal with
[`ALTER USER`](/docs/query/sql/acl/alter-user-set-resource-group/),
[`ALTER GROUP`](/docs/query/sql/acl/alter-group-set-resource-group/) or
[`ALTER SERVICE ACCOUNT`](/docs/query/sql/acl/alter-service-account-set-resource-group/)
`... SET RESOURCE GROUP`.

`SET RESOURCE GROUP`, `RESET RESOURCE GROUP` and the `resource_group` parameter
are available from QuestDB Enterprise 4.2.0.

---

## Syntax

```questdb-sql title="Choose a group for the rest of the session"
SET [SESSION] RESOURCE GROUP groupName;
```

```questdb-sql title="Return to the mapped group"
RESET RESOURCE GROUP;
```

`SESSION` is optional and changes nothing. `groupName` is case-sensitive, except
`DEFAULT`, which matches in any case, and it may be quoted.

:::caution

`SET resource_group = alerts`, written like a PostgreSQL setting, is not this
statement. QuestDB accepts and ignores it like any unknown PostgreSQL setting,
so the session's group does not change. Write `SET RESOURCE GROUP alerts`.

:::

## Description

The chosen group applies to every managed query the session starts afterwards,
until `RESET RESOURCE GROUP`, `RESET ALL` or `DISCARD ALL`, or until the session
ends. Managed queries are the statements that resource groups govern, such as
`SELECT`; see
[which statements are managed](/docs/concepts/resource-groups/#which-statements-are-managed).
For them the chosen group replaces the principal's mapping: its admission, CPU
and memory policy apply exactly as they would to a principal mapped to it, and
[`current_resource_group()`](/docs/query/functions/meta/#current_resource_group)
returns its name. A query that started earlier, including a cursor that is
still being paged, keeps the group it started in.

The choice covers only the session's own queries. A `COPY ... TO` export started
from the session runs as a background job in the principal's mapped group.

Two related statements fail instead of doing something unexpected:

- `SET LOCAL RESOURCE GROUP` fails with
  `SET LOCAL RESOURCE GROUP is not supported, use SET RESOURCE GROUP to switch the session`,
  because the group applies to the whole session, not to one transaction.
- Any other statement that starts with `SET RESOURCE` or `RESET RESOURCE` fails,
  so a misspelling is reported instead of being ignored.

### Which connections can switch

Only a PostgreSQL wire connection has a SQL session. A PostgreSQL connection
parameter cannot set the group, so send `SET RESOURCE GROUP` after connecting.
On any other connection, `SET RESOURCE GROUP` and `RESET RESOURCE GROUP` fail
with
`Resource Group switching needs a session, over HTTP send the group in the resource_group parameter of /exec`,
where `/exec` is the older name of `/execute`:

- Over HTTP, send the group with each request to `/execute`, as in the
  [example below](#choose-the-group-for-one-http-request). The export endpoint
  `/exp` does not take the parameter, so its exports run in the mapped group.
- Clients that query over QWP have neither a session nor a parameter, so their
  queries always run in the principal's mapped group.

### Permissions

Choosing the group the principal is mapped to, or `DEFAULT` for an unmapped
principal, needs no permission. Any other group, including `DEFAULT` for a
principal that is mapped elsewhere, needs `USE RESOURCE GROUP` on it, granted
for one group or for all of them with
[`GRANT`](/docs/query/sql/acl/grant/#grant-use-of-resource-groups):

```questdb-sql title="Allow one group, or every group"
GRANT USE ON RESOURCE GROUP alerts TO monitoring;
GRANT USE RESOURCE GROUP TO monitoring;
```

Granting `USE ON RESOURCE GROUP` takes the
[`RESOURCE GROUP ADMIN`](/docs/security/rbac/#permissions) permission. The
built-in admin and principals holding `DATABASE ADMIN` can use every group, and
a grant to an ACL group covers its members. In a session that has
[assumed a service account](/docs/query/sql/acl/assume-service-account/), the
user who logged in decides: both the mapped group and the permission are that
user's, not the service account's.

`SET RESOURCE GROUP` checks the group and the permission when it runs. A group
that does not exist fails with `Resource Group does not exist [name=<group>]`,
and a group the principal may not use fails with
`Access denied for <principal> [USE RESOURCE GROUP on <group>]`.

Both are checked again at the start of every managed query, which is the only
check the HTTP parameter gets:

- A revoke applies to the session's next managed query, which fails with the
  access-denied error until the session chooses a group it may use or returns
  to its own. Revoking one group from a principal that holds the database-level
  `USE RESOURCE GROUP` changes nothing, see
  [REVOKE](/docs/query/sql/acl/revoke/#revoke-use-of-resource-groups).
- The session remembers the group by name. If the group is dropped or renamed,
  the next managed query fails with
  `Resource Group chosen by SET RESOURCE GROUP or the resource_group parameter does not exist [name=<group>]`
  until the session runs `SET RESOURCE GROUP`, with the new name after a
  rename, or `RESET RESOURCE GROUP`. A group created later under the old name
  would be used instead, subject to the same permission check.
- An HTTP request that names a group that does not exist fails with that same
  message when its query starts. A request whose statement is not managed, such
  as `INSERT ... VALUES`, does not check the parameter at all.

With access control disabled nothing is checked. Mapping statements need access
control, so on such an instance choosing a group per session or request is the
only way to run queries outside `DEFAULT`.

### Connection pools

`DISCARD ALL` and `RESET ALL` clear the session's group. A pooler that resets
each connection with one of them before handing it to the next client, such as
PgBouncer in session pooling mode, starts every client in its mapped group.
Many pools do not reset sessions: PgBouncer in transaction pooling mode, and
application-side pools such as HikariCP, hand the connection on with the group
still chosen, so the next client's queries run in that group too. Give the work
that switches groups a pool or connection of its own, and switch once after it
connects.

## Examples

### Send alerts and dashboards to different groups

```questdb-sql title="Create the groups and let the account use the urgent one"
CREATE RESOURCE GROUP alerts WITH (cpu_weight = 400);
CREATE RESOURCE GROUP dashboards WITH (cpu_weight = 100);

ALTER USER monitoring SET RESOURCE GROUP dashboards;
GRANT USE ON RESOURCE GROUP alerts TO monitoring;
```

On the connection that evaluates alert rules, which has a pool of its own:

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

### Take the group away again

```questdb-sql title="Return the session to its mapped group"
RESET RESOURCE GROUP;

SELECT current_resource_group();
```

| current_resource_group |
| ---------------------- |
| dashboards             |

```questdb-sql title="Stop the account from choosing the alerts group"
REVOKE USE ON RESOURCE GROUP alerts FROM monitoring;
```

A session that is still in `alerts` when the revoke runs fails its next managed
query until it runs `RESET RESOURCE GROUP`.

## See also

- [Choosing a group per session or request](/docs/concepts/resource-groups/#choosing-a-group-per-session-or-request)
- [GRANT USE ON RESOURCE GROUP](/docs/query/sql/acl/grant/#grant-use-of-resource-groups)
- [REVOKE USE ON RESOURCE GROUP](/docs/query/sql/acl/revoke/#revoke-use-of-resource-groups)
- [ALTER USER SET RESOURCE GROUP](/docs/query/sql/acl/alter-user-set-resource-group/)
- [`current_resource_group()`](/docs/query/functions/meta/#current_resource_group)
- [Configure and use resource groups](/docs/operations/resource-groups/)
