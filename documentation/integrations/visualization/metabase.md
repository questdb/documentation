---
title: Metabase
description:
  Guide for building dashboards and visualizing time-series data with
  QuestDB and Metabase.
---

[Metabase](https://www.metabase.com/) is a popular open-source business
intelligence platform that lets anyone explore data and build dashboards
without writing much SQL.

Metabase connects to QuestDB through its built-in PostgreSQL driver, as
QuestDB speaks the PostgreSQL wire protocol. No extra plugins are required.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) to run both Metabase and
  QuestDB

## Start QuestDB

Run QuestDB with Docker. Port `8812` exposes the PostgreSQL wire protocol
that Metabase will connect to, and port `9000` serves the
[Web Console](/docs/getting-started/web-console/overview/) and REST API:

```shell
docker run --add-host=host.docker.internal:host-gateway \
-p 9000:9000 -p 9009:9009 -p 8812:8812 \
-v "$(pwd):/var/lib/questdb" \
questdb/questdb:latest
```

## Start Metabase

Run Metabase with Docker:

```shell
docker run --add-host=host.docker.internal:host-gateway \
-d -p 3000:3000 --name metabase \
metabase/metabase
```

Once Metabase has started (this can take a minute on first run), open it at
`http://localhost:3000` and complete the initial setup wizard to create your
admin account.

## Add QuestDB as a data source

1. In Metabase, click the **gear icon** in the top-right and go to
   **Admin settings**.
2. Go to the **Databases** tab and click **Add database**.
3. Select **PostgreSQL** as the database type.
4. Enter the connection details:

   | Field            | Value                  |
   | ---------------- | ---------------------- |
   | Display name     | QuestDB                |
   | Host             | `host.docker.internal` |
   | Port             | `8812`                 |
   | Database name    | `qdb`                  |
   | Username         | `admin`                |
   | Password         | _(leave empty)_        |
   | SSL              | Off                    |

   :::note
   Use `host.docker.internal` when both services run in Docker on the same
   host. If Metabase runs outside Docker, use `localhost` instead.
   Leave the password empty unless you have configured authentication in
   QuestDB.
   :::

5. Click **Save**. Metabase will validate the connection and start syncing
   the database schema.

## Build your first dashboard

Once connected, you can explore QuestDB tables:

1. Click **+ New** in the top navigation bar and select **Question**.
2. Choose the **QuestDB** database, pick a table, and use the notebook editor
   (or write native SQL) to query your time-series data. For example:

   ```sql
   SELECT timestamp, temperature
   FROM weather
   ORDER BY timestamp DESC
   LIMIT 100
   ```

3. Click **Visualize** to render the results, then **Save** the question.
4. Click **+ New** again and select **Dashboard** to combine multiple
   questions into a single view.

:::tip
QuestDB's `SAMPLE BY` queries work well for downsampling high-frequency
time-series data before visualizing it in Metabase. See the
[SAMPLE BY documentation](/docs/query/sql/sample-by/) for details.
:::

## Next steps

- Learn more about [Metabase dashboards](https://www.metabase.com/docs/latest/dashboards/introduction)
- Explore QuestDB's [SQL extensions](/docs/query/) for time-series analytics
