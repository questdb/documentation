---
title: Meta functions
sidebar_label: Meta
description: Database and table metadata function reference documentation.
---

These functions provide instance-level information and table, column and
partition information including metadata. They are particularly useful for
learning useful information about your instance, including:

- [Designated timestamp](/docs/concept/designated-timestamp/) columns
- [Attached, detached, or attachable](/docs/reference/sql/alter-table-attach-partition/)
  partitions
- Partition storage size on disk
- Running sql commands

## build

**Arguments:**

- `build()` does not require arguments.

**Return value:**

Returns a string with the current QuestDB version and hash.

**Examples:**

```questdb-sql
SELECT build();
```

| build                                                                                              |
| -------------------------------------------------------------------------------------------------- |
| Build Information: QuestDB 7.3.5, JDK 17.0.7, Commit Hash 460b817b0a3705c5633619a8ef9efb5163f1569c |

## functions

**Arguments:**

- `functions()` does not require arguments.

**Return value:**

Returns all available database functions.

**Examples:**

```questdb-sql
functions();
```

| name | signature | signature_translated  | runtime_constant | type     |
| ---- | --------- | --------------------- | ---------------- | -------- |
| or   | or(TT)    | or(boolean, boolean)  | FALSE            | STANDARD |
| and  | and(TT)   | and(boolean, boolean) | FALSE            | STANDARD |
| not  | not(T)    | not(boolean)          | FALSE            | STANDARD |

## query_activity

**Arguments:**

- `query_activity()` does not require arguments.

**Return value:**

Returns metadata on running SQL queries, including columns such as:

- query_id - identifier of the query that can be used with
  [cancel query](/docs/reference/sql/cancel-query) command or
  [cancelQuery()](/docs/reference/sql/cancel-query) function
- worker_id - identifier of worker thread that initiated query processing. Note
  that many multithreaded queries also run on other workers
- worker_pool - name of worker pool used to execute the query
- username - name of user executing the query
- query_start - timestamp of when query started
- state_change - timestamp of latest query state change, such as a cancellation
- state - state of running query, can be `active` or `cancelled`
- query - text of sql query

**Examples:**

```questdb-sql
SELECT * FROM query_activity();
```

| query_id | worker_id | worker_pool | username | query_start                 | state_change                | state  | query                                                     |
| -------- | --------- | ----------- | -------- | --------------------------- | --------------------------- | ------ | --------------------------------------------------------- |
| 62179    | 5         | shared      | bob      | 2024-01-09T10:03:05.557397Z | 2024-01-09T10:03:05.557397  | active | select \* from query_activity()                           |
| 57777    | 6         | shared      | bob      | 2024-01-09T08:58:55.988017Z | 2024-01-09T08:58:55.988017Z | active | SELECT symbol,approx_percentile(price, 50, 2) from trades |

## memory_metrics

**Arguments:**

- `memory_metrics()` does not require arguments.

**Return value:**

Returns granular memory metrics.

**Examples:**

```questdb-sql
memory_metrics();
```

| memory_tag     | bytes     |
| -------------- | --------- |
| TOTAL_USED     | 142624730 |
| RSS            | 328609792 |
| MMAP_DEFAULT   | 196728    |
| NATIVE_DEFAULT | 256       |
| MMAP_O3        | 0         |
| NATIVE_O3      | 96        |

## reader_pool

**Arguments:**

- `reader_pool()` does not require arguments.

**Return value:**

Returns information about the current state of the reader pool in QuestDB. The
reader pool is a cache of table readers that are kept open to speed up
subsequent reads from the same table. The returned information includes the
table name, the ID of the thread that currently owns the reader, the timestamp
of the last time the reader was accessed, and the current transaction ID with
which the reader is associated.

**Examples:**

```questdb-sql
SELECT * FROM reader_pool();
```

| table_name | owner_thread_id | last_access_timestamp       | current_txn |
| ---------- | --------------- | --------------------------- | ----------- |
| sensors    | null            | 2023-12-01T19:28:14.311703Z | 1           |

## writer_pool

**Arguments:**

- `writer_pool()` does not require arguments.

**Return value:**

Returns information about the current state of the writer pool in QuestDB. The
writer pool is a cache of table writers that are kept open to speed up
subsequent writes to the same table. The returned information includes the table
name, the ID of the thread that currently owns the writer, the timestamp of the
last time the writer was accessed, and the reason for the ownership.

**Examples:**

```questdb-sql
SELECT * FROM writer_pool();
```

| table_name                    | owner_thread_id | last_access_timestamp       | ownership_reason |
| ----------------------------- | --------------- | --------------------------- | ---------------- |
| sys.column_versions_purge_log | 1               | 2023-12-01T18:50:03.412468Z | QuestDB system   |
| telemetry_config              | 1               | 2023-12-01T18:50:03.470604Z | telemetryConfig  |
| telemetry                     | 1               | 2023-12-01T18:50:03.464501Z | telemetry        |
| sys.telemetry_wal             | 1               | 2023-12-01T18:50:03.467924Z | telemetry        |
| example_table                 | null            | 2023-12-01T20:33:33.270984Z | null             |

