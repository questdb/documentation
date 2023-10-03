---
title: CREATE TABLE reference
sidebar_label: CREATE TABLE
description: CREATE TABLE SQL keywords reference documentation.
---

To create a new table in the database, the `CREATE TABLE` keywords followed by
column definitions are used.

## Syntax

To create a table by manually entering parameters and settings:

![Flow chart showing the syntax of the CREATE TABLE keyword](/img/docs/diagrams/createTable.svg)

:::note

Checking table metadata can be done via the `tables()` and `table_columns()`
functions which are described in the
[meta functions](/docs/reference/function/meta/) documentation page.

:::

To create a table by cloning the metadata of an existing table:

![Flow chart showing the syntax of the CREATE TABLE LIKE keyword](/img/docs/diagrams/createTableLike.svg)

## IF NOT EXISTS

An optional `IF NOT EXISTS` clause may be added directly after the
`CREATE TABLE` keywords to indicate that a new table should be created if one
with the desired table name does not already exist.

```questdb-sql
CREATE TABLE IF NOT EXISTS test_table(price DOUBLE, ts TIMESTAMP) timestamp(ts);
```

## Table name

Internally the table name is used as a directory name on the file system. It can
contain both ASCII and Unicode characters. The table name **must be unique** and
an error is returned if a table already exists with the requested name. Table
names containing spaces or period `.` character must be enclosed in **double
quotes**, for example:

```questdb-sql
CREATE TABLE "example out of.space" (a INT);
INSERT INTO "example out of.space" values (1);
```

## Column name

As with table names, the column name is used for file names internally. Although
it does support both ASCII and Unicode characters, character restrictions
specific to the file system still apply. Tables may have up to **2,147,483,647**
columns.

:::note

Column names must be unique within each table and **must not** contain a period
`.` character.

:::

## Type definition

When specifying a column, a name and
[type definition](/docs/reference/sql/datatypes/) must be provided. The `symbol`
type may have additional optional parameters applied.

![Flow chart showing the syntax of the different column types](/img/docs/diagrams/columnTypeDef.svg)

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
CREATE TABLE my_table(symb SYMBOL CAPACITY 128, price DOUBLE, ts TIMESTAMP),
  INDEX (symb) timestamp(ts);
```

The symbol capacity is not to be confused with **index capacity** described in
[column indexes](#column-indexes) below.

```questdb-sql
CREATE TABLE my_table
  (symb SYMBOL capacity 128 NOCACHE INDEX capacity 256, price DOUBLE, ts TIMESTAMP)
timestamp(ts);
```

#### Symbol caching

`CACHE | NOCACHE` is used to specify whether a symbol should be cached. The
default value is `CACHE` unless otherwise specified.

```questdb-sql
CREATE TABLE my_table
  (symb SYMBOL CAPACITY 128 NOCACHE, price DOUBLE, ts TIMESTAMP)
timestamp(ts);
```

### Casting types

`castDef` - casts the type of a specific column. `columnRef` must reference
existing column in the `selectSql`

![Flow chart showing the syntax of the cast function](/img/docs/diagrams/castDef.svg)

```questdb-sql
CREATE TABLE test AS (SELECT CAST(x as DOUBLE) x FROM long_sequence(10));
```
### IPv4 addresses

Create an IPv4-friendly table using the following pattern:

```sql
CREATE TABLE traffic (ts timestamp, src ipv4, dst ipv4) timestamp(ts) PARTITION BY DAY; 
```

This demonstrates:

* creation of a table called `traffic`
* columns for timestamp, source ipv4 address, destination ipv4 address
* a partition based on a day

## Column indexes

Index definitions (`indexDef`) are used to create an
[index](/docs/concept/indexes/) for a table column. The referenced table column
must be of type [symbol](/docs/concept/symbol/).

![Flow chart showing the syntax of the index function](/img/docs/diagrams/indexDef.svg)

```questdb-sql
CREATE TABLE my_table(symb SYMBOL, price DOUBLE, ts TIMESTAMP),
  INDEX (symb) TIMESTAMP(ts);
```

An index capacity may be provided for the index by defining the index storage
parameter, `valueBlockSize`:

```questdb-sql
CREATE TABLE my_table(symb SYMBOL, price DOUBLE, ts TIMESTAMP),
  INDEX (symb CAPACITY 128) TIMESTAMP(ts);
-- equivalent to
CREATE TABLE my_table(symb SYMBOL INDEX CAPACITY 128, price DOUBLE, ts TIMESTAMP),
  TIMESTAMP(ts);
