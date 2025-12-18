---
title: Query Performance Histogram
sidebar_label: Query times histogram
description: Analyze query performance distributions using query logs and execution metrics for optimization
---

Analyze the distribution of query execution times to identify performance patterns, slow queries, and optimization opportunities. Use query logs and metrics to create histograms showing how query latency varies across your workload.

## Problem: Understanding Query Performance

You need to answer:
- What's the typical query latency?
- How many queries are slow (> 1 second)?
- Are there performance regressions over time?
- Which query patterns are slowest?

Single-point metrics (average, P99) don't show the full picture. A histogram reveals the distribution.

## Solution: Query Log Analysis

QuestDB logs query execution times. Parse logs to create performance histograms.

### Enable Query Logging

**server.conf:**
```properties
# Log all queries (development/staging)
http.query.log.enabled=true

# Or log only slow queries (production)
http.slow.query.log.enabled=true
http.slow.query.threshold=1000  # Log queries > 1 second
```

**Log format:**
```
2025-01-15T10:30:45.123Z I http-server [1234] `SELECT * FROM trades WHERE symbol = 'BTC-USDT'` [exec=15ms, compiler=2ms, rows=1000]
```

## Parse Logs into Table

### Create Query Log Table

```sql
CREATE TABLE query_log (
  timestamp TIMESTAMP,
  query_text STRING,
  exec_time_ms INT,
  compiler_time_ms INT,
  rows_returned LONG
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

### Parse and Insert

**Python script:**
```python
import re
import psycopg2
from datetime import datetime

# Regex to parse QuestDB log lines
log_pattern = r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z).*`([^`]+)`.*\[exec=(\d+)ms, compiler=(\d+)ms, rows=(\d+)\]'

conn = psycopg2.connect(host="localhost", port=8812, user="admin", password="quest", database="questdb")
cursor = conn.cursor()

with open('/var/log/questdb/query.log', 'r') as f:
    for line in f:
        match = re.search(log_pattern, line)
        if match:
            timestamp_str, query, exec_ms, compiler_ms, rows = match.groups()
            timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))

            cursor.execute("""
                INSERT INTO query_log (timestamp, query_text, exec_time_ms, compiler_time_ms, rows_returned)
                VALUES (%s, %s, %s, %s, %s)
            """, (timestamp, query, int(exec_ms), int(compiler_ms), int(rows)))

conn.commit()
conn.close()
```

## Create Performance Histogram

```questdb-sql demo title="Query execution time histogram"
SELECT
  (cast(exec_time_ms / 100 AS INT) * 100) as latency_bucket_ms,
  ((cast(exec_time_ms / 100 AS INT) + 1) * 100) as bucket_end_ms,
  count(*) as query_count,
  (count(*) * 100.0 / sum(count(*)) OVER ()) as percentage
FROM query_log
WHERE timestamp >= dateadd('d', -1, now())
GROUP BY latency_bucket_ms, bucket_end_ms
ORDER BY latency_bucket_ms;
```

**Results:**

| latency_bucket_ms | bucket_end_ms | query_count | percentage |
|-------------------|---------------|-------------|------------|
| 0 | 100 | 45,678 | 91.4% |
| 100 | 200 | 3,456 | 6.9% |
| 200 | 300 | 567 | 1.1% |
| 300 | 400 | 234 | 0.5% |
| 400 | 500 | 45 | 0.09% |
| 500+ | | 20 | 0.04% |

**Interpretation:**
- 91.4% of queries complete in < 100ms (fast)
- 1.7% take > 200ms (investigate these)
- 0.13% take > 400ms (definitely need optimization)

## Time-Series Performance Trends

Track how query performance changes over time:

```questdb-sql demo title="Hourly query performance evolution"
SELECT
  timestamp_floor('h', timestamp) as hour,
  (cast(exec_time_ms / 50 AS INT) * 50) as latency_bucket,
  count(*) as count
FROM query_log
WHERE timestamp >= dateadd('d', -7, now())
GROUP BY hour, latency_bucket
ORDER BY hour DESC, latency_bucket;
```

Visualize in Grafana heatmap to see performance degradation over time.

## Percentile Analysis

Calculate latency percentiles:

