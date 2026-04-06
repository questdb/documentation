---
title: UNNEST keyword
sidebar_label: UNNEST
description:
  Reference documentation for UNNEST, which expands arrays and JSON arrays
  into rows in QuestDB.
---

UNNEST expands arrays or JSON arrays into rows - one row per element. This
allows you to filter by individual element values, run aggregations or window
functions over array contents, or join array elements with other tables. It
supports two modes:

- **[Array `UNNEST`](#array-unnest)**: Expands native `DOUBLE[]` columns (or literal arrays) into
  rows of `DOUBLE` values.
- **[JSON `UNNEST`](#json-unnest)**: Expands a JSON array stored as `VARCHAR` into rows with
  explicitly typed columns.

`UNNEST` appears in the `FROM` clause and behaves like a table - you can join it
with other tables, filter its output with `WHERE`, and use it in CTEs and
subqueries.

## Array UNNEST

### Syntax

```questdb-sql
SELECT ...
FROM table_name, UNNEST(array_expr [, array_expr2 ...])
    [WITH ORDINALITY]
    [[AS] alias]
    [(col_alias1 [, col_alias2 ...])]
```

### Basic usage

Expand an array column into individual rows:

```questdb-sql title="Expand an array literal into rows" demo
SELECT value FROM UNNEST(ARRAY[1.0, 2.0, 3.0]);
```

| value |
| :---- |
| 1.0   |
| 2.0   |
| 3.0   |

### With a table

```questdb-sql title="Expand array column from a table" demo
SELECT t.symbol, u.vol
FROM market_data t, UNNEST(t.asks[2]) u(vol)
WHERE t.timestamp IN '$now-1m..$now'
  AND t.symbol = 'EURUSD';
```

You can also use `CROSS JOIN` - the behavior is identical to the comma syntax,
but can be clearer when the query also joins other tables:

```questdb-sql title="Equivalent CROSS JOIN syntax" demo
SELECT t.symbol, u.vol
FROM market_data t
CROSS JOIN UNNEST(t.asks[2]) u(vol)
WHERE t.timestamp IN '$now-1m..$now'
  AND t.symbol = 'EURUSD';
```

### WITH ORDINALITY

Add a 1-based index column that resets for each input row. The ordinality column
is always the last output column.

Since `ordinality` is a reserved keyword, either alias it or quote it as
`"ordinality"`:

```questdb-sql title="Array with position index" demo
SELECT u.val, u.pos
FROM UNNEST(ARRAY[10.0, 20.0, 30.0]) WITH ORDINALITY u(val, pos);
```

| val  | pos |
| :--- | :-- |
| 10.0 | 1   |
| 20.0 | 2   |
| 30.0 | 3   |

### Multiple arrays

Pass multiple arrays to a single `UNNEST`. Shorter arrays are padded with `NULL`:

```questdb-sql title="Two arrays side by side" demo
SELECT u.a, u.b
FROM UNNEST(ARRAY[1.0, 2.0, 3.0], ARRAY[10.0, 20.0]) u(a, b);
```

| a   | b    |
| :-- | :--- |
| 1.0 | 10.0 |
| 2.0 | 20.0 |
| 3.0 | NULL |

### Multidimensional arrays

`UNNEST` reduces dimensionality by one level. A `DOUBLE[][]` produces
`DOUBLE[]` elements:

```questdb-sql title="Unnest a 2D array into 1D rows" demo
SELECT value
FROM UNNEST(ARRAY[ARRAY[1.0, 2.0], ARRAY[3.0, 4.0]]);
```

| value     |
| :-------- |
| [1.0,2.0] |
| [3.0,4.0] |

### Chained UNNEST

To fully flatten a multidimensional array into individual scalars, chain
multiple `UNNEST` calls in the `FROM` clause. Each one reduces dimensionality
by one level:

```questdb-sql title="Fully flatten a 2D array" demo
SELECT u.val
FROM UNNEST(ARRAY[ARRAY[1.0, 2.0], ARRAY[3.0, 4.0]]) t(arr),
     UNNEST(t.arr) u(val);
```

| val |
| :-- |
| 1.0 |
| 2.0 |
| 3.0 |
| 4.0 |

:::note

`UNNEST` cannot be nested as an expression. Writing
`UNNEST(UNNEST(...))` produces the error
*UNNEST cannot be used as an expression; use it in the FROM clause*. Use the
chained `FROM` clause syntax shown above instead.

:::

### Column aliases

Default column names are `value` for a single source or `value1`, `value2`, ...
for multiple sources. Override them with parenthesized aliases:

```questdb-sql title="Custom column name" demo
SELECT u.price FROM UNNEST(ARRAY[1.5, 2.5]) u(price);
```

### NULL and empty array handling

- `NULL` array: produces 0 rows
- Empty array: produces 0 rows
- `NULL` elements within an array: preserved as `NULL` in the output

## JSON UNNEST

JSON `UNNEST` expands a JSON array (stored as `VARCHAR`) into rows with
explicitly typed columns. The `COLUMNS(...)` clause distinguishes JSON `UNNEST`
from array `UNNEST`.

### Syntax

```questdb-sql
SELECT ...
FROM table_name, UNNEST(
    varchar_expr COLUMNS(col_name TYPE [, col_name TYPE ...])
) [WITH ORDINALITY] [[AS] alias] [(col_alias1, ...)]
```

### Supported column types

`BOOLEAN`, `SHORT`, `INT`, `LONG`, `DOUBLE`, `VARCHAR`, `TIMESTAMP`

### Object arrays

Extract typed fields from an array of JSON objects. Column names in `COLUMNS()`
are used as JSON field names for extraction.

This example uses the response format from the
[Coinbase trades API](https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=3):

```questdb-sql title="Extract fields from a Coinbase trades response"
SELECT u.trade_id, u.price, u.size, u.side, u.time
FROM UNNEST(
    '[{"trade_id":994619709,"side":"sell","size":"0.00000100","price":"69839.36000000","time":"2026-04-06T10:32:55.517183Z"},
      {"trade_id":994619708,"side":"buy","size":"0.00000006","price":"69839.35000000","time":"2026-04-06T10:32:55.418434Z"},
      {"trade_id":994619707,"side":"buy","size":"0.00000006","price":"69839.35000000","time":"2026-04-06T10:32:55.024765Z"}]'::VARCHAR
    COLUMNS(trade_id LONG, price DOUBLE, size DOUBLE, side VARCHAR, time TIMESTAMP)
) u;
```

| trade_id | price | size | side | time |
| :--- | :--- | :--- | :--- | :--- |
| 994619709 | 69839.36 | 0.000001 | sell | 2026-04-06T10:32:55.517183Z |
| 994619708 | 69839.35 | 0.00000006 | buy | 2026-04-06T10:32:55.418434Z |
| 994619707 | 69839.35 | 0.00000006 | buy | 2026-04-06T10:32:55.024765Z |

### Scalar arrays

When `COLUMNS()` declares a single column and the JSON array contains scalars
(not objects), each element is extracted directly:

```questdb-sql title="Scalar JSON array" demo
SELECT u.val
FROM UNNEST('[1.5, 2.5, 3.5]'::VARCHAR COLUMNS(val DOUBLE)) u;
```

| val |
| :-- |
| 1.5 |
| 2.5 |
| 3.5 |

### WITH ORDINALITY

Works the same as array `UNNEST` - alias the ordinality column as the last entry:

```questdb-sql title="JSON UNNEST with position index" demo
SELECT u.val, u.pos
FROM UNNEST(
    '[10, 20, 30]'::VARCHAR COLUMNS(val LONG)
) WITH ORDINALITY u(val, pos);
```

| val | pos |
| :-- | :-- |
| 10  | 1   |
| 20  | 2   |
| 30  | 3   |

### Timestamps

JSON string values are parsed using QuestDB's standard timestamp formats.
Numeric values are treated as microseconds since epoch:

```questdb-sql title="Timestamps from JSON strings" demo
SELECT u.ts, u.val
FROM UNNEST(
    '[{"ts":"2024-01-15T10:30:00.000000Z","val":1.5},
      {"ts":"2024-06-20T14:00:00.000000Z","val":2.5}]'::VARCHAR
    COLUMNS(ts TIMESTAMP, val DOUBLE)
) u;
```

| ts                          | val |
| :-------------------------- | :-- |
| 2024-01-15T10:30:00.000000Z | 1.5 |
| 2024-06-20T14:00:00.000000Z | 2.5 |

### Column aliasing

The names in `COLUMNS()` serve as both JSON field names and default output column
names. Override the output names with aliases after the table alias:

```questdb-sql title="JSON field 'price' output as 'cost'" demo
SELECT u.cost
FROM UNNEST(
    '[{"price":1.5},{"price":2.5}]'::VARCHAR
    COLUMNS(price DOUBLE)
) u(cost);
```

### Nested JSON arrays

Use `json_extract()` to reach a nested JSON array before unnesting:

```questdb-sql title="Unnest a nested JSON array"
SELECT u.price
FROM events e, UNNEST(
    json_extract(e.payload, '$.items')::VARCHAR
    COLUMNS(price DOUBLE)
) u;
```

### NULL and invalid input handling

| Input | Result |
| :---- | :----- |
| `NULL` VARCHAR | 0 rows |
| Empty string | 0 rows |
| Invalid JSON | 0 rows (no error) |
| Empty array `[]` | 0 rows |
| `null` element | `NULL` for all columns (except `BOOLEAN` which returns `false`) |
| Missing field in object | `NULL` for that column (except `BOOLEAN` which returns `false`) |

### Type coercion

When a JSON value does not match the declared column type, the result is `NULL`
(except `BOOLEAN`, which defaults to `false`):

```questdb-sql title="Missing fields produce NULL" demo
SELECT u.a, u.b
FROM UNNEST(
    '[{"a":1},{"a":2,"b":99},{"a":null}]'::VARCHAR
    COLUMNS(a INT, b INT)
) u;
```

| a    | b    |
| :--- | :--- |
| 1    | NULL |
| 2    | 99   |
| NULL | NULL |

## Common patterns

### Filter unnested rows

```questdb-sql title="Filter by unnested value" demo
SELECT t.symbol, u.vol
FROM market_data t, UNNEST(t.asks[2]) u(vol)
WHERE t.timestamp IN '$now-1m..$now'
  AND t.symbol = 'EURUSD'
  AND u.vol > 100.0
ORDER BY t.timestamp;
```

### Aggregate unnested values

```questdb-sql title="Total ask volume per symbol" demo
SELECT t.symbol, sum(u.vol) AS total_ask_vol
FROM market_data t, UNNEST(t.asks[2]) u(vol)
WHERE t.timestamp IN '$now-1m..$now'
GROUP BY t.symbol;
```

### CTE with UNNEST

```questdb-sql title="Wrap UNNEST in a CTE for further processing" demo
WITH expanded AS (
    SELECT m.symbol, m.timestamp, u.vol, u.level
    FROM market_data m, UNNEST(m.asks[2]) WITH ORDINALITY u(vol, level)
    WHERE m.timestamp IN '$now-1m..$now'
      AND m.symbol = 'EURUSD'
)
SELECT symbol, level, avg(vol) AS avg_vol
FROM expanded
GROUP BY symbol, level
ORDER BY symbol, level;
```

## Limitations

- **`FROM` clause only**: `UNNEST` cannot appear in the `SELECT` list. Use
  `SELECT * FROM UNNEST(...)` instead.
- **Array types**: Only `DOUBLE[]` is currently supported as a native array
  column type. Array literals like `ARRAY[1.0, 2.0]` produce `DOUBLE[]`.
- **COLUMNS requires VARCHAR**: The `COLUMNS(...)` clause is for JSON (VARCHAR)
  sources only. Using it with a typed array produces an error.
- **No nested dot paths in COLUMNS**: Column names like `foo.bar` are not
  supported in `COLUMNS()`. Use `json_extract()` to reach nested paths first.
- **VARCHAR field size limit**: Individual `VARCHAR` and `TIMESTAMP` field values
  extracted from JSON are limited to 4096 bytes per field by default. If your
  JSON contains large string fields (log messages, descriptions, etc.), increase
  the
  [`cairo.json.unnest.max.value.size`](/docs/configuration/overview/#cairo-engine)
  server property. Each VARCHAR/TIMESTAMP column allocates
  `2 x maxValueSize` bytes of native memory per active UNNEST cursor, so
  increase with care.

:::info Related documentation
- [`array_agg`](/docs/query/functions/aggregation/#array_agg) - Collect rows into arrays (inverse of Array UNNEST)
- [Array functions](/docs/query/functions/array/)
- [JSON functions](/docs/query/functions/json/)
- [SELECT](/docs/query/sql/select/)
:::
