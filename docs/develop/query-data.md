# Query data

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"

This page describes how to query data from QuestDB using different programming
languages and tools.

## Overview

For ad-hoc SQL queries, including CSV download and charting use the web console.
Applications can choose between the HTTP REST API which returns JSON or use
the PostgreSQL wire protocol.

QuestDB supports the following data querying methods:

- [HTTP REST API](#http-rest-api): compatibility with a wide range of libraries
  and tools.
  - Accessing QuestDB via the [Web Console](#web-console):
    -  SQL `SELECT` statements.
    - Download query results as CSV.
    - Chart query results.
  - SQL `SELECT` statements as JSON or CSV
  - Result paging
- [PostgreSQL wire protocol](#postgresql-wire-protocol): interoperability with
  the PostgreSQL ecosystem.
   - SQL `SELECT` statements.
   - Use `psql` on the command line.

## Web Console

QuestDB ships with an embedded Web Console running by default on port `9000`.

import Screenshot from "@theme/Screenshot"

<a href="/docs/develop/web-console/">
    <Screenshot
    alt="Screenshot of the Web Console"
    height={375}
    small
    src="/img/docs/console/overview.png"
    width={500}
    />
</a>

To query data from the web console, SQL statements can be written in the code
editor and executed by clicking the **Run** button.

```questdb-sql title='Listing tables and querying a table'
SHOW TABLES;
SELECT * FROM my_table;

--Note that `SELECT * FROM` is optional
my_table;
```

Aside from the Code Editor, the Web Console includes a data visualization panel
for viewing query results as tables or graphs and an Import tab for uploading
datasets as CSV files. For more details on these components and general use of
the console, see the [Web Console](/docs/develop/web-console/) page.

## PostgreSQL wire protocol

You can query data using the Postgres endpoint
that QuestDB exposes which is accessible by default via port `8812`. Examples in
multiple languages are shown below. To learn more, check out our docs about
[Postgres compatibility and tools](/docs/reference/api/postgres/).

<Tabs defaultValue="python" values={[
  { label: "Python", value: "python" },
  { label: "Java", value: "java" },
  { label: "NodeJS", value: "nodejs" },
  { label: "Go", value: "go" },
  { label: "C#", value: "csharp" },
  { label: "C", value: "c" },
  { label: "Ruby", value: "ruby" },
  { label: "PHP", value: "php" }
]}>

<TabItem value="python">


```python
import psycopg as pg
import time

# Connect to an existing QuestDB instance

conn_str = 'user=admin password=quest host=127.0.0.1 port=8812 dbname=qdb'
with pg.connect(conn_str, autocommit=True) as connection:

    # Open a cursor to perform database operations

    with connection.cursor() as cur:

        #Query the database and obtain data as Python objects.

        cur.execute('SELECT * FROM trades_pg;')
        records = cur.fetchall()
        for row in records:
            print(row)

# the connection is now closed

```

</TabItem>


<TabItem value="java">


```java
package com.myco;

import java.sql.*;
import java.util.Properties;

public class App {
    public static void main(String[] args) throws SQLException {
        Properties properties = new Properties();
        properties.setProperty("user", "admin");
        properties.setProperty("password", "quest");
        //set sslmode value to 'require' if connecting to a QuestDB Cloud instance
        properties.setProperty("sslmode", "disable");

        final Connection connection = DriverManager.getConnection(
            "jdbc:postgresql://localhost:8812/qdb", properties);
        try (PreparedStatement preparedStatement = connection.prepareStatement(
                "SELECT x FROM long_sequence(5);")) {
            try (ResultSet rs = preparedStatement.executeQuery()) {
                while (rs.next()) {
                    System.out.println(rs.getLong(1));
                }
            }
        }
        connection.close();
    }
}

```

</TabItem>


<TabItem value="nodejs">


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
  })
  await client.connect()

  const res = await client.query("SELECT x FROM long_sequence(5);")

  console.log(res.rows)

  await client.end()
}

start().catch(console.error)
```

</TabItem>


<TabItem value="go">


```go
package main

import (
  "database/sql"
  "fmt"

  _ "github.com/lib/pq"
)

