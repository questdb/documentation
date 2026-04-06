---
title: Payload transforms
sidebar_label: Payload Transforms
description:
  Guide to payload transforms in QuestDB, which parse and insert HTTP payloads
  into tables using SQL expressions without middleware.
---

Payload transforms define how incoming HTTP payloads are parsed, transformed, and
inserted into a QuestDB table. You define a transform once with a SQL `SELECT`
expression, then POST data directly to QuestDB. No middleware or intermediary
service is required.

Use cases include webhook ingestion, IoT device data, and external API responses
where you want to skip building a dedicated ingestion service.

For full SQL syntax, see
[CREATE PAYLOAD TRANSFORM](/docs/query/sql/create-payload-transform/) and
[DROP PAYLOAD TRANSFORM](/docs/query/sql/drop-payload-transform/).

## Example: Binance order book snapshots

Store order book snapshots from the Binance depth API. The API returns JSON
like:

```json
{
  "lastUpdateId": 124211219720,
  "bids": [["73577.91","0.05"], ["73575.00","1.20"]],
  "asks": [["73578.02","0.03"], ["73580.00","0.80"]]
}
```

The Binance depth endpoint returns the most recent order book snapshot but does
not include a timestamp. The transform uses `now()` to record the server
ingestion time as the designated timestamp.

Create a target table with full depth arrays plus top-of-book prices, and a
transform that extracts them from the payload:

```questdb-sql title="Table and transform definition"
CREATE TABLE binance_order_book (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    bids DOUBLE[][],
    asks DOUBLE[][],
    best_bid DOUBLE,
    best_ask DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY WAL;

CREATE PAYLOAD TRANSFORM binance_depth_api
INTO binance_order_book
DLQ dlq_errors PARTITION BY DAY TTL 7 DAYS
AS DECLARE OVERRIDABLE @symbol := 'BTCUSDT'
SELECT
    now() AS timestamp,
    @symbol AS symbol,
    json_extract(payload(), '$.bids')::DOUBLE[][] AS bids,
    json_extract(payload(), '$.asks')::DOUBLE[][] AS asks,
    json_extract(payload(), '$.bids[0][0]')::DOUBLE AS best_bid,
    json_extract(payload(), '$.asks[0][0]')::DOUBLE AS best_ask;
```

Ingest a snapshot:

```shell title="POST a payload"
curl -s "https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=5" | \
  curl -X POST "http://localhost:9000/ingest?transform=binance_depth_api" -d @-
```

Response:

```json
{"status": "ok", "rows_inserted": 1}
```

### Overriding variables

The `@symbol` variable is declared `OVERRIDABLE`, so you can override it per
request via URL query parameters:

```shell title="Override a variable"
curl -s "https://api.binance.com/api/v3/depth?symbol=ETHUSDT&limit=5" | \
  curl -X POST "http://localhost:9000/ingest?transform=binance_depth_api&symbol=ETHUSDT" -d @-
```

Any URL query parameter other than `transform` is matched to a
`DECLARE OVERRIDABLE` variable by name. Variables not marked `OVERRIDABLE`
cannot be overridden - attempting to do so returns an error.

### Inspecting failed payloads

When a payload fails (bad JSON, type mismatch, missing columns), QuestDB writes
the original payload, the error stage, and the error message to the DLQ table
configured in the transform:

```questdb-sql title="Query the DLQ"
SELECT ts, transform_name, stage, error FROM dlq_errors;
```

| ts | transform_name | stage | error |
| :--- | :--- | :--- | :--- |
| 2026-03-23T14:00:00.000000Z | binance_depth_api | transform | column not found in target table [column=extra] |
| 2026-03-23T14:01:00.000000Z | other_transform | transform | bad JSON payload |

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

The request body is the raw payload, accessible via `payload()` in the transform
SQL.

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
GRANT INSERT ON binance_order_book, dlq_errors TO ingest_admin;

-- Service account that calls /ingest
GRANT HTTP TO ingest_service;
GRANT INSERT ON binance_order_book TO ingest_service;
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
- [JSON functions](/docs/query/functions/json/)
- [REST API](/docs/query/rest-api/)
:::
