---
title: PostgreSQL Wire Protocol
description:
  QuestDB supports the PostgreSQL wire protocol (PGWire), allowing you to connect
  using standard PostgreSQL client libraries for querying and data ingestion.
---

import { Clients } from "../../src/components/Clients"
import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"
import PsqlInsertPartial from "../partials/_psql.sql.insert.partial.mdx"
import PythonInsertPartial from "../partials/_python.sql.insert.partial.mdx"
import JavaInsertPartial from "../partials/_java.sql.insert.partial.mdx"
import NodeInsertPartial from "../partials/_nodejs.sql.insert.partial.mdx"
import GoInsertPartial from "../partials/_go.sql.insert.partial.mdx"
import RustInsertPartial from "../partials/_rust.sql.insert.partial.mdx"

QuestDB implements the PostgreSQL wire protocol (PGWire), allowing you to
connect using standard PostgreSQL client libraries. This is a great way to get
started with QuestDB, as you can use existing PostgreSQL clients and tools.

<Clients showProtocol="PGWire" />

## Querying vs. ingestion

The PGWire interface is recommended for **querying data** from QuestDB.

For **data ingestion**, especially high-throughput scenarios, we recommend using
the [InfluxDB Line Protocol (ILP)](/docs/ingestion-overview/) clients instead.
ILP is optimized for fast data insertion and provides better performance.

That said, PGWire does support INSERT statements for lower-volume ingestion use
cases.

## Compatibility

### Supported features

- Querying (all types except `BLOB`)
- Prepared statements with bind parameters
- `INSERT` statements with bind parameters
- `UPDATE` statements with bind parameters
- DDL execution
- Batch inserts
- Plain authentication

### Unsupported features

- SSL
- Remote file upload (`COPY` from `stdin`)
- `DELETE` statements
- `BLOB` transfer

### Connection properties

| Name       | Example                    | Description                                                                                                                           |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `database` | qdb                        | Can be set to any value (e.g., `qdb`). Database name is ignored; QuestDB does not have database instance names.                       |
| `user`     | admin                      | User name configured in `pg.user` or `pg.readonly.user` property in `server.conf`. Default: `admin`                                   |
| `password` | quest                      | Password from `pg.password` or `pg.readonly.password` property in `server.conf`. Default: `quest`                                     |
| `options`  | -c statement_timeout=60000 | The only supported option is `statement_timeout`, which specifies maximum execution time in milliseconds for SELECT or UPDATE statements. |

## Ingest examples

<Tabs defaultValue="python" values={[
  { label: "psql", value: "psql" },
  { label: "Python", value: "python" },
  { label: "Java", value: "java" },
  { label: "NodeJS", value: "nodejs" },
  { label: "Go", value: "go" },
  { label: "Rust", value: "rust" },
]}>

<TabItem value="psql">
  <PsqlInsertPartial />
</TabItem>

<TabItem value="python">
  <PythonInsertPartial />
</TabItem>

<TabItem value="java">
  <JavaInsertPartial />
</TabItem>

<TabItem value="nodejs">
  <NodeInsertPartial />
</TabItem>

<TabItem value="go">
  <GoInsertPartial />
</TabItem>

<TabItem value="rust">
  <RustInsertPartial />
</TabItem>

</Tabs>

For query examples, see the [Query & SQL Overview](/docs/reference/sql/overview/#postgresql).

## Important considerations

### Timestamp handling

QuestDB stores all timestamps internally in
[UTC](https://en.wikipedia.org/wiki/Coordinated_Universal_Time). However, when
transmitting timestamps over the PGWire protocol, QuestDB represents them as
`TIMESTAMP WITHOUT TIMEZONE`. This can lead to client libraries interpreting
these timestamps in their local timezone by default, potentially causing
confusion or incorrect data representation.

Our language-specific guides provide detailed examples on how to configure your
client to correctly interpret these timestamps as UTC.

We recommend setting the timezone in your client library to UTC to ensure
consistent handling of timestamps.

### SQL dialect differences

While QuestDB supports the PGWire protocol for communication, its SQL dialect
and feature set are not identical to PostgreSQL. QuestDB is a specialized
time-series database and does not support all SQL features, functions, or data
types that a standard PostgreSQL server does.

Always refer to the [QuestDB SQL documentation](/docs/reference/sql/overview/)
for supported operations.

### Forward-only cursors

QuestDB's cursors are forward-only, differing from PostgreSQL's support for
scrollable cursors (which allow bidirectional navigation and arbitrary row
access). With QuestDB, you can iterate through query results sequentially from
start to finish, but you cannot move backward or jump to specific rows.

Explicit `DECLARE CURSOR` statements for scrollable types, or operations like
fetching in reverse (e.g., `FETCH BACKWARD`), are not supported.

This limitation can impact client libraries that rely on scrollable cursor
features. For example, Python's psycopg2 driver might encounter issues if
attempting such operations. For optimal compatibility, choose drivers or
configure existing ones to use forward-only cursors, such as Python's asyncpg
driver.

### Protocol flavors and encoding

The PostgreSQL wire protocol has different implementations and options. When
your client library allows:

- Prefer the **Extended Query Protocol** over the Simple Query Protocol
- Choose clients that support **BINARY encoding** for data transfer over TEXT
  encoding for optimal performance and type fidelity

The specifics of how to configure this will vary by client library.

### Decimal values

To insert `decimal` values via PGWire, you must either use the `m` suffix to
indicate that the value is a decimal literal or cast the value to `decimal`:

```questdb-sql
INSERT INTO my_table (decimal_column) VALUES (123.45m);                        -- Using 'm' suffix
INSERT INTO my_table (decimal_column) VALUES (CAST($1 AS DECIMAL(18, 3)));     -- Using CAST over bind parameter
```

In the text format, PostgreSQL clients send decimal values as strings.
Currently, QuestDB parses these strings as `double` values and doesn't
implicitly convert them to `decimal` to avoid unintended precision loss. You
must explicitly cast `double` values to `decimal` in your SQL queries when
inserting into `decimal` columns.

## Highly-available reads (Enterprise)

QuestDB Enterprise supports running
[multiple replicas](/docs/operations/replication/) to serve queries. Many client
libraries allow specifying **multiple hosts** in the connection string. This
ensures that initial connections succeed even if a node is unavailable. If the
connected node fails later, the application should catch the error, reconnect to
another host, and retry the read.

For background and code samples in multiple languages, see:

- Blog: [Highly-available reads with QuestDB](https://questdb.com/blog/highly-available-reads-with-questdb/)
- Examples: [questdb/questdb-ha-reads](https://github.com/questdb/questdb-ha-reads)
