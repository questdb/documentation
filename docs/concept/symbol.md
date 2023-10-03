---
title: Symbol
sidebar_label: Symbol
description:
  Documentation for usage of the symbol data type in QuestDB. This type is used
  to store repetitive strings in order to enable optimizations on storage and
  search.
---

QuestDB introduces a data type called `symbol`; a data structure used to store
repetitive strings. Internally, `symbol` types are stored as a table of integers
and their corresponding string values.

This page presents the concept, optional setting, and their indication for
`symbol` types.

## Advantages of `symbol` types

- Greatly improved query performance as string operations compare and write
  `int` types instead of `string`.
- Greatly improved storage efficiency as `int` maps to `string` types.
- Unobtrusive to the user because SQL execution has the same result as handling
  string values.
- Reduced complexity of database schemas by removing the need for explicit
  additional tables or joins.

## Properties

- Symbol tables are stored separately from column data.
- Fast conversion from `string` to `int` and vice-versa when reading or writing
  data.
- Columns defined as `symbol` types support indexing.
- By default, QuestDB caches `symbol` types in memory for improved query speed
  and InfluxDB Line Protocol ingestion speed. The setting is configurable.

## Usage of `symbols`

### `Symbol` columns

Columns can be specified as `SYMBOL` using
[CREATE TABLE](/docs/reference/sql/create-table/), similar to other types:

```questdb-sql title="Create table with a SYMBOL type"
CREATE TABLE my_table
  (symb SYMBOL CAPACITY 128 NOCACHE, price DOUBLE, ts TIMESTAMP)
timestamp(ts);
```

The following additional symbol settings are defined, either globally as part of
the [server configuration](/docs/reference/configuration/) or locally when a
table is created:

- **Symbol capacity**: Optional setting used to indicate how many distinct
  values this column is expected to have. Based on the value used, the data
  structures will resize themselves when necessary, to allow QuestDB to function
  correctly. Underestimating the symbol value count may result in drop of
  performance whereas over-estimating may result in higher disk space and memory
  consumption. Symbol capacity is also used to set the initial symbol cache size
  when the cache is enabled.

  - Server-wide setting: `cairo.default.symbol.capacity` with a default of `256`
  - Column-wide setting: The
    [`CAPACITY` option](/docs/reference/sql/create-table/#symbol-capacity) for
    `CREATE TABLE`

- **Cache**: Optional setting specifying whether a symbol should be cached. When
  a `symbol` column is cached, QuestDB will use a Java heap-based hash table to
  resolve symbol values and keys. When a column has a large number of distinct
  symbol values (over 100,000, for example), the heap impact might be
  significant and may cause OutOfMemory errors, depending on the heap size. Not
  caching leverages a memory-mapped structure which can deal with larger value
  counts but is slower.

  - Server-wide setting: `cairo.default.symbol.cache.flag` with a default of
    `true`
  - Column-wide setting when a table is created: The
    [`CACHE | NOCACHE` keyword](/docs/reference/sql/create-table/#symbol-caching)
    for `CREATE TABLE`

### Symbols for column indexing

`Symbols` may also be indexed for faster query execution. See
[Index](/docs/concept/indexes/) for more information.
