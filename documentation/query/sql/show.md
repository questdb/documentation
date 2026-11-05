---
title: SHOW keyword
sidebar_label: SHOW
description:
  SHOW statements for columns, partitions, parameters, and CREATE DDL, plus
  Enterprise users, groups, and service accounts with their memory limits.
---

`SHOW` returns metadata about tables, columns, partitions, and configuration
parameters and, in QuestDB Enterprise, about users, groups, service accounts,
and permissions. It is useful for checking the
[designated timestamp setting](/docs/concepts/designated-timestamp/) column, the
[partition attachment settings](/docs/query/sql/alter-table-attach-partition/),
and partition storage size on disk.

## Syntax

```questdb-sql
SHOW { COLUMNS FROM tableName
     | CREATE DATABASE
         [ { INCLUDE | EXCLUDE } { ALL | (category [, ...]) } ]
     | CREATE LIVE VIEW viewName
     | CREATE MATERIALIZED VIEW matViewName
     | CREATE TABLE tableName
     | CREATE VIEW viewName
     | GROUPS [userName]
     | PARAMETERS
     | PARTITIONS FROM tableName
     | PERMISSIONS [entityName]
     | SERVER_VERSION
     | SERVICE ACCOUNT [accountName]
     | SERVICE ACCOUNTS [{ userName | groupName }]
     | TABLES
     | USER [userName]
     | USERS };
```

## Description

- `SHOW COLUMNS` returns all the columns and their metadata for the selected
  table.
- `SHOW CREATE DATABASE` returns statements to recreate the schema and, on
  Enterprise, access control, one per row in replay order.
- `SHOW CREATE LIVE VIEW` returns a DDL query that allows you to recreate a live
  view.
- `SHOW CREATE MATERIALIZED VIEW` returns a DDL query that allows you to
  recreate a materialized view.
- `SHOW CREATE TABLE` returns a DDL query that allows you to recreate the table.
- `SHOW CREATE VIEW` returns a DDL query that allows you to recreate a view.
- `SHOW GROUPS` lists all groups with their external alias, memory limit and
  resource group mapping, or the groups a user belongs to (enterprise-only)
- `SHOW PARAMETERS` shows configuration keys and their matching `env_var_name`,
  their values and the source of the value
- `SHOW PARTITIONS` returns the partition information for the selected table.
- `SHOW PERMISSIONS` displays permissions of user, group or service account
  (enterprise-only)
- `SHOW SERVER_VERSION` displays PostgreSQL compatibility version
- `SHOW SERVICE ACCOUNT` displays details of a service account (enterprise-only)
- `SHOW SERVICE ACCOUNTS` lists all service accounts with their enabled flag,
  memory limit and resource group, or those a user or group can assume with the
  grant option (enterprise-only)
- `SHOW TABLES` returns all tables, including views, materialized views, and
  live views.
- `SHOW USER` shows user secret (enterprise-only)
- `SHOW USERS` lists all users with their enabled flag, memory limit and
  resource group (enterprise-only)

