---
title: Rust Client Documentation
description:
  "Dive into QuestDB using the Rust ingestion client for high-performance,
  insert-only operations. Unlock peak time series data ingestion."
---

import { ILPClientsTable } from "@theme/ILPClientsTable"

QuestDB offers a Rust client designed for high-performance data ingestion. These
are some of the highlights:

- **Creates tables automatically**: no need to define your schema up-front.
- **Concurrent schema changes**: seamlessly handle multiple data streams that
  modify the table schema on the fly
- **Optimized batching**: buffer the data and send many rows in one go.
- **Health checks and feedback**: built-in health monitoring ensures the health
  of your system.

<ILPClientsTable language="Rust" />

## Requirements

- Requires Rust 1.40 or later.
- Assumes your QuestDB server is already running. If you don't have a QuestDB
  server yet, refer to [the general quick start](/docs/quick-start/).

## Add the client crate to your project

Add the QuestDB client to your project using the command line:

```bash
cargo add questdb-rs
```

## Quick example

This snippet connects to QuestDB running locally, creates the table `sensors`,
and adds one row to it:

```rust
use questdb::{
    Result,
    ingress::{
        Sender,
        Buffer,
        TimestampNanos}};

fn main() -> Result<()> {
   let mut sender = Sender::from_conf("http::addr=localhost:9000;")?;
   let mut buffer = Buffer::new();
   buffer
       .table("sensors")?
       .symbol("id", "toronto1")?
       .column_f64("temperature", 20.0)?
       .column_i64("humidity", 50)?
       .at(TimestampNanos::now())?;
   sender.flush(&mut buffer)?;
   Ok(())
}
```

These are the main steps it takes:

- Use `Sender::from_conf()` to get the `Sender` object
- Populate a `Buffer` with one or more rows of data
- Send the buffer using `sender.flush()`(`Sender::flush`)

## Configuration string

The easiest way to configure the line sender is the configuration string. The
general structure is:

```plain
<transport>::addr=host:port;param1=val1;param2=val2;...
```

`transport` can be `http`, `https`, `tcp`, or `tcps`. Go to the client's
[crate documentation](https://docs.rs/questdb-rs/latest/questdb/ingress) for the
full details on configuration.

## Don't forget to flush

The sender and buffer objects are entirely decoupled. This means that the sender
won't get access to the data in the buffer until you explicitly call
`sender.flush(&mut buffer)` or a variant. This may lead to a pitfall where you
drop a buffer that still has some data in it, resulting in permanent data loss.

A common technique is to flush periodically on a timer and/or once the buffer
exceeds a certain size. You can check the buffer's size by the calling
`buffer.len()`.

The default `flush()` method clears the buffer after sending its data. If you
want to preserve its contents (for example, to send the same data to multiple
QuestDB instances), call `sender.flush_and_keep(&mut buffer)` instead.

## Error handling

The two supported transport modes, HTTP and TCP, handle errors very differently.
In a nutshell, HTTP is much better at error handling.

### HTTP

HTTP distinguishes between recoverable and non-recoverable errors. For
recoverable ones, it enters a retry loop with exponential backoff, and reports
the error to the caller only after it has exhausted the retry time budget
(configuration parameter: `retry_timeout`).

`sender.flush()` and variant methods communicate the error in the `Result`
return value. The category of the error is signalled through the `ErrorCode`
enum, and it's accompanied with an error message.

After the sender has signalled an error, it remains usable. You can handle the
error as appropriate and continue using it.

### TCP

TCP doesn't report errors at all to the sender; instead, the server quietly
disconnects and you'll have to inspect the server logs to get more information
on the reason. When this has happened, the sender transitions into an error
state, and it is permanently unusable. You must drop it and create a new sender.
You can inspect the sender's error state by calling `sender.must_close()`.

## Authentication example: HTTP Basic

This is how you'd set up the client to authenticate using the HTTP Basic
authentication:

```no_run
let mut sender = Sender::from_conf(
    "https::addr=localhost:9000;username=testUser1;password=Yfym3fgMv0B9;"
)?;
```

Go to [the docs](https://docs.rs/questdb-rs/latest/questdb/ingress) for the
other available options.

## Configure using the environment variable

You can set the `QDB_CLIENT_CONF` environment variable:

```bash
export QDB_CLIENT_CONF="https::addr=localhost:9000;username=admin;password=quest;"
```

Then you use it like this:

```rust
let mut sender = Sender::from_env()?;
```

## Crate features

The QuestDB client crate supports some optional features, mostly related to
additional library dependencies.

### Default-enabled features

- `tls-webpki-certs`: supports using the `webpki-roots` crate for TLS
  certificate verification.

### Optional features

These features are opt-in:

- `ilp-over-http`: Enables ILP/HTTP support using the `ureq` crate.
- `chrono_timestamp`: Allows specifying timestamps as `chrono::Datetime`
  objects.
- `tls-native-certs`: Supports validating TLS certificates against the OS's
  certificates store.
- `insecure-skip-verify`: Allows skipping server certificate validation in TLS
  (this compromises security).

## Usage considerations

### Transactional flush

When using HTTP, you can arrange that each `flush()` call happens within its own
transaction. For this to work, your buffer must contain data that targets only
one table. This is because QuestDB doesn't support multi-table transactions.

In order to ensure in advance that a flush will be transactional, call
[`sender.flush_and_keep_with_flags(&mut buffer, true)`](Sender::flush_and_keep_with_flags).
This call will refuse to flush a buffer if the flush wouldn't be transactional.

### When to choose the TCP transport?

The TCP transport mode is raw and simplistic: it doesn't report any errors to
the caller (the server just disconnects), has no automatic retries, requires
manual handling of connection failures, and doesn't support transactional
flushing.

However, TCP has a lower overhead than HTTP and it's worthwhile to try out as an
alternative in a scenario where you have a constantly high data rate and/or deal
with a high-latency network connection.

### Timestamp column name

InfluxDB Line Protocol (ILP) does not give a name to the designated timestamp,
so if you let this client auto-create the table, it will have the default name.
To use a custom name, create the table using a DDL statement:

```sql
CREATE TABLE sensors (
    my_ts timestamp,
    id symbol,
    temperature double,
    humidity double,
) timestamp(my_ts);
```

## Health check

The QuestDB server has a "ping" endpoint you can access to see if it's alive,
and confirm the version of InfluxDB Line Protocol with which you are
interacting:

```shell
curl -I http://localhost:9000/ping
```

Example of the expected response:

```shell
HTTP/1.1 204 OK
Server: questDB/1.0
Date: Fri, 2 Feb 2024 17:09:38 GMT
Transfer-Encoding: chunked
Content-Type: text/plain; charset=utf-8
X-Influxdb-Version: v2.7.4
```

## Next steps

Explore the full capabilities of the Rust client via the
[Crate API page](https://docs.rs/questdb-rs/latest/questdb/).

With data flowing into QuestDB, now it's time to for analysis.

To learn _The Way_ of QuestDB SQL, see the
[Query & SQL Overview](/docs/reference/sql/overview/).

Alone? Stuck? Want help? Visit us in our
[Community Forum](https://community.questdb.io/).
