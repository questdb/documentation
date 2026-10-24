---
title: ALTER SERVICE ACCOUNT WITH NO PASSWORD reference
sidebar_label: WITH NO PASSWORD
description:
  "ALTER SERVICE ACCOUNT WITH NO PASSWORD removes a service account's password.
  Applies to RBAC in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER SERVICE ACCOUNT ... WITH NO PASSWORD` removes a service account's
password.

---

## Syntax

```questdb-sql
ALTER SERVICE ACCOUNT serviceAccountName WITH NO PASSWORD;
```

## Description

This is the only way to clear a password. `WITH PASSWORD ''` does not work,
because empty passwords are rejected.

Removing the password does not disable the account. If it still holds a JWK or
REST token it can continue to authenticate with that; to stop access entirely,
use [`DISABLE`](/docs/query/sql/acl/alter-service-account-disable/) or drop its
tokens with
[`DROP TOKEN`](/docs/query/sql/acl/alter-service-account-drop-token/).

## Examples

```questdb-sql
ALTER SERVICE ACCOUNT client_app WITH NO PASSWORD;
```

Verify with:

```questdb-sql
SHOW SERVICE ACCOUNT client_app;
```

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | true    |
| REST Token | false   |

## See also

- [ALTER SERVICE ACCOUNT WITH PASSWORD](/docs/query/sql/acl/alter-service-account-with-password/)
- [ALTER SERVICE ACCOUNT DISABLE](/docs/query/sql/acl/alter-service-account-disable/)
