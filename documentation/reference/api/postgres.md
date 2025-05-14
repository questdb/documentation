---
title: PostgreSQL & PGWire
description: Postgres compatibility reference documentation.
---

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"
import PsqlInsertPartial from "../../partials/_psql.sql.insert.partial.mdx"
import PythonInsertPartial from "../../partials/_python.sql.insert.partial.mdx"
import JavaInsertPartial from "../../partials/_java.sql.insert.partial.mdx"
import NodeInsertPartial from "../../partials/_nodejs.sql.insert.partial.mdx"
import GoInsertPartial from "../../partials/_go.sql.insert.partial.mdx"
import RustInsertPartial from "../../partials/_rust.sql.insert.partial.mdx"

QuestDB supports the Postgres Wire Protocol (PGWire) for data-in.

For querying and data-out, QuestDB is compatible with PostgreSQL protocol.

This means that you can use your favorite PostgreSQL client or driver with
QuestDB.

For information querying and data-out, see the
[Querying & SQL Overview](/docs/reference/sql/overview/#postgresql)

:::note

The PostgreSQL storage model is fundamentally different than that of QuestDB.

As a result, some features that exists for PostgreSQL do not exist in QuestDB.

:::

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

For query examples, see
[Query & SQL Overview](/docs/reference/sql/overview/#postgresql).

## Query examples

For full query details and examples, see the PostgreSQL section in the
[Query & SQL Overview](/docs/reference/sql/overview/#postgresql).

## Compatibility

### List of supported features

- Querying (all types expect `BLOB`)
- Prepared statements with bind parameters
- `INSERT` statements with bind parameters
- `UPDATE` statements with bind parameters
- DDL execution
- Batch inserts
- Plain authentication

### List of supported connection properties

| Name       | Example                    | Description                                                                                                                          |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `database` | qdb                        | Should be set to any value for example `qdb`, database name is ignored, QuestDB does not have database instance name                 |
| `user`     | admin                      | User name configured in `pg.user` or `pg.readonly.user` property in `server.conf`. Default value is `admin`                          |
| `password` | quest                      | Password from `pg.password` or `pg.readonly.password` property in `server.conf`. Default value is `quest`                            |
| `options`  | -c statement_timeout=60000 | The only supported option is `statement_timeout`. It specifies maximum execution time in milliseconds for SELECT or UPDATE statement |

### List of unsupported features

- SSL
- Remote file upload (`COPY` from `stdin`)
- `DELETE` statements
- `BLOB` transfer

## Recommended third party tools

See [PGWire client guides](/docs/pgwire/pgwire-intro/) for more information about supported PostgreSQL clients and libraries.
