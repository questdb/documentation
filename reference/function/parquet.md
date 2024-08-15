---
title: Parquet functions
sidebar_label: Parquet
description: QuestDB Apache Parquet functions reference documentation.
---

This page introduces the [Apache Parquet](/glossary/apache-parquet/) read function.

:::info

Apache Parquet support is in **beta**.

It may not be fit for production use.

Please let us know if you run into issues.

Either:

1. Email us at [support@questdb.io](mailto:support@questdb.io)
2. Join our [public Slack](https://slack.questdb.io/)
3. Post on our [Discourse community](https://community.questdb.io/)

:::

## read_parquet

Reads a parquet file as a table.

`read_parquet(parquet_file_path)`

### Usage

With this function, query a Parquet file located at the QuestDB copy root directory. Both relative and absolute file
paths are supported.

```questdb-sql title="read_parquet example"
SELECT
  *
FROM
  read_parquet('trades.parquet')
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

Parquet format support rich set of data types, including structural types. QuestDB only can read data types that match
QuestDB data types:

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

Multiple files are not suppored, only a single file.

Nested data and/or arrays are not supported.
