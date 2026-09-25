---
title: Access control functions
sidebar_label: Access control
description: >-
  Audit QuestDB Enterprise access control in SQL: list direct grants, find who
  can read a table, and inspect a user's effective permissions.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Access control functions are available in QuestDB Enterprise.
</EnterpriseNote>

QuestDB Enterprise provides four SQL table functions for inspecting
[role-based access control](/docs/security/rbac/): `all_permissions()` lists
available permission names and scopes; `permissions()` shows one principal's
access; `active_permissions()` and `active_grants()` let you search effective
permissions or direct grants across all persisted internal users, groups, and
service accounts. Use them to find who can access a table or who has been
granted a particular permission.

## Syntax

```questdb-sql title="Available permission names and levels"
all_permissions()
```

```questdb-sql title="Current or named entity's permissions"
permissions([entityName])
```

```questdb-sql title="Effective permissions across entities"
active_permissions()
```

```questdb-sql title="Direct grants across entities"
active_grants()
```

All four are table functions used in the `FROM` clause. Their results can be
filtered, joined, and ordered with SQL.

- `entityName` (optional, string literal): existing user, group, or service
  account to inspect. Omit it to inspect the current entity.

## all_permissions(): available permissions {#all_permissions}

`all_permissions()` takes no arguments and returns the permission names
supported by the server and the levels where they can be granted. It lists
permissions, **not** principals or their grants. Its columns are `permission`
(STRING) and `level` (STRING). `level` is `Database`, `Database|Table`, or
`Database|Table|Column` according to the permission's allowed scopes.

For example, check where `SELECT` can be granted:

```questdb-sql title="Where SELECT can be granted"
SELECT permission, level
FROM all_permissions()
WHERE permission = 'SELECT';
```