## current database, schema, or user

`current_database()`, `current_schema()`, and `current_user()` are standard SQL
functions that return information about the current database, schema, schemas,
and user, respectively.

```questdb-sql
-- Get the current database
SELECT current_database();

-- Get the current schema
SELECT current_schema();

-- Get the current user
SELECT current_user();
```

Each of these functions returns a single value, so you can use them in a SELECT
statement without any arguments.

## tables

`tables()` or `all_tables()` returns all tables in the database including table
metadata.

**Arguments:**

- `tables()` does not require arguments.

**Return value:**

Returns a `table`.

**Examples:**

```questdb-sql title="List all tables"
tables();
```

| id  | name        | designatedTimestamp | partitionBy | maxUncommittedRows | o3MaxLag   | walEnabled | directoryName    | dedup |
| --- | ----------- | ------------------- | ----------- | ------------------ | ---------- | ---------- | ---------------- | ----- |
| 1   | my_table    | ts                  | DAY         | 500000             | 30000000 0 | false      | my_table         | false |
| 2   | device_data | null                | NONE        | 10000              | 30000000   | false      | device_data      | false |
| 3   | short_lived | null                | HOUR        | 10000              | 30000000   | false      | short_lived (->) | false |

```questdb-sql title="All tables in reverse alphabetical order"
tables() ORDER BY name DESC;
```

| id  | name        | designatedTimestamp | partitionBy | maxUncommittedRows | o3MaxLag  | walEnabled | directoryName    | dedup |
| --- | ----------- | ------------------- | ----------- | ------------------ | --------- | ---------- | ---------------- | ----- |
| 2   | device_data | null                | NONE        | 10000              | 30000000  | false      | device_data      | false |
| 1   | my_table    | ts                  | DAY         | 500000             | 300000000 | false      | my_table         | false |
| 3   | short_lived | ts                  | HOUR        | 10000              | 30000000  | false      | short_lived (->) | false |

:::note

