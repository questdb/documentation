---
title: CREATE MATERIALIZED VIEW
sidebar_label: CREATE MATERIALIZED VIEW
description:
  Documentation for the CREATE MATERIALIZED VIEW SQL keyword in QuestDB.
---

To create a new materialized view in the database, use the
`CREATE MATERIALIZED VIEW` keywords followed by the query that defines the
materialized view.

A materialized view holds the result set of the given query, and is
automatically refreshed and persistent. For more information on the concept, see
the [reference](/docs/concept/mat-views/) on materialized views.

## Syntax

To create a materialized view, manually enter the parameters and settings:

![Flow chart showing the syntax of the CREATE MATERIALIZED VIEW keyword](/images/docs/diagrams/createMatViewDef.svg)

## Metadata

To check materialized view metadata, use the `mat_views()` function, which is
described in the [meta functions](/docs/reference/function/meta/) documentation
page.

## Examples

The following examples demonstrate creating materialized views from basic
statements, and introduces feature such as
[partitioning](/glossary/database-partitioning/).

Our examples use the following base table:

```questdb-sql title="Base table"
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY;
```

Now we can create a materialized view holding aggregated data from the base
table:

```questdb-sql title="Hourly materialized view"
CREATE MATERIALIZED VIEW trades_hourly_prices AS (
  SELECT
    timestamp,
    symbol,
    avg(price) AS avg_price
  FROM trades
  SAMPLE BY 1h
) PARTITION BY WEEK;
```

We've created a materialized view that will be automatically refreshed each time
when the base table (`trades`) gets new data.

The refreshes are incremental. The view data is populated partially, and only
for the changed parts of the base table.

:::note

Queries supported by incrementally refreshed materialized views are limited to
`SAMPLE BY` queries without `FROM-TO` and `FILL` clauses and `GROUP BY` queries
with the designated timestamp as the grouping key.

:::

## Base table

Incrementally refreshed views require that the base table is specified, so that
the server refreshes the materialized view each time the base table is updated.
When creating a materialized view that queries multiple tables, you must specify
one of them as the base table.

```questdb-sql title="Hourly materialized view with LT JOIN"
CREATE MATERIALIZED VIEW trades_ext_hourly_prices
WITH BASE trades
AS (
  SELECT
    t.timestamp,
    t.symbol,
    avg(t.price) AS avg_price,
    avg(e.price) AS avg_ext_price
  FROM trades t
  LT JOIN ext_trades e ON (symbol)
  SAMPLE BY 1d
) PARTITION BY WEEK;
```

## Partitioning

`PARTITION BY` allows for specifying the
[partitioning strategy](/docs/concept/partitions/) for the materialized view.

Materialized views can be partitioned by one of the following:

- `YEAR`
- `MONTH`
- `WEEK`
- `DAY`
- `HOUR`

The partitioning strategy **cannot be changed** after the materialized view has
been created.

## Time To Live (TTL)

To store only recently aggregated data, configure a time-to-live (TTL) period on
a materialized view using the `TTL` clause, placing it right after
`PARTITION BY <unit>`.

Follow the `TTL` keyword with a number and a time unit, one of:

- `HOURS`
- `DAYS`
- `WEEKS`
- `MONTHS`
- `YEARS`

Refer to the [section on TTL in Concepts](/docs/concept/ttl/) for detailed
information on the behavior of this feature.

### Examples

```questdb-sql title="Creating a materialized view with TTL"
CREATE MATERIALIZED VIEW trades_hourly_prices AS (
  SELECT
    timestamp,
    symbol,
    avg(price) AS avg_price
  FROM trades
  SAMPLE BY 1h
) PARTITION BY DAY TTL 7 DAYS;
```

## IF NOT EXISTS

An optional `IF NOT EXISTS` clause may be added directly after the
`CREATE MATERIALIZED VIEW` keywords to indicate that a new view should be
created only if a view with the desired view name does not already exist.

```questdb-sql
CREATE MATERIALIZED VIEW IF NOT EXISTS trades_weekly_prices AS (
  SELECT
    timestamp,
    symbol,
    avg(price) AS avg_price
  FROM trades
  SAMPLE BY 7d
) PARTITION BY YEAR;
```

## Materialized view names

Materialized view names follow the
[same rules](/docs/reference/sql/create-table/#table-name) as normal table
names.

## OWNED BY

_Enterprise only._

When a user creates a new materialized view, they automatically get all
materialized view level permissions with the `GRANT` option for that view.

However, if the `OWNED BY` clause is used, the permissions instead go to the
user, group, or service account named in that clause.

The `OWNED BY` clause cannot be omitted if the materialized view is created by
an external user, as permissions cannot be granted to them.

```questdb-sql
CREATE GROUP analysts;
CREATE MATERIALIZED VIEW trades_hourly_prices AS (
  SELECT
    timestamp,
    symbol,
    avg(price) AS avg_price
  FROM trades
  SAMPLE BY 1h
) PARTITION BY DAY
OWNED BY analysts;
```
