---
title: Copy Data Between QuestDB Instances
sidebar_label: Copy data between instances
description: Copy a subset of data from production to development QuestDB instances
---

Copy a subset of data from one QuestDB instance to another for testing or development purposes.

## Problem

You want to copy data between QuestDB instances. This method allows you to copy any arbitrary query result, but if you want a full database copy please check the [backup and restore documentation](/docs/operations/backup/).

## Solution: Table2Ilp Utility

QuestDB ships with a `utils` folder that includes a tool to read from one instance (using the PostgreSQL protocol) and write into another (using ILP).

You would need to [compile the jar](https://github.com/questdb/questdb/tree/master/utils), and then use it like this:

```shell
java -cp utils.jar io.questdb.cliutil.Table2Ilp \
  -d trades \
  -dilp "https::addr=localhost:9000;username=admin;password=quest;" \
  -s "trades WHERE start_time in '2022-06'" \
  -sc "jdbc:postgresql://localhost:8812/qdb?user=account&password=secret&ssl=false" \
  -sym "ticker,exchange" \
  -sts start_time
```

This reads from the source instance using PostgreSQL wire protocol and writes to the destination using ILP.

## Alternative: Export Endpoint

You can also use [the export endpoint](/docs/reference/api/rest/#exp---export-data) to export data to CSV or other formats.

:::info Related Documentation
- [ILP ingestion](/docs/ingestion-overview/)
- [PostgreSQL wire protocol](/docs/reference/api/postgres/)
- [REST API export](/docs/reference/api/rest/#exp---export-data)
:::
