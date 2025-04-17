---
title: Advanced InfluxDB Line Protocol settings
sidebar_label: Advanced settings
description:
  Syntax and guidance to create or alter your own InfluxDB Line Protocol
  clients.
---

This documentation provides aid for those venturing outside of the path laid
down by their language clients.

For the introductory InfluxDB Line Protocol materials, including authentication,
see the [ILP overview](/docs/reference/api/ilp/overview/).

For the the basics of ingestion, instead consult the
[Ingestion overview](/docs/ingestion-overview/).

## Syntax

Each InfluxDB Line Protocol message has to end with a new line `\n` character.

```shell
table_name,symbolset columnset timestamp\n
```

| Element      | Definition                                                                                                                                                                 |
| :----------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `table_name` | Name of the table where QuestDB will write data.                                                                                                                           |
| `symbolset`  | A set of comma-separated `name=value` pairs that will be parsed as symbol columns.                                                                                         |
| `columnset`  | A set of comma-separated `name=value` pairs that will be parsed as non-symbol columns.                                                                                     |
| `timestamp`  | UNIX timestamp. The default unit is nanosecond and is configurable via `line.tcp.timestamp`. The value will be truncated to microsecond resolution when parsed by QuestDB. |

`name` in the `name=value` pair always corresponds to `column name` in the
table.

## Behavior

- When the `table_name` does not correspond to an existing table, QuestDB will
  create the table on the fly using the name provided. Column types will be
  automatically recognized and assigned based on the data.
- The `timestamp` column is automatically created as
  [designated timestamp](/docs/concept/designated-timestamp/) with the
  [partition strategy](/docs/concept/partitions/) set to `DAY`. Alternatively,
  use [CREATE TABLE](/docs/reference/sql/create-table/) to create the table with
  a different partition strategy before ingestion.
- When the timestamp is empty, QuestDB will use the server timestamp.

## Generic example

Let's assume the following data:

| timestamp           | city    | temperature | humidity | make      |
| :------------------ | :------ | :---------- | :------- | :-------- |
| 1465839830100400000 | London  | 23.5        | 0.343    | Omron     |
| 1465839830100600000 | Bristol | 23.2        | 0.443    | Honeywell |
| 1465839830100700000 | London  | 23.6        | 0.358    | Omron     |

The line protocol syntax for that table is:

```shell
readings,city=London,make=Omron temperature=23.5,humidity=0.343 1465839830100400000\n
readings,city=Bristol,make=Honeywell temperature=23.2,humidity=0.443 1465839830100600000\n
readings,city=London,make=Omron temperature=23.6,humidity=0.348 1465839830100700000\n
```

This would create table similar to this SQL statement and populate it.

```questdb-sql
CREATE TABLE readings (
  timestamp TIMESTAMP,
  city SYMBOL,
  temperature DOUBLE,
  humidity DOUBLE,
  make SYMBOL
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

## Designated timestamp

### Timestamps

Designated timestamp is the trailing value of an InfluxDB Line Protocol message.
It is optional, and when present, is a timestamp in Epoch nanoseconds. When the
timestamp is omitted, the server will insert each message using the system clock
as the row timestamp. See `cairo.timestamp.locale` and `line.tcp.timestamp`
[configuration options](/docs/configuration/).

:::caution

- While
  [`columnset` timestamp type units](/docs/reference/api/ilp/columnset-types/#timestamp)
  are microseconds, the designated timestamp units are nanoseconds by default,
  and can be overridden via the `line.tcp.timestamp` configuration property.

- The native timestamp format used by QuestDB is a Unix timestamp in microsecond
  resolution; timestamps in nanoseconds will be parsed and truncated to
  microseconds.

- For HTTP, precision parameters can added to a request. These include `n` or
  `ns` for nanoseconds, `u` or `us` formicroseconds, `ms` for milliseconds, `s`
  for seconds, `m` for minutes and `h` for hours. Otherwise, it will default to
  nanoseconds.

```shell
curl -i -XPOST 'http://localhost:9000/write?db=mydb&precision=s' \
--data-binary 'weather,location=us-midwest temperature=82 1465839830100400200'
```

:::

```shell title="Example of InfluxDB Line Protocol message with desginated timestamp value"
tracking,loc=north val=200i 1000000000\n
```

```shell title="Example of InfluxDB Line Protocol message sans timestamp"
tracking,loc=north val=200i\n
```

:::note

We recommend populating designated timestamp via trailing value syntax above.

:::

It is also possible to populate designated timestamp via `columnset`. Please see
[mixed timestamp](/docs/reference/api/ilp/columnset-types/#timestamp) reference.

## Irregularly-structured data

InfluxDB line protocol makes it possible to send data under different shapes.
Each new entry may contain certain tags or fields, and others not. QuestDB
supports on-the-fly data structure changes with minimal overhead. Whilst the
example just above highlights structured data, it is possible for InfluxDB line
protocol users to send data as follows:

```shell
readings,city=London temperature=23.2 1465839830100400000\n
readings,city=London temperature=23.6 1465839830100700000\n
readings,make=Honeywell temperature=23.2,humidity=0.443 1465839830100800000\n
```

This would result in the following table:

| timestamp           | city   | temperature | humidity | make      |
| :------------------ | :----- | :---------- | :------- | :-------- |
| 1465839830100400000 | London | 23.5        | NULL     | NULL      |
| 1465839830100700000 | London | 23.6        | NULL     | NULL      |
| 1465839830100800000 | NULL   | 23.2        | 0.358    | Honeywell |

:::tip

Whilst we offer this function for flexibility, we recommend that users try to
minimize structural changes to maintain operational simplicity.

:::

## Duplicate column names

If line contains duplicate column names, the value stored in the table will be
that from the first `name=value` pair on each line. For example:

```shell
trade,ticker=USD price=30,price=60 1638202821000000000\n
```

Price `30` is stored, `60` is ignored.

## Name restrictions

Table name cannot contain any of the following characters: `\n`, `\r`, `?`, `,`,
`”`, `"`, `\`, `/`, `:`, `)`, `(`, `+`, `*`, `%`, `~`, starting `.`, trailing
`.`, or a non-printable char.

