---
title: REVOKE reference
sidebar_label: REVOKE
description:
  "REVOKE SQL keywords reference documentation. Applies to RBAC in QuestDB
  Enterprise."
---

`REVOKE` - revoke permission from user, group or service account.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the REVOKE keyword](/images/docs/diagrams/revoke.svg)

## Description

- `REVOKE [permissions] FROM entity` - revoke database level permissions from an
  entity
- `REVOKE [permissions] ON ALL TABLES FROM entity` - revoke table/column level
  permissions on database level from an entity
- `REVOKE [permissions] ON [table] FROM entity` - revoke table/column level
  permissions on table level from an entity
- `REVOKE [permissions] ON [table(columns)] FROM entity` - revoke column level
  permissions on column level from an entity

### Revoke database level permissions

```questdb-sql
REVOKE CREATE TABLE FROM john;
```

### Revoke table level permissions for entire database

```questdb-sql
REVOKE ADD INDEX, REINDEX ON ALL TABLES FROM john;
```

### Revoke table level permissions on specific tables

```questdb-sql
REVOKE ADD INDEX, REINDEX ON orders FROM john;
```

### Revoke column level permissions for entire database

```questdb-sql
REVOKE SELECT ON ALL TABLES FROM john;
```

### Revoke column level permissions on specific tables

```questdb-sql
REVOKE SELECT ON orders, trades FROM john;
```

### Revoke column level permissions on specific columns

```questdb-sql
REVOKE SELECT ON orders(id, name) FROM john;
```

### Implicit permissions

If the target table has implicit timestamp permissions, then revoking `SELECT`
or `UPDATE` permission on all other table columns also revokes it on the
designated timestamp column:

```questdb-sql
CREATE TABLE products(id INT, name STRING, ts TIMESTAMP) TIMESTAMP(ts);
GRANT SELECT ON products(id) TO john;
GRANT SELECT, UPDATE ON products(name) TO john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| UPDATE     | products   | name        | f            | G      |
| UPDATE     | products   | ts          | f            | I      |
| SELECT     | products   | id          | f            | G      |
| SELECT     | products   | name        | f            | G      |
| SELECT     | products   | ts          | f            | I      |

Revoking a permission from all columns revokes the implicitly granted permission
from the designated timestamp column:

```questdb-sql
REVOKE UPDATE ON products(name) FROM john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | products   | id          | f            | G      |
| SELECT     | products   | name        | f            | G      |
| SELECT     | products   | ts          | f            | I      |

However, if there is even a single column which still has the permission, then
the implicit permission is kept:

```questdb-sql
REVOKE SELECT ON products(id) FROM john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | products   | name        | f            | G      |
| SELECT     | products   | ts          | f            | I      |

### Permission level readjustment

If the user has a database- or table-level permission, then revoking it on a
lower level triggers
[permission level re-adjustment](/docs/security/rbac/#permission-level-re-adjustment).
Permission is switched to lower level and `materialized`:

- database level permission is pushed to table level, so e.g. SELECT will not
  apply to any new tables
- table level permission is pushed to column level, so e.g. SELECT will not
  apply to any new table columns

For example, assume we have the following tables: `orders`, `trades` and
`products`, and revoking a permission from a table which was granted on database
level previously.

```questdb-sql
GRANT SELECT ON ALL TABLES TO john;
REVOKE SELECT ON trades FROM john;
```

Database level permission is replaced with table level on all existing tables,
except the one being revoked.

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | orders     |             | f            | G      |
| SELECT     | products   |             | f            | G      |

As a consequence permission, which was granted for all tables previously, will
not apply to any newly-created tables:

```questdb-sql
CREATE TABLE new_tab( id INT );
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | orders     |             | f            | G      |
| SELECT     | products   |             | f            | G      |

Permission level re-adjustment can also happen from the table level to the
column level. For example, the following column level revoke replaces the table
level permission on the products table with column level permissions:

```questdb-sql
REVOKE SELECT on products(id) FROM john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | orders     |             | f            | G      |
| SELECT     | products   | name        | f            | G      |

### Revoke permissions inherited from group

Permissions of groups are applied after user permissions, thus it is not
possible to revoke them directly from the user.

```questdb-sql
CREATE group admins;
GRANT SELECT on products to admins;
ADD USER john to admins;
REVOKE SELECT on products from john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | products   |             | f            | G      |

To do so, either:

- the user has to be removed from the group where the permission is inherited
  from
- or the permission has to be revoked from the group

```questdb-sql
REVOKE SELECT on products FROM admins;
-- or
REMOVE USER john FROM admins;
```
