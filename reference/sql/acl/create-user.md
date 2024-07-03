---
title: CREATE USER reference
sidebar_label: CREATE USER
description:
  "CREATE USER SQL keywords reference documentation.  Applies to RBAC in QuestDB
  Enterprise."
---

`CREATE USER` - create a new user in the database.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the CREATE USER keyword](/img/docs/diagrams/createUser.svg)

## Description

`CREATE USER` adds a new user with no permissions, optionally a password can
also be set for the user.

The chosen name must be unique across all users (including the built-in admin),
groups and service accounts. If the name has already been reserved, the command
fails and an error is raised, unless the `IF NOT EXISTS` clause is included in
the statement.

Note that new users can only access the database if the necessary
[endpoint permissions](/docs/operations/rbac/#endpoint-permissions) have been
granted.

## Conditional user creation

You can use the `IF NOT EXISTS` clause to create a user only if it does not
already exist. If the user already exists, the command will have no effect.

When you use the `IF NOT EXISTS` clause and the user already exists, the command
will keep the user's password intact and will not change it in any way. This is
true even if the current password differs from the one you are attempting to
set:

```questdb-sql title="IF NOT EXISTS with a password"
CREATE USER IF NOT EXISTS john WITH PASSWORD secret;
```

```questdb-sql title="IF NOT EXISTS with no password"
CREATE USER IF NOT EXISTS john WITH NO PASSWORD;
```

If you want to update the user's password unconditionally, you can use the
[ALTER USER](/sql/acl/alter-user/#set-password) command.

## Examples

### Create new user without password

```questdb-sql
CREATE USER john;
-- or
CREATE USER IF NOT EXISTS john;
-- or
CREATE USER john WITH NO PASSWORD;
```

It can be verified with:

```questdb-sql
SHOW USER john;
```

that yields:

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | false   |
| REST Token | false   |

### Create user with password

```questdb-sql
CREATE USER jane WITH PASSWORD secret;
```

In this case `SHOW USER` command returns:

| auth_type  | enabled |
| ---------- | ------- |
| Password   | true    |
| JWK Token  | false   |
| REST Token | false   |
