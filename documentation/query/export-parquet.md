---
title: Parquet Export
sidebar_label: Parquet Export
description:
  This document describes how to convert or export data to Parquet. It demonstrates how to
  convert partitions in-place, using alter table, or how to export data as
  external files via
  COPY SQL or REST.
---

There are three ways of converting or exporting data to Parquet:

* [Export via REST](#export-via-rest) — synchronous, streams the Parquet file to the client
* [Export via COPY](#export-via-copy) — asynchronous, writes Parquet files to the server filesystem
* [In-place conversion](#in-place-conversion) — converts existing table data to Parquet format while keeping it managed by QuestDB

All methods compress with `lz4_raw` by default. See [Data Compression](#data-compression) for configuration.

To read and query Parquet files, see the [`read_parquet` function](/docs/query/functions/parquet/).

:::tip

In QuestDB Enterprise, in-place Parquet conversion can be **automated** via
[storage policies](/docs/concepts/storage-policy/). A storage policy runs the
conversion on a schedule (e.g., convert to Parquet after 3 days), and can also
drop the native files and, later, the Parquet files. The manual `ALTER TABLE
CONVERT PARTITION TO PARQUET` approach described below remains available on
both OSS and Enterprise.

:::

## Export via REST

The `/exp` REST API endpoint executes a query and streams the result as a Parquet file directly to the client. This is a synchronous operation — the HTTP response completes when the file is fully transferred.

:::tip

See also the [/exp documentation](/docs/query/rest-api/#exp---export-data).

:::

You can use the same parameters as when doing a [CSV export](/docs/query/rest-api/#exp---export-data), but passing `parquet` as the `fmt` parameter value.

```bash
curl -G \
  --data-urlencode "query=select * from market_data limit 3;" \
  'http://localhost:9000/exp?fmt=parquet' > ~/tmp/exp.parquet
```

:::note
For larger queries you might prefer to use the [`COPY` method](#export-via-copy),
which runs asynchronously and writes files to the server filesystem.
:::

Once exported, you can use it from anywhere, including DuckDB, Pandas, or Polars. If you wanted
to point DuckDB to the example file exported in the previous example, you could
start DuckDB and execute:

```sql
select * from read_parquet('~/tmp/exp.parquet');
```

## Export via COPY

The `COPY` command writes Parquet files to the server filesystem. Unlike REST export, this is an asynchronous operation — the command returns immediately and the export runs in the background.

:::tip

See also the [COPY-TO documentation](/docs/query/sql/copy).

:::

You can use the `COPY` command from the web console, from any pgwire-compliant client,
or using the [`exec` endpoint](/docs/query/rest-api/#exec---execute-queries) of the REST API.

You can export a query:

```questdb-sql
COPY (select * from market_data limit 3) TO 'market_data_parquet_table' WITH FORMAT PARQUET;
```

Or you can export a whole table:

```questdb-sql
COPY market_data TO 'market_data_parquet_table' WITH FORMAT PARQUET;
```

The output files (one per partition) will be under `$QUESTDB_ROOT_FOLDER/export/$TO_TABLE_NAME/`.

The `COPY` command will return immediately, but the export happens in the background. The command will return an export
id string:

| id               |
| ---------------- |
| 45ba24e5ba338099 |

If you want to monitor the export process, you can issue a call like this:

```questdb-sql
SELECT * FROM 'sys.copy_export_log' WHERE id = '45ba24e5ba338099';
```

While it is running, export can be cancelled with:

```questdb-sql
COPY '45ba24e5ba338099' CANCEL;
```

### Controlling partitioning

`COPY table_name TO ...` produces one Parquet file per partition, matching the table's own partitioning scheme. `COPY (SELECT ...) TO ...` produces a single file by default.

To override either default, add `PARTITION_BY` to the export options.

Export a table into a single consolidated file:

```questdb-sql
COPY market_data TO 'market_data_single' WITH FORMAT PARQUET PARTITION_BY NONE;
```

Re-partition independently of the source table. For example, export a day-partitioned table into monthly files:

```questdb-sql
COPY market_data TO 'market_data_monthly' WITH FORMAT PARQUET PARTITION_BY MONTH;
```

Partition a query export by month:

```questdb-sql
COPY (SELECT * FROM market_data WHERE timestamp IN '2024')
TO 'market_data_2024'
WITH FORMAT PARQUET PARTITION_BY MONTH;
```

Partitioning requires a designated timestamp column in the source table or query result. Valid values: `NONE`, `HOUR`, `DAY`, `WEEK`, `MONTH`, `YEAR`.

For the full list of export options, see the [COPY-TO documentation](/docs/query/sql/copy/#options-1).

### Overriding compression

By default, exported Parquet files use `lz4_raw` compression. You can change the default via `server.conf` as shown in [Data Compression](#data-compression),
or override the compression individually for each export. For example:

```questdb-sql
COPY market_data TO 'market_data_parquet_table' WITH FORMAT PARQUET COMPRESSION_CODEC LZ4_RAW;
```

## In-place conversion

:::warning
At the moment, converting to Parquet in-place is work-in-progress and
not recommended for production. We recommend caution and taking a snapshot before starting any
in-place data conversion.
:::

When using in-place conversion, the partition(s) remain under QuestDB's control, and data can still be queried as if it
were in native format.

### Limitations

At its current state, in-place conversion of native partitions into Parquet has the following limitations:

* We have been testing Parquet support for months, and we haven't experienced data corruption or data loss, but this is
not guaranteed. It is strongly advised to back up first.
* We have seen cases in which querying Parquet partitions leads to a database crash. This can happen if metadata in the
table is different from metadata in the Parquet partitions, but it could also happen in other cases.
* While converting data, writes to the partitions remain blocked.
* After a partition has been converted to Parquet, it will not register any changes you send to that partition,
including respecting any applicable TTL, unless you convert back to native.
* Schema changes are not supported.
* Some parallel queries are still not optimized for Parquet.

For the reasons above, we recommend not using in-place conversion in production yet, unless you test extensively with
the shape of the data and queries you will be running, and take frequent snapshots.

All those caveats should disappear in the next few months, when we will announce it is ready for production.

### Converting to Parquet

Converting partitions from native format to Parquet, or from Parquet into native format, is done via `ALTER TABLE`. You
need to pass a filter specifying the partitions to convert. The filter can be either a `WHERE` or a `LIST`, in the same
way it is used for the [`DETACH` command](/docs/query/sql/alter-table-detach-partition/).

:::tip
The active (most recent) partition will never be converted into Parquet, even if it matches the filter.
:::

Conversion is asynchronous, and can take a while to finish, depending on the number of partitions, on the partition size,
on the compression being used, and on disk performance and general load of the server.

To monitor how the conversion is going, you can issue a [`SHOW PARTITIONS`](/docs/query/sql/show/#show-partitions)
command. Partitions in the Parquet format will have the `isParquet` column set to `true` and will show the size on the
`parquetFileSize` column.

```questdb-sql
ALTER TABLE trades CONVERT PARTITION TO PARQUET WHERE timestamp < '2025-08-31';
```

### Bloom filters for in-place conversion

Bloom filters enable row group
pruning for equality and `IN` queries on Parquet partitions. There are two ways
to generate them during in-place conversion.

**Per-column metadata** — If a column was defined with the `BLOOM_FILTER`
keyword in its
[`PARQUET()` clause](/docs/query/sql/create-table/#bloom-filters), bloom
filters are generated automatically during conversion. No additional options are
needed:

```questdb-sql title="Columns with BLOOM_FILTER metadata are indexed automatically"
ALTER TABLE trades CONVERT PARTITION TO PARQUET WHERE timestamp < '2025-08-31';
```

**Explicit column list** — You can specify which columns to index and
optionally set the false positive probability (FPP) using `WITH`:

```questdb-sql title="Convert with explicit bloom filter columns"
ALTER TABLE trades CONVERT PARTITION TO PARQUET
WHERE timestamp < '2025-08-31'
WITH (bloom_filter_columns = 'symbol,side', bloom_filter_fpp = 0.01);
```

:::note

When an explicit `bloom_filter_columns` list is provided, it overrides any
per-column `PARQUET(BLOOM_FILTER)` metadata on the table. If the option is
omitted, per-column metadata is used.

:::

### Converting to Native

```questdb-sql
ALTER TABLE trades CONVERT PARTITION TO NATIVE WHERE timestamp < '2025-08-31';
```

## Data Compression

By default, Parquet files generated by QuestDB are compressed using `lz4_raw` compression. One of the key advantages of Parquet
over QuestDB's native format is its built-in compression.

There are two separate configuration properties in `server.conf`, one for
exports (REST and COPY) and one for in-place conversion:

```ini
# Export (REST /exp and COPY TO)
# Supported codecs: UNCOMPRESSED, SNAPPY, GZIP, BROTLI, ZSTD, LZ4_RAW
cairo.parquet.export.compression.codec=LZ4_RAW
cairo.parquet.export.compression.level=0

# In-place conversion (ALTER TABLE CONVERT PARTITION TO PARQUET)
# Supported codecs: UNCOMPRESSED, SNAPPY, GZIP, BROTLI, ZSTD, LZ4_RAW
cairo.partition.encoder.parquet.compression.codec=LZ4_RAW
cairo.partition.encoder.parquet.compression.level=0
```

When using `ZSTD`, the level ranges from 1 (fastest) to 22, with a default of 9.

For COPY exports, you can also override compression per-query. See [Overriding compression](#overriding-compression).

### Minimum compression ratio

The `cairo.partition.encoder.parquet.min.compression.ratio` property controls
whether compressed Parquet pages are worth keeping. After compressing a page,
QuestDB checks the ratio of `uncompressed_size / compressed_size`. If the ratio
falls below the threshold, the compressed output is discarded and the page is
stored uncompressed instead.

```ini
# Default: 1.2 (keep compressed output only if it achieves ~17% size reduction)
cairo.partition.encoder.parquet.min.compression.ratio=1.2
```

A value of `0.0` (or any value &lt;= 1.0) disables the check, always keeping
compressed output.

The ratio check applies to both data pages and dictionary pages and works with
all compression codecs. It runs after compression, so the CPU cost of
compression is still incurred -- this setting only avoids the I/O and storage
penalty of keeping pages that barely compress.

### Per-column overrides

Individual columns can override the global encoding and compression settings.
See [CREATE TABLE - Per-column Parquet encoding, compression, and bloom filters](/docs/query/sql/create-table/#per-column-parquet-encoding-compression-and-bloom-filters)
for defining overrides at table creation, or
[ALTER TABLE ALTER COLUMN SET PARQUET](/docs/query/sql/alter-table-alter-column-set-parquet/)
for modifying existing tables.

## Bloom Filters

Bloom filters are opt-in
probabilistic indexes that enable row group pruning for equality and `IN`
queries. When generated, they are embedded in the Parquet file metadata
alongside min/max statistics.

Bloom filters can be enabled per-column via the `BLOOM_FILTER` keyword in
[`CREATE TABLE`](/docs/query/sql/create-table/#bloom-filters) or
[`ALTER TABLE`](/docs/query/sql/alter-table-alter-column-set-parquet/#bloom-filter),
or per-export via `bloom_filter_columns` in
[`CONVERT PARTITION`](#bloom-filters-for-in-place-conversion),
[`COPY TO`](/docs/query/sql/copy/), and the
[REST `/exp` endpoint](/docs/query/rest-api/#parquet-export-parameters).

The false positive probability (FPP) determines the trade-off between filter
size and accuracy. It is configured globally:

```ini
# In-place conversion (ALTER TABLE CONVERT PARTITION TO PARQUET)
cairo.partition.encoder.parquet.bloom.filter.fpp=0.01

# Export (REST /exp and COPY TO)
cairo.parquet.export.bloom.filter.fpp=0.01
```

See the [Configuration reference](/docs/configuration/overview/) for all
Parquet-related settings.