```

See [Index](/docs/concept/indexes/#how-indexes-work) for more information about
index capacity.

## CREATE TABLE AS

When SQL (`selectSQL`) is `SELECT * FROM tab` or any arbitrary SQL result, the
selected column names and their data type will be cloned to the new table.

```questdb-sql title="Create table as select"
CREATE TABLE new_table AS(
  SELECT
    rnd_int() a,
    rnd_double() b,
    rnd_symbol('ABB', 'CDD') c
  FROM
    long_sequence(100)
  WHERE false
);
```

The data type of a column can be changed:

```questdb-sql title="Clone an existing wide table and change type of cherry-picked columns"
CREATE TABLE new_table AS (SELECT * FROM source_table WHERE false),
  CAST(price AS LONG),
  CAST(instrument as SYMBOL);
```

Here we changed type of `price` (assuming it was `INT`) to `LONG` and changed
type of `sym` to [symbol](/docs/concept/symbol/) and created an
[index](/docs/concept/indexes/).

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
via SQL are not partitioned by default (`NONE`) and tables can be partitioned by one of
the following:

- `NONE`: the default when partition is not defined.
- `YEAR`
- `MONTH`
- `WEEK`
- `DAY`
- `HOUR`

The partitioning strategy **cannot be changed** after the table has been
created.

## WAL table parameter

It is possible to create a [WAL table](/docs/concept/write-ahead-log/), allowing concurrent data ingestion
and modification through multiple interfaces:

- `WAL` creates a WAL table. When a WAL table is created, the table must has a [partition](#partitioning) that is not `NONE`.
- `BYPASS WAL` creates a non-WAL table.
- When neither option is specified,
  [the server configuration](/docs/reference/configuration/#cairo-engine),
  `cairo.wal.enabled.default`, is used:
  - `true`: creates a WAL table.
  - `false`: creates a non-WAL table.
  
## Deduplication

When [Deduplication](/docs/concept/deduplication) is enabled, QuestDB only inserts rows that do not match the existing data. When rows are inserted into a table with the deduplication option configured, QuestDB searches for existing rows to match using the specified `UPSERT KEYS`. If a match is found, the existing rows are replaced with the new row. If no match is found, the new rows are inserted into the table.

Deduplication can only be enabled for [Write-Ahead Log (WAL)](/docs/concept/write-ahead-log/) tables.

It is possible to include multiple columns of different types in the `UPSERT KEYS` list. 

However, there are a few limitations to keep in mind:

- The designated timestamp column must be included in the list of columns
- Columns of [STRING and BINARY](/docs/reference/sql/datatypes) types cannot be used in `UPSERT KEYS` list

After table creation the deduplication configuration can be changed at any time using `ALTER` table:

- Enable deduplication and change `UPSERT KEYS` with [`ALTER TABLE ENABLE`](/docs/reference/sql/alter-table-enable-deduplication/)
- Disable deduplication with using [`ALTER TABLE DISABLE`](/docs/reference/sql/alter-table-disable-deduplication/)

## WITH table parameter

![Flow chart showing the syntax of keyword to specify WITH table parameter](/img/docs/diagrams/createTableWithMaxRowParam.svg)

The parameter influences how often commits of out-of-order data occur. It may be
set during table creation using the `WITH` keyword.

`maxUncommittedRows` - defines the maximum number of uncommitted rows per-table
to keep in memory before triggering a commit for a specific table.

The purpose of specifying maximum uncommitted rows per table is to reduce the
occurrences of resource-intensive commits when ingesting out-of-order data.

The global setting for the same parameter is `cairo.max.uncommitted.rows`.

```questdb-sql title="Setting out-of-order table parameters via SQL"
CREATE TABLE my_table (timestamp TIMESTAMP) TIMESTAMP(timestamp)
PARTITION BY DAY WITH maxUncommittedRows=250000;
```

Checking the values per-table may be done using the `tables()` function:

```questdb-sql title="List all tables"
SELECT id, name, maxUncommittedRows FROM tables();
```

| id  | name        | maxUncommittedRows |
| :-- | :---------- | :----------------- |
| 1   | my_table    | 250000             |
| 2   | device_data | 10000              |

## Table target volume

The `IN VOLUME` clause is used to create a table in a different volume than the standard. The table
is created in the specified target volume, and a symbolic link is created in the table's standard 
volume to point to it.

![Flow chart showing the syntax of keywords to specify a table target volume](/img/docs/diagrams/tableTargetVolumeDef.svg)

The use of the comma (`,`) depends on the existence of the `WITH` clause:

- If the `WITH` clause is present, a comma is mandatory before
  `IN VOLUME`:

  ```questdb-sql
  CREATE TABLE my_table (i symbol, ts timestamp), index(i capacity 32) WITH maxUncommittedRows=7, IN VOLUME SECONDARY_VOLUME;
  ```

- If no `WITH` clause is used, the comma must not be added for the `IN VOLUME`
  segment:

  ```questdb-sql
  CREATE TABLE my_table (i symbol, ts timestamp) IN VOLUME SECONDARY_VOLUME;
  ```

The use of quotation marks (`'`) depends on the alias:

