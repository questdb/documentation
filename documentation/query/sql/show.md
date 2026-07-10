---
title: SHOW keyword
sidebar_label: SHOW
description: SHOW SQL keyword reference documentation.
---

This keyword provides table, column, and partition information including
metadata. The `SHOW` keyword is useful for checking the
[designated timestamp setting](/docs/concepts/designated-timestamp/) column, the
[partition attachment settings](/docs/query/sql/alter-table-attach-partition/),
and partition storage size on disk.

## Syntax

```questdb-sql
SHOW { TABLES
     | COLUMNS FROM tableName
     | PARTITIONS FROM tableName
     | CREATE TABLE tableName
     | CREATE VIEW viewName
     | CREATE DATABASE
         [ { INCLUDE | EXCLUDE } { ALL | (category [, ...]) } ]
     | USER [userName]
     | USERS
     | GROUPS [userName]
     | SERVICE ACCOUNT [accountName]
     | SERVICE ACCOUNTS [userName]
     | PERMISSIONS [entityName]
     | SERVER_VERSION
     | PARAMETERS };
```

## Description

- `SHOW TABLES` returns all the tables.
- `SHOW COLUMNS` returns all the columns and their metadata for the selected
  table.
- `SHOW PARTITIONS` returns the partition information for the selected table.
- `SHOW CREATE TABLE` returns a DDL query that allows you to recreate the table.
- `SHOW CREATE VIEW` returns a DDL query that allows you to recreate a view.
- `SHOW CREATE DATABASE` returns DDL statements that recreate every object
  in the database, one per row, ordered so dependencies come first.
- `SHOW USER` shows user secret (enterprise-only)
- `SHOW GROUPS` shows all groups the user belongs or all groups in the system
    (enterprise-only)
- `SHOW USERS` shows all users (enterprise-only)
- `SHOW SERVICE ACCOUNT` displays details of a service account (enterprise-only)
- `SHOW SERVICE ACCOUNTS` displays all service accounts or those assigned to the
  user/group (enterprise-only)
- `SHOW PERMISSIONS` displays permissions of user, group or service account
  (enterprise-only)
- `SHOW SERVER_VERSION` displays PostgreSQL compatibility version
- `SHOW PARAMETERS` shows configuration keys and their matching `env_var_name`,
  their values and the source of the value

## Examples

### SHOW TABLES

```questdb-sql title="show tables" demo
SHOW TABLES;
```