Column name cannot contain any of the following characters: `\n`, `\r`, `?`,
`.`, `,`, `”`, `"`, `\\`, `/`, `:`, `)`, `(`, `+`, `-`, `\*` `%%`, `~`, or a
non-printable char.

Both table name and column names are allowed to have spaces ` `. These spaces
have to be escaped with `\`. For example both of these are valid lines.

```shell
trade\ table,ticker=USD price=30,details="Latest price" 1638202821000000000\n
```

```shell
trade,symbol\ ticker=USD price=30,details="Latest price" 1638202821000000000\n
```

## Symbolset

Area of the message that contains comma-separated set of `name=value` pairs for
symbol columns. For example in a message like this:

```shell
trade,ticker=BTCUSD,venue=coinbase price=30,price=60 1638202821000000000\n
```

`symbolset` is `ticker=BTCUSD,venue=coinbase`. Please note the mandatory space
between `symbolset` and `columnset`. Naming rules for columns are subject to
[duplicate rules](#duplicate-column-names) and
[name restrictions](#name-restrictions).

### Symbolset values

`symbolset` values are always interpreted as [SYMBOL](/docs/concept/symbol/).
Parser takes values literally so please beware of accidentally using high
cardinality types such as `9092i` or `1.245667`. This will result in a
significant performance loss due to large mapping tables.

`symbolset` values are not quoted. They are allowed to have special characters,
such as ` ` (space), `=`, `,`, `\n`, `\r` and `\`, which must be escaped with a
`\`. Example:

```shell
trade,ticker=BTC\\USD\,All,venue=coin\ base price=30 1638202821000000000\n
```

Whenever `symbolset` column does not exist, it will be added on-the-fly with
type `SYMBOL`. On other hand when the column does exist, it is expected to be of
`SYMBOL` type, otherwise the line is rejected.

## Columnset

Area of the message that contains comma-separated set of `name=value` pairs for
non-symbol columns. For example in a message like this:

```shell
trade,ticker=BTCUSD priceLow=30,priceHigh=60 1638202821000000000\n
```

`columnset` is `priceLow=30,priceHigh=60`. Naming rules for columns are subject
to [duplicate rules](#duplicate-column-names) and
[name restrictions](#name-restrictions).

### Columnset values

`columnset` supports several values types, which are used to either derive type
of new column or mapping strategy when column already exists. These types are
limited by existing InfluxDB Line Protocol specification. Wider QuestDB type
system is available by creating table via SQL upfront. The following are
supported value types:
[Integer](/docs/reference/api/ilp/columnset-types/#integer),
[Long256](/docs/reference/api/ilp/columnset-types/#long256),
[Float](/docs/reference/api/ilp/columnset-types/#float),
[String](/docs/reference/api/ilp/columnset-types/#string) and
[Timestamp](/docs/reference/api/ilp/columnset-types/#timestamp)

## Inserting NULL values

To insert a NULL value, skip the column (or symbol) for that row.

For example:

```text
table1 a=10.5 1647357688714369403
table1 b=1.25 1647357698714369403
```

Will insert as:

| a      | b      | timestamp                   |
| :----- | :----- | --------------------------- |
| 10.5   | _NULL_ | 2022-03-15T15:21:28.714369Z |
| _NULL_ | 1.25   | 2022-03-15T15:21:38.714369Z |

## InfluxDB Line Protocol Datatypes and Casts

### Varchar vs Symbols

Strings may be recorded as either the `VARCHAR` type or the `SYMBOL` type.

Inspecting a sample message we can see how a space `' '` separator splits
`SYMBOL` columns to the left from the rest of the columns.

```text
table_name,col1=symbol_val1,col2=symbol_val2 col3="varchar val",col4=10.5
                                            ┬
                                            ╰───────── separator
