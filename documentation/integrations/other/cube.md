---
title: "Cube"
description: Guide for QuestDB and Cube integration.
---

import Screenshot from "@theme/Screenshot"

Cube is middleware that connects your data sources and your data applications.
Cube provides an API-first semantic layer for consolidating, caching, and
securing connections. Instead of having independent lines between data stores
and analytics, business or AI tools, Cube consolidates the complexity of overall
data modelling and cross-source data exchange into a cleaner interface.

As a high performance [time-series database](/glossary/time-series-database/),
QuestDB and Cube are a strong pair. Together, they efficiently bridge your QuestDB
data to one of the many applications and libraries which integrate with Cube.

<Screenshot
  alt="A diagram of QuestDB and Cube"
  height={281}
  src="images/guides/cube/questdb-cube-railchart.webp"
  width={650}
/>

## Getting Started

This section will help you get QuestDB and Cube running together using Docker.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/)

### Setup

Create a project directory:

```shell
mkdir questdb-cube && cd $_
```

Create a `docker-compose.yml` file:

```yaml title=docker-compose.yml
version: "2.2"

services:
  cube:
    environment:
      - CUBEJS_DEV_MODE=true
    image: "cubejs/cube:latest"
    ports:
      - "4000:4000"
    env_file: "cube.env"
    volumes:
      - ".:/cube/conf"
  questdb:
    container_name: questdb
    hostname: questdb
    image: "questdb/questdb:latest"
    ports:
      - "9000:9000"
      - "8812:8812"
```

Create a `cube.env` file with connection details:

```bash title=cube.env
CUBEJS_DB_HOST=questdb
CUBEJS_DB_PORT=8812
CUBEJS_DB_NAME=qdb
CUBEJS_DB_USER=admin
CUBEJS_DB_PASS=quest
CUBEJS_DB_TYPE=questdb
```

Create a `model` directory for Cube and start the containers:

```bash
mkdir model
docker-compose up -d
```

Both applications are now available:

- QuestDB Web Console: `http://localhost:9000`
- Cube Playground: `http://localhost:4000`

## Tutorial: Crypto Price Analytics

In this tutorial, we'll build a crypto price analysis pipeline using the
[Kaggle Crypto dataset](https://www.kaggle.com/datasets/sudalairajkumar/cryptocurrencypricehistory)
(requires a free Kaggle account to download).
We'll import data into QuestDB, build a Cube data model, and expose it via APIs.

### Importing Data into QuestDB

Navigate to `http://localhost:9000` to open QuestDB's Web Console. Click on the
"Upload" icon on the left-hand panel, and import a
[CSV file from the Kaggle dataset](https://www.kaggle.com/sudalairajkumar/cryptocurrencypricehistory).
This example uses the Ethereum dataset, but any coin dataset will work.

<Screenshot
  alt="QuestDB import view"
  height={224}
  src="images/guides/cube/questdb-import-view.webp"
  width={700}
/>

Cube works best with table names that do not contain special characters. Rename
the table:

```questdb-sql
RENAME TABLE 'coin_Ethereum.csv' TO 'ethereum';
```

<Screenshot
  alt="QuestDB web console"
  height={224}
  src="images/guides/cube/questdb-web-console.webp"
  width={700}
/>

You can now query the data:

<Screenshot
  alt="QuestDB web console querying ethereum table"
  height={224}
  src="images/guides/cube/ethereum-query.webp"
  width={700}
/>

### Building a Cube Data Model

The [Cube data model](https://cube.dev/docs/schema/fundamentals/concepts)
consists of entities called 'cubes' that define metrics by dimensions
(qualitative categories) and measures (numerical values).

Navigate to `http://localhost:4000/#/schema` and select the `ethereum` table:

<Screenshot
  alt="Generate Schema on Cube"
  height={180}
  src="images/guides/cube/cube-generate-schema.webp"
  width={560}
/>

Click "Generate Data Model" to create a cube in the `model` directory. Open the
generated `Ethereum.js` file and customize it to include price columns:

```javascript
cube(`Ethereum`, {
  sql: `SELECT * FROM ethereum`,

  measures: {
    count: {
      type: `count`,
      drillMembers: [name, date],
    },
    avgHigh: {
      type: "avg",
      sql: `${CUBE}."High"`,
    },
    avgLow: {
      type: "avg",
      sql: `${CUBE}."Low"`,
    },
  },

  dimensions: {
    name: {
      sql: `${CUBE}."Name"`,
      type: `string`,
    },

    symbol: {
      sql: `${CUBE}."Symbol"`,
      type: `string`,
    },

    date: {
      sql: `${CUBE}."Date"`,
      type: `time`,
    },

    high: {
      type: "number",
      sql: `${CUBE}."High"`,
    },

    low: {
      type: "number",
      sql: `${CUBE}."Low"`,
    },
  },
})
```

In the Cube Playground "Build" tab, you can now query and visualize the data:

<Screenshot
  alt="Cube build tab"
  height={224}
  src="images/guides/cube/cube-build-tab.webp"
  width={700}
/>

Create a price-over-time chart:

<Screenshot
  alt="Price over time graph"
  height={224}
  src="images/guides/cube/price-over-time-graph.webp"
  width={700}
/>

### Pre-aggregations

Cube can [pre-aggregate](https://cube.dev/docs/caching/using-pre-aggregations)
data to speed up queries. It creates materialized rollups of specified
dimensions and measures, then uses aggregate awareness logic to route queries to
the most optimal pre-aggregation.

Add a `preAggregations` block to your cube definition in `Ethereum.js`:

```javascript
cube(`Ethereum`, {
  sql: `SELECT * FROM ethereum`,

  preAggregations: {
    main: {
      measures: [avgHigh, avgLow],
      timeDimension: date,
      granularity: "day"
    }
  },

  measures: {
    // ... existing measures
  },

  dimensions: {
    // ... existing dimensions
  },
})
```

### Consuming Data via APIs

Cube's API-first approach enables you to connect to any data application. API
endpoints ensure that metrics are consistent across different applications,
tools, and teams.

<Screenshot
  alt="Various ways to connect with Cube"
  height={224}
  src="images/guides/cube/cube-various-ways-to-connect.webp"
  width={700}
/>

Three API endpoints are available:

1. **REST API**: Connect your application backend via the
   [REST API](https://cube.dev/docs/rest-api).

2. **GraphQL API**: Use standard GraphQL queries for embedded analytics via the
   [GraphQL API](https://cube.dev/docs/backend/graphql).

3. **SQL API**: Query data using standard ANSI SQL via the
   [SQL API](https://cube.dev/docs/backend/sql). This is useful for BI tools,
   dashboards, or data science models.

<Screenshot
  alt="GraphQL API"
  height={224}
  src="images/guides/cube/graphql-api.webp"
  width={700}
/>

## See also

- [Cube documentation](https://cube.dev/docs/)
- [Cube Cloud](https://cube.dev/cloud)
- [QuestDB SQL extensions](/docs/concepts/deep-dive/sql-extensions/)
