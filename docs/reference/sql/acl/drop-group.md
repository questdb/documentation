---
title: DROP GROUP reference
sidebar_label: DROP GROUP
description:
  "DROP GROUP SQL keywords reference documentation.  Applies to RBAC in QuestDB
  Enterprise."
---

`DROP GROUP` - remove an existing group.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the DROP GROUP keyword](/img/docs/diagrams/dropGroup.svg)

## Description

`DROP GROUP` removes an existing group.

Unless the `IF EXISTS` clause is applied, an error is raised and the command
fails if the group does not exist.

When a group is removed, all members of the group lose the permissions inherited
through the group.

## Examples

```questdb-sql
DROP GROUP admins;

DROP GROUP IF EXISTS admins;
```

It can be verified with:

```questdb-sql
SHOW GROUPS;
```

that does not include `admins` in its result.
