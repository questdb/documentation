---
title: JSON functions
sidebar_label: JSON
description: JSON functions reference documentation.
---

This page describes functions specific to handling JSON data.

## json_extract

Extract fields from a JSON document stored in VARCHAR columns.

`json_extract(doc, json_path)::datatype`

Note that if an extraction datatype isn't specified immediately, the field
is extracted as a VARCHAR.

### Usage

This is an example query that extracts fields from a `trade_details` column
containing JSON documents.
   * It filters, keeping only trades made on NASDAQ.
   * Obtains the price and quantity fields.
   * Extracts the timestamp of the first execution for the trade.

```questdb-sql title="Example"
SELECT
    json_extract(trade_details, '$.quantity')::long quantity,
    json_extract(trade_details, '$.price')::double price,
    json_extract(trade_details, '$.executions[0].timestamp')::timestamp first_ex_ts
FROM
    trades
WHERE
    json_extract(trade_details, '$.exchange') == 'NASDAQ'
```

For reference, here is a sample JSON document that query above.

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
    "executed_value": 145000,
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
      "timestamp": "2023-07-12T11:30:00Z",
      "price": 145.00,
      "quantity": 300
    },
    {
      "timestamp": "2023-07-12T13:45:00Z",
      "price": 145.25,
      "quantity": 250
    },
    {
      "timestamp": "2023-07-12T15:15:00Z",
      "price": 145.50,
      "quantity": 250
    }
  ]
}
```

### JSON Path Syntax

We support a limited JSON Path syntax.
* `$` denotes the root of the document. Its use is optional and provided for
  compatibility with the JSON path standard and other databases: All search
  operations always start from the root.
* `.field` accesses a JSON object key.
* `[n]` accesses a JSON array index (where `n` is a number).

The path cannot be constructed dynamically (e.g. via string concatenation).

### Error Handling

Any errors will return NULL data when extracting to any datatype except
boolean and short, where these will return `false` and `0` respectively.

### Performance

Extracting fields from JSON documents provides flexibility, but comes at a
performance cost compared to storing fields directly in columns.

As a ballpark estimate, you should expect extracting a field from a JSON
document to be around one order of magnitude slower than extracting the same
data directly from a dedicated database column. As such, we suggest reserving
use of JSON for when the requirement of handling multiple data fields flexibly
outweighs the performance benefits.

JSON offers an opportunity to capture a wide range of details early
in the design process of a solution (while it is yet unclear which fields may
be most valuable), to then modify the database schema later to extract more
frequently accessed fields as first-class columns.

Extending the previous example, we can add `price` and `quantity` columns to 
the pre-existing `trades` table as so:

```questdb-sql title="Extracting JSON to a new column"
ALTER TABLE trades ADD COLUMN quantity long;
ALTER TABLE trades ADD COLUMN price double;
UPDATE trades SET quantity = json_extract(trade_details, '$.quantity')::long;
UPDATE trades SET price = json_extract(trade_details, '$.price')::double;
```
