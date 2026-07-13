---
title: Register QuestDB Parquet as Apache Iceberg tables
sidebar_label: QuestDB to Iceberg
description:
  Expose QuestDB's Parquet partitions as Apache Iceberg tables and query them in
  place from Spark, Trino, DuckDB, or PyIceberg, with no copy and no rewrite.
---

QuestDB can expose its time partitions as Parquet, and Apache Iceberg is a
metadata layer over existing Parquet files. Putting the two together lets the
whole Iceberg ecosystem (Spark, Trino, DuckDB, PyIceberg, and others) query
QuestDB's data in place, with no copy and no rewrite: registration only writes
Iceberg metadata that points at the files QuestDB already produced.

The workflow has three parts: getting QuestDB's Parquet into object storage,
registering it with Iceberg, and choosing between the Python and JVM paths. Two
data types, nanosecond timestamps and UUIDs, decide that last choice.

## How QuestDB exposes Parquet to object storage

Iceberg registers files that already live in an object store (S3, GCS, Azure
Blob, MinIO, and so on). How the Parquet gets there, and whether it arrives laid
out one folder per partition, depends on your edition:

- **QuestDB Enterprise** tiers partitions to object storage automatically through
  [storage policies](/docs/concepts/storage-policy/). The data lands as Hive-style
  partitioned Parquet, one folder per partition, for example:

  ```text
  fx_trades/year=2026/month=02/day=10/hour=08/data.parquet
  fx_trades/year=2026/month=02/day=10/hour=09/data.parquet
  ```

  so only the Iceberg registration is left to do.

- **QuestDB open source** is manual end to end. First produce Parquet, by
  [converting partitions in place or exporting](/docs/query/export-parquet/)
  (`ALTER TABLE ... CONVERT PARTITION TO PARQUET`), or by creating the table in
  Parquet format with [`CREATE TABLE`](/docs/query/sql/create-table/). QuestDB
  writes those files locally in its own partition layout, so you then move them to
  your object store and arrange the partition folders yourself. The Hive-style
  layout shown above works well and matches what Enterprise produces. Only after
  that do you register them with Iceberg.

## How Iceberg registration works

Iceberg keeps an explicit manifest of every data file. Registering a QuestDB
Parquet file writes that metadata and nothing else: the Parquet is never moved or
rewritten, so the operation is cheap and the data stays exactly where QuestDB put
it.

Two points shape the workflow:

- **Match the partition transform to QuestDB's partitioning.** Partition the
  Iceberg table by the transform that mirrors the table's
  [partition unit](/docs/concepts/partitions/), such as `hour(timestamp)` for
  hourly partitions, so partition pruning works.
- **There is no automatic partition discovery.** Unlike Hive-style partition
  projection, Iceberg only sees files that have been committed to its metadata.

:::note

Each time QuestDB writes a new partition, run the registration step again to add
it. A small scheduled job (cron, Airflow, a Lambda) keeps the Iceberg table
current. Registering only the new files is incremental and metadata-only.

:::

## Register with Python (PyIceberg)

