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

## parquet_read

Reads a parquet file as a table.

`parquet_read(parquet_file_path)`

### Usage

With this function, query a Parquet file located at the QuestDB copy root directory. Both relative and absolute file paths are supported.

```questdb-sql title="parquet_read example"
SELECT
  *
FROM
  read_parquet('trades.parquet')
WHERE
  side = 'buy'
LIMIT 1;
```

| symbol  | side | price   | amount     | timestamp                   |
|---------|------|---------|:-----------|-----------------------------|
| BTC-USD | buy  | 62755.6 | 0.00043367 | 2024-07-01T00:46:39.754075Z |

The query above:

- Reads all columns from the file `trades.parquet` located at the server copy root directory, 
  i.e. `import/trades.parquet` in the QuestDB copy root directory by default.
- Filters rows, keeping only the first row where the `side` column equals `buy`.

### Configuration

For security reason, reading is only allowed from a specified directory. It defaults to the `import` directory
inside the QuestDB copy root directory. To change the allowed directory, set the `cairo.sql.copy.root` 
configuration by using one of the following settings:
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

Multiple files are not suppored, only a single file.

Nested data and/or arrays are not supported.
