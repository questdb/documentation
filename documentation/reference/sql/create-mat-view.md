---
title: CREATE MATERIALIZED VIEW
sidebar_label: CREATE MATERIALIZED VIEW
description:
  Documentation for the CREATE MATERIALIZED VIEW SQL keyword in QuestDB.
---

:::info

Materialized View support is in **beta**. It may not be fit for production use.

Please let us know if you run into issues. Either:

1. Email us at [support@questdb.io](mailto:support@questdb.io)
2. Join our [public Slack](https://slack.questdb.com/)
3. Post on our [Discourse community](https://community.questdb.com/)

:::

To create a new materialized view in the database, use the
`CREATE MATERIALIZED VIEW` keywords followed by the query that defines the
materialized view.

A materialized view holds the result set of the given query, and is
automatically refreshed and persisted. For more information on the concept, see
the [introduction](/docs/concept/mat-views/) and
[guide](/docs/guides/mat-views/) on materialized views.

## Syntax

To create a materialized view, manually enter the parameters and settings:

![Flow chart showing the syntax of the CREATE MATERIALIZED VIEW keyword](/images/docs/diagrams/createMatViewDef.svg)

:::tip

For simple materialized views, you can alternatively use the
[compact syntax](#compact-syntax).

:::

## Metadata

To check materialized view metadata, use the `materialized_views()` function,
which is described in the [meta functions](/docs/reference/function/meta/)
documentation page.

The following example demonstrate creating materialized views from basic
statements, and introduces feature such as
[partitioning](/glossary/database-partitioning/).

## Creating a view

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
) PARTITION BY HOUR;
```

Now, we've created a materialized view that will be automatically refreshed each
time when the base table (`trades`) gets new data.

The refreshes are incremental. The view data is populated partially, and only
for the changed parts of the base table.

:::note

Queries supported by incrementally refreshed materialized views are limited to
`SAMPLE BY` queries without `FROM-TO` and `FILL` clauses, and `GROUP BY` queries
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

`PARTITION BY` optionally allows specifying the
[partitioning strategy](/docs/concept/partitions/) for the materialized view.

Materialized views can be partitioned by one of the following:

- `YEAR`
- `MONTH`
- `WEEK`
- `DAY`
- `HOUR`

The partitioning strategy **cannot be changed** after the materialized view has
been created.

If unspecified, the `CREATE MATERIALIZED VIEW` statement will infer the
[default partitioning strategy](/docs/guides/mat-views/#default-partitioning).

## Time To Live (TTL)

A retention policy can be set on the materialized view, bounding how much data
is stored.

Simply specify a time-to-live (TTL) using the `TTL` clause, placing it right
after `PARTITION BY <unit>`.

Follow the `TTL` keyword with a number and a time unit, one of:

- `HOURS`
- `DAYS`
- `WEEKS`
- `MONTHS`
- `YEARS`

Refer to the [section on TTL in Concepts](/docs/concept/ttl/) for detailed
information on the behavior of this feature.

:::note

The time-to-live (TTL) for the materialized view can differ from the base table,
depending on your needs.

:::

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
[same rules](/docs/reference/sql/create-table/#table-name) as regular tables.

## OWNED BY (Enterprise)

When a user creates a new materialized view, they are automatically assigned all
materialized view level permissions with the `GRANT` option for that view. This
behaviour can can be overridden using `OWNED BY`.

If the `OWNED BY` clause is used, the permissions instead go to the user, group,
or service account named in that clause.

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

## Compact syntax

The `CREATE MATERIALIZED VIEW` statement also supports a compact syntax which
can be used when the default parameters are sufficient.

![Flow chart showing the syntax of the compact CREATE MATERIALIZED VIEW syntax](/images/docs/diagrams/createMatViewCompactDef.svg)

```questdb-sql
CREATE MATERIALIZED VIEW trades_hourly_prices AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1h;
```

For more on the semantics of the compact syntax, see the
[materialized view guide](/docs/guides/mat-views/#compact-syntax).

## SYMBOL column capacity

By default, SYMBOL column capacities in a materialized view are set to the same
values as in the base table. It is also possible to change SYMBOL capacities via
the
[`ALTER MATERIALIZED VIEW SYMBOL CAPACITY`](/docs/reference/sql/alter-mat-view-change-symbol-capacity/)
statement.

## Query constraints

There is a list of requirements for the queries that are used in materialized
views. Refer to this
[documentation section](/docs/guides/mat-views/#technical-requirements) to learn
about them.