```questdb-sql demo title="Query latency percentiles"
SELECT
  percentile(exec_time_ms, 50) as p50_ms,
  percentile(exec_time_ms, 90) as p90_ms,
  percentile(exec_time_ms, 95) as p95_ms,
  percentile(exec_time_ms, 99) as p99_ms,
  percentile(exec_time_ms, 99.9) as p999_ms,
  max(exec_time_ms) as max_ms
FROM query_log
WHERE timestamp >= dateadd('d', -1, now());
```

**Results:**

| p50_ms | p90_ms | p95_ms | p99_ms | p999_ms | max_ms |
|--------|--------|--------|--------|---------|--------|
| 12 | 45 | 89 | 234 | 1,234 | 15,678 |

## Identify Slow Query Patterns

Find which query patterns are slowest:

```questdb-sql demo title="Slowest query patterns"
WITH normalized AS (
  SELECT
    exec_time_ms,
    -- Normalize query (remove values, keep structure)
    regexp_replace(query_text, '\d+', 'N', 'g') as query_pattern,
    regexp_replace(
      regexp_replace(query_text, '''[^'']*''', '''S''', 'g'),
      '\d+', 'N', 'g'
    ) as query_normalized
  FROM query_log
  WHERE timestamp >= dateadd('d', -1, now())
)
SELECT
  query_pattern,
  count(*) as execution_count,
  avg(exec_time_ms) as avg_ms,
  percentile(exec_time_ms, 95) as p95_ms,
  max(exec_time_ms) as max_ms
FROM normalized
GROUP BY query_pattern
HAVING count(*) >= 10  -- At least 10 executions
ORDER BY avg_ms DESC
LIMIT 20;
```

**Results:**

| query_pattern | execution_count | avg_ms | p95_ms | max_ms |
|---------------|-----------------|--------|--------|--------|
| SELECT * FROM trades WHERE timestamp BETWEEN ... | 1,234 | 456 | 890 | 2,345 |
| SELECT symbol, sum(amount) FROM trades GROUP BY ... | 567 | 234 | 456 | 1,234 |

## Slowest Individual Queries

Find actual slow query instances:

```questdb-sql demo title="Top 20 slowest queries"
SELECT
  timestamp,
  exec_time_ms,
  rows_returned,
  substr(query_text, 1, 100) as query_preview
FROM query_log
WHERE timestamp >= dateadd('d', -1, now())
ORDER BY exec_time_ms DESC
LIMIT 20;
```

## Query Performance by Table

Analyze which tables have slow queries:

```questdb-sql demo title="Performance by table accessed"
SELECT
  CASE
    WHEN query_text LIKE '%FROM trades%' THEN 'trades'
    WHEN query_text LIKE '%FROM sensor_readings%' THEN 'sensor_readings'
    WHEN query_text LIKE '%FROM api_logs%' THEN 'api_logs'
    ELSE 'other'
  END as table_name,
  count(*) as query_count,
  avg(exec_time_ms) as avg_exec_ms,
  percentile(exec_time_ms, 95) as p95_exec_ms
FROM query_log
WHERE timestamp >= dateadd('d', -1, now())
GROUP BY table_name
ORDER BY avg_exec_ms DESC;
```

## Grafana Dashboard

### Query Latency Heatmap

```questdb-sql demo title="Heatmap data for Grafana"
SELECT
  timestamp_floor('5m', timestamp) as time,
  (cast(exec_time_ms / 50 AS INT) * 50) as latency_bucket,
  count(*) as count
FROM query_log
WHERE $__timeFilter(timestamp)
GROUP BY time, latency_bucket
ORDER BY time, latency_bucket;
```

**Grafana config:**
- Visualization: Heatmap
- X-axis: time
- Y-axis: latency_bucket
- Cell value: count

### Query Rate and Latency

```questdb-sql demo title="Query rate and P95 latency"
SELECT
  timestamp_floor('1m', timestamp) as time,
  count(*) as "Query Rate (QPM)",
  percentile(exec_time_ms, 95) as "P95 Latency (ms)"
FROM query_log
WHERE $__timeFilter(timestamp)
SAMPLE BY 1m;
```

## Using Prometheus Metrics (Alternative)

QuestDB exposes Prometheus metrics at `http://localhost:9003/metrics`:

