---
title: Automating QuestDB Tasks
sidebar_label: Automating QuestDB Tasks
description:
  This document describes how to automate QuestDB tasks using the REST HTTP API.
---

# Automating QuestDB with the REST API and Bash Scripts

## Introduction

QuestDB provides a simple [HTTP API](../reference/api/rest.md) that allows you to interact with the database using SQL queries.
This API can be leveraged for automation using Bash scripts and scheduled execution via cron jobs. This is a lightweight
approach that requires minimal dependencies.

For a more robust approach, you might want to explore the integration with workflow orchestrators such as
[Apache Airflow](../third-party-tools/airflow.md) or [Dagster](../third-party-tools/dagster.md).


## Prerequisites

- QuestDB running locally or on a server.
- `curl` installed (pre-installed on most Linux/macOS systems).
- Basic knowledge of Bash scripting.

## Example: Running a Scheduled Query

The following example demonstrates how to execute a query using the HTTP API:

```bash
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

For more advanced automation, consider using a workflow orchestrator like [**Dagster**](../third-party-tools/dagster.md) or
[**Apache Airflow**](../third-party-tools/airflow.md).

- **QuestDB REST API Documentation**: [https://questdb.io/docs/reference/api/rest](../reference/api/rest.md)
- **Full Example Repository**: [https://github.com/questdb/data-orchestration-and-scheduling-samples](https://github.com/questdb/data-orchestration-and-scheduling-samples)
- **Apache Airflow**: [Automating QuestDB Workflows Using Apache Airflow](../third-party-tools/airflow.md)
- **Dagster**: [Automating QuestDB Workflows Using Dagster](../third-party-tools/dagster.md)

