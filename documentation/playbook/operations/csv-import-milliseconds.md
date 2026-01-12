---
title: Import CSV with Millisecond Timestamps
sidebar_label: CSV import with milliseconds
description: Import CSV files with epoch millisecond timestamps into QuestDB
---

Import CSV files containing epoch timestamps in milliseconds into QuestDB, which expects microseconds.

## Problem

QuestDB does not support flags for timestamp conversion during CSV import.

## Solution Options

Here are the options available:

### Option 1: Pre-process the Dataset

Convert timestamps from milliseconds to microseconds before import. If importing lots of data, create Parquet files, copy them to the QuestDB import folder, and read them with `read_parquet('file.parquet')`. Then use `INSERT INTO SELECT` to copy to another table.

### Option 2: Staging Table

Import into a non-partitioned table as DATE, then `INSERT INTO` a partitioned table as TIMESTAMP:

```sql
-- Create staging table
CREATE TABLE trades_staging (
  timestamp_ms LONG,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
);

-- Import CSV to staging table (via web console or REST API)

-- Create final table
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL INDEX,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;

-- Convert and insert
INSERT INTO trades
SELECT
  cast(timestamp_ms * 1000 AS TIMESTAMP) as timestamp,
  symbol,
  price,
  amount
FROM trades_staging;

-- Drop staging table
DROP TABLE trades_staging;
```

You would be using twice the storage temporarily, but then you can drop the initial staging table.

### Option 3: ILP Client

Read the CSV line-by-line and convert, then send via the ILP client.

:::info Related Documentation
- [CSV import](/docs/getting-started/web-console/import-csv/)
- [ILP ingestion](/docs/ingestion/overview/)
- [read_parquet()](/docs/query/functions/parquet/)
:::
