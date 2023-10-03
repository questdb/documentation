---
title: "Cube"
description: Yaa
---

Cube is middleware that connects your data sources and your data applications.
Cube provides an API-first semantic layer for consolidating, caching, and
securing connections. Instead of having independent lines between data stores
and analytics, business or AI tools, Cube consolidates the complexity of overall
data modelling and cross-source data exchange into a cleaner interface.

As a high performance time-series database, QuestDB and Cube are a strong pair.
Together, efficiently bridge your QuestDB data to one of the many applications
and libraries which integrate with Cube.

This document is a quick start designed to get both applications running
together. For a deeper tutorial, see
[Time Series Data Analytics with QuestDB and Cube](/blog/2022/04/26/time-series-data-analytics-with-questdb-and-cube/).

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [QuestDB](/get-questdb)
- [Cube](https://github.com/cube-js/cube)

## Start Cube & QuestDB

Run QuestDB and Cube through Docker.

First, create and enter an example directory:

```shell
mkdir questdb-cube && cd $_
```

### Dockerfile

Next, create a dockerfile within the project directory:

```yaml title=docker-compose.yml
version: "2.2"

services:
  cube:
    environment:
      - CUBEJS_DEV_MODE=true
    image: "cubejs/cube:latest"
    ports:
      - "4000:4000"
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

Within your project directory, create an `.env` file.

These variables will allow Cube to connect to your QuestDB deployment.

Remember: default passwords are dangerous! We recommend altering them.

```shell title=.env
CUBEJS_DB_HOST=questdb
CUBEJS_DB_PORT=8812
CUBEJS_DB_NAME=qdb
CUBEJS_DB_USER=admin
CUBEJS_DB_PASS=quest
CUBEJS_DB_TYPE=questdb
```

Finally, bring it all up with Docker:

```bash title=shell
docker-compose up -d
```

## Access QuestDB & Cube

Both applications are now up and ready.

- QuestDB: http://localhost:9000
- Cube: http://localhost:4000

Not sure what to do next? Check out
[our tutorial](/blog/2022/04/26/time-series-data-analytics-with-questdb-and-cube/)
for inspiration.
