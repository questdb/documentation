---
title: ALTER USER CREATE TOKEN reference
sidebar_label: CREATE TOKEN
description:
  "ALTER USER CREATE TOKEN adds a JWK or REST API token to a user account, with
  an optional TTL and REFRESH. Applies to RBAC in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER USER ... CREATE TOKEN` adds a JSON Web Key or a REST API token to a user
account.

---

## Syntax

```questdb-sql
ALTER USER userName CREATE TOKEN TYPE
    { JWK | REST WITH TTL timeUnit [REFRESH] };
```

## Description

- `ALTER USER username CREATE TOKEN TYPE JWK` adds a JSON Web Key to the user
  account. It returns the public key (x, y) and the private key. **The private
  key is not stored in QuestDB**, so capture it when it is returned.
- `ALTER USER username CREATE TOKEN TYPE REST WITH TTL timeUnit [REFRESH]` adds a
  REST API token to the user account.

### TTL and REFRESH

The TTL value is an integer and a unit, such as `1m`. The supported units are:

- `s` for second
- `m` for minute
- `h` for hour
- `d` for day

The minimum allowed TTL is 1 minute and the maximum is 10 years (10 \* 365
days).

`REFRESH` is optional. When specified, the token's expiration timestamp is
refreshed on each successful authentication.

:::note

When replication is used, the token is not refreshed on successful
authentication on replicas, only on the primary node. This makes tokens with the
`REFRESH` modifier meaningful for use on the primary node only.

:::

## Examples

```questdb-sql title="Add a JSON Web Key"
ALTER USER john CREATE TOKEN TYPE JWK;
```

```questdb-sql title="Add a REST API token"
-- generate a token with no TTL refresh
ALTER USER john CREATE TOKEN TYPE REST WITH TTL '1m';
-- generate a token with TTL refresh
ALTER USER john CREATE TOKEN TYPE REST WITH TTL '1m' REFRESH;
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

- [DROP TOKEN](/docs/query/sql/acl/alter-user-drop-token/)
