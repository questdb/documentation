---
title: Drizzle ORM
description: Guide for using Drizzle ORM with QuestDB
---

[Drizzle ORM](https://orm.drizzle.team/) is a modern TypeScript ORM designed for SQL databases. It provides a type-safe API for building queries and managing database interactions, making it an excellent choice for developers working with TypeScript and JavaScript.


## Prerequisites

- Node.js
- drizzle-orm
- pg
-  A QuestDB instance

## Installation

You can install Drizzle ORM and its PostgreSQL driver using npm:

```bash
npm install drizzle-orm pg
```

## Example usage

```javascript
const { drizzle } = require("drizzle-orm/node-postgres");
const { Client } = require("pg");
const { pgTable, integer } = require("drizzle-orm/pg-core");
const { gt } = require("drizzle-orm");

// Define the table schema using pgTable
const someTable = pgTable("some_table", {
  x: integer("x"),
  y: integer("y"),
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

  // Initialize Drizzle
  const db = drizzle(client);

  // Create the table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS some_table (
      x INT NOT NULL,
      y INT NOT NULL
    );
  `);

  // Insert data
  await db.insert(someTable).values([
    { x: 11, y: 12 },
    { x: 13, y: 14 },
  ]);

  // Basic select without parameters
  const result1 = await db.select().from(someTable);
  console.log(result1);

  // Select with parameters
  const result2 = await db
    .select({
      x: someTable.x,
      y: someTable.y,
    })
    .from(someTable)
    .where(gt(someTable.y, 12));
  console.log(result2);

  await client.end();
}

main().catch(console.error);
```

## See also
- [Drizzle ORM documentation](https://orm.drizzle.team/docs/rqb)