In QuestDB Enterprise, `SHOW TABLES` and the schema portion of
`SHOW CREATE DATABASE` cover only the objects you
[can see](/docs/security/rbac/#object-visibility). Dumping any access control
category also requires [administrative permissions](#enterprise-access-control).
Statements that name an object, such as `SHOW COLUMNS` or `SHOW CREATE TABLE`,
fail with the missing-object error, for example
`table does not exist [table=trades]`, for an object hidden from you.

## Examples

### SHOW COLUMNS

```questdb-sql title="show columns" demo
SHOW COLUMNS FROM trades;

```

| column    | type      | indexed | indexBlockCapacity | symbolCached | symbolCapacity | symbolTableSize | designated | upsertKey | indexType | indexInclude |
| --------- | --------- | ------- | ------------------ | ------------ | -------------- | --------------- | ---------- | --------- | --------- | ------------ |
| symbol    | SYMBOL    | false   | 0                  | true         | 256            | 42              | false      | false     |           |              |
| side      | SYMBOL    | false   | 0                  | true         | 256            | 2               | false      | false     |           |              |
| price     | DOUBLE    | false   | 0                  | false        | 0              | 0               | false      | false     |           |              |
| amount    | DOUBLE    | false   | 0                  | false        | 0              | 0               | false      | false     |           |              |
| timestamp | TIMESTAMP | false   | 0                  | false        | 0              | 0               | true       | false     |           |              |

The `indexType` column shows the index type (`POSTING`, `POSTING DELTA`,
`POSTING EF`, `BITMAP`, or empty for non-indexed columns). The `indexInclude`
column lists the names of columns included in a
[posting index's](/docs/concepts/deep-dive/posting-index/) covering sidecar, as
a comma-separated string.

### SHOW CREATE DATABASE

`SHOW CREATE DATABASE` returns a logical, data-free dump as replayable SQL:
one statement per row for tables, views, materialized views, and live views.
In QuestDB Enterprise 4.2.0 and later, the dump also includes users, groups,
service accounts, memberships, and grants by default. Use it to copy a database's
structure and access control to an empty instance. It is not a data backup; see
[Replay limits](#replay-limits).

```questdb-sql title="SHOW CREATE DATABASE syntax"
SHOW CREATE DATABASE
    [ { INCLUDE | EXCLUDE } { ALL | (category [, ...]) } ];
```

An optional `INCLUDE` or `EXCLUDE` clause selects which object categories to
dump. Each `category` is one of:

- **Schema objects**: `LIVE_VIEWS`, `MATERIALIZED_VIEWS`, `TABLES`, `VIEWS`.
- **Access control** (Enterprise only): `GROUPS`, `PERMISSIONS`,
  `SERVICE_ACCOUNTS`, `USERS`.
- **Umbrellas**: `ACL` (all access control categories), `ALL` (`SCHEMA` plus
  `ACL`), `SCHEMA` (all schema objects).

`INCLUDE`/`EXCLUDE` accept either `ALL` or a parenthesised list, so
`INCLUDE ALL`, `EXCLUDE (MATERIALIZED_VIEWS)`, and `INCLUDE (TABLES, VIEWS)` are
all valid. With no clause, the statement defaults to `INCLUDE ALL`:

```questdb-sql title="Dump schema and access control"
SHOW CREATE DATABASE;
```

In QuestDB open source, `ALL` and `SCHEMA` produce the same output. On
Enterprise, select `SCHEMA` explicitly to omit access control:

```questdb-sql title="Dump only the database schema" demo
SHOW CREATE DATABASE INCLUDE (SCHEMA);
```

The result set has a single `ddl` column with one self-contained statement per
row. Each value preserves newlines and indentation, as in
[`SHOW CREATE TABLE`](#show-create-table).

For turning the result set into a `.sql` file or replaying it on another server,
see
[Copy a schema to another instance](/docs/cookbook/operations/copy-schema-between-instances/).

#### Output order

A full Enterprise dump has three parts:

1. Users, groups, and service accounts, ordered by name across all three kinds.
   A disabled user or service account has an `ALTER ... DISABLE` statement
   immediately after its `CREATE` statement.
2. Schema objects in dependency order, with alphabetical ordering where
   dependencies allow. A view follows the objects it reads, including other
   views in a chain.
3. Group memberships, service account assignments, and direct grants, grouped
   by principal name. Within each principal's grants, database scope precedes
   table scope, which precedes column scope.

Schema-only dumps contain just the second part. Preserve the returned order
when replaying: a broader grant can clear a narrower grant option, which a
later `WITH GRANT OPTION` statement restores.

#### Filtering by category

Restrict a dump to specific categories with `INCLUDE`, or dump everything except
a few with `EXCLUDE`:

```questdb-sql title="Only tables" demo
SHOW CREATE DATABASE INCLUDE (TABLES);
```

List several categories separated by commas:

```questdb-sql title="Tables and materialized views" demo
SHOW CREATE DATABASE INCLUDE (TABLES, MATERIALIZED_VIEWS);
```

```questdb-sql title="Everything except materialized views" demo
SHOW CREATE DATABASE EXCLUDE (MATERIALIZED_VIEWS);
```

Filtering is applied per category, like `pg_dump -t`. Excluding a category that
others depend on can leave dangling references, so a dump that omits a base
table does not replay cleanly for the views built on it. Similarly,
`INCLUDE (PERMISSIONS)` omits principal creation: those users, groups, and
service accounts must already exist on the target.

To select individual objects, such as the objects of a single tenant, wrap the
statement in parentheses and filter the `ddl` column with `WHERE`. Match names
wherever they appear in the statement:

```questdb-sql title="Schema statements whose DDL mentions fx_" demo
(SHOW CREATE DATABASE INCLUDE (SCHEMA)) WHERE ddl ILIKE '%fx_%';
```

The filtered rows keep dependency order. A pattern also matches views that read
a matching table, so check that every object a filtered dump depends on is
included before replaying it.

#### Enterprise: access control

With access control enabled, selecting any ACL category requires both
`LIST USERS` and `USER DETAILS`, even `INCLUDE (USERS)` or
`INCLUDE (PERMISSIONS)` alone. Missing either permission aborts the whole dump;
it does not return a partial schema-only result.

:::warning Breaking change

Starting with QuestDB Enterprise 4.2.0, plain `SHOW CREATE DATABASE` includes
ACL output and requires both permissions. For callers that only need the visible
schema, change it to `SHOW CREATE DATABASE INCLUDE (SCHEMA)` rather than granting
administrative permissions.

:::

Schema-only categories require neither ACL permission, but still follow
[object visibility](/docs/security/rbac/#object-visibility). To dump the whole
user schema, run as the built-in admin or a principal holding `DATABASE ADMIN`.
These visibility rules do not filter the ACL output: an authorized ACL dump
lists all stored principals and their direct grants, including grants naming
objects hidden from the caller. When access control is disabled, the statement
returns only schema output, without the ACL permission checks.

The `ACL` umbrella selects all four categories:

| Category | Statements included |
| -------- | ------------------- |
| `GROUPS` | `CREATE GROUP`, including the external alias reported by `SHOW GROUPS` |
| `PERMISSIONS` | `ADD USER ... TO ...`, `GRANT ASSUME SERVICE ACCOUNT ... TO ...`, and database-, table-, and column-level `GRANT` statements |
| `SERVICE_ACCOUNTS` | `CREATE SERVICE ACCOUNT`, followed by `ALTER SERVICE ACCOUNT ... DISABLE` when disabled |
| `USERS` | `CREATE USER`, followed by `ALTER USER ... DISABLE` when disabled |

Grants preserve `WITH GRANT OPTION`, including grant options held at a narrower
scope than the permission itself. Only direct grants are emitted. Permissions
and service account assignments inherited from a group are restored through
group membership, not copied into direct user grants.

For example, on an otherwise empty instance, run as the built-in admin:

```questdb-sql title="Create a group-based entitlement to export"
CREATE GROUP fx_readers;
CREATE USER fx_analyst;
ADD USER fx_analyst TO fx_readers;
GRANT SELECT ON ALL TABLES TO fx_readers;

SHOW CREATE DATABASE INCLUDE (ACL);
```

| ddl |
| --- |
| CREATE USER 'fx_analyst'; |
| CREATE GROUP 'fx_readers'; |
| ADD USER 'fx_analyst' TO 'fx_readers'; |
| GRANT SELECT ON ALL TABLES TO 'fx_readers'; |

The built-in admin and external (SSO/OIDC) users are not dumped. External users
continue to get access through their identity provider and the dumped groups'
external aliases.

Database dumps also include active table
[storage policies](#storage-policy-clause). No `SHOW CREATE` statement emits
`OWNED BY`: object permissions are restored through grants, not an owner field.
See [Enterprise variant](#enterprise-variant) for creator permissions during
replay. For an ACL restore, replay on an empty target as its built-in admin to
avoid adding another principal's creator grants.

#### Replay limits

An Enterprise dump omits the following settings. Reapply them on the target
before opening it to users:

- Passwords and tokens. Recreated users and service accounts have no
  credentials until you set them.
- Per-user, group, and service account
  [memory limits](/docs/security/rbac/#memory-limits),
  [resource groups](/docs/concepts/resource-groups/), and resource group
  mappings. Recreated principals have no per-principal memory override and use
  the default resource group until you configure them.
- Older external aliases that may still be active for a group. Only the alias
  reported by `SHOW GROUPS` is restored. Review identity-provider mappings
  separately if more than one alias has been assigned to a group.

:::caution Best-effort dump

The dump is not a transactionally consistent snapshot across schema objects,
principals, and memberships. Each principal's enabled state and direct grants
come from the same snapshot, but concurrent changes to other entities or group
memberships may still produce a mixed result. Avoid schema and ACL changes
while exporting for replay, and verify the target's grants afterwards with
[`active_grants()`](/docs/query/functions/access-control/#active_grants).

:::

#### Use in views

In QuestDB Enterprise 4.2.0 and later, when access control is enabled:

- A regular view may read an ACL dump in its query body. The dump checks the
  reader's `LIST USERS` and `USER DETAILS`, not the view definer's permissions.
- A regular view's `PIVOT IN` subquery cannot read an ACL dump, directly or
  through another view. Use `INCLUDE (SCHEMA)` if only schema is needed. See
  [administrative operations in view metadata](/docs/concepts/views/#administrative-operations-in-view-metadata).
- Materialized and live views reject any ACL category, including the default
  `SHOW CREATE DATABASE`, even for an administrator. A schema-only form such as
  `INCLUDE (SCHEMA)` is allowed under the
  [catalogue statement rules](/docs/query/sql/create-mat-view/#catalogue-functions):
  it must be in the view's own query, and the creator must hold `SYSTEM ADMIN`.

### SHOW CREATE LIVE VIEW

```questdb-sql title="retrieving live view ddl"
SHOW CREATE LIVE VIEW trades_ma;
```

| ddl                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CREATE LIVE VIEW 'trades_ma' FLUSH EVERY 1s IN MEMORY 5s PARTITION BY DAY START FROM NOW AS (<br/>SELECT timestamp, symbol, avg(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS 300 PRECEDING) AS moving_avg FROM trades<br/>); |

This returns the `CREATE LIVE VIEW` statement that would recreate the
[live view](/docs/concepts/live-views/), including its `FLUSH EVERY`,
`IN MEMORY`, `PARTITION BY`, and `START FROM` clauses. Like other `SHOW CREATE`
statements, it does not include `OWNED BY` or grants. See the
[Enterprise variant](#enterprise-variant) of `SHOW CREATE TABLE`.

### SHOW CREATE MATERIALIZED VIEW

```questdb-sql title="retrieving materialized view ddl" demo
SHOW CREATE MATERIALIZED VIEW bbo_1s;
```

| ddl                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CREATE MATERIALIZED VIEW 'bbo_1s' WITH BASE 'market_data' REFRESH IMMEDIATE AS (SELECT timestamp, symbol, last(bids[1][1]) AS bid, last(asks[1][1]) AS ask FROM market_data SAMPLE BY 1s) PARTITION BY DAY; |

This returns the `CREATE MATERIALIZED VIEW` statement that would recreate the
materialized view, including its base table, refresh strategy, and partitioning.

### SHOW CREATE TABLE

```questdb-sql title="retrieving table ddl" demo
SHOW CREATE TABLE trades;
```

| ddl                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CREATE TABLE trades (symbol SYMBOL CAPACITY 256 CACHE, side SYMBOL CAPACITY 256 CACHE, price DOUBLE, amount DOUBLE, timestamp TIMESTAMP) timestamp(timestamp) PARTITION BY DAY WITH maxUncommittedRows=500000, o3MaxLag=600000000us; |

This is printed with formatting, so when pasted into a text editor that support
formatting characters, you will see:

```questdb-sql
CREATE TABLE trades (
	symbol SYMBOL CAPACITY 256 CACHE,
	side SYMBOL CAPACITY 256 CACHE,
	price DOUBLE,
	amount DOUBLE,
	timestamp TIMESTAMP
) timestamp(timestamp) PARTITION BY DAY
WITH maxUncommittedRows=500000, o3MaxLag=600000000us;
```

#### Posting index with covering columns

When a symbol column has a posting index with `INCLUDE`, the DDL reflects the
index type and covered columns. The designated timestamp is appended to the
`INCLUDE` list automatically, so a table created with
`INCLUDE (price, exchange)` round-trips as
`INCLUDE (price, exchange, timestamp)`:

```questdb-sql
CREATE TABLE trades (
	symbol SYMBOL CAPACITY 256 CACHE INDEX TYPE POSTING INCLUDE (price, exchange, timestamp),
	exchange SYMBOL CAPACITY 256 CACHE,
	price DOUBLE,
	amount DOUBLE,
	timestamp TIMESTAMP
) timestamp(timestamp) PARTITION BY DAY
WITH maxUncommittedRows=500000, o3MaxLag=600000000us;
```

#### Per-column Parquet encoding

When columns have per-column Parquet encoding or compression overrides, they
appear in the `SHOW CREATE TABLE` output:

```questdb-sql
CREATE TABLE sensors (
	ts TIMESTAMP,
	temperature DOUBLE PARQUET(rle_dictionary, zstd(3)),
	humidity FLOAT PARQUET(rle_dictionary),
	device_id VARCHAR PARQUET(default, lz4_raw),
	status INT
) timestamp(ts) PARTITION BY DAY BYPASS WAL;
```

#### Storage policy clause

When an active [storage policy](/docs/concepts/storage-policy/) is attached to a
table (Enterprise only), the policy renders as a `STORAGE POLICY(...)` clause in
the `SHOW CREATE TABLE` and `SHOW CREATE DATABASE` output:

```questdb-sql title="Retrieve a table's storage policy in its DDL"
SHOW CREATE TABLE fx_quotes;
```

```questdb-sql title="Returned DDL"
CREATE TABLE 'fx_quotes' (
    timestamp TIMESTAMP,
    bid DOUBLE
) timestamp(timestamp) PARTITION BY DAY
STORAGE POLICY(TO PARQUET 3 DAYS, DROP LOCAL 1 MONTH);
```

Stages that are not configured on the policy are omitted from the clause. Only
an active policy renders: after `ALTER TABLE ... DISABLE STORAGE POLICY`, the
policy is not shown in either dump. See
[ALTER TABLE SET STORAGE POLICY](/docs/query/sql/alter-table-set-storage-policy/).

#### Enterprise variant

In [QuestDB Enterprise](/enterprise/) 4.2.0 and later, `SHOW CREATE TABLE`,
`SHOW CREATE VIEW`, `SHOW CREATE MATERIALIZED VIEW`, and `SHOW CREATE LIVE VIEW`
return structure, not permissions. Unlike earlier releases, they do not append
an `OWNED BY` clause naming the caller. QuestDB stores no owner for an object;
`OWNED BY` at creation only decides who receives the creator's permissions.

On replay without `OWNED BY`, the principal executing the `CREATE` receives the
normal creator permissions, with the `GRANT` option. To give those permissions
to another principal, add an explicit
[`OWNED BY`](/docs/query/sql/create-table/#owned-by) clause. External users must
still supply that clause when creating objects.

To inspect existing permissions, use
[`active_grants()`](/docs/query/functions/access-control/#active_grants). To
export them as replayable SQL, use
[`SHOW CREATE DATABASE INCLUDE (ACL)`](#enterprise-access-control). A schema-only
dump or a per-object `SHOW CREATE` does not preserve grants.

### SHOW CREATE VIEW

```questdb-sql title="retrieving view ddl"
SHOW CREATE VIEW my_view;
```

| ddl                                                              |
| ---------------------------------------------------------------- |
| CREATE VIEW 'my_view' AS (SELECT ts, symbol, price FROM trades); |

This returns the `CREATE VIEW` statement that would recreate the view,
including any `DECLARE` parameters if the view is parameterized. For an
[audited view](/docs/security/audited-views/) (Enterprise), the statement has
`WITH AUDIT` after the body. It is the way to check whether a view is audited.

### SHOW GROUPS

_Enterprise only._ Requires `LIST USERS`; filtering by another user requires
`USER DETAILS`.

```questdb-sql
SHOW GROUPS;
```

| name       | external_alias | memory_limit | resource_group | resource_group_priority |
| ---------- | -------------- | ------------ | -------------- | ----------------------- |
| management |                | null         | reporting      | 10                      |
| analysts   | analysts-sso   | 1073741824   | null           | null                    |

`memory_limit` is the group's own query memory limit in bytes (`1073741824` is 1
GiB), `null` when none is set. `external_alias` is empty when the group is not
mapped to an external group. `resource_group` and `resource_group_priority` are
the group's
[resource group](/docs/query/sql/acl/alter-group-set-resource-group/) mapping,
`null` when the group is not mapped. See
[memory limits](/docs/security/rbac/#memory-limits).

Filtering by a user lists the groups that user belongs to, without the resource
group columns. Each row's `memory_limit` is that group's own limit:

```questdb-sql
SHOW GROUPS john;
```

| name       | external_alias | memory_limit |
| ---------- | -------------- | ------------ |
| management |                | null         |

### SHOW PARAMETERS

```questdb-sql
SHOW PARAMETERS;
```

The output demonstrates:

- `property_path`: the configuration key
- `env_var_name`: the matching env var for the key
- `value`: the current value of the key
- `value_source`: how the value is set (default, conf or env)
- `sensitive`: if it is a sensitive value (passwords)
- `reloadable`: if the value can be
  [reloaded without a server restart](/docs/configuration/overview/#reloadable-settings)

| property_path                                | env_var_name                                     | value    | value_source | sensitive | reloadable |
| -------------------------------------------- | ------------------------------------------------ | -------- | ------------ | --------- | ---------- |
| http.min.net.connection.limit                | QDB_HTTP_MIN_NET_CONNECTION_LIMIT                | 64       | default      | false     | false      |
| line.http.enabled                            | QDB_LINE_HTTP_ENABLED                            | true     | default      | false     | false      |
| cairo.parquet.export.row.group.size          | QDB_CAIRO_PARQUET_EXPORT_ROW_GROUP_SIZE          | 100000   | default      | false     | false      |
| http.security.interrupt.on.closed.connection | QDB_HTTP_SECURITY_INTERRUPT_ON_CLOSED_CONNECTION | true     | conf         | false     | false      |
| pg.readonly.user.enabled                     | QDB_PG_READONLY_USER_ENABLED                     | true     | conf         | false     | true       |
| pg.readonly.password                         | QDB_PG_READONLY_PASSWORD                         | \*\*\*\* | default      | true      | true       |
| http.password                                | QDB_HTTP_PASSWORD                                | \*\*\*\* | default      | true      | false      |

You can optionally chain `SHOW PARAMETERS` with other clauses:

```questdb-sql
-- This query will return all parameters where the value contains 'tmp', ignoring upper/lower case
(SHOW PARAMETERS) WHERE value ILIKE '%tmp%';

-- This query will return all parameters where the property_path is not 'cairo.root' or 'cairo.snapshot.instance.id', ordered by the first column
(SHOW PARAMETERS) WHERE property_path NOT IN ('cairo.root', 'cairo.snapshot.instance.id') ORDER BY 1;

-- This query will return all parameters where the value_source is 'env'
(SHOW PARAMETERS) WHERE value_source = 'env';

-- Show all the parameters that have been modified from their defaults, via conf file or env variable
(SHOW PARAMETERS) WHERE  value_source <> 'default';
```

### SHOW PARTITIONS

```questdb-sql
SHOW PARTITIONS FROM my_table;
```

Selected columns are shown below; the three new trailing columns are omitted.

| index | partitionBy | name     | minTimestamp          | maxTimestamp          | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable | hasParquetGenerated | isParquet | parquetFileSize | seqTxn | isRemotelyServed |
| ----- | ----------- | -------- | --------------------- | --------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- | ------------------- | --------- | --------------- | ------ | ---------------- |
| 0     | WEEK        | 2022-W52 | 2023-01-01 00:36:00.0 | 2023-01-01 23:24:00.0 | 39      | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      | false               | false     | -1              | 12     | false            |
| 1     | WEEK        | 2023-W01 | 2023-01-02 00:00:00.0 | 2023-01-08 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      | false               | false     | -1              | 34     | false            |
| 2     | WEEK        | 2023-W02 | 2023-01-09 00:00:00.0 | 2023-01-15 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      | false               | false     | -1              | 56     | false            |
| 3     | WEEK        | 2023-W03 | 2023-01-16 00:00:00.0 | 2023-01-18 12:00:00.0 | 101     | 83902464 | 80.0 MiB      | false    | true   | true     | false    | false      | false               | false     | -1              | 78     | false            |

See [`table_partitions()`](/docs/query/functions/meta/#table_partitions) for the
full column list, including `hasParquetGenerated`, `isParquet`,
`parquetFileSize`, `seqTxn`, `isRemotelyServed`, `deadRows`,
`lastWriteTimestamp` and `pieceCount`; see
[monitoring merge-append partitions](/docs/concepts/merge-append-partitions/#monitor-partitions)
for a compact projection of the new columns.

`isRemotelyServed` is `true` when the partition's data lives in object storage
and is fetched with range reads. See
[cold storage](/docs/concepts/cold-storage/) (Enterprise).

:::note

`seqTxn`, `isRemotelyServed`, `deadRows`, `lastWriteTimestamp` and `pieceCount`
are appended at the end of the result set, in that order. Tools that bind
`SHOW PARTITIONS` columns by position rather than by name must account for the
new trailing columns.

:::

### SHOW PERMISSIONS FOR CURRENT USER

_Enterprise only._ `SHOW PERMISSIONS` lists the effective permissions of one
user, group, or service account. The
[`permissions()`](/docs/query/functions/access-control/#permissions) table
function returns the same rows, and
[`active_permissions()`](/docs/query/functions/access-control/#active_permissions)
lists the permissions of every entity at once.

```questdb-sql
SHOW PERMISSIONS;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | t            | G      |

### SHOW PERMISSIONS user

_Enterprise only._

```questdb-sql
SHOW PERMISSIONS admin;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | t            | G      |
| INSERT     | orders     |             | f            | G      |
| UPDATE     | order_itme | quantity    | f            | G      |

### SHOW PERMISSIONS

_Enterprise only._

#### For a group

```questdb-sql
SHOW PERMISSIONS admin_group;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| INSERT     | orders     |             | f            | G      |

#### For a service account

```questdb-sql
SHOW PERMISSIONS ilp_ingestion;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | t            | G      |
| INSERT     |            |             | f            | G      |
| UPDATE     |            |             | f            | G      |

### SHOW SERVER_VERSION

Shows PostgreSQL compatibility version.

```questdb-sql
SHOW SERVER_VERSION;
```

| server_version |
| -------------- |
| 12.3 (questdb) |

### SHOW SERVICE ACCOUNT

_Enterprise only._

```questdb-sql
SHOW SERVICE ACCOUNT;
```

or

```questdb-sql
SHOW SERVICE ACCOUNT ilp_ingestion;
```

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | false   |
| REST Token | false   |

### SHOW SERVICE ACCOUNTS

_Enterprise only._ Requires `LIST USERS`; filtering by another user or group
requires `USER DETAILS`.

```questdb-sql
SHOW SERVICE ACCOUNTS;
```

| name       | enabled | memory_limit | resource_group |
| ---------- | ------- | ------------ | -------------- |
| client_app | true    | null         | null           |
| svc1_admin | true    | 268435456    | automation     |

`memory_limit` is the account's own query memory limit in bytes (`268435456` is
256 MiB) and `resource_group` its
[resource group](/docs/query/sql/acl/alter-service-account-set-resource-group/) mapping,
each `null` when not set.

Filtering by a user or group instead lists the service accounts that principal
can assume, without the `resource_group` column. The result has a `grant_option`
column in place of `enabled`, showing whether the user or group may grant the
assumption to others, and `memory_limit` reports each listed service account's
own limit:

```questdb-sql
SHOW SERVICE ACCOUNTS john;
```

| name       | grant_option | memory_limit |
| ---------- | ------------ | ------------ |
| svc1_admin | false        | 268435456    |

```questdb-sql
SHOW SERVICE ACCOUNTS admin_group;
```

| name       | grant_option | memory_limit |
| ---------- | ------------ | ------------ |
| svc1_admin | false        | 268435456    |

### SHOW TABLES

```questdb-sql title="show tables" demo
SHOW TABLES;
```

| table_name     |
| -------------- |
| ethblocks_json |
| trades         |
| weather        |
| AAPL_orderbook |
| trips          |

### SHOW USER

_Enterprise only._

```questdb-sql
SHOW USER; --as john
```

or

```questdb-sql
SHOW USER john;
```

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | false   |
| REST Token | false   |

### SHOW USERS

_Enterprise only._ Requires `LIST USERS`.

```questdb-sql
SHOW USERS;
```

| name  | enabled | memory_limit | resource_group |
| ----- | ------- | ------------ | -------------- |
| admin | true    | null         | null           |
| john  | true    | 536870912    | reporting      |

The `memory_limit` column is reported in bytes (`536870912` is 512 MiB) and is
the user's own limit or, when it has none, the most restrictive of its groups'.
`null` means no principal override; the workload limit
(`cairo.query.memory.limit.bytes`) still applies, unlike the `memory_limit`
column of [`query_activity`](/docs/query/functions/meta/#query_activity), which
reports the effective limit and includes it. In `SHOW GROUPS` and
`SHOW SERVICE ACCOUNTS` above it is instead the listed entity's own limit, since
neither inherits one. See [memory limits](/docs/security/rbac/#memory-limits).

`resource_group` is the user's direct
[resource group](/docs/query/sql/acl/alter-user-set-resource-group/) mapping;
a user mapped only through an ACL group shows `null` here.

:::note

`memory_limit` is appended after the original columns of `SHOW USERS`,
`SHOW GROUPS`, and `SHOW SERVICE ACCOUNTS`, including their filtered forms, and
the unfiltered forms then append the resource group columns. Tools that bind
these columns by position rather than by name must account for them. See
[upgrading](/docs/security/rbac/#memory-limit-upgrade).

:::

## See also

The following functions allow querying tables and views with filters and using
the results as part of a function:

- [table_columns()](/docs/query/functions/meta/#table_columns)
- [tables()](/docs/query/functions/meta/#tables)
- [table_partitions()](/docs/query/functions/meta/#table_partitions)
- [views()](/docs/query/functions/meta/#views)
