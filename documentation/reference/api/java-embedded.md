---
title: Java (embedded)
description: Java embedded API reference documentation.
---

import CodeBlock from "@theme/CodeBlock"
import InterpolateReleaseData from "../../../src/components/InterpolateReleaseData"

QuestDB is written in Java and can be used as any other Java library. Moreover,
it is a single JAR with no additional dependencies.

To include QuestDB in your project, use the following:

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"

<Tabs defaultValue="maven" values={[
  { label: "Maven", value: "maven" },
  { label: "Gradle", value: "gradle" },
]}>

<TabItem value="maven">

<InterpolateReleaseData
  renderText={(release) => {
    return (
      <CodeBlock className="language-xml" title={"JDK11"}>
        {`
<dependency>
  <groupId>org.questdb</groupId>
  <artifactId>questdb</artifactId>
  <version>${release.name}</version>
</dependency>
      `}
      </CodeBlock>
    )
  }}
/>

</TabItem>

<TabItem value="gradle">

<InterpolateReleaseData
  renderText={(release) => {
    return (
      <CodeBlock className="language-shell" title={"JDK11"}>
        implementation 'org.questdb:questdb:{release.name}'
      </CodeBlock>
    )
  }}
/>

</TabItem>

</Tabs>

## Writing data

This section provides example codes to write data to WAL and non-WAL tables. See
[Write Ahead Log](/docs/concept/write-ahead-log) for details about the
differences between WAL and non-WAL tables.

The following writers are available for data ingestion:

- `WalWriter` for WAL tables
- `TableWriter` for non-WAL tables
- `TableWriterAPI` for both WAL and non-WAL tables as it is an interface for
  `WalWriter` and `Table Writer`

### Writing data using `WalWriter`

The `WalWriter` facilitates table writes to WAL tables. To successfully create
an instance of `WalWriter`, the table must already exist.

```java title="Example WalWriter"
final CairoConfiguration configuration = new DefaultCairoConfiguration("data_dir");
try (CairoEngine engine = new CairoEngine(configuration)) {
    final SqlExecutionContext ctx = new SqlExecutionContextImpl(engine, 1)
            .with(AllowAllSecurityContext.INSTANCE, null);
    engine.ddl("CREATE TABLE testTable (" +
            "a int, b byte, c short, d long, e float, g double, h date, " +
            "i symbol, j string, k boolean, l geohash(8c), ts timestamp" +
            ") TIMESTAMP(ts) PARTITION BY DAY WAL", ctx);

    // write data into WAL
    final TableToken tableToken = engine.getTableTokenIfExists("testTable");
    try (WalWriter writer = engine.getWalWriter(tableToken)) {
        for (int i = 0; i < 3; i++) {
            TableWriter.Row row = writer.newRow(Os.currentTimeMicros());
            row.putInt(0, 123);
            row.putByte(1, (byte) 1111);
            row.putShort(2, (short) 222);
            row.putLong(3, 333);
            row.putFloat(4, 4.44f);
            row.putDouble(5, 5.55);
            row.putDate(6, System.currentTimeMillis());
            row.putSym(7, "xyz");
            row.putStr(8, "abc");
            row.putBool(9, true);
            row.putGeoHash(10, GeoHashes.fromString("u33dr01d", 0, 8));
            row.append();
        }
        writer.commit();
    }

    // apply WAL to the table
    try (ApplyWal2TableJob walApplyJob = new ApplyWal2TableJob(engine, 1, 1)) {
        while (walApplyJob.run(0)) ;
    }
}
```

### Writing data using `TableWriter`

Non-WAL tables do not allow concurrent writes via multiple interfaces. To
successfully create an instance, the table must:

- Already exist
- Have no other open writers against it as the `TableWriter` constructor will
  attempt to obtain an exclusive cross-process lock on the table.

