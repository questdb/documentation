---
title: Integrating Airbyte with QuestDB
description: Learn how to use Airbyte to collect data from various sources and send it to QuestDB for efficient time-series data storage and analysis.
---

# Integrating Airbyte with QuestDB

[Airbyte](https://airbyte.com/) is an open-source ETL platform designed to help you sync data from a wide range of sources into your desired destinations. With its extensive library of connectors, Airbyte allows users to build scalable data pipelines effortlessly. This guide will walk you through the process of integrating Airbyte with QuestDB, enabling efficient storage and querying of data in a high-performance time-series database.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Configuring Airbyte](#configuring-airbyte)
  - [Adding a Source](#adding-a-source)
  - [Adding a Destination](#adding-a-destination)
  - [Generating Configuration](#generating-configuration)
- [Example Inputs](#example-inputs)
  - [PostgreSQL Source Configuration](#postgresql-source-configuration)
  - [Writing to QuestDB](#writing-to-questdb)
  - [Running the Connection](#running-the-connection)
  - [Monitoring Sync Status](#monitoring-sync-status)
  - [Debugging Tips](#debugging-tips)
- [Verifying the Integration](#verifying-the-integration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Summary](#summary)

## Prerequisites

Before you begin, ensure you have the following:

- **QuestDB** must be running and accessible. Check out the [QuestDB quick start guide](/docs/get-started/docker/).
- **Airbyte** installed using Docker, or locally via [Homebrew](https://brew.sh/) on macOS. For detailed installation instructions, refer to the [official Airbyte documentation](https://docs.airbyte.com/deploying-airbyte/local-deployment).

## Configuring Airbyte

Airbyte uses a user-friendly interface for configuration, allowing you to easily set up your sources and destinations. Once Airbyte is running, navigate to the Airbyte dashboard at `http://localhost:8000`.

### Adding a source

1. Click on the **Sources** tab.
2. Select the desired source from the list of available connectors.
3. Fill in the necessary configuration details, such as connection strings, credentials, and any other required fields.

### Adding a destination

1. Click on the **Destinations** tab.
2. Select **QuestDB** as your destination.
3. Enter the required connection details for QuestDB:
   - **Host**: `localhost` or your QuestDB server IP
   - **Port**: `8812`
   - **User**: `admin`
   - **Password**: (Leave empty if using default settings)

### Generating configuration

Airbyte allows you to test your configuration after entering the details. Click on **Test Connection** to ensure that the connection to the source and destination is successful. Once confirmed, you can proceed to create a connection between the source and destination.

## Example inputs

In this section, we will demonstrate how to set up Airbyte to extract data from a PostgreSQL source and send it to QuestDB.

### PostgreSQL source configuration

1. **Setting Up the Source**:
   To set up the source connector, you will need the following configuration details:

```json
{
  "sourceType": "postgresql",
  "configuration": {
    "host": "your_postgres_host",
    "port": 5432,
    "database": "your_database",
    "username": "your_username",
    "password": "your_password",
    "ssl": false,
    "table_name": "your_table"
  }
}
```

2. **Sample Data Extraction**:
   You can run a sample query to test the connection and see the kind of data that will be extracted:

```sql
SELECT * FROM your_table LIMIT 10;
```

### Writing to QuestDB

After configuring your PostgreSQL source, the next step is to configure the destination to send the extracted data to QuestDB.

#### QuestDB destination configuration

1. **Setting Up the Destination**:
   Here's how to configure the destination connector for QuestDB:

```json
{
  "destinationType": "questdb",
  "configuration": {
    "host": "localhost",
    "port": 8812,
    "database": "your_database",
    "username": "admin",
    "password": "",
    "table": "your_table",
    "batch_size": 1000
  }
}
```

2. **Data Format**:
   QuestDB expects the data in a specific format. Here's an example of how the data might look when being sent:

```json
[
  {
    "column1": "value1",
    "column2": 123,
    "column3": "2023-10-19T12:00:00Z"
  },
  {
    "column1": "value2",
    "column2": 456,
    "column3": "2023-10-19T12:05:00Z"
  }
]
```

### Running the connection

Once you have both the source and destination configured, you can create a connection between them.

1. **Creating the Connection**:
   In the Airbyte dashboard, navigate to the **Connections** tab, and create a new connection with the following details:

```json
{
  "sourceId": "your_postgres_source_id",
  "destinationId": "your_questdb_destination_id",
  "syncMode": "full_refresh",
  "schedule": {
    "units": 1,
    "timeUnit": "hours"
  }
}
```

### Monitoring sync status

Once the sync process is initiated, you can monitor its status directly in the Airbyte dashboard.

#### Example sync status output

```json
{
  "status": "COMPLETED",
  "records_transferred": 150,
  "start_time": "2023-10-19T12:00:00Z",
  "end_time": "2023-10-19T12:10:00Z",
  "errors": []
}
```

### Debugging tips

If you encounter issues during the sync process, consider the following debugging steps:

- **Check Connection Settings**: Ensure the host, port, and authentication details are correct in both the source and destination configurations.
- **Review Logs**: Check the Airbyte logs for any error messages. Logs can provide insight into connection failures or data format issues.
- **Test Queries**: Use the query tools available in your PostgreSQL and QuestDB interfaces to test individual queries and see what data is being extracted or sent.

## Verifying the integration

1. **Access the QuestDB Web Console**:  
   Navigate to the [QuestDB Web Console](/docs/develop/web-console/) at `http://127.0.0.1:9000/`. Once you're on the console, check the Schema Navigator in the top left. You should see two new tables:

   - `cpu` (generated from `inputs.cpu`)
   - `mem` (generated from `inputs.mem`)

2. **Run a Query on the `cpu` Table**:  
   To verify that data is being correctly written to the `cpu` table, type the following query in the editor and click **RUN**:

```sql
SELECT * FROM cpu;
```

3. **Inspect the Results**:  
   After running the query, the results should display columns for each metric collected by the [Telegraf](/docs/third-party-tools/telegraf/) plugin for monitoring CPU usage, such as:

   - `usage_idle`
   - `usage_user`
   - `usage_system`
   - `usage_iowait`

   Here's an example of what the results may look like:

```plaintext
| timestamp            | usage_idle | usage_user | usage_system | usage_iowait |
|----------------------|------------|------------|--------------|--------------|
| 2024-10-19T12:00:00Z | 60         | 30         | 10           | 0            |
| 2024-10-19T12:05:00Z | 58         | 31         | 9            | 2            |
```

4. **Run a Query on the `mem` Table**:  
   Similarly, you can check the `mem` table by running the following query:

```sql
SELECT * FROM mem;
```

   This will display memory usage statistics collected by Telegraf, which might include:

   - `total`
   - `available`
   - `used`
   - `free`

5. **Sample Memory Query Results**:

```plaintext
| timestamp            | total      | available | used        | free        |
|----------------------|------------|-----------|-------------|-------------|
| 2024-10-19T12:00:00Z | 8000       | 3000      | 4000        | 1000        |
| 2024-10-19T12:05:00Z | 8000       | 2900      | 4100        | 1000        |
```

## Best practices

To ensure a smooth and efficient integration between Airbyte and QuestDB, consider the following best practices:

1. **Optimize Data Load Frequency**
   - Use batch processing to reduce load on QuestDB.
   - Implement incremental sync where possible to only load new or changed data.

```yaml
# Example Airbyte configuration for incremental sync
sync_mode: incremental
```

2. **Data Types and Schema Alignment**
   - Ensure data types in Airbyte's source match the destination schema in QuestDB.
   - Pre-define tables in QuestDB before starting the sync.

```sql
-- Example SQL for creating a table in QuestDB
CREATE TABLE my_table (
    id INT,
    name STRING,
    created_at TIMESTAMP
) timestamp(created_at);
```

3. **Use Connection Retry Logic**
   - Configure Airbyte to retry connections in case of temporary failures.

```yaml
# Example Airbyte connection configuration with retries
retries: 3
```

4. **Monitor Resource Utilization**
   - Keep an eye on CPU and memory usage on both Airbyte and QuestDB.
   - Enable logging in Airbyte to track data sync processes.

5. **Query Optimization**
   - Use indexing in QuestDB to speed up queries on frequently accessed columns.

```sql
-- Example SQL for creating an index
CREATE INDEX ON my_table (name);
```

6. **Data Validation**
   - Implement post-load checks to verify data integrity.

```sql
-- Example SQL for counting records after load
SELECT COUNT(*) FROM my_table;
```

## Troubleshooting

If you do not see the expected tables or data in QuestDB:

- **Check Airbyte Logs**: Ensure there are no errors in the Airbyte dashboard regarding the sync process.
- **Verify Configuration**: Revisit both the source and destination configurations to ensure they match the expected settings.
- **Consult QuestDB Logs**: Check the QuestDB logs for any error messages indicating issues with data ingestion.

## Summary

This guide outlines the integration of **Airbyte** with **QuestDB**, enabling seamless data ingestion from various sources into QuestDB for efficient querying and analytics. Key topics covered include:

- **Prerequisites**: Ensure both Airbyte and QuestDB are properly installed and configured.
- **Configuring Airbyte**: Set up Airbyte to connect with your desired data sources and QuestDB as the destination.
- **Data Validation**: Verify data integrity post-load and ensure the expected records are ingested.
- **Best Practices**: Optimize data loads, monitor resource utilization, and use indexing for efficient querying.

For further details and resources, refer to the following links:

- [Airbyte Documentation](https://docs.airbyte.com/)
- [QuestDB Web Console Guide](/docs/develop/web-console/)
- [Airbyte GitHub Repository](https://github.com/airbytehq/airbyte)
