---
title: Parquet functions
sidebar_label: Parquet
description: Parquet functions reference documentation.
---

This page describes functions to handle JSON data.

## parquet_read

Reads parquet file as a table.

`parquet_read(parquet_file_path)`

### Usage

This function can query a parquet file located at the QuestDB copy root directory. Relative and absolute file paths are supported.

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
   * Reads all columns from file trades.parquet located at the server copy root directory.
   * Filters rows, keeping only trades made on NASDAQ.


### Configuration

For security reason, reading only allowed if copy root directory is configured. To configure
copy root directory

- `cairo.sql.copy.root` must be defined using one of the following settings:
  - The environment variable `QDB_CAIRO_SQL_COPY_ROOT`.
  - The `cairo.sql.copy.root` in `server.conf`.

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