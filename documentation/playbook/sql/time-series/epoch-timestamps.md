---
title: Query with Epoch Timestamps
sidebar_label: Epoch timestamps
description: Use epoch timestamps in milliseconds or microseconds for timestamp filtering and comparisons
---

Query QuestDB using epoch timestamps (Unix time) in milliseconds, microseconds, or nanoseconds. This is useful when working with systems that represent time as integers rather than timestamp strings.

## Problem: Epoch Time from External Systems

Your application or API provides timestamps as epoch integers:
- JavaScript: `1746552420000` (milliseconds since 1970-01-01)
- Python time(): `1746552420.123456` (seconds with decimals)
- Go/Java: `1746552420000000` (microseconds)

You need to query QuestDB using these values.

## Solution: Use Epoch Directly in WHERE Clause

QuestDB stores timestamps as microseconds internally and accepts epoch values in timestamp comparisons:

```questdb-sql demo title="Query with epoch milliseconds"
SELECT * FROM trades
WHERE timestamp BETWEEN 1746552420000000 AND 1746811620000000;
```

**Important:** QuestDB expects **microseconds** by default. Multiply milliseconds by 1000.

## Understanding QuestDB Timestamp Precision

QuestDB uses **microseconds** as its default timestamp precision:

| Unit | Example | Multiply by |
|------|---------|-------------|
| Seconds | `1746552420` | × 1,000,000 |
| Milliseconds | `1746552420000` | × 1,000 |
| Microseconds | `1746552420000000` | × 1 (native) |
| Nanoseconds | `1746552420000000000` | ÷ 1000 (for `timestamp_ns` type only) |

**Converting to microseconds:**
```sql
-- From milliseconds (JavaScript, most APIs)
SELECT * FROM trades
WHERE timestamp >= 1746552420000 * 1000;

-- From seconds (Unix timestamp)
SELECT * FROM trades
WHERE timestamp >= 1746552420 * 1000000;
```

## Epoch to Timestamp Conversion

Convert epoch values to readable timestamps:

```questdb-sql demo title="Convert epoch to timestamp for display"
SELECT
  timestamp,
  cast(timestamp AS long) as epoch_micros,
  cast(timestamp AS long) / 1000 as epoch_millis,
  cast(timestamp AS long) / 1000000 as epoch_seconds
FROM trades
LIMIT 5;
```

**Results:**

| timestamp | epoch_micros | epoch_millis | epoch_seconds |
|-----------|--------------|--------------|---------------|
| 2025-01-15T10:30:45.123456Z | 1737456645123456 | 1737456645123 | 1737456645 |

## Timestamp to Epoch Conversion

Convert timestamp strings to epoch values:

```questdb-sql demo title="Convert timestamp string to epoch"
SELECT
  cast('2025-01-15T10:30:45.123Z' AS timestamp) as ts,
  cast(cast('2025-01-15T10:30:45.123Z' AS timestamp) AS long) as epoch_micros,
  cast(cast('2025-01-15T10:30:45.123Z' AS timestamp) AS long) / 1000 as epoch_millis
```

## Working with Milliseconds from JavaScript

JavaScript `Date.now()` returns milliseconds. Convert for QuestDB:

**JavaScript:**
```javascript
const now = Date.now();  // e.g., 1746552420000
const queryStart = now - (24 * 60 * 60 * 1000);  // 24 hours ago

// Query QuestDB (multiply by 1000 for microseconds)
const query = `
  SELECT * FROM trades
  WHERE timestamp >= ${queryStart * 1000}
    AND timestamp <= ${now * 1000}
`;
```

**Python:**
```python
import time

now_seconds = time.time()  # e.g., 1746552420.123456
now_micros = int(now_seconds * 1_000_000)

query = f"""
  SELECT * FROM trades
  WHERE timestamp >= {now_micros - 86400000000}
    AND timestamp <= {now_micros}
"""
```

## Comparative Queries

**Using timestamp strings:**
```sql
SELECT * FROM trades
WHERE timestamp BETWEEN '2025-01-15T00:00:00' AND '2025-01-16T00:00:00';
```

**Using epoch microseconds (equivalent):**
```sql
SELECT * FROM trades
WHERE timestamp BETWEEN 1737417600000000 AND 1737504000000000;
```

**Performance:** Both are equally fast - QuestDB converts strings to microseconds internally.

## Time Range with Epoch

Calculate time ranges using epoch values:

```questdb-sql demo title="Last 7 days using epoch calculation"
DECLARE
  @now := cast(now() AS long),
  @week_ago := @now - (7 * 24 * 60 * 60 * 1000000)
SELECT * FROM trades
WHERE timestamp >= @week_ago
LIMIT 100;
```

