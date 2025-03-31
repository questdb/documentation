---
title: Materialized views
sidebar_label: Materialized views
description:
  Overview of QuestDB's materialized views. This feature helps you significantly
  speed up your aggregation queries.
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

A materialized view is a database object that stores the pre-computed results of
a query. Unlike regular views, which compute their results at query time,
materialized views persist their data to disk, making them particularly
efficient for expensive aggregate queries that are run frequently.

## Related documentation

<!--
- **Step-by-step tutorial**

  - [How to create a materialized view](/blog/how-to-create-a-materialized-view/):
    A full walkthrough of simple and advanced materialized views
-->

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

:::note 

**tl;dr**: materialized views should be used to pre-aggregate and down-sample historical data.

This data can then be used in more complex queries without the database having to scan and aggregate
huge data sets that do not change frequently.

:::

There is a fundamental limit to how fast certain aggregation and scanning queries can execute,
based on the data size, number of rows, disk speed, and number of cores.

Materialized Views help to bound the runtime for common aggregation queries, by allowing you to 
pre-aggregate historical data ahead-of-time. This means that for many queries, you only need to aggregate
the latest partition's data, and then you can use already aggregated results for historical data.

Let's take a simple example. 

### Counting historical rows

Say we have a trading table, such as the one we use on demo:

```questdb-sql title="trades ddl"
CREATE TABLE 'trades' ( 
	symbol SYMBOL CAPACITY 256 CACHE,
	side SYMBOL CAPACITY 256 CACHE,
	price DOUBLE,
	amount DOUBLE,
	timestamp TIMESTAMP
) timestamp(timestamp) PARTITION BY DAY WAL
WITH maxUncommittedRows=500000, o3MaxLag=2000000us;
```

Let's ask the question 'how many entries are there for each symbol in the table, counted for every day'.

That corresponds to a query like this:


```questdb-sql title="per-symbol count by day from demo trades" demo
SELECT timestamp, symbol, count()
FROM trades
SAMPLE BY 1d;
```

This executes in around `3s` on the demo box, and returns data like this:

| timestamp                   | symbol  | count  |
|-----------------------------|---------|--------|
| 2022-03-08T00:00:00.000000Z | ETH-USD | 188733 |
| 2022-03-08T00:00:00.000000Z | BTC-USD | 142338 |
| 2022-03-09T00:00:00.000000Z | ETH-USD | 560405 |
| 2022-03-09T00:00:00.000000Z | BTC-USD | 626094 |
| 2022-03-10T00:00:00.000000Z | ETH-USD | 544526 |
| 2022-03-10T00:00:00.000000Z | BTC-USD | 622345 |
| 2022-03-11T00:00:00.000000Z | BTC-USD | 617055 |
| 2022-03-11T00:00:00.000000Z | ETH-USD | 527577 |
| ...                         | ...     | ...    |

This is fast considering the number of rows that had to be scanned and grouped:

```questdb-sql title="row count in demo trades table" demo
SELECT count() FROM trades;
```

| count      |
| ---------- |
| 1668535733 |

That's over 1.6 billion rows.

But a single day has far fewer rows:

```questdb-sql title="yesterday's row count" demo
SELECT count() FROM trades WHERE timestamp in yesterday();
```

| count   |
| ------- |
| 1772562 |

And those rows can be aggregated in just `8ms`:

```questdb-sql title="counting for a single day" demo
SELECT timestamp, symbol, count()
FROM trades
WHERE timestamp IN yesterday()
SAMPLE BY 1d;
```

| timestamp                   | symbol    | count  |
|-----------------------------|-----------|--------|
| 2025-03-30T00:00:00.000000Z | ETH-USDT  | 260071 |
| 2025-03-30T00:00:00.000000Z | ETH-USD   | 260071 |
| 2025-03-30T00:00:00.000000Z | BTC-USDT  | 225629 |
| 2025-03-30T00:00:00.000000Z | BTC-USD   | 225629 |
| 2025-03-30T00:00:00.000000Z | BTC-USDC  | 21656  |
| 2025-03-30T00:00:00.000000Z | DOGE-USDT | 88882  |
| 2025-03-30T00:00:00.000000Z | DOGE-USD  | 88882  |
| ...                         | ...       | ...    |