- If the alias contains spaces, the quotation marks are required:

    ```questdb-sql
    CREATE TABLE my_table (i symbol, ts timestamp), index(i capacity 32) IN VOLUME 'SECONDARY VOLUME';
    ```
- If the alias does not contain spaces, no quotation mark is necessary:

    ```questdb-sql
    CREATE TABLE my_table (i symbol, ts timestamp), index(i capacity 32) IN VOLUME SECONDARY_VOLUME;
    ```
    
### Description

The table behaves the same way as if it had been created in the standard (default)
volume, with the exception that [`DROP TABLE`](/docs/reference/sql/drop/) 
removes the symbolic link from the standard volume but the content pointed to is 
left intact in its volume. A table using the same name in the same 
volume cannot be created again as a result, it requires manual intervention 
to either remove or rename the table's directory in its volume.

### Configuration

The secondary table target volume is defined by
`cairo.volumes` in
[`server.conf`](/docs/reference/configuration/#cairo-engine). The default setting
contains an empty list, which means the feature is not enabled.

To enable the feature, define as many volume pairs as you need, with syntax 
_alias -> volume-root-path_, and separate different pairs with a comma. For example:

```
cairo.volumes=SECONDARY_VOLUME -> /Users/quest/mounts/secondary, BIN -> /var/bin
```

Additional notes about defining the alias and volume root paths:

- Aliases are case-insensitive.
- Volume root paths must be valid and exist at bootstrap time and at the time when the table is created.
- Aliases and/or volume root paths can be single quoted, it is not required.

## CREATE TABLE LIKE

The `LIKE` keyword clones the table schema of an existing table without copying
the data. Table settings and parameters such as designated timestamp, symbol
column indexes, and index capacity will be cloned, too.

```questdb-sql title="Create table like"
CREATE TABLE new_table (LIKE my_table);
```

## Examples

The following examples demonstrate creating tables from basic statements, and
introduce features such as partitioning and designated timestamps. For more
information on the concepts introduced to below, see

- [designated timestamp](/docs/concept/designated-timestamp/) reference on
  electing a timestamp column
- [partition](/docs/concept/partitions/) documentation which describes how
  partitions work in QuestDB
- [symbol](/docs/concept/symbol/) reference for using the `symbol` data type

This example will create a table without a designated timestamp and does not
have a partitioning strategy applied.

```questdb-sql title="Basic example"
CREATE TABLE my_table(symb SYMBOL, price DOUBLE, ts TIMESTAMP, s STRING);
```

The same table can be created and a designated timestamp may be specified.

```questdb-sql title="Adding a designated timestamp"
CREATE TABLE my_table(symb SYMBOL, price DOUBLE, ts TIMESTAMP, s STRING)
  TIMESTAMP(ts);
```

```questdb-sql title="Adding a partitioning strategy by DAY"
CREATE TABLE my_table(symb SYMBOL, price DOUBLE, ts TIMESTAMP, s STRING)
  TIMESTAMP(ts)
PARTITION BY DAY;
```

```questdb-sql title="Adding parameters for symbol type"
CREATE TABLE
  my_table(symb SYMBOL CAPACITY 256 NOCACHE INDEX CAPACITY 1048576,
  price DOUBLE, ts TIMESTAMP, s STRING)
  TIMESTAMP(ts)
PARTITION BY DAY;
```

Let's assume we imported a text file into the table `taxi_trips_unordered` and
now we want to turn this data into time series through ordering trips by
`pickup_time`, assign dedicated timestamp and partition by month:

```questdb-sql title="Create table as select with data manipulation"
CREATE TABLE taxi_trips AS(
  SELECT * FROM taxi_trips_unordered ORDER BY pickup_time
) TIMESTAMP(pickup_time)
PARTITION BY MONTH;
```
