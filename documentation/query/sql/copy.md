---
title: COPY keyword
sidebar_label: COPY
description: COPY SQL keyword reference documentation.
---

:::caution

For partitioned tables, the best `COPY` performance can be achieved only on a
machine with a local, physically attached SSD. It is possible to use a network
block storage, such as an AWS EBS volume to perform the operation, with the
following impact:

- Users need to configure the maximum IOPS and throughput setting values for the
  volume.
- The required import time is likely to be 5-10x longer.

:::

## Syntax

![Flow chart showing the syntax of the COPY keyword](/images/docs/diagrams/copy.svg)

## Description

The `COPY` command has two modes of operation:

1. **Import mode**: `COPY table_name FROM 'file.csv'`, copying data from a delimited text file into QuestDB.
2. **Export mode**: `COPY table_name TO 'output_directory'` or `COPY (query) TO 'output_directory'`, exporting data to Parquet files.

## Import mode (COPY-FROM)

Copies tables from a delimited text file saved in the defined root directory
into QuestDB. `COPY` has the following import modes:

- Parallel import, used for copying partitioned tables:

  - The parallel level is based on partition granularity. It is important to
    choose the timestamp column and partition type correctly for the data to be
    imported. The higher the granularity of the partitions, the faster an import
    operation can be completed.
  - If the target table exists and is partitioned, the target table must be
    empty.
  - If the target table does not exist, both `TIMESTAMP` and `PARTITION BY`
    options must be defined to create a partitioned table. The `PARTITION BY`
    value should not be `NONE`.
  - When table does exist and is not empty, import is not supported.

- Serial import, used for copying non-partitioned tables:

  - If the target table exists and is not partitioned, the data is appended
    provided the file structure matches the table.
  - If the target table does not exist, then it is created using metadata
    derived from the file data.

:::note

Parallel `COPY` takes up all the available resources. While one import is running, new
request(s) will be rejected.

:::

`COPY '<id>' CANCEL` cancels the copying operation defined by the import `id`,
while an import is taking place.

### Import root

`COPY` requires a defined root directory where CSV files are saved and copied
from. A CSV file must be saved to the root directory before starting the `COPY`
operation. There are two root directories to be defined:

- `cairo.sql.copy.root` is used for storing regular files to be imported. By default,
  it points to the `root_directory/import` directory. This allows you to drop a CSV
  file into the `import` directory and start the import operation.
- `cairo.sql.copy.work.root` is used for storing temporary files like indexes or
  temporary partitions. Unless otherwise specified, it points to the
  `root_directory/tmp` directory.

