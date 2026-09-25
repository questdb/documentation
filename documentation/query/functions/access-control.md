---
title: Access control functions
sidebar_label: Access control
description:
  Query QuestDB Enterprise ACL functions all_permissions(), permissions(),
  active_permissions(), and active_grants() to inspect available and assigned
  permissions.
---

QuestDB Enterprise provides four SQL table functions for inspecting
[role-based access control](/docs/security/rbac/): `all_permissions()` lists
available permission names and scopes; `permissions()` shows one principal's
access; `active_permissions()` and `active_grants()` let you search effective
permissions or direct grants across all persisted internal users, groups, and
service accounts. Use them to find who can access a table or who has been
granted a particular permission.

## Syntax

```questdb-sql title="Available permission names and levels"
SELECT * FROM all_permissions();
```

```questdb-sql title="Current or named principal's permissions"
SELECT * FROM permissions();
SELECT * FROM permissions('analyst');
```

```questdb-sql title="Effective permissions across principals"
SELECT * FROM active_permissions();
```

```questdb-sql title="Direct grants across principals"
SELECT * FROM active_grants();
```

All four functions return tables and can be filtered with SQL. The only argument
is the optional principal name for `permissions()`, as a string.

## all_permissions(): available permissions {#all_permissions}

`all_permissions()` takes no arguments and returns the permission names
supported by the server and the levels where they can be granted. It lists
permissions, **not** principals or their grants. Its columns are `permission`
(STRING) and `level` (STRING). `level` is `Database`, `Database|Table`, or
`Database|Table|Column` according to the permission's allowed scopes.

For example, check where `SELECT` can be granted:

```questdb-sql
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
[`SHOW PERMISSIONS`](/docs/query/sql/show/#show-permissions-for-current-user),
but can be composed with `WHERE`, `ORDER BY`, and other SQL clauses:

```questdb-sql
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
Inspecting another principal generally requires `USER DETAILS`; users can also
inspect their own groups and service accounts they can assume. Unlike the two
`active_*` functions, `permissions()` does not require `LIST USERS` and does not
show all principals in a single result. It cannot be used in a materialized or
live view.

## active_permissions() and active_grants(): audit all principals {#active-permissions-and-grants}

Both functions take no arguments and return the same columns:

| Column         | Type    | Description                                                                    |
| -------------- | ------- | ------------------------------------------------------------------------------ |
| `entity_name`  | STRING  | Name of the user, group, or service account                                    |
| `entity_type`  | STRING  | `User`, `Group`, or `Service Account`                                          |
| `permission`   | STRING  | Permission name, such as `SELECT` or `CREATE TABLE`                            |
| `table_name`   | STRING  | Table name for a table or column scope; `NULL` for a database-level permission |
| `column_name`  | STRING  | Column name for a column scope; `NULL` for a table or database scope           |
| `grant_option` | BOOLEAN | Whether the entity can grant this permission at this scope to others           |

A database-level `SELECT` (with `table_name IS NULL`) applies to all tables,
including future tables. When filtering for access to a particular table,
include both its table name and `NULL`. A non-`NULL` `column_name` means access
is limited to that column, not the whole table.

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
[`SHOW PERMISSIONS`](/docs/query/sql/show/#show-permissions-for-current-user).

:::note

Both functions require `LIST USERS` and `USER DETAILS` permissions. The built-in
admin can call them without explicit grants unless it has assumed a service
account, in which case the assumed account needs both permissions. They return
an empty result if ACL is disabled. They do not list external SSO/OIDC
identities or the built-in admin, which has no persisted ACL entry. A disabled
user can still appear with its retained permissions, so a row does not
necessarily mean the principal can log in. Neither function can be used in a
materialized or live view.

:::

## Examples

### Find who can read a table

List users and service accounts with effective `SELECT` permission on `trades`.
The `NULL` case includes database-level access, and the `column_name` field
shows whether access is limited to specific columns. Users who inherit a grant
from a group appear under their own names; group rows are excluded here because
groups cannot log in.

```questdb-sql
SELECT entity_name, entity_type, table_name, column_name
FROM active_permissions()
WHERE permission = 'SELECT'
  AND (table_name = 'trades' OR table_name IS NULL)
  AND entity_type IN ('User', 'Service Account')
ORDER BY entity_name, table_name, column_name;
```

For a table-wide grant, `column_name` is `NULL`; for a database-wide grant, both
scope columns are `NULL`. Column-level rows show access to those columns only.
Check that an account is enabled and has the required connection permission
(such as `PGWIRE` or `HTTP`) before treating it as able to connect.

### Find direct recipients of a permission

Find who was directly granted `CREATE TABLE`, including groups. Members who
inherit a group's permission are **not** repeated as recipients; use
`active_permissions()` if you want to see their effective access.

```questdb-sql
SELECT entity_name, entity_type, grant_option
FROM active_grants()
WHERE permission = 'CREATE TABLE'
ORDER BY entity_type, entity_name;
```

For a table-scoped permission such as `SELECT`, also filter by scope, including
database-wide grants:

```questdb-sql
SELECT entity_name, entity_type, table_name, column_name, grant_option
FROM active_grants()
WHERE permission = 'SELECT'
  AND (table_name = 'trades' OR table_name IS NULL)
ORDER BY entity_type, entity_name, table_name, column_name;
```

### Find who can delegate SELECT on a table

Filter effective permissions by `grant_option` to find principals who can grant
`SELECT` on all or part of `trades` to others:

```questdb-sql
SELECT entity_name, entity_type, table_name, column_name
FROM active_permissions()
WHERE permission = 'SELECT'
  AND grant_option
  AND (table_name = 'trades' OR table_name IS NULL)
  AND entity_type IN ('User', 'Service Account')
ORDER BY entity_name, table_name, column_name;
```

As above, a non-`NULL` `column_name` means the grant option is scoped to that
column, not the whole table.
