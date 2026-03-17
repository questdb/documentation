---
title: CREATE GROUP reference
sidebar_label: CREATE GROUP
description:
  "CREATE GROUP SQL keywords reference documentation.  Applies to RBAC in
  QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`CREATE GROUP` - create a new group

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

---

## Syntax

![Flow chart showing the syntax of the CREATE GROUP keyword](/images/docs/diagrams/createGroup.svg)

## Description

`CREATE GROUP` adds a new user group with no permissions.

The chosen name must be unique across all users (including the built-in admin),
groups and service accounts. If the name has already been reserved, the command
fails and an error is raised, unless the `IF NOT EXISTS` clause is included in
the statement.

Contrary to users and service accounts, it is not possible to log in as group. A
group only serves as a container for permissions which are shared between users.

## Examples

```questdb-sql
CREATE GROUP admins;

CREATE GROUP IF NOT EXISTS admins;
```

It can be verified with:

```questdb-sql
SHOW GROUPS;
```

that yields:

| name   |
| ------ |
| admins |
