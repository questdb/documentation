---
title: GRANT ASSUME SERVICE ACCOUNT reference
sidebar_label: GRANT ASSUME SERVICE ACCOUNT
description:
  "GRANT ASSUME SERVICE ACCOUNT SQL keywords reference documentation.  Applies
  to RBAC in QuestDB Enterprise."
---

`GRANT ASSUME SERVICE ACCOUNT` - assigns a service account to a user or a group.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the GRANT ASSUME SERVICE ACCOUNT keyword](/img/docs/diagrams/grantAssumeServiceAccount.svg)

## Description

- `GRANT ASSUME SERVICE ACCOUNT serviceAccount TO userOrGroup` - assigns a
  service account to a user or a group
- `GRANT ASSUME SERVICE ACCOUNT serviceAccount TO userOrGroup WITH GRANT OPTION` -
  assigns a service account to a user or a group with grant option

When a service account is assigned to a user, the user can assume the service
account. Assuming the service account means that the user can switch its own
access list to the access list of the service account. When a service account is
assigned to a group, all users of the group get the permission to assume the
service account.

If the service account is assigned `WITH GRANT OPTION`, then the assuming
user(s) are then permitted to grant service account assumption to other users or
groups.

## Examples

`GRANT ASSUME SERVICE ACCOUNT` command itself does not return any result, thus
the effects of running SQL commands that follow are shown with
`SHOW SERVICE ACCOUNTS john`.

### Assign a service account to a user

```questdb-sql
GRANT ASSUME SERVICE ACCOUNT ingestion TO john;
```

| name      | grant_option |
| --------- | ------------ |
| ingestion | false        |

### Assign a service account to a user with grant option

```questdb-sql
GRANT ASSUME SERVICE ACCOUNT ingestion TO john WITH GRANT OPTION;
```

| name      | grant_option |
| --------- | ------------ |
| ingestion | true         |

### Removing grant option

```questdb-sql
GRANT ASSUME SERVICE ACCOUNT ingestion TO john WITH GRANT OPTION;
GRANT ASSUME SERVICE ACCOUNT ingestion TO john;
```

| name      | grant_option |
| --------- | ------------ |
| ingestion | false        |

### Owner grants

The user who creates a service account will be able to assume as the service
account right after it is created. It will also provide `WITH GRANT OPTION` so
that the user can then provide the service account action to others.

FFor example, if user `john` has permission to create service accounts, and
creates one called `ingestion`:

```questdb-sql
CREATE SERVICE ACCOUNT ingestion;
SHOW SERVICE ACCOUNTS john;
```

| name      | grant_option |
| --------- | ------------ |
| ingestion | true         |
