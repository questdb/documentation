---
title: CREATE TABLE reference
sidebar_label: CREATE TABLE
description: CREATE TABLE SQL keywords reference documentation.
---

To create a new table in the database, the `CREATE TABLE` keywords followed by
column definitions are used.

`CREATE TABLE` has three creation modes:

1. **[Providing the table schema](#syntax)** -
   define each column and its type yourself.
2. **[CREATE TABLE AS SELECT](#create-table-as)** -
   derive both schema and data from a query.
3. **[CREATE TABLE LIKE](#create-table-like)** -
   clone the structure (but not the data) of an existing table.

The first two modes accept the same set of optional clauses:

- [`TIMESTAMP`](#designated-timestamp) - designated timestamp column
- [`PARTITION BY`](#partitioning) - partition unit and WAL mode
- [`TTL`](#time-to-live-ttl) - time-to-live for partitions
- [`DEDUP`](#deduplication) - deduplication keys (can also be set later with
  [`ALTER TABLE DEDUP ENABLE`](/docs/query/sql/alter-table-enable-deduplication/))
- [`WITH`](#with-table-parameter) - table parameters
- [`IN VOLUME`](#table-target-volume) - target volume for storage
- [`OWNED BY`](#owned-by) - Enterprise RBAC owner

## Syntax

```questdb-sql title="Providing the table schema"
CREATE [ATOMIC | BATCH n [o3MaxLag value]]
TABLE [IF NOT EXISTS] tableName
    (columnName columnTypeDef [, columnName columnTypeDef ...])  -- see Type definition
    [TIMESTAMP (columnName)
        [PARTITION BY { NONE | YEAR | MONTH | DAY | HOUR }
            [BYPASS WAL | WAL]
            [TTL n { HOUR[S] | DAY[S] | WEEK[S] | MONTH[S] | YEAR[S] }]]]
    [DEDUP UPSERT KEYS (columnName [, columnName ...])]
    [WITH tableParameter]
    [IN VOLUME 'alias']
    [OWNED BY ownerName];
```

```questdb-sql title="Create from a query (CREATE TABLE AS SELECT)"
CREATE [ATOMIC | BATCH n [o3MaxLag value]]
TABLE [IF NOT EXISTS] tableName
    AS (selectQuery)
    [, cast(columnRef AS columnTypeDef) ...]  -- see Type definition
    [, INDEX (columnRef [CAPACITY n]) ...]
    [TIMESTAMP (columnName)
        [PARTITION BY { NONE | YEAR | MONTH | DAY | HOUR }
            [BYPASS WAL | WAL]
            [TTL n { HOUR[S] | DAY[S] | WEEK[S] | MONTH[S] | YEAR[S] }]]]
    [DEDUP UPSERT KEYS (columnName [, columnName ...])]
    [WITH tableParameter]
    [IN VOLUME 'alias']
    [OWNED BY ownerName];
```

```questdb-sql title="Create from another table's structure (CREATE TABLE LIKE)"
CREATE TABLE tableName (LIKE sourceTableName);
```

:::note

Checking table metadata can be done via the `tables()` and `table_columns()`
functions which are described in the
[meta functions](/docs/query/functions/meta/) documentation page.

:::

## Examples

The following examples demonstrate creating tables from basic statements, and
introduces feature such as [partitioning](/glossary/database-partitioning/),
designated timestamps and data deduplication. For more information on the
concepts introduced to below, see

- [designated timestamp](/docs/concepts/designated-timestamp/) reference on
  electing a timestamp column
- [partition](/docs/concepts/partitions/) documentation which describes how
  partitions work in QuestDB
- [symbol](/docs/concepts/symbol/) reference for using the `symbol` data type
- [data deduplication](/docs/concepts/deduplication/) reference on discarding
  duplicates.

This first iteration of our example creates a table with a designated timestamp
and also applies a partitioning strategy, `BY DAY`:

```questdb-sql title="Basic example, partitioned by day"
CREATE TABLE trades (
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
CREATE TABLE trades (
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
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY
TTL 1 WEEK
DEDUP UPSERT KEYS (timestamp, symbol);
```

Finally, we add additional parameters for our SYMBOL type:

```questdb-sql title="Adding parameters for symbol type"
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL CAPACITY 256 NOCACHE,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY
TTL 1 WEEK
DEDUP UPSERT KEYS (timestamp, symbol);
```

## Write-Ahead Log (WAL) Settings

By default, created tables are
[Write-Ahead Log enabled](/docs/concepts/write-ahead-log/). While we recommend
WAL-enabled tables, it is still possible to create non-WAL-enabled tables.

`CREATE TABLE`'s
[global configuration setting](/docs/configuration/overview/#cairo-engine) allows you to
alter the default behaviour via `cairo.wal.enabled.default`:

- `true`: Creates a WAL table (default)
- `false`: Creates a non-WAL table

And on an individual basis, you can also use `BYPASS WAL`.

## Designated timestamp

The timestamp function allows for specifying which column (which must be of
`timestamp` type) should be a designated timestamp for the table. For more
information, see the [designated timestamp](/docs/concepts/designated-timestamp/)
reference.

The designated timestamp column **cannot be changed** after the table has been
created.

## Partitioning

`PARTITION BY` allows for specifying the
[partitioning strategy](/docs/concepts/partitions/) for the table. Tables created
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
a table using the `TTL` clause, placing it right after `PARTITION BY <unit>`.
You can't set TTL on a non-partitioned table.

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

Fixed-time periods are always exact durations: `1 WEEK` is always 7 days.

Calendar-based periods may vary in length: `1 MONTH` from January 15th goes to
February 15th and could be between 28 and 31 days.

QuestDB accepts both singular and plural forms:

- `HOUR` or `HOURS`
- `DAY` or `DAYS`
- `WEEK` or `WEEKS`
- `MONTH` or `MONTHS`
- `YEAR` or `YEARS`

It also supports shorthand notation: `3H` for 3 hours, `2M` for 2 months.

:::note

QuestDB drops data that exceeded its TTL only a whole partition at a time. For
this reason, the TTL period must be a whole number multiple of the table's
partition size.

For example:

- If a table is partitioned by `DAY`, the TTL must be a whole number of days
  (`24 HOURS`, `2 DAYS` and `3 MONTHS` are all accepted)
- If a table is partitioned by `MONTH`, the TTL must be in months or years.
  QuestDB won't accept the `HOUR`, `DAY`, or `WEEK` units

Refer to the [section on TTL in Concepts](/docs/concepts/ttl/) for detailed
information on the behavior of this feature.

:::

## Deduplication

When [Deduplication](/docs/concepts/deduplication) is enabled, QuestDB only
inserts rows that do not match the existing data. When you insert a row into a
table with deduplication enabled, QuestDB searches for existing rows with
matching values in all the columns specified with `UPSERT KEYS`. It replaces all
such matching rows with the new row.

Deduplication only works on
[Write-Ahead Log (WAL)](/docs/concepts/write-ahead-log/) tables.

You can include multiple columns of different types in the `UPSERT KEYS` list.

However, there are a few limitations to keep in mind:

- You must include the designated timestamp column
- You cannot use an [`ARRAY`](/docs/query/datatypes/overview) column

You can change the deduplication configuration at any time using `ALTER TABLE`:

- Enable deduplication and change `UPSERT KEYS` with
  [`ALTER TABLE ENABLE`](/docs/query/sql/alter-table-enable-deduplication/)
- Disable deduplication with using
  [`ALTER TABLE DISABLE`](/docs/query/sql/alter-table-disable-deduplication/)

### Examples

```questdb-sql title="Creating a table for tracking ticker prices with daily partitions and upsert deduplication"
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY
DEDUP UPSERT KEYS (timestamp, symbol);
```

```questdb-sql title="Enabling dedup on an existing table, for timestamp and ticker columns"
ALTER TABLE trades DEDUP ENABLE UPSERT KEYS (timestamp, symbol);
```

```questdb-sql title="Disabling dedup on the entire table"
ALTER TABLE trades DEDUP DISABLE;
```

```questdb-sql title="Checking whether a table has dedup enabled"
SELECT dedup FROM tables() WHERE table_name = '<the table name>';
```

```questdb-sql title="Checking whether a column has dedup enabled"
SELECT `column`, upsertKey FROM table_columns('<the table name>');
```

## IF NOT EXISTS

An optional `IF NOT EXISTS` clause may be added directly after the
`CREATE TABLE` keywords to indicate that a new table should be created if one
with the desired table name does not already exist.

```questdb-sql
CREATE TABLE IF NOT EXISTS trades (
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

Validation rules:
- Length: subject to filesystem limits (typically ≤255).
- Spaces: **not** allowed at the start or end.
- Period `.`: only a **single** dot is allowed **not** at the start or end and **not** next to another dot.
- Disallowed characters: `?`, `,`, `'`, `"`, `\`, `/`, `:`, `)`, `(`, `+`, `*`, `%`, `~`, `\u0000`, `\u0001`,
`\u0002`, `\u0003`, `\u0004`, `\u0005`, `\u0006`, `\u0007`, `\u0008`, `\t`, `\u000B`, `\u000c`, `\r`, `\n`,
`\u000e`, `\u000f`, `\u007f`, `0xfeff` (UTF-8 BOM).

Some clients may have trouble parsing table names that contain unusual characters, even if those names are valid in
QuestDB. For best results, we recommend using only alphanumeric characters along with `-`, `_`, or `.`.

In addition, table names are case insensitive: `example`, `exAmPlE`, `EXAMplE`
and `EXAMPLE` are all treated the same. Table names containing spaces or period
`.` character must be enclosed in **double quotes**, for example:

```questdb-sql
CREATE TABLE "example out of.space" (a INT);
INSERT INTO "example out of.space" VALUES (1);
```

## Column name

As with table names, the column name is used for file names internally. Although
it does support both ASCII and Unicode characters, character restrictions
specific to the file system still apply.

Tables may have up to **2,147,483,647** columns. Column names are also case
insensitive. For example: `example`, `exAmPlE`, `EXAMplE` and `EXAMPLE` are all
treated the same. However, column names **must be** unique within each table and
**must not contain** a period `.` character.

Validation rules:
  - Length: subject to filesystem limits (typically ≤255).
	-	Period `.` : not allowed.
	-	Hyphen `-`: not allowed.
	-	Other disallowed characters: `?`, `.`, `,`, `'`, `"`, `\`, `/`, `:`, `)`, `(`, `+`, `-`, `*`, `%`, `~`,
  `\u0000`, `\u0001`, `\u0002`, `\u0003`, `\u0004`, `\u0005`, `\u0006`, `\u0007`, `\u0008`, `\t`, `\u000B`,
  `\u000c`, `\n`, `\r`, `\u000e`, `\u000f`, `\u007f`, `0xfeff` (UTF-8 BOM).

Some clients may have trouble parsing column names that contain unusual characters, even if those names are valid in
QuestDB. For best results, we recommend using only alphanumeric characters along with `-`, or `_`.

## Type definition

When specifying a column, a name and
[type definition](/docs/query/datatypes/overview/) must be provided. The `symbol`
type may have additional optional parameters applied.

```questdb-sql
columnTypeDef ::=
      BINARY
    | BOOLEAN
    | BYTE
    | CHAR
    | DATE
    | DECIMAL(<precision>, <scale>)
    | DOUBLE
    | DOUBLE[][]...  -- array: one [] pair per dimension
    | FLOAT
    | GEOHASH(<size>)
    | INT
    | IPV4
    | LONG
    | LONG256
    | SHORT
    | STRING
    | SYMBOL [CAPACITY distinctValueEstimate] [CACHE | NOCACHE]
             [INDEX [CAPACITY valueBlockSize]]
    | TIMESTAMP
    | TIMESTAMP_NS
    | UUID
    | VARCHAR
```

### Symbols

Optional keywords and parameters may follow the `symbol` type which allow for
further optimization on the handling of this type. For more information on the
benefits of using this type, see the [symbol](/docs/concepts/symbol/) overview.

#### Symbol capacity

`CAPACITY` is an optional keyword used when defining a symbol type on table
creation to indicate how many distinct values this column is expected to have.
When `distinctValueEstimate` is not explicitly specified, a default value of
`cairo.default.symbol.capacity` is used.

`distinctValueEstimate` - the value used to size data structures for
[symbols](/docs/concepts/symbol/).

```questdb-sql
CREATE TABLE trades (
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
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL CAPACITY 50 NOCACHE,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp);
```

### Per-column Parquet encoding, compression, and bloom filters

```questdb-sql
PARQUET(encoding [, compression[(level)]])
```

Column definitions may include an optional
`PARQUET(encoding [, compression[(level)]] [, BLOOM_FILTER])` clause. These
settings only affect
[Parquet partitions](/docs/query/export-parquet/#in-place-conversion) and are
ignored for native partitions. Encoding, compression, and bloom filter are all
optional — use `default` for the encoding when specifying compression only.

```questdb-sql title="CREATE TABLE with per-column Parquet config"
CREATE TABLE sensors (
    ts TIMESTAMP,
    temperature DOUBLE PARQUET(rle_dictionary, zstd(3)),
    humidity FLOAT PARQUET(rle_dictionary),
    device_id VARCHAR PARQUET(default, lz4_raw, BLOOM_FILTER),
    status INT
) TIMESTAMP(ts) PARTITION BY DAY;
```

When omitted, columns use the global defaults: a type-appropriate encoding and
the server-wide compression codec
(`cairo.partition.encoder.parquet.compression.codec`). Bloom filters are not
generated unless explicitly enabled.

#### Supported encodings

| Encoding                | SQL keyword               | Valid column types                   |
| ----------------------- | ------------------------- | ------------------------------------ |
| Plain                   | `plain`                   | All                                  |
| RLE Dictionary          | `rle_dictionary`          | All except BOOLEAN, ARRAY AND STRING |
| Delta Length Byte Array | `delta_length_byte_array` | STRING, BINARY, VARCHAR              |
| Delta Binary Packed     | `delta_binary_packed`     | INT, LONG, DATE, TIMESTAMP           |

- **Plain** — stores values as-is with no transformation. Simplest encoding
  with no overhead. Use as a fallback when data has high cardinality and no
  exploitable patterns (e.g. random floats or UUIDs).
- **RLE Dictionary** — builds a dictionary of unique values and replaces each
  value with a short integer key. The keys are then encoded with a hybrid of
  run-length encoding (for repeated consecutive keys) and bit-packing (for
  non-repeating sequences). Best for low-to-medium cardinality columns (status
  codes, device IDs, symbols). The lower the cardinality, the greater the
  compression.
- **Delta Length Byte Array** — delta-encodes the lengths of consecutive
  string/binary values, then stores the raw bytes back-to-back. This is the
  Parquet-recommended encoding for byte array columns and is always preferred
  over `plain` for STRING, BINARY, and VARCHAR.
- **Delta Binary Packed** — delta-encodes integer values and packs the deltas
  into a compact binary representation. Effective for monotonically increasing
  or slowly changing integer/timestamp columns (e.g. sequential IDs, event
  timestamps).

For the full specification of each encoding, see the
[Apache Parquet encodings documentation](https://parquet.apache.org/docs/file-format/data-pages/encodings/).

When no encoding is specified, QuestDB picks a type-appropriate default:
`rle_dictionary` for SYMBOL and VARCHAR, `delta_length_byte_array` for STRING
and BINARY, and `plain` for everything else.

#### Supported compression codecs

| Codec        | SQL keyword    | Level range |
| ------------ | -------------- | ----------- |
| LZ4 Raw      | `lz4_raw`      | --          |
| Zstd         | `zstd`         | 1-22        |
| Snappy       | `snappy`       | --          |
| Gzip         | `gzip`         | 1-9         |
| Brotli       | `brotli`       | 0-11        |
| Uncompressed | `uncompressed` | --          |

- **LZ4 Raw** — extremely fast compression and decompression with a moderate
  ratio. No tunable level. This is the QuestDB default and a good choice for
  most workloads where query throughput matters.
- **Zstd** — excellent balance of compression ratio and speed across its level
  range. Lower levels (1-3) approach LZ4 speed with better ratios; higher
  levels (up to 22) rival Brotli ratios. A strong general-purpose choice when
  storage savings justify slightly slower decompression.
- **Snappy** — very fast compression and decompression with moderate ratio. No
  tunable level. Similar trade-offs to LZ4 Raw.
- **Gzip** — widely supported, higher compression ratio than Snappy or LZ4 at
  the cost of slower decompression, which reduces query throughput. Higher
  levels (up to 9) improve ratio but further increase CPU time.
- **Brotli** — achieves some of the highest compression ratios, especially at
  higher levels, but decompression is significantly slower. Best suited for
  cold/archival data where storage savings outweigh query throughput.
- **Uncompressed** — no compression. Fastest decompression (none needed) but
  largest file size. Useful when data is already incompressible.

For more details on Parquet compression, see the
[Apache Parquet compression documentation](https://parquet.apache.org/docs/file-format/data-pages/compression/).

To modify encoding or compression on existing tables, see
[ALTER TABLE ALTER COLUMN SET PARQUET](/docs/query/sql/alter-table-alter-column-parquet-encoding/).

#### Bloom filters

The optional `BLOOM_FILTER` keyword enables
bloom filter generation for a column
when partitions are converted to Parquet. Bloom filters allow QuestDB to skip
row groups that do not contain matching values, significantly speeding up
equality and `IN` queries on large Parquet partitions.

`BLOOM_FILTER` can appear in several positions:

```questdb-sql title="As the sole argument (default encoding/compression)"
CREATE TABLE t (
  a VARCHAR PARQUET(BLOOM_FILTER),
  ts TIMESTAMP
) TIMESTAMP(ts) PARTITION BY DAY;
```

```questdb-sql title="With encoding"
CREATE TABLE t (
  a INT PARQUET(delta_binary_packed, BLOOM_FILTER),
  ts TIMESTAMP
) TIMESTAMP(ts) PARTITION BY DAY;
```

```questdb-sql title="With encoding and compression"
CREATE TABLE t (
  a INT PARQUET(delta_binary_packed, zstd(3), BLOOM_FILTER),
  ts TIMESTAMP
) TIMESTAMP(ts) PARTITION BY DAY;
```

The false positive probability (FPP) for bloom filters is a global setting
(`cairo.partition.encoder.parquet.bloom.filter.fpp`, default `0.01`) and cannot
be configured per column. See
the [Configuration reference](/docs/configuration/overview/) for all
configuration options.

:::note

When converting partitions with an explicit `bloom_filter_columns` option in
[`CONVERT PARTITION`](/docs/query/export-parquet/#bloom-filters-for-in-place-conversion),
the explicit list overrides per-column `BLOOM_FILTER` metadata.

:::

### Casting types

`castDef` - casts the type of a specific column. `columnRef` must reference
existing column in the `selectSql`

```questdb-sql
cast(columnRef AS columnTypeDef)
```

```questdb-sql
CREATE TABLE test AS (
  SELECT x FROM long_sequence(10)
), CAST (x AS DOUBLE);
```

## Column indexes

Index definitions (`indexDef`) are used to create an
[index](/docs/concepts/deep-dive/indexes/) for a table column. The referenced table column
must be of type [symbol](/docs/concepts/symbol/).

```questdb-sql
INDEX (columnRef [CAPACITY valueBlockSize])
```

```questdb-sql
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
), INDEX(symbol) TIMESTAMP(timestamp);
```

:::warning

- The **index capacity** and
  [**symbol capacity**](/docs/concepts/symbol/) are different
  settings.
- The index capacity value should not be changed, unless a user is aware of all
  the implications. :::

See the [Index concept](/docs/concepts/deep-dive/indexes/#how-indexes-work) for more
information about indexes.

## OWNED BY

_Enterprise only._

When a user creates a new table, they automatically get all table level
permissions with the `GRANT` option for that table. However, if the `OWNED BY`
clause is used, the permissions instead go to the user, group, or service
account named in that clause.

The `OWNED BY` clause cannot be omitted if the table is created by an external
user, because permissions cannot be granted to them.

```questdb-sql
CREATE GROUP analysts;
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY
OWNED BY analysts;
```

## CREATE TABLE AS

Creates a table, using the results from the `SELECT` statement to determine the
column names and data types.

```questdb-sql title="Create table as select"
CREATE TABLE new_trades AS (
  SELECT *
  FROM
    trades
) TIMESTAMP(timestamp);
```

We can use keywords such as `IF NOT EXISTS`, `PARTITION BY`..., as needed for
the new table. The data type of a column can be changed:

```questdb-sql title="Clone an existing wide table and change type of cherry-picked columns"
CREATE TABLE new_trades AS (
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
CREATE ATOMIC TABLE new_trades AS (
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
CREATE BATCH 4096 TABLE new_trades AS (
  SELECT *
  FROM
    trades
) TIMESTAMP(timestamp);
```

One can also specify the out-of-order commit lag for these batched writes, using
the o3MaxLag option:

```questdb-sql title="Create table as select with batching and O3 lag"
CREATE BATCH 4096 o3MaxLag 1s TABLE new_trades AS (
  SELECT * FROM trades
) TIMESTAMP(timestamp);
```

### Turning unordered data into ordered data

As an additional example, let's assume we imported a text file into the table
`trades_unordered` and now we want to turn this data into time series
through ordering trades by `timestamp`, assign dedicated timestamp and
partition by month:

```questdb-sql title="Create table as select with data manipulation"
CREATE TABLE trades AS (
  SELECT * FROM trades_unordered ORDER BY timestamp
) TIMESTAMP(timestamp)
PARTITION BY MONTH;
```

## CREATE TABLE LIKE

The `LIKE` keyword clones the table schema of an existing table or materialized
view without copying the data. Table settings and parameters such as designated
timestamp and symbol column indexes will be cloned, too.

```questdb-sql title="Create table like"
CREATE TABLE new_table (LIKE my_table);
```

## WITH table parameter

```questdb-sql
WITH maxUncommittedRows = rowCount
```

The parameter influences how often commits of out-of-order data occur. It may be
set during table creation using the `WITH` keyword.

`maxUncommittedRows` - defines the maximum number of uncommitted rows per-table
to keep in memory before triggering a commit for a specific table.

The purpose of specifying maximum uncommitted rows per table is to reduce the
occurrences of resource-intensive commits when ingesting out-of-order data.

The global setting for the same parameter is `cairo.max.uncommitted.rows`.

```questdb-sql title="Setting out-of-order table parameters via SQL"
CREATE TABLE trades (
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

| id   | name         | maxUncommittedRows |
| :--- | :----------- | :----------------- |
| 1    | trades       | 250000             |
| 2    | sample_table | 50000              |

## Table target volume

The `IN VOLUME` clause is used to create a table in a different volume than the
standard. The table is created in the specified target volume, and a symbolic
link is created in the table's standard volume to point to it.

```questdb-sql
[,] IN VOLUME ['secondaryVolumeAlias']
```

The use of the comma (`,`) depends on the existence of the `WITH` clause:

- If the `WITH` clause is present, a comma is mandatory before `IN VOLUME`:

  ```questdb-sql
  CREATE TABLE trades (
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
  CREATE TABLE trades (
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
  CREATE TABLE trades (
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
[`DROP TABLE`](/docs/query/sql/drop/) removes the symbolic link from the
standard volume but the content pointed to is left intact in its volume. A table
using the same name in the same volume cannot be created again as a result, it
requires manual intervention to either remove or rename the table's directory in
its volume.

### Configuration

The secondary table target volume is defined by `cairo.volumes` in
[`server.conf`](/docs/configuration/overview/#cairo-engine). The default setting contains
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
