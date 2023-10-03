---
title: Update data
description:
  This page demonstrates how to update time-series data in QuestDB from
  NodeJS, Java, Python and cURL. The examples show how to use the REST and Postgres APIs.
---

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"

This page shows how to update existing data in QuestDB using different programming
languages and tools. There are two main methods for updating data:

- [Postgres wire](#postgres-compatibility) protocol for compatibility with a
  range of clients
- [REST API](#rest-api) provides access to QuestDB via HTTP

## Prerequisites

This page assumes that QuestDB is running and accessible. QuestDB can be run
using either [Docker](/docs/get-started/docker/), the
[Binaries](/docs/get-started/binaries/) or
[Homebrew](/docs/get-started/homebrew/) for macOS users.

## Postgres compatibility

You can query data using the [Postgres](/docs/reference/api/postgres/) endpoint
that QuestDB exposes. This is accessible via port `8812` by default. More
information on the Postgres wire protocol implementation with details on
supported features can be found on the
[Postgres API reference](/docs/reference/api/postgres/) page.

<!-- prettier-ignore-start -->

<Tabs defaultValue="nodejs" values={[
  { label: "NodeJS", value: "nodejs" },
  { label: "Java", value: "java" },
  { label: "Python", value: "python" },
]}>

<!-- prettier-ignore-end -->

<TabItem value="nodejs">

This example uses the [`pg` package](https://www.npmjs.com/package/pg) which
allows for quickly building queries using Postgres wire protocol. Details on the
use of this package can be found on the
[node-postgres documentation](https://node-postgres.com/).

This example uses naive `Date.now() * 1000` inserts for Timestamp types in
microsecond resolution. For accurate microsecond timestamps, the
[process.hrtime.bigint()](https://nodejs.org/api/process.html#processhrtimebigint) call can be used.

```javascript
"use strict"

const { Client } = require("pg")

const start = async () => {
  const client = new Client({
    database: "qdb",
    host: "127.0.0.1",
    password: "quest",
    port: 8812,
    user: "admin",
    options: "-c statement_timeout=300000"
  })
  await client.connect()

  const createTable = await client.query(
    "CREATE TABLE IF NOT EXISTS trades (ts TIMESTAMP, date DATE, name STRING, value INT) timestamp(ts);"
  )
  console.log(createTable)

  for (let rows = 0; rows < 10; rows++) {
    // Providing a 'name' field allows for prepared statements / bind variables
    let now = new Date().toISOString()
    const query = {
      name: "insert-values",
      text: "INSERT INTO trades VALUES($1, $2, $3, $4);",
      values: [now, now, "node pg prep statement", rows],
    }
    await client.query(query)
  }

  const updateData = await client.query(
          "UPDATE trades SET name = 'update example', value = 123 WHERE value > 7;"
  )
  console.log(updateData)

  await client.query("COMMIT")

  const readAll = await client.query("SELECT * FROM trades")
  console.log(readAll.rows)

  await client.end()
}

start()
  .then(() => console.log("Done"))
  .catch(console.error)
```

</TabItem>


<TabItem value="java">


```java
package com.myco;

import java.sql.*;
import java.util.Properties;

class App {
  public static void main(String[] args) throws SQLException {
    Properties properties = new Properties();
    properties.setProperty("user", "admin");
    properties.setProperty("password", "quest");
    //set sslmode value to 'require' if connecting to a QuestDB Cloud instance
    properties.setProperty("sslmode", "disable");
    properties.setProperty("options", "-c statement_timeout=300000");

    final Connection connection = DriverManager.getConnection("jdbc:postgresql://localhost:8812/qdb", properties);
    connection.setAutoCommit(false);

    final PreparedStatement statement = connection.prepareStatement("CREATE TABLE IF NOT EXISTS trades (ts TIMESTAMP, date DATE, name STRING, value INT) timestamp(ts);");
    statement.execute();

    try (PreparedStatement preparedStatement = connection.prepareStatement("INSERT INTO trades VALUES (?, ?, ?, ?)")) {
      preparedStatement.setTimestamp(1, new Timestamp(io.questdb.std.Os.currentTimeMicros()));
      preparedStatement.setDate(2, new Date(System.currentTimeMillis()));
      preparedStatement.setString(3, "abc");
      preparedStatement.setInt(4, 123);
      preparedStatement.execute();
    }

    final PreparedStatement statement = connection.prepareStatement("UPDATE trades SET value = value + 1000;");
    statement.execute();

    System.out.println("Done");
    connection.close();
  }
}
```

</TabItem>


<TabItem value="python">


This example uses the
[psychopg3](https://www.psycopg.org/psycopg3/docs/) adapter.

To [install](https://www.psycopg.org/psycopg3/docs/basic/install.html) the client library, use `pip`:

```shell
python3 -m pip install "psycopg[binary]"
```

```python
import psycopg as pg
import time

# Connect to an existing QuestDB instance

conn_str = 'user=admin password=quest host=127.0.0.1 port=8812 dbname=qdb'
with pg.connect(conn_str, autocommit=True) as connection:

    # Open a cursor to perform database operations
    with connection.cursor() as cur:

        # Execute a command: this creates a new table
        cur.execute('''
          CREATE TABLE IF NOT EXISTS test_pg (
              ts TIMESTAMP,
              name STRING,
              value INT
          ) timestamp(ts);
          ''')

        print('Table created.')

        # Insert data into the table.
        for x in range(10):

            # Converting datetime into millisecond for QuestDB
            timestamp = time.time_ns() // 1000

            cur.execute('''
                INSERT INTO test_pg
                    VALUES (%s, %s, %s);
                ''',
                (timestamp, 'python example', x))

        print('Rows inserted:')

        # Query the database and obtain data as Python objects.
        cur.execute('SELECT * FROM test_pg;')
        records = cur.fetchall()
        for row in records:
            print(row)

        # Update records
        cur.execute('UPDATE test_pg SET value = value + 100;')
        
        # Query the database to show the updated values.
        print("Updated data:")
        cur.execute('SELECT * FROM test_pg;')
        records = cur.fetchall()
        for row in records:
            print(row)
```
</TabItem>


</Tabs>


## REST API

QuestDB exposes a REST API for compatibility with a wide range of libraries and
tools. The REST API is accessible on port `9000` and has the following
entrypoints:

- `/imp` - import data
- `/exec` - execute an SQL statement

More details on the use of these entrypoints can be found on the
[REST API reference](/docs/reference/api/rest/) page.

### `/imp` endpoint

The `/imp` endpoint does not allow for updating data.


### `/exec` endpoint

Alternatively, the `/exec` endpoint can be used to create a table and the
`INSERT` statement can be used to populate it with values:

<!-- prettier-ignore-start -->

<Tabs defaultValue="curl" values={[
  { label: "cURL", value: "curl" },
  { label: "NodeJS", value: "nodejs" },
  { label: "Python", value: "python" },
]}>

<!-- prettier-ignore-end -->

<TabItem value="curl">


```shell
# Create Table
curl -G \
  --data-urlencode "query=CREATE TABLE IF NOT EXISTS trades(name STRING, value INT)" \
  http://localhost:9000/exec

# Insert a row
curl -G \
  --data-urlencode "query=INSERT INTO trades VALUES('abc', 123456)" \
  http://localhost:9000/exec

# Update a row
curl -G \
  --data-urlencode "query=UPDATE trades SET value = 9876 WHERE name = 'abc'" \
  http://localhost:9000/exec
```

</TabItem>


<TabItem value="nodejs">


The `node-fetch` package can be installed using `npm i node-fetch`.

```javascript
const fetch = require("node-fetch")

const HOST = "http://localhost:9000"

async function createTable() {
  try {
    const query = "CREATE TABLE IF NOT EXISTS trades (name STRING, value INT)";

    const response = await fetch(`${HOST}/exec?query=${encodeURIComponent(query)}`)
    const json = await response.json()

    console.log(json)
  } catch (error) {
    console.log(error)
  }
}

async function insertData() {
  try {
    const query = "INSERT INTO trades VALUES('abc', 123456)"

    const response = await fetch(`${HOST}/exec?query=${encodeURIComponent(query)}`)
    const json = await response.json()

    console.log(json)
  } catch (error) {
    console.log(error)
  }
}

async function updateData() {
  try {
    const query = "UPDATE trades SET value = 9876 WHERE name = 'abc'"

    const response = await fetch(`${HOST}/exec?query=${encodeURIComponent(query)}`)
    const json = await response.json()

    console.log(json)
  } catch (error) {
    console.log(error)
  }
}

createTable().then(insertData).then(updateData)
```

</TabItem>


<TabItem value="python">


```python
import requests
import json

host = 'http://localhost:9000'

def run_query(sql_query):
  query_params = {'query': sql_query, 'fmt' : 'json'}
  try:
    response = requests.get(host + '/exec', params=query_params)
    json_response = json.loads(response.text)
    print(json_response)
  except requests.exceptions.RequestException as e:
    print("Error: %s" % (e))

# create table
run_query("CREATE TABLE IF NOT EXISTS trades (name STRING, value INT)")
# insert row
run_query("INSERT INTO trades VALUES('abc', 123456)")
# update row
run_query("UPDATE trades SET value = 9876 WHERE name = 'abc'")
```

</TabItem>

</Tabs>


## Web Console

By default, QuestDB has an embedded Web Console running at
http://[server-address]:9000. When running locally, this is accessible at
`http://localhost:9000`. The Web Console can be used to
explore table schemas, visualizing query results as tables or graphs, and
importing datasets from CSV files. For details on these components, refer to the
[Web Console reference](/docs/develop/web-console/) page.
