---
title: Parquet functions
sidebar_label: Parquet
description: QuestDB Apache Parquet functions reference documentation.
---

This page introduces the [Apache Parquet](/glossary/apache-parquet/) read function.

## parquet_read

Reads a parquet file as a table.

`parquet_read(parquet_file_path)`

### Usage

With this function, query a Parquet file located at the QuestDB copy root directory. Both relative and absolute file paths are supported.

```questdb-sql title="parquet_read example"
SELECT
  *
FROM
  parquet_read('trades.parquet')
WHERE
  exchange == 'NASDAQ'
```

| quantity | price  | exchange | timestamp                 |
| -------- | ------ | -------- | ------------------------- |
| 1000     | 145.09 | NASDAQ   | 2023-07-12T09:30:00.0000Z |

The query above:

- Reads all columns from the file `trades.parquet` located at the server copy root directory.
- Filters rows, keeping only trades made on NASDAQ.

### Configuration

For security reason, reading is only allowed if copy root directory is configured. To configure the copy root directory:

- `cairo.sql.copy.root` must be defined using one of the following settings:
  - The environment variable `QDB_CAIRO_SQL_COPY_ROOT`.
  - The `cairo.sql.copy.root` key in `server.conf`.

### Limitations

Parquet format support rich set of data types, including structural types. QuestDB only can read data types that match QuestDB data types:

- Varchar
- Int
- Long
- Short
- Byte
- Boolean
- UUID
- Double
- Float
- Timestamp
- Binary

Parquet columns with unsupported data types are ignored.