const (
  host     = "localhost"
  port     = 8812
  user     = "admin"
  password = "quest"
  dbname   = "qdb"
)

func main() {
  connStr := fmt.Sprintf(
    "host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
    host, port, user, password, dbname)
  db, err := sql.Open("postgres", connStr)
  checkErr(err)
  defer db.Close()

  // Currently, we do not support queries with bind parameters in Go
  rows, err := db.Query("SELECT x FROM long_sequence(5);")
  checkErr(err)
  defer rows.Close()

  for rows.Next() {
    var num string
    err = rows.Scan(&num)
    checkErr(err)
    fmt.Println(num)
  }

  err = rows.Err()
  checkErr(err)
}

func checkErr(err error) {
  if err != nil {
    panic(err)
  }
}

```

</TabItem>


<TabItem value="c">


```c
// compile with
// g++ libpq_example.c -o libpq_example.exe  -I pgsql\include -L dev\pgsql\lib
// -std=c++17  -lpthread -lpq
#include <libpq-fe.h>
#include <stdio.h>
#include <stdlib.h>

void do_exit(PGconn *conn) {
  PQfinish(conn);
  exit(1);
}

int main() {
  PGconn *conn = PQconnectdb(
      "host=localhost user=admin password=quest port=8812 dbname=testdb");
  if (PQstatus(conn) == CONNECTION_BAD) {
    fprintf(stderr, "Connection to database failed: %s\n",
            PQerrorMessage(conn));
    do_exit(conn);
  }
  PGresult *res = PQexec(conn, "SELECT x FROM long_sequence(5);");
  if (PQresultStatus(res) != PGRES_TUPLES_OK) {
    printf("No data retrieved\n");
    PQclear(res);
    do_exit(conn);
  }
  int rows = PQntuples(res);
  for (int i = 0; i < rows; i++) {
    printf("%s\n", PQgetvalue(res, i, 0));
  }
  PQclear(res);
  PQfinish(conn);
  return 0;
}
```

</TabItem>


<TabItem value="csharp">


```csharp
using Npgsql;
string username = "admin";
string password = "quest";
string database = "qdb";
int port = 8812;
var connectionString = $@"host=localhost;port={port};username={username};password={password};
database={database};ServerCompatibilityMode=NoTypeLoading;";
await using NpgsqlConnection connection = new NpgsqlConnection(connectionString);
await connection.OpenAsync();

var sql = "SELECT x FROM long_sequence(5);";

await using NpgsqlCommand command = new NpgsqlCommand(sql, connection);
await using (var reader = await command.ExecuteReaderAsync()) {
    while (await reader.ReadAsync())
    {
        var x = reader.GetInt64(0);
    }
}
```

</TabItem>

<TabItem value="ruby">

```ruby
require 'pg'
begin
    conn =PG.connect( host: "127.0.0.1", port: 8812, dbname: 'qdb',
                      user: 'admin', password: 'quest' )
    rows = conn.exec 'SELECT x FROM long_sequence(5);'
    rows.each do |row|
        puts row
    end
rescue PG::Error => e
     puts e.message
ensure
    conn.close if conn
end
```

</TabItem>

<TabItem value="php">

```php
<?php

function exceptions_error_handler($severity, $message, $filename, $lineno) {
    throw new ErrorException($message, 0, $severity, $filename, $lineno);
}

set_error_handler('exceptions_error_handler');
$db_conn = null;

try {
        $db_conn = pg_connect(" host = 'localhost' port=8812 dbname = 'qdb' user = 'admin'  password = 'quest' ");
        $result = pg_query($db_conn, 'SELECT x FROM long_sequence(5);' );
        while ($row = pg_fetch_assoc($result) ){
                print_r($row);
                }
        pg_free_result($result);
} catch (Exception $e) {
    echo 'Caught exception: ',  $e->getMessage(), "\n";
} finally {
        if (!is_null($db_conn)) {
                pg_close($db_conn);
        }
}

