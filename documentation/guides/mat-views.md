---
title: Materialized views
description:
  Overview of QuestDB's materialized views. This feature helps you significantly
  speed up your time-based aggregation queries.
---

:::info

Materialized View support is in **beta**. It may not be fit for production use. Please
let us know if you run into issues.

Either:

1. Email us at [support@questdb.io](mailto:support@questdb.io)
2. Join our [public Slack](https://slack.questdb.com/)
3. Post on our [Discourse community](https://community.questdb.com/)

:::

A materialized view is a special QuestDB table that stores the pre-computed results of
a query. Unlike regular views, which compute their results at query time,
materialized views persist their data to disk, making them particularly
efficient for expensive aggregate queries that are run frequently.

## Related documentation

<!--
- **Step-by-step tutorial**

  - [How to create a materialized view](/blog/how-to-create-a-materialized-view/):
    A full walkthrough of simple and advanced materialized views
-->

- **Concepts**

  - [Introduction to materialized views](/docs/concept/mat-views/): Understanding
    how to best design queries with materialized views

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


## What are materialized views for?

As data grows in size, the performance of certain queries can degrade. Materialized views persistently cache the result of a `SAMPLE BY` or time-based `GROUP BY` query, and keep it automatically up to date. 

The refresh of the materialized view is `INCREMENTAL` and very efficient, and using materialized views can offer
100x or higher query speedups.

If you require the lowest latency queries, for example, for charts and dashboards, use materialized views!

For a better understanding of what materialized views are for, read the
[introduction to materialized views](/docs/concept/mat-views/) documentation.

## Creating a materialized view

There is a fundamental limit to how fast certain aggregation and scanning queries can execute,
based on the data size, number of rows, disk speed, and number of cores.

Materialized Views let you bound the runtime for common aggregation queries, by allowing you to 
pre-aggregate historical data ahead-of-time. This means that for many queries, you only need to aggregate
the latest partition's data, and then you can use already aggregated results for historical data.

Throughout this document, we will use the demo `trades` table. This is a table containing crypto trading data,
with over 1.6 billion rows.

```questdb-sql title="trades ddl"
CREATE TABLE 'trades' ( 
	symbol SYMBOL CAPACITY 256 CACHE,
	side SYMBOL CAPACITY 256 CACHE,
	price DOUBLE,
	amount DOUBLE,
	timestamp TIMESTAMP
) timestamp(timestamp) PARTITION BY DAY WAL;
```


A full syntax definition can be found in the [CREATE MATERIALIZED VIEW](/docs/reference/sql/create-mat-view)
documentation.

Here is a view taken from our demo, which calculates OHLC bars for a candlestick chart.

The view reads data from the base table, `trades`. It then calculates aggregate functions such as `first`, `sum` etc.
over 15 minutes time buckets. 

The view is incrementally refreshed, meaning it is always up to date with the latest `trades` data.

:::note

If you are unfamiliar with OHLC, please see our [OHLC guide](https://www.questdb.com/glossary/ohcl-candlestick).

:::

```questdb-sql title="trades_OHLC_15m ddl"
CREATE MATERIALIZED VIEW 'trades_OHLC_15m' 
WITH BASE 'trades' REFRESH INCREMENTAL 
AS (
  SELECT
      timestamp, symbol,
      first(price) AS open,
      max(price) as high,
      min(price) as low,
      last(price) AS close,
      sum(amount) AS volume
  FROM trades
  SAMPLE BY 15m
) PARTITION BY MONTH;
```

In this example:

1. The view is called `trades_OHLC_15m`.
2. The base table is `trades`
    - This is the data source, and will trigger incremental refresh when new data is written.
3. The refresh strategy is `INCREMENTAL` 
    - The data is automatically refreshed and incrementally written; efficient, fast, low maintenance.
4. The `SAMPLE BY` query contains two key column (timestamp, symbol) and five aggregates (first, max, min, last, price)
calculated in `15m` time buckets.
5. The view is partitioned by `DAY`.
6. No TTL is defined 
    - Therefore, the materialized view will contain a summary of _all_ the base `trades` table's data.

:::tip

This particular example can also be written via the [compact syntax](#compact-syntax).

:::

#### The view name

We recommend naming the view with some reference to the base table, its purpose, and its sample size.

In our `trades_OHLC_15m` example, we combine:

- `trades` (the base table name)
- `OHLC` (the purpose)
- `15m` (the sample unit)

#### The base table

The base table triggers updating the materialized view, and is the main source of raw data.

The `SAMPLE BY` query can contain a `JOIN`. However, the secondary `JOIN` tables will not trigger
any sort of refresh.

#### Refresh strategies

Currently, only `INCREMENTAL` refresh is supported. This strategy incrementally updates the view when new
data is inserted into the base table. This means that only new data is written to the view, so 
there is minimal write overhead.

Upon creation, or when the view is invalidated, a full refresh will occur, which rebuilds the view from scratch.

#### SAMPLE BY

Materialized views are populated using `SAMPLE BY` or time-based `GROUP BY` queries. 

When new data is written into the `base` table, an incremental refresh is triggered, which adds this new
data to the view.

Not all `SAMPLE BY` syntax is supported. In general, you should aim to keep your query as simple as possible,
and move complex transformations to an outside query that runs on the down-sampled data.

#### PARTITION BY

Optionally, you may specify a partitioning scheme.

You should choose a partition unit which is larger than the sampling interval. Ideally, the partition unit
should be divisible by the sampling interval.

For example, an `SAMPLE BY 8h` clause fits nicely with a `DAY` partitioning strategy, with 3 timestamp buckets per day.

#### Default partitioning

If the `PARTITION BY` clauses is omitted, the partitioning scheme is automatically inferred from the `SAMPLE BY` clause.

| -------------- | --------------------- |
| Interval       | Default partitioning  |
| -------------- | --------------------- |
| &gt; 1 hour    | `PARTITION BY YEAR`   |
| &gt; 1 minute  | `PARTITION BY MONTH`  |
| &lt;= 1 minute | `PARTITION BY DAY`    |
| -------------- | --------------------- |

#### TTL

Though `TTL` was not included, it can be set on a materialized view, and does not need to match the base table.

For example, if we only wanted to pre-aggregate the last 30 days of data, we could add:

```questdb-sql
PARTITION BY DAY TTL 30 DAYS;
```

to the end of our materialized view definition.

#### Compact syntax

If you're happy with the defaults and don't need to customize materialized view
parameters such as `PARTITION BY` or `TTL`, then you can use the compact syntax
which omits the parentheses.

```questdb-sql title="trades_OHLC_15m compact syntax"
CREATE MATERIALIZED VIEW trades_OHLC_15m AS
  SELECT
      timestamp, symbol,
      first(price) AS open,
      max(price) as high,
      min(price) as low,
      last(price) AS close,
      sum(amount) AS volume
  FROM trades
  SAMPLE BY 15m;
```

## Querying materialized views

:::note

The example `trades_OHLC_15m` view is available on our demo, and contains realtime crypto data - try it out!

:::

Materialized Views support **all the same queries** as regular QuestDB tables.

Here's how you can check today's trading data:

```questdb-sql title="querying trades_OHLC_15m" demo
trades_OHLC_15m WHERE timestamp IN today();
```

| timestamp                   | symbol   | open    | high    | low     | close   | volume             |
|-----------------------------|----------|---------|---------|---------|---------|--------------------|
| 2025-03-31T00:00:00.000000Z | ETH-USD  | 1807.94 | 1813.32 | 1804.69 | 1808.58 | 1784.144071999995  |
| 2025-03-31T00:00:00.000000Z | BTC-USD  | 82398.4 | 82456.5 | 82177.6 | 82284.5 | 34.47331241        |
| 2025-03-31T00:00:00.000000Z | DOGE-USD | 0.16654 | 0.16748 | 0.16629 | 0.16677 | 3052051.6327359965 |
| 2025-03-31T00:00:00.000000Z | AVAX-USD | 18.87   | 18.885  | 18.781  | 18.826  | 6092.852976000005  |
| ...                         | ...      | ...     | ...     | ...     | ...     | ...                | ... |


### How much faster is it?

Let's run the OHLC query without using the view, against our `trades` table:

```questdb-sql title="the OHLC query" demo
SELECT
    timestamp, symbol,
    first(price) AS open,
    max(price) as high,
    min(price) as low,
    last(price) AS close,
    sum(amount) AS volume
FROM trades
SAMPLE BY 15m;
```

This takes several seconds to execute.

Yet if we query the materialized view instead:

```questdb-sql title="OHLC materialized view unbounded" demo
trades_OHLC_15m;
```

This returns in milliseconds, since the database only has to respond with data, and not calculate anything - 
that has all been done efficiently, ahead of time.

### What about for fewer rows?

Let's try this calculation again, but just for one day instead of the entire 1.6 billion rows.

```questdb-sql title="OHLC query for yesterday" demo
SELECT
    timestamp, symbol,
    first(price) AS open,
    max(price) as high,
    min(price) as low,
    last(price) AS close,
    sum(amount) AS volume
FROM trades
WHERE timestamp IN yesterday()
SAMPLE BY 15m
ORDER BY timestamp, symbol;
```

| timestamp                   | symbol    | open   | high   | low     | close  | volume             |
|-----------------------------|-----------|--------|--------|---------|--------|--------------------|
| 2025-03-30T00:00:00.000000Z | ADA-USD   | 0.6732 | 0.6744 | 0.671   | 0.6744 | 132304.36510000005 |
| 2025-03-30T00:00:00.000000Z | ADA-USDC  | 0.6727 | 0.673  | 0.671   | 0.6729 | 15614.750700000002 |
| 2025-03-30T00:00:00.000000Z | ADA-USDT  | 0.6732 | 0.6744 | 0.671   | 0.6744 | 132304.36510000005 |
| 2025-03-30T00:00:00.000000Z | AVAX-USD  | 19.602 | 19.632 | 19.518  | 19.631 | 3741.162465999998  |
| 2025-03-30T00:00:00.000000Z | AVAX-USDT | 19.602 | 19.632 | 19.518  | 19.631 | 3741.162465999998  |
| 2025-03-30T00:00:00.000000Z | BTC-USD   | 82650  | 82750  | 82563.6 | 82747  | 25.493136499999    |
| ...                         | ...       | ...    | ...    | ...     | ...    | ...                |

Calculating the OHLC for a single day takes only `15ms`.

We can get the same data using the materialized view:

```questdb-sql title="OHLC materialized view for yesterday" demo
trades_OHLC_15m 
WHERE timestamp IN yesterday() 
ORDER BY timestamp, symbol;
```

| timestamp                   | symbol    | open   | high   | low     | close  | volume             |
|-----------------------------|-----------|--------|--------|---------|--------|--------------------|
| 2025-03-30T00:00:00.000000Z | ADA-USD   | 0.6732 | 0.6744 | 0.671   | 0.6744 | 132304.36510000005 |
| 2025-03-30T00:00:00.000000Z | ADA-USDC  | 0.6727 | 0.673  | 0.671   | 0.6729 | 15614.750700000002 |
| 2025-03-30T00:00:00.000000Z | ADA-USDT  | 0.6732 | 0.6744 | 0.671   | 0.6744 | 132304.36510000005 |
| 2025-03-30T00:00:00.000000Z | AVAX-USD  | 19.602 | 19.632 | 19.518  | 19.631 | 3741.162465999998  |
| 2025-03-30T00:00:00.000000Z | AVAX-USDT | 19.602 | 19.632 | 19.518  | 19.631 | 3741.162465999998  |
| 2025-03-30T00:00:00.000000Z | BTC-USD   | 82650  | 82750  | 82563.6 | 82747  | 25.493136499999    |
| ...                         | ...       | ...    | ...    | ...     | ...    | ...                |

This returns the data in just `2ms` over 7x faster - again, because it doesn't have to calculate anything.
The data has already been efficiently pre-aggregated, cached by the materialized view, and persisted to disk.
No aggregation is required, and hardly any rows are scanned!

So even for **small amounts of data**, a materialized view can be extremely useful.

## Limitations

### Beta

- Full refreshes over large datasets may exhaust RSS i.e. run out of memory. 
    - This will be amended to perform the full refresh in stages, bounding memory usage. 
- Not all `SAMPLE BY` syntax is well-supported, for example time zones and fills.
    - We will support these features in future.
- The `INCREMENTAL` refresh strategy relies on deduplicated inserts (O3 writes)
    - We will instead delete a time range and insert the data as an append, which is **much** faster.
    - This also means that currently, deduplication keys must be aligned across the `base` table and the view.

### Post-release

- Only `INCREMENTAL` refresh is supported
    - We intend to add alternatives, such as:
        - `PERIODIC` (once per partition), 
        - `TIMER` (once per time interval)
        - `MANUAL` (only when manually triggered)
- `INCREMENTAL` refresh is only triggered by inserts into the `base` table. 

## LATEST ON materialized views

`LATEST ON` queries can have variable performance, based on how frequently the symbols in the `PARTITION BY` column
have new entries written to the table. Infrequently updated symbols require scanning more data to find their last entry.

For example, pretend you have two symbols, `A` and `B`, and 100 million rows. 

Then, there is one row with `B`, at the start of the data set, and the rest are `A`.

Unfortunately, the database will scan backwards and scan all 100 million rows of data just to find the `B` entry.

But materialized views offer a solution to this performance issue too!

```questdb-sql title="LATEST ON on demo trades" demo
trades LATEST ON timestamp PARTITION BY symbol;
```

| symbol    | side | price      | amount | timestamp                   |
|-----------|------|------------|--------|-----------------------------|
| XLM-BTC   | sell | 0.00000163 | 541    | 2024-08-21T16:56:15.038557Z |
| AVAX-BTC  | sell | 0.00039044 | 10.125 | 2024-08-21T18:00:24.549949Z |
| MATIC-BTC | sell | 0.0000088  | 622.6  | 2024-08-21T18:01:21.607212Z |
| ADA-BTC   | buy  | 0.00000621 | 127.32 | 2024-08-21T18:05:37.852092Z |
| ...       | ...  | ...        | ...    | ...                         |

This takes around `2s` to execute. Now, let's see how much data needed to be scanned:

```questdb-sql title="filtering for the time range" demo
SELECT min(timestamp), max(timestamp) 
FROM trades 
LATEST ON timestamp 
PARTITION BY symbol;
```

| min                         | max                         |
| --------------------------- | --------------------------- |
| 2024-08-21T16:56:15.038557Z | 2025-03-31T12:55:28.193000Z |

So the database scanned approximately 7 months of data to serve this query. How many rows was that?

```questdb-sql title="number of rows the LATEST ON scanned" demo
SELECT count()
FROM trades
WHERE timestamp BETWEEN '2024-08-21T16:56:15.038557Z' AND '2025-03-31T12:55:28.193000Z';
```

| count     |
| --------- |
| 766834703 |

Yes, **~767 million rows**, just to serve the most recent **42 rows**, one for each symbol.

Let's fix this using a new materialized view. 

Observe that we have `42` unique symbols in the dataset. 

If we were to take a `LATEST ON` query for a single day,
we would therefore expect up to `84` rows (`42` buys, `42` sells):

```questdb-sql title="yesterday() LATEST ON" demo
(trades WHERE timestamp IN yesterday()) 
LATEST ON timestamp PARTITION BY symbol, side
ORDER BY symbol, side, timestamp;
```

| symbol    | side | price   | amount     | timestamp                   |
|-----------|------|---------|------------|-----------------------------|
| ADA-USD   | buy  | 0.6611  | 686.3557   | 2025-03-30T23:59:59.052000Z |
| ADA-USD   | sell | 0.6609  | 270.8935   | 2025-03-30T23:59:46.585999Z |
| ADA-USDC  | buy  | 0.6603  | 109.35     | 2025-03-30T23:57:56.194000Z |
| ADA-USDC  | sell | 0.6607  | 755.9739   | 2025-03-30T23:59:35.635000Z |
| ADA-USDT  | buy  | 0.6611  | 686.3557   | 2025-03-30T23:59:59.052000Z |
| ADA-USDT  | sell | 0.6609  | 270.8935   | 2025-03-30T23:59:46.585999Z |
| AVAX-USD  | buy  | 18.859  | 9.199842   | 2025-03-30T23:59:47.788000Z |
| AVAX-USD  | sell | 18.846  | 7.70086    | 2025-03-30T23:59:13.130000Z |
| AVAX-USDT | buy  | 18.859  | 9.199842   | 2025-03-30T23:59:47.788000Z |
| AVAX-USDT | sell | 18.846  | 7.70086    | 2025-03-30T23:59:13.130000Z |
| BTC-USD   | buy  | 82398.2 | 0.000025   | 2025-03-30T23:59:59.992000Z |
| BTC-USD   | sell | 82397.9 | 0.00001819 | 2025-03-30T23:59:59.796999Z |
| ...       | ...  | ...     | ...        | ...                         |

This executes in `40ms`.

A similar `GROUP BY` query looks like this:

```questdb-sql title="LATEST ON as a GROUP BY" demo
SELECT 
  symbol, 
  side,
  last(price) AS price, 
  last(amount) AS amount, 
  last(timestamp) AS timestamp
FROM trades
WHERE timestamp IN yesterday()
ORDER BY symbol, side, timestamp;
```

which executes in `8ms`.

Instead of using the `LATEST ON` syntax, we can use a `SAMPLE BY` equivalent, which massively reduces the number
of rows we need to query.

Then, we run this `SAMPLE BY` automatically using a materialized view, so we always have the fastest possible
`LATEST ON` query.

### Pre-aggregating the data

We will pre-aggregate the ~767 million rows into just ~15000.

Instead of storing the raw data, we will store one row, per symbol, per side, per day of data.

```questdb-sql title="down-sampling test query" demo

SELECT timestamp, symbol, side, price, amount, "latest" as timestamp FROM (
    SELECT timestamp, 
                symbol, 
		side, 
		last(price) AS price, 
		last(amount) AS amount, 
		last(timestamp) as latest
    FROM trades
    WHERE timestamp BETWEEN '2024-08-21T16:56:15.038557Z' AND '2025-03-31T12:55:28.193000Z'
    SAMPLE BY 1d
) ORDER BY timestamp;
```

This result set comprises just `14595` rows, instead of ~767 million. That's 51000x fewer
rows the database needs to scan to handle the query.

Here it is as a materialized view:

```questdb-sql title="LATEST ON materialized view"
CREATE MATERIALIZED VIEW 'trades_latest_1d' WITH BASE 'trades' REFRESH INCREMENTAL AS (
	SELECT 
	  timestamp, 
	  symbol, 
	  side, 
	  last(price) AS price, 
	  last(amount) AS amount, 
	  last(timestamp) as latest
	FROM trades
	SAMPLE BY 1d
) PARTITION BY DAY;
```

You can try this view out on our demo:

```questdb-sql title="trades_latest_1d" demo
trades_latest_1d;
```

Then, you can query this 'per-day LATEST ON' view to quickly calculate the 'true' `LATEST ON` result. 

```questdb-sql title="LATEST ON over the trades_latest_1d" demo
SELECT symbol, side, price, amount, "latest" as timestamp FROM (
	trades_latest_1d 
	LATEST ON timestamp 
	PARTITION BY symbol, side
) ORDER BY timestamp;
```

And in just a few milliseconds, we get the result:

| symbol   | side | price   | amount    | timestamp                   |
|----------|------|---------|-----------|-----------------------------|
| ETH-BTC  | sell | 0.02196 | 0.005998  | 2025-03-31T14:24:18.916000Z |
| DAI-USDT | sell | 1.0006  | 53        | 2025-03-31T14:29:19.392999Z |
| DAI-USD  | sell | 1.0006  | 53        | 2025-03-31T14:29:19.392999Z |
| DAI-USD  | buy  | 1.0007  | 29.785106 | 2025-03-31T14:30:33.394000Z |
| DAI-USDT | buy  | 1.0007  | 29.785106 | 2025-03-31T14:30:33.394000Z |
| ...      | ...  | ...     | ...       | ...                         |

Seconds down to milliseconds - **100x, even 1000x faster!**

## Architecture and internals

The rest of this document contains information about how materialized views work internally.

### Storage model

Materialized views in QuestDB are implemented as special tables that maintain
their data independently of their base tables. They use the same underlying
storage engine as regular tables, benefiting from QuestDB's columnar storage and
partitioning capabilities.

### Refresh mechanism

:::note

Currently, QuestDB only supports **incremental refresh** for materialized views.

Future releases will include additional refresh types, such as time-interval and
manual refreshes.

:::

Unlike regular views, which recompute their results at query time, materialized
views in QuestDB are incrementally refreshed as new data is added to the base
table. This approach ensures that only the **relevant time slices** of the view
are updated, avoiding the need to recompute the entire dataset. The refresh
process works as follows:

1. New data is inserted into the base table.
2. The time-range of this data is identified.
3. This data is extracted and used to recompute the materialised view.

This refresh happens asynchronously, minimising any impact on write performance.
The refresh state of the materialized view is tracked using transaction numbers.
The transaction numbers can be compared with the base table, for monitoring the
'refresh lag'.

For example, if a base table receives new rows for `2025-02-18`, only that day's
relevant time slices are recomputed, rather than reprocessing all historical
data.

You can monitor refresh status using the `materialized_views()` system function:

```questdb-sql title="Listing all materialized views"
SELECT
  view_name,
  last_refresh_timestamp,
  view_status,
  base_table_txn,
  applied_base_table_txn
FROM materialized_views();
```

Here is an example output:

| view_name   | last_refresh_timestamp | view_status | base_table_txn | applied_base_table_txn |
| ----------- | ---------------------- | ----------- | -------------- | ---------------------- |
| trades_view | null                   | valid       | 102            | 102                    |

When `base_table_txn` matches `applied_base_table_txn`, the materialized view is
fully up-to-date.

#### Refreshing an invalid view

If a materialized view becomes invalid, you can check its status:

```questdb-sql title="Checking view status"
SELECT
  view_name,
  base_table_name,
  view_status,
  invalidation_reason
FROM materialized_views();
```

| view_name     | base_table_name | view_status | invalidation_reason                          |
| ------------- | --------------- | ----------- | -------------------------------------------- |
| trades_view   | trades          | valid       | null                                         |
| exchange_view | exchange        | invalid     | [-105] table does not exist [table=exchange] |

To restore an invalid view, and refresh its data from scratch, use:

```questdb-sql title="Restoring an invalid view"
REFRESH MATERIALIZED VIEW view_name FULL;
```

This command deletes existing data in the materialized view, and re-runs its
query.

Once the view is repopulated, the view is marked as 'valid' so that it can be
incrementally refreshed.

For large base tables, a full refresh may take a significant amount of time. You
can cancel the refresh using the
[`CANCEL QUERY`](/docs/reference/sql/cancel-query/) SQL.

For the conditions which can invalidate a materialized view, see the
[technical requirements](#technical-requirements) section.

### Base table relationship

Every materialized view is tied to a base table that serves as its primary data
source.

- For single-table queries, the base table is automatically determined.
- For multi-table queries, one table must be explicitly defined as the base
  table using `WITH BASE`.

The view is automatically refreshed when the base table is changed. Therefore,
you should make sure the table that you wish to drive the view is defined
correctly. If you use the wrong base table, then the view may not be refreshed
at the times you expect.

## Technical requirements

### Query constraints

To create a materialized view, your query:

- Must use either `SAMPLE BY` or `GROUP BY` with a designated timestamp column
  key.
- Must not contain `FROM-TO`, `FILL`, and `ALIGN TO FIRST OBSERVATION` clauses
  in `SAMPLE BY` queries
- Must use join conditions that are compatible with incremental refreshing.
- When the base table has [deduplication](/docs/concept/deduplication/) enabled,
  the non-aggregate columns selected by the materialized view query must be a
  subset of the `DEDUP` keys from the base table.

We intend to loosen some of these restrictions in future.

### View invalidation

The view's structure is tightly coupled with its base table.

The main cause of invalidation for a materialised view, is when the table schema
or underlying data is modified.

These changes include dropping columns, dropping partitions and renaming the
table.

Data deletion or modification, for example, using `TRUNCATE` or `UPDATE`, may
also cause invalidation.

## Replicated views (Enterprise only)

Replication of the base table is independent of materialized view maintenance.

If you promote a replica to a new primary instance, this may trigger a full
materialized view refresh in the case where the replica did not already have a
fully up-to-date materialized view.

## Resource management

Materialized Views are compatible with the usual resource management systems:

- View TTL settings are separate from the base table.
- TTL deletions in the base table will not be propagated to the view.
- Partitions are managed separately between the base table and the view.
- Refresh intervals can be configured independently.

### Materialized view with TTL

Materialized Views take extra storage and resources to maintain. If your
`SAMPLE BY` unit is small (seconds, milliseconds), this could be a significant
amount of data.

Therefore, you can decide on a retention policy for the data, and set it using
`TTL`:

```questdb-sql title="Create a materialized view with a TTL policy"
CREATE MATERIALIZED VIEW trades_hourly_prices AS (
  SELECT
    timestamp,
    symbol,
    avg(price) AS avg_price
  FROM trades
  SAMPLE BY 1h
) PARTITION BY WEEK TTL 8 WEEKS;
```

In this example, the view stores hourly summaries of the pricing data, in weekly
partitions, keeping the prior 8 partitions.
