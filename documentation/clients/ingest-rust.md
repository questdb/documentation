---
title: Rust Client Documentation
description:
  "Dive into QuestDB using the Rust ingestion client for high-performance,
  insert-only operations. Unlock peak time series data ingestion."
---

import { ILPClientsTable } from "@theme/ILPClientsTable"

QuestDB offers a Rust client designed for high-performance data ingestion. These
are some of the highlights:

- **Creates tables automatically**: no need to define your schema up-front
- **Concurrent schema changes**: seamlessly handle multiple data streams that
  modify the table schema on the fly
- **Optimized batching**: buffer the data and send many rows in one go
- **Health checks and feedback**: built-in health monitoring ensures the health
  of your system

<ILPClientsTable language="Rust" />

:::info

This page focuses on our high-performance ingestion client, which is optimized
for **writing** data to QuestDB. For retrieving data, we recommend using a
[PostgreSQL-compatible Rust library](/docs/pgwire/rust/) or our
[HTTP query endpoint](/docs/reference/sql/overview/#rest-http-api).

:::

If you don't have a QuestDB server yet, follow the
[Quick Start](/docs/quick-start/) section to set it up.

## Add the client crate to your project

QuestDB clients requires Rust 1.40 or later. Add its crate to your project using
the command line:

```bash
cargo add questdb-rs
```

## Authenticate

This is how you authenticate using the HTTP Basic authentication:

```rust
let mut sender = Sender::from_conf(
    "https::addr=localhost:9000;username=admin;password=quest;"
)?;
```

You can also pass the connection configuration via the `QDB_CLIENT_CONF`
environment variable:

```bash
export QDB_CLIENT_CONF="http::addr=localhost:9000;username=admin;password=quest;"
```

Then you use it like this:

```rust
let mut sender = Sender::from_env()?;
```

When using QuestDB Enterprise, you can authenticate via a REST token. Please
check the [RBAC docs](/docs/operations/rbac/#authentication) for more info.

## Insert data

This snippet connects to QuestDB and inserts one row of data:

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
       .table("trades")?
       .symbol("symbol", "ETH-USD")?
       .symbol("side", "sell")?
       .column_f64("price", 2615.54)?
       .column_f64("amount", 0.00044)?
       .at(TimestampNanos::now())?;
   sender.flush(&mut buffer)?;
   Ok(())
}
```

These are the main steps it takes:

- Use `Sender::from_conf()` to get the `sender` object
- Populate a `Buffer` with one or more rows of data
- Send the buffer using `sender.flush()`(`Sender::flush`)

In this case, the designated timestamp will be the one at execution time.

Let's see now an example with timestamps using Chrono, custom timeout, and basic
auth.

You need to enable the `chrono_timestamp` feature to the QuestDB crate and add
the Chrono crate.

```bash
cargo add questdb-rs --features chrono_timestamp
cargo add chrono
```

```rust
use questdb::{
    Result,
    ingress::{
        Sender,
        Buffer,
        TimestampNanos
    },
};
use chrono::Utc;

fn main() -> Result<()> {
    let mut sender = Sender::from_conf(
      "http::addr=localhost:9000;username=admin;password=quest;retry_timeout=20000;"
      )?;
    let mut buffer = Buffer::new();
    let current_datetime = Utc::now();

    buffer
        .table("trades")?
        .symbol("symbol", "ETH-USD")?
        .symbol("side", "sell")?
        .column_f64("price", 2615.54)?
        .column_f64("amount", 0.00044)?
        .at(TimestampNanos::from_datetime(current_datetime)?)?;

    sender.flush(&mut buffer)?;
    Ok(())
}
```

:::warning

Avoid using `at_now()` instead of `at(some_timestamp)`. This removes the ability
to deduplicate rows, which is
[important for exactly-once processing](/docs/reference/api/ilp/overview/#exactly-once-delivery-vs-at-least-once-delivery).

:::

## Ingest arrays

The `Sender::column_arr` method supports efficient ingestion of N-dimensional
arrays using several convenient types:

- native Rust arrays and slices (up to 3-dimensional)
- native Rust vectors (up to 3-dimensional)
- arrays from the [ndarray](https://docs.rs/ndarray) crate, or other types that
  support the `questdb::ingress::NdArrayView` trait.

In this example, we insert some FX order book data.
* `bids` and `asks`: 2D arrays of L2 order book depth. Each level contains price and volume.
* `bids_exec_probs` and `asks_exec_probs`: 1D arrays of calculated execution probabilities for the next minute.

:::note

You must use protocol version 2 to ingest arrays. HTTP transport will
automatically enable it as long as you're connecting to an up-to-date QuestDB
server (version 8.4.0 or later), but with TCP you must explicitly specify it in
the configuration string: `protocol_version=2;` See [below](#protocol-version)
for more details on protocol versions.

:::

```rust
use questdb::{Result, ingress::{SenderBuilder, TimestampNanos}};
use ndarray::arr2;

fn main() -> Result<()> {
    // or `tcp::addr=127.0.0.1:9009;protocol_version=2;`
    let mut sender = SenderBuilder::from_conf("http::addr=127.0.0.1:9000;")?
        .build()?;

    let mut buffer = sender.new_buffer();
    buffer
        .table("fx_order_book")? 
        .symbol("symbol", "EUR/USD")?
        .column_arr("bids", &vec![
            vec![1.0850, 600000.0],
            vec![1.0849, 300000.0],
            vec![1.0848, 150000.0]])?
        .column_arr("asks", &arr2(&[
            [1.0853, 500000.0],
            [1.0854, 250000.0],
            [1.0855, 125000.0]]).view())?
        .column_arr("bids_exec_probs",
            &[0.85, 0.50, 0.25])?
        .column_arr("asks_exec_probs",
            &vec![0.90, 0.55, 0.20])?
        .at(TimestampNanos::now())?;

    eprintln!("Buffer: {:?}", buffer.as_bytes());

    sender.flush(&mut buffer)?;
    Ok(())
}
```

## Configuration options

The easiest way to configure the line sender is the configuration string. The
general structure is:

```plain
<transport>::addr=host:port;param1=val1;param2=val2;...
```

`transport` can be `http`, `https`, `tcp`, or `tcps`. Go to the client's
[crate documentation](https://docs.rs/questdb-rs/latest/questdb/ingress) for the
full details on configuration.

Alternatively, for breakdown of available params, see the
[Configuration string](/docs/configuration-string/) page.

## Don't forget to flush

The sender and buffer objects are entirely decoupled. This means that the sender
won't get access to the data in the buffer until you explicitly call
`sender.flush(&mut buffer)` or a variant. This may lead to a pitfall where you
drop a buffer that still has some data in it, resulting in permanent data loss.

A common technique is to flush periodically on a timer and/or once the buffer
exceeds a certain size. You can check the buffer's size by calling
`buffer.len()`.

The default `flush()` method clears the buffer after sending its data. If you
want to preserve its contents (for example, to send the same data to multiple
QuestDB instances), call `sender.flush_and_keep(&mut buffer)` instead.

## Transactional flush

As described in
[ILP overview](/docs/reference/api/ilp/overview#http-transaction-semantics), the
HTTP transport has some support for transactions.

In order to ensure in advance that a flush will not affect more than one table,
call `sender.flush_and_keep_with_flags(&mut buffer, true)`. This call will
refuse to flush a buffer if the flush wouldn't be data-transactional.

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

For more details about the HTTP and TCP transports, please refer to the
[ILP overview](/docs/reference/api/ilp/overview#transport-selection).

## Protocol Version

To enhance data ingestion performance, QuestDB introduced an upgrade to the
text-based InfluxDB Line Protocol which encodes arrays and `f64` values in
binary form. Arrays are supported only in this upgraded protocol version.

You can select the protocol version with the `protocol_version` setting in the
configuration string.

HTTP transport automatically negotiates the protocol version by default. In order
to avoid the slight latency cost at connection time, you can explicitly configure
the protocol version by setting `protocol_version=2|1;`.

TCP transport does not negotiate the protocol version and uses version 1 by
default. You must explicitly set `protocol_version=2;` in order to ingest
arrays, as in this example:

```text
tcp::addr=localhost:9000;protocol_version=2;
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
- `ndarray`: Enables ingestion of arrays from the
  [ndarray](https://docs.rs/ndarray) crate.

## Next steps

Please refer to the [ILP overview](/docs/reference/api/ilp/overview) for details
about transactions, error control, delivery guarantees, health check, or table
and column auto-creation.

Explore the full capabilities of the Rust client via the
[Crate API page](https://docs.rs/questdb-rs/latest/questdb/).

With data flowing into QuestDB, now it's time for analysis.

To learn _The Way_ of QuestDB SQL, see the
[Query & SQL Overview](/docs/reference/sql/overview/).

Alone? Stuck? Want help? Visit us in our
[Community Forum](https://community.questdb.com/).
