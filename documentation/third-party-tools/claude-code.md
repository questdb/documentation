---
title: Claude Code
sidebar_label: Claude Code
description:
  Use Claude Code to build applications, write queries, and work with QuestDB
  using natural language.
---

<a href="https://claude.ai/code" target="_blank">Claude Code</a> is an AI-powered coding assistant that
runs in your terminal. It can write code, execute commands, and help you build
applications that use QuestDB.

Claude Code works with QuestDB out of the box - no plugins or configuration
required. It connects directly through QuestDB's REST API and can write code
that uses the PostgreSQL wire protocol or ILP for ingestion.

## What you can do

### Write application code

Ask Claude Code to write client code in any language:

- Python scripts using `questdb` or `psycopg2`
- Go applications with the QuestDB Go client
- Java applications with the QuestDB Java client
- Node.js services using ILP or PostgreSQL wire protocol

### Build ingestion pipelines

Claude Code can help you:

- Write ILP client code for high-throughput ingestion
- Build data transformation pipelines
- Set up Kafka or other streaming integrations
- Generate and insert test data

### Query and analyze data

Use natural language to explore your database:

- "What tables do I have?"
- "Show me trades from last week grouped by symbol"
- "What's the average temperature per hour for sensor 42?"

Claude Code writes the SQL, executes it via the REST API, and explains the
results.

### Write complex SQL

Get help with QuestDB-specific SQL features:

- `SAMPLE BY` for time-based aggregations
- `ASOF JOIN` and `WINDOW JOIN` for time-series joins
- `LATEST ON` for latest value queries
- Partitioning and deduplication strategies

### Troubleshoot issues

Claude Code can help debug:

- Connection problems (ports, authentication, network)
- Query performance (explain plans, indexing, partitioning)
- Ingestion issues (schema mismatches, out-of-order data)
- Configuration problems

### Migrate from other databases

Get help migrating from:

- PostgreSQL or TimescaleDB
- InfluxDB (including InfluxQL to QuestDB SQL)
- Other time-series databases

### Set up integrations

Claude Code can help configure:

- Grafana dashboards and data sources
- Telegraf for metrics collection
- Kafka Connect for streaming data
- Monitoring and alerting

## Getting started

1. Install Claude Code: https://claude.ai/code
2. Start QuestDB (default port 9000)
3. Ask Claude Code to connect and explore

```
You: "Connect to my QuestDB at localhost:9000 and show me what tables I have"

Claude Code: I'll query the QuestDB REST API to list your tables.
[Executes curl command and shows results]
```

## Example workflow

Here's a typical workflow for building a sensor data application:

```
You: "Create a QuestDB table for IoT sensor readings with device_id,
      timestamp, temperature, and humidity"

Claude Code: [Creates table with optimal schema, partitioning, and symbol type]

You: "Write a Python script to ingest sensor data using ILP"

Claude Code: [Writes complete Python script with questdb.ingress]

You: "Query the average temperature per device for the last 24 hours"

Claude Code: [Writes and executes SAMPLE BY query, shows results]

You: "The query is slow, can you help optimize it?"

Claude Code: [Analyzes query plan, suggests indexing or partitioning changes]
```

## Tips

- **Provide context** - Tell Claude Code about your use case, data volume, and
  requirements
- **Ask follow-up questions** - Claude Code remembers context within a session
- **Request explanations** - Ask "why?" to understand recommendations
- **Iterate on code** - Ask Claude Code to modify or improve generated code

## Next steps

- [REST API reference](/docs/reference/api/rest/) - API documentation
- [SQL overview](/docs/reference/sql/overview/) - QuestDB SQL syntax
- [Client libraries](/docs/ingestion-overview/) - Official client libraries
- [Sample datasets](https://github.com/questdb/sample-datasets) - Example data
  to try