```java title="Example TableWriter"
try (CairoEngine engine = new CairoEngine(configuration)) {
    final SqlExecutionContext ctx = new SqlExecutionContextImpl(engine, 1)
            .with(AllowAllSecurityContext.INSTANCE, null);
    engine.ddl("CREATE TABLE testTable (" +
            "a int, b byte, c short, d long, e float, g double, h date, " +
            "i symbol, j string, k boolean, l geohash(8c), ts timestamp" +
            ") TIMESTAMP(ts) PARTITION BY DAY BYPASS WAL", ctx);

    // write data into WAL
    final TableToken tableToken = engine.getTableTokenIfExists("testTable");
    try (TableWriter writer = engine.getWriter(tableToken, "test")) {
        for (int i = 0; i < 3; i++) {
            TableWriter.Row row = writer.newRow(Os.currentTimeMicros());
            row.putInt(0, 123);
            row.putByte(1, (byte) 1111);
            row.putShort(2, (short) 222);
            row.putLong(3, 333);
            row.putFloat(4, 4.44f);
            row.putDouble(5, 5.55);
            row.putDate(6, System.currentTimeMillis());
            row.putSym(7, "xyz");
            row.putStr(8, "abc");
            row.putBool(9, true);
            row.putGeoHash(10, GeoHashes.fromString("u33dr01d", 0, 8));
            row.append();
        }
        writer.commit();
    }
}
```

### Writing data using `TableWriterAPI`

`TableWriterAPI` allows writing to both WAL and non-WAL tables by returning the
suitable `Writer` based on the table configurations. The table must already
exist:

```java title="Example TableWriterAPI"
try (CairoEngine engine = new CairoEngine(configuration)) {
    final SqlExecutionContext ctx = new SqlExecutionContextImpl(engine, 1)
            .with(AllowAllSecurityContext.INSTANCE, null);
    engine.ddl("CREATE TABLE testTable (" +
            "a int, b byte, c short, d long, e float, g double, h date, " +
            "i symbol, j string, k boolean, l geohash(8c), ts timestamp" +
            ") TIMESTAMP(ts) PARTITION BY DAY WAL", ctx);

    // write data into WAL
    final TableToken tableToken = engine.getTableTokenIfExists("testTable");
    try (TableWriterAPI writer = engine.getTableWriterAPI(tableToken, "test")) {
        for (int i = 0; i < 3; i++) {
            TableWriter.Row row = writer.newRow(Os.currentTimeMicros());
            row.putInt(0, 123);
            row.putByte(1, (byte) 1111);
            row.putShort(2, (short) 222);
            row.putLong(3, 333);
            row.putFloat(4, 4.44f);
            row.putDouble(5, 5.55);
            row.putDate(6, System.currentTimeMillis());
            row.putSym(7, "xyz");
            row.putStr(8, "abc");
            row.putBool(9, true);
            row.putGeoHash(10, GeoHashes.fromString("u33dr01d", 0, 8));
            row.append();
        }
        writer.commit();
    }

    // apply WAL to the table
    try (ApplyWal2TableJob walApplyJob = new ApplyWal2TableJob(engine, 1, 1)) {
        while (walApplyJob.run(0)) ;
    }
}
```

### Detailed steps

#### Configure Cairo engine

`CairoEngine` is the resource manager for the embedded QuestDB. Its main
function is to facilitate concurrent access to pools of `TableReader` and
suitable writer instances.

```java title="New CairoEngine instance"
final CairoConfiguration configuration = new DefaultCairoConfiguration("data_dir");
try (CairoEngine engine = new CairoEngine(configuration)) {
```

A typical application will need only one instance of `CairoEngine`. This
instance will start when the application starts and shuts down when the
application closes. You will need to close `CairoEngine` gracefully when the
application stops.

QuestDB provides a default configuration which only requires the data directory
to be specified. For a more advanced usage, the whole `CairoConfiguration`
interface can be overridden.

#### Create an instance of SqlExecutionContext

