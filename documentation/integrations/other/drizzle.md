---
title: Drizzle ORM
description: Guide for using Drizzle ORM with QuestDB
---

[Drizzle ORM](https://orm.drizzle.team/) is a lightweight, type-safe SQL ORM for
TypeScript and JavaScript. Schemas are declared in TypeScript, row types are
inferred from those declarations, and the SQL it emits stays close enough to
what you wrote that you can predict it. That last property is what makes it a
good fit for QuestDB, where the useful queries are time-series SQL rather than
object graphs.

There is no QuestDB-specific Drizzle dialect. Drizzle connects through the
[PostgreSQL wire protocol](/docs/connect/compatibility/pgwire/overview/) using
`node-postgres` (`pg`), which is one of the JavaScript clients QuestDB is
[tested against](/docs/connect/compatibility/pgwire/nodejs/).

:::tip

Use Drizzle to **query** QuestDB. For **ingestion**, use the official
[QuestDB JavaScript client](/docs/connect/clients/nodejs/) over the InfluxDB
Line Protocol, which is much faster than row-by-row `INSERT` over PGWire. Both
libraries can live in the same application — see
[Ingesting data](#ingesting-data).

:::

## Prerequisites

- Node.js 18 or later
- A running QuestDB instance — see the
  [quick start](/docs/getting-started/quick-start/)
- QuestDB's PGWire port, `8812` by default

## Installation

```shell
npm install drizzle-orm pg
npm install -D @types/pg
```

## Connecting

```typescript
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

// QuestDB returns timestamps in UTC; set the process timezone to match so
// the pg driver does not shift them into local time.
process.env.TZ = "UTC"

const pool = new Pool({
  host: "127.0.0.1",
  port: 8812,
  user: "admin",
  password: "quest",
  database: "qdb",
})

const db = drizzle(pool)
```

## Describing an existing table

Create tables with QuestDB DDL, then describe them in Drizzle to get typed
queries. The Drizzle schema is a *description* of a table that already exists,
not something you migrate into place:

```questdb-sql title="Created in QuestDB"
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  side SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

```typescript title="Described in Drizzle"
import { pgTable, timestamp, doublePrecision, text } from "drizzle-orm/pg-core"

export const trades = pgTable("trades", {
  timestamp: timestamp("timestamp"),
  // SYMBOL is a QuestDB type with no Drizzle equivalent. It arrives over
  // PGWire as text, so declare it as text().
  symbol: text("symbol"),
  side: text("side"),
  price: doublePrecision("price"),
  amount: doublePrecision("amount"),
})
```

Column type mapping:

| QuestDB | Drizzle `pg-core` |
| ------- | ----------------- |
| `TIMESTAMP` | `timestamp()` |
| `SYMBOL` | `text()` |
| `VARCHAR` | `text()` or `varchar()` |
| `DOUBLE` | `doublePrecision()` |
| `FLOAT` | `real()` |
| `LONG` | `bigint({ mode: "number" })` |
| `INT` | `integer()` |
| `SHORT` | `smallint()` |
| `BOOLEAN` | `boolean()` |
| `UUID` | `uuid()` |

## Querying

The core select API works as it does against PostgreSQL:

```typescript
import { and, desc, eq, gt } from "drizzle-orm"

// Filter and order
const recent = await db
  .select()
  .from(trades)
  .where(and(eq(trades.symbol, "BTC-USD"), gt(trades.price, 30000)))
  .orderBy(desc(trades.timestamp))
  .limit(100)

// Project a subset of columns
const prices = await db
  .select({ ts: trades.timestamp, price: trades.price })
  .from(trades)
  .where(eq(trades.side, "buy"))
```

## Time-series SQL

QuestDB's time-series extensions — [`SAMPLE BY`](/docs/query/sql/sample-by/),
[`LATEST ON`](/docs/query/sql/latest-on/) and
[`ASOF JOIN`](/docs/query/sql/join/) — have no equivalent in the Drizzle query
builder. Reach for the `sql` template and `db.execute()`, which keeps
parameters bound rather than interpolated:

```typescript
import { sql } from "drizzle-orm"

// Hourly OHLC buckets
const candles = await db.execute(sql`
  SELECT
    timestamp,
    first(price) AS open,
    max(price)   AS high,
    min(price)   AS low,
    last(price)  AS close
  FROM trades
  WHERE symbol = ${"BTC-USD"}
  SAMPLE BY 1h
`)

console.log(candles.rows)

// Most recent row per symbol
const latest = await db.execute(sql`
  SELECT * FROM trades LATEST ON timestamp PARTITION BY symbol
`)
```

## Ingesting data

Write with the official client over ILP, and read back through Drizzle:

```shell
npm install @questdb/nodejs-client
```

```typescript
import { Sender } from "@questdb/nodejs-client"

const sender = Sender.fromConfig("http::addr=localhost:9000")

await sender
  .table("trades")
  .symbol("symbol", "BTC-USD")
  .symbol("side", "buy")
  .floatColumn("price", 30123.5)
  .floatColumn("amount", 0.25)
  .at(Date.now(), "ms")

await sender.flush()
await sender.close()
```

Tables and columns are created automatically on first write, so in many
projects the QuestDB DDL above is optional and the Drizzle schema simply
describes what ILP created.

## Limitations

QuestDB is a time-series database, not a general-purpose relational one. The
parts of Drizzle that assume PostgreSQL semantics do not carry over:

- **No `drizzle-kit` migrations.** `generate`, `push` and `migrate` emit
  PostgreSQL DDL — primary keys, sequences, and `ALTER TABLE` forms QuestDB
  does not implement. Manage schema with
  [QuestDB DDL](/docs/query/sql/create-table/) instead.
- **No `DELETE`.** QuestDB has no `DELETE` statement, so `db.delete()` fails.
  Drop whole partitions or set a [TTL](/docs/concepts/ttl/) for retention.
- **No primary or foreign keys.** The
  [designated timestamp](/docs/concepts/designated-timestamp/) is not a primary
  key and does not enforce uniqueness — use
  [deduplication](/docs/concepts/deduplication/) for that. Because Drizzle's
  relational query API (`db.query.<table>.findMany`) builds on declared
  relations, use the core select API and explicit joins.
- **Limited transaction semantics.** Do not rely on `db.transaction()` for
  rollback; see the
  [PGWire limitations](/docs/connect/compatibility/pgwire/overview/).
- **`UPDATE` is supported** but is not the intended write path. Prefer
  append-only ingestion.

## See also

- [Drizzle ORM documentation](https://orm.drizzle.team/docs/overview)
- [QuestDB PGWire guide for JavaScript](/docs/connect/compatibility/pgwire/nodejs/)
- [QuestDB JavaScript client](/docs/connect/clients/nodejs/)
