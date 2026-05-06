---
title: Payload transforms
sidebar_label: Payload Transforms
description:
  Guide to payload transforms in QuestDB, which parse and insert HTTP payloads
  into tables using SQL expressions without middleware.
---

Payload transforms define how incoming HTTP payloads are parsed, transformed, and
inserted into a QuestDB table. You define a transform once with a SQL `SELECT`
expression, then POST data directly to QuestDB. The
[`payload()`](/docs/query/functions/meta/#payload) function provides access to
the raw HTTP request body within the transform. No middleware or intermediary
service is required.

Use cases include webhook ingestion, IoT device data, and external API responses
where you want to skip building a dedicated ingestion service.

For full SQL syntax, see
[CREATE PAYLOAD TRANSFORM](/docs/query/sql/create-payload-transform/),
[DROP PAYLOAD TRANSFORM](/docs/query/sql/drop-payload-transform/), and
[SHOW PAYLOAD TRANSFORMS](/docs/query/sql/show/#show-payload-transforms).

## Example: Coinbase order book snapshots

Store order book snapshots from the
[Coinbase book API](https://api.exchange.coinbase.com/products/BTC-USD/book?level=2).
With `level=2`, the API returns up to 50 aggregated price levels per side:

```json
{
  "sequence": 125688480181,
  "bids": [["69678.77","0.00007525",2], ["69676.36","0.00000022",1], ...],
  "asks": [["69678.78","0.35468555",6], ["69679.99","0.00071759",1], ...],
  "time": "2026-04-06T11:52:14.454632476Z",
  "auction_mode": false
}
```

Each bid/ask entry contains the price, quantity, and number of orders at that
level. The `time` field provides a nanosecond-precision exchange timestamp.

Create a target table with full depth arrays plus top-of-book prices, and a
transform that extracts them from the payload:

```questdb-sql title="Table and transform definition"
CREATE TABLE coinbase_order_book (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    bids DOUBLE[][],
    asks DOUBLE[][],
    best_bid DOUBLE,
    best_ask DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY WAL;

CREATE PAYLOAD TRANSFORM coinbase_book_api
INTO coinbase_order_book
DLQ dlq_errors PARTITION BY DAY TTL 7 DAYS
AS DECLARE OVERRIDABLE @symbol := 'BTC-USD'
SELECT
    json_extract(payload(), '$.time')::TIMESTAMP AS timestamp,
    @symbol AS symbol,
    json_extract(payload(), '$.bids')::DOUBLE[][] AS bids,
    json_extract(payload(), '$.asks')::DOUBLE[][] AS asks,
    json_extract(payload(), '$.bids[0][0]')::DOUBLE AS best_bid,
    json_extract(payload(), '$.asks[0][0]')::DOUBLE AS best_ask;
```

Fetch 50 levels of depth and ingest the snapshot:

```shell title="POST a payload"
curl -s "https://api.exchange.coinbase.com/products/BTC-USD/book?level=2" | \
  curl -X POST "http://localhost:9000/ingest?transform=coinbase_book_api" -d @-
```

Response:

```json
{"status": "ok", "rows_inserted": 1}
```

### Overriding variables

The `@symbol` variable is declared `OVERRIDABLE`, so you can override it per
request via URL query parameters:

```shell title="Override a variable"
curl -s "https://api.exchange.coinbase.com/products/ETH-USD/book?level=2" | \
  curl -X POST "http://localhost:9000/ingest?transform=coinbase_book_api&symbol=ETH-USD" -d @-
```

Any URL query parameter other than `transform` is matched to a
`DECLARE OVERRIDABLE` variable by name. Variables not marked `OVERRIDABLE`
cannot be overridden - attempting to do so returns an error.

## Example: Coinbase trades with UNNEST

The [Coinbase trades API](https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=100)
returns a JSON array of recent trades.

```json
[
  {"trade_id": 994619709, "side": "sell", "size": "0.00000100",
   "price": "69839.36000000", "time": "2026-04-06T10:32:55.517183Z"},
  {"trade_id": 994619708, "side": "buy", "size": "0.00000006",
   "price": "69839.35000000", "time": "2026-04-06T10:32:55.418434Z"},
  ...
]
```

The transform uses [JSON UNNEST](/docs/query/sql/unnest/#json-unnest) to expand
the array into individual rows, one per trade. Each request may return trades
already seen in a previous request, so the target table enables
[deduplication](/docs/concepts/deduplication/) to handle overlapping results
safely:

```questdb-sql title="Table with deduplication and transform"
CREATE TABLE coinbase_trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    trade_id LONG,
    price DOUBLE,
    size DOUBLE,
    side SYMBOL
) TIMESTAMP(timestamp) PARTITION BY DAY WAL
DEDUP UPSERT KEYS(timestamp, symbol, side);

CREATE PAYLOAD TRANSFORM coinbase_trades_api
INTO coinbase_trades
DLQ dlq_errors PARTITION BY DAY TTL 7 DAYS
AS DECLARE OVERRIDABLE @symbol := 'BTC-USD'
SELECT
    u.time AS timestamp,
    @symbol AS symbol,
    u.trade_id,
    u.price,
    u.size,
    u.side
FROM UNNEST(
    payload() COLUMNS(
        trade_id LONG,
        price DOUBLE,
        size DOUBLE,
        side VARCHAR,
        time TIMESTAMP
    )
) u;
```

Fetch the latest 100 trades and ingest them:

```shell title="Ingest trades"
curl -s "https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=100" | \
  curl -X POST "http://localhost:9000/ingest?transform=coinbase_trades_api" -d @-
```

If any trades were already ingested from a previous request, deduplication
discards the duplicates automatically.

### Inspecting failed payloads

When a payload fails (bad JSON, type mismatch, missing columns), QuestDB writes
the original payload, the error stage, and the error message to the DLQ table
configured in the transform:

```questdb-sql title="Query the DLQ"
SELECT ts, transform_name, stage, error FROM dlq_errors;
```

| ts | transform_name | stage | error |
| :--- | :--- | :--- | :--- |
| 2026-03-23T14:00:00.000000Z | coinbase_book_api | transform | column not found in target table [column=extra] |
| 2026-03-23T14:01:00.000000Z | coinbase_trades_api | transform | bad JSON payload |

Multiple transforms can share the same DLQ table. See
[CREATE PAYLOAD TRANSFORM](/docs/query/sql/create-payload-transform/#dead-letter-queue-schema)
for the full DLQ schema.

## HTTP endpoint

**POST** `/ingest`

### Query parameters

| Parameter | Required | Description |
| :--- | :--- | :--- |
| `transform` | Yes | Name of the payload transform to execute |
| Any other | No | Overrides a `DECLARE OVERRIDABLE` variable by name |

The request body is the raw payload, accessible via
[`payload()`](/docs/query/functions/meta/#payload) in the transform SQL.

### Responses

Success:

```json
{"status": "ok", "rows_inserted": 1}
```

Error:

```json
{"status": "error", "message": "..."}
```

## Permissions

In QuestDB Open Source, any user with access to the HTTP endpoint can create
transforms and invoke `/ingest`.

:::note Enterprise

In [QuestDB Enterprise](/enterprise/) deployments with
[RBAC](/docs/security/rbac/) enabled, the following grants are required:

| Action | Required grants |
| :----- | :-------------- |
| Create a transform | `CREATE PAYLOAD TRANSFORM` and `INSERT` on the target table (and DLQ table, if configured) |
| Replace a transform (`OR REPLACE`) | `CREATE PAYLOAD TRANSFORM` and `DROP PAYLOAD TRANSFORM` |
| Drop a transform | `DROP PAYLOAD TRANSFORM` |
| Invoke `/ingest` | `HTTP` endpoint grant and `INSERT` on the target table |

```questdb-sql title="Typical Enterprise setup"
-- Admin who manages transforms
GRANT CREATE PAYLOAD TRANSFORM, DROP PAYLOAD TRANSFORM TO ingest_admin;
GRANT INSERT ON coinbase_order_book, coinbase_trades, dlq_errors TO ingest_admin;

-- Service account that calls /ingest
GRANT HTTP TO ingest_service;
GRANT INSERT ON coinbase_order_book, coinbase_trades TO ingest_service;
```

:::

## Request size limit

The `/ingest` endpoint rejects request bodies that exceed a configurable maximum
size. The default limit is 5 MB. To change it, set the
`http.ingest.max.request.size` property in `server.conf`:

```ini title="server.conf"
http.ingest.max.request.size=10M
```

Requests exceeding the limit receive an HTTP 413 (Payload Too Large) response.
The entire request body is held in memory during processing, so set this limit
based on available memory and expected payload sizes.

## Limitations

- **Single payload per request** - Each HTTP request executes the transform
  once. That execution may produce multiple rows. Sending multiple
  independent payload documents in a single request is not supported.
- **Per-request SQL compilation** - Transform SQL is compiled on every request.
  This is acceptable for low-rate ingestion workloads. Compiled-plan caching is
  a planned optimization.
- **No table references** - The transform SELECT must not reference existing
  tables. It can only use functions and expressions, including CTEs.
- **SELECT only** - Only `SELECT` statements are allowed. `INSERT`, `UPDATE`,
  and other statements are rejected at creation time.
- **Schema drift** - Column names and types are validated against the target
  table at creation time. Schema changes to the target table after creating a
  transform may cause runtime errors.
- **Concurrent DDL** - `CREATE`, `DROP`, and `OR REPLACE` for the same
  transform name are not serialized. If two sessions operate on the same
  transform name concurrently, the outcome is last-writer-wins.

:::info Related documentation
- [CREATE PAYLOAD TRANSFORM](/docs/query/sql/create-payload-transform/)
- [DROP PAYLOAD TRANSFORM](/docs/query/sql/drop-payload-transform/)
- [SHOW PAYLOAD TRANSFORMS](/docs/query/sql/show/#show-payload-transforms)
- [UNNEST](/docs/query/sql/unnest/)
- [`payload()` function](/docs/query/functions/meta/#payload)
- [JSON functions](/docs/query/functions/json/)
- [REST API](/docs/query/rest-api/)
- [Role-Based Access Control (RBAC)](/docs/security/rbac/)
:::
