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

`CREATE SERVICE ACCOUNT` creates an identity for an application or a set of
permissions that users can assume without sharing credentials.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

---

## Syntax

```questdb-sql
CREATE SERVICE ACCOUNT [IF NOT EXISTS] accountName [OWNED BY ownerName];
```

## Description

`CREATE SERVICE ACCOUNT` adds a new service account with no permissions.

`CREATE SERVICE ACCOUNT` cannot set a memory limit. To cap the native memory
each of the service account's queries may allocate, use
[`ALTER SERVICE ACCOUNT ... SET MEMORY LIMIT`](/docs/query/sql/acl/alter-service-account-set-memory-limit/)
after creating it. Service accounts do not inherit group limits.

The chosen name must be unique across all users (including the built-in admin),
groups and service accounts. `IF NOT EXISTS` leaves an existing service account
unchanged: it does not assign it to the caller or to the principal named in
`OWNED BY`, change its credentials, or create an
[ACL audit row](/docs/security/acl-audit-log/). A name held by a user or group
still fails.

Note that new service accounts can only access the database if the necessary
[endpoint permissions](/docs/security/rbac/#endpoint-permissions) have been
granted.

When the statement creates a new account, the creating user automatically
receives the `ASSUME SERVICE ACCOUNT` permission with `GRANT` option, unless the
`OWNED BY` clause is present, in which case the permission is granted to the
user or group specified in the clause. To assign an existing account, use
[`GRANT ASSUME SERVICE ACCOUNT`](/docs/query/sql/acl/grant-assume-service-account/)
explicitly.

The owner must be eligible to hold a service account. For example, a service
account cannot own another service account. Owner validation runs even with
`IF NOT EXISTS`, before any changes are made.

The `OWNED BY` clause cannot be omitted if the service account is created by an
external user, because permissions cannot be granted to them.

## Examples

```questdb-sql title="Create a service account without credentials"
CREATE SERVICE ACCOUNT risk_report;

CREATE SERVICE ACCOUNT IF NOT EXISTS risk_report;
```

The second statement leaves the existing account unchanged.

```questdb-sql title="Create an account owned by a group"
CREATE GROUP analysts;
CREATE SERVICE ACCOUNT dashboard OWNED BY analysts;
```

```questdb-sql title="Assign an existing account explicitly"
GRANT ASSUME SERVICE ACCOUNT risk_report TO analysts WITH GRANT OPTION;
```

Check the authentication methods:

```questdb-sql title="Inspect the new account's authentication methods"
SHOW SERVICE ACCOUNT risk_report;
```

The account has no credentials yet:

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | false   |
| REST Token | false   |
