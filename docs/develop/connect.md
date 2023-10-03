# Connect

You can interact with a QuestDB database by connecting to one of its various
network endpoints.

|Network Endpoint|Port|Inserting & modifying data<sup>*</sup>|Querying data|
|:---------------|:---|:-------------------------------------|:------------|
|[Web Console](#web-console)|9000|SQL `INSERT`, `UPDATE`, CSV|SQL `SELECT`, charting|
|[InfluxDB Line Protocol](#influxdb-line-protocol)|9009|High performance bulk insert|-|
|[PostgreSQL wire protocol](#postgresql-wire-protocol)|8812|SQL `INSERT`, `UPDATE`|SQL `SELECT`|
|[HTTP REST API](#http-rest-api)|9000|SQL `INSERT`, `UPDATE`, CSV|SQL `SELECT`, CSV|

`*` `UPDATE` is available from [QuestDB 6.4](/blog/2022/05/31/questdb-release-6-4/).


:::note

All network ports may be [configured](/docs/reference/configuration/).

:::

## Web console

The [web console](/docs/develop/web-console/) is a general admin and query
interface.
It's great for quickly trying things out. You can also chart your query results.

Connect your web browser to http://[server-address]:9000/. When running locally,
this will be `http://localhost:9000/`.

import Screenshot from "@theme/Screenshot"

<a href="/docs/develop/web-console/">
    <Screenshot
    alt="Screenshot of the Web Console"
    height={375}
    small
    src="/img/docs/console/overview.png"
    width={500}
    />
</a>

## InfluxDB Line Protocol (ILP)

The fastest way to insert data into QuestDB is using the InfluxDB Line
Protocol.

It is an insert-only protocol that bypasses SQL `INSERT` statements achieving
higher throughput.

```shell
readings,city=London temperature=23.2 1465839830100400000\n
readings,city=London temperature=23.6 1465839830100700000\n
readings,make=Honeywell temperature=23.2,humidity=0.443 1465839830100800000\n
```

Our [InfluxDB Line Protocol tutorial](/docs/develop/insert-data/#influxdb-line-protocol) covers
ingesting data with various client libraries.

For a more in-depth understanding, see our
[protocol documentation](/docs/reference/api/ilp/overview/).

## PostgreSQL wire protocol

For SQL, we support the same wire protocol as PostgreSQL, allowing you to
connect and query the database with various third-party pre-existing client
libraries and tools.

```python

import psycopg as pg

# Connect to an existing QuestDB instance using the with statement

conn_str = 'user=admin password=quest host=127.0.0.1 port=8812 dbname=qdb'
with pg.connect(conn_str, autocommit=True) as connection:

```

See how you can connect through the PostgreSQL wire protocol from
different programming languages to:

* [Insert data](/docs/develop/insert-data/#postgresql-wire-protocol)
* [Query data](/docs/develop/query-data/#postgresql-wire-protocol)


## HTTP REST API

The HTTP interface that hosts the web console also provides a REST API for
importing data, exporting data and querying.

```shell
curl -F data=@data.csv http://localhost:9000/imp
```

Find out how to:

* [Insert data](/docs/develop/insert-data/#http-rest-api)
* [Query data](/docs/develop/query-data/#http-rest-api)