[PyIceberg](https://py.iceberg.apache.org/)'s `add_files` is the most direct path.
The catalog is pluggable, so the same code works against any Iceberg catalog
(REST, JDBC, Glue, Nessie) and any object store.

```python
import pyarrow.parquet as pq
from pyiceberg.catalog import load_catalog

catalog = load_catalog("my_catalog")  # REST, JDBC, Glue, Nessie, ...

# First run: create the table from a sample Parquet file's schema,
# partitioned by hour(timestamp) to match QuestDB.
schema = pq.read_schema("data.parquet")
table = catalog.create_table("analytics.fx_trades", schema)

# Every run: register only the new partition files. Metadata-only, zero-copy.
table.add_files([
    "s3://warehouse/fx_trades/year=2026/month=02/day=10/hour=08/data.parquet",
])
```

PyIceberg writes Iceberg format-version 2, which has two consequences for QuestDB
data types (see [Type handling](#type-handling)): nanosecond timestamps are
downcast to microseconds, and UUIDs are registered as a 16-byte fixed type rather
than the Iceberg `uuid` type.

## Register with the JVM for nanoseconds or UUID

If you need lossless nanosecond timestamps or the native Iceberg `uuid` type, use
the JVM implementation, which can write Iceberg format-version 3. Nanoseconds are
only a concern if a table actually uses them: QuestDB timestamps are microsecond
by default, so many tables never hit this and the Python path is enough.

No Spark or query engine is required. The
[Apache Iceberg Java library](https://iceberg.apache.org/docs/latest/java-api-quickstart/)
does the registration directly (the `iceberg-core` and `iceberg-parquet`
artifacts): read each Parquet file's footer metrics and append the data files to
the table in one commit.

```java
import org.apache.iceberg.DataFile;
import org.apache.iceberg.DataFiles;
import org.apache.iceberg.FileFormat;
import org.apache.iceberg.Metrics;
import org.apache.iceberg.MetricsConfig;
import org.apache.iceberg.parquet.ParquetUtil;

// For each new partition file (zero-copy: only metadata is written):
Metrics metrics = ParquetUtil.fileMetrics(file, MetricsConfig.forTable(table), nameMapping);
DataFile dataFile = DataFiles.builder(table.spec())
    .withPath(path).withFormat(FileFormat.PARQUET)
    .withFileSizeInBytes(file.getLength())
    .withMetrics(metrics).withPartition(partition)  // e.g. the hour ordinal
    .build();
table.newAppend().appendFile(dataFile).commit();
```

If you already run Spark, its `add_files` stored procedure does the same in one
SQL call, against a table you created beforehand with a matching schema and
partition spec:

```sql
CALL my_catalog.system.add_files(
  table        => 'analytics.fx_trades',
  source_table => '`parquet`.`s3a://warehouse/fx_trades/year=2026/...`'
);
```

## Type handling

QuestDB's Parquet is otherwise Iceberg-friendly out of the box (canonically named
list elements, no conflicting field IDs, and column statistics), so registration
needs no workarounds. Only two types differ by path:

| QuestDB type        | PyIceberg (format-version 2) | JVM (format-version 3) |
| ------------------- | ---------------------------- | ---------------------- |
| nanosecond timestamp | downcast to microseconds     | native `timestamp_ns`  |
| `uuid`              | stored as `fixed[16]`        | native `uuid`          |

The UUID difference is cosmetic, not a data loss: a UUID is 16 bytes either way,
so the values are identical and complete. With the native `uuid` type, query
engines return the column as a formatted UUID and accept UUID literals in filters
and joins. As `fixed[16]`, the same bytes come back as raw binary, so you format
them to the canonical `8-4-4-4-12` string yourself and compare on the raw value.
Layout, statistics, partitioning, and the zero-copy guarantee are unaffected, and
tables with no UUID columns are not affected at all.

:::tip

Pick the path by data, not by habit. Microsecond tables register cleanly either
way. Reach for the JVM only when a table has nanosecond timestamps you cannot lose
or UUIDs you want typed as `uuid`.

:::

## Query the table

Once registered, the table is a normal Iceberg table: query it from Spark, Trino,
DuckDB, PyIceberg, or any Iceberg-aware engine, while the data stays in object
storage. PyIceberg can read format-version 3 tables (including native nanosecond
timestamps) even though it cannot write them, so a common pattern is to register
with the JVM and query from anywhere.

:::tip Full example

A [full example of Apache Iceberg integration, by one of our developer advocates](https://github.com/javier/iceberg-questdb)
provides runnable Python and Java tools that register QuestDB Parquet as Iceberg
tables, including the nanosecond and UUID handling described above.

:::

:::info Related documentation

- [Storage policies](/docs/concepts/storage-policy/)
- [Parquet export](/docs/query/export-parquet/)
- [CREATE TABLE](/docs/query/sql/create-table/)
- [Partitions](/docs/concepts/partitions/)
- [Designated timestamp](/docs/concepts/designated-timestamp/)

:::