?>
```
</TabItem>

</Tabs>


## HTTP REST API

QuestDB exposes a REST API for compatibility with a wide range of libraries and
tools. The REST API is accessible on port `9000` and has the following
query-capable entrypoints:

|Entrypoint                                 |HTTP Method|Description                            | API Docs                                                      |
|:------------------------------------------|:----------|:--------------------------------------|:--------------------------------------------------------------|
|[`/exp?query=..`](#exp-sql-query-to-csv)   |GET        |Export SQL Query as CSV                | [Reference](/docs/reference/api/rest/#exp---export-data)      |
|[`/exec?query=..`](#exec-sql-query-to-json)|GET        |Run SQL Query returning JSON result set| [Reference](/docs/reference/api/rest/#exec---execute-queries) |

For details such as content type, query parameters and more, refer to the
[REST API](/docs/reference/api/rest/) docs.

### `/exp`: SQL Query to CSV

The `/exp` entrypoint allows querying the database with a SQL select query and
obtaining the results as CSV.

For obtaining results in JSON, use `/exec` instead, documented next.

<Tabs defaultValue="curl" values={[
  { label: "cURL", value: "curl" },
  { label: "Python", value: "python" },
]}>

<TabItem value="curl">

```bash
curl -G --data-urlencode \
    "query=SELECT * FROM example_table2 LIMIT 3" \
    http://localhost:9000/exp
```

```csv
"col1","col2","col3"
"a",10.5,true
"b",100.0,false
"c",,true
```

</TabItem>

<TabItem value="python">

```python
import requests

resp = requests.get(
    'http://localhost:9000/exp',
    {
        'query': 'SELECT * FROM example_table2',
        'limit': '3,6'   # Rows 3, 4, 5
    })
print(resp.text)
```

```csv
"col1","col2","col3"
"d",20.5,true
"e",200.0,false
"f",,true
```

</TabItem>

</Tabs>

### `/exec`: SQL Query to JSON

The `/exec` entrypoint takes a SQL query and returns results as JSON.

This is similar to the `/exec` entry point which returns results as CSV.

### Querying Data

<Tabs defaultValue="curl" values={[
  { label: "cURL", value: "curl" },
  { label: "Python", value: "python" },
  { label: "NodeJS", value: "nodejs" },
  { label: "Go", value: "go" },
]}>

<!-- prettier-ignore-end -->

<TabItem value="curl">


```shell
curl -G \
  --data-urlencode "query=SELECT x FROM long_sequence(5);" \
  http://localhost:9000/exec
```

The JSON response contains the original query, a `"columns"` key with the schema
of the results, a `"count"` number of rows and a `"dataset"` with the results.

```json
{
    "query": "SELECT x FROM long_sequence(5);",
    "columns": [
        {"name": "x", "type": "LONG"}],
    "dataset": [
        [1],
        [2],
        [3],
        [4],
        [5]],
    "count": 5
}
```

</TabItem>


<TabItem value="python">


```python
import sys
import requests

host = 'http://localhost:9000'

sql_query = "select * from long_sequence(10)"

try:
    response = requests.get(
        host + '/exec',
        params={'query': sql_query}).json()
    for row in response['dataset']:
        print(row[0])
except requests.exceptions.RequestException as e:
    print(f'Error: {e}', file=sys.stderr)
```

</TabItem>


<TabItem value="nodejs">


```javascript
const fetch = require("node-fetch")

const HOST = "http://localhost:9000"

async function run() {
  try {
    const query = "SELECT x FROM long_sequence(5);"

    const response = await fetch(`${HOST}/exec?query=${encodeURIComponent(query)}`)
    const json = await response.json()

    console.log(json)
  } catch (error) {
    console.log(error)
  }
}

run()
```

</TabItem>


<TabItem value="go">


```go
package main

import (
  "fmt"
  "io/ioutil"
  "log"
  "net/http"
  "net/url"
)

func main() {
  u, err := url.Parse("http://localhost:9000")
  checkErr(err)

  u.Path += "exec"
  params := url.Values{}
  params.Add("query", "SELECT x FROM long_sequence(5);")
  u.RawQuery = params.Encode()
  url := fmt.Sprintf("%v", u)

  res, err := http.Get(url)
  checkErr(err)

  defer res.Body.Close()

  body, err := ioutil.ReadAll(res.Body)
  checkErr(err)

  log.Println(string(body))
}

func checkErr(err error) {
  if err != nil {
    panic(err)
  }
}
```

</TabItem>


</Tabs>
