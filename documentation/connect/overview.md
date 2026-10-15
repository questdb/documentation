---
slug: /connect/overview
title: Connect to QuestDB
sidebar_label: Overview
description:
  How to send data to QuestDB and run queries. Choose between native client
  libraries, the REST API, compatibility protocols (ILP, PGWire), or the
  wire-protocol specifications.
---

import { Clients } from "../../src/components/Clients"

QuestDB exposes several ways for applications to send data and run queries.
Pick the path that matches your environment.

## Choose your path

| Your situation                                                          | Use                                                              |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Greenfield app — want the best throughput, durability, and feature set  | [**Client Libraries**](#client-libraries)                        |
| An AI agent or MCP tooling driving the database                         | [Agents](/docs/connect/agents/)                                  |
| Kafka, Flink, Redpanda, or Telegraf pipelines                           | [Message brokers](/docs/integrations/overview/#data-ingestion-and-streaming) |
| HTTP scripts, ad-hoc `curl`, or CSV imports                             | [REST API](#rest-api)                                            |
| Existing InfluxDB collectors, or anything that already emits ILP        | [Compatibility → ILP](/docs/connect/compatibility/ilp/overview/)             |
| Postgres-shaped data layer, BI tools, ORMs                              | [Compatibility → PGWire](/docs/connect/compatibility/pgwire/overview/)           |
| Embedding QuestDB inside a JVM application                              | [Java (embedded)](/docs/connect/java-embedded/)                  |
| Building a new QuestDB client library (QWP spec)                        | [Wire Protocols](/docs/connect/wire-protocols/overview/)                      |

## Client Libraries

The first-party libraries for **Java, Python, Go, Rust, Node.js, C & C++, and
.NET** are the recommended way to talk to QuestDB. They speak the
**QuestDB Wire Protocol (QWP)** and unify ingest and query under one
client configuration. Ingestion and queries run over separate WebSocket
connections, which the clients' pools manage for you.

### QWP support

QWP ships in every library below. A library marked Beta may still change its
QWP API before it is declared stable.

| Language  | QWP support |
| --------- | ----------- |
| Java      | ✓ Stable    |
| C & C++   | ✓ Stable    |
| Rust      | ✓ Stable    |
| Python    | ✓ Stable    |
| Node.js   | ✓ Stable    |
| .NET      | Beta        |
| Go        | Beta        |

Highlights:

- **Binary on the wire** — roughly half the size of ILP or HTTP.
- **Streaming both directions** — sustained 800 MiB/s ingress, up to
  2.5 GiB/s egress on a single connection.
- **Automatic failover** — ingress and egress reconnect and fail over without
  application intervention. A query that fails over restarts from its first
  row, so code that accumulates rows must reset them; see each client's page.
- **Store-and-forward** — survives server outages, including full server
  destruction. Sub-200 ns offload latency.
- **One configuration** — a single
  [connect string](/docs/connect/clients/connect-string/) drives every
  option, with the same keys in every language. A few defaults and behaviors
  differ per client, as the connect string reference notes.
- **Schema-flexible** — automatic table creation and on-the-fly column
  additions.

The throughput and latency figures are peaks. Actual rates depend on the
client, the hardware, and the row shape: a Node.js process, for example,
encodes rows on a single CPU core. Measure with your own client and data
before sizing an ingestion tier.

Pick a language:

<Clients showProtocol="QWP" />

## REST API

HTTP / JSON endpoints on port `9000`, understood by any off-the-shelf HTTP
client. Reach for it when you want a `curl` one-liner, a shell script, a health
check, or a bulk file load without pulling in a client library. It is not
superseded by QWP.

- **[REST API](/docs/connect/compatibility/rest-api/)**: `/exec` runs SQL and
  returns JSON, `/imp` uploads CSV, `/exp` exports results as CSV or Parquet.
- **[CSV import](/docs/connect/compatibility/import-csv/)**: bulk loading a CSV
  file, over HTTP or with `COPY`.
- **[Parquet export](/docs/concepts/parquet/#export)**: writing query results to
  Parquet.

## Compatibility protocols

Use these if you have existing tooling that speaks them, or if a native client
library isn't a fit for your environment.

- **[InfluxDB Line Protocol (ILP)](/docs/connect/compatibility/ilp/overview/)** — the
  text-based ingest protocol used by InfluxDB. Works with Telegraf, Flink,
  and any collector that already emits ILP. The
  [Kafka connector](/docs/connect/message-brokers/kafka/) speaks QWP natively.
- **[PostgreSQL Wire Protocol (PGWire)](/docs/connect/compatibility/pgwire/overview/)** — query
  QuestDB from any Postgres-compatible driver (psycopg, JDBC, pgx, …), BI
  tools (Tableau, Grafana, Metabase), and ORMs.

These remain fully supported. They are grouped as *compatibility* because they
predate QWP and exist primarily to integrate with tooling that already speaks
them.

## Wire protocols

The byte-on-the-wire specifications for the **QuestDB Wire Protocol (QWP)**,
covering the WebSocket variants for ingress and egress. Read these if you are
**building a new QuestDB client library** in a language we don't yet support, or
embedding QuestDB connectivity into an existing framework.

QWP also has a UDP transport for fire-and-forget metrics, supported by the
Java, Python, Rust, C, C++ and Node.js clients via the `udp` connect-string
schema. It is configured through the [`qwp.udp.*` server
settings](/docs/configuration/qwp/#udp-receiver) and is disabled by default;
there is no separate byte-level specification page for it.

See the [Wire Protocols reference](/docs/connect/wire-protocols/overview/).

## Next steps

- Pick a language above and follow its quick-start.
- For SQL syntax, functions, and operators, see the
  [SQL Reference](/docs/query/overview/).
- New to QuestDB? Try the [demo instance](https://demo.questdb.io), or follow
  the [first-data-set guide](/docs/getting-started/create-database/).
- Background on time-series fundamentals:
  [timestamp basics](/docs/concepts/timestamps-timezones/).
