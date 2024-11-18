---
title: ASSUME SERVICE ACCOUNT reference
sidebar_label: ASSUME SERVICE ACCOUNT
description:
  "ASSUME SERVICE ACCOUNT SQL keywords reference documentation.  Applies to RBAC
  in QuestDB Enterprise"
---

`ASSUME SERVICE ACCOUNT` switches current user to a service account, basically
replacing its current access list with the service account's access list.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the ASSUME SERVICE ACCOUNT keyword](/images/docs/diagrams/assumeServiceAccount.svg)

## Examples

```questdb-sql
ASSUME SERVICE ACCOUNT ilp_ingestion;
```
