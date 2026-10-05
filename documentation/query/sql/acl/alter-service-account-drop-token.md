---
title: ALTER SERVICE ACCOUNT DROP TOKEN reference
sidebar_label: DROP TOKEN
description:
  "ALTER SERVICE ACCOUNT DROP TOKEN removes a JWK or one or all REST API tokens
  from a service account. Applies to RBAC in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER SERVICE ACCOUNT ... DROP TOKEN` removes a JSON Web Key or a REST API
token from a service account.

---

## Syntax

```questdb-sql
ALTER SERVICE ACCOUNT serviceAccountName DROP TOKEN TYPE
    { JWK | REST [token] };
```

## Description

- `ALTER SERVICE ACCOUNT serviceAccountName DROP TOKEN TYPE JWK` removes the JSON
  Web Key from the service account.
- `ALTER SERVICE ACCOUNT serviceAccountName DROP TOKEN TYPE REST token` removes
  that REST token from the service account.
- `ALTER SERVICE ACCOUNT serviceAccountName DROP TOKEN TYPE REST` with no token
  removes **all** of the service account's REST tokens.

## Examples

```questdb-sql title="Remove the JSON Web Key"
ALTER SERVICE ACCOUNT client_app DROP TOKEN TYPE JWK;
```

```questdb-sql title="Remove REST API tokens"
-- drop a single REST API token
ALTER SERVICE ACCOUNT client_app DROP TOKEN TYPE REST 'qt1cNK6s2t79f76GmTBN9k7XTWm5wwOtF7C0UBxiHGPn44';
-- drop all REST API tokens for the given service account
ALTER SERVICE ACCOUNT client_app DROP TOKEN TYPE REST;
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

- [CREATE TOKEN](/docs/query/sql/acl/alter-service-account-create-token/)
