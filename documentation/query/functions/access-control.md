---
title: Access control functions
sidebar_label: Access control
description:
  Query QuestDB Enterprise permissions with SQL, from one entity's permissions
  to the effective permissions and direct grants of every user, group, and
  service account.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Access control functions are available in QuestDB Enterprise.
  `active_grants()` and `active_permissions()` require version 4.1.0 or later.
</EnterpriseNote>

These table functions return QuestDB Enterprise
[access control](/docs/security/rbac/) data as rows, so you can audit
permissions with SQL instead of running `SHOW PERMISSIONS` for one entity at a
time. Use them to find who can read a table or column, who can grant a
permission to others, or what a group passes on to its members.

| Function | Returns | Required permissions |
| -------- | ------- | -------------------- |
| [`active_grants()`](#active_grants) | Direct grants of every user, group, and service account | `LIST USERS` and `USER DETAILS` |
| [`active_permissions()`](#active_permissions) | Effective permissions of every user, group, and service account, including those inherited from groups | `LIST USERS` and `USER DETAILS` |
| [`all_permissions()`](#all_permissions) | Every permission and the levels it can be granted at | None |
| [`permissions([entityName])`](#permissions) | Effective permissions of the current user or of a named entity | `USER DETAILS` for other entities |

## active_grants

`active_grants()` lists the permissions granted directly to each user, group,
and service account. Its rows match the `GRANT` statements in force, including
the permissions an entity received as the owner of a table it created. Use it
to review what has been granted, or to find the grant to revoke: a permission
that a user inherits from a group must be revoked from the group.

It takes no arguments. To include the permissions each user inherits from its
groups, use [`active_permissions()`](#active_permissions).

### Result columns

- `entity_name` (`STRING`): name of the user, group, or service account.
- `entity_type` (`STRING`): `User`, `Group`, or `Service Account`.
- `permission` (`STRING`): permission name, as listed by
  [`all_permissions()`](#all_permissions).
- `table_name` (`STRING`): table the permission is granted on. `null` for a
  permission granted at database level: a database permission such as
  `CREATE TABLE`, or a grant on all tables such as
  `GRANT SELECT ON ALL TABLES`.
- `column_name` (`STRING`): column the permission is granted on. `null` for a
  permission granted on a whole table or at database level.
- `grant_option` (`BOOLEAN`): `true` if the entity can grant the permission at
  this scope to others.

Each combination of entity, permission, table, and column appears once, and
grants on tables or columns that do not exist yet are included. A permission
appears on two scopes when its grant option is narrower than the permission.
After `GRANT SELECT ON ALL TABLES TO analyst`, then
`GRANT SELECT ON fx_trades TO analyst WITH GRANT OPTION`, `analyst` has a
database-level `SELECT` row with `grant_option` set to `false`, and a `SELECT`
row on `fx_trades` with `true`.

### Required permissions

`active_grants()` and `active_permissions()` list every entity, so they require
both `LIST USERS` and `USER DETAILS`, even to read your own rows.
`DATABASE ADMIN` includes both. A caller missing either gets
`Access denied for <user> [LIST USERS]` or
`Access denied for <user> [USER DETAILS]`. To check your own permissions
without them, use [`permissions()`](#permissions) or
[`SHOW PERMISSIONS`](/docs/query/sql/show/#show-permissions).

### Limitations

These apply to both `active_grants()` and `active_permissions()`:

- The built-in admin and external (SSO/OIDC) users are not listed, as neither
  has a stored access list. An external user gets the permissions of the
  QuestDB groups [mapped](/docs/security/oidc/#mapping-user-permissions) to its
  identity provider groups, so audit the rows of those groups.
- Group memberships and `ASSUME SERVICE ACCOUNT` grants are not listed, nor
  the permissions a user gains by assuming a service account. Use
  [`SHOW GROUPS userName`](/docs/query/sql/show/#show-groups) and
  [`SHOW SERVICE ACCOUNTS userName`](/docs/query/sql/show/#show-service-accounts)
  to see them.
- When access control is disabled with
  [`acl.enabled=false`](/docs/configuration/iam/#aclenabled), the functions
  return no rows.
- The functions cannot be used in a materialized view or a live view, which
  refresh in the background without a session whose permissions could be
  checked. Creating such a view fails with an error such as
  `administrative function cannot be used in materialized view: active_grants`.
  A regular view can call them, and checks the permissions of the user who
  queries it.

### Examples

The examples on this page use these entities. `fx_orders` does not exist yet:

```questdb-sql title="Example entities and grants"
CREATE TABLE fx_trades (
  timestamp TIMESTAMP_NS,
  symbol SYMBOL,
  ecn SYMBOL,
  side SYMBOL,
  price DOUBLE,
  quantity DOUBLE
) TIMESTAMP(timestamp) PARTITION BY HOUR;

CREATE GROUP fx_desk;
CREATE USER fx_trader;
ADD USER fx_trader TO fx_desk;
CREATE USER quant;
CREATE USER risk_manager;
CREATE SERVICE ACCOUNT fx_ingest;

GRANT SELECT ON fx_trades TO fx_desk;
GRANT CREATE TABLE TO fx_trader;
GRANT SELECT ON fx_trades(symbol, price) TO quant;
GRANT SELECT ON ALL TABLES TO risk_manager WITH GRANT OPTION;
GRANT INSERT ON fx_trades, fx_orders TO fx_ingest;
```

```questdb-sql title="Direct grants of every entity"
SELECT * FROM active_grants()
ORDER BY entity_name, permission, table_name, column_name;
```

| entity_name  | entity_type     | permission   | table_name | column_name | grant_option |
| ------------ | --------------- | ------------ | ---------- | ----------- | ------------ |
| fx_desk      | Group           | SELECT       | fx_trades  |             | false        |
| fx_ingest    | Service Account | INSERT       | fx_orders  |             | false        |
| fx_ingest    | Service Account | INSERT       | fx_trades  |             | false        |
| fx_trader    | User            | CREATE TABLE |            |             | false        |
| quant        | User            | SELECT       | fx_trades  | price       | false        |
| quant        | User            | SELECT       | fx_trades  | symbol      | false        |
| risk_manager | User            | SELECT       |            |             | true         |

Each `GRANT` produces a row for every permission and every table or column it
names, and the database-level grant to `risk_manager` has no table name.

```questdb-sql title="Grants that let the holder pass a permission on"
SELECT entity_name, permission, table_name, column_name
FROM active_grants()
WHERE grant_option;
```

| entity_name  | permission | table_name | column_name |
| ------------ | ---------- | ---------- | ----------- |
| risk_manager | SELECT     |            |             |

## active_permissions

`active_permissions()` lists the effective permissions of each user, group,
and service account: everything the entity is allowed to do, whether or not it
was granted directly. Use it to answer access questions across the database,
such as who can read a table or a column.

It takes no arguments and returns the same [columns](#result-columns) as
`active_grants()`, with the same [required permissions](#required-permissions)
and [limitations](#limitations). In addition to the direct grants, it reports:

- For each user, the permissions inherited from its groups. These rows repeat
  the group's rows under the user's name.
- The [implicit permission](/docs/security/rbac/#implicit-permissions) on the
  designated timestamp. An entity that holds `SELECT` or `UPDATE` on some
  columns of a table holds the same permission on the table's designated
  timestamp column, without the grant option.
- The permissions that `DATABASE ADMIN` includes: one database-level row per
  permission, plus a table or column row only where it adds a grant option.

### Examples

These examples use the [entities above](#examples).

```questdb-sql title="Effective permissions of every entity"
SELECT * FROM active_permissions()
ORDER BY entity_name, permission, table_name, column_name;
```

| entity_name  | entity_type     | permission   | table_name | column_name | grant_option |
| ------------ | --------------- | ------------ | ---------- | ----------- | ------------ |
| fx_desk      | Group           | SELECT       | fx_trades  |             | false        |
| fx_ingest    | Service Account | INSERT       | fx_orders  |             | false        |
| fx_ingest    | Service Account | INSERT       | fx_trades  |             | false        |
| fx_trader    | User            | CREATE TABLE |            |             | false        |
| fx_trader    | User            | SELECT       | fx_trades  |             | false        |
| quant        | User            | SELECT       | fx_trades  | price       | false        |
| quant        | User            | SELECT       | fx_trades  | symbol      | false        |
| quant        | User            | SELECT       | fx_trades  | timestamp   | false        |
| risk_manager | User            | SELECT       |            |             | true         |

Two rows are not direct grants. `fx_trader` inherits `SELECT` on `fx_trades`
from `fx_desk`, and `quant` holds `SELECT` on the designated timestamp because
it can read other columns of the table.

To find who can read a table, include the database-level rows, where
`table_name` is `null`:

```questdb-sql title="Who can read fx_trades"
SELECT entity_name, table_name, column_name, grant_option
FROM active_permissions()
WHERE permission = 'SELECT'
  AND (table_name = 'fx_trades' OR table_name IS NULL)
ORDER BY entity_name, column_name;
```

| entity_name  | table_name | column_name | grant_option |
| ------------ | ---------- | ----------- | ------------ |
| fx_desk      | fx_trades  |             | false        |
| fx_trader    | fx_trades  |             | false        |
| quant        | fx_trades  | price       | false        |
| quant        | fx_trades  | symbol      | false        |
| quant        | fx_trades  | timestamp   | false        |
| risk_manager |            |             | true         |

`quant` can read three columns of `fx_trades`, and `risk_manager` can read
every table and grant that access to others.

## all_permissions

`all_permissions()` lists every permission that can be granted, with the levels
it can be granted at. Use it to look up permission names for
[`GRANT`](/docs/query/sql/acl/grant/) and
[`REVOKE`](/docs/query/sql/acl/revoke/). It lists the permissions that exist,
not the ones granted: for those, use [`active_grants()`](#active_grants). Any
user can call it.

It takes no arguments and returns:

- `permission` (`STRING`): permission name.
- `level` (`STRING`): levels at which the permission can be granted:
  `Database`, `Database|Table`, or `Database|Table|Column`.

```questdb-sql title="Levels of three permissions"
SELECT * FROM all_permissions()
WHERE permission IN ('CREATE TABLE', 'INSERT', 'SELECT');
```

| permission   | level                             |
| ------------ | --------------------------------- |
| SELECT       | Database&#124;Table&#124;Column   |
| INSERT       | Database&#124;Table               |
| CREATE TABLE | Database                          |

## permissions

`permissions()` lists the effective permissions of the current user, and
`permissions(entityName)` those of the named user, group, or service account.
It returns the same rows as
[`SHOW PERMISSIONS`](/docs/query/sql/show/#show-permissions), as a table
function that you can join or use in a subquery.

It takes an optional argument:

- `entityName` (optional, `STRING`): user, group, or service account to
  inspect. Default: the current user.

It returns these columns:

- `permission`, `table_name`, `column_name`, and `grant_option`, as described
  in [Result columns](#result-columns).
- `origin` (`STRING`): `G` for a granted permission, whether direct or
  inherited from a group, and `I` for an
  [implicit permission](/docs/security/rbac/#implicit-permissions) on the
  designated timestamp column.

Unlike `active_permissions()`, it omits grants on tables or columns that do not
exist yet. Inspecting an entity other than yourself, one of your groups, or a
service account you can assume requires `USER DETAILS`. Like
`active_permissions()`, it cannot be used in a materialized view or a live
view.

```questdb-sql title="Permissions of quant"
SELECT * FROM permissions('quant');
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | fx_trades  | symbol      | false        | G      |
| SELECT     | fx_trades  | price       | false        | G      |
| SELECT     | fx_trades  | timestamp   | false        | I      |
