---
title: Networking Layer
slug: networking-layer
description: The system exposes RESTful APIs and implements ILP and PostgreSQL wire protocols so that existing tools and drivers work out-of-the-box. It also offers a health and metrics endpoint.
---


## Networking layer

QuestDB exposes several network interfaces and protocols to allow different client applications to interact with the database

### InfluxDB Line protocol (ILP) over HTTP or TCP

The [Influx Line Protocol](/docs/reference/api/ilp/overview/) allows for very high throughput of incoming data. It supports
both HTTP (recommended) or TCP. QuestDB provides official clients in seven different programming languages, as well as
integrations with third-party tools like Apache Kafka, Apache Flink, or Telegraf. Any ILP-compatible library can be used
for ingesting data into QuestDB over HTTP.

The default port number for ILP over HTTP is `9000`, and for ILP over TCP is `9009`.

### PostgreSQL wire protocol

QuestDB exposes a [PostgreSQL wire](/docs/reference/sql/overview/#postgresql) protocol, which can be used to send SQL
statements both for data definition or for data manipulation. When used for data ingestion, throughput is noticeably
lower than using the ILP protocol.

QuestDB implements the wire protocol, allowing many third-party libraries to query QuestDB directly. Some client libraries
might be incompatible if they rely heavily on PostgreSQL metadata, as QuestDB implements only a subset of it. For an
overview of some key differences on QuestDB schema design, please visit our
[Schema Design Essentials](/docs/guides/schema-design-essentials/) guide.

The default port number for the pg-wire interface is `8812`.

### HTTP Rest API

QuestDB [REST API](/docs/reference/sql/overview/#rest-http-api) can be used to issue SQL statements over HTTP. It also
exposes and endpoint for importing CSV files, and for exporting tables and query results.

The default port number for the REST API is `9000`.

### Minimal HTTP server for health-check and metrics

QuestDB exposes an HTTP interface for monitoring. Please see the [Observability](#observability--diagnostics) section
for more information.

The default port number for the minimal HTTP server is `9003`.

## Next Steps

- Back to the [QuestDB Architecture](../questdb-architecture) overview
- [QuestDB GitHub Repository](https://github.com/questdb/questdb)
- [QuestDB Documentation](/docs)

