---
title: Symbol
sidebar_label: Symbol
description:
  The SYMBOL data type in QuestDB stores repetitive strings efficiently,
  enabling fast filtering and grouping operations.
---

`SYMBOL` is a data type designed for columns with repetitive string values.
Internally, symbols use dictionary encoding—each unique string is stored once
in a lookup table, and rows store integer references to that table. This is
the same approach used by columnar formats like Parquet and Arrow. The result
is much faster filtering and grouping compared to regular strings.

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
- Columns with hundreds of millions of distinct values

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

<details>
<summary>Note for users upgrading from versions before 9.0.0</summary>

Prior to QuestDB 9.0.0, symbol capacity required manual configuration. You had
to estimate the number of distinct values upfront and set the capacity
explicitly. Undersizing caused performance issues; oversizing wasted memory.

From 9.0.0 onwards, symbol capacity is fully automatic. The `CAPACITY` setting
is now obsolete and can be removed from your table definitions.

</details>

## NOCACHE option

By default, QuestDB caches the symbol dictionary in memory for fast lookups.
For columns with very high cardinality (10 million+ distinct values), this
cache can consume significant memory.

Use `NOCACHE` to disable dictionary caching:

```questdb-sql
CREATE TABLE events (
    timestamp TIMESTAMP,
    high_cardinality_id SYMBOL NOCACHE,
    event_type SYMBOL
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

**Trade-off:** `NOCACHE` reduces memory usage but makes dictionary lookups
slower. Only use it for symbols with millions of distinct values where memory
is a concern.

To toggle caching on an existing column:

```questdb-sql
-- Disable cache
ALTER TABLE events ALTER COLUMN high_cardinality_id NOCACHE;

-- Re-enable cache
ALTER TABLE events ALTER COLUMN high_cardinality_id CACHE;
```

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

