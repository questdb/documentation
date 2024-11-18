---
title: ALTER SERVICE ACCOUNT reference
sidebar_label: ALTER SERVICE ACCOUNT
description:
  "ALTER SERVICE ACCOUNT SQL keywords reference documentation.  Applies to RBAC
  in QuestDB Enterprise."
---

`ALTER SERVICE ACCOUNT` modifies service account settings.

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/operations/rbac) page.

:::note

Role-based Access Control (RBAC) operations are only available in QuestDB
Enterprise.

:::

---

## Syntax

![Flow chart showing the syntax of the ALTER SERVICE ACCOUNT keyword](/images/docs/diagrams/alterServiceAccount.svg)

## Description

- `ALTER SERVICE ACCOUNT serviceAccountName ENABLE` - enables service account.
- `ALTER SERVICE ACCOUNT serviceAccountName DISABLE` - disables service account.
- `ALTER SERVICE ACCOUNT serviceAccountName WITH PASSWORD password` - sets
  password for the service account.
- `ALTER SERVICE ACCOUNT serviceAccountName WITH NO PASSWORD` - removes password
  for the service account.
- `ALTER SERVICE ACCOUNT serviceAccountName CREATE TOKEN TYPE JWK` - adds Json
  Web Key to the service account. Returns public key (x, y) and private key. The
  private key is not stored in QuestDB.
- `ALTER SERVICE ACCOUNT serviceAccountName DROP TOKEN TYPE JWK` - removes Json
  Web Key from the service account.
- `ALTER USER serviceAccountName CREATE TOKEN TYPE REST WITH TTL timeUnit REFRESH` -
  adds REST token to the service account.
- `ALTER USER serviceAccountName DROP TOKEN TYPE REST token` - removes REST
  token from the service account.

## Examples

### Enable service account

```questdb-sql
ALTER SERVICE ACCOUNT client_app ENABLE;
```

### Disable service account

```questdb-sql
ALTER SERVICE ACCOUNT client_app DISABLE;
```

### Set password

```questdb-sql
ALTER SERVICE ACCOUNT client_app WITH PASSWORD '1m@re@lh@cker';
```

### Remove password

```questdb-sql
ALTER SERVICE ACCOUNT client_app WITH NO PASSWORD;
```

Removing a password is not possible using `WITH PASSWORD ''` as the database
will reject empty passwords.

### Add Json Web Key

```questdb-sql
ALTER SERVICE ACCOUNT client_app CREATE TOKEN TYPE JWK;
```

### Remove Json Web Key

```questdb-sql
ALTER SERVICE ACCOUNT client_app DROP TOKEN TYPE JWK;
```

Result of commands above can be verified with `SHOW USER`, e.g.

```questdb-sql
SHOW SERVICE ACCOUNT client_app;
```

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | true    |
| REST Token | false   |

### Add REST API token

```questdb-sql
-- generate a token with no TTL refresh
ALTER SERVICE ACCOUNT client_app CREATE TOKEN TYPE REST WITH TTL '1m';
-- generate a token with TTL refresh
ALTER SERVICE ACCOUNT client_app CREATE TOKEN TYPE REST WITH TTL '1m' REFRESH;
```

Here, the TTL (Time-to-Live) value should contain an integer and a unit, such as
`1m`. The supported units are:

- `s` - second
- `m` - minute
- `h` - hour
- `d` - day

The minimum allowable TTL value is 1 minute and the maximum value is 10 years
(10 \* 365 days).

The `REFRESH` modifier is optional. When the `REFRESH` modifier is specified,
the token's expiration timestamp will be refreshed on each successful
authentication.

#### Rest API tokens and database replication

Many [QuestDB Enterprise](/enterprise/) instances run within active
[database replication](/docs/operations/replication/) clusters. With replication
enabled, the REST API token will be refreshed on successful authentication to
the **primary** node. The token will **not** be refreshed during successful
authentications to **replica** nodes.

Therefore, tokens with the `REFRESH` modifier are for use only on the
**primary** node.

### Remove REST API token

```questdb-sql
-- drop single REST API token
ALTER SERVICE ACCOUNT client_app DROP TOKEN TYPE REST 'qt1cNK6s2t79f76GmTBN9k7XTWm5wwOtF7C0UBxiHGPn44';
-- drop all REST API tokens for the given service account
ALTER SERVICE ACCOUNT client_app DROP TOKEN TYPE REST;
```

The result of the above commands can be verified with `SHOW SERVICE ACCOUNT`:

```questdb-sql
SHOW SERVICE ACCOUNT client_app;
```

| auth_type  | enabled |
| ---------- | ------- |
| Password   | true    |
| JWK Token  | false   |
| REST Token | false   |
