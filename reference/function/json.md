---
title: JSON functions
sidebar_label: JSON
description: JSON functions reference documentation.
---

This page describes functions to handle JSON data.

## json_extract

Extract fields from a JSON document stored in VARCHAR columns.

`json_extract(doc, json_path)::datatype`

Here [`datatype`](#type-conversions) can be any type supported by QuestDB.

### Usage

This is an example query that extracts fields from a `trade_details` column
containing JSON documents:

```questdb-sql title="json_extract example"
SELECT
    json_extract(trade_details, '$.quantity')::long quantity,
    json_extract(trade_details, '$.price')::double price,
    json_extract(trade_details, '$.executions[0].timestamp')::timestamp first_ex_ts
FROM
    trades
WHERE
    json_extract(trade_details, '$.exchange') == 'NASDAQ'
```

The query above:
   * Filters rows, keeping only trades made on NASDAQ.
   * Obtains the price and quantity fields.
   * Extracts the timestamp of the first execution for the trade.

For reference, a sample JSON document for the above query:

```json
{
  "trade_id": "123456",
  "instrument_id": "AAPL",
  "trade_type": "buy",
  "quantity": 1000,
  "price": 145.09,
  "vwap": {
    "start_timestamp": "2023-07-12T09:30:00Z",
    "end_timestamp": "2023-07-12T16:00:00Z",
    "executed_volume": 1000,
    "executed_value": 145000
  },
  "execution_time": "2023-07-12T15:59:59Z",
  "exchange": "NASDAQ",
  "strategy": "VWAP",
  "executions": [
    {
      "timestamp": "2023-07-12T10:00:00Z",
      "price": 144.50,
      "quantity": 200
    },
    {
      "timestamp": "2023-07-12T15:15:00Z",
      "price": 145.50,
      "quantity": 250
    }
  ]
}
```

### JSON path syntax

We support a limited JSON Path syntax.
* `$` denotes the root of the document. Its use is optional and provided for
  compatibility with the JSON path standard and other databases. Note that
  all search operations always start from the root.
* `.field` accesses a JSON object key.
* `[n]` accesses a JSON array index (where `n` is a number).

The path cannot be constructed dynamically, such as via string concatenation.

### Type conversions

You can specify any
[datatype supported by QuestDB](/docs/reference/sql/datatypes) as the return
type. Here are some examples:

```questdb-sql title="Extracting JSON to various datatypes"
-- Extracts the string, or the raw JSON token for non-string JSON types.
json_extract('{"name": "Lisa"}', '$.name')::varchar  -- Lisa
json_extract('[0.25, 0.5, 1.0]', '$.name')::varchar  -- [0.25, 0.5, 1.0]

-- Extracts the number as a long, returning NULL if the field is not a number
-- or out of range. Floating point numbers are truncated.
json_extract('{"qty": 10000}', '$.qty')::long        -- 10000
json_extract('1.75', '$')::long                      -- 1

-- Extracts the number as a double, returning NULL if the field is not a number
-- or out of range.
json_extract('{"price": 100.25}', '$.price')::double -- 100.25
json_extract('10000', '$')::double                   -- 10000.0
json_extract('{"price": null}', '$.price')::double   -- NULL

-- JSON `true` is extracted as the boolean `true`. Everything else is `false`.
json_extract('[true]', '$[0]')::boolean              -- true
json_extract('["true"]', '$[0]')::boolean            -- false

-- SHORT numbers can't represent NULL values, so return 0 instead.
json_extract('{"qty": 10000}', '$.qty')::short       -- 10000
json_extract('{"qty": null}', '$.qty')::short        -- 0
json_extract('{"qty": 1000000}', '$.qty')::short     -- 0  (out of range)
```

Calling `json_extract` without immediately casting to a datatype will always
return a `VARCHAR`.

```questdb-sql title="Extracting a path as VARCHAR"
json_extract('{"name": "Lisa"}', '$.name')           -- Lisa
```

As a quirk, for PostgreSQL compatibility, suffix-casting to `::float` in QuestDB
produces a `DOUBLE` datatype. If you need a `FLOAT`, use the `cast` function
instead as so:

```questdb-sql title="Extract a float from a JSON array"
SELECT
    cast(json_extract('[0.25, 0.5, 1.0]', '$[0]') as float) a
FROM
    long_sequence(1)
```

### Error handling

Any errors will return `NULL` data when extracting to any datatype except
boolean and short, where these will return `false` and `0` respectively.

```questdb-sql title="Error examples"
-- If either the document or the path is NULL, the result is NULL.
json_extract(NULL, NULL)                             -- NULL

-- If the document is malformed, the result is NULL.
json_extract('{"name": "Lisa"', '$.name')            -- NULL
--                           ^___ note the missing closing brace
```

### Performance

Extracting fields from JSON documents provides flexibility, but comes at a
performance cost compared to storing fields directly in columns.

As a ballpark estimate, you should expect extracting a field from a JSON
document to be around one order of magnitude slower than extracting the same
data directly from a dedicated database column. As such, we suggest reserving
use of JSON for when the requirement of handling multiple data fields flexibly
outweighs the performance penalty.

### Migrating JSON fields to columns

JSON offers an opportunity to capture a wide range of details early
in a solution's design process. During early stages, it may not be clear which
fields will provide the most value. Once known, you can then modify the database
schema to extract these fields into first-class columns.

Extending the previous example, we can add `price` and `quantity` columns to 
the pre-existing `trades` table as so:

```questdb-sql title="Extracting JSON to a new column"
-- Add two columns for caching.
ALTER TABLE trades ADD COLUMN quantity long;
ALTER TABLE trades ADD COLUMN price double;

-- Populate the columns from the existing JSON document.
UPDATE trades SET quantity = json_extract(trade_details, '$.quantity')::long;
UPDATE trades SET price = json_extract(trade_details, '$.price')::double;
```
