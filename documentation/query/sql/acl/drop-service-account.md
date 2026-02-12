---
title: DROP SERVICE ACCOUNT reference
sidebar_label: DROP SERVICE ACCOUNT
description:
  "DROP SERVICE ACCOUNT SQL keywords reference documentation.  Applies to RBAC
  in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`DROP SERVICE ACCOUNT` - drop an existing service account

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

---

## Syntax

![Flow chart showing the syntax of the DROP SERVICE ACCOUNT keyword](/images/docs/diagrams/dropServiceAccount.svg)

## Description

`DROP SERVICE ACCOUNT` removes an existing service account and all related links
to users or groups.

Unless the `IF EXISTS` clause is applied, an error is raised and the command
fails if the service account does not exist.

## Examples

```questdb-sql
DROP SERVICE ACCOUNT audit;

DROP SERVICE ACCOUNT IF EXISTS audit;
```

It can be verified with:

```questdb-sql
SHOW SERVICE ACCOUNTS;
```

that does not include `audit` in its result.
