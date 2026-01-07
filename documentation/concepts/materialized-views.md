---
title: Materialized views
sidebar_label: Materialized views
description:
  Materialized views are designed to maintain the speed of your queries as you scale your data.
  Understand how to structure your queries to take advantage of this feature.
---

A materialized view is a special QuestDB table that stores the pre-computed
results of a query. Unlike [regular views](/docs/concepts/views/), which compute
their results at query time, materialized views persist their data to disk,
making them particularly efficient for expensive aggregate queries that are run
frequently.

## What are materialized views for?

Let's say your application ingests trade data into a table like this:

```questdb-sql title="trades table"
CREATE TABLE trades (
  symbol SYMBOL,
  side SYMBOL,
  price DOUBLE,
  amount DOUBLE,
  timestamp TIMESTAMP
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

As your QuestDB instance grows from gigabytes to terabytes, aggregation queries
become a bottleneck. A common pattern is using `SAMPLE BY` to bucket data by
time - for example, calculating notional value (price × amount) by the minute:

```questdb-sql title="SAMPLE BY query" demo
SELECT
  timestamp,
  symbol,
  side,
  sum(price * amount) AS notional
FROM trades
WHERE timestamp IN today()
SAMPLE BY 1m;
```

Thanks to partition pruning, this query only scans today's data. But even so,
aggregating millions of rows takes time - and dashboards or applications may run
this query repeatedly.

Materialized views solve this by pre-computing and storing the aggregated
results. When new data arrives, only the new rows are processed incrementally.
Querying the materialized view becomes a simple lookup rather than a
re-aggregation, making dashboard refreshes near-instant.

When you create a materialized view you register your time-based grouping
query with the QuestDB database against a base table.

![sampling into a materialized view](/images/docs/concepts/mat-view-agg.svg)

Conceptually a materialized view is an on-disk table tied to a query:
As you add new data to the base table, the materialized view will efficiently
update itself. You can then query the materialized view as a regular table
without the impact of a full table scan of the base table.

## Quick example

Create a materialized view that calculates 15-minute OHLC bars:

```questdb-sql title="Create a materialized view"
CREATE MATERIALIZED VIEW trades_ohlc_15m AS
SELECT
  timestamp,
  symbol,
  first(price) AS open,
  max(price) AS high,
  min(price) AS low,
  last(price) AS close,
  sum(amount) AS volume
FROM trades
SAMPLE BY 15m;
```

Query it like any table:

```questdb-sql title="Query the materialized view" demo
SELECT * FROM trades_ohlc_15m
WHERE timestamp IN today();
```

That's it. The view refreshes incrementally as new data arrives in `trades`.
Details on customization and options follow below.

## When to use materialized views

Materialized views are ideal for:

- **Heavy aggregations over large datasets**: Queries that scan millions of rows
- **Frequently accessed summaries**: Dashboard queries that run repeatedly
- **Historical summaries**: Data that doesn't need real-time accuracy
- **OHLC calculations**: Candlestick charts, time-bucketed analytics

Use regular [views](/docs/concepts/views/) instead when:

- Query execution cost is acceptable for your workload
- You need parameterized queries with `DECLARE`
- You need patterns not supported by materialized views (e.g., data enrichment)
- Storage cost is a concern (materialized views consume disk space)

The key tradeoff: views execute the full query each time (multi-threaded, can
be resource-intensive), while materialized views pre-compute results so queries
become simple lookups. For dashboards with many concurrent users, running
parallel aggregations doesn't scale - materialized views reduce this to O(1)
reads on a smaller, pre-aggregated dataset.

### Not suited for: data enrichment

Materialized views support JOINs, but `SAMPLE BY` (aggregation) is mandatory.
This means you can enrich aggregated results with data from other tables, but
you cannot keep raw (non-aggregated) rows while adding enrichment columns.

For example, joining aggregated trades with instrument metadata works:

```questdb-sql title="Supported: aggregation with JOIN"
CREATE MATERIALIZED VIEW trades_with_metadata AS
SELECT
  t.timestamp,
  t.symbol,
  m.description,
  sum(t.amount) AS volume
FROM trades t
JOIN instruments m ON t.symbol = m.symbol
SAMPLE BY 1h;
```

But this pattern does not work:

```questdb-sql title="Not supported: enrichment without aggregation"
-- Users try this but it won't work
CREATE MATERIALIZED VIEW enriched_trades AS
SELECT
  t.timestamp,
  t.symbol,
  t.price,
  t.amount,
  h.hourly_vwap    -- aggregated value from another table
