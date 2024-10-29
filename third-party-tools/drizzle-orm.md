---
title: Drizzle ORM
description: Guide for using Drizzle ORM with QuestDB
---

[Drizzle ORM](https://orm.drizzle.team/) is a modern TypeScript ORM designed for SQL databases. It provides a type-safe API for building queries and managing database interactions, making it an excellent choice for developers working with TypeScript and JavaScript.


## Prerequisites

- Node.js
- drizzle-orm
- pg
- A QuestDB instance

## Installation

You can install Drizzle ORM and its PostgreSQL driver using npm:

```bash
npm install drizzle-orm pg
```

## Example usage

```javascript
const { drizzle } = require("drizzle-orm/node-postgres");
const { Client } = require("pg");
const {
  pgTable,
  varchar,
  doublePrecision,
  timestamp,
} = require("drizzle-orm/pg-core");
const { gt } = require("drizzle-orm");

// Define table schema using pgTable
const tradesTable = pgTable("trades", {
  symbol: varchar("symbol"),
  side: varchar("side"),
  price: doublePrecision("price"),
  amount: doublePrecision("amount"),
  timestamp: timestamp("timestamp"),
});

const client = new Client({
  host: "localhost",
  port: 8812,
  user: "admin",
  password: "quest",
  database: "qdb",
});

async function main() {
  await client.connect();

  // Initialize Drizzle ORM
  const db = drizzle(client);

  // Create the table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS trades (
      symbol TEXT,
      side TEXT,
      price DOUBLE PRECISION,
      amount DOUBLE PRECISION,
      timestamp TIMESTAMP 
    );
  `);

  // Insert data with a current timestamp
  const current_timestamp = new Date();
  await db.insert(tradesTable).values([
    {
      symbol: "ETH-USD",
      side: "sell",
      price: 2615.54,
      amount: 0.00044,
      timestamp: current_timestamp,
    },
    {
      symbol: "BTC-USD",
      side: "sell",
      price: 39269.98,
      amount: 0.001,
      timestamp: current_timestamp,
    },
  ]);

  // Query with conditions
  const result = await db
    .select({
      symbol: tradesTable.symbol,
      price: tradesTable.price,
      timestamp: tradesTable.timestamp,
    })
    .from(tradesTable)
    .where(gt(tradesTable.price, 3000));

  console.log(result);
  await client.end();
}

main().catch(console.error);
```

## See also
- [Drizzle ORM documentation](https://orm.drizzle.team/docs/rqb)