Execution context is a conduit for passing SQL execution artifacts to the
execution site. This instance is not thread-safe and it must not be shared
between threads.

```java title="Example of execution context"
final SqlExecutionContext ctx = new SqlExecutionContextImpl(engine, 1)
    .with(AllowAllSecurityContext.INSTANCE, null);
```

The second argument of the constructor is the number of threads that will be
helping to execute SQL statements. Unless you are building another QuestDB
server, this value should always be 1.

#### SqlCompiler and blank table

Before we start writing data using a writer, the target table has to exist.
There are several ways to create a new table and we recommend using
`CairoEngine`:

```java title="Creating new table"
// Create a non-WAL table:

engine.ddl("CREATE TABLE abc (" +
        "a int, b byte, c short, d long, e float, g double, h date, " +
        "i symbol, j string, k boolean, l geohash(8c), ts timestamp" +
        ") TIMESTAMP(ts) PARTITION BY DAY BYPASS WAL", ctx);

// Create a WAL table:

engine.ddl("CREATE TABLE abc (" +
        "a int, b byte, c short, d long, e float, g double, h date, " +
        "i symbol, j string, k boolean, l geohash(8c), ts timestamp" +
        ") TIMESTAMP(ts) PARTITION BY DAY WAL", ctx);
```

As you will be able to see below, the table field types and indexes must match
the code that is populating the table.

Another way to create a table is to obtain a `SqlCompiler` from the engine and
use it to run the DDL statement:

```java title="Creating new table with a SqlCompiler"
try (SqlCompiler compiler = engine.getSqlCompiler()) {
    engine.ddl(compiler, "CREATE TABLE abc (" +
            "a int, b byte, c short, d long, e float, g double, h date, " +
            "i symbol, j string, k boolean, l geohash(8c), ts timestamp" +
            ") TIMESTAMP(ts) PARTITION BY DAY WAL", ctx, null);
}
```

This way the obtained `SqlCompiler` can be reused to run other SQL statements.

Note that `CairoEngine` has a number of helper methods for different types of
SQL statements. These are:

- `CairoEngine#ddl()` - meant to execute CREATE TABLE and ALTER statements.
- `CairoEngine#insert()` - meant to execute INSERT statements.
- `CairoEngine#drop()` - meant to execute DROP TABLE statements.
- `CairoEngine#select()` - meant to execute SELECT queries.

#### A new writer instance

We use `CairoEngine` to obtain an instance of the writer. This will enable
reusing this writer instance later, when we use the same method of creating
table writer again.

```java title="New table writer instance for a non-WAL table"
final TableToken tableToken = engine.getTableTokenIfExists("abc");
try (TableWriter writer = engine.getWriter(tableToken, "test")) {
```

```java title="New table writer instance for a WAL table"
final TableToken tableToken = engine.getTableTokenIfExists("abc");
try (WalWriter writer = engine.getWalWriter(tableToken)) {
```

```java title="New table writer instance for either a WAL or non-WAL table"
final TableToken tableToken = engine.getTableTokenIfExists("abc");
try (TableWriterAPI writer = engine.getTableWriterAPI(tableToken, "test")) {
```

`TableWriter` - A non-WAL table uses `TableWriter`, which will hold an exclusive
lock on table `abc` until it is closed and `testing` will be used as the lock
reason. This lock is both intra- and inter-process. If you have two Java
applications accessing the same table only one will succeed at one time.

`WalWriter` - A WAL table uses `WalWriter` to enable concurrent data ingestion,
data modification, and schema changes, as the table is not locked.

`TableWriterAPI` - Both WAL and Non-WAL tables can use `TableWriterAPI`. It is
an interface implemented by both writers.

Note the all of the writer classes are not thread-safe, so they should not be
used concurrently.

#### Create a new row

```java title="Creating new table row with timestamp"
TableWriter.Row row = writer.newRow(Os.currentTimeMicros());
```