FROM trades t
ASOF JOIN hourly_stats h ON t.symbol = h.symbol;
```

The view cannot maintain a 1:1 row mapping with the base table.

Also note: only changes to the base table (the one in `SAMPLE BY`) trigger a
refresh. Changes to joined tables do not trigger updates.

**Coming soon**: We are actively developing a new type of materialized view that
will support data enrichment use cases. Stay tuned for updates.

## Creating a materialized view

### Basic syntax

The simplest form requires only a `SAMPLE BY` query:

```questdb-sql title="Basic materialized view"
CREATE MATERIALIZED VIEW trades_hourly AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price,
  sum(amount) AS volume
FROM trades
SAMPLE BY 1h;
```

For full syntax, see
[CREATE MATERIALIZED VIEW](/docs/query/sql/create-mat-view).

### Extended syntax

For more control, use the extended syntax with parentheses:

```questdb-sql title="Extended syntax"
CREATE MATERIALIZED VIEW trades_ohlc_15m
WITH BASE trades REFRESH IMMEDIATE AS (
  SELECT
    timestamp,
    symbol,
    first(price) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price) AS close,
    sum(amount) AS volume
  FROM trades
  SAMPLE BY 15m
) PARTITION BY MONTH;
```

This allows specifying:

- `WITH BASE`: Explicit base table (required for JOINs)
- `REFRESH`: Refresh strategy
- `PARTITION BY`: Partitioning scheme
- `TTL`: Data retention policy

### Naming conventions

We recommend naming views with reference to the base table, purpose, and sample
interval:

- `trades_ohlc_15m` - trades table, OHLC purpose, 15-minute buckets
- `sensors_avg_1h` - sensors table, averages, hourly buckets

### The query

Materialized views require a `SAMPLE BY` or time-based `GROUP BY` query.

**Supported:**

- Aggregate functions: `sum`, `avg`, `min`, `max`, `first`, `last`, `count`
- `JOIN` with other tables (only the base table triggers refresh)
- `WHERE` clauses

**Not supported:**

- `FILL` clause
- `FROM-TO` clause
- `ALIGN TO FIRST OBSERVATION`
- Non-deterministic functions like `now()` or `rnd_uuid4()`

Keep queries simple. Move complex transformations to queries that run on the
materialized view.

### Refresh strategies

#### IMMEDIATE (default)

Incrementally updates the view when new data is inserted into the base table:

```questdb-sql
CREATE MATERIALIZED VIEW my_view
REFRESH IMMEDIATE AS
SELECT ... FROM base_table SAMPLE BY 1h;
```

This is the recommended strategy for most use cases. Only new data is processed,
minimizing write overhead.

#### MANUAL

Requires explicit refresh via SQL:

```questdb-sql
CREATE MATERIALIZED VIEW my_view
REFRESH MANUAL AS
SELECT ... FROM base_table SAMPLE BY 1h;
```

Refresh manually with:

```questdb-sql
REFRESH MATERIALIZED VIEW my_view;
```

#### EVERY interval

Refreshes on a timer:

```questdb-sql
CREATE MATERIALIZED VIEW my_view
REFRESH EVERY 5m AS
SELECT ... FROM base_table SAMPLE BY 1h;
```

#### PERIOD refresh

For data that arrives at fixed intervals (e.g., end-of-day prices):

```questdb-sql title="Period refresh"
CREATE MATERIALIZED VIEW trades_daily
REFRESH PERIOD (LENGTH 1d TIME ZONE 'Europe/London' DELAY 2h) AS
SELECT
  timestamp,
  symbol,
  avg(price) AS avg_price