See the [permissions reference](/docs/security/rbac/#permissions) for the
available permissions and their uses.

## permissions(): one principal's effective permissions {#permissions}

`permissions()` without an argument returns permissions for the current
principal. Pass an existing user, group, or service account name as a string to
inspect that entity instead. It returns the same result as
[`SHOW PERMISSIONS`](/docs/query/sql/show/#show-permissions),
but can be composed with `WHERE`, `ORDER BY`, and other SQL clauses:

```questdb-sql title="SELECT permissions of one user"
SELECT permission, table_name, column_name, grant_option, origin
FROM permissions('analyst')
WHERE permission = 'SELECT';
```

| Column         | Type    | Description                                                             |
| -------------- | ------- | ----------------------------------------------------------------------- |
| `permission`   | STRING  | Permission name                                                         |
| `table_name`   | STRING  | Table scope, or `NULL` for database-level permissions                   |
| `column_name`  | STRING  | Column scope, or `NULL` for table- and database-level permissions       |
| `grant_option` | BOOLEAN | Whether the principal can grant this permission at this scope to others |
| `origin`       | STRING  | `G` for granted access, `I` for implicit designated-timestamp access    |

`G` includes both direct and inherited permissions; it does not distinguish
between them. You can inspect your own permissions without `USER DETAILS`.
Inspecting another entity generally requires `USER DETAILS`; users can also
inspect their own groups and service accounts they can assume. `permissions()`
does not show all entities in a single result. It cannot be used in a
materialized or live view.

<span id="active_permissions" />
<span id="active_grants" />

## active_permissions() and active_grants(): audit all entities {#active-permissions-and-grants}

Both functions take no arguments and return the same columns:

| Column         | Type    | Description                                                                    |
| -------------- | ------- | ------------------------------------------------------------------------------ |
| `entity_name`  | STRING  | Name of the user, group, or service account                                    |
| `entity_type`  | STRING  | `User`, `Group`, or `Service Account`                                          |
| `permission`   | STRING  | Permission name, such as `SELECT` or `CREATE TABLE`                            |
| `table_name`   | STRING  | Table name for a table or column scope; `NULL` for a database-level permission |
| `column_name`  | STRING  | Column name for a column scope; `NULL` for a table or database scope           |
| `grant_option` | BOOLEAN | Whether the entity can grant this permission at this scope to others           |

Each row is one scope at which the entity holds a permission:

- `table_name` is `NULL`: database-wide. A database-level `SELECT` applies to
  all tables, including tables created later.
- `table_name` is set and `column_name` is `NULL`: the whole table.
- Both are set: that column only.

An entity can have rows for the same permission at more than one scope. For
example, a table-wide `SELECT` without the grant option can sit next to column
rows that carry the grant option for specific columns. Access is limited to
specific columns only when the entity has no row for that permission on the
whole table or database. When filtering for access to a particular table,
include both its table name and `NULL`.

### Effective permissions and direct grants

`active_permissions()` includes each user's direct permissions and permissions
inherited from their groups. Groups and service accounts have their own rows. It
also includes implicit access to a table's designated timestamp column when a
principal has `SELECT` or `UPDATE` on another column. For a principal with
`DATABASE ADMIN`, it expands the effective database permissions.

`active_grants()` lists permissions granted directly to each entity. It does not
repeat a group's grants under its members or include implicit designated
timestamp permissions. Results reflect the **current, normalized ACL scopes**,
not the original `GRANT` statements: for example, revoking access to a single
column can turn a table-wide grant into column-level rows. To inspect one
principal instead, use [`permissions()`](#permissions) or
[`SHOW PERMISSIONS`](/docs/query/sql/show/#show-permissions).

:::note

Both functions require `LIST USERS` and `USER DETAILS` permissions. The built-in
admin can call them without explicit grants unless it has assumed a service
account, in which case the assumed account needs both permissions. They return
an empty result if ACL is disabled. They do not list external SSO/OIDC
identities, which get their access through the groups they are mapped to, or
the built-in admin, which has no persisted ACL entry. A disabled user can still
appear with its retained permissions, so a row does not necessarily mean the
entity can connect. Check the `enabled` column of
[`SHOW USERS`](/docs/query/sql/show/#show-users) or
[`SHOW SERVICE ACCOUNTS`](/docs/query/sql/show/#show-service-accounts), and the
[endpoint permissions](/docs/security/rbac/#endpoint-permissions) such as
`PGWIRE` or `HTTP`. Neither function can be used in a materialized or live view.

:::

## Examples

The examples use the following entities and grants on the `trades` table, whose
designated timestamp column is `timestamp`. The result tables show the output
for this setup.

```questdb-sql title="Example setup"
CREATE GROUP trading_team;
CREATE USER analyst WITH PASSWORD 'pwd';
CREATE USER risk_manager WITH PASSWORD 'pwd';
CREATE SERVICE ACCOUNT report_svc;
ADD USER analyst TO trading_team;

GRANT CREATE TABLE TO trading_team;
GRANT SELECT ON trades(symbol, price) TO trading_team WITH GRANT OPTION;
GRANT SELECT ON trades TO analyst;
GRANT SELECT ON ALL TABLES TO risk_manager;
GRANT SELECT ON trades(symbol, price) TO report_svc;
```

### Compare effective permissions with direct grants

`active_permissions()` shows everything `analyst` can do, including what it
inherits from `trading_team`:

```questdb-sql title="Effective permissions of one user"
SELECT permission, table_name, column_name, grant_option
FROM active_permissions()
WHERE entity_name = 'analyst'
ORDER BY permission, table_name, column_name;
```

| permission   | table_name | column_name | grant_option |
| ------------ | ---------- | ----------- | ------------ |
| CREATE TABLE | NULL       | NULL        | false        |
| SELECT       | trades     | NULL        | false        |
| SELECT       | trades     | price       | true         |
| SELECT       | trades     | symbol      | true         |

`analyst` can read the whole `trades` table through its own table-wide grant.
The `price` and `symbol` rows come from the group and carry its grant option,
so `analyst` can grant `SELECT` on those two columns, but not on the whole
table. `CREATE TABLE` is also inherited from the group.

`active_grants()` shows only what was granted to `analyst` directly:

```questdb-sql title="Direct grants of one user"
SELECT permission, table_name, column_name, grant_option
FROM active_grants()
WHERE entity_name = 'analyst';
```

| permission | table_name | column_name | grant_option |
| ---------- | ---------- | ----------- | ------------ |
| SELECT     | trades     | NULL        | false        |

### Find who can read a table

List every entity with effective `SELECT` permission on `trades`, including
database-wide access:

```questdb-sql title="Entities that can read trades"
SELECT entity_name, entity_type, table_name, column_name
FROM active_permissions()
WHERE permission = 'SELECT'
  AND (table_name = 'trades' OR table_name IS NULL)
ORDER BY entity_type, entity_name, table_name, column_name;
```

| entity_name  | entity_type     | table_name | column_name |
| ------------ | --------------- | ---------- | ----------- |
| trading_team | Group           | trades     | price       |
| trading_team | Group           | trades     | symbol      |
| trading_team | Group           | trades     | timestamp   |
| report_svc   | Service Account | trades     | price       |
| report_svc   | Service Account | trades     | symbol      |
| report_svc   | Service Account | trades     | timestamp   |
| analyst      | User            | trades     | NULL        |
| analyst      | User            | trades     | price       |
| analyst      | User            | trades     | symbol      |
| risk_manager | User            | NULL       | NULL        |

- `risk_manager` can read every table, including `trades`.
- `analyst` can read the whole table. Its column rows record the grant option
  shown in the previous example.
- `trading_team` and `report_svc` can read `symbol` and `price`, plus the
  designated timestamp column, which comes with column-level `SELECT`.
- Keep group rows when auditing: a group cannot log in, but its members can,
  including external SSO/OIDC users mapped to it, who are not listed
  individually.

To check access to a single column, also accept table-wide rows, and use
`DISTINCT` to get one row per entity:

```questdb-sql title="Entities that can read trades.price"
SELECT DISTINCT entity_name, entity_type
FROM active_permissions()
WHERE permission = 'SELECT'
  AND (table_name = 'trades' OR table_name IS NULL)
  AND (column_name = 'price' OR column_name IS NULL)
ORDER BY entity_type, entity_name;
```

| entity_name  | entity_type     |
| ------------ | --------------- |
| trading_team | Group           |
| report_svc   | Service Account |
| analyst      | User            |
| risk_manager | User            |

These queries do not show every way to reach the data:

- **Assumed service accounts.** A user who can assume a service account gets
  its permissions after
  [`ASSUME SERVICE ACCOUNT`](/docs/security/rbac/#service-account-assumption),
  but those permissions appear only under the service account's name. Use
  [`SHOW SERVICE ACCOUNTS userName`](/docs/query/sql/show/#show-service-accounts)
  to list the accounts a user or group can assume.
- **Views.** `SELECT` on a view over `trades` lets the grantee read the view's
  rows without any grant on `trades`. See
  [row-level access with views](/docs/security/rbac/#row-level-access-with-views).

### Find direct recipients of a permission

Find who was directly granted `CREATE TABLE`. Members who inherit a group's
permission are not repeated, so `analyst` does not appear. Use
`active_permissions()` to see effective access.

```questdb-sql title="Direct recipients of CREATE TABLE"
SELECT entity_name, entity_type, grant_option
FROM active_grants()
WHERE permission = 'CREATE TABLE'
ORDER BY entity_type, entity_name;
```

| entity_name  | entity_type | grant_option |
| ------------ | ----------- | ------------ |
| trading_team | Group       | false        |

For a table-scoped permission such as `SELECT`, also filter by scope, including
database-wide grants:

```questdb-sql title="Direct SELECT grants on trades"
SELECT entity_name, entity_type, table_name, column_name, grant_option
FROM active_grants()
WHERE permission = 'SELECT'
  AND (table_name = 'trades' OR table_name IS NULL)
ORDER BY entity_type, entity_name, table_name, column_name;
```

| entity_name  | entity_type     | table_name | column_name | grant_option |
| ------------ | --------------- | ---------- | ----------- | ------------ |
| trading_team | Group           | trades     | price       | true         |
| trading_team | Group           | trades     | symbol      | true         |
| report_svc   | Service Account | trades     | price       | false        |
| report_svc   | Service Account | trades     | symbol      | false        |
| analyst      | User            | trades     | NULL        | false        |
| risk_manager | User            | NULL       | NULL        | false        |

Unlike `active_permissions()`, this does not include the implicit designated
timestamp rows.

### Find who can delegate SELECT on a table

Filter effective permissions by `grant_option` to find entities that can grant
`SELECT` on all or part of `trades` to others:

```questdb-sql title="Entities that can grant SELECT on trades"
SELECT entity_name, entity_type, table_name, column_name
FROM active_permissions()
WHERE permission = 'SELECT'
  AND grant_option
  AND (table_name = 'trades' OR table_name IS NULL)
ORDER BY entity_type, entity_name, table_name, column_name;
```

| entity_name  | entity_type | table_name | column_name |
| ------------ | ----------- | ---------- | ----------- |
| trading_team | Group       | trades     | price       |
| trading_team | Group       | trades     | symbol      |
| analyst      | User        | trades     | price       |
| analyst      | User        | trades     | symbol      |

Both can grant `SELECT` on `price` and `symbol` only. No one in this setup can
grant `SELECT` on the whole table.
