---
title: Parquet functions
sidebar_label: Parquet
description: QuestDB Apache Parquet functions reference documentation.
---

QuestDB can read and query external [Apache Parquet](/glossary/apache-parquet/) files using SQL.

To export data as Parquet, see [Parquet Export](/docs/query/export-parquet/).

:::info
Apache Parquet support is in **beta**. Please report issues via [email](mailto:support@questdb.io), [Slack](https://slack.questdb.com/), or [Discourse](https://community.questdb.com/).
:::

## read_parquet

Reads a parquet file as a table.

`read_parquet(parquet_file_path)`

### Usage

The file path must be within the [configured root directory](#configuration). It can be specified as a relative path (resolved under the root) or as an absolute path (which must still start with the root directory). Path traversal (`../`) is not allowed.

```questdb-sql title="Relative path"
SELECT * FROM read_parquet('trades.parquet')
WHERE side = 'buy'
LIMIT 1;
```

| symbol  | side | price   | amount     | timestamp                   |
|---------|------|---------|:-----------|-----------------------------|
| BTC-USD | buy  | 62755.6 | 0.00043367 | 2024-07-01T00:46:39.754075Z |

```questdb-sql title="Absolute path (must be within the configured root)"
SELECT * FROM read_parquet('/var/lib/questdb/import/trades.parquet');
```

```questdb-sql title="Join a Parquet file with a QuestDB table"
SELECT t.symbol, t.price, r.label
FROM read_parquet('trades.parquet') t
JOIN ref_data r ON t.symbol = r.symbol;
```

### Configuration

For security reasons, reading is only allowed from a configured directory. By default, this is the `import` directory
inside the QuestDB root directory (e.g. `/var/lib/questdb/import/`). To change it, set `cairo.sql.copy.root`:

- In `server.conf`: `cairo.sql.copy.root=/path/to/dir`
- Or via the environment variable `QDB_CAIRO_SQL_COPY_ROOT`

### Limitations

Parquet format supports a rich set of data types, including structural types. QuestDB can only read Parquet columns whose types map to QuestDB types:

- Boolean
- Byte
- Short
- Char
- Int
- Long
- Long128
- Long256
- Float
- Double
- Varchar (also reads Symbol columns as Varchar)
- Timestamp
- Date
- UUID
- IPv4
- GeoHash (Byte, Short, Int, Long)
- Binary
- Array (Double)

Parquet columns with unsupported data types are ignored.

Only a single file can be read per `read_parquet` call.