FROM trades
SAMPLE BY 1d;
```

Or use compact syntax to match the `SAMPLE BY` interval:

```questdb-sql title="Period refresh matching SAMPLE BY"
CREATE MATERIALIZED VIEW trades_daily
REFRESH PERIOD (SAMPLE BY INTERVAL) AS
SELECT timestamp, symbol, avg(price) AS avg_price
FROM trades
SAMPLE BY 1d;
```

Period refresh reduces transaction overhead during intensive real-time
ingestion.

Change refresh strategy anytime with
[`ALTER MATERIALIZED VIEW SET REFRESH`](/docs/query/sql/alter-mat-view-set-refresh/).

### Partitioning

Specify a partitioning scheme larger than the sampling interval:

```questdb-sql
CREATE MATERIALIZED VIEW my_view AS (
  SELECT timestamp, symbol, sum(amount) FROM trades SAMPLE BY 8h
) PARTITION BY DAY;
```

An `8h` sample fits nicely with `DAY` partitioning (3 buckets per partition).

#### Default partitioning

If omitted, partitioning is inferred from `SAMPLE BY`:

| Interval        | Default partitioning |
| --------------- | -------------------- |
| &gt; 1 hour     | `PARTITION BY YEAR`  |
| &gt; 1 minute   | `PARTITION BY MONTH` |
| &lt;= 1 minute  | `PARTITION BY DAY`   |

### TTL (Time-To-Live)

Limit how much history the materialized view retains:

```questdb-sql title="Materialized view with TTL"
CREATE MATERIALIZED VIEW trades_hourly AS (
  SELECT timestamp, symbol, avg(price) AS avg_price
  FROM trades
  SAMPLE BY 1h
) PARTITION BY WEEK TTL 8 WEEKS;
```

The view's TTL is independent of the base table's TTL.

### Initial refresh

When created, materialized views start an **asynchronous full refresh**:

- `CREATE MATERIALIZED VIEW` returns immediately
- The view is queryable right away but **returns no data** until refresh
  completes
- For large base tables, this may take significant time

Check if the initial refresh is complete:

```questdb-sql
SELECT view_name, view_status, refresh_base_table_txn, base_table_txn
FROM materialized_views()
WHERE view_name = 'your_view';
```

When `refresh_base_table_txn` equals `base_table_txn`, the view is fully
populated.

To defer initial refresh, use `DEFERRED`:

```questdb-sql
CREATE MATERIALIZED VIEW my_view
REFRESH MANUAL DEFERRED AS
SELECT ... FROM trades SAMPLE BY 1h;
```

## Querying materialized views

:::note

The example `trades_ohlc_15m` view is available on our
[demo](https://demo.questdb.io), and contains realtime crypto data - try it out!

:::

Materialized views support **all the same queries** as regular QuestDB tables:

```questdb-sql title="Query today's data" demo
SELECT * FROM trades_ohlc_15m
WHERE timestamp IN today();
```

| timestamp                   | symbol   | open    | high    | low     | close   | volume             |
| --------------------------- | -------- | ------- | ------- | ------- | ------- | ------------------ |
| 2025-03-31T00:00:00.000000Z | ETH-USD  | 1807.94 | 1813.32 | 1804.69 | 1808.58 | 1784.144071999995  |
| 2025-03-31T00:00:00.000000Z | BTC-USD  | 82398.4 | 82456.5 | 82177.6 | 82284.5 | 34.47331241        |
| ...                         | ...      | ...     | ...     | ...     | ...     | ...                |

### Performance comparison

Without a materialized view, aggregating 1 month of data:

```questdb-sql title="Direct query - slow" demo
SELECT
  timestamp, symbol,
  first(price) AS open, max(price) AS high,
  min(price) AS low, last(price) AS close,
  sum(amount) AS volume
FROM trades
WHERE timestamp > dateadd('M', -1, now())
SAMPLE BY 15m;
```

This takes hundreds of milliseconds, scanning tens of millions of rows.

With the materialized view:

```questdb-sql title="Materialized view - fast" demo
SELECT * FROM trades_ohlc_15m
WHERE timestamp > dateadd('M', -1, now());
```

This returns in single-digit milliseconds. The data is pre-aggregated, so no
aggregation work is needed at query time.

## Managing materialized views

### Listing views

```questdb-sql title="List all materialized views" demo
SELECT
  view_name,
  base_table_name,
  view_status,
  last_refresh_finish_timestamp
FROM materialized_views();
```

### Monitoring refresh status

```questdb-sql title="Check refresh lag"
SELECT
  view_name,
  refresh_base_table_txn,
  base_table_txn,
  base_table_txn - refresh_base_table_txn AS lag
FROM materialized_views();
```

When `refresh_base_table_txn` equals `base_table_txn`, the view is fully
up-to-date.

### View invalidation

Materialized views become invalid when their base table schema or data is
modified in incompatible ways:

- Dropping columns referenced by the view
- Dropping partitions
- Renaming the base table
- `TRUNCATE` or `UPDATE` operations

Check for invalid views:

```questdb-sql title="Find invalid views"
SELECT view_name, view_status, invalidation_reason
FROM materialized_views()
WHERE view_status = 'invalid';
```

### Refreshing an invalid view

To restore an invalid view with a full refresh:

```questdb-sql
REFRESH MATERIALIZED VIEW view_name FULL;
```

This deletes existing data and rebuilds from the base table. For large tables,
this may take significant time. Cancel with
[`CANCEL QUERY`](/docs/query/sql/cancel-query/) if needed.

## Advanced: LATEST ON optimization

`LATEST ON` queries can be slow when some symbols are infrequently updated,
requiring scans across large amounts of data:

```questdb-sql title="Slow LATEST ON" demo
SELECT * FROM trades LATEST ON timestamp PARTITION BY symbol;
```

This might scan billions of rows to find the latest entry for rarely-updated
symbols.

### Solution: Pre-aggregate with a materialized view

Create a view that stores one row per symbol per day:

```questdb-sql title="LATEST ON materialized view"
CREATE MATERIALIZED VIEW trades_latest_1d AS
SELECT
  timestamp,
  symbol,
  side,
  last(price) AS price,
  last(amount) AS amount,
  last(timestamp) AS latest
