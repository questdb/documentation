---
title: CREATE TABLE reference
sidebar_label: CREATE TABLE
description: CREATE TABLE SQL keywords reference documentation.
---

To create a new table in the database, the `CREATE TABLE` keywords followed by
column definitions are used.

## Syntax

To create a table by manually entering parameters and settings:

![Flow chart showing the syntax of the CREATE TABLE keyword](/images/docs/diagrams/createTableDef.svg)

:::note

Checking table metadata can be done via the `tables()` and `table_columns()`
functions which are described in the
[meta functions](/docs/reference/function/meta/) documentation page.

:::

To create a table by cloning the metadata of an existing table:

![Flow chart showing the syntax of the CREATE TABLE LIKE keyword](/images/docs/diagrams/createTableLike.svg)

## Examples

The following examples demonstrate creating tables from basic statements, and
introduces feature such as [partitioning](/glossary/database-partitioning/),
designated timestamps and data deduplication. For more information on the
concepts introduced to below, see

- [designated timestamp](/docs/concept/designated-timestamp/) reference on
  electing a timestamp column
- [partition](/docs/concept/partitions/) documentation which describes how
  partitions work in QuestDB
- [symbol](/docs/concept/symbol/) reference for using the `symbol` data type
- [data deduplication](/docs/concept/deduplication/) reference on discarding
  duplicates.

This first iteration of our example creates a table with a designated timestamp
and also applies a partitioning strategy, `BY DAY`:

```questdb-sql title="Basic example, partitioned by day"
CREATE TABLE trades(
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
  ) TIMESTAMP(timestamp)
PARTITION BY DAY;
```

Now we can add a time-to-live (TTL) period. Once an entire data partition is
past its TTL, it becomes eligible for automatic removal.

```questdb-sql title="With TTL"
CREATE TABLE trades(
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
  ) TIMESTAMP(timestamp)
PARTITION BY DAY
TTL 1 WEEK;
```

Next, we enable data deduplication. This will discard exact duplicates on the
timestamp and ticker columns:

```questdb-sql title="With deduplication, adding ticker as an upsert key."
CREATE TABLE trades(
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
  ) TIMESTAMP(timestamp)
PARTITION BY DAY
TTL 1 WEEK
DEDUP UPSERT KEYS(timestamp, symbol);
```

Finally, we add additional parameters for our SYMBOL type:

```questdb-sql title="Adding parameters for symbol type"
CREATE TABLE trades(
  timestamp TIMESTAMP,
  symbol SYMBOL CAPACITY 256 NOCACHE,
  price DOUBLE,
  amount DOUBLE
  ) TIMESTAMP(timestamp)
PARTITION BY DAY
TTL 1 WEEK
DEDUP UPSERT KEYS(timestamp, symbol);
```

## Write-Ahead Log (WAL) Settings

By default, created tables are
[Write-Ahead Log enabled](/docs/concept/write-ahead-log/). While we recommend
WAL-enabled tables, it is still possible to create non-WAL-enabled tables.

