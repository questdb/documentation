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

![Flow chart showing the syntax of the COPY keyword](/img/docs/diagrams/copy.svg)

## Description

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

`COPY` takes up all the available resources. While one import is running, new
request(s) will be rejected.

:::

`COPY '<id>' CANCEL` cancels the copying operation defined by the import `id`,
while an import is taking place.

### Root directory

`COPY` requires a defined root directory where CSV files are saved and copied
from. A CSV file must be saved to the root directory before starting the `COPY`
operation. There are two root directories to be defined:

- `cairo.sql.copy.root` is used for storing regular files to be imported. By default,
  it points to the `root_directory/import` directory. This allows you to drop a CSV
    file into the `import` directory and start the import operation.
- `cairo.sql.copy.work.root` is used for storing temporary files like indexes or
  temporary partitions. Unless otherwise specified, it points to the
  `root_directory/tmp` directory.

Use the [configuration keys](/docs/configuration/) to edit these properties in
[`COPY` configuration settings](/docs/configuration/#bulk-csv-import):

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

### Log table

`COPY` generates a log table,`sys.text_import_log`, tracking `COPY` operation
for the last three days with the following information:

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

\* Available phases for parallel import are:

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

Log table row retention is configurable through
`cairo.sql.copy.log.retention.days` setting, and is three days by default.

`COPY` returns `id` value from `sys.text_import_log` to track the import
progress.

## Options

- `HEADER true/false`: When `true`, QuestDB automatically assumes the first row
  is a header. Otherwise, schema recognition is used to determine whether the
  first row is used as header. The default setting is `false`.
- `TIMESTAMP`: Define the name of the timestamp column in the file to be
  imported.
- `FORMAT`: Timestamp column format when the format is not the default
  (`yyyy-MM-ddTHH:mm:ss.SSSUUUZ`) or cannot be detected. See
  [Date and Timestamp format](/docs/reference/function/date-time/#date-and-timestamp-format)
  for more information.
- `DELIMITER`: Default setting is `,`.
- `PARTITION BY`: Partition unit.
- `ON ERROR`: Define responses to data parsing errors. The valid values are:
  - `SKIP_ROW`: Skip the entire row
  - `SKIP_COLUMN`: Skip column and use the default value (`null` for nullable
    types, `false` for boolean, `0` for other non-nullable types)
  - `ABORT`: Abort whole import on first error, and restore the pre-import table
    status

## Examples

For more details on parallel import, please also see
[Importing data in bulk via CSV](/docs/guides/import-csv/#import-csv-via-copy-sql/).

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
