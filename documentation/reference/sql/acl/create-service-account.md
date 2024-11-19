---
title: CREATE SERVICE ACCOUNT reference
sidebar_label: CREATE SERVICE ACCOUNT
description:
  "CREATE SERVICE ACCOUNT SQL keywords reference documentation.  Applies to RBAC
  in QuestDB Enterprise."
---

To create a new service account in the database, the `CREATE SERVICE ACCOUNT`
keywords are used.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the CREATE SERVICE ACCOUNT keyword](/images/docs/diagrams/createServiceAccount.svg)

## Description

`CREATE SERVICE ACCOUNT` adds a new service account with no permissions.

The chosen name must be unique across all users (including the built-in admin),
groups and service accounts. If the name has already been reserved, the command
fails and an error is raised, unless the `IF NOT EXISTS` clause is included in
the statement.

Note that new service accounts can only access the database if the necessary
[endpoint permissions](/docs/operations/rbac/#endpoint-permissions) have been
granted.

The user creating the service account automatically receives the
`ASSUME SERVICE ACCOUNT` permission, unless the `OWNED BY` clause is present, in
which case the permission is granted to the user or group specified in the
clause.

## Examples

```questdb-sql
CREATE SERVICE ACCOUNT audit;

CREATE SERVICE ACCOUNT IF NOT EXISTS audit;
```

```
CREATE GROUP analysts;
CREATE SERVICE ACCOUNT dashboard OWNED BY analysts;

```

It can be verified with:

```questdb-sql
SHOW SERVICE ACCOUNT audit;
```

that yields:

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | false   |
| REST Token | false   |
