---
title: Copy a schema to another instance
sidebar_label: Copy schema between instances
description:
  Use SHOW CREATE DATABASE and the REST API to dump a QuestDB schema to a .sql
  file or recreate it directly on another instance.
---

Recreate the structure of one QuestDB instance on another: tables, views,
materialized views, and, on QuestDB Enterprise, the access control layer.

## Problem

You want to copy the schema from one QuestDB instance to another.

## Solution

[`SHOW CREATE DATABASE`](/docs/query/sql/show/#show-create-database) returns a
data-free dump of the whole database, with one round-trippable DDL statement per
row:

```questdb-sql title="Dump the database schema" demo
SHOW CREATE DATABASE;
```

Statements come back in dependency order, so replaying them top to bottom on an
empty instance recreates the database.

### Get the dump as JSON

Running the statement through the
[REST API](/docs/connect/compatibility/rest-api/#execute) gives you the same
result set as JSON, with the statements under `.dataset[][0]`:

```shell
curl -s -G "https://demo.questdb.io/api/v1/sql/execute" \
  --data-urlencode "query=SHOW CREATE DATABASE"
```

From there you can either save the statements to a file or apply them straight
to the target instance.

### Write the statements to a .sql file

```shell
curl -s -G "https://demo.questdb.io/api/v1/sql/execute" \
  --data-urlencode "query=SHOW CREATE DATABASE" \
| jq -r '.dataset[][0] | sub(";?$";";") + "\n"' > schema.sql
```

This keeps QuestDB's original multi-line formatting. `sub(";?$";";")` anchors to
the end of the whole string, not to each line, so it guarantees exactly one
trailing semicolon per statement without touching the intermediate lines.
Appending `"\n"` separates consecutive statements with a blank line.

### Apply directly to the target instance

Send each statement to the target's `/execute` endpoint as you read it:

```shell
curl -s -G "https://demo.questdb.io/api/v1/sql/execute" \
  --data-urlencode "query=SHOW CREATE DATABASE" \
| jq --raw-output0 '.dataset[][0]' \
| xargs -0 -n1 sh -c \
    'curl -sG "http://localhost:9000/api/v1/sql/execute" \
       --data-urlencode "query=$1"; echo' _
```

Statements are sent one at a time on purpose. `/execute` is a `GET` endpoint, so
a whole schema sent as a single request would very likely exceed the maximum
request size the target accepts.

`--raw-output0` emits NUL-separated values rather than newline-separated ones,
which matters because each statement is itself multi-line. `xargs -0 -n1` then
hands one whole statement to each `sh -c` invocation, and the trailing `_` fills
in `$0` so the statement lands in `$1`.

Each response is printed on its own line. A statement that succeeds returns
`{"ddl":"OK"}`; one that fails returns HTTP 400 and an `error` field, for
example `{"query":"...","error":"table already exists","position":13}`.

:::note

`--raw-output0` requires jq 1.7 or later.

:::

If either instance requires authentication, pass the credentials on the
corresponding `curl` call. QuestDB open source supports
[HTTP basic authentication](/docs/connect/compatibility/rest-api/#http-basic-authentication)
only, so use `-u user:password`. On
[QuestDB Enterprise](/enterprise/), prefer a
[REST API token](/docs/connect/compatibility/rest-api/#authentication-via-token-in-questdb-enterprise)
over basic authentication, since it can be scoped, given an expiry, and revoked
on its own. Read it from an environment variable rather than pasting it into the
command, so it stays out of your shell history:

```shell
export QDB_TOKEN="your-rest-api-token"

curl -s -G "https://source:9000/api/v1/sql/execute" \
  -H "Authorization: Bearer $QDB_TOKEN" \
  --data-urlencode "query=SHOW CREATE DATABASE"
```

## Enterprise: schema without permissions

In [QuestDB Enterprise](/enterprise/), the default dump also carries the access
control layer: users, groups, service accounts, memberships, and grants. That is
usually not what you want when seeding a development instance from production.

Select what to copy with `INCLUDE`:

```shell
# Structure only, no users or permissions
curl -s -G "https://source:9000/api/v1/sql/execute" \
  -H "Authorization: Bearer $QDB_TOKEN" \
  --data-urlencode "query=SHOW CREATE DATABASE INCLUDE (SCHEMA)"

# Permissions only, no tables or views
curl -s -G "https://source:9000/api/v1/sql/execute" \
  -H "Authorization: Bearer $QDB_TOKEN" \
  --data-urlencode "query=SHOW CREATE DATABASE INCLUDE (ACL)"
```

The ACL categories each require the matching `LIST` or `USER DETAILS`
permission, while the schema categories need none, so a user with only `SELECT`
can still dump the structure.

Passwords and tokens are never dumped, so `CREATE USER` and
`CREATE SERVICE ACCOUNT` statements replay without credentials. Set those on the
target after the replay.

:::info Related documentation

- [`SHOW CREATE DATABASE`](/docs/query/sql/show/#show-create-database)
- [REST API `/execute`](/docs/connect/compatibility/rest-api/#execute)
- [Copy data between instances](/docs/cookbook/operations/copy-data-between-instances/)
- [Backup and restore](/docs/operations/backup/)

:::
