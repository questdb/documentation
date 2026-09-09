---
title: ALTER USER reference
sidebar_label: ALTER USER
description:
  "ALTER USER enables or disables a user, manages passwords and tokens, and sets
  a per-user query memory limit. Applies to RBAC in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER USER` modifies user settings.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

---

## Syntax

```questdb-sql title="Enable / disable"
ALTER USER userName { ENABLE | DISABLE };
```

```questdb-sql title="Set or remove password"
ALTER USER userName WITH { PASSWORD password | NO PASSWORD };
```

```questdb-sql title="Create token"
ALTER USER userName CREATE TOKEN TYPE
    { JWK | REST WITH TTL timeUnit [REFRESH] };
```

```questdb-sql title="Drop token"
ALTER USER userName DROP TOKEN TYPE
    { JWK | REST [token] };
```

```questdb-sql title="Set or clear memory limit"
ALTER USER userName SET MEMORY LIMIT { size | UNLIMITED };
```

## Description

- `ALTER USER username ENABLE` - enables user account.
- `ALTER USER username DISABLE` - disables user account.
- `ALTER USER username WITH PASSWORD password` - sets password for the user
  account.
- `ALTER USER username WITH NO PASSWORD` - removes password for the user
  account.
- `ALTER USER username CREATE TOKEN TYPE JWK` - adds Json Web Key to user
  account. Returns public key (x, y) and private key. The private key is not
  stored in QuestDB.
- `ALTER USER username DROP TOKEN TYPE JWK` - removes Json Web Key from user
  account.
- `ALTER USER username CREATE TOKEN TYPE REST WITH TTL timeUnit REFRESH` - adds
  REST token to user account.
- `ALTER USER username DROP TOKEN TYPE REST token` - removes REST token from
  user account.
- `ALTER USER username SET MEMORY LIMIT size` - caps the native memory each of
  the user's queries may allocate. `size` is a byte count or a size with a `K`,
  `M`, or `G` suffix, such as `512M` or `2G`.
- `ALTER USER username SET MEMORY LIMIT UNLIMITED` - clears the user's own
  limit. A group limit or the workload limit (`cairo.query.memory.limit.bytes`)
  then applies. `SET MEMORY LIMIT 0` does the same.

The limit applies to the user's queries on both the primary and replicas.
Setting it requires the `SET MEMORY LIMIT` permission. The built-in admin and
external (SSO/OIDC) users cannot be given a limit; the statement is rejected for
both. An external user inherits a limit from its groups instead. A set limit
takes priority over the user's groups and over the
[`cairo.query.memory.limit.bytes`](/docs/configuration/cairo-engine/#cairoquerymemorylimitbytes)
workload limit; see [memory limits](/docs/security/rbac/#memory-limits) for how
limits resolve.

## Examples

### Enable user

```questdb-sql
ALTER USER john ENABLE;
```

### Disable user

```questdb-sql
ALTER USER john DISABLE;
```

### Set password

```questdb-sql
ALTER USER john WITH PASSWORD '1m@re@lh@cker';
```

### Remove password

```questdb-sql
ALTER USER john WITH NO PASSWORD;
```

Removing user's password is not possible with `WITH PASSWORD ''` because it
rejects empty passwords.

### Add Json Web Key

```questdb-sql
ALTER USER john CREATE TOKEN TYPE JWK;
```

### Remove Json Web Key

```questdb-sql
ALTER USER john DROP TOKEN TYPE JWK;
```

Result of commands above can be verified with `SHOW USER`, e.g.

```questdb-sql
SHOW USER john;
```

| auth_type  | enabled |
| ---------- | ------- |
| Password   | true    |
| JWK Token  | false   |
| REST Token | false   |

### Add REST API token

```questdb-sql
-- generate a token with no TTL refresh
ALTER USER john CREATE TOKEN TYPE REST WITH TTL '1m';
-- generate a token with TTL refresh
ALTER USER john CREATE TOKEN TYPE REST WITH TTL '1m' REFRESH;
```

Here, the TTL (Time-to-Live) value should contain an integer and a unit, e.g.
`1m`. The supported units are:

- `s` - second
- `m` - minute
- `h` - hour
- `d` - day

The minimal allowed TTL value is 1 minute, the maximum value is 10 years (10 \*
365 days).

The REFRESH modifier is optional. When the REFRESH modifier is specified, the
token's expiration timestamp will be refreshed on each successful
authentication.

:::note

When replication is used, the token will not be refreshed on successful
authentication on replicas, but only on the primary node. This makes tokens with
the REFRESH modifier meaningful for use on the primary node only.

:::

### Remove REST API token

```questdb-sql
-- drop single REST API token
ALTER USER john DROP TOKEN TYPE REST 'qt1cNK6s2t79f76GmTBN9k7XTWm5wwOtF7C0UBxiHGPn44';
-- drop all REST API tokens for the given user
ALTER USER john DROP TOKEN TYPE REST;
```

Result of commands above can be verified with `SHOW USER`, e.g.

```questdb-sql
SHOW USER john;
```

| auth_type  | enabled |
| ---------- | ------- |
| Password   | true    |
| JWK Token  | false   |
| REST Token | false   |

### Set memory limit

```questdb-sql
-- cap the user's queries at 512 MiB of native memory
ALTER USER john SET MEMORY LIMIT 512M;
-- remove the limit
ALTER USER john SET MEMORY LIMIT UNLIMITED;
```

Use [`SHOW USERS`](/docs/query/sql/show/#show-users) to inspect the user's own
or inherited group limit in the `memory_limit` column.