**Breakdown:**
- 7 days = 7 × 24 × 60 × 60 × 1,000,000 microseconds
- Subtract from current timestamp to get cutoff

## Aggregating by Epoch Intervals

Group by time using epoch arithmetic:

```questdb-sql demo title="Aggregate by 5-minute intervals using epoch"
SELECT
  (cast(timestamp AS long) / 300000000) * 300000000 as interval_start,
  count(*) as trade_count,
  avg(price) as avg_price
FROM trades
WHERE timestamp >= dateadd('d', -1, now())
GROUP BY interval_start
ORDER BY interval_start;
```

**Calculation:**
- 5 minutes = 300 seconds = 300,000,000 microseconds
- Divide, truncate (integer division), multiply back to get interval start

**Better alternative:**
```sql
SELECT
  timestamp_floor('5m', timestamp) as interval_start,
  count(*) as trade_count
FROM trades
SAMPLE BY 5m;
```

## Nanosecond Precision

For `timestamp_ns` columns (nanosecond precision):

```sql
-- Create table with nanosecond precision
CREATE TABLE high_freq_trades (
  symbol SYMBOL,
  price DOUBLE,
  timestamp_ns TIMESTAMP_NS
) TIMESTAMP(timestamp_ns);

-- Query with nanosecond epoch
SELECT * FROM high_freq_trades
WHERE timestamp_ns BETWEEN 1746552420000000000 AND 1746811620000000000;
```

Note: Multiply microseconds by 1000 or milliseconds by 1,000,000 for nanoseconds.

## Dynamic Epoch from Current Time

Calculate epoch values relative to now:

```questdb-sql demo title="Calculate epoch for queries"
SELECT
  cast(now() AS long) as current_epoch_micros,
  cast(dateadd('h', -1, now()) AS long) as one_hour_ago_micros,
  cast(dateadd('d', -7, now()) AS long) as one_week_ago_micros;
```

Use these values in application queries:

```sql
-- In your application, get the epoch value:
-- epoch_start = execute("SELECT cast(dateadd('d', -1, now()) AS long)")

-- Then use in parameterized query:
SELECT * FROM trades WHERE timestamp >= ?
```

## Common Epoch Conversions

| Duration | Microseconds | Milliseconds | Seconds |
|----------|--------------|--------------|---------|
| 1 second | 1,000,000 | 1,000 | 1 |
| 1 minute | 60,000,000 | 60,000 | 60 |
| 1 hour | 3,600,000,000 | 3,600,000 | 3,600 |
| 1 day | 86,400,000,000 | 86,400,000 | 86,400 |
| 1 week | 604,800,000,000 | 604,800,000 | 604,800 |

## Debugging Epoch Values

Convert suspect epoch values to verify correctness:

```questdb-sql demo title="Verify epoch timestamp"
SELECT
  1746552420000000 as input_micros,
  cast(1746552420000000 as timestamp) as as_timestamp,
  CASE
    WHEN cast(1746552420000000 as timestamp) > '1970-01-01' THEN 'Valid'
    ELSE 'Invalid - too small'
  END as validity;
```

**Common mistakes:**
- Using milliseconds instead of microseconds (off by 1000x)
- Using seconds instead of microseconds (off by 1,000,000x)
- Wrong epoch (some systems use 1900 or 2000 as base)

## Mixed Epoch and String Queries

You can mix epoch and string timestamps in the same query:

```sql
SELECT * FROM trades
WHERE timestamp >= 1746552420000000  -- Epoch microseconds
  AND timestamp < '2025-01-16T00:00:00'  -- Timestamp string
  AND symbol = 'BTC-USDT';
```

QuestDB handles both formats seamlessly.

:::tip When to Use Epoch
Use epoch timestamps when:
- Interfacing with systems that provide epoch time
- Doing arithmetic on timestamps (adding/subtracting microseconds)
- Minimizing string parsing overhead in high-frequency scenarios

Use timestamp strings when:
- Writing queries manually (more readable)
- Debugging timestamp issues
- Working with date/time functions
:::

:::warning Precision Matters
Always verify the precision of your epoch timestamps:
- Milliseconds: 13 digits (e.g., `1746552420000`)
- Microseconds: 16 digits (e.g., `1746552420000000`)
- Nanoseconds: 19 digits (e.g., `1746552420000000000`)

Wrong precision will give incorrect results by factors of 1000x!
:::

:::info Related Documentation
- [CAST function](/docs/reference/sql/cast/)
- [Timestamp types](/docs/reference/sql/datatypes/#timestamp-and-date)
- [dateadd()](/docs/reference/function/date-time/#dateadd)
- [now()](/docs/reference/function/date-time/#now)
:::
