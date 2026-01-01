---
title: Query & SQL Overview
sidebar_label: Overview
description:
  This document shows how to work with QuestDB as a time-series database by
  generating dummy time-series data, inserting the data into a table, then
  querying and cleaning up the example data set.
---

import Screenshot from "@theme/Screenshot"

import Tabs from "@theme/Tabs"

import TabItem from "@theme/TabItem"

import CQueryPartial from "../partials/\_c.sql.query.partial.mdx"

import CsharpQueryPartial from "../partials/\_csharp.sql.query.partial.mdx"

import GoQueryPartial from "../partials/\_go.sql.query.partial.mdx"

import JavaQueryPartial from "../partials/\_java.sql.query.partial.mdx"

import NodeQueryPartial from "../partials/\_nodejs.sql.query.partial.mdx"

import RubyQueryPartial from "../partials/\_ruby.sql.query.partial.mdx"

import PHPQueryPartial from "../partials/\_php.sql.query.partial.mdx"

import PythonQueryPartial from "../partials/\_python.sql.query.partial.mdx"

import CurlExecQueryPartial from "../partials/\_curl.exec.query.partial.mdx"

import GoExecQueryPartial from "../partials/\_go.exec.query.partial.mdx"

import NodejsExecQueryPartial
from"../partials/\_nodejs.exec.query.partial.mdx"

import PythonExecQueryPartial from
"../partials/\_python.exec.query.partial.mdx"

Querying - as a base action - is performed in three primary ways:

