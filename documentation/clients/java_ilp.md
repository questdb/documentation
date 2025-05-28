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

Add a QuestDB as a dependency in your project's build configuration file.

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

The code below creates an instance of a client configured to use HTTP transport
to connect to a QuestDB server running on localhost on port 9000. It then sends
two rows, each containing one symbol and two floating-point values. The client
requests the server to assign a timestamp to each row based on the server's
wall-clock time.

<RemoteRepoExample name="ilp-http" lang="java" header={false} />

The configuration for the client is specified using a configuration string. This
string follows the format:

```text
<protocol>::<key>=<value>;<key>=<value>;...;
```

The valid transport protocols are:

- `http`: ILP/HTTP
- `https`: ILP/HTTP with TLS encryption
- `tcp`: ILP/TCP
- `tcps`: ILP/TCP with TLS encryption

A [transport protocol](/docs/reference/api/ilp/overview/#transport-selection)
and the key `addr=host:port` are required. The key `addr` defines the hostname
and port of the QuestDB server. If the port is not specified, it defaults to
9000 for HTTP(s) transports and 9009 for TCP(s) transports. For a complete list
of options, refer to the [Configuration Options](#configuration-options)
section.

## Example with TLS and Authentication enabled

This sample configures a client to use HTTP transport with TLS enabled for a
connection to a QuestDB server. It also instructs the client to authenticate
using HTTP Basic Authentication.

When using QuestDB Enterprise, authentication can also be done via REST token.
Please check the [RBAC docs](/docs/operations/rbac/#authentication) for more
info.

<RemoteRepoExample name="ilp-http-auth" lang="java" header={false} />

## Client instantiation

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

## Ingesting arrays

To ingest a 1D or 2D array, simply construct a Java array of the appropriate
type (`double[]`, `double[][]`) and supply it to the `arrayColumn()` method. In
order to avoid GC overheads, you are highly encouraged create the array instance
once, and then populate it with the data of each row.

For arrays of higher dimensionality, use the `DoubleArray` class. Here's a basic
example for a 3D array:

```java
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

## Flushing

Client accumulates data into an internal buffer. Flushing the buffer sends the
data to the server over the network and clears the buffer.

Flushing can be done explicitly or automatically.

### Explicit flushing

An explicit flush can be done by calling the `flush()` method.

```java
 try (Sender sender = Sender.fromConfig("http::addr=localhost:9000;")) {
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

### Automatic flushing

To avoid accumulating very large buffers, the client will - by default - flush
the buffer automatically.

HTTP auto-flushing is triggered when appending a row to the internal buffer and
the buffer either:

- Reaches 75,000 rows
- Hasn't been flushed for 1 second.

Both parameters control batching and can be customized. Larger batches can
improve throughput, but can increase lag between data ingestion and visibility
in a target table. Smaller batches can reduce this lag, but can also reduce
throughput.

A configuration string example that auto-flushes every 10 rows or every 10
seconds, whichever comes first:

`http::addr=localhost:9000;auto_flush_rows=10;auto_flush_interval=10000;`

An example with auto-flushing disabled:

`http::addr=localhost:9000;auto_flush=off;`

TCP auto-flushing is triggered when appending a row to the internal sender
buffer and the buffer is full.

Auto-flushing is also triggered when the client is being closed. Be aware that
retrying of failed requests is disabled when flushing on close.

## Error handling

The HTTP transport supports automatic retries for failed requests deemed
recoverable. Recoverable errors include network errors, some server errors, and
timeouts, while non-recoverable errors encompass invalid data, authentication
errors, and other client-side errors.

Retrying is particularly beneficial during network issues or when the server is
temporarily unavailable. The retrying behavior can be configured through the
`retry_timeout` configuration option or via the builder API with
`retryTimeoutMillis(long timeoutMillis)`. The client continues to retry
recoverable errors until they either succeed or the specified timeout is
reached. Upon reaching the timeout, the client ceases retry attempts and throws
`LineSenderException`.

When utilizing the HTTP transport, the client can be reused after receiving an
error. Conversely, a client using TCP transport should be discarded after an
error, necessitating the creation of a new client.

Retrying is disabled for failed requests when executing a flush upon closure.

The TCP transport lacks support for error propagation from the server. In such
cases, the server merely closes the connection upon encountering an error, which
manifests as a `LineSenderException` on the client side. Consequently, the
client receives no additional error information from the server. This limitation
significantly contributes to the preference for HTTP transport over TCP
transport.

## Designated timestamp considerations

The concept of [designated timestamp](/docs/concept/designated-timestamp/) is
important when ingesting data into QuestDB.

There are two ways to assign a designated timestamp to a row:

1. User-assigned timestamp: The client assigns a specific timestamp to the row.

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

2. Server-assigned timestamp: The server automatically assigns a timestamp to
   the row based on the server's wall-clock time. Example:

   ```java
   sender.table("trades")
         .symbol("symbol", "ETH-USD")
         .symbol("side", "sell")
         .doubleColumn("price", 2615.54)
         .doubleColumn("amount", 0.00044)
         .atNow();
   ```

We recommended to use User-assigned timestamps when ingesting data into QuestDB.
Using Server-assigned hinder the ability to deduplicate rows which is
[important for exactly-once processing](/docs/reference/api/ilp/overview/#exactly-once-delivery-vs-at-least-once-delivery).

:::note

QuestDB works best when rows are ingested in chronological order. This means
rows with older timestamps are ingested before rows with newer timestamps.

:::

## Protocol Version
To enhance data ingestion performance, the client-server communication protocol is being upgraded from text-based to binary encoding. The transition can be managed through the sender's parameter `protocol_version`.

For HTTP implementations:  
- Protocol version auto-negotiation occurs during handshake
- No manual configuration required in most scenarios  
- Advanced use case: Set `protocol_version=2|1` to bypass initial protocol discovery for ultra-low latency requirements 

For TCP connections:  
- Lacks automatic protocol detection capability  
- Defaults to text-based format (protocol_version=1)  
- Mandatory configuration:  
  Set `protocol_version=2` when:  
  a) Connecting to servers built after `8.4.0`
  b) Requiring array-type data writes

Here is a configuration string with `protocol_version=2` for `TCP`:

```
tcp::addr=localhost:9000;protocol_version=2;
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
