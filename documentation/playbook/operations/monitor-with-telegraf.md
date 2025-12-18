---
title: Store QuestDB Metrics in QuestDB
sidebar_label: Monitor with Telegraf
description: Scrape QuestDB Prometheus metrics using Telegraf and store them in QuestDB for monitoring dashboards
---

Monitor QuestDB by scraping its Prometheus metrics using Telegraf and storing them back in a QuestDB table. This creates a self-monitoring setup where QuestDB stores its own operational metrics, allowing you to track performance, resource usage, and health over time using familiar SQL queries and Grafana dashboards.

## Problem: Monitor QuestDB Without Prometheus

You want to monitor QuestDB's internal metrics but:
- Don't want to set up a separate Prometheus instance
- Prefer SQL-based analysis over PromQL
- Want to integrate monitoring with existing QuestDB dashboards
- Need long-term metric retention with QuestDB's compression

QuestDB exposes metrics in Prometheus format, and Telegraf can scrape these metrics and write them back to QuestDB.

## Solution: Telegraf as Metrics Bridge

Use Telegraf to:
1. Scrape Prometheus metrics from QuestDB
2. Merge metrics into dense rows
3. Write back to a QuestDB table

### Configuration

This `telegraf.conf` scrapes QuestDB metrics and stores them in QuestDB:

```toml
# Telegraf agent configuration
[agent]
  interval = "5s"
  omit_hostname = true
  precision = "1ms"
  flush_interval = "5s"

# INPUT: Scrape QuestDB Prometheus metrics
[[inputs.prometheus]]
  urls = ["http://localhost:9003/metrics"]
  url_tag = ""                # Omit URL tag (not needed)
  metric_version = 2          # Use v2 for single table output
  ignore_timestamp = false

# AGGREGATOR: Merge metrics into single rows
[[aggregators.merge]]
  drop_original = true

# OUTPUT: Write to QuestDB via ILP over TCP
[[outputs.socket_writer]]
  address = "tcp://localhost:9009"
```

Save this as `telegraf.conf` and start Telegraf:

```bash
telegraf --config telegraf.conf
```

## How It Works

The configuration uses three key components:

### 1. Prometheus Input Plugin

```toml
[[inputs.prometheus]]
  urls = ["http://localhost:9003/metrics"]
```

Scrapes metrics from QuestDB's Prometheus endpoint. You must first enable metrics in QuestDB.

### 2. Merge Aggregator

```toml
[[aggregators.merge]]
  drop_original = true
```

By default, Telegraf creates one sparse row per metric. The merge aggregator combines all metrics collected at the same timestamp into a single dense row, which is more efficient for storage and querying in QuestDB.

### 3. Socket Writer Output

```toml
[[outputs.socket_writer]]
  address = "tcp://localhost:9009"
```

Sends data to QuestDB via ILP over TCP for maximum throughput.

## Enable QuestDB Metrics

QuestDB metrics are disabled by default. Enable them via configuration:

### Option 1: server.conf

Add to `server.conf`:

```ini
metrics.enabled=true
```

### Option 2: Environment Variable

```bash
export QDB_METRICS_ENABLED=true
```

### Option 3: Docker

```bash
docker run \
  -p 9000:9000 \
  -p 8812:8812 \
  -p 9009:9009 \
  -p 9003:9003 \
  -e QDB_METRICS_ENABLED=true \
  questdb/questdb:latest
```

After enabling, metrics are available at `http://localhost:9003/metrics`.

## Verify Metrics Collection

After starting Telegraf, verify data is being collected:

```sql
-- Check if table was created
SELECT * FROM tables() WHERE table_name = 'prometheus';

-- View recent metrics
SELECT * FROM prometheus
ORDER BY timestamp DESC
LIMIT 10;

-- Count metrics collected
SELECT count(*) FROM prometheus;
```

## Querying Metrics

### Available Metrics

QuestDB exposes various metrics including:

```sql
-- See all available metrics (columns)
SELECT column_name FROM table_columns('prometheus')
WHERE column_name NOT IN ('timestamp');
```

Common metrics include:
- `questdb_json_queries_total`: Number of REST API queries
- `questdb_pg_wire_queries_total`: Number of PostgreSQL wire queries
- `questdb_ilp_tcp_*`: ILP over TCP metrics (connections, messages, errors)
- `questdb_ilp_http_*`: ILP over HTTP metrics
- `questdb_memory_*`: Memory usage metrics
- `questdb_wal_*`: Write-Ahead Log metrics

### Example Queries

**Query rate over time:**
```questdb-sql title="Queries per second over last hour"
SELECT
  timestamp,
  questdb_json_queries_total + questdb_pg_wire_queries_total as total_queries
FROM prometheus
WHERE timestamp >= dateadd('h', -1, now())
ORDER BY timestamp DESC;
```

**Memory usage trend:**
```questdb-sql title="Memory usage over last 24 hours"
SELECT
  timestamp_floor('10m', timestamp) as time_bucket,
  avg(questdb_memory_used) as avg_memory_used,
  max(questdb_memory_used) as max_memory_used
FROM prometheus
WHERE timestamp >= dateadd('d', -1, now())
SAMPLE BY 10m;
```

**ILP ingestion rate:**
```questdb-sql title="ILP messages per second"
SELECT
  timestamp_floor('1m', timestamp) as minute,
  max(questdb_ilp_tcp_messages_total) -
    min(questdb_ilp_tcp_messages_total) as messages_per_minute
FROM prometheus
WHERE timestamp >= dateadd('h', -1, now())
SAMPLE BY 1m;
```

