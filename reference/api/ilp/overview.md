---
title: InfluxDB Line Protocol Overview
sidebar_label: Overview
description: InfluxDB line protocol reference documentation.
---

import { RemoteRepoExample } from "@theme/RemoteRepoExample"

import Tabs from "@theme/Tabs"

import TabItem from "@theme/TabItem"

import ILPRubyPartial from "../../../partials/\_ruby.ilp.partial.mdx"

import ILPPHPPartial from "../../../partials/\_php.ilp.partial.mdx"

QuestDB implements the InfluxDB Line Protocol to ingest data.

The InfluxDB Line Protocol is for **data ingestion only**.

For building queries, see the
[Query & SQL Overview](/docs/reference/sql/overview/).

Each ILP client library also has its own language-specific documentation set.

This supporting document thus provides an overview to aid in client selection
and initial configuration:

1. [Client libraries](/docs/reference/api/ilp/overview/#client-libraries)
2. [Configuration](/docs/reference/api/ilp/overview/#configuration)
3. [Authentication](/docs/reference/api/ilp/overview/#authentication)
4. [Transactionality caveat](/docs/reference/api/ilp/overview/#transactionality-caveat)

## Client libraries

The quickest way to get started is to select your library of choice.

From there, its documentation will carry you through to implementation.

Client libraries are available for several languages:

- [C & C++](/docs/clients/ingest-c-and-cpp)
- [.NET](/docs/clients/ingest-dotnet)
- [Go](/docs/clients/ingest-go)
- [Java](/docs/clients/java_ilp)
- [Node.js](/docs/clients/ingest-node)
- [Python](/docs/clients/ingest-python)
- [Rust](/docs/clients/ingest-rust)

If you'd like more context on ILP overall, please continue reading.

## Enable or disable ILP

If going over HTTP, ILP will use shared HTTP port `9000` (default) if the
following is set in `server.conf`:

```conf
line.http.enabled=true
```

## Configuration

The HTTP receiver configuration can be completely customized using
[QuestDB configuration keys for ILP](/docs/configuration/#influxdb-line-protocol-ilp).

Configure the thread pools, buffer and queue sizes, receiver IP address and
port, load balancing, and more.

For more guidance in how to tune QuestDB, see
[capacity planning](/docs/deployment/capacity-planning/).

## Authentication

:::note

Using [QuestDB Enterprise](/enterprise/)?

Skip to [advanced security features](/docs/operations/rbac/) instead, which
provides holistic security out-of-the-box.

:::

InfluxDB Line Protocol supports authentication.

A similar pattern is used across all client libraries.

This document will break down and demonstrate the configuration keys and core
configuration options.

Once a client has been selected and configured, resume from your language client
documentation.

### Configuration strings

Configuration strings combine a set of key/value pairs.

Assembling a string connects an ILP client to a QuestDB ILP server.

The standard configuration string pattern is:

```

schema::key1=value1;key2=value2;key3=value3;

```

It is made up of the following parts:

- **Schema**: One of the specified schemas in the
  [base values](/docs/reference/api/ilp/overview/#base-parameters) section below
- **Key=Value**: Each key-value pair sets a specific parameter for the client
- **Terminating semicolon**: A semicolon must follow the last key-value pair

### Client parameters

Below is a list of common parameters that ILP clients will accept.

These params facilitate connection to QuestDB's ILP server and define
client-specific behaviors.

Some are shared across all clients, while some are client specific.

See the [Usage section](/docs/reference/api/ilp/overview/#usage) for write
examples that use these schemas.

:::warning

Any parameters tagged as `SENSITIVE` must be handled with care.

Exposing these values may expose your database to bad actors.

:::

#### Core parameters

- **schema**: Specifies the transport method, with support for: `http`, `https`,
  `tcp` & `tcps`
- **addr**: The address and port of the QuestDB server.

#### HTTP Parameters

- **username**: Username for HTTP authentication.
- **password** (SENSITIVE): Password for HTTP Basic authentication.
- **token** (SENSITIVE): Bearer token for HTTP Token authentication.
  - Open source HTTP users are unable to generate tokens. For TCP token auth,
    see the below section.
- **request_min_throughput**: Expected throughput for network send to the
  database server, in bytes.
  - Defaults to 100 KiB/s
  - Used to calculate a dynamic timeout for the request, so that larger requests
    do not prematurely timeout.
- **request_timeout**: Base timeout for HTTP requests to the database, in
  milliseconds.
  - Defaults to 10 seconds.
- **retry_timeout**: Maximum allowed time for client to attempt retries, in
  milliseconds.
  - Defaults to 10 seconds.
  - Not all errors are retriable.

#### Auto-flushing behavior

- **auto_flush**: Enable or disable automatic flushing (`on`/`off`).

  - Default is “on” for clients that support auto-flushing (all except C, C++ &
    Rust).

- **auto_flush_rows**: Auto-flushing is triggered above this row count.

  - Defaults to `75,000` for HTTP, and `600` for TCP.
  - If set, this implies “auto_flush=on”.

- **auto_flush_interval**: Auto-flushing is triggered after this time period has
  elapsed since the last flush, in milliseconds.

  - Defaults to 1 second
  - This is not a periodic timer - it will only be checked on the next row
    creation.

- **auto_flush_bytes** Auto-flushing is triggered above this buffer size.
  - Disabled by default.

#### Network configuration

_Optional._

- **bind_interface**: Specify the local network interface for outbound
  connections.
  - Not to be confused with the QuestDB port in the `addr` param.

#### TLS configuration

- **tls_verify**: Toggle verification of TLS certificates. Default is `on`.
- **tls_roots**: Specify the source of bundled TLS certificates.
  - The defaults and possible param values are client-specific.
    - In Rust and Python this might be “webpki”, “os-certs” or a path to a “pem”
      file.
    - In Java this might be a path to a “jks” trust store.
    - **tls_roots_password** Password to a configured tls_roots if any.
      - Passwords are sensitive! Manage appropriately.
- **tls_ca**: Path to single certificate authourity, not supported on all
  clients.
  - Java for instance would apply `tls_roots=/path/to/Java/key/store`

#### Buffer configuration

- **init_buf_size**: Set the initial (but growable) size of the buffer in bytes.
  - Defaults to `64 KiB`.
- **max_buf_size**: Sets the growth limit of the buffer in bytes.
  - Defaults to `100 MiB`.
  - Clients will error if this is exceeded.
- **max_name_len**: The maximum alloable number of UTF-8 bytes in the table or
  column names.
  - Defaults to `127`.
  - Related to length limits for filenames on the user's host OS.

#### TCP Parameters

:::note

These parameters are only useful when using ILP over TCP with authentication
enabled. Most users should use ILP over HTTP. These parameters are listed for
completeness and for users who have specific requirements.

:::

- **username**: Username for TCP authentication.
- **token** (SENSITIVE): TCP Authentication `d` parameter.
  - **token_x** (SENSITIVE): TCP Authentication `x` parameter.
    - Used in C/C++/Rust/Python clients.
  - **token_y** (SENSITIVE): TCP Authentication `y` parameter.
    - Used in C/C++/Rust/Python clients.
- **auth_timeout**: Timeout for TCP authentication with QuestDB server, in
  milliseconds.
  - Default 15 seconds.

## Transactionality caveat

As of writing, the HTTP endpoint does not provide full transactionality in all
cases.

Specifically:

- If an HTTP request contains data for two tables and the final commit fails for
  the second table, the data for the first table will still be committed. This
  is a deviation from full transactionality, where a failure in any part of the
  transaction would result in the entire transaction being rolled back.

- When adding new columns to a table, an implicit commit occurs each time a new
  column is added. If the request is aborted or has parse errors, this commit
  cannot be rolled back.
