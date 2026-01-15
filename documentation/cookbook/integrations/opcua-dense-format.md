---
title: Collect OPC-UA data with Telegraf in dense format
sidebar_label: OPC-UA dense format
description: Configure Telegraf to merge sparse OPC-UA metrics into dense rows for efficient storage and querying in QuestDB
---

Configure Telegraf to collect OPC-UA industrial automation data and insert it into QuestDB in a dense format. By default, Telegraf creates one row per metric with sparse columns, but for QuestDB it's more efficient to merge all metrics from the same timestamp into a single dense row.

## Problem: Sparse data format

When using Telegraf's OPC-UA input plugin with the default configuration, each metric value generates a separate row. Even when multiple metrics are collected at the same timestamp, they arrive as individual sparse rows:

**Sparse format (inefficient):**

| timestamp                    | ServerLoad | ServerRAM | ServerIO |
|------------------------------|------------|-----------|----------|
| 2024-01-15T10:00:00.000000Z | 45.2       | NULL      | NULL     |
| 2024-01-15T10:00:00.000000Z | NULL       | 8192.0    | NULL     |
| 2024-01-15T10:00:00.000000Z | NULL       | NULL      | 1250.5   |

This wastes storage space and makes queries more complex.

**Dense format (efficient):**

| timestamp                    | ServerLoad | ServerRAM | ServerIO |
|------------------------------|------------|-----------|----------|
| 2024-01-15T10:00:00.000000Z | 45.2       | 8192.0    | 1250.5   |

## Solution: Use Telegraf's merge aggregator

Configure Telegraf to merge metrics with matching timestamps and tags before sending to QuestDB. This requires two key changes:

1. Add a common tag to all metrics
2. Use the `merge` aggregator to combine rows

### Complete configuration

```toml
[agent]
  omit_hostname = true

# OPC-UA Input Plugin
[[inputs.opcua]]
  endpoint = "${OPCUA_ENDPOINT}"
  connect_timeout = "30s"
  request_timeout = "30s"
  security_policy = "None"
  security_mode = "None"
  auth_method = "Anonymous"
  name_override = "${METRICS_TABLE_NAME}"

  [[inputs.opcua.nodes]]
    name = "ServerLoad"
    namespace = "2"
    identifier_type = "s"
    identifier = "Server/Load"
    default_tags = { source="opcua_merge" }

  [[inputs.opcua.nodes]]
    name = "ServerRAM"
    namespace = "2"
    identifier_type = "s"
    identifier = "Server/RAM"
    default_tags = { source="opcua_merge" }

  [[inputs.opcua.nodes]]
    name = "ServerIO"
    namespace = "2"
    identifier_type = "s"
    identifier = "Server/IO"
    default_tags = { source="opcua_merge" }

# Merge Aggregator
[[aggregators.merge]]
  drop_original = true
  tags = ["source"]

# QuestDB Output via ILP
[[outputs.influxdb_v2]]
  urls = ["${QUESTDB_HTTP_ENDPOINT}"]
  token = "${QUESTDB_HTTP_TOKEN}"
  content_encoding = "identity"
```

### Key configuration elements

**1. Common tag**

```toml
default_tags = { source="opcua_merge" }
```

Adds the same tag value (`source="opcua_merge"`) to all metrics. The merge aggregator uses this to identify which metrics should be combined.

**2. Merge aggregator**

```toml
[[aggregators.merge]]
  drop_original = true
  tags = ["source"]
```

- `drop_original = true`: Discards the original sparse rows after merging
- `tags = ["source"]`: Merges metrics with matching `source` tag values and the same timestamp

**3. QuestDB output**

```toml
[[outputs.influxdb_v2]]
  urls = ["${QUESTDB_HTTP_ENDPOINT}"]
  content_encoding = "identity"
```