```

In this example, columns `col1` and `col2` are strings written to the database
as `SYMBOL`s, whilst `col3` is written out as a `VARCHAR`.

`SYMBOL`s are strings which are automatically
[interned](https://en.wikipedia.org/wiki/String_interning) by the database on a
per-column basis. You should use this type if you expect the string to be
re-used over and over, such as is common with identifiers.

For one-off strings use `VARCHAR` columns which aren't interned.

### Casts

QuestDB types are a superset of those supported by InfluxDB Line Protocol. This
means that when sending data you should be aware of the performed conversions.

See:

- [QuestDB Types in SQL](/docs/reference/sql/datatypes/)
- [InfluxDB Line Protocol types and cast conversion tables](/docs/reference/api/ilp/columnset-types/)

## Constructing well-formed messages

Different library implementations will perform different degrees of content
validation upfront before sending messages out. To avoid encountering issues,
follow these guidelines:

- **All strings must be UTF-8 encoded.**

- **Each column should only be specified once per row..**

- **Symbol columns must be written out before other columns.**

- **Table and column names can't have invalid characters.** These should not
  contain `?`, `.`,`,`, `'`, `"`, `\`, `/`, `:`, `(`, `)`, `+`, `-`, `*`, `%`,
  `~`,`' '` (space), `\0` (nul terminator),
  [ZERO WIDTH NO-BREAK SPACE](https://unicode-explorer.com/c/FEFF).

- **Write timestamp column via designated API**, or at the end of the message if
  you are using raw sockets. If you have multiple timestamp columns write
  additional ones as column values.

- **Don't change column type between rows.**

## Error handling

QuestDB will always log any InfluxDB Line Protocol errors in its
[server logs](/docs/concept/root-directory-structure/#log-directory).

It is recommended that sending applications reuse TCP connections. If QuestDB
receives an invalid message, it will discard invalid lines, produce an error
message in the logs and forcibly _disconnect_ the sender to prevent further data
loss.

Data may be discarded because of:

- missing new line characters at the end of messages
- an invalid data format such as unescaped special characters
- invalid column / table name characters
- schema mismatch with existing tables
- message size overflows on the input buffer
- system errors such as no space left on the disk

Detecting malformed input can be achieved through QuestDB logs by searching for
`LineTcpMeasurementScheduler` and `LineTcpConnectionContext`, for example:

```bash
2022-02-03T11:01:51.007235Z I i.q.c.l.t.LineTcpMeasurementScheduler could not create table [tableName=trades, ex=`column name contains invalid characters [colName=trade_%]`, errno=0]
```

The following input is tolerated by QuestDB:

- a column is specified twice or more on the same line, QuestDB will pick the
  first occurrence and ignore the rest
- missing columns, their value will be defaulted to `null`/`0.0`/`false`
  depending on the type of the column
- missing designated timestamp, the current server time will be used to generate
  the timestamp
- the timestamp is specified as a column instead of appending it to the end of
  the line
- timestamp appears as a column and is also present at the end of the line, the
  value sent as a field will be used

With sufficient client-side validation, the lack of errors to the client and
confirmation isn't necessarily a concern: QuestDB will log out any issues and
disconnect on error. The database will process any valid lines up to that point
and insert rows.

To resume WAL table ingestion after recovery from errors, see
[ALTER TABLE RESUME WAL](/docs/reference/sql/alter-table-resume-wal/) for more
information.

### If you don't immediately see data

If you don't see your inserted data, this is usually a result of one of two
things:

- You prepared the messages, but forgot to call `.flush()` or similar in your
  client library, so no data was sent.

- The internal timers and buffers within QuestDB did not commit the data yet.
  For development (and development only), you may want to tweak configuration
  settings to commit data more frequently.

  ```ini title=server.conf
  cairo.max.uncommitted.rows=1
  ```

  Refer to
  [InfluxDB Line Protocol's configuration](/docs/configuration/#influxdb-line-protocol-ilp)
  documentation for more on these configuration settings.
