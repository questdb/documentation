---
title: Drizzle ORM
description: Guide for using Drizzle ORM with QuestDB
---

[Drizzle ORM](https://orm.drizzle.team/) is a lightweight, type-safe SQL ORM for
TypeScript and JavaScript. It connects to QuestDB over the
[PostgreSQL wire protocol](/docs/configuration/postgres-wire-protocol/), so the standard
`postgres-js` driver works without a QuestDB-specific dialect.

Drizzle is a good fit for reading from QuestDB in a TypeScript application. For
high-throughput ingestion, prefer the
[Node.js client](/docs/connect/clients/nodejs/), which uses InfluxDB Line Protocol
and is built for that purpose.

Note that QuestDB is a time-series database, not a general-purpose relational
one. Some Drizzle operations are unsupported as a result, listed under
[Limitations](#limitations).

## Prerequisites

- Node.js 18 or newer
- A running QuestDB instance
- `drizzle-orm` and `postgres`

## Installation

```shell
npm install drizzle-orm postgres
```

## Connecting

QuestDB serves the PostgreSQL wire protocol on port `8812`, with `admin`/`quest`
as the default credentials and `qdb` as the database name.

```typescript
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

const client = postgres({
  host: "localhost",
  port: 8812,
  database: "qdb",
  username: "admin",
  password: "quest",
})

const db = drizzle(client)
```

## Defining a table

QuestDB tables are created with SQL rather than through Drizzle migrations,
since the table needs a designated timestamp and a partitioning strategy that
Drizzle's schema builder does not express:

```questdb-sql
CREATE TABLE trades (
  symbol SYMBOL,
  side SYMBOL,
  price DOUBLE,
  amount DOUBLE,
  timestamp TIMESTAMP
) TIMESTAMP(timestamp) PARTITION BY DAY WAL;
```

Declare the matching Drizzle schema to query it. `SYMBOL` columns are read as
text:

```typescript
import { pgTable, doublePrecision, text, timestamp } from "drizzle-orm/pg-core"

export const trades = pgTable("trades", {
  symbol: text("symbol"),
  side: text("side"),
  price: doublePrecision("price"),
  amount: doublePrecision("amount"),
  timestamp: timestamp("timestamp"),
})
```

## Inserting rows

```typescript
await db.insert(trades).values([
  {
    symbol: "BTC-USD",
    side: "buy",
    price: 39269.98,
    amount: 0.001,
    timestamp: new Date(),
  },
])
```

Writes go through the [WAL](/docs/concepts/write-ahead-log/), so a row may take
a moment to become visible to readers.

## Querying

```typescript
import { desc, eq, sql } from "drizzle-orm"

// Latest trade for a symbol
const latest = await db
  .select()
  .from(trades)
  .where(eq(trades.symbol, "BTC-USD"))
  .orderBy(desc(trades.timestamp))
  .limit(1)

// Average price per symbol
const averages = await db
  .select({ symbol: trades.symbol, avg: sql`avg(${trades.price})` })
  .from(trades)
  .groupBy(trades.symbol)
```

## QuestDB SQL extensions

Time-series extensions such as
[`SAMPLE BY`](/docs/query/sql/sample-by/) have no Drizzle query-builder
equivalent. Use `db.execute()` with a raw statement, which keeps the same
connection and pooling:

```typescript
import { sql } from "drizzle-orm"

const perMinute = await db.execute(
  sql`SELECT timestamp, avg(price) FROM trades SAMPLE BY 1m`,
)
```

The same applies to [`LATEST ON`](/docs/query/sql/latest-on/) and
[`ASOF JOIN`](/docs/query/sql/join/#asof-join).

## Limitations

- **`DELETE` is not supported.** QuestDB has no row-level delete, so
  `db.delete(...)` fails. Remove data by
  [dropping a partition](/docs/query/sql/alter-table-drop-partition/) instead.
- **Migrations are not supported.** Use SQL DDL for schema changes, as shown
  above, rather than `drizzle-kit`.
- **Relations and joins** are limited to what QuestDB's SQL supports; there are
  no foreign keys.

## Version note

The examples above were verified against QuestDB 10.0.1 with `drizzle-orm`
0.45.2 and `postgres` 3.4.9.
