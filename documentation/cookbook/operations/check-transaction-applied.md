---
title: Check Transaction Applied After Ingestion
sidebar_label: Check transaction applied
description: Verify that all ingested rows to a WAL table are visible for queries in QuestDB
---

When ingesting data to a WAL table using ILP protocol, inserts are asynchronous. This recipe shows how to ensure all ingested rows are visible for read-only queries.

## Problem

You're performing a single-time ingestion of a large data volume using ILP protocol to a table that uses Write-Ahead Log (WAL). Since inserts are asynchronous, you need to confirm that all ingested rows are visible for read-only queries before proceeding with operations.

## Solution

Query the `wal_tables()` function to check if the writer transaction matches the sequencer transaction. When these values match, all rows have become visible:

```questdb-sql demo title="Check applied transactions from WAL files"
SELECT *
FROM wal_tables()
WHERE name = 'core_price' AND writerTxn = sequencerTxn;
```

This query returns a row when `writerTxn` equals `sequencerTxn` for your table:
- `writerTxn` is the last committed transaction available for read-only queries
- `sequencerTxn` is the last transaction committed to WAL

When they match, all WAL transactions have been applied and all rows are visible for queries.

Another viable approach is to run `SELECT count(*) FROM my_table` and verify the expected row count.

:::info Related Documentation
- [Write-Ahead Log concept](/docs/concepts/write-ahead-log/)
- [Meta functions reference](/docs/query/functions/meta/)
- [InfluxDB Line Protocol overview](/docs/ingestion/ilp/overview/)
:::
