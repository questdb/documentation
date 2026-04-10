---
title: UNION EXCEPT INTERSECT keywords
sidebar_label: UNION EXCEPT INTERSECT
description: UNION, EXCEPT, and INTERSECT  SQL keyword reference documentation.
---

## Overview

`UNION`, `EXCEPT`, and `INTERSECT` perform set operations.

`UNION` is used to combine the results of two or more queries.

`EXCEPT` and `INTERSECT` return distinct rows by comparing the results of two
queries.

To work properly, all of the following must be true:

- Each query statement should return the same number of column.
- Each column to be combined should have data types that are either the same, or
  supported by `implicit cast`. For example, IPv4 columns can be combined with VARCHAR/STRING
  columns as they will be automatically cast. See [CAST](/docs/query/sql/cast/) for more
  information.
  - Example:
    ```questdb-sql
    select '1'::varchar as col from long_sequence(1)
    union all
    select '127.0.0.1'::ipv4 from long_sequence(1);
    ```

- Columns in each query statement should be in the same order.

## Syntax

```questdb-sql
query1 { UNION | EXCEPT | INTERSECT } [ALL] query2;
```

- `UNION` returns distinct results.
- `UNION ALL` returns all `UNION` results including duplicates.
- `EXCEPT` returns distinct rows from the left input query that are not returned
  by the right input query.
- `EXCEPT ALL` returns all `EXCEPT` results including duplicates.
- `INTERSECT` returns distinct rows that are returned by both input queries.
- `INTERSECT ALL` returns all `INTERSECT` results including duplicates.

## Examples

The examples below compare the symbols listed by two crypto exchanges. Set
operations let traders quickly answer questions like "which pairs are listed
on both exchanges?" (arbitrage candidates) or "which pairs are unique to one
exchange?" (single-venue exposure).

`binance_symbols`:

| symbol   | base | quote |
| -------- | ---- | ----- |
| BTCUSDT  | BTC  | USDT  |
| ETHUSDT  | ETH  | USDT  |
| SOLUSDT  | SOL  | USDT  |
| BNBUSDT  | BNB  | USDT  |
| AVAXUSDT | AVAX | USDT  |
| ADAUSDT  | ADA  | USDT  |
| BNBUSDT  | BNB  | USDT  |

Notice that the last row in `binance_symbols` is a duplicate of `BNBUSDT`.

`coinbase_symbols`:

| symbol   | base | quote |
| -------- | ---- | ----- |
| BTCUSDT  | BTC  | USDT  |
| ETHUSDT  | ETH  | USDT  |
| SOLUSDT  | SOL  | USDT  |
| XRPUSDT  | XRP  | USDT  |
| LTCUSDT  | LTC  | USDT  |
| LINKUSDT | LINK | USDT  |

### UNION

All distinct symbols available on either exchange:

```questdb-sql
binance_symbols UNION coinbase_symbols;
```

| symbol   | base | quote |
| -------- | ---- | ----- |
| BTCUSDT  | BTC  | USDT  |
| ETHUSDT  | ETH  | USDT  |
| SOLUSDT  | SOL  | USDT  |
| BNBUSDT  | BNB  | USDT  |
| AVAXUSDT | AVAX | USDT  |
| ADAUSDT  | ADA  | USDT  |
| XRPUSDT  | XRP  | USDT  |
| LTCUSDT  | LTC  | USDT  |
| LINKUSDT | LINK | USDT  |

`UNION` eliminates duplication even when one of the queries returns nothing.
For instance, filtering coinbase down to nothing still deduplicates Binance:

```questdb-sql
binance_symbols
UNION
coinbase_symbols WHERE base = 'NONEXISTENT';
```

| symbol   | base | quote |
| -------- | ---- | ----- |
| BTCUSDT  | BTC  | USDT  |
| ETHUSDT  | ETH  | USDT  |
| SOLUSDT  | SOL  | USDT  |
| BNBUSDT  | BNB  | USDT  |
| AVAXUSDT | AVAX | USDT  |
| ADAUSDT  | ADA  | USDT  |

