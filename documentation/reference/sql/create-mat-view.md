---
title: CREATE MATERIALIZED VIEW reference
sidebar_label: CREATE MATERIALIZED VIEW
description: CREATE MATERIALIZED VIEW SQL keywords reference documentation.
---

To create a new materialized view in the database, the
`CREATE MATERIALIZED VIEW` keywords followed by the query are used. A
materialized view holds the result set of the given query, automatically
refreshed and persistent. For more information on the concept, see the
[reference](/docs/concept/mat-views/) on materialized views.

## Syntax

To create a materialized view by manually entering parameters and settings:

![Flow chart showing the syntax of the CREATE MATERIALIZED VIEW keyword](/images/docs/diagrams/createMatViewDef.svg)

:::note

Checking materialized view metadata can be done via the `mat_views()` function
which is described in the [meta functions](/docs/reference/function/meta/)
documentation page.

:::

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
table.

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
when the base table (`trades`) gets new data. The refreshes are incremental,
i.e. the view data is populated partially, only for the changed parts of the
base table.

:::note

Queries supported by incrementally refreshed materialized views are limited to
SAMPLE BY without FROM-TO and FILL clauses and GROUP BY queries with timestamp
key.

:::

## Base table

Incrementally refreshed views require base table to be specified, so that the
server refreshes the materialized view each time when the base table is updated.
In case when the query used to create the view involves multiple tables, one of
the tables has to be specified as the base table.

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

To store only recent aggregated data, configure a time-to-live (TTL) period on a
materialized view using the `TTL` clause, placing it right after
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
created if one with the desired view name does not already exist.

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

## Materialized view name

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
an external user, because permissions cannot be granted to them.

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
