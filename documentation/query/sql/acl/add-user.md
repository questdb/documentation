---
title: ADD USER reference
sidebar_label: ADD USER
description:
  "ADD USER SQL keywords reference documentation.  Applies to RBAC in QuestDB
  Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

To add user to one or more groups in the database, the `ADD USER` keywords are
used.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

---

## Syntax

![Flow chart showing the syntax of the ADD USER keyword](/images/docs/diagrams/addUser.svg)

## Description

`ADD USER` adds a user to one or more groups.

## Examples

```questdb-sql
ADD USER john to management, audit;
```

It can be verified with:

```questdb-sql
SHOW GROUPS john;
```

that yields:

| name       |
| ---------- |
| management |
| audit      |
