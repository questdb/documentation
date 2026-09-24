---
title: ALTER USER WITH NO PASSWORD reference
sidebar_label: WITH NO PASSWORD
description:
  "ALTER USER WITH NO PASSWORD removes a user's password. Applies to RBAC in
  QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER USER ... WITH NO PASSWORD` removes a user's password.

---

## Syntax

```questdb-sql
ALTER USER userName WITH NO PASSWORD;
```

## Description

This is the only way to clear a password. `WITH PASSWORD ''` does not work,
because empty passwords are rejected.

Removing the password does not disable the user. If it still holds a JWK or REST
token it can continue to authenticate with that; to stop access entirely, use
[`DISABLE`](/docs/query/sql/acl/alter-user-disable/) or drop its tokens with
[`DROP TOKEN`](/docs/query/sql/acl/alter-user-drop-token/).

## Examples

```questdb-sql
ALTER USER john WITH NO PASSWORD;
```

Verify with:

```questdb-sql
SHOW USER john;
```

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | false   |
| REST Token | false   |

## See also

- [ALTER USER WITH PASSWORD](/docs/query/sql/acl/alter-user-with-password/)
- [ALTER USER DISABLE](/docs/query/sql/acl/alter-user-disable/)
