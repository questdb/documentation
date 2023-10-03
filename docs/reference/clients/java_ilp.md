---
title: Java InfluxDB Line Protocol client
description: Introducing QuestDB Java InfluxDB Line Protocol Client
---

<!-- prettier-ignore-start -->

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"
import CodeBlock from "@theme/CodeBlock"
import InterpolateReleaseData from "../../../src/components/InterpolateReleaseData"
import { RemoteRepoExample } from '@theme/RemoteRepoExample'

<!-- prettier-ignore-end -->

## Quickstart

Add a QuestDB as a dependency to your build project:

<!-- prettier-ignore-start -->

<Tabs
  defaultValue="maven"
  values={[
    { label: "Maven", value: "maven" },
    { label: "Gradle", value: "gradle" },
  ]}
>
  <TabItem value="maven">
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
        </CodeBlock>
      )}
    />
  </TabItem>
</Tabs>

<!-- prettier-ignore-end -->


The code bellow creates an instance of a client, configures it to connect to a
QuestDB server running on localhost on a TCP port 9009. Then it sends two rows,
each with one [symbol](/docs/concept/symbol/), long column and one string
column. It instructs the QuestDB server to assign a timestamp by using a local
wall-clock.

<RemoteRepoExample name="ilp" lang="java" header={false} />

## Example with TLS and Authentication enabled

This sample configures a client to use TLS encryption for a connection to a
QuestDB server. It also instructs the client to authenticate.

<RemoteRepoExample name="ilp-auth-tls" lang="java" header={false} />

This configuration also works with [QuestDB Cloud](https://questdb.io/cloud/).
If you are using a self-managed QuestDB with
[authentication enabled](/docs/reference/api/ilp/authenticate/) then `authToken`
is the `d` portion of a JWK.

## General usage pattern

1. Create a client instance via `Sender.builder()`.
2. Use `table(CharSequence)` to select a table for inserting a new row.
3. Use `symbol(CharSequence, CharSequence)` to add all symbols. You must add
   symbols before adding other column type.
4. Use the following options to add all the remaining columns:

   - `stringColumn(CharSequence, CharSequence)`
   - `longColumn(CharSequence, long)`
   - `doubleColumn(CharSequence, double)`
   - `boolColumn(CharSequence, boolean)`
   - `timestampColumn(CharSequence, long)`

5. Use `at(long)` or `atNow()` to set a designated timestamp.
6. Optionally: You can use `flush()` to send locally buffered data into a
   server.
7. Go to the step no. 2 to start a new row.
8. Use `close()` to dispose the Sender after you no longer need it.

## Designated timestamp considerations

The following options determine how a
[designated timestamp](/docs/concept/designated-timestamp/) is assigned:

- `atNow()` automatically assigns a timestamp based on a server wall-clock upon
  receiving a row.
- `at(long)` assigns a specific timestamp.

The code samples above use QuestDB to assign timestamp automatically: `atNow()`
instructs the server to assign a timestamp by using a local wall-clock. To
assign a specific timestamp, use `at(long)` instead of `atNow()`.

:::note

QuestDB works best when rows are ingested in chronological order. This means
rows with older timestamps are ingested before rows with newer timestamps.

For QuestDB 6.6 and later versions, the out-of-order data ingestion has been optimized and automated.



:::

Please note that the client does not interpret the timestamp in any way. It
merely passes the timestamp to a server, and it is up to the server to interpret
the timestamp. The default behavior of a QuestDB server is to treat the
designated timestamp as a number of nanoseconds since 1st Jan 1970 UTC. See
[Timestamps](/docs/develop/insert-data/#timestamps) for more details.

:::caution

By default, QuestDB's engine treats a designated timestamp as nanoseconds, but
this does not mean that `System.nanoTime()` can be used to get the current time
and pass it to `at(long)`. `System.nanoTime()` is only useful for measuring
elapsed time, and it is not related to any notion of system or wall-clock time.

:::

## Other considerations

- The Sender is not thread-safe. For multiple threads to send data to QuestDB,
  each thread should have its own Sender instance. An object pool can also be
  used to re-use Sender instances.
- The Sender instance has to be closed after it is no longer in use. The Sender
  implements the `java.lang.AutoCloseable` interface, and therefore the
  [try-with-resource](https://docs.oracle.com/javase/tutorial/essential/exceptions/tryResourceClose.html)
  pattern can be used to ensure that the Sender is closed.
- A client buffers row data internally and sends them to a server in batches
  when the buffer is full. This improves performance significantly, but it also
  means that during a period of quiescence, some written rows may be retained in
  the buffer and are not sent to a server until the buffer are full.
- The method `flush()` can be called to force sending the internal buffer to a
  server, even when the buffer is not full yet.

## Configuration

The client offers a builder API to configure all supported options. See
`Sender.builder()`.

## Limitations

The client supports TCP only. It does not support UDP as transport.