`CREATE TABLE`'s
[global configuration setting](/docs/configuration/#cairo-engine) allows you to
alter the default behaviour via `cairo.wal.enabled.default`:

- `true`: Creates a WAL table (default)
- `false`: Creates a non-WAL table

And on an individual basis, you can also use `BYPASS WAL`.

## Designated timestamp

The timestamp function allows for specifying which column (which must be of
`timestamp` type) should be a designated timestamp for the table. For more
information, see the [designated timestamp](/docs/concept/designated-timestamp/)
reference.

The designated timestamp column **cannot be changed** after the table has been
created.

## Partitioning

`PARTITION BY` allows for specifying the
[partitioning strategy](/docs/concept/partitions/) for the table. Tables created
via SQL are not partitioned by default (`NONE`) and tables can be partitioned by
one of the following:

- `NONE`: the default when partition is not defined.
- `YEAR`
- `MONTH`
- `WEEK`
- `DAY`
- `HOUR`

The partitioning strategy **cannot be changed** after the table has been
created.

## Time To Live (TTL)

To store and analyze only recent data, configure a time-to-live (TTL) period on
a table using the `ALTER TABLE SET TTL` command.

Follow the `TTL` keyword with a number and a time unit, one of:

- `HOURS`
- `DAYS`
- `WEEKS`
- `MONTHS`
- `YEARS`

TTL units fall into two categories:

1. Fixed time periods:
   - `HOURS` 
   - `DAYS` 
   - `WEEKS` 
2. Calendar-based periods:
   - `MONTHS`
   - `YEARS`

Fixed-time periods are always exact durations: 24 HOURS is always 24 × 60 × 60 seconds.

Calendar-based periods may vary in length: 1
MONTH from January 15th goes to February 15th and could be between 28-31 days.

For more information, see the [Time To Live (TTL)](/docs/sql/alter-table-set-ttl/) reference.

## Deduplication

When [Deduplication](/docs/concept/deduplication) is enabled, QuestDB only
inserts rows that do not match the existing data. When rows are inserted into a
table with the deduplication option configured, QuestDB searches for existing
rows to match using the specified `UPSERT KEYS`. If a match is found, the
existing rows are replaced with the new row. If no match is found, the new rows
are inserted into the table.

Deduplication can only be enabled for
[Write-Ahead Log (WAL)](/docs/concept/write-ahead-log/) tables.

It is possible to include multiple columns of different types in the
`UPSERT KEYS` list.

However, there are a few limitations to keep in mind:

- The designated timestamp column must be included in the list of columns
- Columns of [STRING and BINARY](/docs/reference/sql/datatypes) types cannot be
  used in `UPSERT KEYS` list

After table creation the deduplication configuration can be changed at any time
using `ALTER` table:

- Enable deduplication and change `UPSERT KEYS` with
  [`ALTER TABLE ENABLE`](/docs/reference/sql/alter-table-enable-deduplication/)
- Disable deduplication with using
  [`ALTER TABLE DISABLE`](/docs/reference/sql/alter-table-disable-deduplication/)

### Examples

```questdb-sql title="Creating a table for tracking ticker prices with daily partitions and upsert deduplication"
CREATE TABLE trades(
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
  ) TIMESTAMP(timestamp)
PARTITION BY DAY
DEDUP UPSERT KEYS(timestamp, symbol);
```

```questdb-sql title="Enabling dedup on an existing table, for timestamp and ticker columns"
ALTER TABLE trades DEDUP ENABLE UPSERT KEYS(timestamp, symbol);
```

```questdb-sql title="Disabling dedup on the entire table"
ALTER TABLE trades DEDUP DISABLE;
```

```questdb-sql title="Checking whether a table has dedup enabled"
SELECT dedup FROM tables() WHERE table_name = '<the table name>';
```

```questdb-sql title="Checking whether a column has dedup enabled"
SELECT `column`, upsertKey from table_columns('<the table name>');
```

## IF NOT EXISTS

An optional `IF NOT EXISTS` clause may be added directly after the
`CREATE TABLE` keywords to indicate that a new table should be created if one
with the desired table name does not already exist.

```questdb-sql
CREATE TABLE IF NOT EXISTS trades(
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
  ) TIMESTAMP(timestamp)
PARTITION BY DAY;
```

## Table name

Internally the table name is used as a directory name on the file system. It can
contain both ASCII and Unicode characters. The table name **must be unique** and
an error is returned if a table already exists with the requested name.

In addition, table names are case insensitive: `example`, `exAmPlE`, `EXAMplE`
and `EXAMPLE` are all treated the same. Table names containing spaces or period
`.` character must be enclosed in **double quotes**, for example:

```questdb-sql
CREATE TABLE "example out of.space" (a INT);
INSERT INTO "example out of.space" values (1);
```

## Column name

As with table names, the column name is used for file names internally. Although
it does support both ASCII and Unicode characters, character restrictions
specific to the file system still apply.

Tables may have up to **2,147,483,647** columns. Column names are also case
insensitive. For example: `example`, `exAmPlE`, `EXAMplE` and `EXAMPLE` are all
treated the same. However, column names **must be** unique within each table and
**must not contain** a period `.` character.

## Type definition

When specifying a column, a name and
[type definition](/docs/reference/sql/datatypes/) must be provided. The `symbol`
type may have additional optional parameters applied.

![Flow chart showing the syntax of the different column types](/images/docs/diagrams/columnTypeDef.svg)

### Symbols

Optional keywords and parameters may follow the `symbol` type which allow for
further optimization on the handling of this type. For more information on the
benefits of using this type, see the [symbol](/docs/concept/symbol/) overview.

#### Symbol capacity

`CAPACITY` is an optional keyword used when defining a symbol type on table
creation to indicate how many distinct values this column is expected to have.
When `distinctValueEstimate` is not explicitly specified, a default value of
`cairo.default.symbol.capacity` is used.

`distinctValueEstimate` - the value used to size data structures for
[symbols](/docs/concept/symbol/).

```questdb-sql
CREATE TABLE trades(
  timestamp TIMESTAMP,
  symbol SYMBOL CAPACITY 50,
  price DOUBLE,
  amount DOUBLE
  ) TIMESTAMP(timestamp)
PARTITION BY DAY;
```

#### Symbol caching

`CACHE | NOCACHE` is used to specify whether a symbol should be cached. The
default value is `CACHE` unless otherwise specified.

```questdb-sql
CREATE TABLE trades(
  timestamp TIMESTAMP,
  symbol SYMBOL CAPACITY 50 NOCACHE,
  price DOUBLE,
  amount DOUBLE
  ) TIMESTAMP(timestamp);
```

### Casting types

`castDef` - casts the type of a specific column. `columnRef` must reference
existing column in the `selectSql`

![Flow chart showing the syntax of the cast function](/images/docs/diagrams/castDef.svg)

```questdb-sql
CREATE TABLE test AS (
  SELECT x FROM long_sequence(10)
  ), CAST (x AS DOUBLE);
```

## Column indexes

Index definitions (`indexDef`) are used to create an
[index](/docs/concept/indexes/) for a table column. The referenced table column
must be of type [symbol](/docs/concept/symbol/).

![Flow chart showing the syntax of the index function](/images/docs/diagrams/indexDef.svg)

```questdb-sql
CREATE TABLE trades(
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
  ), INDEX(symbol) TIMESTAMP(timestamp);
```

See the [Index concept](/docs/concept/indexes/#how-indexes-work) for more
information about indexes.

## OWNED BY

_Enterprise only._

When a user creates a new table, they automatically get all table level
permissions with the `GRANT` option for that table.
However, if the `OWNED BY` clause is used, the permissions instead go
to the user, group, or service account named in that clause.

The `OWNED BY` clause cannot be omitted if the table is created by an
external user, because permissions cannot be granted to them.

```questdb-sql
CREATE GROUP analysts;
CREATE TABLE trades(
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
  ) TIMESTAMP(timestamp) PARTITION BY DAY
OWNED BY analysts;
```

## CREATE TABLE AS

Creates a table, using the results from the `SELECT` statement to determine the
column names and data types.

```questdb-sql title="Create table as select"
CREATE TABLE new_trades AS(
  SELECT *
  FROM
    trades
) TIMESTAMP(timestamp);
```

We can use keywords such as `IF NOT EXISTS`, `PARTITION BY`..., as needed for
the new table. The data type of a column can be changed:

```questdb-sql title="Clone an existing wide table and change type of cherry-picked columns"
CREATE TABLE new_trades AS(
  SELECT *
  FROM
    trades
), CAST(price AS LONG) TIMESTAMP(timestamp);
```

Here we changed type of `price` to `LONG`.

:::note

Since QuestDB v7.4.0, the default behaviour for `CREATE TABLE AS` has been
changed.

Previously, the table would be created atomically. For large tables, this
requires a significant amount of RAM, and can cause errors if the database runs
out of memory.

By default, this will be performed in batches. If the query fails, partial data
may be inserted.

If this is a problem, it is recommended to use the ATOMIC keyword
(`CREATE ATOMIC TABLE`). Alternatively, enabling deduplication on the table will
allow you to perform an idempotent insert to re-insert any missed data.

:::

### ATOMIC

Tables can be created atomically, which first loads all of the data and then
commits in a single transaction.

This requires the data to be available in memory all at once, so for large
inserts, this may have performance issues.

To force this behaviour, one can use the `ATOMIC` keyword:

```questdb-sql title="Create atomic table as select"
CREATE ATOMIC TABLE new_trades AS(
  SELECT *
  FROM
    trades
) TIMESTAMP(timestamp);
```

### BATCH

By default, tables will be created with data inserted in batches.

The size of the batches can be configured:

- globally, by setting the `cairo.sql.create.table.model.batch.size`
  configuration option in `server.conf`.
- locally, by using the `BATCH` keyword in the `CREATE TABLE` statement.

```questdb-sql title="Create batched table as select"
CREATE BATCH 4096 TABLE new_trades AS(
  SELECT *
  FROM
    trades
) TIMESTAMP(timestamp);
```

One can also specify the out-of-order commit lag for these batched writes, using
the o3MaxLag option:

```questdb-sql title="Create table as select with batching and O3 lag"
CREATE BATCH 4096 o3MaxLag 1s TABLE new_trades AS(
  SELECT *
  FROM
    trades
) TIMESTAMP(timestamp);
```

### Turning unordered data into ordered data

As an additional example, let's assume we imported a text file into the table
`taxi_trips_unordered` and now we want to turn this data into time series
through ordering trips by `pickup_time`, assign dedicated timestamp and
partition by month:

```questdb-sql title="Create table as select with data manipulation"
CREATE TABLE taxi_trips AS(
  SELECT * FROM taxi_trips_unordered ORDER BY pickup_time
) TIMESTAMP(pickup_time)
PARTITION BY MONTH;
```

## CREATE TABLE LIKE

The `LIKE` keyword clones the table schema of an existing table without copying
the data. Table settings and parameters such as designated timestamp and symbol
column indexes will be cloned, too.

```questdb-sql title="Create table like"
CREATE TABLE new_table (LIKE my_table);
```

## WITH table parameter

![Flow chart showing the syntax of keyword to specify WITH table parameter](/images/docs/diagrams/createTableWithMaxRowParam.svg)

The parameter influences how often commits of out-of-order data occur. It may be
set during table creation using the `WITH` keyword.

`maxUncommittedRows` - defines the maximum number of uncommitted rows per-table
to keep in memory before triggering a commit for a specific table.

The purpose of specifying maximum uncommitted rows per table is to reduce the
occurrences of resource-intensive commits when ingesting out-of-order data.

The global setting for the same parameter is `cairo.max.uncommitted.rows`.

```questdb-sql title="Setting out-of-order table parameters via SQL"
CREATE TABLE trades(
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
  ) TIMESTAMP(timestamp)
PARTITION BY DAY
WITH maxUncommittedRows=250000;
```

Checking the values per-table may be done using the `tables()` function:

```questdb-sql title="List all tables"
SELECT id, table_name, maxUncommittedRows FROM tables();
```

| id  | name         | maxUncommittedRows |
| :-- | :----------- | :----------------- |
| 1   | trades       | 250000             |
| 2   | sample_table | 50000              |

## Table target volume

The `IN VOLUME` clause is used to create a table in a different volume than the
standard. The table is created in the specified target volume, and a symbolic
link is created in the table's standard volume to point to it.

![Flow chart showing the syntax of keywords to specify a table target volume](/images/docs/diagrams/tableTargetVolumeDef.svg)

The use of the comma (`,`) depends on the existence of the `WITH` clause:

- If the `WITH` clause is present, a comma is mandatory before `IN VOLUME`:

  ```questdb-sql
  CREATE TABLE trades(
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
  ) TIMESTAMP(timestamp)
  PARTITION BY DAY
  WITH maxUncommittedRows=250000,
  IN VOLUME SECONDARY_VOLUME;
  ```

- If no `WITH` clause is used, the comma must not be added for the `IN VOLUME`
  segment:

  ```questdb-sql
  CREATE TABLE trades(
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
  ) TIMESTAMP(timestamp)
  PARTITION BY DAY
  IN VOLUME SECONDARY_VOLUME;
  ```

The use of quotation marks (`'`) depends on the volume alias:

- If the alias contains spaces, the quotation marks are required:

  ```questdb-sql
  CREATE TABLE trades(
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
  ) TIMESTAMP(timestamp)
  PARTITION BY DAY
  IN VOLUME 'SECONDARY_VOLUME';
  ```

- If the alias does not contain spaces, no quotation mark is necessary.

### Description

The table behaves the same way as if it had been created in the standard
(default) volume, with the exception that
[`DROP TABLE`](/docs/reference/sql/drop/) removes the symbolic link from the
standard volume but the content pointed to is left intact in its volume. A table
using the same name in the same volume cannot be created again as a result, it
requires manual intervention to either remove or rename the table's directory in
its volume.

### Configuration

The secondary table target volume is defined by `cairo.volumes` in
[`server.conf`](/docs/configuration/#cairo-engine). The default setting contains
an empty list, which means the feature is not enabled.

To enable the feature, define as many volume pairs as you need, with syntax
_alias -> volume-root-path_, and separate different pairs with a comma. For
example:

```
cairo.volumes=SECONDARY_VOLUME -> /Users/quest/mounts/secondary, BIN -> /var/bin
```

Additional notes about defining the alias and volume root paths:

- Aliases are case-insensitive.
- Volume root paths must be valid and exist at bootstrap time and at the time
  when the table is created.
- Aliases and/or volume root paths can be single quoted, it is not required.
