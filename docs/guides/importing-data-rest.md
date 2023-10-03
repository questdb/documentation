---
title: CSV import via REST API
sidebar_label: Small CSV import
description:
  This document describes how to load CSV data and specify text loader
  configuration for timestamp and date parsing
---

The REST API provides an `/imp` endpoint exposed on port `9000` by default. This
endpoint allows streaming tabular text data directly into a table, supporting
CSV, TAB and pipe (`|`) delimited inputs with optional headers. Data types and
structures are detected automatically, but additional configurations can be
provided to improve automatic detection.

:::note

The REST API is better suited when the following conditions are true:

- Regular uploads of small batches of data into the same table.
- The file batches do not contain overlapping periods (they contain distinct
  days/weeks/months). Otherwise, the import performance will be impacted.

For database migrations, or uploading one large CSV file into QuestDB, users may
consider using the `COPY` SQL command. See
[COPY command documentation](/docs/reference/sql/copy/) and
[Guide on CSV import](/docs/guides/importing-data/) for more details.

:::

### Importing compressed files

It is possible to upload compressed files directly without decompression:

```bash
gzip -cd compressed_data.tsv.gz | curl -v -F data=@- 'http://localhost:9000/imp'
```

The `data=@-` value instructs `curl` to read the file contents from `stdin`.

### Specifying a schema during CSV import

A `schema` JSON object can be provided with POST requests to `/imp` while
creating tables via CSV import. This allows for more control over user-defined
patterns for timestamps, or for explicitly setting types during column-creation.
The following example demonstrates basic usage, in this case, that the
`ticker_name` column should be parsed as `SYMBOL` type instead of `STRING`:

```bash
curl \
  -F schema='[{"name":"ticker_name", "type": "SYMBOL"}]' \
  -F data=@trades.csv 'http://localhost:9000/imp'
```

If a timestamp column (`ts`) in this CSV file has a custom or non-standard
timestamp format, this may be included with the call as follows:

```bash
curl \
  -F schema='[ \
    {"name":"ts", "type": "TIMESTAMP", "pattern": "yyyy-MM-dd - HH:mm:ss"}, \
    {"name":"ticker_name", "type": "SYMBOL"} \
  ]' \
  -F data=@trades.csv 'http://localhost:9000/imp'
```

For **nanosecond-precision** timestamps such as
`2021-06-22T12:08:41.077338934Z`, a pattern can be provided in the following
way:

```bash
curl \
  -F schema='[ \
    {"name":"ts", "type": "TIMESTAMP", "pattern": "yyyy-MM-ddTHH:mm:ss.SSSUUUNNNZ"} \
  ]' \
  -F data=@my_file.csv \
  http://localhost:9000/imp
```

More information on the patterns for timestamps can be found on the
[date and time functions](/docs/reference/function/date-time/#date-and-timestamp-format)
page.

:::note

The `schema` object must precede the `data` object in calls to this REST
endpoint. For example:

```bash
# correct order
curl -F schema='{my_schema_obj}' -F data=@my_file.csv http://localhost:9000/imp
# incorrect order
curl -F data=@my_file.csv -F schema='{my_schema_obj}' http://localhost:9000/imp
```

:::

### Text loader configuration

QuestDB uses a `text_loader.json` configuration file which can be placed in the
server's `conf` directory. This file does not exist by default, but has the
following implicit settings:

```json title="conf/text_loader.json"
{
  "date": [
    {
      "format": "dd/MM/y"
    },
    {
      "format": "yyyy-MM-dd HH:mm:ss"
    },
    {
      "format": "yyyy-MM-ddTHH:mm:ss.SSSz",
      "locale": "en-US",
      "utf8": false
    },
    {
      "format": "MM/dd/y"
    }
  ],
  "timestamp": [
    {
      "format": "yyyy-MM-ddTHH:mm:ss.SSSUUUz",
      "utf8": false
    }
  ]
}
```

#### Example

Given a CSV file which contains timestamps in the format
`yyyy-MM-dd - HH:mm:ss.SSSUUU`, the following text loader configuration will
provide the correct timestamp parsing:

```json title="conf/text_loader.json"
{
  "date": [
    {
      "format": "dd/MM/y"
    },
    {
      "format": "yyyy-MM-dd HH:mm:ss"
    },
    {
      "format": "yyyy-MM-ddTHH:mm:ss.SSSz",
      "locale": "en-US",
      "utf8": false
    },
    {
      "format": "MM/dd/y"
    }
  ],
  "timestamp": [
    {
      "format": "yyyy-MM-ddTHH:mm:ss.SSSUUUz",
      "utf8": false
    },
    {
      "format": "yyyy-MM-dd - HH:mm:ss.SSSUUU",
      "utf8": false
    }
  ]
}
```

The CSV data can then be loaded via POST request, for example, using cURL:

```curl
curl -F data=@weather.csv 'http://localhost:9000/imp'
```

For more information on the `/imp` entry point, refer to the
[REST API documentation](/docs/reference/api/rest/#imp---import-data).
