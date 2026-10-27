---
title: ALTER USER DROP TOKEN reference
sidebar_label: DROP TOKEN
description:
  "ALTER USER DROP TOKEN removes a JWK or one or all REST API tokens from a user
  account. Applies to RBAC in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER USER ... DROP TOKEN` removes a JSON Web Key or a REST API token from a
user account.

---

## Syntax

```questdb-sql
ALTER USER userName DROP TOKEN TYPE
    { JWK | REST [token] };
```

## Description

- `ALTER USER username DROP TOKEN TYPE JWK` removes the JSON Web Key from the
  user account.
- `ALTER USER username DROP TOKEN TYPE REST token` removes that REST token from
  the user account.
- `ALTER USER username DROP TOKEN TYPE REST` with no token removes **all** of the
  user's REST tokens.

## Examples

```questdb-sql title="Remove the JSON Web Key"
ALTER USER john DROP TOKEN TYPE JWK;
```

```questdb-sql title="Remove REST API tokens"
-- drop a single REST API token
ALTER USER john DROP TOKEN TYPE REST 'qt1cNK6s2t79f76GmTBN9k7XTWm5wwOtF7C0UBxiHGPn44';
-- drop all REST API tokens for the given user
ALTER USER john DROP TOKEN TYPE REST;
```

Verify with:

```questdb-sql
SHOW USER john;
```

| auth_type  | enabled |
| ---------- | ------- |
| Password   | true    |
| JWK Token  | false   |
| REST Token | false   |

## See also

- [CREATE TOKEN](/docs/query/sql/acl/alter-user-create-token/)
