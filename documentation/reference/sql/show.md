---
title: SHOW keyword
sidebar_label: SHOW
description: SHOW SQL keyword reference documentation.
---

This keyword provides table, column, and partition information including
metadata. The `SHOW` keyword is useful for checking the
[designated timestamp setting](/docs/concept/designated-timestamp/) column, the
[partition attachment settings](/docs/reference/sql/alter-table-attach-partition/),
and partition storage size on disk.

## Syntax

![Flow chart showing the syntax of the SHOW keyword](/images/docs/diagrams/show.svg)

## Description

- `SHOW TABLES` returns all the tables.
- `SHOW COLUMNS` returns all the columns and their metadata for the selected
  table.
- `SHOW PARTITIONS` returns the partition information for the selected table.
- `SHOW CREATE TABLE` returns a DDL query that allows you to recreate the table.
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
| column    | type      | indexed | indexBlockCapacity | symbolCached | symbolCapacity | symbolTableSize | designated | upsertKey |
| --------- | --------- | ------- | ------------------ | ------------ | -------------- | --------------- | ---------- | --------- |
| symbol    | SYMBOL    | false   | 0                  | true         | 256            | 42              | false      | false     |
| side      | SYMBOL    | false   | 0                  | true         | 256            | 2               | false      | false     |
| price     | DOUBLE    | false   | 0                  | false        | 0              | 0               | false      | false     |
| amount    | DOUBLE    | false   | 0                  | false        | 0              | 0               | false      | false     |
| timestamp | TIMESTAMP | false   | 0                  | false        | 0              | 0               | true       | false     |

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

### SHOW PARTITIONS

```questdb-sql
SHOW PARTITIONS FROM my_table;
```

| index | partitionBy | name     | minTimestamp          | maxTimestamp          | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable |
| ----- | ----------- | -------- | --------------------- | --------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- |
| 0     | WEEK        | 2022-W52 | 2023-01-01 00:36:00.0 | 2023-01-01 23:24:00.0 | 39      | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 1     | WEEK        | 2023-W01 | 2023-01-02 00:00:00.0 | 2023-01-08 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 2     | WEEK        | 2023-W02 | 2023-01-09 00:00:00.0 | 2023-01-15 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 3     | WEEK        | 2023-W03 | 2023-01-16 00:00:00.0 | 2023-01-18 12:00:00.0 | 101     | 83902464 | 80.0 MiB      | false    | true   | true     | false    | false      |

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
- `reloadable`: if the value can be [reloaded without a server restart](/docs/configuration/#reloadable-settings)

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

-- This query will return all parameters where the property_path is not 'cairo.root' or 'cairo.sql.backup.root', ordered by the first column
(SHOW PARAMETERS) WHERE property_path NOT IN ('cairo.root', 'cairo.sql.backup.root') ORDER BY 1;

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

The following functions allow querying tables with filters and using the results
as part of a function:

- [table_columns()](/docs/reference/function/meta/#table_columns)
- [tables()](/docs/reference/function/meta/#tables)
- [table_partitions()](/docs/reference/function/meta/#table_partitions)
