---
title: ALTER USER WITH PASSWORD reference
sidebar_label: WITH PASSWORD
description:
  "ALTER USER WITH PASSWORD sets a user's password. Applies to RBAC in QuestDB
  Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER USER ... WITH PASSWORD` sets a user's password.

---

## Syntax

```questdb-sql
ALTER USER userName WITH PASSWORD password;
```

## Description

Setting a password replaces any existing one. Empty passwords are rejected, so
`WITH PASSWORD ''` cannot be used to clear one; use
[`WITH NO PASSWORD`](/docs/query/sql/acl/alter-user-with-no-password/) instead.

## Examples

```questdb-sql
ALTER USER john WITH PASSWORD '1m@re@lh@cker';
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

- [ALTER USER WITH NO PASSWORD](/docs/query/sql/acl/alter-user-with-no-password/)
- [CREATE USER](/docs/query/sql/acl/create-user/)