The duplicate `BNBUSDT` row in `binance_symbols` is not returned.

`UNION ALL` keeps every row, including duplicates and rows shared between
exchanges:

```questdb-sql
binance_symbols UNION ALL coinbase_symbols;
```

| symbol   | base | quote |
| -------- | ---- | ----- |
| BTCUSDT  | BTC  | USDT  |
| ETHUSDT  | ETH  | USDT  |
| SOLUSDT  | SOL  | USDT  |
| BNBUSDT  | BNB  | USDT  |
| AVAXUSDT | AVAX | USDT  |
| ADAUSDT  | ADA  | USDT  |
| BNBUSDT  | BNB  | USDT  |
| BTCUSDT  | BTC  | USDT  |
| ETHUSDT  | ETH  | USDT  |
| SOLUSDT  | SOL  | USDT  |
| XRPUSDT  | XRP  | USDT  |
| LTCUSDT  | LTC  | USDT  |
| LINKUSDT | LINK | USDT  |

### EXCEPT

Symbols listed on Binance but not on Coinbase (single-venue on Binance):

```questdb-sql
binance_symbols EXCEPT coinbase_symbols;
```

| symbol   | base | quote |
| -------- | ---- | ----- |
| BNBUSDT  | BNB  | USDT  |
| AVAXUSDT | AVAX | USDT  |
| ADAUSDT  | ADA  | USDT  |

Notice that `EXCEPT` eliminates duplicates. `EXCEPT ALL` preserves them, so
the duplicate `BNBUSDT` in Binance shows up twice:

```questdb-sql
binance_symbols EXCEPT ALL coinbase_symbols;
```

| symbol   | base | quote |
| -------- | ---- | ----- |
| BNBUSDT  | BNB  | USDT  |
| AVAXUSDT | AVAX | USDT  |
| ADAUSDT  | ADA  | USDT  |
| BNBUSDT  | BNB  | USDT  |

### INTERSECT

Symbols listed on both exchanges - the candidates for cross-venue arbitrage:

```questdb-sql
binance_symbols INTERSECT coinbase_symbols;
```

| symbol  | base | quote |
| ------- | ---- | ----- |
| BTCUSDT | BTC  | USDT  |
| ETHUSDT | ETH  | USDT  |
| SOLUSDT | SOL  | USDT  |

In this example we have no duplicates, but if there were any, we could use
`INTERSECT ALL` to have them.

## Keyword execution priority

The QuestDB's engine processes the keywords from left to right, unless the
priority is defined by parenthesis.

For example:

```questdb-sql
query_1 UNION query_2 EXCEPT query_3;
```

is executed as:

```questdb-sql
(query_1 UNION query_2) EXCEPT query_3;
```

Similarly, the following syntax:

```questdb-sql
query_1 UNION query_2 INTERSECT query_3;
```

is executed as:

```questdb-sql
(query_1 UNION query_2) INTERSECT query_3;
```

## Clauses

The set operations can be used with clauses such as `LIMIT`, `ORDER BY`, and
`WHERE`. However, when the clause keywords are added after the set operations,
the execution order for different clauses varies.

For `LIMIT` and `ORDER BY`, the clauses are applied after the set operations.

For example:

```questdb-sql
query_1 UNION query_2
LIMIT 3;
```

is executed as:

```questdb-sql
(query_1 UNION query_2)
LIMIT 3;
```

For `WHERE`, the clause is applied first to the query immediate prior to it.

```questdb-sql
query_1 UNION query_2
WHERE value = 1;
```

is executed as:

```questdb-sql
query_1 UNION (query_2 WHERE value = 1);
```

:::note

- QuestDB applies `GROUP BY` implicitly. See
  [GROUP BY reference](/docs/query/sql/group-by/) for more information.
- Quest does not support the clause `HAVING` yet.

:::

## Alias

When different aliases are used with set operations, the execution follows a
left-right order and the output uses the first alias.

For example:

```questdb-sql
SELECT alias_1 FROM table_1
UNION
SELECT alias_2 FROM table_2;
```

The output shows `alias_1`.

