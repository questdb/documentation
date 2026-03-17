---
title: REMOVE USER reference
sidebar_label: REMOVE USER
description:
  "REMOVE USER SQL keywords reference documentation.  Applies to RBAC in QuestDB
  Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`REMOVE USER` - removes user from one or more groups.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

---

## Syntax

![Flow chart showing the syntax of the REMOVE USER keyword](/images/docs/diagrams/removeUser.svg)

## Examples

```questdb-sql
ADD USER john to management, audit;
REMOVE USER john from management, audit;
```

Checking user groups with:

```questdb-sql
SHOW GROUPS john;
```

should yield an empty list.