| table_name      |
| --------------- |
| ethblocks_json  |
| trades          |
| weather         |
| AAPL_orderbook  |
| trips           |

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
`POSTING EF`, `BITMAP`, or empty for non-indexed columns). The
`indexInclude` column lists the names of columns included in a
[posting index's](/docs/concepts/deep-dive/posting-index/) covering
sidecar, as a comma-separated string.

### SHOW CREATE TABLE

```questdb-sql title="retrieving table ddl" demo
SHOW CREATE TABLE trades;
```

| ddl                                                                                                                                                                                                                                      |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| CREATE TABLE trades (symbol SYMBOL CAPACITY 256 CACHE, side SYMBOL CAPACITY 256 CACHE, price DOUBLE, amount DOUBLE, timestamp TIMESTAMP) timestamp(timestamp) PARTITION BY DAY WAL WITH maxUncommittedRows=500000, o3MaxLag=600000000us; |

This is printed with formatting, so when pasted into a text editor that support formatting characters, you will see:

```questdb-sql
CREATE TABLE trades (
	symbol SYMBOL CAPACITY 256 CACHE,
	side SYMBOL CAPACITY 256 CACHE,
	price DOUBLE,
	amount DOUBLE,
	timestamp TIMESTAMP
) timestamp(timestamp) PARTITION BY DAY WAL
WITH maxUncommittedRows=500000, o3MaxLag=600000000us;
```

#### Posting index with covering columns

When a symbol column has a posting index with `INCLUDE`, the DDL reflects
the index type and covered columns. The designated timestamp is appended
to the `INCLUDE` list automatically, so a table created with
`INCLUDE (price, exchange)` round-trips as
`INCLUDE (price, exchange, timestamp)`:

```questdb-sql
CREATE TABLE trades (
	symbol SYMBOL CAPACITY 256 CACHE INDEX TYPE POSTING INCLUDE (price, exchange, timestamp),
	exchange SYMBOL CAPACITY 256 CACHE,
	price DOUBLE,
	amount DOUBLE,
	timestamp TIMESTAMP
) timestamp(timestamp) PARTITION BY DAY WAL
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
the `SHOW CREATE TABLE` output:

```questdb-sql
SHOW CREATE TABLE sensor_data;
```

```text
CREATE TABLE 'sensor_data' (
    ts TIMESTAMP,
    value DOUBLE
) timestamp(ts) PARTITION BY DAY
STORAGE POLICY(TO PARQUET 3 DAYS, DROP LOCAL 1 MONTH) WAL;
```

Stages that are not configured on the policy are omitted from the clause. Only
an active policy renders: after `ALTER TABLE ... DISABLE STORAGE POLICY`, the
policy is not shown in `SHOW CREATE TABLE`. See
[ALTER TABLE SET STORAGE POLICY](/docs/query/sql/alter-table-set-storage-policy/).

#### Enterprise variant

[QuestDB Enterprise](/enterprise/) will include an additional `OWNED BY` clause populated with the current user.

For example,

```questdb-sql
CREATE TABLE trades (
	symbol SYMBOL CAPACITY 256 CACHE,
	side SYMBOL CAPACITY 256 CACHE,
	price DOUBLE,
	amount DOUBLE,
	timestamp TIMESTAMP
) timestamp(timestamp) PARTITION BY DAY WAL
WITH maxUncommittedRows=500000, o3MaxLag=600000000us
OWNED BY 'admin';
```

This clause assigns permissions for the table to that user.

If permissions should be assigned to a different user,
please modify this clause appropriately.

### SHOW CREATE VIEW

```questdb-sql title="retrieving view ddl"
SHOW CREATE VIEW my_view;
```

| ddl                                                                |
| ------------------------------------------------------------------ |
| CREATE VIEW 'my_view' AS (SELECT ts, symbol, price FROM trades);   |

This returns the `CREATE VIEW` statement that would recreate the view,
including any `DECLARE` parameters if the view is parameterized.

### SHOW CREATE DATABASE

`SHOW CREATE DATABASE` returns a logical, data-free dump of the whole database:
one round-trippable DDL statement per row for every user object, much like
`pg_dump --schema-only`. Replaying the statements from top to bottom on an empty
instance recreates the database. No table data and no credentials are included.

```questdb-sql title="SHOW CREATE DATABASE syntax"
SHOW CREATE DATABASE
    [ { INCLUDE | EXCLUDE } { ALL | (category [, ...]) } ];
```

An optional `INCLUDE` or `EXCLUDE` clause selects which object categories to
dump. Each `category` is one of:

- **Schema objects**: `TABLES`, `VIEWS`, `MATERIALIZED_VIEWS`.
- **Access control** (Enterprise only): `USERS`, `GROUPS`, `SERVICE_ACCOUNTS`,
  `PERMISSIONS`.
- **Umbrellas**: `SCHEMA` (all schema objects), `ACL` (all access control
  objects), `ALL` (`SCHEMA` plus `ACL`).

`INCLUDE`/`EXCLUDE` accept either `ALL` or a parenthesised list, so
`INCLUDE ALL`, `EXCLUDE (MATERIALIZED_VIEWS)`, and `INCLUDE (TABLES, VIEWS)` are
all valid. Called without a clause, the statement dumps the whole database:

```questdb-sql title="Dump the database schema" demo
SHOW CREATE DATABASE;
```

The result set has a single `ddl` column with one self-contained statement
per row. Run against a database holding the
[demo](https://demo.questdb.io) tables and materialized views, it returns one
row per object:

| ddl |
| --- |
| CREATE TABLE 'market_data' ( timestamp TIMESTAMP, symbol SYMBOL, bids DOUBLE[][], asks DOUBLE[][], best_bid DOUBLE, best_ask DOUBLE ) timestamp(timestamp) PARTITION BY HOUR TTL 3 DAYS; |
| CREATE MATERIALIZED VIEW 'bbo_1s' WITH BASE 'market_data' REFRESH IMMEDIATE AS ( SELECT timestamp, symbol, last(bids[1][1]) AS bid, last(asks[1][1]) AS ask FROM market_data SAMPLE BY 1s ) PARTITION BY DAY; |
| CREATE MATERIALIZED VIEW 'bbo_1m' WITH BASE 'bbo_1s' REFRESH EVERY 1m DEFERRED START '2025-06-01T00:00:00.000000Z' AS ( SELECT timestamp, symbol, max(bid) AS bid, min(ask) AS ask FROM bbo_1s SAMPLE BY 1m ) PARTITION BY DAY; |
| CREATE MATERIALIZED VIEW 'bbo_1h' WITH BASE 'bbo_1m' REFRESH EVERY 10m DEFERRED START '2025-06-01T00:00:00.000000Z' AS ( SELECT timestamp, symbol, max(bid) AS bid, min(ask) AS ask FROM bbo_1m SAMPLE BY 1h ) PARTITION BY MONTH; |
| CREATE MATERIALIZED VIEW 'bbo_1d' WITH BASE 'bbo_1h' REFRESH EVERY 1h DEFERRED START '2025-06-01T00:00:00.000000Z' AS ( SELECT timestamp, symbol, max(bid) AS bid, min(ask) AS ask FROM bbo_1h SAMPLE BY 1d ) PARTITION BY YEAR; |
| ... |
| CREATE TABLE 'trips' ( cab_type SYMBOL, vendor_id SYMBOL, pickup_datetime TIMESTAMP, dropoff_datetime TIMESTAMP, rate_code_id SYMBOL, pickup_latitude DOUBLE, pickup_longitude DOUBLE, dropoff_latitude DOUBLE, dropoff_longitude DOUBLE, passenger_count INT, trip_distance DOUBLE, fare_amount DOUBLE, extra DOUBLE, mta_tax DOUBLE, tip_amount DOUBLE, tolls_amount DOUBLE, ehail_fee DOUBLE, improvement_surcharge DOUBLE, congestion_surcharge DOUBLE, total_amount DOUBLE, payment_type SYMBOL, trip_type SYMBOL, pickup_location_id INT, dropoff_location_id INT ) timestamp(pickup_datetime) PARTITION BY MONTH; |

Each `ddl` value is stored with formatting characters, so pasting a row into a
text editor expands it to the indented form shown by
[`SHOW CREATE TABLE`](#show-create-table).

#### Output order

Objects are emitted in dependency order: a materialized view or view is never
reported before the base table or base materialized view it reads from. Within
that constraint objects are ordered alphabetically. The demo chains several
materialized views, for example `market_data` then `bbo_1s`, `bbo_1m`, `bbo_1h`,
`bbo_1d`, and `fx_trades` then `fx_trades_ohlc_1m`, `fx_trades_ohlc_1d`. Each
view in a chain appears only after the object it depends on, so a top-to-bottom
replay always succeeds.

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

With no clause the statement defaults to `INCLUDE ALL`. In QuestDB open source
there is no access control layer, so `ALL` and `SCHEMA` produce the same output.
In [QuestDB Enterprise](/enterprise/) the default `ALL` also dumps the access
control block, so use `INCLUDE (SCHEMA)` when you want the structure only.

Filtering is applied per category, like `pg_dump -t`. Excluding a category that
others depend on can leave dangling references, so a dump that omits a base
table does not replay cleanly for the views built on it.

:::note

Filtering the dump rows with a `WHERE` clause, for example
`(SHOW CREATE DATABASE) WHERE ddl ILIKE 'fx_%'` to select the objects of a
single tenant, is not supported yet. Row-level filtering is planned for a future
QuestDB release.

:::

#### Enterprise: access control

In [QuestDB Enterprise](/enterprise/), `SHOW CREATE DATABASE` also dumps the
access control layer after the schema objects, so a dump captures identities,
memberships, and permissions alongside the tables and views:

- `CREATE USER`, `CREATE GROUP`, and `CREATE SERVICE ACCOUNT` for each entity.
- Memberships, as `ADD USER ... TO ...` and `ASSUME SERVICE ACCOUNT ... TO ...`.
- Grants, as `GRANT <permissions> [ON ...] TO ... [WITH GRANT OPTION]`.

`CREATE TABLE`, `CREATE VIEW`, and `CREATE MATERIALIZED VIEW` statements in an
Enterprise dump also carry the `OWNED BY` clause identifying the owner.

Credentials are never dumped: the `CREATE USER` and `CREATE SERVICE ACCOUNT`
statements carry no password or token, so set these after replaying the dump.

The Enterprise ACL categories are `USERS`, `GROUPS`, `SERVICE_ACCOUNTS`, and
`PERMISSIONS`, grouped by the `ACL` umbrella. Each requires the matching `LIST`
or `USER DETAILS` permission,
while the schema categories need no access control permission, so a user with
only `SELECT` can still dump the structure. When access control is disabled the
command degrades to a schema-only dump.

### SHOW PARTITIONS

```questdb-sql
SHOW PARTITIONS FROM my_table;
```

| index | partitionBy | name     | minTimestamp          | maxTimestamp          | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable | hasParquetGenerated | isParquet | parquetFileSize |
| ----- | ----------- | -------- | --------------------- | --------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- | ------------------- | --------- | --------------- |
| 0     | WEEK        | 2022-W52 | 2023-01-01 00:36:00.0 | 2023-01-01 23:24:00.0 | 39      | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      | false               | false     | -1              |
| 1     | WEEK        | 2023-W01 | 2023-01-02 00:00:00.0 | 2023-01-08 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      | false               | false     | -1              |
| 2     | WEEK        | 2023-W02 | 2023-01-09 00:00:00.0 | 2023-01-15 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      | false               | false     | -1              |
| 3     | WEEK        | 2023-W03 | 2023-01-16 00:00:00.0 | 2023-01-18 12:00:00.0 | 101     | 83902464 | 80.0 MiB      | false    | true   | true     | false    | false      | false               | false     | -1              |

See [`table_partitions()`](/docs/query/functions/meta/#table_partitions) for the
full column list, including `hasParquetGenerated`, `isParquet`, and
`parquetFileSize`.

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
- `reloadable`: if the value can be [reloaded without a server restart](/docs/configuration/overview/#reloadable-settings)

| property_path                                   | env_var_name                                        | value                       | value_source | sensitive | reloadable |
| ----------------------------------------------- | --------------------------------------------------- | --------------------------- | ------------ | --------- | ---------- |
| http.min.net.connection.limit                   | QDB_HTTP_MIN_NET_CONNECTION_LIMIT                   | 64                          | default      | false     | false      |
| line.http.enabled                               | QDB_LINE_HTTP_ENABLED                               | true                        | default      | false     | false      |
| cairo.parquet.export.row.group.size             | QDB_CAIRO_PARQUET_EXPORT_ROW_GROUP_SIZE             | 100000                      | default      | false     | false      |
| http.security.interrupt.on.closed.connection    | QDB_HTTP_SECURITY_INTERRUPT_ON_CLOSED_CONNECTION    | true                        | conf         | false     | false      |
| pg.readonly.user.enabled                        | QDB_PG_READONLY_USER_ENABLED                        | true                        | conf         | false     | true       |
| pg.readonly.password                            | QDB_PG_READONLY_PASSWORD                            | ****                        | default      | true      | true       |
| http.password                                   | QDB_HTTP_PASSWORD                                   | ****                        | default      | true      | false      |


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

### SHOW USER

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

```questdb-sql
SHOW USERS;
```

| name  |
| ----- |
| admin |
| john  |

### SHOW GROUPS

```questdb-sql
SHOW GROUPS;
```

or

```questdb-sql
SHOW GROUPS john;
```

| name       |
| ---------- |
| management |

### SHOW SERVICE ACCOUNT

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

```questdb-sql
SHOW SERVICE ACCOUNTS;
```

| name       |
| ---------- |
| management |
| svc1_admin |

```questdb-sql
SHOW SERVICE ACCOUNTS john;
```

| name       |
| ---------- |
| svc1_admin |

```questdb-sql
SHOW SERVICE ACCOUNTS admin_group;
```

| name       |
| ---------- |
| svc1_admin |

### SHOW PERMISSIONS FOR CURRENT USER

```questdb-sql
SHOW PERMISSIONS;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | t            | G      |

### SHOW PERMISSIONS user

```questdb-sql
SHOW PERMISSIONS admin;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | t            | G      |
| INSERT     | orders     |             | f            | G      |
| UPDATE     | order_itme | quantity    | f            | G      |

### SHOW PERMISSIONS

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

## See also

The following functions allow querying tables and views with filters and using
the results as part of a function:

- [table_columns()](/docs/query/functions/meta/#table_columns)
- [tables()](/docs/query/functions/meta/#tables)
- [table_partitions()](/docs/query/functions/meta/#table_partitions)
- [views()](/docs/query/functions/meta/#views)