1. Query via the
   [QuestDB Web Console](/docs/query/overview/#questdb-web-console)
2. Query via [PostgreSQL](/docs/query/overview/#postgresql)
3. Query via [REST HTTP API](/docs/query/overview/#rest-http-api)
4. Query via [Apache Parquet](/docs/query/overview/#apache-parquet)

For efficient and clear querying, QuestDB provides SQL with enhanced time series
extensions. This makes analyzing, downsampling, processing and reading time
series data an intuitive and flexible experience.

Queries can be written into many applications using existing drivers and clients
of the PostgreSQL or REST-ful ecosystems. However, querying is also leveraged
heavily by third-party tools to provide visualizations, such as within
[Grafana](/docs/integrations/visualization/grafana/), or for data analysis with dataframe
libraries like [Polars](/docs/integrations/data-processing/polars/).

> Need to ingest data first? Checkout our
> [Ingestion overview](/docs/ingestion/overview/).

## QuestDB Web Console

The Web Console is available by default at
http://localhost:9000. The GUI makes it easy to write, return
and chart queries. There is autocomplete, syntax highlighting, errors, and more.
If you want to test a query or interact direclty with your data in the cleanest
and simplest way, apply queries via the [Web Console](/docs/getting-started/web-console/overview/).

<Screenshot
  alt="A shot of the Web Console, showing auto complete and a colourful returned table."
  src="images/docs/console/overview.webp"
  title="Click to zoom"
/>

For an example, click _Demo this query_ in the below snippet. This will run a
query within our public demo instance and [Web Console](/docs/getting-started/web-console/overview/):

```questdb-sql title='Navigate time with SQL' demo
SELECT
    timestamp, symbol,
    first(price) AS open,
    last(price) AS close,
    min(price),
    max(price),
    sum(amount) AS volume
FROM trades
WHERE  timestamp > dateadd('d', -1, now())
SAMPLE BY 15m;
```

If you see _Demo this query_ on other snippets in this docs, they can be run
against the demo instance.

## PostgreSQL

Query QuestDB using the PostgreSQL endpoint via the default port `8812`.

See [PGWire Client overview](/docs/query/pgwire/overview/) for details on how to
connect to QuestDB using PostgreSQL clients.

Brief examples in multiple languages are shown below.

<Tabs defaultValue="python" values={[ { label: "Python", value: "python" },
{ label: "Java", value: "java" }, { label: "NodeJS", value: "nodejs" }, { label:
"Go", value: "go" }, { label: "C#", value: "csharp" }, { label: "C", value:
"c" }, { label: "Ruby", value: "ruby" }, { label: "PHP", value: "php" } ]}>

<TabItem value="python">
  <PythonQueryPartial />
</TabItem>

<TabItem value="java">
  <JavaQueryPartial />
</TabItem>

<TabItem value="nodejs">
  <NodeQueryPartial />
</TabItem>

<TabItem value="go">
  <GoQueryPartial />
</TabItem>

<TabItem value="c">
  <CQueryPartial />
</TabItem>

<TabItem value="csharp">
  <CsharpQueryPartial />
</TabItem>

<TabItem value="ruby">
  <RubyQueryPartial />
</TabItem>

<TabItem value="php">
  <PHPQueryPartial />
</TabItem>

</Tabs>


#### Further Reading

See the [PGWire Client overview](/docs/query/pgwire/overview/) for more details on how to use PostgreSQL
clients to connect to QuestDB.

## REST HTTP API

QuestDB exposes a REST API for compatibility with a wide range of libraries and
tools.

The REST API is accessible on port `9000` and has the following query-capable
entrypoints:

For details such as content type, query parameters and more, refer to the
[REST HTTP API](/docs/query/rest-api/) reference.

| Entrypoint                                  | HTTP Method | Description                             | REST HTTP API Reference                                       |
| :------------------------------------------ | :---------- | :-------------------------------------- | :------------------------------------------------------------ |
| [`/exp?query=..`](#exp-sql-query-to-csv)    | GET         | Export SQL Query as CSV                 | [Reference](/docs/query/rest-api/#exp---export-data)      |
| [`/exec?query=..`](#exec-sql-query-to-json) | GET         | Run SQL Query returning JSON result set | [Reference](/docs/query/rest-api/#exec---execute-queries) |

#### `/exp`: SQL Query to CSV

The `/exp` entrypoint allows querying the database with a SQL select query and
obtaining the results as CSV.

For obtaining results in JSON, use `/exec` instead, documented next.

<Tabs defaultValue="curl" values={[ { label: "cURL", value: "curl" }, { label:
"Python", value: "python" }, ]}>

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

#### `/exec`: SQL Query to JSON

The `/exec` entrypoint takes a SQL query and returns results as JSON.

This is similar to the `/exp` entry point which returns results as CSV.

##### Querying Data

<Tabs defaultValue="curl" values={[ { label: "cURL", value: "curl" }, { label:
"Python", value: "python" }, { label: "NodeJS", value: "nodejs" }, { label:
"Go", value: "go" }, ]}>

<TabItem value="curl">
  <CurlExecQueryPartial />
</TabItem>

<TabItem value="python">
  <PythonExecQueryPartial />
</TabItem>

<TabItem value="nodejs">
  <NodejsExecQueryPartial />
</TabItem>

<TabItem value="go">
  <GoExecQueryPartial />
</TabItem>

</Tabs>

Alternatively, the `/exec` endpoint can be used to create a table and the
`INSERT` statement can be used to populate it with values:

<Tabs defaultValue="curl" values={[ { label: "cURL", value: "curl" }, { label:
"NodeJS", value: "nodejs" }, { label: "Python", value: "python" }, ]}>

<TabItem value="curl">

```shell
# Create Table
curl -G \
  --data-urlencode "query=CREATE TABLE IF NOT EXISTS trades(name VARCHAR, value INT)" \
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
const fetch = require("node-fetch");

const HOST = "http://localhost:9000";

async function createTable() {
  try {
    const query = "CREATE TABLE IF NOT EXISTS trades (name VARCHAR, value INT)";

    const response = await fetch(
      `${HOST}/exec?query=${encodeURIComponent(query)}`,
    );
    const json = await response.json();

    console.log(json);
  } catch (error) {
    console.log(error);
  }
}

async function insertData() {
  try {
    const query = "INSERT INTO trades VALUES('abc', 123456)";

    const response = await fetch(
      `${HOST}/exec?query=${encodeURIComponent(query)}`,
    );
    const json = await response.json();

    console.log(json);
  } catch (error) {
    console.log(error);
  }
}

async function updateData() {
  try {
    const query = "UPDATE trades SET value = 9876 WHERE name = 'abc'";

    const response = await fetch(
      `${HOST}/exec?query=${encodeURIComponent(query)}`,
    );
    const json = await response.json();

    console.log(json);
  } catch (error) {
    console.log(error);
  }
}

createTable().then(insertData).then(updateData);
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
run_query("CREATE TABLE IF NOT EXISTS trades (name VARCHAR, value INT)")
# insert row
run_query("INSERT INTO trades VALUES('abc', 123456)")
# update row
run_query("UPDATE trades SET value = 9876 WHERE name = 'abc'")
```

</TabItem>

</Tabs>

## Apache Parquet

:::info

Apache Parquet support is in **beta**. It may not be fit for production use.

Please let us know if you run into issues. Either:

1. Email us at [support@questdb.io](mailto:support@questdb.io)
2. Join our [public Slack](https://slack.questdb.com/)
3. Post on our [Discourse community](https://community.questdb.com/)

:::

Parquet files can be read and thus queried by QuestDB.

QuestDB is shipped with a demo Parquet file, `trades.parquet`, which can be
queried using the `read_parquet` function.

Example:

```questdb-sql title="read_parquet example"
SELECT
  *
FROM
  read_parquet('trades.parquet')
WHERE
  side = 'buy';
```

The trades.parquet file is located in the `import` subdirectory inside the
QuestDB root directory. Drop your own Parquet files to the import directory and
query them using the `read_parquet()` function.

You can change the allowed directory by setting the `cairo.sql.copy.root`
configuration key.

For more information, see the
[Parquet documentation](/docs/query/functions/parquet/).

## What's next?

Now... SQL! It's query time.

Whether you want to use the [Web Console](/docs/getting-started/web-console/overview/), PostgreSQL or REST HTTP (or both),
query construction is rich.

To brush up and learn what's unique in QuestDB, consider the following:

- [Data types](/docs/query/datatypes/overview/)
- [SQL execution order](/docs/query/sql-execution-order/)

And to learn about some of our favourite, most powerful syntax:

- [Window functions](/docs/query/functions/window/) are a powerful analysis
  tool
- [Aggregate functions](/docs/query/functions/aggregation/) - aggregations
  are key!
- [Date & time operators](/docs/query/operators/date-time/) to learn about
  date and time
- [`SAMPLE BY`](/docs/query/sql/sample-by/) to summarize data into chunks
  based on a specified time interval, from a year to a microsecond
- [`WHERE IN`](/docs/query/sql/where/#time-range-where-in) to compress time ranges
  into concise intervals
- [`LATEST ON`](/docs/query/sql/latest-on/) for latest values within
  multiple series within a table
- [`ASOF JOIN`](/docs/query/sql/asof-join/) to associate timestamps between
  a series based on proximity; no extra indices required
- [Materialized Views](/docs/concepts/materialized-views/) to pre-compute complex queries
  for optimal performance

Looking for visuals?

- Explore [Grafana](/docs/integrations/visualization/grafana/)
- Jump quickly into the [Web Console](/docs/getting-started/web-console/overview/)
