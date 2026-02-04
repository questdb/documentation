---
title: ASSUME SERVICE ACCOUNT reference
sidebar_label: ASSUME SERVICE ACCOUNT
description:
  "ASSUME SERVICE ACCOUNT SQL keywords reference documentation.  Applies to RBAC
  in QuestDB Enterprise"
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ASSUME SERVICE ACCOUNT` switches current user to a service account, basically
replacing its current access list with the service account's access list.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

---

## Syntax

![Flow chart showing the syntax of the ASSUME SERVICE ACCOUNT keyword](/images/docs/diagrams/assumeServiceAccount.svg)

## Examples

```questdb-sql
ASSUME SERVICE ACCOUNT ilp_ingestion;
```
