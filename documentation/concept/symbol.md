---
title: Symbol
sidebar_label: Symbol
description:
  The SYMBOL data type in QuestDB stores repetitive strings efficiently,
  enabling fast filtering and grouping operations.
---

`SYMBOL` is a data type designed for columns with repetitive string values.
Internally, symbols are stored as integers mapped to strings, making them
much faster to filter and group than regular strings.

## When to use SYMBOL

Use `SYMBOL` for categorical data with a limited set of repeated values:

- Stock tickers (`AAPL`, `GOOGL`, `MSFT`)
- Country or region codes (`US`, `EU`, `APAC`)
- Status values (`pending`, `completed`, `failed`)
- Device or sensor IDs
- Any column frequently used in `WHERE` or `GROUP BY`

```questdb-sql
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,        -- Good: limited set of tickers
    side SYMBOL,          -- Good: just BUY/SELL
    price DOUBLE,
    quantity DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

## When to use VARCHAR instead

Use `VARCHAR` when values are unique or very high cardinality:

- User-generated text (comments, descriptions)
- Log messages
- UUIDs or unique identifiers (consider the `UUID` type instead)
- Columns with millions of distinct values

## Why SYMBOL is fast

| Operation | VARCHAR | SYMBOL |
|-----------|---------|--------|
| Storage | Full string per row | Integer + shared dictionary |
| Filtering (`WHERE symbol = 'X'`) | String comparison | Integer comparison |
| Grouping (`GROUP BY`) | String hashing | Integer grouping |
| Disk usage | Higher | Lower |

Symbols provide:
- **Faster queries** — integer comparisons instead of string operations
- **Lower storage** — strings stored once in a dictionary, rows store integers
- **Index support** — symbol columns can be indexed for even faster lookups

## Creating SYMBOL columns

```questdb-sql
CREATE TABLE events (
    timestamp TIMESTAMP,
    event_type SYMBOL,
    user_region SYMBOL,
    payload VARCHAR
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

Symbol capacity scales automatically as new values are added. No manual
configuration is needed.

## Indexing symbols

For columns frequently used in `WHERE` clauses, add an index:

```questdb-sql
CREATE TABLE events (
    timestamp TIMESTAMP,
    event_type SYMBOL INDEX,
    payload VARCHAR
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

Or add an index later:

```questdb-sql
ALTER TABLE events ALTER COLUMN event_type ADD INDEX;
```

See [Indexes](/docs/concept/indexes/) for more information.

