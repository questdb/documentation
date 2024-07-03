---
title: C & C++ Client Documentation
description:
  "Dive into QuestDB using the C & C++ ingestion client for high-performance,
  insert-only operations. Unlock peak time series data ingestion."
test: "foo"
---

import { ILPClientsTable } from "@theme/ILPClientsTable"

QuestDB supports the C & C++ programming languages, providing a high-performance
ingestion client tailored for insert-only operations. This integration ensures
peak efficiency in time series data ingestion and analysis, perfectly suited for
systems for systems which require top performance and minimal latency.

Key features of the QuestDB C & C++ client include:

- **Automatic table creation**: No need to define your schema upfront.
- **Concurrent schema changes**: Seamlessly handle multiple data streams with
  on-the-fly schema modifications
- **Optimized batching**: Use strong defaults or curate the size of your batches
- **Health checks and feedback**: Ensure your system's integrity with built-in
  health monitoring
- **Automatic write retries**: Reuse connections and retry after interruptions

This guide aims to help you swiftly set up and begin using the QuestDB C++
client.

## C++

<ILPClientsTable language="C++" />

Explore the full capabilities of the C++ client via the
[C++ README](https://github.com/questdb/c-questdb-client/blob/main/doc/CPP.md).

### Requirements

- Requires a C++ compiler and standard libraries.
- Assumes QuestDB is running. If it's not, refer to
  [the general quick start](/docs/quick-start/).

### Client Installation

Clone the GitHub repository and compile the source code:

```bash
git clone https://github.com/questdb/c-questdb-client.git
cd c-questdb-client
make
```

This will compile the client library, which can then be linked to your C++
projects.

### Connection

The QuestDB C client supports basic connection and authentication
configurations.

Here is an example of how to configure and use the client for data ingestion:

```c
#include <questdb/ingress/line_sender.hpp>

...

auto sender = questdb::ingress::line_sender::from_conf(
    "http::addr=localhost:9000;");

```

### Basic data insertion

```c
questdb::ingress::line_sender_buffer buffer;
buffer
    .table("cpp_cars")
    .symbol("id", "d6e5fe92-d19f-482a-a97a-c105f547f721")
    .column("x", 30.5)
    .at(timestamp_nanos::now());

// To insert more records, call `buffer.table(..)...` again.

sender.flush(buffer);
```

## C

<ILPClientsTable language="C" />

Explore the full capabilities of the C client via the
[C README](https://github.com/questdb/c-questdb-client/blob/main/doc/C.md).

### Requirements

- Requires a C compiler and standard libraries.
- Assumes QuestDB is running. If it's not, refer to
  [the general quick start](/docs/quick-start/).

### Client Installation

Clone the GitHub repository and compile the source code:

```bash
git clone https://github.com/questdb/c-questdb-client.git
cd c-questdb-client
make
```

This will compile the client library, which can then be linked to your C
projects.

### Connection

The QuestDB C client supports basic connection and authentication
configurations. Here is an example of how to configure and use the client for
data ingestion:

```c
#include <questdb/ingress/line_sender.h>

...

line_sender_utf8 conf = QDB_UTF8_LITERAL(
    "http::addr=localhost:9000;");

line_sender_error* err = NULL;
line_sender* sender = sender = line_sender_from_conf(&err);
if (!sender) {
    /* ... handle error ... */
}
```

### Basic data insertion

```c
line_sender_table_name table_name = QDB_TABLE_NAME_LITERAL("c_cars");
line_sender_column_name id_name = QDB_COLUMN_NAME_LITERAL("id");
line_sender_column_name x_name = QDB_COLUMN_NAME_LITERAL("x");

line_sender_buffer* buffer = line_sender_buffer_new();

if (!line_sender_buffer_table(buffer, table_name, &err))
    goto on_error;

line_sender_utf8 id_value = QDB_UTF8_LITERAL(
    "d6e5fe92-d19f-482a-a97a-c105f547f721");
if (!line_sender_buffer_symbol(buffer, id_name, id_value, &err))
    goto on_error;

if (!line_sender_buffer_column_f64(buffer, x_name, 30.5, &err))
    goto on_error;

if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err))
    goto on_error;

// To insert more records, call `line_sender_buffer_table(..)...` again.

if (!line_sender_flush(sender, buffer, &err))
    goto on_error;

line_sender_close(sender);
```

## Health check

To monitor your active connection, there is a `ping` endpoint:

```shell
curl -I http://localhost:9000/ping
```

Returns (pong!):

```shell
HTTP/1.1 204 OK
Server: questDB/1.0
Date: Fri, 2 Feb 2024 17:09:38 GMT
Transfer-Encoding: chunked
Content-Type: text/plain; charset=utf-8
X-Influxdb-Version: v2.7.4
```

Determine whether an instance is active and confirm the version of InfluxDB Line
Protocol with which you are interacting.

## Next Steps

With data flowing into QuestDB, now it's time to for analysis.

To learn _The Way_ of QuestDB SQL, see the
[Query & SQL Overview](/docs/reference/sql/overview/).

Alone? Stuck? Want help? Visit us in our
[Community Forum](https://community.questdb.io/).
