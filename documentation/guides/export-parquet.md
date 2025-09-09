---
title: Export or Convert Data to Parquet
sidebar_label: Export or Convert to Parquet
description:
  This document describes how to comvert or export data to parquet. It demonstrates how to
  convert partitions in-place, using alter table, or how to export data as
  external files via
  COPY SQL or REST.
---

```warning
At the moment, converting to parquet, using any of the mechanisms described in this page, is work-in-progress and
not recommended for production.

We recommend extra caution and, specially in the case of in-place conversion, take a snapshot before starting any
data conversion.

Please read the list of caveats in the [in-place](#in-place-conversion) section to understand the risks.
```

There are three ways of converting or exporting data to Parquet:

1. [In-place conversion of table partitions](#in-place-conversion)
2. [Export via REST](#export-via-rest)
3. [Export as files via COPY](#export-via-copy)



## In-place conversion

In this case, the partition(s) remain under QuestDB's control, and they can still be queried as if they were in native
format.

```note
It is recommended to use QuestDB 9.0.1 or higher, as some features, like arrays on parquet partitions, were not
supported in previos versions.
```

At its current state, in-place conversion of native partitions into parquet has the following limitations:

* We have been testing parquet support for months, and we haven't experienced data corruption or data loss, but this is not guaranteed. It is strongly advised to backup first.
* We have seen cases in which querying Parquet partitions leads to a database crash. This can happen if metadata in the table is different to metadata in the parquet partitions, but it could also happen in other cases.
* While converting data, writes to the partitions remain blocked.
* After a partition has been converted to parquet, it will not register any changes you send to that partition, including respecting any applicable TTL, unless you convert back to native.
* Schema changes are not supported.
* Some parallel queries are still not optimized for parquet.
* There is no compression by default (but it can be [enabled via config](#data-compression) values)

For the reasons above, we recommend not using in-place converstion in production yet, unless you test extensively with
the shape of the data and queries you will be running, and take frequent snapshots.

All those caveats should disappear in the next few months, when we will announce it is ready for production.

### Basics of In-place conversion

Converting partitions from native format to parquet, or from parquet into native format, is done via `ALTER TABLE`. You
need to pass a filter specifying the partitions to convert. The filter can be either a `WHERE` or a `LIST`, in the same
way it is used for the [`DETACH` command](/docs/reference/sql/alter-table-detach-partition/).

The active (most recent) partition will never be converted into parquet, even if it matches the filter.

Conversion is asynchronous, and can take a while to finish, depending on the number of partitions, on the partition size,
on the compression being used, and on disk performance and general load of the server.

To monitor how the conversion is going, you can issue a [`SHOW PARTITIONS`](/docs/reference/sql/show/#show-partitions)
command. Partitions in the parquet format will have the `isParquet` column set to `true` and will show the size on the
`parquetFileSize` column.

### Converting from Native Format into Parquet

```
ALTER TABLE trades CONVERT PARTITION TO PARQUET WHERE timestamp < '2025-08-31';
```

From this moment on, any changes sent to the affected partitions will be discarded.


### Converting from Parquet into Native Format

```
ALTER TABLE trades CONVERT PARTITION TO NATIVE WHERE timestamp < '2025-08-31';
```




# Export query as file

Exporting as a file is right now available on a development branch: [https://github.com/questdb/questdb/pull/6008](https://github.com/questdb/questdb/pull/6008)

The code is functional, but it is just lacking fuzzy tests and documentation. We should be able to include this in a release soon enough, but for exporting it is safe to just checkout the development branch, compile, and then use it (you can always go back to the master branch after the export).

To export the query as a file, you can use either the COPY command or the `/exp` REST API endpoint, as in

```
 curl  -G \
        --data-urlencode "query=select * from market_data limit 3;" \
        'http://localhost:9000/exp?fmt=parquet' > ~/tmp/exp.parquet
```

Again, by default the parquet file will not be compressed, but it can be controlled with the `server.conf` variables above.

Once exported, you can just use it from anywhere, including DuckDB, for example:

```
    select * from read_parquet('~/tmp/exp.parquet');
```
You can also use COPY from the web console, the postgresql protocol, or the API `exec` endpoint (from wherever you can run a SQL statement)

```
    copy market_data to 'market_data_parquet_test_table' with format parquet;
```
The output files (one per partition) will be under `$QUESTDB_ROOT_FOLDER/export/$TO_TABLE_NAME/`


## Data Compression

By default, Parquet files are uncompressed. One of the key advantages of Parquet
over QuestDB’s native format is its built-in compression.

Configure compression in `server.conf` with:

```
       # zstd
        cairo.partition.encoder.parquet.compression.codec=6
        # level is from 1 to 22, 1 is fastest
        cairo.partition.encoder.parquet.compression.level=10
```

You can override these defaults when [exporting via COPY](#export-via-copy).
