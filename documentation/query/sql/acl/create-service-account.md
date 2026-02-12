---
title: CREATE SERVICE ACCOUNT reference
sidebar_label: CREATE SERVICE ACCOUNT
description:
  "CREATE SERVICE ACCOUNT SQL keywords reference documentation.  Applies to RBAC
  in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

To create a new service account in the database, the `CREATE SERVICE ACCOUNT`
keywords are used.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

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
[endpoint permissions](/docs/security/rbac/#endpoint-permissions) have been
granted.

The user creating the service account automatically receives the
`ASSUME SERVICE ACCOUNT` permission with `GRANT` option, unless the `OWNED BY`
clause is present, in which case the permission is granted to the user or
group specified in the clause.

The `OWNED BY` clause cannot be omitted if the service account is created by
an external user, because permissions cannot be granted to them.

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
