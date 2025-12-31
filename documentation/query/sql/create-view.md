---
title: CREATE VIEW
sidebar_label: CREATE VIEW
description: Documentation for the CREATE VIEW SQL keyword in QuestDB.
---

Creates a new view in the database. A view is a virtual table defined by a SQL
`SELECT` statement that does not store data itself.

For more information on views, see the [Views](/docs/concepts/views/)
documentation.

## Syntax

```questdb-sql
CREATE [ OR REPLACE ] VIEW [ IF NOT EXISTS ] view_name AS ( query )
```

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `IF NOT EXISTS` | Prevents error if view already exists |
| `OR REPLACE` | Replaces existing view or creates new one |
| `view_name` | Name of the view (case-insensitive, Unicode supported) |
| `query` | SELECT statement defining the view |

## Examples

### Basic view

```questdb-sql title="Create a simple view"
CREATE VIEW my_view AS (
  SELECT ts, symbol, price FROM trades
)
```

### View with aggregation

```questdb-sql title="Create a view with SAMPLE BY"
CREATE VIEW hourly_ohlc AS (
  SELECT
    ts,
    symbol,
    first(price) as open,
    max(price) as high,
    min(price) as low,
    last(price) as close,
    sum(quantity) as volume
  FROM trades
  SAMPLE BY 1h
)
```

### View with filtering

```questdb-sql title="Create a view with WHERE clause"
CREATE VIEW high_value_trades AS (
  SELECT ts, symbol, price, quantity
  FROM trades
  WHERE price * quantity > 10000
)
```

### View with JOIN

```questdb-sql title="Create a view with JOIN"
CREATE VIEW enriched_trades AS (
  SELECT t.ts, t.symbol, t.price, m.company_name
  FROM trades t
  JOIN metadata m ON t.symbol = m.symbol
)
```

### View with UNION

```questdb-sql title="Create a view with UNION"
CREATE VIEW all_markets AS (
  SELECT ts, symbol, price FROM nyse_trades
  UNION ALL
  SELECT ts, symbol, price FROM nasdaq_trades
)
```

### IF NOT EXISTS

```questdb-sql title="Create view only if it doesn't exist"
CREATE VIEW IF NOT EXISTS price_view AS (
  SELECT symbol, last(price) as price FROM trades SAMPLE BY 1h
)
```

### OR REPLACE

```questdb-sql title="Create or replace existing view"
CREATE OR REPLACE VIEW price_view AS (
  SELECT symbol, last(price) as price, ts FROM trades SAMPLE BY 1h
)
```

### Parameterized view with DECLARE

```questdb-sql title="Create a parameterized view"
CREATE VIEW filtered_trades AS (
  DECLARE @min_price := 100
  SELECT ts, symbol, price FROM trades WHERE price >= @min_price
)
```

Query with default parameter:

```questdb-sql
SELECT * FROM filtered_trades
-- Uses @min_price = 100
```

Override parameter at query time:

```questdb-sql
DECLARE @min_price := 500 SELECT * FROM filtered_trades
```

### DECLARE with CONST

```questdb-sql title="Create view with non-overridable parameter"
CREATE VIEW secure_view AS (
  DECLARE CONST @min_value := 0
  SELECT * FROM trades WHERE value >= @min_value
)
```

Attempting to override a CONST parameter will fail:

```questdb-sql
-- This fails with "cannot override CONST variable: @min_value"
DECLARE @min_value := -100 SELECT * FROM secure_view
```

### Multiple parameters

```questdb-sql title="View with multiple parameters"
CREATE VIEW price_range AS (
  DECLARE @lo := 100, @hi := 1000
  SELECT ts, symbol, price FROM trades
  WHERE price >= @lo AND price <= @hi
)

-- Override multiple parameters
DECLARE @lo := 50, @hi := 200 SELECT * FROM price_range
```

### Mixed CONST and non-CONST parameters

```questdb-sql title="View with mixed parameter types"
CREATE VIEW mixed_params AS (
  DECLARE CONST @fixed := 5, @adjustable := 10
  SELECT * FROM data WHERE a >= @fixed AND b <= @adjustable
)

-- @adjustable can be overridden, @fixed cannot
DECLARE @adjustable := 20 SELECT * FROM mixed_params  -- OK
DECLARE @fixed := 0 SELECT * FROM mixed_params        -- ERROR
```

### Unicode view name

```questdb-sql title="Create view with Unicode name"
CREATE VIEW 日本語ビュー AS (SELECT * FROM trades)
CREATE VIEW Részvény_árak AS (SELECT * FROM prices)
```

### Specifying timestamp column

When a view's result doesn't have an obvious designated timestamp, you can
specify one:

```questdb-sql title="Create view with explicit timestamp"
CREATE VIEW with_timestamp AS (
  (SELECT ts, value FROM my_view ORDER BY ts) timestamp(ts)
)
```

## Errors

| Error | Cause |
| ----- | ----- |
| `view already exists` | View exists and `IF NOT EXISTS` not specified |
| `table does not exist` | Referenced table doesn't exist |
| `Invalid column` | Column in query doesn't exist |
| `cycle detected` | View would create circular reference |

## View naming

View names follow the same rules as table names:

- Case-insensitive
- Unicode characters supported
- Cannot be the same as an existing table or materialized view name
- Reserved SQL keywords require quoting

```questdb-sql title="Quoting reserved words"
CREATE VIEW 'select' AS (...)  -- Quoted reserved word
CREATE VIEW "My View" AS (...)  -- Quoted name with spaces
```

## OWNED BY (Enterprise)

When a user creates a new view, they are automatically assigned all view level
permissions with the `GRANT` option for that view. This behavior can be
overridden using `OWNED BY`.

```questdb-sql
CREATE GROUP analysts;
CREATE VIEW trades_summary AS (
  SELECT ts, symbol, sum(quantity) as volume
  FROM trades
  SAMPLE BY 1h
)
OWNED BY analysts;
```

## See also

- [Views concept](/docs/concepts/views/)
- [ALTER VIEW](/docs/query/sql/alter-view/)
- [DROP VIEW](/docs/query/sql/drop-view/)
- [COMPILE VIEW](/docs/query/sql/compile-view/)
- [DECLARE](/docs/query/sql/declare/)
