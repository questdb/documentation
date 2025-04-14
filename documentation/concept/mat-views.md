---
title: Materialized views
sidebar_label: Materialized views
description:
  Materialized views are designed to maintain the speed of your queries as you scale your data.
  Understand how to structure your queries to take advantage of this feature.
---

:::info

Materialized View support is in **beta**.

It may not be fit for production use.

To enable **beta** materialized views, set `cairo.mat.view.enabled=true` in
`server.conf`, or export the equivalent environment variable:
`QDB_CAIRO_MAT_VIEW_ENABLED=true`.

Please let us know if you run into issues.

Either:

1. Email us at [support@questdb.io](mailto:support@questdb.io)
2. Join our [public Slack](https://slack.questdb.com/)
3. Post on our [Discourse community](https://community.questdb.com/)

:::

A materialized view is a special QuestDB table that stores the pre-computed results of
a query. Unlike regular views, which compute their results at query time,
materialized views persist their data to disk, making them particularly
efficient for expensive aggregate queries that are run frequently.

## What are materialized views for?

Let's say that your application is ingesting vast amounts of time series data.
Soon your QuestDB instance will grow from gigabytes to terabytes.

```questdb-sql title="trades ddl"
CREATE TABLE 'trades' ( 
	symbol SYMBOL CAPACITY 256 CACHE,
	side SYMBOL CAPACITY 256 CACHE,
	price DOUBLE,
	amount DOUBLE,
	timestamp TIMESTAMP
) timestamp(timestamp) PARTITION BY DAY WAL;
```

Queries that rely on a specific subset of the data (say, the last hour) will
continue to run fast, but anything that requires scanning large numbers of rows
or the entire dataset will begin to slow down.

One of the most common queries for time series data is the `SAMPLE BY` query.
This query is used to aggregate data into time-window buckets. Here's an example
that can analyze trade volumes by the minute, broken down by symbol.

```questdb-sql title="SAMPLE BY query"
SELECT
  timestamp,
  symbol,
  side,
  sum(price * amount) AS notional
FROM trades
SAMPLE BY 1m;
```

Each time this query is run it will scan the entire dataset. This type of query
will become slower as the dataset grows.

Materialized views are designed to maintain the speed of your queries as you
scale your data.

When you create a materialized view you register your time-based grouping
query with the QuestDB database against a base table.

![sampling into a materialized view](/images/docs/concepts/mat-view-agg.svg)

Conceptually a materialized view is an on-disk table tied to a query:
As you add new data to the base table, the materialized view will efficiently
update itself. You can then query the materialized view as a regular table
without the impact of a full table scan of the base table.

## Creating a materialized view

To create a materialize view, surround your `SAMPLE BY` or time-based `GROUP BY`
query with a [`CREATE MATERIALIZED VIEW`](/docs/reference/sql/create-mat-view) statement.

```questdb-sql title="trades_notional_1m ddl"
CREATE MATERIALIZED VIEW 'trades_notional_1m' 
WITH BASE 'trades' REFRESH INCREMENTAL 
AS (
  SELECT
    timestamp,
    symbol,
    side,
    sum(price * amount) AS notional
  FROM trades
  SAMPLE BY 1m
) PARTITION BY DAY;
```

Querying a materialized view can be up to hundreds of times faster than
executing the same query on the base table.

```questdb-sql title="querying a materialized view"
SELECT *
FROM trades_notional_1m;
```

## Roadmap and limitations

We aim to expand the scope materialized view over time. For now, the feature
focuses on time-based aggregations. It currently supports JOIN operations,
but does not yet support all query types.

## Continue learning

<!--
- **Step-by-step tutorial**

  - [How to create a materialized view](/blog/how-to-create-a-materialized-view/):
    A full walkthrough of simple and advanced materialized views
-->

- **Guide**

  - [Materialized views guide](/docs/guides/mat-views/): A
    comprehensive guide to materialized views, including examples and
    explanations of the different options available

- **SQL Commands**

  - [`CREATE MATERIALIZED VIEW`](/docs/reference/sql/create-mat-view/): Create a
    new materialized view
  - [`DROP MATERIALIZED VIEW`](/docs/reference/sql/drop-mat-view/): Remove a
    materialized view
  - [`REFRESH MATERIALIZED VIEW`](/docs/reference/sql/refresh-mat-view/):
    Manually refresh a materialized view
  - [`ALTER MATERIALIZED VIEW RESUME WAL`](/docs/reference/sql/alter-mat-view-resume-wal/):
    Resume WAL for a materialized view

- **Configuration**
  - [Materialized views configs](/docs/configuration/#materialized-views):
    Server configuration options for materialized views from `server.conf`

