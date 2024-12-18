---
title: PowerBI
description: "Guide for using PowerBI with QuestDB. Use the top performing QuestDB database to build your PowerBI dashboards."
---

This guide demonstrates how to connect QuestDB with Microsoft PowerBI to create
interactive data visualizations and dashboards.

## Prerequisites

- [QuestDB](/docs/quick-start) running locally or remotely
- [PowerBI Desktop](https://powerbi.microsoft.com/) installed

## Connection Setup

QuestDB utilizes a fully featured PostgreSQL Wire Protocol (PGWire). As such,
setup for PowerBI mirrors the standard PostgreSQL connection setup. The benefit
is the performance profile of QuestDB, and its powerful time-series SQL extensions,
with the simplicity of the PGWire protocol.


1. Open PowerBI Desktop

2. Click "Get Data" in the Home tab

<Screenshot
    alt="Select Get Data"
    src="images/powerbi/powerbi-1.webp"
  />

3. Select "Database" → "PostgreSQL"

<Screenshot
    alt="Select PostgreSQL"
    src="images/powerbi/powerbi-2.webp"
  />

4. Enter your QuestDB connection details:
   - Server: `localhost` (or your server address)
   - Database: `qdb`
   - Data Connectivity mode: `Import`
   - Advanced options (optional):
     - Port: `8812` (default QuestDB PGWire port)
     - Command timeout: Adjust based on your query complexity

5. Select:
   - Database authentication:
     - User: `admin`
     - Password: `quest`

6. Click "Connect"

## Working with Data

1. In the Navigator window, select the tables you want to analyze
2. Click "Transform Data" to modify the data or "Load" to import it directly
3. Create visualizations by dragging fields onto the report canvas
4. Save your report and publish it to PowerBI Service if needed

## Using Custom SQL

To leverage QuestDB-specific features like `SAMPLE BY` and `LATEST ON`, you can use custom SQL:

1. In the "Get Data" dialog, click "Advanced options"
2. Enter your SQL query in the "SQL statement" field
3. Click "OK" to execute

> Remember, you must include a timestamp column when using functions like `SAMPLE BY`.

Here are some useful query examples:

```questdb-sql
-- Get 1-hour samples of sensor readings
SELECT 
    timestamp,
    avg(temperature) as avg_temp,
    avg(humidity) as avg_humidity
FROM sensors
WHERE timestamp >= dateadd('d', -7, now())
SAMPLE BY 1h;

-- Get latest reading for each sensor
SELECT * FROM sensors
LATEST ON timestamp PARTITION BY sensor_id;

-- Combine SAMPLE BY with multiple aggregations
SELECT 
    timestamp,
    symbol,
    max(price) max_price,
    min(price) min_price,
    avg(price) avg_price
FROM trades
WHERE timestamp >= dateadd('M', -1, now())
SAMPLE BY 1d
ALIGN TO CALENDAR;
```

## Best Practices

- Leverage [timestamps](/docs/guides/working-with-timestamps-timezones/) functions for time-series analysis
- Explore various [aggregation functions](/docs/reference/function/aggregation/) to suit your data needs
- Consider using powerful [window functions](/docs/reference/function/window/) to perform complex calculations
- For large datasets, use incremental refresh in PowerBI

## Caveats

### Date Table Limitations

QuestDB currently cannot be used as a source for PowerBI's "Mark as Date Table" feature. This means:

- You cannot mark QuestDB tables as date tables in PowerBI
- Some time intelligence functions in PowerBI may not be available
- If you need date table functionality, consider creating it in PowerBI or using another data source

:::tip 

If you'd like QuestDB to support this feature, please add a 👍 to [this GitHub issue](https://github.com/questdb/questdb/issues/5208).

:::

## Troubleshooting

- If connection fails, verify your QuestDB instance is running and accessible
- Ensure PGWire is enabled in your QuestDB configuration
  - `pg.enabled=true` - see [configuration](/docs/configuration/) for more details
- Check that the port `8812` is open and not blocked by firewalls
- For timeout errors, adjust the command timeout in advanced options

## Further Reading

- [QuestDB PGWire](/docs/reference/api/postgres/)
- [PowerBI Documentation](https://docs.microsoft.com/en-us/power-bi/)