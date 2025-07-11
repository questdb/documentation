---
title: CREATE MATERIALIZED VIEW
sidebar_label: CREATE MATERIALIZED VIEW
description:
  Documentation for the CREATE MATERIALIZED VIEW SQL keyword in QuestDB.
---

:::info

Materialized View support is now generally available (GA) and ready for
production use.

If you are using versions earlier than `8.3.1`, we suggest you upgrade at your
earliest convenience.

:::

To create a new materialized view in the database, use the
`CREATE MATERIALIZED VIEW` keywords followed by the query that defines the
materialized view.

A materialized view holds the result set of the given query, and is
automatically refreshed and persisted. For more information on the concept, see
the [introduction](/docs/concept/mat-views/) and
[guide](/docs/guides/mat-views/) on materialized views.

## Syntax

The `CREATE MATERIALIZED VIEW` statement comes in two flavors: compact and full
syntax. The compact syntax can be used when the default parameters are
sufficient.

![Flow chart showing the syntax of the compact CREATE MATERIALIZED VIEW syntax](/images/docs/diagrams/createMatViewCompactDef.svg)

For more on the semantics of the compact syntax, see the
[materialized view guide](/docs/guides/mat-views/#compact-syntax).

To create a materialized view with full syntax, you need to enter the following
parameters and settings:

![Flow chart showing the syntax of the CREATE MATERIALIZED VIEW keyword](/images/docs/diagrams/createMatViewDef.svg)

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
CREATE MATERIALIZED VIEW trades_hourly_prices AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1h;
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

## Alternative refresh strategies

With the default `IMMEDIATE` refresh strategy, QuestDB will incrementally
refresh the view each time new data is written to the base table. If your data
is written rapidly in small transactions, this will trigger additional small
writes to the view.

Instead, you can use timer-based refresh, which trigger an incremental refresh
after certain time intervals:

```questdb-sql
CREATE MATERIALIZED VIEW price_1h
REFRESH EVERY 1h START '2025-05-30T00:00:00.000000Z' TIME ZONE 'Europe/Berlin'
AS ...
```

In this example, the view will start refreshing from the specified timestamp in
Berlin time zone on an hourly schedule. The refresh itself will still be
incremental, but will no longer be triggered on every new insert. You can omit
the `START <timestamp>` and `TIME ZONE <timezone>` clauses in order to just
start refreshing from `now`.

:::tip

The minimum timed interval is one minute (`1m`). If you need to refresh faster
than this, please use the default incremental refresh.

:::

In case you want to be in full control of when the incremental refresh happens,
you can use `MANUAL` refresh:

```questdb-sql
CREATE MATERIALIZED VIEW price_1h
REFRESH MANUAL
AS ...
```

Manual strategy means that to refresh the view, you need to run the
[`REFRESH` SQL](/docs/reference/sql/refresh-mat-view/) explicitly.

For all these strategies, the refresh itself stays incremental, i.e. the
materialized view is only updated for base table time intervals that received
modifications since the previous refresh.

## Period materialized views

In certain use cases, like storing trading day information, the data becomes
available at fixed time intervals. In this case, `PERIOD` variant of
materialized views can be used:

```questdb-sql title="Period materialized view"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH PERIOD (LENGTH 1d TIME ZONE 'Europe/London' DELAY 2h) AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1h;
```

The `PERIOD` clause above defines an in-flight time interval (period) in the
`trades_daily_prices` materialized view that will not receive data until it
finishes. In this example, the interval is one day (`LENGTH 1d`) in London time
zone. The `DELAY 2h` clause here means that the data for the trading day may
have 2 hour lag until it's fully written. So, in our example the current
in-flight period in the view is considered complete and gets refreshed
automatically each day at 2AM, London time. Since the default `IMMEDIATE`
refresh strategy is used, all writes to older, complete periods in the base
table lead to an immediate and asynchronous refresh in the view once the
transaction is committed.

Period materialized views can be used with any supported refresh strategy, not
only with the `IMMEDIATE` one. For instance, they can be configured for
timer-based refresh:

```questdb-sql title="Period materialized view with timer refresh"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH EVERY 10m PERIOD (LENGTH 1d TIME ZONE 'Europe/London' DELAY 2h) AS
...
```

Here, the `PERIOD` refresh still takes place once a period completes, but
refreshes for older rows take place each 10 minutes.

Finally, period materialized views can be configure for manual refresh:

```questdb-sql title="Period materialized view with timer refresh"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH MANUAL PERIOD (LENGTH 1d TIME ZONE 'Europe/London' DELAY 2h) AS
...
```

The only way to refresh data on such a materialized view is to run
[`REFRESH` SQL](/docs/reference/sql/refresh-mat-view/) explicitly. When run,
`REFRESH` statement will refresh incrementally all recently completed periods,
as well as all time intervals touched by the recent write transactions.

## Initial refresh

As soon as a materialized view is created an asynchronous refresh is started. In
situations when this is not desirable, `DEFERRED` keyword can be specified along
with the refresh strategy:

```questdb-sql title="Deferred manual refresh"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH MANUAL DEFERRED AS
...
```

In the above example, the view has manual refresh strategy and it does not
refresh after creation. It will only refresh when you run the
[`REFRESH` SQL](/docs/reference/sql/refresh-mat-view/) explicitly.

The `DEFERRED` keyword can be also specified for `IMMEDIATE` and timer-based
refresh strategies. Here is an example:

```questdb-sql title="Deferred timer refresh"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH EVERY 1h DEFERRED START '2026-01-01T00:00:00' AS
...
```

In such cases, the view will be refreshed only when the corresponding event
occurs:

- After the next base table transaction in case of `IMMEDIATE` refresh strategy.
- At the next trigger time in case of timer-based refresh strategy.

Once a materialized view is created, its refresh strategy can be changed any time
with the [`ALTER SET REFRESH`](/docs/reference/sql/alter-mat-view-set-refresh/)
command.

## Base table

Materialized views require that the base table is specified, so that the last
base table transaction number can be saved and later on checked by the
incremental refresh. When creating a materialized view that queries multiple
tables, you must specify one of them as the base table.

```questdb-sql title="Hourly materialized view with LT JOIN"
CREATE MATERIALIZED VIEW trades_ext_hourly_prices
WITH BASE trades AS
SELECT
  t.timestamp,
  t.symbol,
  avg(t.price) AS avg_price,
  avg(e.price) AS avg_ext_price
FROM trades t
LT JOIN ext_trades e ON (symbol)
SAMPLE BY 1d;
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

```questdb-sql title="Creating a materialized view with PARTITION BY and TTL"
CREATE MATERIALIZED VIEW trades_hourly_prices AS (
  SELECT
    timestamp,
    symbol,
    avg(price) AS avg_price
  FROM trades
  SAMPLE BY 1h
) PARTITION BY DAY TTL 7 DAYS;
```

```questdb-sql title="Creating a materialized view with one day period"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH PERIOD (LENGTH 1d TIME ZONE 'Europe/London' DELAY 2h) AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1h;
```

```questdb-sql title="Creating a materialized view with timer refresh each 10 minutes"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH EVERY 10m START '2025-06-18T00:00:00.000000000' AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1h;
```

```questdb-sql title="Creating a materialized view with manual refresh"
CREATE MATERIALIZED VIEW trades_hourly_prices
REFRESH MANUAL AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1h;
```

## IF NOT EXISTS

An optional `IF NOT EXISTS` clause may be added directly after the
`CREATE MATERIALIZED VIEW` keywords to indicate that a new view should be
created only if a view with the desired view name does not already exist.

```questdb-sql
CREATE MATERIALIZED VIEW IF NOT EXISTS trades_weekly_prices AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 7d;
```

## Materialized view names

Materialized view names follow the
[same rules](/docs/reference/sql/create-table/#table-name) as regular tables.

## OWNED BY (Enterprise)

When a user creates a new materialized view, they are automatically assigned all
materialized view level permissions with the `GRANT` option for that view. This
behavior can can be overridden using `OWNED BY`.

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