Materialized Views allow you to get similar response times but for aggregations including historical data.

### Caching OHLC results

Let's look at a real-world example now - calculating OHLC bars over trading data.

On demo, we have an example materialized view, `trades_OHLC_15m`. You can look at its latest data:

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


This data can be constructed from a `SAMPLE BY` query:

```questdb-sql title="inspect the materialized view query" demo 
SHOW CREATE MATERIALIZED VIEW trades_OHLC_15m;
```

which returns this ddl:

```questdb-sql title="materialized view definition"
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
) PARTITION BY DAY;
```

Ignoring the outer query, you can see that there is a `SAMPLE BY` query inside, which is
a classic example of a query to calculate OHLC bars, in 15 minute buckets:

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

This takes `5-6s` to execute on demo.

Let's now limit the calculation to a single day:

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

We can find the exact same data by querying the materialized view instead:

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


This returns the exact same data in only `2ms` - because we already have it pre-aggregated, 
cached by the materialized view, and persisted durably on disk. Only the sort and filter and 
executed, no aggregation is needed.

We can query the historical time range too:

```questdb-sql title="OHLC materialized view unbounded" demo
trades_OHLC_15m;
```

This returns in `1ms`.

### Defining materialized views

Materialized views can be created using a few definitions:

1. A name for the view.
2. A `base` table, from which data is sourced.
3. A refresh strategy 
4. A basic `SAMPLE BY` query, used to aggregate and down-sample the raw data.
5. A partitioning strategy.
6. (Optional) A time-to-live (TTL).

