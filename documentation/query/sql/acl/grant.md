---
title: GRANT reference
sidebar_label: GRANT
description:
  "GRANT SQL keywords reference documentation.  Applies to RBAC in QuestDB
  Enterprise."
---

`GRANT` - grants permissions to a user, group or service account.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the GRANT keyword](/images/docs/diagrams/grant.svg)

## Description

- `GRANT [permissions] TO entity` - grant database level permissions on database
  level to an entity
- `GRANT [permissions] ON ALL TABLES TO entity` - grant table/column level
  permissions on database level to an entity
- `GRANT [permissions] ON [table] TO entity` - grant table/column level
  permissions on table level to an entity
- `GRANT [permissions] ON [table(columns)] TO entity` - grant column level
  permissions on column level to an entity

### Grant database level permissions

```questdb-sql
GRANT CREATE TABLE, SNAPSHOT TO john;
```

| permission   | table_name | column_name | grant_option | origin |
| ------------ | ---------- | ----------- | ------------ | ------ |
| CREATE TABLE |            |             | f            | G      |
| SNAPSHOT     |            |             | f            | G      |

### Grant table level permissions for entire database

```questdb-sql
GRANT ADD INDEX, REINDEX ON ALL TABLES TO john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| ADD INDEX  |            |             | f            | G      |
| REINDEX    |            |             | f            | G      |

### Grant table level permissions on specific tables

```questdb-sql
GRANT ADD INDEX, REINDEX ON orders, trades TO john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| ADD INDEX  | trades     |             | f            | G      |
| REINDEX    | trades     |             | f            | G      |
| ADD INDEX  | orders     |             | f            | G      |
| REINDEX    | orders     |             | f            | G      |

### Grant column level permissions for entire database

```questdb-sql
GRANT SELECT ON ALL TABLES TO john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | f            | G      |

### Grant column level permissions on specific tables

```questdb-sql
GRANT SELECT ON orders TO john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | orders     |             | f            | G      |

### Grant column level permissions on specific columns

```questdb-sql
GRANT SELECT ON orders(id, name), trades(id, quantity) TO john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | trades     | id          | f            | G      |
| SELECT     | trades     | quantity    | f            | G      |
| SELECT     | orders     | id          | f            | G      |
| SELECT     | orders     | name        | f            | G      |

### Grant option

If the `WITH GRANT OPTION` clause is present, then the target entity is allowed
to grant the permissions to other entities. If the entity already has
permissions matching those being granted, their grant option is overwritten.

```questdb-sql
GRANT SELECT ON ALL TABLES TO john WITH GRANT OPTION;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | t            | G      |

```questdb-sql
GRANT SELECT ON ALL TABLES TO john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | f            | G      |

### Verification

By default, `GRANT` does not check whether entities exist, making it possible to
grant permissions to users, groups or service accounts that are later created.

To make sure that the target entity of the grant statement exists, use
[verification](/docs/security/rbac/#grant-verification). The
`WITH VERIFICATION` clause enables checks on the target entity and causes the
`GRANT` statement to fail if the entity does not exist.

```questdb-sql
GRANT SELECT ON orders TO john WITH VERIFICATION;
```

### Implicit permissions

In QuestDB, the timestamp column of a table is crucial for time-series
operations like `ASOF` and `LT` joins, `SAMPLE BY` and interval scans. If a user
can access some columns but not the timestamp column, they cannot execute most
queries.

Therefore when a table has a designated timestamp, granting `SELECT` or `UPDATE`
permissions on any column will automatically extend those permissions to the
timestamp column. These are known as
[implicit permissions](/docs/security/rbac/#implicit-permissions), and they're
indicated by an `I` in the `origin` column of the `SHOW PERMISSIONS` output.

For example, if you grant `UPDATE` permission on the `id` column of the
`products` table, the timestamp column also receives `UPDATE` permission:

```questdb-sql
CREATE TABLE products(id int, name string, ts timestamp) timestamp(ts);
GRANT UPDATE ON products(id) TO john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| UPDATE     | products   | id          | f            | G      |
| UPDATE     | products   | ts          | f            | I      |

### Optimization

When granting permissions on the table or column level, sometimes it might seem
like there is no effect when cross-checking with the `SHOW permissions` command.
If QuestDB detects that the permission is already granted on a higher level, it
optimizes and removes any child permissions. Doing so keeps the access list
model simple and permission checks faster.

For example, granting the same permission on the database and table level shows
will show the permission on database level only:

```questdb-sql
GRANT INSERT ON ALL TABLES TO john;
GRANT INSERT ON products TO john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| INSERT     |            |             | f            | G      |

Granting the same permission on the table and column level shows permission on
the table level only:

```questdb-sql
GRANT SELECT ON products TO john;
GRANT SELECT ON products(id) TO john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | products   |             | f            | G      |

### Grant ahead of table or column creation

Grant permissions ahead of table or column creation:

```questdb-sql
GRANT SELECT ON countries TO john;
GRANT UPDATE ON countries(id) TO john;
GRANT UPDATE ON countries(description) TO john;
```

Such permissions do not show on `SHOW PERMISSIONS` output.

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |

However, when the table is created, then the applicable permissions appear:

```questdb-sql
CREATE TABLE countries (id INT, name STRING, iso_code STRING);
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | countries  |             | f            | G      |
| UPDATE     | countries  | id          | f            | G      |

When 'missing' columns are later added to the table, then more permissions
appear:

```questdb-sql
ALTER TABLE countries ADD COLUMN description string;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | countries  |             | f            | G      |
| UPDATE     | countries  | id          | f            | G      |
| UPDATE     | countries  | description | f            | G      |

### Grant when table or column is dropped and recreated

Granted permissions are not automatically revoked when related tables or columns
are dropped. Instead, they have no effect until table or column is recreated.

```questdb-sql
CREATE TABLE countries (id INT, name STRING, iso_code STRING);
GRANT SELECT ON countries TO john;
GRANT UPDATE ON countries(iso_code) TO john;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | countries  |             | f            | G      |
| UPDATE     | countries  | iso_code    | f            | G      |

Now, if the table is dropped, then permission stops being visible:

```questdb-sql
DROP TABLE countries;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |

When the table is later recreated, permission are in full effect again :

```questdb-sql
CREATE TABLE countries (id INT, name STRING, iso_code int, alpha2 STRING);
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     | countries  |             | f            | G      |
| UPDATE     | countries  |             | f            | G      |

:::note

Only the table and/or column name is used when applying permission. The type is
ignored. In the example above `iso_code` was initially of string type, then
recreated as int.

:::

### Owner grants

In QuestDB there are no owners of database objects. Instead, there are
[owner grants](/docs/security/rbac/#owner-grants).

An owner grant means:

- if a user creates a table, the user automatically gets all table level
  permissions with the grant option on the table
- if a user adds a new column to an existing table, the user automatically gets
  all column level permissions with the grant option on the column
