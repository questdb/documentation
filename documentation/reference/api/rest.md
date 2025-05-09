---
title: REST API
sidebar_label: REST HTTP API
description: REST API reference documentation.
---

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"
import GoImpPartial from "../../partials/\_go.imp.insert.partial.mdx"
import CurlImpPartial from "../../partials/\_curl.imp.insert.partial.mdx"
import NodejsImpPartial from "../../partials/\_nodejs.imp.insert.partial.mdx"
import PythonImpPartial from "../../partials/\_python.imp.insert.partial.mdx"
import CurlExecPartial from "../../partials/\_curl.exec.insert.partial.mdx"
import GoExecPartial from "../../partials/\_go.exec.insert.partial.mdx"
import NodejsExecPartial from "../../partials/\_nodejs.exec.insert.partial.mdx"
import PythonExecPartial from "../../partials/\_python.exec.insert.partial.mdx"

The QuestDB REST API is based on standard HTTP features and is understood by
off-the-shelf HTTP clients. It provides a simple way to interact with QuestDB
and is compatible with most programming languages. API functions are fully keyed
on the URL and they use query parameters as their arguments.

The Web Console[Web Console](/docs/web-console/) is the official Web client relying on the REST API.

**Available methods**

- [`/imp`](#imp---import-data) for importing data from `.CSV` files
- [`/exec`](#exec---execute-queries) to execute a SQL statement
- [`/exp`](#exp---export-data) to export data

## Examples

QuestDB exposes a REST API for compatibility with a wide range of libraries and
tools. The REST API is accessible on port `9000` and has the following
insert-capable entrypoints:

| Entrypoint                                 | HTTP Method | Description                             | API Docs                                                      |
| :----------------------------------------- | :---------- | :-------------------------------------- | :------------------------------------------------------------ |
| [`/imp`](#imp-uploading-tabular-data)      | POST        | Import CSV data                         | [Reference](/docs/reference/api/rest/#imp---import-data)      |
| [`/exec?query=..`](#exec-sql-insert-query) | GET         | Run SQL Query returning JSON result set | [Reference](/docs/reference/api/rest/#exec---execute-queries) |

For details such as content type, query parameters and more, refer to the
[REST API](/docs/reference/api/rest/) docs.

### `/imp`: Uploading Tabular Data

Let's assume you want to upload the following data via the `/imp` entrypoint:

<Tabs defaultValue="csv" values={[
{ label: "CSV", value: "csv" },
{ label: "Table", value: "table" },
]}>

<TabItem value="csv">

```csv title=data.csv
col1,col2,col3
a,10.5,True
b,100,False
c,,True
```

</TabItem>

<TabItem value="table">

| col1 | col2   | col3    |
| :--- | :----- | :------ |
| a    | 10.5   | _true_  |
| b    | 100    | _false_ |
| c    | _NULL_ | _true_  |

</TabItem>

</Tabs>

You can do so via the command line using `cURL` or programmatically via HTTP
APIs in your scripts and applications.

By default, the response is designed to be human-readable. Use the `fmt=json`
query argument to obtain a response in JSON. You can also specify the schema
explicitly. See the second example in Python for these features.

<Tabs defaultValue="curl" values={[
{ label: "cURL", value: "curl" },
{ label: "Python", value: "python" },
{ label: "NodeJS", value: "nodejs" },
{ label: "Go", value: "go" },
]}>

<TabItem value="curl">
  <CurlImpPartial />
</TabItem>

<TabItem value="python">
  <PythonImpPartial />
</TabItem>

<TabItem value="nodejs">
  <NodejsImpPartial />
</TabItem>

<TabItem value="go">
  <GoImpPartial />
</TabItem>

</Tabs>

### `/exec`: SQL `INSERT` Query

The `/exec` entrypoint takes a SQL query and returns results as JSON.

We can use this for quick SQL inserts too, but note that there's no support for
parameterized queries that are necessary to avoid SQL injection issues. Prefer
[InfluxDB Line Protocol](/docs/configuration/#influxdb-line-protocol-ilp) if
you need high-performance inserts.

<Tabs defaultValue="curl" values={[
{ label: "cURL", value: "curl" },
{ label: "Python", value: "python" },
{ label: "NodeJS", value: "nodejs" },
{ label: "Go", value: "go" },
]}>

<TabItem value="curl">
  <CurlExecPartial />
</TabItem>

<TabItem value="python">
  <PythonExecPartial />
</TabItem>

<TabItem value="nodejs">
  <NodejsExecPartial />
</TabItem>

<TabItem value="go">
 <GoExecPartial />
</TabItem>
</Tabs>

## /imp - Import data

`/imp` streams tabular text data directly into a table. It supports CSV, TAB and
pipe (`|`) delimited inputs with optional headers. There are no restrictions on
data size. Data types and structures are detected automatically, without
additional configuration. In some cases, additional configuration can be
provided to improve the automatic detection as described in
[user-defined schema](#user-defined-schema).

:::note

The structure detection algorithm analyses the chunk in the beginning of the
file and relies on relative uniformity of data. When the first chunk is
non-representative of the rest of the data, automatic imports can yield errors.

If the data follows a uniform pattern, the number of lines which are analyzed
for schema detection can be reduced to improve performance during uploads using
the `http.text.analysis.max.lines` key. Usage of this setting is described in
the [HTTP server configuration](/docs/configuration/#http-server)
documentation.

:::

### URL parameters

`/imp` is expecting an HTTP POST request using the `multipart/form-data`
Content-Type with following optional URL parameters which must be URL encoded:

| Parameter            | Required | Default          | Description                                                                                                                                                                                                                                                      |
| -------------------- | -------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `atomicity`          | No       | `skipCol`        | `abort`, `skipRow` or `skipCol`. Behaviour when an error is detected in the data. `abort`: the entire file will be skipped. `skipRow`: the row is skipped. `skipCol`: the column is skipped.                                                                     |
| `delimiter`          | No       |                  | URL encoded delimiter character. When set, import will try to detect the delimiter automatically. Since automatic delimiter detection requires at least two lines (rows) to be present in the file, this parameter may be used to allow single line file import. |
| `fmt`                | No       | `tabular`        | Can be set to `json` to get the response formatted as such.                                                                                                                                                                                                      |
| `forceHeader`        | No       | `false`          | `true` or `false`. When `false`, QuestDB will try to infer if the first line of the file is the header line. When set to `true`, QuestDB will expect that line to be the header line.                                                                            |
| `name`               | No       | Name of the file | Name of the table to create, [see below](/docs/reference/api/rest/#names).                                                                                                                                                                                       |
| `overwrite`          | No       | `false`          | `true` or `false`. When set to true, any existing data or structure will be overwritten.                                                                                                                                                                         |
| `partitionBy`        | No       | `NONE`           | See [partitions](/docs/concept/partitions/#properties).                                                                                                                                                                                                          |
| `o3MaxLag`           | No       |                  | Sets upper limit on the created table to be used for the in-memory out-of-order buffer. Can be also set globally via the `cairo.o3.max.lag` configuration property.                                                                                              |
| `maxUncommittedRows` | No       |                  | Maximum number of uncommitted rows to be set for the created table. When the number of pending rows reaches this parameter on a table, a commit will be issued. Can be also set globally via the `cairo.max.uncommitted.rows` configuration property.            |
| `skipLev`            | No       | `false`          | `true` or `false`. Skip “Line Extra Values”, when set to true, the parser will ignore those extra values rather than ignoring entire line. An extra value is something in addition to what is defined by the header.                                             |
| `timestamp`          | No       |                  | Name of the column that will be used as a [designated timestamp](/docs/concept/designated-timestamp/).                                                                                                                                                           |
| `create`             | No       | `true`           | `true` or `false`. When set to `false`, QuestDB will not automatically create a table '`name`' if one does not exist, and will return an error instead.                                                                                                          |

```shell title="Example usage"
curl -F data=@weather.csv \
'http://localhost:9000/imp?overwrite=true&name=new_table&timestamp=ts&partitionBy=MONTH'
```

Further example queries with context on the source CSV file contents relative
and the generated tables are provided in the [examples section](#examples-1)
below.

### Names

Table and column names are subject to restrictions, the following list of
characters are automatically removed:

```plain
[whitespace]
.
?
,
:
\
/
\\
\0
)
(
_
+
-
*
~
%
```

When the header row is missing, column names are generated automatically.

### Consistency guarantees

`/imp` benefits from the properties of the QuestDB
[storage model](/docs/concept/storage-model#consistency-and-durability),
although Atomicity and Durability can be relaxed to meet convenience and
performance demands.

#### Atomicity

QuestDB is fully insured against any connection problems. If the server detects
closed socket(s), the entire request is rolled back instantly and transparently
for any existing readers. The only time data can be partially imported is when
atomicity is in `relaxed` mode and data cannot be converted to column type. In
this scenario, any "defective" row of data is discarded and `/imp` continues to
stream request data into table.

#### Consistency

This property is guaranteed by consistency of append transactions against
QuestDB storage engine.

#### Isolation

Data is committed to QuestDB storage engine at end of request. Uncommitted
transactions are not visible to readers.

#### Durability

`/imp` streams data from network socket buffer directly into memory mapped
files. At this point data is handed over to the OS and is resilient against
QuestDB internal errors and unlikely but hypothetically possible crashes. This
is default method of appending data and it is chosen for its performance
characteristics.

### Examples

#### Automatic schema detection

The following example uploads a file `ratings.csv` which has the following
contents:

| ts                          | visMiles       | tempF | dewpF |
| --------------------------- | -------------- | ----- | ----- |
| 2010-01-01T00:00:00.000000Z | 8.8            | 34    | 30    |
| 2010-01-01T00:51:00.000000Z | 9.100000000000 | 34    | 30    |
| 2010-01-01T01:36:00.000000Z | 8.0            | 34    | 30    |
| ...                         | ...            | ...   | ...   |

An import can be performed with automatic schema detection with the following
request:

```shell
curl -F data=@weather.csv 'http://localhost:9000/imp'
```

A HTTP status code of `200` will be returned and the response will be:

```shell
+-------------------------------------------------------------------------------+
|      Location:  |     weather.csv  |        Pattern  | Locale  |      Errors  |
|   Partition by  |            NONE  |                 |         |              |
|      Timestamp  |            NONE  |                 |         |              |
+-------------------------------------------------------------------------------+
|   Rows handled  |           49976  |                 |         |              |
|  Rows imported  |           49976  |                 |         |              |
+-------------------------------------------------------------------------------+
|              0  |              ts  |                TIMESTAMP  |           0  |
|              1  |        visMiles  |                   DOUBLE  |           0  |
|              2  |           tempF  |                      INT  |           0  |
|              3  |           dewpF  |                      INT  |           0  |
+-------------------------------------------------------------------------------+
```

#### User-defined schema

To specify the schema of a table, a schema object can be provided:

```shell
curl \
-F schema='[{"name":"dewpF", "type": "STRING"}]' \
-F data=@weather.csv 'http://localhost:9000/imp'
```

```shell title="Response"
+------------------------------------------------------------------------------+
|      Location:  |    weather.csv  |        Pattern  | Locale  |      Errors  |
|   Partition by  |           NONE  |                 |         |              |
|      Timestamp  |           NONE  |                 |         |              |
+------------------------------------------------------------------------------+
|   Rows handled  |          49976  |                 |         |              |
|  Rows imported  |          49976  |                 |         |              |
+------------------------------------------------------------------------------+
|              0  |             ts  |                TIMESTAMP  |           0  |
|              1  |       visMiles  |                   DOUBLE  |           0  |
|              2  |          tempF  |                      INT  |           0  |
|              3  |          dewpF  |                   STRING  |           0  |
+------------------------------------------------------------------------------+
```

**Non-standard timestamp formats**

Given a file `weather.csv` with the following contents which contains a
timestamp with a non-standard format:

| ts                    | visMiles       | tempF | dewpF |
| --------------------- | -------------- | ----- | ----- |
| 2010-01-01 - 00:00:00 | 8.8            | 34    | 30    |
| 2010-01-01 - 00:51:00 | 9.100000000000 | 34    | 30    |
| 2010-01-01 - 01:36:00 | 8.0            | 34    | 30    |
| ...                   | ...            | ...   | ...   |

The file can be imported as usual with the following request:

```shell title="Importing CSV with non-standard timestamp"
curl -F data=@weather.csv 'http://localhost:9000/imp'
```

A HTTP status code of `200` will be returned and the import will be successful,
but the timestamp column is detected as a `VARCHAR` type:

```shell title="Response with timestamp as VARCHAR type"
+-------------------------------------------------------------------------------+
|      Location:  |     weather.csv  |        Pattern  | Locale  |      Errors  |
|   Partition by  |            NONE  |                 |         |              |
|      Timestamp  |            NONE  |                 |         |              |
+-------------------------------------------------------------------------------+
|   Rows handled  |           49976  |                 |         |              |
|  Rows imported  |           49976  |                 |         |              |
+-------------------------------------------------------------------------------+
|              0  |              ts  |                  VARCHAR  |           0  |
|              1  |        visMiles  |                   DOUBLE  |           0  |
|              2  |           tempF  |                      INT  |           0  |
|              3  |           dewpF  |                      INT  |           0  |
+-------------------------------------------------------------------------------+
```

To amend the timestamp column type, this example curl can be used which has a
`schema` JSON object to specify that the `ts` column is of `TIMESTAMP` type with
the pattern `yyyy-MM-dd - HH:mm:ss`

Additionally, URL parameters are provided:

- `overwrite=true` to overwrite the existing table
- `timestamp=ts` to specify that the `ts` column is the designated timestamp
  column for this table
- `partitionBy=MONTH` to set a
  [partitioning strategy](/docs/operations/data-retention/) on the table by
  `MONTH`

```shell title="Providing a user-defined schema"
curl \
-F schema='[{"name":"ts", "type": "TIMESTAMP", "pattern": "yyyy-MM-dd - HH:mm:ss"}]' \
-F data=@weather.csv \
'http://localhost:9000/imp?overwrite=true&timestamp=ts&partitionBy=MONTH'
```

The HTTP status code will be set to `200` and the response will show `0` errors
parsing the timestamp column:

```shell
+------------------------------------------------------------------------------+
|      Location:  |    weather.csv  |        Pattern  | Locale  |      Errors  |
|   Partition by  |          MONTH  |                 |         |              |
|      Timestamp  |             ts  |                 |         |              |
+------------------------------------------------------------------------------+
|   Rows handled  |          49976  |                 |         |              |
|  Rows imported  |          49976  |                 |         |              |
+------------------------------------------------------------------------------+
|              0  |             ts  |                TIMESTAMP  |           0  |
|              1  |       visMiles  |                   DOUBLE  |           0  |
|              2  |          tempF  |                      INT  |           0  |
|              3  |          dewpF  |                      INT  |           0  |
+------------------------------------------------------------------------------+
```

#### JSON response

If you intend to upload CSV programmatically, it's easier to parse the response
as JSON. Set `fmt=json` query argument on the request.

Here's an example of a successful response:

```json
{
  "status": "OK",
  "location": "example_table",
  "rowsRejected": 0,
  "rowsImported": 3,
  "header": false,
  "columns": [
    { "name": "col1", "type": "SYMBOL", "size": 4, "errors": 0 },
    { "name": "col2", "type": "DOUBLE", "size": 8, "errors": 0 },
    { "name": "col3", "type": "BOOLEAN", "size": 1, "errors": 0 }
  ]
}
```

Here is an example with request-level errors:

```json
{
  "status": "not enough lines [table=example_table]"
}
```

Here is an example with column-level errors due to unsuccessful casts:

```json
{
  "status": "OK",
  "location": "example_table2",
  "rowsRejected": 0,
  "rowsImported": 3,
  "header": false,
  "columns": [
    { "name": "col1", "type": "DOUBLE", "size": 8, "errors": 3 },
    { "name": "col2", "type": "SYMBOL", "size": 4, "errors": 0 },
    { "name": "col3", "type": "BOOLEAN", "size": 1, "errors": 0 }
  ]
}
```

## /exec - Execute queries

`/exec` compiles and executes the SQL query supplied as a parameter and returns
a JSON response.

:::note

The query execution terminates automatically when the socket connection is
closed.

:::

### Overview

#### Parameters

`/exec` is expecting an HTTP GET request with following query parameters:

| Parameter       | Required | Default | Description                                                                                                                                                                            |
| --------------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `count`         | No       | `false` | `true` or `false`. Counts the number of rows and returns this value.                                                                                                                   |
| `limit`         | No       |         | Allows limiting the number of rows to return. `limit=10` will return the first 10 rows (equivalent to `limit=1,10`), `limit=10,20` will return row numbers 10 through to 20 inclusive. |
| `nm`            | No       | `false` | `true` or `false`. Skips the metadata section of the response when set to `true`.                                                                                                      |
| `query`         | Yes      |         | URL encoded query text. It can be multi-line.                                                                                                                                          |
| `timings`       | No       | `false` | `true` or `false`. When set to `true`, QuestDB will also include a `timings` property in the response which gives details about the execution times.                                   |
| `explain`       | No       | `false` | `true` or `false`. When set to `true`, QuestDB will also include an `explain` property in the response which gives details about the execution plan.                                   |
| `quoteLargeNum` | No       | `false` | `true` or `false`. When set to `true`, QuestDB will surround `LONG` type numbers with double quotation marks that will make them parsed as strings.                                    |

The parameters must be URL encoded.

#### Headers

Supported HTTP headers:

| Header              | Required | Description                                                               |
| ------------------- | -------- | ------------------------------------------------------------------------- |
| `Statement-Timeout` | No       | Query timeout in milliseconds, overrides default timeout from server.conf |

### Examples

#### SELECT query example:

```shell
curl -G \
  --data-urlencode "query=SELECT timestamp, tempF FROM weather LIMIT 2;" \
  --data-urlencode "count=true" \
  http://localhost:9000/exec
```

A HTTP status code of `200` is returned with the following response body:

```json
{
  "query": "SELECT timestamp, tempF FROM weather LIMIT 2;",
  "columns": [
    {
      "name": "timestamp",
      "type": "TIMESTAMP"
    },
    {
      "name": "tempF",
      "type": "INT"
    }
  ],
  "timestamp": 0
  "dataset": [
    ["2010-01-01T00:00:00.000000Z", 34],
    ["2010-01-01T00:51:00.000000Z", 34]
  ],
  "count": 2
}
```

SELECT query returns response in the following format:

```json
{
  "query": string,
  "columns": Array<{ "name": string, "type": string }>
  "dataset": Array<Array<Value for Column1, Value for Column2>>,
  "timestamp": number,
  "count": Optional<number>,
  "timings": Optional<{ compiler: number, count: number, execute: number }>,
  "explain": Optional<{ jitCompiled: boolean }>
}
```

You can find the exact list of column types in the
[dedicated page](/docs/reference/sql/datatypes/).

The `timestamp` field indicates which of the columns in the result set is the
designated timestamp, or -1 if there isn't one.

#### UPDATE query example:

This request executes an update of table `weather` setting 2 minutes query
timeout

```shell
curl -G \
  -H "Statement-Timeout: 120000" \
  --data-urlencode "query=UPDATE weather SET tempF = tempF + 0.12 WHERE tempF > 60" \
  http://localhost:9000/exec
```

A HTTP status code of `200` is returned with the following response body:

```json
{
  "ddl": "OK",
  "updated": 34
}
```

#### CREATE TABLE query example:

This request creates a basic table, with a designated timestamp.

```shell
curl -G \
  -H "Statement-Timeout: 120000" \
  --data-urlencode "query=CREATE TABLE foo ( a INT, ts TIMESTAMP) timestamp(ts)" \
  http://localhost:9000/exec
```

A HTTP status code of `200` is returned with the following response body:

```json
{
  "ddl": "OK"
}
```

## /exp - Export data

This endpoint allows you to pass url-encoded queries but the request body is
returned in a tabular form to be saved and reused as opposed to JSON.

### Overview

`/exp` is expecting an HTTP GET request with following parameters:

| Parameter | Required | Description                                                                                                                                                                                                                  |
| :-------- | :------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`   | Yes      | URL encoded query text. It can be multi-line.                                                                                                                                                                                |
| `limit`   | No       | Paging opp parameter. For example, `limit=10,20` will return row numbers 10 through to 20 inclusive and `limit=20` will return first 20 rows, which is equivalent to `limit=0,20`. `limit=-20` will return the last 20 rows. |
| `nm`      | No       | `true` or `false`. Skips the metadata section of the response when set to `true`.                                                                                                                                            |

The parameters must be URL encoded.

### Examples

Considering the query:

```shell
curl -G \
  --data-urlencode "query=SELECT AccidentIndex2, Date, Time FROM 'Accidents0514.csv'" \
  --data-urlencode "limit=5" \
  http://localhost:9000/exp
```

A HTTP status code of `200` is returned with the following response body:

```shell
"AccidentIndex","Date","Time"
200501BS00001,"2005-01-04T00:00:00.000Z",17:42
200501BS00002,"2005-01-05T00:00:00.000Z",17:36
200501BS00003,"2005-01-06T00:00:00.000Z",00:15
200501BS00004,"2005-01-07T00:00:00.000Z",10:35
200501BS00005,"2005-01-10T00:00:00.000Z",21:13
```

## Error responses

### Malformed queries

A successful call to `/exec` or `/exp` which also contains a malformed query
will return response bodies with the following format:

```json
{
  "query": string,
  "error": string,
  "position": number
}
```

The `position` field is the character number from the beginning of the string
where the error was found.

Considering the query:

```shell
curl -G \
  --data-urlencode "query=SELECT * FROM table;" \
  http://localhost:9000/exp
```

A HTTP status code of `400` is returned with the following response body:

```json
{
  "query": "SELECT * FROM table;",
  "error": "function, literal or constant is expected",
  "position": 8
}
```

## Authentication (RBAC)

:::note

Role-based Access Control (RBAC) is available in
[QuestDB Enterprise](/enterprise/). See the next paragraph for authentication in QuestDB Open Source.

:::

REST API supports two authentication types:

- HTTP basic authentication
- Token-based authentication

The first authentication type is mainly supported by web browsers. But you can
also apply user credentials programmatically in a `Authorization: Basic` header.
This example `curl` command that executes a `SELECT 1;` query along with the
`Authorization: Basic` header:

```bash
curl -G --data-urlencode "query=SELECT 1;" \
    -u "my_user:my_password" \
    http://localhost:9000/exec
```

The second authentication type requires a REST API token to be specified in a
`Authorization: Bearer` header:

```bash
curl -G --data-urlencode "query=SELECT 1;" \
    -H "Authorization: Bearer qt1cNK6s2t79f76GmTBN9k7XTWm5wwOtF7C0UBxiHGPn44" \
    http://localhost:9000/exec
```

Refer to the [user management](/docs/operations/rbac/#user-management) page to
learn more on how to generate a REST API token.

## Authentication in QuestDB open source

QuestDB Open Source supports HTTP basic authentication. To enable it, set the configuration
options `http.user` and `http.password` in `server.conf`.

The following example shows how to enable HTTP basic authentication in QuestDB open source:

```shell
http.user=my_user
http.password=my_password
```

Then this `curl` command executes a `SELECT 1;` query:

```bash
curl -G --data-urlencode "query=SELECT 1;" \
    -u "my_user:my_password" \
    http://localhost:9000/exec
```
