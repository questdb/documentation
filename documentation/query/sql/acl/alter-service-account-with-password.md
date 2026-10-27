---
title: ALTER SERVICE ACCOUNT WITH PASSWORD reference
sidebar_label: WITH PASSWORD
description:
  "ALTER SERVICE ACCOUNT WITH PASSWORD sets a service account's password.
  Applies to RBAC in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER SERVICE ACCOUNT ... WITH PASSWORD` sets a service account's password.

---

## Syntax

```questdb-sql
ALTER SERVICE ACCOUNT serviceAccountName WITH PASSWORD password;
```

## Description

Setting a password replaces any existing one. Empty passwords are rejected, so
`WITH PASSWORD ''` cannot be used to clear one; use
[`WITH NO PASSWORD`](/docs/query/sql/acl/alter-service-account-with-no-password/)
instead.

## Examples

```questdb-sql
ALTER SERVICE ACCOUNT client_app WITH PASSWORD '1m@re@lh@cker';
```

Verify with:

```questdb-sql
SHOW SERVICE ACCOUNT client_app;
```

| auth_type  | enabled |
| ---------- | ------- |
| Password   | true    |
| JWK Token  | false   |
| REST Token | false   |

## See also

- [ALTER SERVICE ACCOUNT WITH NO PASSWORD](/docs/query/sql/acl/alter-service-account-with-no-password/)
- [CREATE SERVICE ACCOUNT](/docs/query/sql/acl/create-service-account/)