```
# HELP questdb_json_queries_total
questdb_json_queries_total 123456

# HELP questdb_json_queries_completed
questdb_json_queries_completed 123450

# HELP questdb_json_queries_failed
questdb_json_queries_failed 6
```

Scrape into Prometheus, then query:

```promql
# Query rate
rate(questdb_json_queries_completed[5m])

# Error rate
rate(questdb_json_queries_failed[5m]) / rate(questdb_json_queries_total[5m])
```

## Custom Query Instrumentation

Add custom timing in application code:

**Python example:**
```python
import time
import psycopg2

conn = psycopg2.connect(...)
cursor = conn.cursor()

start = time.time()
cursor.execute("SELECT * FROM trades WHERE symbol = %s", ("BTC-USDT",))
results = cursor.fetchall()
elapsed_ms = (time.time() - start) * 1000

# Log to monitoring system
logger.info(f"Query completed in {elapsed_ms:.2f}ms, returned {len(results)} rows")

# Or insert into query_log table
cursor.execute("""
    INSERT INTO query_log (timestamp, query_text, exec_time_ms, rows_returned)
    VALUES (now(), %s, %s, %s)
""", ("SELECT * FROM trades WHERE symbol = ?", int(elapsed_ms), len(results)))

conn.close()
```

## Query Performance Alerts

Set up alerts for slow queries:

```sql
-- Queries taking > 1 second in last 5 minutes
SELECT count(*) as slow_query_count
FROM query_log
WHERE timestamp >= dateadd('m', -5, now())
  AND exec_time_ms > 1000;
```

**Alert if** `slow_query_count > 10`.

## Optimization Workflow

1. **Identify slow patterns** (from histogram)
2. **Get example queries** (slow query log)
3. **Analyze query plan** (EXPLAIN)
4. **Add indexes** (on filtered/joined columns)
5. **Verify improvement** (re-run histogram)

**Before optimization:**
```
P95: 890ms
P99: 2,345ms
```

**After adding index:**
```
P95: 45ms (-94.9%)
P99: 123ms (-94.8%)
```

## Comparing Time Periods

Compare query performance week-over-week:

```questdb-sql demo title="Week-over-week latency comparison"
WITH this_week AS (
  SELECT
    avg(exec_time_ms) as avg_latency,
    percentile(exec_time_ms, 95) as p95_latency
  FROM query_log
  WHERE timestamp >= dateadd('d', -7, now())
),
last_week AS (
  SELECT
    avg(exec_time_ms) as avg_latency,
    percentile(exec_time_ms, 95) as p95_latency
  FROM query_log
  WHERE timestamp >= dateadd('d', -14, now())
    AND timestamp < dateadd('d', -7, now())
)
SELECT
  'This Week' as period,
  this_week.avg_latency,
  this_week.p95_latency,
  (this_week.avg_latency - last_week.avg_latency) as avg_change,
  ((this_week.avg_latency - last_week.avg_latency) / last_week.avg_latency * 100) as avg_pct_change
FROM this_week, last_week

UNION ALL

SELECT
  'Last Week',
  last_week.avg_latency,
  last_week.p95_latency,
  0,
  0
FROM last_week;
```

**Alerts:**
- If `avg_pct_change > 20%`: Performance regression
- If `avg_pct_change < -20%`: Performance improvement

:::tip Monitoring Best Practices
1. **Log selectively in production**: Use slow query logging only (threshold 500-1000ms)
2. **Sample high-QPS endpoints**: Log 1% of fast queries to reduce overhead
3. **Rotate logs**: Prevent disk space issues
4. **Index query_log table**: For fast analysis queries
5. **Set up alerts**: Automated detection of performance degradation
:::

:::warning Log Volume
Full query logging can generate significant data:
- 1,000 QPS × 86,400 seconds/day = 86.4M log entries/day
- Use sampling or slow query logging in production
- Rotate and archive old logs regularly
:::

:::info Related Documentation
- [HTTP slow query logging](/docs/configuration/)
- [Prometheus metrics](/docs/operations/logging-metrics/)
- [percentile() function](/docs/reference/function/aggregation/#percentile)
- [Grafana integration](/docs/third-party-tools/grafana/)
:::
