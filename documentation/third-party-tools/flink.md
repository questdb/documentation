---
title: QuestDB Flink connector
sidebar_label: Flink
description:
  QuestDB ships a QuestDB Flink connector for ingesting messages from Apache
  Flink via the InfluxDB Line Protocol.
---

import InterpolateReleaseData from "../../src/components/InterpolateReleaseData"
import CodeBlock from "@theme/CodeBlock"

[Apache Flink](https://flink.apache.org/) is a popular framework and
[stream processing](/glossary/stream-processing) engine. QuestDB ships a
[QuestDB Flink Sink connector](https://github.com/questdb/flink-questdb-connector)
for fast ingestion from Apache Flink into QuestDB. The connector implements the
[Table API and SQL](https://nightlies.apache.org/flink/flink-docs-release-1.16/docs/dev/table/overview/)
for Flink.

![Apache Flink logo](/images/logos/flink.svg)

## Quick start

This section shows the steps to use the QuestDB Flink connector to ingest data
from Flink into QuestDB. The connector uses the SQL interface to interact with
Flink. The overall steps are the followings:

1. The connector creates a table in Flink backed by QuestDB.
2. The connector inserts data into the table.
3. Finally it queries the data in QuestDB.

### Prerequisites

- A local JDK version 11 installation
- Docker for running QuestDB

### Connector installation

- Start the QuestDB container image:

  <InterpolateReleaseData renderText={(release) => (
  <CodeBlock className="language-shell">
  {`docker run -p 9000:9000 -p 9009:9009 questdb/questdb:${release.name}`}
  </CodeBlock> )} />

- Download [Apache Flink distribution](https://flink.apache.org/downloads/) and
  unpack it.
- [Download](https://repo1.maven.org/maven2/org/questdb/flink-questdb-connector/0.2/flink-questdb-connector-0.2.jar)
  the QuestDB Flink connector from Maven Central and place it in the `lib`
  directory of your Flink installation.
- Go to the `bin` directory of your Flink installation and run the following to
  start a Flink cluster:

  ```shell
  ./start-cluster.sh
  ```

- While still in the `bin` directory, start a Flink SQL console by running:

  ```shell
  ./sql-client.sh
  ```

  Then, run the following SQL command in the Flink SQL console:

  ```sql
  CREATE TABLE Orders (
    order_number BIGINT,
    price        BIGINT,
     buyer        STRING
    ) WITH (
    'connector'='questdb',
    'host'='localhost'
    );
  ```

  Expected output: `[INFO] Execute statement succeed.`

  This command created a Flink table backed by QuestDB. The table is called
  `Orders` and has three columns: `order_number`, `price`, and `buyer`. The
  `connector` option specifies the QuestDB Flink connector. The `host` option
  specifies the host and port where QuestDB is running. The default port is
  `9009`.

- While still in the Flink SQL console execute:

  ```questdb-sql
  INSERT INTO Orders values (0, 42, 'IBM');
  ```

  Expected output:

  ```shell
  [INFO] SQL update statement has been successfully submitted to the cluster:
  Job ID: <random hexadecimal id>
  ```

  This command used Flink SQL to insert a row into the `Orders` table in Flink.
  The table is connected to QuestDB, so the row is also into QuestDB.

- Go to the QuestDB [Web Console](/docs/web-console/) at http://localhost:9000
  and execute this query:

  ```questdb-sql
  SELECT * FROM Orders;
  ```

  You should see a table with one row.

  ![QuestDB web console screenshot with the query result](/images/guides/flink/flink-questdb-console.webp)

Congratulations! You have successfully used the QuestDB Flink connector to
ingest data from Flink into QuestDB. You can now build Flink data pipelines that
use QuestDB as a sink.

See the
[QuestDB Flink connector GitHub repository](https://github.com/questdb/flink-questdb-connector/tree/main/samples)
for more examples.

## Configuration

The QuestDB Flink connector supports the following configuration options:

| Name             | Type      | Example               | Default                     | Meaning                                                                    |
| ---------------- | --------- | --------------------- | --------------------------- | -------------------------------------------------------------------------- |
| host             | `string`  | localhost:9009        | N/A                         | Host and port where QuestDB server is running                              |
| username         | `string`  | testUser1             | admin                       | Username for authentication. The default is used when also `token` is set. |
| token            | `string`  | GwBXoGG5c6NoUTLXnzMxw | admin                       | Token for authentication                                                   |
| table            | `string`  | my_table              | Same as Flink table name    | Target table in QuestDB                                                    |
| tls              | `boolean` | true                  | false                       | Whether to use TLS/SSL for connecting to QuestDB server                    |
| buffer.size.kb   | `integer` | 32                    | 64                          | Size of the QuestDB client send buffer                                     |
| sink.parallelism | `integer` | 2                     | Same as upstream processors | QuestDB Sink Parallelism                                                   |

Example configuration for connecting to QuestDB running on localhost:

```sql
CREATE TABLE Orders (
     order_number BIGINT,
     price        BIGINT,
     buyer        STRING
 ) WITH (
   'connector'='questdb',
   'host'='localhost',
   'table' = 'orders'
);
```

## Connector Distribution

The connector is distributed as a single jar file. The jar file is available in
the
[Maven Central repository](https://repo1.maven.org/maven2/org/questdb/flink-questdb-connector/)
and it's available under the following coordinates:

```xml
<dependency>
  <groupId>org.questdb</groupId>
  <artifactId>flink-questdb-connector</artifactId>
  <version>LATEST</version>
</dependency>
```

The latest version is:
[![a badge with the latest connector version in Maven Central](https://maven-badges.herokuapp.com/maven-central/org.questdb/flink-questdb-connector/badge.svg)](https://maven-badges.herokuapp.com/maven-central/org.questdb/flink-questdb-connector)

## FAQ

Q: Why is QuestDB client not repackaged into a different Java package?<br/> A:
QuestDB client uses native code, this makes repackaging hard.

Q: I need to use QuestDB as a Flink source, what should I do?<br/> A: This
connector is Sink only. If you want to use QuestDB as a Source then your best
chance is to use
[Flink JDBC source](https://nightlies.apache.org/flink/flink-docs-release-1.15/docs/connectors/table/jdbc/)
and rely on
[QuestDB Postgres compatibility](/docs/reference/sql/overview/#postgresql).