Use the [configuration keys](/docs/configuration/overview/) to edit these properties in
[`COPY` configuration settings](/docs/configuration/overview/#copy-settings):

```shell title="Example"
cairo.sql.copy.root=/Users/UserName/Desktop
```

`cairo.sql.copy.root` and `cairo.sql.copy.work.root` can be on a local disk to
the server, on a remote disk, or a remote filesystem. QuestDB enforces that the
tables are only written from files located in a directory relative to the
directories. This is a security feature preventing random file access by
QuestDB.

:::note

For Mac OS users, using a directory under `/Users` may prevent import due to
permission problem. It is preferable to save the CSV file in a folder outside of
the `/Users` tree and set the root directory accordingly.

:::

### Logs

`COPY-FROM` reports its progress through a system table, `sys.text_import_log`. This contains the following information:

| Column name   | Data type | Notes                                                                         |
| ------------- | --------- | ----------------------------------------------------------------------------- |
| ts            | timestamp | The log event timestamp                                                       |
| id            | string    | Import id                                                                     |
| table         | symbol    | Destination table name                                                        |
| file          | symbol    | The source csv file                                                           |
| phase         | symbol    | Import phase.\* Available only in intermediate log records of parallel import |
| status        | symbol    | The event status: started, finished, failed, cancelled                        |
| message       | string    | The error message for when status is failed                                   |
| rows_handled  | long      | The counters for the total number of scanned lines in the file                |
|               |           | The counters are shown in the final log row for the given import              |
| rows_imported | long      | The counters for the total number of imported rows                            |
|               |           | The counters are shown in the final log row for the given import              |
| errors        | long      | The number of errors for the given phase                                      |


**Parallel import phases**
  - setup
  - boundary_check
  - indexing
  - partition_import
  - symbol_table_merge
  - update_symbol_keys
  - build_symbol_index
  - move_partitions
  - attach_partitions
  - analyze_file_structure
  - cleanup

The retention for this table is configured using the `cairo.sql.copy.log.retention.days` setting, and is three days by default.

`COPY` returns an `id` value, which can be correlated with `sys.text_import_log` to track the import progress.

### Options

These options are provided as key-value pairs after the `WITH` keyword.

- `HEADER true/false`: When `true`, QuestDB automatically assumes the first row
  is a header. Otherwise, schema recognition is used to determine whether the
  first row is used as header. The default setting is `false`.
- `TIMESTAMP`: Define the name of the timestamp column in the file to be
  imported.
- `FORMAT`: Timestamp column format when the format is not the default
  (`yyyy-MM-ddTHH:mm:ss.SSSUUUZ`) or cannot be detected. See
  [Date and Timestamp format](/docs/query/functions/date-time/#timestamp-format)
  for more information.
- `DELIMITER`: Default setting is `,`.
- `PARTITION BY`: Partition unit.
- `ON ERROR`: Define responses to data parsing errors. The valid values are:
    - `SKIP_ROW`: Skip the entire row
    - `SKIP_COLUMN`: Skip column and use the default value (`null` for nullable
      types, `false` for boolean, `0` for other non-nullable types)
    - `ABORT`: Abort whole import on first error, and restore the pre-import table
      status

### Examples

For more details on parallel import, please also see
[Importing data in bulk via CSV](/docs/ingestion/import-csv/#import-csv-via-copy-sql).

```questdb-sql title="COPY"
COPY weather FROM 'weather.csv' WITH HEADER true FORMAT 'yyyy-MM-ddTHH:mm:ss.SSSUUUZ' ON ERROR SKIP_ROW;
```

Starts an import asynchronously and returns an import id string:

| id               |
| ---------------- |
| 55ca24e5ba328050 |

The log can be accessed by querying:

```questdb-sql
SELECT * FROM 'sys.text_import_log' WHERE id = '55ca24e5ba328050';
```

A sample log table:

| ts                          | id               | table   | file        | phase | status  | message | rows_handled | rows_imported | errors |
| --------------------------- | ---------------- | ------- | ----------- | ----- | ------- | ------- | ------------ | ------------- | ------ |
| 2022-08-03T10:40:25.586455Z | 55ca24e5ba328050 | weather | weather.csv |       | started |         |              |               | 0      |
|                             |                  |         |             |       |         |         |              |               |        |

While it is running, import can be cancelled with:

```questdb-sql
COPY '55ca24e5ba328050' CANCEL;
```

Within a few seconds import should stop and message with 'cancelled' status
should appear in text_import_log, e.g.:

```questdb-sql
SELECT * FROM 'sys.text_import_log' WHERE id = '55ca24e5ba328050' LIMIT -1;
```

| ts                          | id               | table   | file        | phase | status    | message                                                    | rows_handled | rows_imported | errors |
| :-------------------------- | ---------------- | ------- | ----------- | ----- | --------- | ---------------------------------------------------------- | ------------ | ------------- | ------ |
| 2022-08-03T14:04:42.268502Z | 55ca24e5ba328050 | weather | weather.csv | null  | cancelled | import cancelled [phase=partition_import, msg=`Cancelled`] | 0            | 0             | 0      |


## Export mode (COPY-TO)

Exports data from a table or query result set to Parquet format. The export is performed asynchronously and non-blocking, allowing writes to continue during the export process.

**Key features:**

- Export entire tables or query results
- Configurable Parquet export options (compression, row group size, etc.)
- Non-blocking exports - writes continue during export
- Supports partitioned exports matching table partitioning
- Configurable size limits

### Export root

:::warning

Parquet exports currently require writing interim data to disk, and therefore must be run on **read-write instances only**.

This limitation will be removed in future.

:::

The export destination is relative to `cairo.sql.copy.export.root` (defaults to `root_directory/export`). You can configure this through the [configuration settings](/docs/configuration/overview/).

### Logs

`COPY-TO` reports its progress through a system table, `sys.copy_export_log`. This contains the following information:


| Column name        | Data type | Notes                                                                                                                                               |
|--------------------|-----------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| ts                 | timestamp | The log event timestamp                                                                                                                             |
| id                 | string    | Export id                                                                                                                                           |
| table_name         | symbol    | Source table name (or 'query' for subquery exports)                                                                                                 |
| export_path        | symbol    | The destination directory path                                                                                                                      |
| num_exported_files | int       | The number of files exported                                                                                                                        |
| phase              | symbol    | The export execution phase: none, wait_to_run, populating_temp_table, converting_partitions, move_files, dropping_temp_table, sending_data, success |
| status             | symbol    | The event status: started, finished, failed, cancelled                                                                                              |
| message            | VARCHAR   | Information about the current phase/step                                                                                                            |
| errors             | long      | Error code(s)                                                                                                                                       |

Log table row retention is configurable through `cairo.sql.copy.log.retention.days` setting, and is three days by default.

`COPY TO` returns an `id` value from `sys.copy_export_log` to track the export progress.

### Options

All export options are specified using the `WITH` clause after the `TO` destination path.

- `FORMAT PARQUET`: Specifies Parquet as the export format (currently the only supported format). Default: `PARQUET`.
- `PARTITION_BY <unit>`: Partition the export by time unit. Valid values: `NONE`, `HOUR`, `DAY`, `WEEK`, `MONTH`, `YEAR`. Default: matches the source table's partitioning, or `NONE` for queries.
- `COMPRESSION_CODEC <codec>`: Parquet compression algorithm. Valid values: `UNCOMPRESSED`, `SNAPPY`, `GZIP`, `LZ4`, `ZSTD`, `LZ4_RAW`. Default: `LZ4_RAW`.
- `COMPRESSION_LEVEL <n>`: Compression level (codec-specific). Higher values mean better compression but slower speed. Default: varies by codec.
- `ROW_GROUP_SIZE <n>`: Number of rows per Parquet row group. Larger values improve compression but increase memory usage. Default: `100000`.
- `DATA_PAGE_SIZE <n>`: Size of data pages within row groups in bytes. Default: `1048576` (1MB).
- `STATISTICS_ENABLED true/false`: Enable Parquet column statistics for better query performance. Default: `true`.
- `PARQUET_VERSION <n>`: Parquet format version. Valid values: `1` (v1.0) or `2` (v2.0). Default: `2`.
- `RAW_ARRAY_ENCODING true/false`: Use raw encoding for arrays (compatibility for parquet readers). Default: `true`.

## Examples

#### Export entire table to Parquet

Export a complete table to Parquet format:

```questdb-sql title="Export table to Parquet"
COPY trades TO 'trades_export' WITH FORMAT PARQUET;
```

Returns an export ID:

| id               |
| ---------------- |
| 7f3a9c2e1b456789 |

Track export progress:

```questdb-sql
SELECT * FROM sys.copy_export_log WHERE id = '7f3a9c2e1b456789';
```

This will copy all of the partitions from `trades`, and convert them individually to parquet.

If partitioning of `NONE` is used, then a single parquet file will be generated instead.

#### Export query results to Parquet

Export the results of a query:

```questdb-sql title="Export filtered data"
COPY (SELECT * FROM trades WHERE timestamp IN today() AND symbol = 'BTC-USD')
TO 'btc_today'
WITH FORMAT PARQUET;
```

This will export the result set to a single parquet file.

#### Export with partitioning

Export data partitioned by day:

```questdb-sql title="Export with daily partitions"
COPY trades TO 'trades_daily'
WITH FORMAT PARQUET
PARTITION_BY DAY;
```

The underlying table does not already need to be partitioned. Likewise, you can output query results as partitions:

```questdb-sql title=Export queries with partitions
COPY (
    SELECT generate_series as date 
    FROM generate_series('2025-01-01', '2025-02-01', '1d')
) 
TO 'dates'
WITH FORMAT PARQUET
PARTITION_BY DAY;
```

This creates separate Parquet files for each day's data in subdirectories named by date. For example:

- export
  - dates
    - 2025-01-01.parquet
    - 2025-01-02.parquet
    - 2025-01-03.parquet
    - ...

#### Export with custom Parquet options

Configure compression, row group size, and other Parquet settings:

```questdb-sql title="Export with custom compression"
COPY trades TO 'trades_compressed'
WITH
    FORMAT PARQUET
    COMPRESSION_CODEC ZSTD
    COMPRESSION_LEVEL 9
    ROW_GROUP_SIZE 1000000
    DATA_PAGE_SIZE 2097152;
```

This allows you to tune each export request to your particular needs.

#### Export aggregated data

Export aggregated results for analysis:

```questdb-sql title="Export OHLCV data"
COPY (
    SELECT
        timestamp,
        symbol,
        first(price) AS open,
        max(price) AS high,
        min(price) AS low,
        last(price) AS close,
        sum(amount) AS volume
    FROM trades
    WHERE timestamp > dateadd('d', -7, now())
    SAMPLE BY 1h
)
TO 'ohlcv_7d'
WITH FORMAT PARQUET;
```

#### Monitor export status

Check all recent exports:

```questdb-sql title="View export history"
SELECT ts, table, destination, status, rows_exported
FROM sys.copy_export_log
WHERE ts > dateadd('d', -1, now())
ORDER BY ts DESC;
```

Sample output:

| ts                          | table  | destination      | status   | rows_exported |
| --------------------------- | ------ | ---------------- | -------- | ------------- |
| 2024-10-01T14:23:15.123456Z | trades | trades_export    | finished | 1000000       |
| 2024-10-01T13:45:22.654321Z | query  | btc_today        | finished | 45672         |
| 2024-10-01T12:30:11.987654Z | trades | trades_daily     | finished | 1000000       |
