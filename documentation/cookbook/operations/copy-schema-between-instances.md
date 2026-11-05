---
title: Copy a schema to another instance
sidebar_label: Copy schema between instances
description:
  Use SHOW CREATE DATABASE and the REST API to dump a QuestDB schema to a .sql
  file or recreate it directly on another instance.
---

Recreate the structure of one QuestDB instance on another: tables, views,
materialized views, and live views, with the option to copy access control on
QuestDB Enterprise.

## Problem

You want to copy the schema from one QuestDB instance to another.

## Solution

[`SHOW CREATE DATABASE INCLUDE (SCHEMA)`](/docs/query/sql/show/#show-create-database)
returns a data-free schema dump, with one replayable DDL statement per row. The
explicit category keeps this recipe schema-only on both editions:

```questdb-sql title="Dump the database schema" demo
SHOW CREATE DATABASE INCLUDE (SCHEMA);
```

Statements come back in dependency order. Replay them top to bottom on an empty
instance to recreate the schema.

On QuestDB Enterprise, the dump contains only the objects the caller
[can see](/docs/security/rbac/#object-visibility). To copy the whole schema,
run it as the built-in admin or as a user holding `DATABASE ADMIN`.

### Get the dump as JSON

Running the statement through the
[REST API](/docs/connect/compatibility/rest-api/#execute) gives you the same
result set as JSON, with the statements under `.dataset[][0]`:

```shell
curl -s -G "https://demo.questdb.io/api/v1/sql/execute" \
  --data-urlencode "query=SHOW CREATE DATABASE INCLUDE (SCHEMA)"
```

From there you can either save the statements to a file or apply them straight
to the target instance.

### Write the statements to a .sql file

```shell
curl -s -G "https://demo.questdb.io/api/v1/sql/execute" \
  --data-urlencode "query=SHOW CREATE DATABASE INCLUDE (SCHEMA)" \
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
  --data-urlencode "query=SHOW CREATE DATABASE INCLUDE (SCHEMA)" \
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
  --data-urlencode "query=SHOW CREATE DATABASE INCLUDE (SCHEMA)"
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

# Identities, memberships, and grants; no schema
curl -s -G "https://source:9000/api/v1/sql/execute" \
  -H "Authorization: Bearer $QDB_TOKEN" \
  --data-urlencode "query=SHOW CREATE DATABASE INCLUDE (ACL)"
```

Every selection that includes an ACL category, including plain
`SHOW CREATE DATABASE`, requires both `LIST USERS` and `USER DETAILS`. Missing
either permission aborts the dump. `INCLUDE (SCHEMA)` requires neither, so a
user with only `SELECT` can still dump the structure of the objects they can see.
Active table storage policies are included in the schema.

To copy access control too, use plain `SHOW CREATE DATABASE` in the commands
above. It creates principals first, schema objects next, then memberships,
service account assignments, and grants. Replay on an empty target as its
built-in admin to avoid adding another principal's creator grants. Schema-only
and per-object dumps contain neither grants nor `OWNED BY`.

Before opening the target to users, set credentials and reapply memory limits,
resource groups, and resource group mappings: none are dumped. Only the external
alias shown by `SHOW GROUPS` is restored for each group. Avoid concurrent schema
and ACL changes during the export; the dump is best-effort, not a consistent
snapshot. See [Replay limits](/docs/query/sql/show/#replay-limits).

## Manual alternative: copy from the Web Console

For a one-off copy, or when you only want a few objects, the
[schema explorer toolbar](/docs/getting-started/web-console/schema-explorer/#toolbar)
puts the DDL on your clipboard with no scripting:

1. Click **Select Mode**, the checkbox circle icon in the toolbar.
2. Click **Select all**, the circle icon, or tick individual objects.
3. Click **Copy schemas to clipboard**.

Paste the result into an editor, or straight into the target's Web Console and
run it. Selection mode exits once the copy succeeds.

:::warning Reorder chained materialized views first

The Web Console groups the copied statements by object type and sorts them
alphabetically within each group, not in dependency order. Tables always precede
materialized views, but a materialized view built on another materialized view
can be emitted before its own base.

:::

:::info Related documentation

- [`SHOW CREATE DATABASE`](/docs/query/sql/show/#show-create-database)
- [REST API `/execute`](/docs/connect/compatibility/rest-api/#execute)
- [Schema explorer](/docs/getting-started/web-console/schema-explorer/)
- [Copy data between instances](/docs/cookbook/operations/copy-data-between-instances/)
- [Backup and restore](/docs/operations/backup/)

:::
