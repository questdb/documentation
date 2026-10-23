---
title: ALTER SERVICE ACCOUNT CREATE TOKEN reference
sidebar_label: CREATE TOKEN
description:
  "ALTER SERVICE ACCOUNT CREATE TOKEN adds a JWK or REST API token to a service
  account, with an optional TTL and REFRESH. Applies to QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER SERVICE ACCOUNT ... CREATE TOKEN` adds a JSON Web Key or a REST API token
to a service account.

---

## Syntax

```questdb-sql
ALTER SERVICE ACCOUNT serviceAccountName CREATE TOKEN TYPE
    { JWK | REST WITH TTL timeUnit [REFRESH] };
```

## Description

- `ALTER SERVICE ACCOUNT serviceAccountName CREATE TOKEN TYPE JWK` adds a JSON
  Web Key to the service account. It returns the public key (x, y) and the
  private key. **The private key is not stored in QuestDB**, so capture it when
  it is returned.
- `ALTER SERVICE ACCOUNT serviceAccountName CREATE TOKEN TYPE REST WITH TTL timeUnit [REFRESH]`
  adds a REST API token to the service account.

### TTL and REFRESH

The TTL value is an integer and a unit, such as `1m`. The supported units are:

- `s` for second
- `m` for minute
- `h` for hour
- `d` for day

The minimum allowable TTL value is 1 minute and the maximum is 10 years (10 \*
365 days).

`REFRESH` is optional. When specified, the token's expiration timestamp is
refreshed on each successful authentication.

### REST API tokens and database replication

Many [QuestDB Enterprise](/enterprise/) instances run within active
[database replication](/docs/high-availability/setup/) clusters. With replication
enabled, the REST API token is refreshed on successful authentication to the
**primary** node. The token is **not** refreshed during successful
authentications to **replica** nodes.

Therefore, tokens with the `REFRESH` modifier are for use only on the **primary**
node.

## Examples

```questdb-sql title="Add a JSON Web Key"
ALTER SERVICE ACCOUNT client_app CREATE TOKEN TYPE JWK;
```

```questdb-sql title="Add a REST API token"
-- generate a token with no TTL refresh
ALTER SERVICE ACCOUNT client_app CREATE TOKEN TYPE REST WITH TTL '1m';
-- generate a token with TTL refresh
ALTER SERVICE ACCOUNT client_app CREATE TOKEN TYPE REST WITH TTL '1m' REFRESH;
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

- [DROP TOKEN](/docs/query/sql/acl/alter-service-account-drop-token/)