**Connection counts:**
```sql
SELECT
  timestamp,
  questdb_ilp_tcp_connections as ilp_tcp_connections,
  questdb_pg_wire_connections as pg_wire_connections
FROM prometheus
WHERE timestamp >= dateadd('h', -1, now())
ORDER BY timestamp DESC
LIMIT 100;
```

## Configuration Options

### Monitoring Multiple QuestDB Instances

To monitor multiple QuestDB instances, add separate input blocks and include instance tags:

```toml
[[inputs.prometheus]]
  urls = ["http://questdb-prod:9003/metrics"]
  [inputs.prometheus.tags]
    instance = "production"

[[inputs.prometheus]]
  urls = ["http://questdb-staging:9003/metrics"]
  [inputs.prometheus.tags]
    instance = "staging"
```

Query by instance:

```sql
SELECT * FROM prometheus
WHERE instance = 'production'
  AND timestamp >= dateadd('h', -1, now());
```

### Adjusting Collection Interval

Change how often metrics are collected:

```toml
[agent]
  interval = "10s"  # Collect every 10 seconds instead of 5
  flush_interval = "10s"
```

Lower intervals provide more granular data but increase storage. Higher intervals reduce overhead.

### Using HTTP Instead of TCP

For more reliable delivery with acknowledgments:

```toml
[[outputs.influxdb_v2]]
  urls = ["http://localhost:9000"]
  token = ""
  content_encoding = "identity"
```

TCP is faster but doesn't confirm delivery. HTTP provides confirmation but slightly lower throughput.

### Filtering Metrics

Exclude unnecessary metrics to reduce storage:

```toml
[[inputs.prometheus]]
  urls = ["http://localhost:9003/metrics"]
  metric_version = 2

  # Only collect specific metrics
  fieldpass = [
    "questdb_json_queries_total",
    "questdb_pg_wire_queries_total",
    "questdb_memory_*",
    "questdb_ilp_*"
  ]
```

## Grafana Dashboard Integration

Create Grafana dashboards using the collected metrics:

```sql
-- Query rate panel
SELECT
  $__timeGroup(timestamp, $__interval) as time,
  avg(questdb_json_queries_total) as "REST API Queries"
FROM prometheus
WHERE $__timeFilter(timestamp)
GROUP BY time
ORDER BY time;

-- Memory usage panel
SELECT
  $__timeGroup(timestamp, $__interval) as time,
  avg(questdb_memory_used / 1024 / 1024) as "Memory Used (MB)"
FROM prometheus
WHERE $__timeFilter(timestamp)
GROUP BY time
ORDER BY time;
```

## Data Retention

Set up automatic cleanup of old metrics:

```sql
-- Drop partitions older than 30 days
ALTER TABLE prometheus DROP PARTITION LIST '2024-01', '2024-02';

-- Or delete old data
DELETE FROM prometheus
WHERE timestamp < dateadd('d', -30, now());
```

Consider partitioning by day or week:

```sql
-- Recreate table with daily partitioning
CREATE TABLE prometheus_new (
  timestamp TIMESTAMP,
  -- ... metric columns ...
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

## Troubleshooting

**No data appearing in QuestDB:**
- Verify QuestDB metrics are enabled: `curl http://localhost:9003/metrics`
- Check Telegraf logs for errors: `telegraf --config telegraf.conf --debug`
- Ensure port 9009 is accessible from Telegraf host
- Verify Telegraf has network connectivity to QuestDB

**Table not created automatically:**
- QuestDB auto-creates tables on first ILP write
- Check for errors in QuestDB logs
- Verify ILP is not disabled in QuestDB configuration

**Metrics are sparse (many NULL values):**
- Ensure merge aggregator is configured: `[[aggregators.merge]]`
- Set `drop_original = true` to discard sparse rows
- Use `metric_version = 2` in prometheus input

**High cardinality warning:**
- Too many unique tag values can cause performance issues
- Remove unnecessary tags using `url_tag = ""`
- Use `omit_hostname = true` if monitoring single instance

## Performance Considerations

**Storage usage:**
- Each metric collection creates one row in QuestDB
- At 5-second intervals: ~17,000 rows/day, ~500K rows/month
- Storage is compressed efficiently due to time-series nature

**Query performance:**
- Add indexes on frequently filtered columns (like `instance` tag)
- Use timestamp filters to limit query scope
- Leverage SAMPLE BY for aggregating data over time

**Impact on monitored QuestDB:**
- Metrics endpoint is lightweight (sub-millisecond response time)
- Telegraf scraping adds minimal overhead
- Consider increasing interval to 30s+ if needed

:::tip Alerting
Combine with monitoring tools to create alerts:
- Query rate drops to zero (instance down)
- Memory usage exceeds threshold
- ILP error rate increases
- WAL segment count grows unexpectedly
:::

:::warning Circular Dependency
Be cautious about monitoring QuestDB with itself - if QuestDB fails, you lose monitoring data. Consider:
- Monitoring multiple QuestDB instances (write metrics from instance A to instance B)
- Setting up external monitoring as backup
- Using persistent storage volumes to preserve data across restarts
:::

:::info Related Documentation
- [QuestDB metrics reference](/docs/operations/health-monitoring/)
- [Telegraf prometheus input](https://github.com/influxdata/telegraf/tree/master/plugins/inputs/prometheus)
- [Telegraf merge aggregator](https://github.com/influxdata/telegraf/tree/master/plugins/aggregators/merge)
- [ILP reference](/docs/reference/api/ilp/overview/)
:::