- Uses the InfluxDB Line Protocol (ILP) over HTTP
- `content_encoding = "identity"`: Disables gzip compression (QuestDB doesn't require it)

## How it works

The data flow is:

1. **OPC-UA server** → Telegraf collects metrics
2. **Telegraf input** → Creates separate rows for each metric with the `source="opcua_merge"` tag
3. **Merge aggregator** → Combines rows with matching timestamp + `source` tag
4. **QuestDB output** → Sends merged dense rows via ILP

### Merging logic

The merge aggregator combines metrics when:
- **Timestamps match**: Metrics collected at the same moment
- **Tags match**: All specified tags (in this case, `source`) have the same values

If metrics have different timestamps or tag values, they won't be merged.

## Handling tag conflicts

If your OPC-UA nodes have additional tags with **different** values, those tags will prevent merging. Solutions:

### Remove conflicting tags

Use the `override` processor to remove unwanted tags:

```toml
[[processors.override]]
  [processors.override.tags]
    node_id = ""  # Removes the 'node_id' tag
    namespace = ""  # Removes the 'namespace' tag
```

### Convert tags to fields

Use the `converter` processor to convert tags to fields (fields don't affect merging):

```toml
[[processors.converter]]
  [processors.converter.tags]
    string = ["node_id", "namespace"]
```

This converts the tags to string fields, which won't interfere with the merge aggregator.

### Remove the common tag after merging

If you don't want the `source` tag in your final QuestDB table:

```toml
# Place this AFTER the merge aggregator
[[processors.override]]
  [processors.override.tags]
    source = ""  # Removes the 'source' tag
```

## Environment variables

Use environment variables for sensitive configuration:

```bash
export OPCUA_ENDPOINT="opc.tcp://your-opcua-server:4840"
export METRICS_TABLE_NAME="industrial_metrics"
export QUESTDB_HTTP_ENDPOINT="http://questdb-host:9000"
export QUESTDB_HTTP_TOKEN="your_token_here"
```

Alternatively, use a `.env` file:

```bash
# .env file
OPCUA_ENDPOINT=opc.tcp://localhost:4840
METRICS_TABLE_NAME=opcua_metrics
QUESTDB_HTTP_ENDPOINT=http://localhost:9000
QUESTDB_HTTP_TOKEN=
```

Then start Telegraf with:

```bash
telegraf --config telegraf.conf
```

## Verification

Query QuestDB to verify the data format:

```sql
SELECT * FROM opcua_metrics
ORDER BY timestamp DESC
LIMIT 10;
```

**Expected: Dense rows** with all metrics populated:

| timestamp                    | source      | ServerLoad | ServerRAM | ServerIO |
|------------------------------|-------------|------------|-----------|----------|
| 2024-01-15T10:05:00.000000Z | opcua_merge | 47.8       | 8256.0    | 1305.2   |
| 2024-01-15T10:04:00.000000Z | opcua_merge | 45.2       | 8192.0    | 1250.5   |

**Problem: Sparse rows** with NULL values:

| timestamp                    | source      | ServerLoad | ServerRAM | ServerIO |
|------------------------------|-------------|------------|-----------|----------|
| 2024-01-15T10:05:00.000000Z | opcua_merge | 47.8       | NULL      | NULL     |
| 2024-01-15T10:05:00.000000Z | opcua_merge | NULL       | 8256.0    | NULL     |

If you see sparse rows, check:
- All nodes have the same `default_tags`
- The merge aggregator is configured correctly
- Timestamps are identical (not just close)

## Alternative: TCP output

For higher throughput, use TCP instead of HTTP:

```toml
[[outputs.socket_writer]]
  address = "tcp://questdb-host:9009"
```

**Differences:**
- **TCP**: Higher throughput, no acknowledgments, potential data loss on connection failure
- **HTTP**: Reliable delivery, acknowledgments, slightly lower throughput

Choose TCP when:
- You need maximum performance
- Occasional data loss is acceptable
- You're on a reliable local network

Choose HTTP when:
- Data integrity is critical
- You need error feedback
- You're sending over the internet

## Multiple OPC-UA sources

To collect from multiple OPC-UA servers into separate tables:

```toml
# Server 1
[[inputs.opcua]]
  endpoint = "opc.tcp://server1:4840"
  name_override = "server1_metrics"
  [[inputs.opcua.nodes]]
    name = "Temperature"
    namespace = "2"
    identifier_type = "s"
    identifier = "Sensor/Temp"
    default_tags = { source="server1" }

# Server 2
[[inputs.opcua]]
  endpoint = "opc.tcp://server2:4840"
  name_override = "server2_metrics"
  [[inputs.opcua.nodes]]
    name = "Pressure"
    namespace = "2"
    identifier_type = "s"
    identifier = "Sensor/Press"
    default_tags = { source="server2" }

# Merge by source tag
[[aggregators.merge]]
  drop_original = true
  tags = ["source"]
```

This creates two tables (`server1_metrics`, `server2_metrics`) with merged metrics from each server.

:::tip Performance Tuning
For high-frequency OPC-UA data:
- Increase Telegraf's `flush_interval` to batch more data
- Use `aggregators.merge.period` to specify merge window duration
- Monitor QuestDB's ingestion rate and adjust accordingly
:::

:::warning Timestamp Precision
OPC-UA timestamps may have different precision than QuestDB expects. Ensure:
- Telegraf agent precision matches your requirements (default: nanoseconds)
- OPC-UA server timestamps are synchronized (use NTP)
- Clock drift between systems is minimal
:::

:::info Related Documentation
- [Telegraf OPC-UA plugin](https://github.com/influxdata/telegraf/tree/master/plugins/inputs/opcua)
- [Telegraf merge aggregator](https://github.com/influxdata/telegraf/tree/master/plugins/aggregators/merge)
- [QuestDB ILP reference](/docs/ingestion/ilp/overview/)
- [InfluxDB Line Protocol](/docs/ingestion/ilp/overview/)
:::