FROM trades
SAMPLE BY 1d;
```

Then query the view:

```questdb-sql title="Fast LATEST ON" demo
SELECT symbol, side, price, amount, latest AS timestamp
FROM (
  trades_latest_1d
  LATEST ON timestamp
  PARTITION BY symbol, side
)
ORDER BY timestamp DESC;
```

**Result**: Seconds down to milliseconds - 100x to 1000x faster.

Instead of scanning ~1.3 billion rows, the database scans ~25,000 pre-aggregated
rows.

## Technical reference

### Query constraints

Materialized view queries:

- Must use `SAMPLE BY` or `GROUP BY` with a designated timestamp column
- Must not use `FROM-TO`, `FILL`, or `ALIGN TO FIRST OBSERVATION`
- Must not use non-deterministic functions (`now()`, `rnd_uuid4()`)
- Must use join conditions compatible with incremental refresh
- When the base table uses [deduplication](/docs/concepts/deduplication/), non-aggregate
  columns must be a subset of the `DEDUP` keys

### Base table relationship

Every materialized view is tied to a base table:

- For single-table queries, the base table is automatically determined
- For JOINs, specify the base table with `WITH BASE`

Only inserts to the base table trigger `IMMEDIATE` refresh. Changes to joined
tables do not trigger refresh.

### Storage model

Materialized views use the same storage engine as regular tables:

- Columnar storage
- Partitioning
- Independent TTL management

### Refresh mechanism

Incremental refresh process:

1. New data is inserted into the base table
2. The time-range of new data is identified
3. Only affected time slices are recomputed

This happens asynchronously, minimizing write performance impact.

## Enterprise features

### Replicated views

Replication of the base table is independent of materialized view maintenance.

Promoting a replica to primary may trigger a full materialized view refresh if
the replica's view was not fully up-to-date.

## Related documentation

- **Related Concepts**
  - [Views](/docs/concepts/views/): Virtual tables that compute results at query
    time

- **SQL Commands**

  - [`CREATE MATERIALIZED VIEW`](/docs/query/sql/create-mat-view/): Create a
    new materialized view
  - [`DROP MATERIALIZED VIEW`](/docs/query/sql/drop-mat-view/): Remove a
    materialized view
  - [`REFRESH MATERIALIZED VIEW`](/docs/query/sql/refresh-mat-view/):
    Manually refresh a materialized view
  - [`ALTER MATERIALIZED VIEW ADD INDEX`](/docs/query/sql/alter-mat-view-alter-column-add-index/):
    Adds an index to a materialized view
  - [`ALTER MATERIALIZED VIEW DROP INDEX`](/docs/query/sql/alter-mat-view-alter-column-drop-index/):
    Removes an index from a materialized view
  - [`ALTER MATERIALIZED VIEW RESUME WAL`](/docs/query/sql/alter-mat-view-resume-wal/):
    Resume WAL for a materialized view
  - [`ALTER MATERIALIZED VIEW SET REFRESH`](/docs/query/sql/alter-mat-view-set-refresh/):
    Changes a materialized view's refresh strategy and parameters
  - [`ALTER MATERIALIZED VIEW SET REFRESH LIMIT`](/docs/query/sql/alter-mat-view-set-refresh-limit/):
    Sets the time limit for incremental refresh on a materialized view
  - [`ALTER MATERIALIZED VIEW SET TTL`](/docs/query/sql/alter-mat-view-set-ttl/):
    Sets the time-to-live (TTL) period on a materialized view
  - [`ALTER MATERIALIZED VIEW SYMBOL CAPACITY`](/docs/query/sql/alter-mat-view-change-symbol-capacity/):
    Changes the capacity of an existing SYMBOL column in a materialized view

- **Configuration**
  - [Materialized views configs](/docs/configuration/overview/#materialized-views):
    Server configuration options for materialized views from `server.conf`