Taking our earlier example:

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
) PARTITION BY DAY;
```

In this example:

1. The view is called `trades_OHLC_15m`.
2. The base table is `trades`.
3. The refresh strategy is `INCREMENTAL`.
4. The `SAMPLE BY` query is an OHLC query sampled over `15m` intervals.
5. The view will be partitioned by `DAY`
6. No TTL is defined, therefore, the materialized view will contain a summary of all of the base table's data.

#### The view name
We would recommend naming the view with some reference to the base table, its purpose, and its sample size.

In our `trades_OHLC_15m` example, we combine:

- `trades` (the base table name)
- `OHLC` (the purpose) 
- `15m` (the sample unit) 

#### The base table

The base table drives updates to the materialized view, and is the main source of raw data.

The `SAMPLE BY` query can contain a `JOIN`. However, the secondary `JOIN` tables will not trigger
any sort of refresh strategy.

#### Refresh strategies

Currently, only `INCREMENTAL` is supported. This strategy incrementally updates the view when new
data is inserted into the base table.

Upon creation, or when the view is invalidated, a full refresh occurs.

#### `SAMPLE BY`

Not all `SAMPLE BY` syntax is supported. In general, you should aim to keep your query as simple as possible,
and move complex transformations to an outside query that runs on the down-sampled data.

#### `PARTITION BY`

In the above example, the view is partitioned by day. In general, the sampling interval should be smaller than
the partitioning interval, and ideally divisible.

For example, an `SAMPLE BY 8h` clause fits nicely with a `DAY` partitioning strategy, with 3 timestamp buckets per day.

#### `TTL`

Though `TTL` was not included, it can be set on a materialized view, and does not need to match the base table.

For example, if we only wanted to pre-aggregate the last 30 days of data, we could add:

```questdb-sql
PARTITION BY DAY TTL 30 DAYS;
```

to the end of our materialized view definition.

### Limitations

#### Beta
- Full refreshes over large datasets may exhaust RSS i.e. run out of memory. 
    - This will be amended to build the view incrementally, bounding memory usage. 
- Not all `SAMPLE BY` syntax is well-supported, for example time zones and fills.
    - We will support these features in future. 
- The `INCREMENTAL` refresh strategy relies on deduplicated inserts (O3 writes)
    - We will instead delete a time range and insert the data as an append, which is **much** faster.
    - This also means that currently, deduplication keys must be aligned across the `base` table and the view.

#### Post-release

- Only `INCREMENTAL` refresh is supported
    - We intend to ad alternatives, such as:
        - `PERIODIC` (once per partition), 
        - `TIMER` (once per time interval)
        - `MANUAL` (only when manually triggered)
- `INCREMENTAL` refresh is only triggered by inserts into the `base` table. 

## What about `LATEST ON` queries?

`LATEST ON` queries frequently have variable performance, based on how frequently the symbols in the `PARTITION BY` column
have new entries written to the table. Infrequently updated symbols require scanning more data to find their last entry.

For example, pretend you have two symbols, `A` and `B`, and 100 million rows.

Then there is 1 row with `B`, at the start of the data set, and the rest are `A`.

Unfortunately, the database will scan backwards and scan all 100 million rows of data just to find the `B` entry.

But not to worry, materialized views help us here too!

### A `LATEST ON` materialized view

Taking the `trades` table again from our demo:

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

So we had to scan approximately 7 months of data to serve this query! How many rows is that?

```questdb-sql title="number of rows the LATEST ON scanned" demo
SELECT count()
FROM trades
WHERE timestamp BETWEEN '2024-08-21T16:56:15.038557Z' AND '2025-03-31T12:55:28.193000Z';
```

| count     |
| --------- |
| 766834703 |

Yes, ~767 million rows, just to serve the most recent 42 rows, one for each symbol.

So how can we help improve this using a materialized view?

### Building the view

Observe that we have 42 unique symbols in the dataset. If we were to take a `LATEST ON` query for a single day,
we would therefore expect up to 42 rows:

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

This rewrite forms the basis of our materialized view.

Whilst we don't have a native `LATEST ON` materialized view, we can still use its down-sampling
power to help us out.

See, the problem is that `LATEST ON`, in the time-unbounded case, will scan as far back as it needs
to find a row for every symbol.

Unfortunately, if even one of your symbols is infrequently updated, the query will scan huge amounts of data
just to find a single row. 

#### Down-sampling

Instead, let's try to reduce the size of our data-set dramatically. For example,
let's say that instead of the 767m rows, we can have one row, per symbol, per side, per day.

We can calculate such a range like this:

```questdb-sql title="down-sampling the range" demo

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

This gives us effectively a `LATEST ON` result for each `DAY` in that time range.

This result set comprises just `14595` rows, instead of 767 million - and is much faster to scan.

#### Back to the view

Let's convert this into a materialized view definition:

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

You can query this view on demo:

```questdb-sql title="trades_latest_1d" demo
trades_latest_1d;
```

Now, this materialized view doesn't include the exact output from a `LATEST ON` query, but we can
use it as a data source for this query.

```questdb-sql title="LATEST ON over the trades_latest_1d" demo
SELECT symbol, side, price, amount, "latest" as timestamp FROM (
	trades_latest_1d 
	LATEST ON timestamp 
	PARTITION BY symbol, side
) ORDER BY timestamp;
```

And in a few milliseconds, we get the result:

| symbol   | side | price   | amount    | timestamp                   |
|----------|------|---------|-----------|-----------------------------|
| ETH-BTC  | sell | 0.02196 | 0.005998  | 2025-03-31T14:24:18.916000Z |
| DAI-USDT | sell | 1.0006  | 53        | 2025-03-31T14:29:19.392999Z |
| DAI-USD  | sell | 1.0006  | 53        | 2025-03-31T14:29:19.392999Z |
| DAI-USD  | buy  | 1.0007  | 29.785106 | 2025-03-31T14:30:33.394000Z |
| DAI-USDT | buy  | 1.0007  | 29.785106 | 2025-03-31T14:30:33.394000Z |
| ...      | ...  | ...     | ...       | ...                         |


## Architecture and behaviour

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
