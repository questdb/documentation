---
title: REVOKE ASSUME SERVICE ACCOUNT reference
sidebar_label: REVOKE ASSUME SERVICE ACCOUNT
description:
  "REVOKE ASSUME SERVICE ACCOUNT SQL keywords reference documentation. Applies
  to RBAC in QuestDB Enterprise."
---

`REVOKE ASSUME SERVICE ACCOUNT` - revokes a service account from a user or a
group.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the REVOKE ASSUME SERVICE ACCOUNT keyword](/images/docs/diagrams/revokeAssumeServiceAccount.svg)

## Description

- `REVOKE ASSUME SERVICE ACCOUNT serviceAccount FROM userOrGroup` - revokes a
  service account from a user or a group

When a service account is revoked from a user, the user no no longer assume the
service account.

## Examples

### Revoke a service account from a user

```questdb-sql
GRANT ASSUME SERVICE ACCOUNT ingestion TO john WITH GRANT OPTION;
```

| name      | grant_option |
| --------- | ------------ |
| ingestion | t            |

```questdb-sql
REVOKE ASSUME SERVICE ACCOUNT ingestion FROM john;
```

| name | grant_option |
| ---- | ------------ |
|      |              |
