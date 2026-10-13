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
CREATE [ OR REPLACE ] VIEW [ IF NOT EXISTS ] viewName AS ( query )
    [ WITH AUDIT ] [ OWNED BY ownerName ]
```

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `IF NOT EXISTS` | Prevents error if view already exists |
| `OR REPLACE` | Replaces existing view or creates new one |
| `viewName` | Name of the view (case-insensitive, Unicode supported) |
| `query` | SELECT statement defining the view |
| `WITH AUDIT` | Enterprise only. Records each read of the view in an audit trail. See [WITH AUDIT](#with-audit-enterprise) |
| `OWNED BY` | Enterprise only. Assigns the view's owner. See [OWNED BY](#owned-by-enterprise) |

`WITH AUDIT` and `OWNED BY` may appear in either order.

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

By default, `DECLARE` variables are **non-overridable**. Users querying the view
cannot change the parameter value:

```questdb-sql title="Create a view with non-overridable parameter"
CREATE VIEW filtered_trades AS (
  DECLARE @min_price := 100
  SELECT ts, symbol, price FROM trades WHERE price >= @min_price
)
```

Query uses the default parameter value:

```questdb-sql
SELECT * FROM filtered_trades
-- Uses @min_price = 100
```

Attempting to override a non-overridable parameter will fail:

```questdb-sql
-- This fails with "variable is not overridable: @min_price"
DECLARE @min_price := 500 SELECT * FROM filtered_trades
```

### DECLARE with OVERRIDABLE

Use the `OVERRIDABLE` keyword to allow users to override the parameter at query
time:

```questdb-sql title="Create view with overridable parameter"
CREATE VIEW flexible_view AS (
  DECLARE OVERRIDABLE @min_value := 0
  SELECT * FROM trades WHERE value >= @min_value
)
```

Users can now override the parameter:

```questdb-sql
-- Override the default value
DECLARE @min_value := 100 SELECT * FROM flexible_view
```

### Multiple overridable parameters

```questdb-sql title="View with multiple overridable parameters"
CREATE VIEW price_range AS (
  DECLARE OVERRIDABLE @lo := 100, OVERRIDABLE @hi := 1000
  SELECT ts, symbol, price FROM trades
  WHERE price >= @lo AND price <= @hi
)

-- Override one or both parameters
DECLARE @lo := 50, @hi := 200 SELECT * FROM price_range
```

### Mixed overridable and non-overridable parameters

```questdb-sql title="View with mixed parameter types"
CREATE VIEW mixed_params AS (
  DECLARE @fixed := 5, OVERRIDABLE @adjustable := 10
  SELECT * FROM data WHERE a >= @fixed AND b <= @adjustable
)

-- @adjustable can be overridden, @fixed cannot
DECLARE @adjustable := 20 SELECT * FROM mixed_params  -- OK
DECLARE @fixed := 0 SELECT * FROM mixed_params        -- ERROR: variable is not overridable: @fixed
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
| `circular dependency detected` | View would create circular reference |
| `variable is not overridable` | Attempted to override a non-`OVERRIDABLE` DECLARE variable |
| `Access denied [AUDIT VIEW]` | `WITH AUDIT`, or a replacement of an audited view, without the `AUDIT VIEW` permission (Enterprise) |
| `cannot audit an existing view, drop and re-create it WITH AUDIT` | `CREATE OR REPLACE VIEW ... WITH AUDIT` over a view that is not audited (Enterprise) |
| `unexpected token [WITH]` | `WITH AUDIT` on QuestDB Open Source, which does not support audited views |

## View naming

View names follow the same rules as table names:

- Case-insensitive
- Unicode characters supported
- Cannot be the same as an existing table or materialized view name
- Reserved SQL keywords require quoting

```questdb-sql title="Quoting reserved words"
CREATE VIEW 'select' AS (...)    -- Quoted reserved word
CREATE VIEW 'My View' AS (...)   -- Quoted name with spaces
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
OWNED BY 'analysts';
```

## WITH AUDIT (Enterprise)

`WITH AUDIT` makes the view an [audited view](/docs/security/audited-views/):
each read of it records a row in `sys.view_audit`, with the principal, the
time, and the resolved values of the variables the view declares `AUDITED`.
Recording is best-effort, so under overload a row can be lost: see
[Delivery guarantees](/docs/security/audited-views/#delivery).

```questdb-sql title="Create an audited view"
CREATE VIEW trades_by_symbol AS (
  DECLARE
    OVERRIDABLE AUDITED @symbols := ('BTC-USDT', 'ETH-USDT'),
    AUDITED @since := dateadd('h', -1, now())
  SELECT timestamp, symbol, side, price, amount
  FROM trades
  WHERE symbol IN @symbols AND timestamp >= @since
) WITH AUDIT;
```

Creating a view `WITH AUDIT` requires the `AUDIT VIEW` permission in addition
to `CREATE VIEW` and `SELECT` on the tables the view reads. The view stays
audited through `ALTER VIEW` and `CREATE OR REPLACE VIEW`, which also require
`AUDIT VIEW` over an audited view, and `SELECT` on the tables the new body
reads. Reads of the view need only `SELECT` on the view, so the creator's
`SELECT` on the tables can be revoked once the view exists: see
[Audited views](/docs/security/audited-views/#quick-start). To audit an
existing view, drop it and create it again.

Over an existing view, `CREATE OR REPLACE VIEW` accepts `WITH AUDIT` only when
the view is already audited. There the body is replaced as usual, the view
stays audited, and `WITH AUDIT` adds nothing, so the statement that created the
view can run again. Over a view that is not audited, it fails with
`cannot audit an existing view, drop and re-create it WITH AUDIT`.
`CREATE OR REPLACE VIEW` over an existing view does not accept `OWNED BY`, so a
statement that uses it cannot run again.

`CREATE VIEW IF NOT EXISTS ... WITH AUDIT` does nothing when a view of that
name exists, even one that is not audited, and reports success. Check with
[`SHOW CREATE VIEW`](/docs/query/sql/show/#show-create-view), which shows
`WITH AUDIT` after the body of an audited view.

## See also

- [Views concept](/docs/concepts/views/)
- [ALTER VIEW](/docs/query/sql/alter-view/)
- [DROP VIEW](/docs/query/sql/drop-view/)
- [COMPILE VIEW](/docs/query/sql/compile-view/)
- [DECLARE](/docs/query/sql/declare/)
- [Audited views](/docs/security/audited-views/)