Although this operation semantically looks like a new object creation, the row
instance is actually being re-used under the hood. A timestamp is necessary to
determine a partition for the new row. Its value has to be either increment or
stay the same as the last row. When the table is not partitioned and does not
have a designated timestamp column, the timestamp value can be omitted.

```java title="Creating new table row without timestamp"
TableWriter.Row row = writer.newRow();
```

#### Populate columns

There are `put*` methods for every supported data type. Columns are updated by
an index as opposed to by name.

```java title="Populating table column"
row.putLong(3, 333);
```

Column update order is not important and updates can be sparse. All unset
columns will default to NULL values.

#### Append a row

Following method call:

```java title="Appending a new row"
row.append();
```

Appended rows are not visible to readers until they are committed. An unneeded
row can also be canceled if required.

```java title="Cancelling half-populated row"
row.cancel();
```

A pending row is automatically cancelled when `writer.newRow()` is called.
Consider the following scenario:

```java
TableWriter.Row row = writer.newRow(Os.currentTimeMicros());
row.putInt(0, 123);
row.putByte(1, (byte) 1111);
row.putShort(2, (short) 222);
row.putLong(3, 333);
row = writer.newRow(Os.currentTimeMicros());
...
```

Second `newRow()` call would cancel all the updates to the row since the last
`append()`.

#### Commit changes

To make changes visible to readers, writer has to commit. `writer.commit` does
this job. Unlike traditional SQL databases, the size of the transaction does not
matter. You can commit anything between 1 and 1 trillion rows. We also spent
considerable effort to ensure `commit()` is lightweight. You can drip one row at
a time in applications that require such behaviour.

Note that WAL writer commits aren't immediately visible to readers. The
committed data becomes visible once it was applied by the `ApplyWal2TableJob`
job.

## Executing queries

We provide a single API for executing all kinds of SQL queries. The example
below focuses on SELECT and how to fetch data from a cursor.

```java title="Compiling SQL"
final CairoConfiguration configuration = new DefaultCairoConfiguration(temp.getRoot().getAbsolutePath());
try (CairoEngine engine = new CairoEngine(configuration)) {
        final SqlExecutionContext ctx = new SqlExecutionContextImpl(engine, 1)
                .with(AllowAllSecurityContext.INSTANCE, null);
        try (RecordCursorFactory factory = engine.select("SELECT * FROM abc", ctx)) {
            try (RecordCursor cursor = factory.getCursor(ctx)) {
                final Record record = cursor.getRecord();
                while (cursor.hasNext()) {
                    // access 'record' instance for field values
                }
            }
        }
    }
}
```

### Detailed steps

The steps to setup `CairoEngine`, execution context and `SqlCompiler` are the
same as those we explained in the sections. We will skip them here and focus on
fetching data.

Note the all of the classes described below are not thread-safe, so they should
not be used concurrently.

#### RecordCursorFactory

You can think of `RecordCursorFactory` as a prepared statement. This is the
entity that holds SQL execution plan with all of the execution artefacts.
Factories are designed to be reused and we strongly encourage caching them. You
also need to make sure that you close factories explicitly when you no longer
need them. Failing to do so can cause memory and/or other resources leak.

#### RecordCursor

This instance allows iterating over the dataset produced by SQL. Cursors are
relatively short-lived and do not imply fetching all the data. Note that you
have to close a cursor as soon as enough data is fetched ; the closing process
can happen at any time.

#### Record

This is cursor's data access API. Record instance is obtained from the cursor
outside of the fetch loop.

```java title="Example of fetching data from cursor"
final Record record = cursor.getRecord();
while (cursor.hasNext()) {
    // access 'record' instance for field values
}
```

Record does not hold the data. Instead, it is an API to pull data when data is
needed. Record instance remains the same while cursor goes over the data, making
caching of records pointless.

## InfluxDB Line Protocol client library

We have [Java Client Library](/docs/clients/java-ilp/) to allow fast data
ingestion.
