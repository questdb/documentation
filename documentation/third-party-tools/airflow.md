---
title: "Apache Airflow"
sidebar_label: Airflow
description: Learn how to use Apache Airflow to automate QuestDB workflows.
---

Apache Airflow is a powerful workflow automation tool that allows you to schedule and monitor tasks through directed acyclic graphs (DAGs). Airflow provides built-in operators for executing SQL queries, making it easy to automate QuestDB tasks.

Alternatively, checkout our [Automating QuestDB Tasks](/docs/operations/task-automation/) guide for a scripted approach.

## Prerequisites

- QuestDB running locally or remotely
- Docker or Python 3, depending on how you want to install Airflow
- Airflow installed and configured


## Installation

We recommended installing Airflow via Docker Compose, but any other supported method should also work. Follow the official guide:

- [Airflow Installation Documentation](https://airflow.apache.org/docs/apache-airflow/stable/howto/docker-compose/index.html)

## QuestDB Connection

On the Airflow UI you can find the `Admin > Connections` option. You can create
a named connection to your QuestDB instance by adding a new connection of type
`Postgres`. Just point to your host (if running Airflow inside of Docker, this
might be either the name of the container running QuestDB or `host.docker.internal`), port (defaults to `8812`), database (`qdb`), user (`admin`) and
password (`quest`).

## Basic integration

On Airflow you write a DAG, which is a graph of all the tasks you want to
automate, together with its dependencies and in which order they will be executed.

DAGs are written as Python files, so you can virtually integrate with any data tool, but in the case of automating QuestDB queries, the easiest way to proceed
is yo use the built-in `PostgresOperator`, which accepts a connection_id, and
a query to execute.

## Example: Running a Query on QuestDB

The following example defines an Airflow DAG to execute a SQL query on QuestDB:

```python
import pendulum
from airflow import DAG
from airflow.providers.postgres.operators.postgres import PostgresOperator

default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'start_date': pendulum.datetime(2025, 1, 1, tz="UTC"),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 1,
}

dag = DAG(
    'questdb_cleanup',
    default_args=default_args,
    description='Drops old partitions in QuestDB',
    schedule_interval='@daily',
    catchup=False,
)

cleanup_task = PostgresOperator(
    task_id='drop_old_partitions',
    postgres_conn_id='questdb',
    sql="""
    ALTER TABLE my_table DROP PARTITION WHERE timestamp < dateadd('d', -30, now());
    """,
    dag=dag,
)
```

## Running the Airflow DAG

1. Open the Airflow UI at http://localhost:8080.
2. Enable and trigger the `questdb_cleanup` DAG manually.


## Next Steps

For further details and resources, refer to the following links:

- **Airflow Documentation**: [https://airflow.apache.org/docs/apache-airflow/stable/](https://airflow.apache.org/docs/apache-airflow/stable/)
- **Full Example Repository**: [https://github.com/questdb/data-orchestration-and-scheduling-samples](https://github.com/questdb/data-orchestration-and-scheduling-samples)






