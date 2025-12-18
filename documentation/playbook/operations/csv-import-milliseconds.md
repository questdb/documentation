---
title: Import CSV with Millisecond Timestamps
sidebar_label: CSV import with milliseconds
description: Import CSV files with epoch millisecond timestamps and convert them to QuestDB's microsecond format
---

Import CSV files containing epoch timestamps in milliseconds (common from JavaScript, Python, and many APIs) and convert them to QuestDB's native microsecond format during import.

## Problem: CSV with Millisecond Epoch Timestamps

You have a CSV file with timestamps as epoch milliseconds:

**trades.csv:**
```csv
timestamp,symbol,price,amount
1737456645123,BTC-USDT,61234.50,0.123
1737456645456,ETH-USDT,3456.78,1.234
1737456645789,BTC-USDT,61235.00,0.456
```

QuestDB expects timestamps in microseconds, so direct import will create incorrect dates (off by 1000x).

## Solution 1: Convert During Web Console Import

The QuestDB web console CSV import tool automatically detects and converts epoch timestamps.

**Steps:**
1. Navigate to QuestDB web console (http://localhost:9000)
2. Click "Import" in the top navigation
3. Select your CSV file or drag and drop
4. In the schema detection screen:
   - QuestDB detects the `timestamp` column type
   - If detected as LONG, manually change to TIMESTAMP
   - Check "Partition by" timestamp if appropriate
5. Click "Import"

**Note:** The web console auto-detects milliseconds vs microseconds based on value magnitude.

## Solution 2: REST API with Schema Definition

Define the schema explicitly in the REST API call:

```bash
curl -F data=@trades.csv \
  -F schema='[
    {"name": "timestamp", "type": "TIMESTAMP", "pattern": "epoch"},
    {"name": "symbol", "type": "SYMBOL"},
    {"name": "price", "type": "DOUBLE"},
    {"name": "amount", "type": "DOUBLE"}
  ]' \
  -F timestamp=timestamp \
  -F partitionBy=DAY \
  http://localhost:9000/imp
```

**Key parameters:**
- `"pattern": "epoch"`: Tells QuestDB to interpret as epoch timestamp
- `"type": "TIMESTAMP"`: Column type
- `timestamp=timestamp`: Designate as table's designated timestamp
- `partitionBy=DAY`: Partition strategy

The REST API automatically detects milliseconds vs microseconds.

## Solution 3: SQL COPY Command with Conversion

For QuestDB 8.0+, use the COPY command with timestamp conversion:

```sql
COPY trades FROM 'trades.csv'
WITH HEADER true
FORMAT CSV
TIMESTAMP timestamp
PARTITION BY DAY;
```

QuestDB's CSV parser automatically handles epoch millisecond detection and conversion.

## Solution 4: Pre-Convert in Source System

Convert to microseconds before export:

**JavaScript:**
```javascript
const timestampMicros = Date.now() * 1000;  // Milliseconds * 1000 = microseconds
console.log(`${timestampMicros},BTC-USDT,61234.50,0.123`);
```

**Python:**
```python
import time
timestamp_micros = int(time.time() * 1_000_000)  # Seconds * 1M = microseconds
print(f"{timestamp_micros},BTC-USDT,61234.50,0.123")
```

**SQL (in source database):**
```sql
-- PostgreSQL example
SELECT
  EXTRACT(EPOCH FROM timestamp) * 1000000 AS timestamp_micros,
  symbol, price, amount
FROM trades;
```

Then export with timestamps already in microseconds.

## Solution 5: Import Then Convert with SQL

Import as LONG, then INSERT with conversion:

```sql
-- Step 1: Create staging table with LONG timestamp
CREATE TABLE trades_staging (
  timestamp_ms LONG,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
);

-- Step 2: Import CSV to staging table
-- (via web console or REST API, treating timestamp as LONG)

-- Step 3: Create final table with TIMESTAMP
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL INDEX,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;

-- Step 4: Convert and insert
INSERT INTO trades
SELECT
  cast(timestamp_ms * 1000 AS TIMESTAMP) as timestamp,  -- Milliseconds → microseconds
  symbol,
  price,
  amount
FROM trades_staging;

-- Step 5: Cleanup
DROP TABLE trades_staging;
```

This approach gives you full control over the conversion process.

## Verifying Timestamp Conversion

After import, verify timestamps are correct:

```sql
-- Check first few rows
SELECT * FROM trades LIMIT 5;

-- Verify timestamp range is reasonable
SELECT
  min(timestamp) as earliest,
  max(timestamp) as latest,
  (max(timestamp) - min(timestamp)) / 86400000000 as days_span
FROM trades;

-- Convert back to milliseconds to compare with source
SELECT
  timestamp,
  cast(timestamp AS LONG) / 1000 as timestamp_ms_check,
  symbol,
  price
FROM trades
LIMIT 5;
```

**Expected output:**
- Timestamps should show reasonable dates (not year 1970 or 50,000 AD)
- `days_span` should match your data's timeframe
- `timestamp_ms_check` should match your original CSV values

## Common Mistakes and Fixes

### Mistake 1: Timestamps 1000x Too Large

**Symptom:** Dates show far in the future (year ~50,000 AD)

**Cause:** Imported microseconds as milliseconds (multiplied by 1000 instead of dividing)

**Fix:**
```sql
-- Create corrected table
CREATE TABLE trades_fixed AS
SELECT
  cast(cast(timestamp AS LONG) / 1000 AS TIMESTAMP) as timestamp,
  symbol, price, amount
FROM trades_incorrect
TIMESTAMP(timestamp) PARTITION BY DAY;
```

### Mistake 2: Timestamps 1000x Too Small

**Symptom:** All dates show as 1970-01-01

**Cause:** Imported seconds as microseconds, or milliseconds treated as microseconds

**Fix:**
```sql
-- If original was milliseconds, multiply by 1000
CREATE TABLE trades_fixed AS
SELECT
  cast(cast(timestamp AS LONG) * 1000 AS TIMESTAMP) as timestamp,
  symbol, price, amount
FROM trades_incorrect
TIMESTAMP(timestamp) PARTITION BY DAY;
```

### Mistake 3: Timestamps Imported as Strings

**Symptom:** Timestamp column type is STRING or VARCHAR

**Cause:** CSV importer didn't recognize epoch format

**Fix:**
```sql
INSERT INTO trades_corrected
SELECT
  cast(cast(timestamp_string AS LONG) * 1000 AS TIMESTAMP) as timestamp,
  symbol, price, amount
FROM trades_incorrect;
```

## Handling Mixed Timestamp Formats

If your CSV has some timestamps in ISO format and some in epoch:

```csv
timestamp,symbol,price
2025-01-15T10:30:00.000Z,BTC-USDT,61234.50
1737456645123,ETH-USDT,3456.78
2025-01-15T10:30:01.000Z,BTC-USDT,61235.00
```

**Solution:** Import as STRING, then use CASE to convert:

```sql
CREATE TABLE trades_final AS
SELECT
  CASE
    -- If starts with digit, it's epoch milliseconds
    WHEN timestamp_str ~ '^[0-9]+$' THEN cast(cast(timestamp_str AS LONG) * 1000 AS TIMESTAMP)
    -- Otherwise, parse as ISO string
    ELSE cast(timestamp_str AS TIMESTAMP)
  END as timestamp,
  symbol,
  price
FROM trades_staging
TIMESTAMP(timestamp) PARTITION BY DAY;
```

## Batch Import Multiple CSV Files

Import multiple files with consistent schema:

```bash
#!/bin/bash
# Import all CSV files in directory

for file in data/*.csv; do
  echo "Importing $file..."
  curl -F data=@"$file" \
    -F schema='[
      {"name": "timestamp", "type": "TIMESTAMP", "pattern": "epoch"},
      {"name": "symbol", "type": "SYMBOL"},
      {"name": "price", "type": "DOUBLE"},
      {"name": "amount", "type": "DOUBLE"}
    ]' \
    -F timestamp=timestamp \
    -F name=trades \
    -F overwrite=false \
    http://localhost:9000/imp
done
```

**Key parameter:**
- `overwrite=false`: Append to existing table (default: true would overwrite)

## Import with Timezone Conversion

If timestamps are in milliseconds but represent a specific timezone:

```sql
-- Example: Timestamps are US Eastern Time, convert to UTC
INSERT INTO trades
SELECT
  cast(dateadd('h', 5, cast(timestamp_ms * 1000 AS TIMESTAMP)) AS TIMESTAMP) as timestamp,  -- EST is UTC-5
  symbol,
  price,
  amount
FROM trades_staging;
```

Adjust the hour offset based on your source timezone.

## Performance Tips

**Partition by appropriate interval:**
```sql
-- High-frequency data (millions of rows per day)
PARTITION BY HOUR

-- Medium frequency (thousands per day)
PARTITION BY DAY

-- Low frequency (historical archives)
PARTITION BY MONTH
```

**Use SYMBOL type for repeated strings:**
```sql
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,  -- Not STRING - symbols are interned for efficiency
  exchange SYMBOL,
  side SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

**Disable WAL for bulk initial load:**
```sql
-- Before import
ALTER TABLE trades SET PARAM maxUncommittedRows = 100000;
ALTER TABLE trades SET PARAM o3MaxLag = 0;

-- After import complete
ALTER TABLE trades SET PARAM maxUncommittedRows = 1000;  -- Restore default
```

## Verifying Import Success

**Row count:**
```sql
SELECT count(*) FROM trades;
```

**Timestamp range:**
```sql
SELECT
  to_str(min(timestamp), 'yyyy-MM-dd HH:mm:ss') as earliest,
  to_str(max(timestamp), 'yyyy-MM-dd HH:mm:ss') as latest
FROM trades;
```

**Partition distribution:**
```sql
SELECT
  to_str(timestamp, 'yyyy-MM-dd') as partition,
  count(*) as row_count
FROM trades
GROUP BY partition
ORDER BY partition DESC
LIMIT 10;
```

## Alternative: Use ILP for Programmatic Import

For programmatic imports, consider using InfluxDB Line Protocol instead of CSV:

**Python example:**
```python
from questdb.ingress import Sender

with Sender('localhost', 9009) as sender:
    # timestamp_ms from your data source
    timestamp_micros = timestamp_ms * 1000

    sender.row(
        'trades',
        symbols={'symbol': 'BTC-USDT'},
        columns={'price': 61234.50, 'amount': 0.123},
        at=timestamp_micros)

    sender.flush()
```

ILP handles timestamp precision explicitly and offers better performance for large datasets.

:::tip Automatic Detection
QuestDB's CSV importer automatically detects millisecond vs microsecond vs second epoch timestamps based on value magnitude:
- Values ~1,700,000,000 → seconds
- Values ~1,700,000,000,000 → milliseconds
- Values ~1,700,000,000,000,000 → microseconds

This detection works for timestamps from 2020 onwards.
:::

:::warning Ambiguous Timestamps
Timestamps between 1970 and ~2000 can be ambiguous (seconds could look like milliseconds). For historical data, manually specify the conversion factor or use ISO 8601 string format instead of epoch.
:::

:::info Related Documentation
- [CSV import via Web Console](/docs/operations/importing-data/#web-console-csv-import)
- [REST API import](/docs/operations/importing-data/#rest-api)
- [COPY command](/docs/reference/sql/copy/)
- [Timestamp types](/docs/reference/sql/datatypes/#timestamp-and-date)
- [ILP ingestion](/docs/operations/ingesting-data/#influxdb-line-protocol)
:::
