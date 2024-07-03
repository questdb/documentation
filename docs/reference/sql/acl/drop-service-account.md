---
title: DROP SERVICE ACCOUNT reference
sidebar_label: DROP SERVICE ACCOUNT
description:
  "DROP SERVICE ACCOUNT SQL keywords reference documentation.  Applies to RBAC
  in QuestDB Enterprise."
---

`DROP SERVICE ACCOUNT` - drop an existing service account

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the DROP SERVICE ACCOUNT keyword](/img/docs/diagrams/dropServiceAccount.svg)

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
