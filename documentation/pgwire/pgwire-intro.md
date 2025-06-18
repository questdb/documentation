---
title: PGWire Client Overview
description:
  QuestDB PGWire clients overview. Learn about the PGWire protocol and how to
  use it with QuestDB.
---

import { Clients } from "../../src/components/Clients"

QuestDB implements the PostgreSQL wire protocol (PGWire) to allow clients to connect to QuestDB using PostgreSQL client
libraries. This is a great way to get started with QuestDB, as it allows you to use existing PostgreSQL clients and
libraries.

<Clients showProtocol="PGWire"/>

When using PGWire with QuestDB, there are a few important things to know and the rest of this document will cover them
in more detail.

### Querying vs. Ingestion

The PGWire interface is primarily recommended for querying data from
QuestDB. For data ingestion, especially for high-throughput scenarios, QuestDB recommends using its clients that
support the [InfluxDB Line Protocol (ILP)](/docs/ingestion-overview/). These are optimized for fast data insertion.

### Timestamp Handling

QuestDB stores all timestamps internally in [UTC](https://en.wikipedia.org/wiki/Coordinated_Universal_Time).
However, when transmitting timestamps over the PGWire protocol, QuestDB represents them as `TIMESTAMP WITHOUT TIMEZONE`.
This can lead to client
libraries interpreting these timestamps in their local timezone by default, potentially causing confusion or incorrect
data representation. Our language-specific guides provide detailed examples on how to configure your client to correctly
interpret these timestamps as UTC.

We realize the current behavior is not ideal and we are actively working on improving it. In the meantime, we
recommend that you set the timezone in your client library to UTC to ensure consistent handling of timestamps.

### PGWire vs. SQL Semantics

While QuestDB supports the PGWire protocol for communication, its SQL dialect and feature
set are not identical to PostgreSQL. QuestDB is a specialized time-series database and does not support all SQL
features, functions, or data types that a standard PostgreSQL server does. Always refer to the QuestDB SQL
documentation for supported operations.

### Forward-only Cursors

QuestDB's cursors are forward-only, differing from PostgreSQL's support for scrollable cursors (which allow
bidirectional navigation and arbitrary row access). With QuestDB, you can iterate through query results sequentially
from start to finish, but you cannot move backward or jump to specific rows. Explicit DECLARE CURSOR statements for
scrollable types, or operations like fetching in reverse (e.g., Workspace BACKWARD), are not supported.

This limitation can impact client libraries that rely on scrollable cursor features. For example, Python's psycopg2
driver might encounter issues if attempting such operations. For optimal compatibility, choose drivers or configure
existing ones to use forward-only cursors, such as Python's asyncpg driver.

### Protocol Flavors and Encoding

The PostgreSQL wire protocol has different implementations and options. When your
client library allows, prefer the Extended Query Protocol over the Simple Query Protocol. Additionally, for optimal
performance and type fidelity, choose clients that support BINARY encoding for data transfer over TEXT encoding
whenever possible. The specifics of how to configure this will vary by client library.