`(->)` means the table was created using the
[IN VOLUME](/docs/reference/sql/create-table/#table-target-volume) clause.

:::

```questdb-sql title="All tables with a daily partitioning strategy"
tables() WHERE partitionBy = 'DAY'
```

| id  | name     | designatedTimestamp | partitionBy | maxUncommittedRows | walEnabled | directoryName | dedup |
| --- | -------- | ------------------- | ----------- | ------------------ | ---------- | ------------- | ----- |
| 1   | my_table | ts                  | DAY         | 500000             | true       | my_table      | false |

## wal_tables

`wal_tables()` returns the WAL status for all
[WAL tables](/docs/concept/write-ahead-log/) in the database.

**Arguments:**

- `wal_tables()` does not require arguments.

**Return value:**

Returns a `table` including the following information:

- `name` - table name
- `suspended` - suspended status flag
- `writerTxn` - the last committed transaction in TableWriter
- `writerLagTxnCount` - the number of transactions that are kept invisible when
  writing to the table; these transactions will be eventually moved to the table
  data and become visible for readers
- `sequencerTxn` - the last committed transaction in the sequencer

**Examples:**

```questdb-sql title="List all tables"
wal_tables();
```

| name        | suspended | writerTxn | writerLagTxnCount | sequencerTxn |
| ----------- | --------- | --------- | ----------------- | ------------ |
| sensor_wal  | false     | 2         | 1                 | 4            |
| weather_wal | false     | 3         | 0                 | 3            |
| test_wal    | true      | 7         | 1                 | 9            |

## table_columns

`table_columns('tableName')` returns the schema of a table.

**Arguments:**

- `tableName` is the name of an existing table as a string.

**Return value:**

Returns a `table` with the following columns:

- `column` - name of the available columns in the table
- `type` - type of the column
- `indexed` - if indexing is applied to this column
- `indexBlockCapacity` - how many row IDs to store in a single storage block on
  disk
- `symbolCached` - whether this `symbol` column is cached
- `symbolCapacity` - how many distinct values this column of `symbol` type is
  expected to have
- `designated` - if this is set as the designated timestamp column for this
  table
- `upsertKey` - if this column is a part of UPSERT KEYS list for table
  [deduplication](/docs/concept/deduplication)

For more details on the meaning and use of these values, see the
[CREATE TABLE](/docs/reference/sql/create-table/) documentation.

**Examples:**

```questdb-sql title="Get all columns in a table"
table_columns('my_table');
```

| column | type      | indexed | indexBlockCapacity | symbolCached | symbolCapacity | designated | upsertKey |
|--------|-----------|---------|--------------------|--------------|----------------|------------|-----------|
| symb   | SYMBOL    | true    | 1048576            | false        | 256            | false      | false     |
| price  | DOUBLE    | false   | 0                  | false        | 0              | false      | false     |
| ts     | TIMESTAMP | false   | 0                  | false        | 0              | true       | false     |
| s      | VARCHAR   | false   | 0                  | false        | 0              | false      | false     |

```questdb-sql title="Get designated timestamp column"
SELECT column, type, designated FROM table_columns('my_table') WHERE designated = true;
```

| column | type      | designated |
| ------ | --------- | ---------- |
| ts     | TIMESTAMP | true       |

```questdb-sql title="Get the count of column types"
SELECT type, count() FROM table_columns('my_table');
```

| type      | count |
|-----------|-------|
| SYMBOL    | 1     |
| DOUBLE    | 1     |
| TIMESTAMP | 1     |
| VARCHAR   | 1     |

## table_partitions

`table_partitions('tableName')` returns information for the partitions of a
table with the option to filter the partitions.

**Arguments:**

- `tableName` is the name of an existing table as a string.

**Return value:**

Returns a `table` with the following columns:

- `index` - _INTEGER_, index of the partition (_NaN_ when the partition is not
  attached)
- `partitionBy` - _STRING_, one of _NONE_, _HOUR_, _DAY_, _WEEK_, _MONTH_ and
  _YEAR_
- `name` - _STRING_, name of the partition, e.g. `2023-03-14`,
  `2023-03-14.detached`, `2023-03-14.attachable`
- `minTimestamp` - _LONG_, min timestamp of the partition (_NaN_ when the table
  is not partitioned)
- `maxTimestamp` - _LONG_, max timestamp of the partition (_NaN_ when the table
  is not partitioned)
- `numRows` - _LONG_, number of rows in the partition
- `diskSize` - _LONG_, size of the partition in bytes
- `diskSizeHuman` - _STRING_, size of the partition meant for humans to read
  (same output as function
  [size_pretty](/docs/reference/function/numeric/#size_pretty))
- `readOnly` - _BOOLEAN_, true if the partition is
  [attached via soft link](/docs/reference/sql/alter-table-attach-partition/#symbolic-links)
- `active` - _BOOLEAN_, true if the partition is the last partition, and whether
  we are writing to it (at least one record)
- `attached` - _BOOLEAN_, true if the partition is
  [attached](/docs/reference/sql/alter-table-attach-partition/)
- `detached` - _BOOLEAN_, true if the partition is
  [detached](/docs/reference/sql/alter-table-detach-partition/) (`name` of the
  partition will contain the `.detached` extension)
- `attachable` - _BOOLEAN_, true if the partition is detached and can be
  attached (`name` of the partition will contain the `.attachable` extension)

**Examples:**

```questdb-sql title="Create table my_table"
CREATE TABLE my_table AS (
    SELECT
        rnd_symbol('EURO', 'USD', 'OTHER') symbol,
        rnd_double() * 50.0 price,
        rnd_double() * 20.0 amount,
        to_timestamp('2023-01-01', 'yyyy-MM-dd') + x * 6 * 3600 * 100000L timestamp
    FROM long_sequence(700)
), INDEX(symbol capacity 32) TIMESTAMP(timestamp) PARTITION BY WEEK;
```

```questdb-sql title="Get all partitions from my_table"
table_partitions('my_table');
```

| index | partitionBy | name     | minTimestamp          | maxTimestamp          | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable |
| ----- | ----------- | -------- | --------------------- | --------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- |
| 0     | WEEK        | 2022-W52 | 2023-01-01 00:36:00.0 | 2023-01-01 23:24:00.0 | 39      | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 1     | WEEK        | 2023-W01 | 2023-01-02 00:00:00.0 | 2023-01-08 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 2     | WEEK        | 2023-W02 | 2023-01-09 00:00:00.0 | 2023-01-15 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 3     | WEEK        | 2023-W03 | 2023-01-16 00:00:00.0 | 2023-01-18 12:00:00.0 | 101     | 83902464 | 80.0 MiB      | false    | true   | true     | false    | false      |

```questdb-sql title="Get size of a table in disk"
SELECT size_pretty(sum(diskSize)) FROM table_partitions('my_table');
```

| size_pretty |
| ----------- |
| 80.3 MB     |

```questdb-sql title="Get active partition of a table"
SELECT * FROM table_partitions('my_table') WHERE active = true
```

| index | partitionBy | name     | minTimestamp          | maxTimestamp          | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable |
| ----- | ----------- | -------- | --------------------- | --------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- |
| 3     | WEEK        | 2023-W03 | 2023-01-16 00:00:00.0 | 2023-01-18 12:00:00.0 | 101     | 83902464 | 80.0 MiB      | false    | true   | true     | false    | false      |

## version/pg_catalog.version

`version()` or `pg_catalog.version()` returns the supported version of the
PostgreSQL Wire Protocol.

**Arguments:**

- `version()` or `pg_catalog.version()` does not require arguments.

**Return value:**

Returns `string`.

**Examples:**

```questdb-sql

SELECT version();

--The above equals to:

SELECT pg_catalog.version();
```

| version                                                             |
| ------------------------------------------------------------------- |
| PostgreSQL 12.3, compiled by Visual C++ build 1914, 64-bit, QuestDB |
