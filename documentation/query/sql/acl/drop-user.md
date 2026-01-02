---
title: DROP USER reference
sidebar_label: DROP USER
description:
  "DROP USER SQL keywords reference documentation.  Applies to RBAC in QuestDB
  Enterprise."
---

`DROP USER` - drop an existing user

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the DROP USER keyword](/images/docs/diagrams/dropUser.svg)

## Description

`DROP USER` removes an existing user.

**All related secrets are also deleted.**

Unless the `IF EXISTS` clause is applied, an error is raised and the command
fails if the user does not exist.

## Examples

```questdb-sql
DROP USER john;

DROP USER IF EXISTS john;
```

It can be verified with:

```questdb-sql
SHOW USERS;
```

that does not include `john` in its result.
