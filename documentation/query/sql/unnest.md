---
title: UNNEST keyword
sidebar_label: UNNEST
description:
  Reference documentation for UNNEST, which expands arrays and JSON arrays
  into rows in QuestDB.
---

UNNEST expands arrays or JSON arrays into rows - one row per element. It
supports two modes:

- **Array UNNEST**: Expands native `DOUBLE[]` columns (or literal arrays) into
  rows of `DOUBLE` values.
- **JSON UNNEST**: Expands a JSON array stored as `VARCHAR` into rows with
  explicitly typed columns.

UNNEST appears in the `FROM` clause and behaves like a table - you can join it
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

```questdb-sql title="Expand an array literal into rows"
SELECT value FROM UNNEST(ARRAY[1.0, 2.0, 3.0]);
```

| value |
| :---- |
| 1.0   |
| 2.0   |
| 3.0   |

### With a table

```questdb-sql title="Expand array column from a table"
SELECT t.symbol, u.size
FROM market_data t, UNNEST(t.bid_sizes) u(size);
```

You can also use `CROSS JOIN` - the behavior is identical to the comma syntax:

```questdb-sql title="Equivalent CROSS JOIN syntax"
SELECT t.symbol, u.size
FROM market_data t
CROSS JOIN UNNEST(t.bid_sizes) u(size);
```

### WITH ORDINALITY

Add a 1-based index column that resets for each input row. The ordinality column
is always the last output column.

Since `ordinality` is a reserved keyword, either alias it or quote it as
`"ordinality"`:

```questdb-sql title="Array with position index"
SELECT u.val, u.pos
FROM UNNEST(ARRAY[10.0, 20.0, 30.0]) WITH ORDINALITY u(val, pos);
```

| val  | pos |
| :--- | :-- |
| 10.0 | 1   |
| 20.0 | 2   |
| 30.0 | 3   |

### Multiple arrays

Pass multiple arrays to a single UNNEST. Shorter arrays are padded with `NULL`:

```questdb-sql title="Two arrays side by side"
SELECT u.a, u.b
FROM UNNEST(ARRAY[1.0, 2.0, 3.0], ARRAY[10.0, 20.0]) u(a, b);
```

| a   | b    |
| :-- | :--- |
| 1.0 | 10.0 |
| 2.0 | 20.0 |
| 3.0 | NULL |

### Multidimensional arrays

Unnesting reduces dimensionality by one level. A `DOUBLE[][]` produces
`DOUBLE[]` elements:

```questdb-sql title="Unnest a 2D array into 1D rows"
SELECT value
FROM UNNEST(ARRAY[ARRAY[1.0, 2.0], ARRAY[3.0, 4.0]]);
```

| value     |
| :-------- |
| [1.0,2.0] |
| [3.0,4.0] |

### Column aliases

Default column names are `value` for a single source or `value1`, `value2`, ...
for multiple sources. Override them with parenthesized aliases:

```questdb-sql title="Custom column name"
SELECT u.price FROM UNNEST(ARRAY[1.5, 2.5]) u(price);
```

### NULL and empty array handling

- `NULL` array: produces 0 rows
- Empty array: produces 0 rows
- `NULL` elements within an array: preserved as `NULL` in the output

## JSON UNNEST

JSON UNNEST expands a JSON array (stored as `VARCHAR`) into rows with explicitly
typed columns. The `COLUMNS(...)` clause distinguishes JSON UNNEST from array
UNNEST.

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
are used as JSON field names for extraction:

```questdb-sql title="Extract fields from JSON objects"
SELECT u.name, u.age
FROM UNNEST(
    '[{"name":"Alice","age":30},{"name":"Bob","age":25}]'::VARCHAR
    COLUMNS(name VARCHAR, age INT)
) u;
```

| name  | age |
| :---- | :-- |
| Alice | 30  |
| Bob   | 25  |

### Scalar arrays

When `COLUMNS()` declares a single column and the JSON array contains scalars
(not objects), each element is extracted directly:

```questdb-sql title="Scalar JSON array"
SELECT u.val
FROM UNNEST('[1.5, 2.5, 3.5]'::VARCHAR COLUMNS(val DOUBLE)) u;
```

| val |
| :-- |
| 1.5 |
| 2.5 |
| 3.5 |

### WITH ORDINALITY

Works the same as array UNNEST - alias the ordinality column as the last entry:

```questdb-sql title="JSON UNNEST with position index"
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

```questdb-sql title="Timestamps from JSON strings"
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

```questdb-sql title="JSON field 'price' output as 'cost'"
SELECT u.cost
FROM UNNEST(
    '[{"price":1.5},{"price":2.5}]'::VARCHAR
    COLUMNS(price DOUBLE)
) u(cost);
```

### With json_extract()

Use `json_extract()` to reach nested JSON paths before unnesting:

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

```questdb-sql title="Missing fields produce NULL"
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

```questdb-sql title="Filter by unnested value"
SELECT t.symbol, u.size
FROM market_data t, UNNEST(t.bid_sizes) u(size)
WHERE u.size > 100.0
ORDER BY t.timestamp;
```

### Aggregate unnested values

```questdb-sql title="Total bid size per symbol"
SELECT t.symbol, sum(u.size) AS total_bid_size
FROM market_data t, UNNEST(t.bid_sizes) u(size)
GROUP BY t.symbol;
```

### Aggregate JSON array fields

```questdb-sql title="Sum quantities from JSON per event"
SELECT e.id, sum(u.qty) AS total_qty
FROM events e, UNNEST(
    e.payload COLUMNS(qty INT)
) u
GROUP BY e.id;
```

### CTE with UNNEST

```questdb-sql title="Wrap UNNEST in a CTE for further processing"
WITH expanded AS (
    SELECT m.symbol, m.timestamp, u.size, u.level
    FROM market_data m, UNNEST(m.bid_sizes) WITH ORDINALITY u(size, level)
)
SELECT symbol, level, avg(size) AS avg_size
FROM expanded
GROUP BY symbol, level
ORDER BY symbol, level;
```

### DISTINCT on unnested values

```questdb-sql title="Unique values from an array column"
SELECT DISTINCT u.val
FROM t, UNNEST(t.arr) u(val)
ORDER BY u.val;
```

## Limitations

- **FROM clause only**: UNNEST cannot appear in the `SELECT` list. Use
  `SELECT * FROM UNNEST(...)` instead.
- **Array types**: Only `DOUBLE[]` is currently supported as a native array
  column type. Array literals like `ARRAY[1.0, 2.0]` produce `DOUBLE[]`.
- **COLUMNS requires VARCHAR**: The `COLUMNS(...)` clause is for JSON (VARCHAR)
  sources only. Using it with a typed array produces an error.
- **No nested dot paths in COLUMNS**: Column names like `foo.bar` are not
  supported in `COLUMNS()`. Use `json_extract()` to reach nested paths first.
- **VARCHAR field size limit**: Individual `VARCHAR` and `TIMESTAMP` field values
  extracted from JSON are limited to 4096 bytes per field.

:::info Related documentation
- [Array functions](/docs/query/functions/array/)
- [JSON functions](/docs/query/functions/json/)
- [SELECT](/docs/query/sql/select/)
:::
