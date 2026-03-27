---
title: CREATE PAYLOAD TRANSFORM
sidebar_label: CREATE PAYLOAD TRANSFORM
description:
  Documentation for the CREATE PAYLOAD TRANSFORM SQL keyword in QuestDB.
---

Creates a payload transform that defines how incoming HTTP payloads are parsed,
transformed, and inserted into a target table. Once created, data is ingested by
POSTing to the [`/ingest` endpoint](/docs/ingestion/payload-transforms/#http-endpoint).

## Syntax

```
CREATE [ OR REPLACE ] PAYLOAD TRANSFORM transformName
INTO targetTable
[ DLQ dlqTable [ PARTITION BY ( YEAR | MONTH | WEEK | DAY | HOUR ) ] [ TTL n timeUnit ] ]
AS [ DECLARE [ OVERRIDABLE ] @var := value [, [ OVERRIDABLE ] @var2 := value2 ... ] ]
SELECT ...
```

Where:
- `timeUnit`: `HOURS | DAYS | WEEKS | MONTHS | YEARS`
- The `SELECT` must not reference existing tables - it can only use functions
  and expressions, including CTEs

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `transformName` | Name for the payload transform |
| `OR REPLACE` | Replace existing transform with the same name |
| `targetTable` | Table to insert rows into |
| `DLQ dlqTable` | Route failed payloads to a dead-letter queue table |
| `PARTITION BY` | Partitioning unit for the DLQ table (if QuestDB creates it) |
| `TTL` | Retention period for DLQ rows |
| `DECLARE` | Define variables used in the SELECT |
| `OVERRIDABLE` | Allow variable to be overridden via URL query parameters |

## Column mapping

SELECT output column names must match column names in the target table. Columns
are matched by name, not position. You do not need to produce all columns - any
columns not included in the SELECT receive their default values.

## Examples

### Basic transform

```questdb-sql title="Create a table and a transform"
CREATE TABLE order_book (
    ts TIMESTAMP,
    symbol SYMBOL,
    bids DOUBLE[][],
    asks DOUBLE[][]
) TIMESTAMP(ts) PARTITION BY DAY WAL;

CREATE PAYLOAD TRANSFORM binance_depth
INTO order_book
AS DECLARE OVERRIDABLE @symbol := 'BTCUSDT'
SELECT
    now() AS ts,
    @symbol AS symbol,
    json_extract(payload(), '$.bids')::DOUBLE[][] AS bids,
    json_extract(payload(), '$.asks')::DOUBLE[][] AS asks;
```

### With dead-letter queue

```questdb-sql title="Transform with DLQ and 7-day retention"
CREATE PAYLOAD TRANSFORM binance_depth
INTO order_book
DLQ dlq_errors PARTITION BY DAY TTL 7 DAYS
AS DECLARE OVERRIDABLE @symbol := 'BTCUSDT'
SELECT
    now() AS ts,
    @symbol AS symbol,
    json_extract(payload(), '$.bids')::DOUBLE[][] AS bids,
    json_extract(payload(), '$.asks')::DOUBLE[][] AS asks;
```

### Replace an existing transform

```questdb-sql title="Replace a transform definition"
CREATE OR REPLACE PAYLOAD TRANSFORM binance_depth
INTO order_book
AS SELECT
    now() AS ts,
    'BTCUSDT' AS symbol,
    json_extract(payload(), '$.bids')::DOUBLE[][] AS bids,
    json_extract(payload(), '$.asks')::DOUBLE[][] AS asks;
```

### Multiple overridable variables

```questdb-sql title="Two overridable variables with defaults"
CREATE PAYLOAD TRANSFORM sensor_ingest
INTO sensor_data
AS DECLARE OVERRIDABLE @source := 'default', OVERRIDABLE @region := 'us-east'
SELECT
    now() AS ts,
    @source AS source,
    @region AS region,
    json_extract(payload(), '$.temperature')::DOUBLE AS temperature;
```

## Validation

QuestDB validates the transform at creation time:

| Check | Description |
| ----- | ----------- |
| Column names | Every SELECT output column must exist in the target table |
| Column types | Each output type must be convertible to the target column type, following `INSERT AS SELECT` rules |
| DLQ schema | If the DLQ table already exists, its schema must match the expected DLQ layout |

Validation errors report the position of the offending column expression in the
SELECT.

## Dead-letter queue schema

When a DLQ is configured and a transform error occurs, QuestDB writes a row with
the following columns:

| Column | Type | Description |
| :----- | :--- | :---------- |
| `ts` | TIMESTAMP | When the error occurred (designated timestamp) |
| `transform_name` | SYMBOL | Name of the transform that failed |
| `payload` | VARCHAR | The original HTTP body |
| `query` | VARCHAR | The transform's SELECT SQL |
| `stage` | SYMBOL | Processing stage where the error occurred |
| `error` | VARCHAR | Error message |

Multiple transforms can share the same DLQ table. The HTTP response still
returns an error so the caller knows the request failed.

## Permissions

| Context | Requirement |
| ------- | ----------- |
| Target table | The `/ingest` caller must have INSERT permission, checked at request time |
| DLQ table | The DDL caller must have INSERT permission, checked at creation time. Runtime DLQ writes use the system security context |

:::info Related documentation
- [DROP PAYLOAD TRANSFORM](/docs/query/sql/drop-payload-transform/)
- [Payload transforms overview](/docs/ingestion/payload-transforms/)
- [JSON functions](/docs/query/functions/json/)
:::
