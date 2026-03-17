---
title: EXIT SERVICE ACCOUNT reference
sidebar_label: EXIT SERVICE ACCOUNT
description:
  "EXIT SERVICE ACCOUNT SQL keywords reference documentation.  Applies to RBAC
  in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`EXIT SERVICE ACCOUNT` - switches current user back from service account,
basically replacing its current access list (belonging to a user account) with
the user's access list.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

---

## Syntax

![Flow chart showing the syntax of the EXIT SERVICE ACCOUNT keyword](/images/docs/diagrams/exitServiceAccount.svg)

## Examples

```questdb-sql
EXIT SERVICE ACCOUNT audit;
```
