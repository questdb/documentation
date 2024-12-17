---
title: PowerBI
description: "Guide for using PowerBI with QuestDB. Use the top performing QuestDB database to build your PowerBI dashboards.
---

This guide demonstrates how to connect QuestDB with Microsoft PowerBI to create
interactive data visualizations and dashboards.

## Prerequisites

- [QuestDB](/docs/quick-start) running locally or remotely
- [PowerBI Desktop](https://powerbi.microsoft.com/) installed
- Basic understanding of SQL queries

## Connection Setup

1. Open PowerBI Desktop
2. Click "Get Data" in the Home tab
3. Select "Database" → "PostgreSQL"
4. Enter your QuestDB connection details:
   - Server: `localhost` (or your server address)
   - Database: `qdb`
   - Data Connectivity mode: `Import`
   - Advanced options (optional):
     - Port: `8812` (default QuestDB PGWire port)
     - Command timeout: Adjust based on your query complexity

5. Select either:
   - Windows authentication (if configured)
   - Database authentication:
     - User: `admin`
     - Password: `quest`

6. Click "Connect"

## Working with Data

1. In the Navigator window, select the tables you want to analyze
2. Click "Transform Data" to modify the data or "Load" to import it directly
3. Create visualizations by dragging fields onto the report canvas
4. Save your report and publish it to PowerBI Service if needed

## Best Practices

- Use [WHERE](/docs/reference/sql/where/) clauses to limit data volume
- Leverage [timestamp](/docs/concept/timestamps/) functions for time-series analysis
- For large datasets, use incremental refresh in PowerBI

## Example Queries

Here's a sample query to get started:

```questdb-sql
SELECT
  timestamp,
  symbol,
AVG(price) as avg_price
FROM trades
WHERE timestamp >= dateadd('d', -7, now())
GROUP BY timestamp, symbol
ORDER BY timestamp DESC
```

## Troubleshooting

- If connection fails, verify your QuestDB instance is running and accessible
- Ensure PGWire is enabled in your QuestDB configuration
- Check that the port `8812` is open and not blocked by firewalls
- For timeout errors, adjust the command timeout in advanced options

## Further Reading

- [QuestDB PGWire](/docs/reference/api/postgres/)
- [PowerBI Documentation](https://docs.microsoft.com/en-us/power-bi/)