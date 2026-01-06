---
title: "Cube"
description: Guide for QuestDB and Cube integration.
---

Cube is middleware that connects your data sources and your data applications.
Cube provides an API-first semantic layer for consolidating, caching, and
securing connections. Instead of having independent lines between data stores
and analytics, business or AI tools, Cube consolidates the complexity of overall
data modelling and cross-source data exchange into a cleaner interface.

As a high performance [time-series database](/glossary/time-series-database/),
QuestDB and Cube are a strong pair. Together, efficiently bridge your QuestDB
data to one of the many applications and libraries which integrate with Cube.

This document is a quick start designed to get both applications running
together. For a deeper tutorial, see
[Time Series Data Analytics with QuestDB and Cube](/blog/2022/04/26/time-series-data-analytics-with-questdb-and-cube/).

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/)
- [QuestDB](/download/)
- [Cube](https://github.com/cube-js/cube)

## Start Cube & QuestDB

Run QuestDB and Cube through Docker.

First, create and enter an example directory:

```shell
mkdir questdb-cube && cd $_
```

### Docker Compose Configuration

Next, create a `docker-compose.yml` file within the project directory:

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

Within your project directory, create an `cube.env` file.

These variables will allow Cube to connect to your QuestDB deployment.

Remember: default passwords are dangerous! We recommend altering them.

```bash title=.env
CUBEJS_DB_HOST=questdb
CUBEJS_DB_PORT=8812
CUBEJS_DB_NAME=qdb
CUBEJS_DB_USER=admin
CUBEJS_DB_PASS=quest
CUBEJS_DB_TYPE=questdb
```

Create `model` directory to be used by Cube:

```bash
mkdir model
```

Finally, bring it all up with Docker Compose:

```bash title=shell
docker-compose up -d
```

## Access QuestDB & Cube

Both applications are now up and ready.

- QuestDB: `http://localhost:9000`
- Cube: `http://localhost:4000`

## Access QuestDB Tables via Cube

You can now create a QuestDB table in Web Console - `http://localhost:9000`:

```sql
-- create table
CREATE TABLE IF NOT EXISTS trades ( 
  timestamp TIMESTAMP,
  symbol SYMBOL,
  side SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;

-- generate sample data
INSERT INTO trades
    SELECT
        timestamp_sequence('2024-01-01T00:00:00', 60000L * x) timestamp,
        rnd_str('ETH-USD', 'BTC-USD', 'SOL-USD', 'LTC-USD', 'UNI-USD') symbol,
        rnd_str('buy', 'sell') side,
        rnd_double() * 1000 + 100 price,
        rnd_double() * 2000 + 0.1 amount
    FROM long_sequence(100) x;
```

Then open `http://127.0.0.1:4000/#/schema`, select `trades` table in Cube UI and click
the Generate Data Model button. You can select either YAML or JavaScript model to be
generated.

import Screenshot from "@theme/Screenshot"

<Screenshot
  alt="Creating a model in Cube UI"
  src="images/guides/cube/cube-create-model.webp"
  width={664}
  height={216}
/>

Once that's done, you can run queries against `trades` model in Cube Playground -
`http://127.0.0.1:4000/#/build`:

<Screenshot
  alt="Running queries in Cube UI"
  src="images/guides/cube/cube-run-query.webp"
  width={925}
  height={462}
/>

Not sure what to do next? Check out
[our tutorial](/blog/2022/04/26/time-series-data-analytics-with-questdb-and-cube/)
for inspiration.
