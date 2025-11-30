---
title: Materialized views
description:
  Overview of QuestDB's materialized views. This feature helps you significantly
  speed up your time-based aggregation queries.
---

:::info

Materialized View support is now generally available (GA) and ready for
production use.

If you are using versions earlier than `8.3.1`, we suggest you upgrade at your
earliest convenience.

:::

A materialized view is a special QuestDB table that stores the pre-computed
results of a query. Unlike regular views, which compute their results at query
time, materialized views persist their data to disk, making them particularly
efficient for expensive aggregate queries that are run frequently.

## Related documentation

<!--
- **Step-by-step tutorial**

  - [How to create a materialized view](/blog/how-to-create-a-materialized-view/):
    A full walkthrough of simple and advanced materialized views
-->

- **Concepts**

  - [Introduction to materialized views](/docs/concept/mat-views/):
    Understanding how to best design queries with materialized views

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
  - [Materialized views settings](/docs/configuration/#materialized-views):
    Server configuration options for materialized views from `server.conf`

## What are materialized views for?

As data grows in size, the performance of certain queries can degrade.
Materialized views store the result of a `SAMPLE BY` or time-based `GROUP BY`
query on disk, and keep it automatically up to date.

The refresh of a materialized view is incremental and very efficient, and using
materialized views can offer 100x or higher query speedups. If you require the
lowest latency queries, for example, for charts and dashboards, use materialized
views!

For a better understanding of what materialized views are for, read the
[introduction to materialized views](/docs/concept/mat-views/) documentation.

## Creating a materialized view

There is a fundamental limit to how fast certain aggregation and scanning
queries can execute, based on the data size, number of rows, disk speed, and
number of cores.

Materialized views let you bound the runtime for common aggregation queries, by
allowing you to pre-aggregate historical data ahead-of-time. This means that for
many queries, you only need to aggregate the latest partition's data, and then
you can use already aggregated results for historical data.

Throughout this document, we will use the [demo](https://demo.questdb.com/)
`trades` table. This is a table containing crypto trading data, with over 2
billion rows in total, growing at about 76 million rows per month, or 1+ billion
rows per year.

```questdb-sql title="trades ddl"
CREATE TABLE 'trades' (
	symbol SYMBOL,
	side SYMBOL,
	price DOUBLE,
	amount DOUBLE,
	timestamp TIMESTAMP
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

A full syntax definition can be found in the
[CREATE MATERIALIZED VIEW](/docs/reference/sql/create-mat-view) documentation.

Here is a materialized view taken from our demo, which calculates OHLC bars for
a candlestick chart. The view reads data from the base table, `trades`. It then
calculates aggregate functions such as `first`, `sum` etc. over 15 minutes time
buckets. The view is incrementally refreshed, meaning it is always up to date
with the latest `trades` data.

:::note

If you are unfamiliar with the OHLC concept, please see our
[OHLC guide](https://www.questdb.com/glossary/ohcl-candlestick).

:::

```questdb-sql title="trades_OHLC_15m DDL"
CREATE MATERIALIZED VIEW 'trades_OHLC_15m'
WITH BASE 'trades' REFRESH IMMEDIATE AS
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

In this example:

1. The view is called `trades_OHLC_15m`.
2. The base table is `trades`
   - This is the data source, and will trigger incremental refresh when new data
     is written.
3. The refresh strategy is `IMMEDIATE`
   - The data is automatically refreshed and incrementally written after a base
     table transaction occurs; efficient, fast, low maintenance.
4. The `SAMPLE BY` query contains two key column (`timestamp`, `symbol`) and
   five aggregates (`first`, `max`, `min`, `last`, `price`) calculated in `15m`
   time buckets.
5. The view is partitioned by `MONTH`. This partitioning is selected
   [by default](#default-partitioning) based on the `SAMPLE BY` interval.
6. No TTL is defined
   - Therefore, the materialized view will contain a summary of _all_ the base
     `trades` table's data.

Many parts of the above DDL statement are optional and can be omitted:

```questdb-sql title="trades_OHLC_15m compact DDL"
CREATE MATERIALIZED VIEW 'trades_OHLC_15m' AS
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

#### The view name

We recommend naming the view with some reference to the base table, its purpose,
and its sample size.

In our `trades_OHLC_15m` example, we combine:

- `trades` (the base table name)
- `OHLC` (the purpose)
- `15m` (the sample unit)

#### The base table

The base table triggers updating the materialized view, and is the main source
of raw data.

The `SAMPLE BY` query can contain a `JOIN`. However, the secondary `JOIN` tables
will not trigger any sort of refresh.

#### Refresh strategies

The `IMMEDIATE` refresh strategy incrementally updates the view when new data is
inserted into the base table. This means that only new data is written to the
view, so there is minimal write overhead.

Upon creation, or when the view is invalidated, a full refresh will occur, which
rebuilds the view from scratch.

Other than `IMMEDIATE` refresh, QuestDB supports `MANUAL` and timer
(`EVERY <interval>`) strategies for materialized views. Manual strategy means
that to refresh the view, you need to run the
[`REFRESH` SQL](/docs/reference/sql/refresh-mat-view/) explicitly. In case of
timer-based refresh the view is refreshed periodically, at the specified
interval.

The refresh strategy of an existing view can be changed any time with the
[`ALTER SET REFRESH`](/docs/reference/sql/alter-mat-view-set-refresh/) command.

## Period materialized views

In certain use cases, like storing trading day information, the data becomes
available at fixed time intervals. In this case, `PERIOD` variant of
materialized views can be used:

```questdb-sql title="Period materialized view"
CREATE MATERIALIZED VIEW trades_daily_prices
REFRESH PERIOD (LENGTH 1d TIME ZONE 'Europe/London' DELAY 2h) AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1d;
```

There is also compact `PERIOD` syntax:

```questdb-sql title="Compact syntax for period materialized views"
CREATE MATERIALIZED VIEW trades_daily_prices
REFRESH PERIOD (SAMPLE BY INTERVAL) AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1d;
```

The above DDL statement creates a period materialized view with single day
period, as defined by the SAMPLE BY clause. Such configuration improves
refresh performance in case of intensive real-time ingestion into the base
table since the refresh generates less transactions.

Refer to the following
[documentation page](/docs/reference/sql/create-mat-view/#period-materialized-views)
to learn more on period materialized views.

## Initial refresh

As soon as a materialized view is created an asynchronous refresh is started. In
situations when this is not desirable, `DEFERRED` keyword can be specified along
with the refresh strategy:

```questdb-sql title="Deferred manual refresh"
CREATE MATERIALIZED VIEW trades_daily_prices
REFRESH MANUAL DEFERRED AS
...
```

The `DEFERRED` keyword can be specified for any refresh strategy. Refer to the
following
[documentation page](/docs/reference/sql/create-mat-view/#initial-refresh) to
learn more on the keyword.

#### SAMPLE BY

Materialized views are populated using `SAMPLE BY` or time-based `GROUP BY`
queries.

When new data is written into the `base` table, an incremental refresh is
triggered, which adds this new data to the view.

Not all `SAMPLE BY` syntax is supported. In general, you should aim to keep your
query as simple as possible, and move complex transformations to an outside
query that runs on the down-sampled data.

#### PARTITION BY

Optionally, you may specify a partitioning scheme.

You should choose a partition unit which is larger than the sampling interval.
Ideally, the partition unit should be divisible by the sampling interval.

For example, an `SAMPLE BY 8h` clause fits nicely with a `DAY` partitioning
strategy, with 3 timestamp buckets per day.

#### Default partitioning

If the `PARTITION BY` clauses is omitted, the partitioning scheme is
automatically inferred from the `SAMPLE BY` clause.

| Interval       | Default partitioning |
| -------------- | -------------------- |
| &gt; 1 hour    | `PARTITION BY YEAR`  |
| &gt; 1 minute  | `PARTITION BY MONTH` |
| &lt;= 1 minute | `PARTITION BY DAY`   |

#### TTL

Though `TTL` was not included, it can be set on a materialized view, and does
not need to match the base table.

For example, if we only wanted to pre-aggregate the last 30 days of data, we
could add:

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

The example `trades_OHLC_15m` view is available on our demo, and contains
realtime crypto data - try it out!

:::

Materialized Views support **all the same queries** as regular QuestDB tables.

Here's how you can check today's trading data:

```questdb-sql title="querying trades_OHLC_15m" demo
trades_OHLC_15m WHERE timestamp IN today();
```

| timestamp                   | symbol   | open    | high    | low     | close   | volume             |
| --------------------------- | -------- | ------- | ------- | ------- | ------- | ------------------ |
| 2025-03-31T00:00:00.000000Z | ETH-USD  | 1807.94 | 1813.32 | 1804.69 | 1808.58 | 1784.144071999995  |
| 2025-03-31T00:00:00.000000Z | BTC-USD  | 82398.4 | 82456.5 | 82177.6 | 82284.5 | 34.47331241        |
| 2025-03-31T00:00:00.000000Z | DOGE-USD | 0.16654 | 0.16748 | 0.16629 | 0.16677 | 3052051.6327359965 |
| 2025-03-31T00:00:00.000000Z | AVAX-USD | 18.87   | 18.885  | 18.781  | 18.826  | 6092.852976000005  |
| ...                         | ...      | ...     | ...     | ...     | ...     | ...                |

### How much faster is it?

Let's run the OHLC query without using the view, against our `trades` table for the past six months:

```questdb-sql title="the OHLC query" demo
SELECT
    timestamp, symbol,
    first(price) AS open,
    max(price) as high,
    min(price) as low,
    last(price) AS close,
    sum(amount) AS volume
FROM trades
WHERE timestamp > dateadd('M', -6, now())
SAMPLE BY 15m;
```

This takes a few seconds to execute, as it scans and aggregates over half a billion rows.

Yet if we query the materialized view instead:

```questdb-sql title="OHLC materialized view unbounded" demo
SELECT * FROM trades_OHLC_15m
WHERE timestamp > dateadd('M', -6, now())
```

This returns in a couple of milliseconds, since the database only has to respond with data,
and not calculate anything - that has all been done efficiently, ahead of time.

### What about for fewer rows?

Let's try this calculation again, but just for one day instead of six months worth of rows.

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
ORDER BY timestamp;
```

| timestamp                   | symbol    | open   | high   | low     | close  | volume             |
| --------------------------- | --------- | ------ | ------ | ------- | ------ | ------------------ |
| 2025-03-30T00:00:00.000000Z | ADA-USD   | 0.6732 | 0.6744 | 0.671   | 0.6744 | 132304.36510000005 |
| 2025-03-30T00:00:00.000000Z | ADA-USDC  | 0.6727 | 0.673  | 0.671   | 0.6729 | 15614.750700000002 |
| 2025-03-30T00:00:00.000000Z | ADA-USDT  | 0.6732 | 0.6744 | 0.671   | 0.6744 | 132304.36510000005 |
| 2025-03-30T00:00:00.000000Z | AVAX-USD  | 19.602 | 19.632 | 19.518  | 19.631 | 3741.162465999998  |
| 2025-03-30T00:00:00.000000Z | AVAX-USDT | 19.602 | 19.632 | 19.518  | 19.631 | 3741.162465999998  |
| 2025-03-30T00:00:00.000000Z | BTC-USD   | 82650  | 82750  | 82563.6 | 82747  | 25.493136499999    |
| ...                         | ...       | ...    | ...    | ...     | ...    | ...                |

Calculating the OHLC for a single day takes only `16ms`.

We can get the same data using the materialized view:

```questdb-sql title="OHLC materialized view for yesterday" demo
SELECT * FROM trades_OHLC_15m
WHERE timestamp IN yesterday()
ORDER BY timestamp;
```

| timestamp                   | symbol    | open   | high   | low     | close  | volume             |
| --------------------------- | --------- | ------ | ------ | ------- | ------ | ------------------ |
| 2025-03-30T00:00:00.000000Z | ADA-USD   | 0.6732 | 0.6744 | 0.671   | 0.6744 | 132304.36510000005 |
| 2025-03-30T00:00:00.000000Z | ADA-USDC  | 0.6727 | 0.673  | 0.671   | 0.6729 | 15614.750700000002 |
| 2025-03-30T00:00:00.000000Z | ADA-USDT  | 0.6732 | 0.6744 | 0.671   | 0.6744 | 132304.36510000005 |
| 2025-03-30T00:00:00.000000Z | AVAX-USD  | 19.602 | 19.632 | 19.518  | 19.631 | 3741.162465999998  |
| 2025-03-30T00:00:00.000000Z | AVAX-USDT | 19.602 | 19.632 | 19.518  | 19.631 | 3741.162465999998  |
| 2025-03-30T00:00:00.000000Z | BTC-USD   | 82650  | 82750  | 82563.6 | 82747  | 25.493136499999    |
| ...                         | ...       | ...    | ...    | ...     | ...    | ...                |

This returns the data in just `2ms` over 7x faster - again, because it doesn't
have to calculate anything. The data has already been efficiently
pre-aggregated, cached by the materialized view, and persisted to disk. No
aggregation is required, and hardly any rows are scanned!

So even for **small amounts of data**, a materialized view can be extremely
useful.

## Limitations

- Not all `SAMPLE BY` syntax is supported, for example, `FILL`.
- `IMMEDIATE` refresh is only triggered by inserts into the `base` table, not
  join tables.

## LATEST ON materialized views

`LATEST ON` queries can have variable performance, based on how frequently the
symbols in the `PARTITION BY` column have new entries written to the table.
Infrequently updated symbols require scanning more data to find their last
entry.

For example, pretend you have two symbols, `A` and `B`, and 100 million rows.

Then, there is one row with `B`, at the start of the data set, and the rest are
`A`.

Unfortunately, the database will scan backwards and scan all 100 million rows of
data, just to find the `B` entry.

But materialized views offer a solution to this performance issue too!

```questdb-sql title="LATEST ON on demo trades" demo
SELECT * FROM trades LATEST ON timestamp PARTITION BY symbol;
```

| symbol     | side | price      | amount   | timestamp                   |
| ---------- | ---- | ---------- | -------- | --------------------------- |
| XLM-BTC    | sell | 0.00000163 | 541.0    | 2024-08-21T16:56:15.038557Z |
| AVAX-BTC   | sell | 0.00039044 | 10.125   | 2024-08-21T18:00:24.549949Z |
| MATIC-BTC  | sell | 0.0000088  | 622.6    | 2024-08-21T18:01:21.607212Z |
| ADA-BTC    | buy  | 0.00000621 | 127.32   | 2024-08-21T18:05:37.852092Z |
| DOT-BTC    | buy  | 0.0000774  | 0.01     | 2024-08-21T18:09:22.584461Z |
| UNI-BTC    | buy  | 0.0001152  | 25.1     | 2024-08-21T18:11:26.751508Z |
| DOGE-BTC   | sell | 0.00000175 | 706.9    | 2024-08-21T18:12:27.083291Z |
| MATIC-USDT | sell | 0.3724     | 51.31361 | 2024-09-07T11:09:15.891000Z |
| MATIC-USD  | sell | 0.3724     | 51.31361 | 2024-09-07T11:09:15.891000Z |
| ETH-DAI    | sell | 3381.02    | 0.019513 | 2024-12-30T05:30:21.620999Z |
| ...        | ...  | ...        | ...      | ...                         |

This takes around `3s` to execute. Now, let's see how much data needed to be
scanned:

```questdb-sql title="filtering for the time range" demo
SELECT min(timestamp), max(timestamp)
FROM trades
LATEST ON timestamp
PARTITION BY symbol;
```

| min                         | max                         |
| --------------------------- | --------------------------- |
| 2024-08-21T16:56:15.038557Z | 2025-09-26T14:21:25.435000Z |

So the database scanned approximately 13 months of data to serve this query. How
many rows was that?

```questdb-sql title="number of rows the LATEST ON scanned" demo
SELECT count()
FROM trades
WHERE timestamp BETWEEN '2024-08-21T16:56:15.038557Z' AND '2025-09-26T14:21:25.435000Z';
```

| count      |
| ---------- |
| 1274995213 |

Yes, **~1275 million rows**, just to serve the most recent **42 rows**, one for
each symbol.

Let's fix this using a new materialized view.

Observe that we have `42` unique symbols in the dataset.

If we were to take a `LATEST ON` query for a single day, we would therefore
expect up to `84` rows (`42` buys, `42` sells):

```questdb-sql title="yesterday() LATEST ON" demo
SELECT * FROM trades WHERE timestamp IN yesterday()
LATEST ON timestamp PARTITION BY symbol, side
ORDER BY symbol, side, timestamp;
```

| symbol    | side | price   | amount     | timestamp                   |
| --------- | ---- | ------- | ---------- | --------------------------- |
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


Instead of using the `LATEST ON` syntax, we can use a `SAMPLE BY` equivalent,
which massively reduces the number of rows we need to query.

Then, we run this `SAMPLE BY` automatically using a materialized view, so we
always have the fastest possible `LATEST ON` query.

### Pre-aggregating the data

We will pre-aggregate the ~1275 million rows into just ~24000.

Instead of storing the raw data, we will store one row, per symbol, per side,
per day of data.

```questdb-sql title="down-sampling test query" demo
SELECT timestamp, symbol, side, price, amount, "latest" as timestamp FROM (
    SELECT timestamp,
           symbol,
           side,
           last(price) AS price,
           last(amount) AS amount,
           last(timestamp) as latest
    FROM trades
    WHERE timestamp BETWEEN '2024-08-21T16:56:15.038557Z' AND '2025-09-26T14:21:25.435000Z'
    SAMPLE BY 1d
) ORDER BY timestamp;
```

This result set comprises just `24,625` rows, instead of ~1275 million. That's
51770x fewer rows the database needs to scan to handle the query.

Here it is as a materialized view:

```questdb-sql title="LATEST ON materialized view"
CREATE MATERIALIZED VIEW 'trades_latest_1d' AS
SELECT
  timestamp,
  symbol,
  side,
  last(price) AS price,
  last(amount) AS amount,
  last(timestamp) as latest
FROM trades
SAMPLE BY 1d;
```

You can try this view out on our demo:

```questdb-sql title="trades_latest_1d" demo
SELECT * FROM trades_latest_1d;
```

Then, you can query this 'per-day LATEST ON' view to quickly calculate the
'true' `LATEST ON` result.

```questdb-sql title="LATEST ON over the trades_latest_1d" demo
SELECT symbol, side, price, amount, "latest" as timestamp FROM (
	trades_latest_1d
	LATEST ON timestamp
	PARTITION BY symbol, side
) ORDER BY timestamp DESC;
```

And in just a few milliseconds, we get the result:

| symbol    | side | price       | amount     | timestamp                   |
| --------- | ---- | ----------- | ---------- | --------------------------- |
| SOL-USDT  | buy  | 194.01      | 5.565995   | 2025-09-26T14:36:24.015000Z |
| SOL-USD   | buy  | 194.01      | 5.565995   | 2025-09-26T14:36:24.015000Z |
| ETH-USD   | buy  | 3933.18     | 0.01       | 2025-09-26T14:36:24.013999Z |
| ETH-USDT  | buy  | 3933.18     | 0.01       | 2025-09-26T14:36:24.013999Z |
| BTC-USDT  | sell | 108977.1    | 0.00001229 | 2025-09-26T14:36:23.879000Z |
| ...       | ...  | ...         | ...        | ...                         |

Seconds down to milliseconds - **100x, even 1000x faster!**

## Architecture and internals

The rest of this document contains information about how materialized views work
internally.

### Storage model

Materialized views in QuestDB are implemented as special tables that maintain
their data independently of their base tables. They use the same underlying
storage engine as regular tables, benefiting from QuestDB's columnar storage and
partitioning capabilities.

### Refresh mechanism

Unlike regular views, which recompute their results at query time, materialized
views in QuestDB are incrementally refreshed as new data is added to the base
table. This approach ensures that only the **relevant time slices** of the view
are updated, avoiding the need to recompute the entire dataset. The refresh
process works as follows:

1. New data is inserted into the base table.
2. The time-range of this data is identified.
3. This data is extracted and used to recompute the materialized view.

This refresh happens asynchronously, minimizing any impact on write performance.
The refresh state of the materialized view is tracked using transaction numbers.
The transaction numbers can be compared with the base table, for monitoring the
'refresh lag'.

For example, if a base table receives new rows for `2025-02-18`, only that day's
relevant time slices are recomputed, rather than reprocessing all historical
data.

You can monitor refresh status using the `materialized_views()` system function:

```questdb-sql title="Listing all materialized views" demo
SELECT
  view_name,
  last_refresh_start_timestamp,
  last_refresh_finish_timestamp,
  view_status,
  refresh_base_table_txn,
  base_table_txn
FROM materialized_views();
```

Here is an example output:

| view_name   | last_refresh_start_timestamp | last_refresh_finish_timestamp | view_status | refresh_base_table_txn | base_table_txn |
| ----------- | ---------------------------- | ----------------------------- | ----------- | ---------------------- | -------------- |
| trades_view | 2025-05-02T13:46:11.828212Z  | 2025-05-02T13:46:21.828212Z   | valid       | 102                    | 102            |

When `refresh_base_table_txn` matches `base_table_txn`, the materialized view is
fully up-to-date.

#### Refreshing an invalid view

If a materialized view becomes invalid, you can check its status:

```questdb-sql title="Checking view status" demo
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
  in `SAMPLE BY` queries.
- Must not use non-deterministic SQL functions like `now()` or `rnd_uuid4()`.
- Must use join conditions that are compatible with incremental refreshing.
- When the base table has [deduplication](/docs/concept/deduplication/) enabled,
  the non-aggregate columns selected by the materialized view query must be a
  subset of the `DEDUP` keys from the base table.

We intend to loosen some of these restrictions in future.

### View invalidation

The view's structure is tightly coupled with its base table.

The main cause of invalidation for a materialized view, is when the table schema
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
