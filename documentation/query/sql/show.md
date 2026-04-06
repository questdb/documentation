---
title: SHOW keyword
sidebar_label: SHOW
description: SHOW SQL keyword reference documentation.
---

`SHOW` returns metadata about tables, columns, partitions, transforms,
configuration, and users.

## Available statements

- [`SHOW COLUMNS`](#show-columns) - column metadata for a table
- [`SHOW CREATE TABLE`](#show-create-table) - DDL to recreate a table
- [`SHOW CREATE VIEW`](#show-create-view) - DDL to recreate a view
- [`SHOW GROUPS`](#show-groups) - groups a user belongs to, or all groups (enterprise)
- [`SHOW PARAMETERS`](#show-parameters) - configuration keys, values, and sources
- [`SHOW PARTITIONS`](#show-partitions) - partition information for a table
- [`SHOW PAYLOAD TRANSFORMS`](#show-payload-transforms) - all defined payload transforms
- [`SHOW PERMISSIONS`](#show-permissions) - permissions for a user, group, or service account (enterprise)
- [`SHOW SERVER_VERSION`](#show-server_version) - PostgreSQL compatibility version
- [`SHOW SERVICE ACCOUNT`](#show-service-account) - details of a service account (enterprise)
- [`SHOW SERVICE ACCOUNTS`](#show-service-accounts) - all service accounts, or those assigned to a user/group (enterprise)
- [`SHOW TABLES`](#show-tables) - all tables
- [`SHOW USER`](#show-user) - user authentication details (enterprise)
- [`SHOW USERS`](#show-users) - all users (enterprise)

## SHOW COLUMNS

### Syntax

```
SHOW COLUMNS FROM tableName
```

Returns all columns and their metadata for the selected table.

### Example

```questdb-sql title="Show columns" demo
SHOW COLUMNS FROM trades;
```

| column    | type      | indexed | indexBlockCapacity | symbolCached | symbolCapacity | symbolTableSize | designated | upsertKey |
| --------- | --------- | ------- | ------------------ | ------------ | -------------- | --------------- | ---------- | --------- |
| symbol    | SYMBOL    | false   | 0                  | true         | 256            | 42              | false      | false     |
| side      | SYMBOL    | false   | 0                  | true         | 256            | 2               | false      | false     |
| price     | DOUBLE    | false   | 0                  | false        | 0              | 0               | false      | false     |
| amount    | DOUBLE    | false   | 0                  | false        | 0              | 0               | false      | false     |
| timestamp | TIMESTAMP | false   | 0                  | false        | 0              | 0               | true       | false     |

## SHOW CREATE TABLE

### Syntax

```
SHOW CREATE TABLE tableName
```

Returns a DDL query that allows you to recreate the table.

### Example

```questdb-sql title="Show create table" demo
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

## SHOW CREATE VIEW

### Syntax

```
SHOW CREATE VIEW viewName
```

Returns a DDL query that allows you to recreate a view.

### Example

```questdb-sql title="Show create view"
SHOW CREATE VIEW my_view;
```

| ddl                                                                |
| ------------------------------------------------------------------ |
| CREATE VIEW 'my_view' AS (SELECT ts, symbol, price FROM trades);   |

This returns the `CREATE VIEW` statement that would recreate the view,
including any `DECLARE` parameters if the view is parameterized.

## SHOW GROUPS

### Syntax

```
SHOW GROUPS [ entityName ]
```

Shows all groups in the system, or all groups a user belongs to. Enterprise only.

### Examples

```questdb-sql
SHOW GROUPS;
```

```questdb-sql
SHOW GROUPS john;
```

| name       |
| ---------- |
| management |

## SHOW PARAMETERS

### Syntax

```
SHOW PARAMETERS
```

Shows configuration keys and their matching `env_var_name`, their values, and
the source of the value.

### Example

```questdb-sql
SHOW PARAMETERS;
```

The output columns:

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

## SHOW PARTITIONS

### Syntax

```
SHOW PARTITIONS FROM tableName
```

Returns partition information for the selected table.

### Example

```questdb-sql
SHOW PARTITIONS FROM my_table;
```

| index | partitionBy | name     | minTimestamp          | maxTimestamp          | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable |
| ----- | ----------- | -------- | --------------------- | --------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- |
| 0     | WEEK        | 2022-W52 | 2023-01-01 00:36:00.0 | 2023-01-01 23:24:00.0 | 39      | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 1     | WEEK        | 2023-W01 | 2023-01-02 00:00:00.0 | 2023-01-08 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 2     | WEEK        | 2023-W02 | 2023-01-09 00:00:00.0 | 2023-01-15 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 3     | WEEK        | 2023-W03 | 2023-01-16 00:00:00.0 | 2023-01-18 12:00:00.0 | 101     | 83902464 | 80.0 MiB      | false    | true   | true     | false    | false      |

## SHOW PAYLOAD TRANSFORMS

### Syntax

```
SHOW PAYLOAD TRANSFORMS
```

Lists all defined [payload transforms](/docs/ingestion/payload-transforms/).

### Example

```questdb-sql title="List all payload transforms"
SHOW PAYLOAD TRANSFORMS;
```

| name | target_table | dlq_table | query |
| :--- | :--- | :--- | :--- |
| binance_depth_api | binance_order_book | dlq_errors | DECLARE OVERRIDABLE @symbol := 'BTCUSDT' SELECT now() AS timestamp, @symbol AS symbol, ... |
| raw_events | event_log | | SELECT now() AS ts, payload() AS raw_body |

## SHOW PERMISSIONS

### Syntax

```
SHOW PERMISSIONS [ entityName ]
```

Displays permissions of a user, group, or service account. Enterprise only.

Without an argument, shows permissions for the current user.

### Examples

```questdb-sql title="Current user"
SHOW PERMISSIONS;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | t            | G      |

```questdb-sql title="Specific user"
SHOW PERMISSIONS admin;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | t            | G      |
| INSERT     | orders     |             | f            | G      |
| UPDATE     | order_itme | quantity    | f            | G      |

```questdb-sql title="Group"
SHOW PERMISSIONS admin_group;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| INSERT     | orders     |             | f            | G      |

```questdb-sql title="Service account"
SHOW PERMISSIONS ilp_ingestion;
```

| permission | table_name | column_name | grant_option | origin |
| ---------- | ---------- | ----------- | ------------ | ------ |
| SELECT     |            |             | t            | G      |
| INSERT     |            |             | f            | G      |
| UPDATE     |            |             | f            | G      |

## SHOW SERVER_VERSION

### Syntax

```
SHOW SERVER_VERSION
```

Shows PostgreSQL compatibility version.

### Example

```questdb-sql
SHOW SERVER_VERSION;
```

| server_version |
| -------------- |
| 12.3 (questdb) |

## SHOW SERVICE ACCOUNT

### Syntax

```
SHOW SERVICE ACCOUNT [ accountName ]
```

Displays details of a service account. Enterprise only.

### Examples

```questdb-sql
SHOW SERVICE ACCOUNT;
```

```questdb-sql
SHOW SERVICE ACCOUNT ilp_ingestion;
```

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | false   |
| REST Token | false   |

## SHOW SERVICE ACCOUNTS

### Syntax

```
SHOW SERVICE ACCOUNTS [ entityName ]
```

Displays all service accounts, or those assigned to a user or group. Enterprise
only.

### Examples

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

## SHOW TABLES

### Syntax

```
SHOW TABLES
```

Returns all tables.

### Example

```questdb-sql title="Show tables" demo
SHOW TABLES;
```

| table_name      |
| --------------- |
| ethblocks_json  |
| trades          |
| weather         |
| AAPL_orderbook  |
| trips           |

## SHOW USER

### Syntax

```
SHOW USER [ userName ]
```

Shows user authentication details. Enterprise only.

### Examples

```questdb-sql
SHOW USER; --as john
```

```questdb-sql
SHOW USER john;
```

| auth_type  | enabled |
| ---------- | ------- |
| Password   | false   |
| JWK Token  | false   |
| REST Token | false   |

## SHOW USERS

### Syntax

```
SHOW USERS
```

Shows all users. Enterprise only.

### Example

```questdb-sql
SHOW USERS;
```

| name  |
| ----- |
| admin |
| john  |

## See also

The following functions allow querying tables and views with filters and using
the results as part of a function:

- [table_columns()](/docs/query/functions/meta/#table_columns)
- [tables()](/docs/query/functions/meta/#tables)
- [table_partitions()](/docs/query/functions/meta/#table_partitions)
- [views()](/docs/query/functions/meta/#views)
