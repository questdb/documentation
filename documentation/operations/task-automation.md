---
title: Automating QuestDB Tasks
sidebar_label: Task automation
description:
  Learn how to automate QuestDB tasks using the REST HTTP API, or one of our recommended workflow orchestrators.
---

QuestDB provides a simple [HTTP API](/docs/reference/api/rest/) that allows you to interact with the database using SQL queries.
This API can be leveraged for automation using Bash scripts and scheduled execution via cron jobs. This is a lightweight
approach that requires minimal dependencies.

For a more robust approach, you might want to explore the integration with workflow orchestrators such as
[Apache Airflow](/docs/third-party-tools/airflow/) or [Dagster](/docs/third-party-tools/dagster/).


## Prerequisites

- QuestDB running locally or on a server
- `curl` installed (pre-installed on most Linux/macOS systems)
- Basic knowledge of Bash or similar scripting language

## Example: Running a Scheduled Query

The following example demonstrates how to execute a query using the HTTP API:

```bash title="drop-partitions.sh"
#!/bin/bash

# QuestDB API URL
QUESTDB_URL="http://localhost:9000/exec"

# Query: Drop partitions older than 30 days
QUERY="ALTER TABLE my_table DROP PARTITION WHERE timestamp < dateadd('d', -30, now());"

# Execute the query
curl -G "$QUESTDB_URL" --data-urlencode "query=$QUERY"
```

## Automating with Cron

To execute this script daily at midnight, add the following line to your crontab:

```bash
0 0 * * * /path/to/script.sh
```

## Pros & Cons

✅ Simple to implement  \
✅ No external dependencies  \
✅ Works on any Unix-like system  \

❌ No monitoring or logging  \
❌ No built-in error handling  \
❌ No backfilling support

## Next Steps

For more advanced automation, consider using a workflow orchestrator like [**Dagster**](/docs/third-party-tools/dagster/) or
[**Apache Airflow**](/docs/third-party-tools/airflow/).

- **QuestDB REST API Documentation**: [https://questdb.io/docs/reference/api/rest](../reference/api/rest/)
- **Full Example Repository**: [https://github.com/questdb/data-orchestration-and-scheduling-samples](https://github.com/questdb/data-orchestration-and-scheduling-samples)
- **Apache Airflow**: [Automating QuestDB Workflows Using Apache Airflow](/docs/third-party-tools/airflow/)
- **Dagster**: [Automating QuestDB Workflows Using Dagster](/docs/third-party-tools/dagster/)

