---
title: Java Client Documentation
description:   "Dive into QuestDB using the Java ingestion client for high-performance,
insert-only operations. Unlock peak time series data ingestion and analysis
efficiency."
---

import Tabs from "@theme/Tabs"

import TabItem from "@theme/TabItem"

import CodeBlock from "@theme/CodeBlock"

import InterpolateReleaseData from "../../src/components/InterpolateReleaseData"

import { RemoteRepoExample } from "@theme/RemoteRepoExample"

:::note

This is the reference for the QuestDB Java Client when QuestDB is used as a
server.

For embedded QuestDB, please check our
[Java Embedded Guide](/docs/reference/api/java-embedded/).

:::

The QuestDB Java client is baked right into the QuestDB binary.

The client provides the following benefits:

- **Automatic table creation**: No need to define your schema upfront.
- **Concurrent schema changes**: Seamlessly handle multiple data streams with
  on-the-fly schema modifications
- **Optimized batching**: Use strong defaults or curate the size of your batches
- **Health checks and feedback**: Ensure your system's integrity with built-in
  health monitoring
- **Automatic write retries**: Reuse connections and retry after interruptions

:::info

This page focuses on our high-performance ingestion client, which is optimized
for **writing** data to QuestDB. For retrieving data, we recommend using a
[PostgreSQL-compatible Java library](/docs/pgwire/java/) or our
[HTTP query endpoint](/docs/reference/sql/overview/#rest-http-api).

:::

## Compatible JDKs

The client relies on some JDK internal libraries, which certain specialised JDK
offerings may not support.

Here is a list of known incompatible JDKs:

- Azul Zing 17
  - A fix is in progress. You can use Azul Zulu 17 in the meantime.

## Quick start

Add QuestDB as a dependency in your project's build configuration file.

<Tabs defaultValue="maven" values={[ { label: "Maven", value: "maven" },
{ label: "Gradle", value: "gradle" }, ]}

>   <TabItem value="maven">

    <InterpolateReleaseData
      renderText={(release) => (
        <CodeBlock className="language-xml">
          {`<dependency>
  <groupId>org.questdb</groupId>
  <artifactId>questdb</artifactId>
  <version>${release.name}</version>
</dependency>`}
        </CodeBlock>
      )}
    />
  </TabItem>
  <TabItem value="gradle">
    <InterpolateReleaseData
      renderText={(release) => (
        <CodeBlock className="language-text">
          {`compile group: 'org.questdb', name: 'questdb', version: '${release.name}'`}
</CodeBlock> )} /> </TabItem> </Tabs>

The code below creates a client instance configured to use HTTP transport to
connect to a QuestDB server running on localhost, port 9000. It then sends two
rows, each containing one symbol and two floating-point values. The client asks
the server to assign a timestamp to each row based on the server's wall-clock
time.

<RemoteRepoExample name="ilp-http" lang="java" header={false} />

Configure the client using a configuration string. It follows this general
format:

```text
<protocol>::<key>=<value>;<key>=<value>;...;
```

[Transport protocol](/docs/reference/api/ilp/overview/#transport-selection)
can be one of these:

- `http` — ILP/HTTP
- `https` — ILP/HTTP with TLS encryption
- `tcp` — ILP/TCP
- `tcps` — ILP/TCP with TLS encryption

The key `addr` sets the hostname and port of the QuestDB server. Port defaults
to 9000 for HTTP(S) and 9009 for TCP(S).

The minimum configuration includes the transport and the address. For a complete
list of options, refer to the [Configuration Options](#configuration-options)
section.

## Authenticate and encrypt

This sample configures the client to use HTTP transport with TLS enabled for a
connection to a QuestDB server. It also instructs the client to authenticate
using HTTP Basic Authentication.

When using QuestDB Enterprise, you can authenticate using a REST bearer token as
well. Please check the [RBAC docs](/docs/operations/rbac/#authentication) for
more info.

<RemoteRepoExample name="ilp-http-auth" lang="java" header={false} />

## Ways to create the client

There are three ways to create a client instance:

1. **From a configuration string.** This is the most common way to create a
   client instance. It describes the entire client configuration in a single
   string. See [Configuration options](#configuration-options) for all available
   options. It allows sharing the same configuration across clients in different
   languages.

   ```java
   try (Sender sender = Sender.fromConfig("http::addr=localhost:9000;auto_flush_rows=5000;retry_timeout=10000;")) {
       // ...
   }
   ```

2. **From an environment variable.** The `QDB_CLIENT_CONF` environment variable
   is used to set the configuration string. Moving configuration parameters to
   an environment variable allows you to avoid hard-coding sensitive information
   such as tokens and password in your code.

   ```bash
   export QDB_CLIENT_CONF="http::addr=localhost:9000;auto_flush_rows=5000;retry_timeout=10000;"
   ```

   ```java
   try (Sender sender = Sender.fromEnv()) {
       // ...
   }
   ```

3. **Using the Java builder API.** This provides type-safe configuration.

   ```java
   try (Sender sender = Sender.builder(Sender.Transport.HTTP)
           .address("localhost:9000")
           .autoFlushRows(5000)
           .retryTimeoutMillis(10000)
           .build()) {
       // ...
   }
   ```
   
## Configuring multiple urls

:::note

This feature requires QuestDB OSS 9.1.0+ or Enterprise 3.0.4+.

:::

The ILP client can be configured with multiple _possible_ endpoints to send your data to. Only one will be sent to at
any one time.

To configure this feature, simply provide multiple `addr` entries. For example:


```java
try (Sender sender = Sender.fromConfig("http::addr=localhost:9000;addr=localhost:9999;")) {
   // ...
}
```

On initialisation, if `protocol_version=auto`, the sender will identify the first instance that is writeable. Then it will _stick_ to this instance and write
any subsequent data to it.

In the event that the instance becomes unavailable for writes, the client will retry the other possible endpoints, and when it finds 
a new writeable instance, will _stick_ to it instead. This unvailability is characterised by failures to connect or locate the instance, 
or the instance returning an error code due to it being read-only.

By configuring multiple addresses, you can continue allowing you to continue to capture data if your primary instance
fails, without having to reconfigure the clients. This backup instance can be hot or cold, and so long as it is assigned a known address, it will be written to as soon as it is started.

Enterprise users can leverage this feature to transparently handle replication failover, without the need to introduce a load-balancer or
reconfigure clients.

:::tip

You may wish to increase the value of `retry_timeout` if you expect your backup instance to take a large amount of time to become writeable.

:::


## General usage pattern

1. Create a client instance via `Sender.fromConfig()`.
2. Use `table(CharSequence)` to select a table for inserting a new row.
3. Use `symbol(CharSequence, CharSequence)` to add all symbols. You must add
   symbols before adding other column type.
4. Use the following options to add all the remaining columns:

   - `stringColumn(CharSequence, CharSequence)`
   - `longColumn(CharSequence, long)`
   - `doubleColumn(CharSequence, double)`
   - `boolColumn(CharSequence, boolean)`
   - `arrayColumn()` -- several variants, see below
   - `timestampColumn(CharSequence, Instant)`, or
     `timestampColumn(CharSequence, long, ChronoUnit)`

5. Use `at(Instant)` or `at(long timestamp, ChronoUnit unit)` or `atNow()` to
   set a designated timestamp.
6. Optionally: You can use `flush()` to send locally buffered data into a
   server.
7. Go to the step no. 2 to start a new row.
8. Use `close()` to dispose the Sender after you no longer need it.

## Ingest arrays

To ingest a 1D or 2D array, simply construct a Java array of the appropriate
type (`double[]`, `double[][]`) and supply it to the `arrayColumn()` method. In
order to avoid GC overheads, create the array instance once, and then populate
it with the data of each row.

For arrays of higher dimensionality, use the `DoubleArray` class. Here's a basic
example for a 3D array:

```java
// or "tcp::addr=localhost:9009;protocol_version=2;"
try (Sender sender = Sender.fromConfig("http::addr=localhost:9000;");
     DoubleArray ary = new DoubleArray(3, 3, 3);
) {
    for (int i = 0; i < ROW_COUNT; i++) {
        for (int value = 0; value < 3 * 3 * 3; value++) {
            ary.append(value);
        }
        sender.table("tango")
              .doubleArray("array", ary)
              .at(getTimestamp(), ChronoUnit.MICROS);
    }
}
```

The `ary.append(value)` method allows you to populate the array in the row-major
order, without having to compute every coordinate individually. You can also use
`ary.set(value, coords...)` to set a value at specific coordinates.

:::note
Arrays are supported from QuestDB version 9.0.0, and require updated
client libraries.
:::

## Flush the buffer

The client accumulates the data into an internal buffer and doesn't immediately
send it to the server. It can flush the buffer to the server either
automatically or on explicit request.

### Flush explicitly

You can configure the client to not use automatic flushing, and issue explicit
flush requests by calling `sender.flush()`:

```java
 try (Sender sender = Sender.fromConfig("http::addr=localhost:9000;auto_flush=off")) {
    sender.table("trades")
          .symbol("symbol", "ETH-USD")
          .symbol("side", "sell")
          .doubleColumn("price", 2615.54)
          .doubleColumn("amount", 0.00044)
          .atNow();
    sender.table("trades")
          .symbol("symbol", "TC-USD")
          .symbol("side", "sell")
          .doubleColumn("price", 39269.98)
          .doubleColumn("amount", 0.001)
          .atNow();
    sender.flush();
}
```

:::note

Calling `sender.flush()` will flush the buffer even with auto-flushing enabled,
but this isn't a typical way to use the client.

:::

### Flush automatically

By default, the client automatically flushes the buffer according to a simple
policy. With HTTP, it will automatically flush at the time you append a new
row, if either of these has become true:

- reached 75,000 rows
- hasn't been flushed for 1 second

Both parameters can be customized in order to achieve a good tradeoff between
throughput (large batches) and latency (small batches).

This configuration string will cause the client to auto-flush every 10 rows or
every 10 seconds, whichever comes first:

`http::addr=localhost:9000;auto_flush_rows=10;auto_flush_interval=10000;`

With TCP, the client flushes its internal buffer whenever it gets full.

The client will also flush automatically when it is being closed and there's
still some data in the buffer. However, **if the network operation fails at this
time, the client won't retry it.** Always explicitly flush the buffer before
closing the client.

## Error handling


:::note

If you have configured multiple addresses, retries will be run against different instances.

:::

HTTP automatically retries failed, recoverable requests: network errors, some
server errors, and timeouts. Non-recoverable errors include invalid data,
authentication errors, and other client-side errors.

Retrying is especially useful during transient network issues or when the server
goes offline for a short period. Configure the retrying behavior through the
`retry_timeout` configuration option or via the builder API with
`retryTimeoutMillis(long timeoutMillis)`. The client continues to retry after
recoverable errors until it either succeeds or the specified timeout expires. If
it hits the timeout without success, the client throws a `LineSenderException`.

The client won't retry requests while it's being closed and attempting to flush
the data left over in the buffer.

 The TCP transport has no mechanism to notify the client it encountered an
 error; instead it just disconnects. When the client detects this, it throws a
 `LineSenderException` and becomes unusable.

## Recover after a client-side error

With HTTP transport, the client always prepares a full row in RAM before trying
to send it. It also remains usable after an exception has occurred. This allows
you to cancel sending a row, for example due to a validation error, and go on
with the next row.

With TCP transport, you don't have this option. If you get an exception, you
can't continue with the same client instance, and don't have insight into which
rows were accepted by the server.

:::caution

Error handling behaviour changed with the release of QuestDB 9.1.0.

Previously, failing all retries would cause the code to except and release the buffered data.

Now the buffer will not be released. If you wish to re-use the same sender with fresh data, you must call the
new `reset()` function.

:::

## Designated timestamp considerations

The concept of [designated timestamp](/docs/concept/designated-timestamp/) is
important when ingesting data into QuestDB.

There are two ways to assign a designated timestamp to a row:

1. User-assigned timestamp: the client assigns a specific timestamp to the row.

   ```java
   java.time.Instant timestamp = Instant.now(); // or any other timestamp
   sender.table("trades")
         .symbol("symbol", "ETH-USD")
         .symbol("side", "sell")
         .doubleColumn("price", 2615.54)
         .doubleColumn("amount", 0.00044)
         .at(timestamp);
   ```

   The `Instant` class is part of the `java.time` package and is used to
   represent a specific moment in time. The `sender.at()` method can accept a
   long timestamp representing the elapsed time since the beginning of the
   [Unix epoch](https://en.wikipedia.org/wiki/Unix_time), as well as a
   `ChronoUnit` to specify the time unit. This approach is useful in
   high-throughput scenarios where instantiating an `Instant` object for each
   row is not feasible due to performance considerations.

2. Server-assigned timestamp: the server automatically assigns a timestamp to
   the row based on the server's wall-clock time at the time of ingesting the
   row. Example:

   ```java
   sender.table("trades")
         .symbol("symbol", "ETH-USD")
         .symbol("side", "sell")
         .doubleColumn("price", 2615.54)
         .doubleColumn("amount", 0.00044)
         .atNow();
   ```

We recommend using the event's original timestamp when ingesting data into
QuestDB. Using ingestion-time timestamps precludes the ability to deduplicate
rows, which is
[important for exactly-once processing](/docs/reference/api/ilp/overview/#exactly-once-delivery-vs-at-least-once-delivery).

:::note

QuestDB works best when you send data in chronological order (sorted by
timestamp).

:::

## Protocol Version

To enhance data ingestion performance, QuestDB _version 9.0.0_ introduced an
upgraded version "2" to the text-based InfluxDB Line Protocol which encodes
arrays and f64 values in binary form. Arrays are supported only in this upgraded
protocol version.

You can select the protocol version with the `protocol_version` setting in the
configuration string.

HTTP transport automatically negotiates the protocol version by default.
In order to avoid the slight latency cost at connection time, you can explicitly
configure the protocol version by setting `protocol_version=2|1;`.

TCP transport does not negotiate the protocol version and uses version 1 by
default. You must explicitly set `protocol_version=2;` in order to ingest
arrays, as in this example:

```text
tcp::addr=localhost:9009;protocol_version=2;
```

## Configuration options

Client can be configured either by using a configuration string as shown in the
examples above, or by using the builder API.

The builder API is available via the `Sender.builder(Transport transport)`
method.

For a breakdown of available options, see the
[Configuration string](/docs/configuration-string/) page.

## Other considerations

- Refer to the [ILP overview](/docs/reference/api/ilp/overview) for details
  about transactions, error control, delivery guarantees, health check, or table
  and column auto-creation.
- The method `flush()` can be called to force sending the internal buffer to a
  server, even when the buffer is not full yet.
- The Sender is not thread-safe. For multiple threads to send data to QuestDB,
  each thread should have its own Sender instance. An object pool can also be
  used to re-use Sender instances.
- The Sender instance has to be closed after it is no longer in use. The Sender
  implements the `java.lang.AutoCloseable` interface, and therefore the
  [try-with-resource](https://docs.oracle.com/javase/tutorial/essential/exceptions/tryResourceClose.html)
  pattern can be used to ensure that the Sender is closed.
