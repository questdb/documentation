---
title: SQL extensions and compatibility
sidebar_label: SQL extensions
description:
  QuestDB SQL extensions for time-series workloads, along with differences
  from standard SQL and PostgreSQL. Covers added clauses, query conveniences,
  unsupported features and their QuestDB equivalents.
---

QuestDB SQL is based on ANSI SQL with extensions for time-series workloads
and a small number of deliberate omissions where the standard form does not
fit a column-oriented, time-ordered storage model. This page summarises what
QuestDB adds, what it makes easier, what it does not support, and what works
differently from PostgreSQL or other common dialects.

If you are looking for a specific keyword (`DELETE`, `HAVING`, `OFFSET`,
`DISTINCT ON`, `ON CONFLICT`, ...) the
[Standard SQL features not supported](#standard-sql-features-not-supported)
section is the fastest way in.

## Time-series clauses

QuestDB adds first-class SQL clauses for the patterns time-series workloads
need most.

### SAMPLE BY

[`SAMPLE BY`](/docs/query/sql/sample-by/) aggregates data into evenly spaced
time buckets aligned to the designated timestamp. It is shorter and faster
than equivalent `GROUP BY date_trunc(...)` patterns and supports calendar
alignment with time zones and DST.

```questdb-sql demo title="Hourly average price"
SELECT timestamp, symbol, avg(price)
FROM trades
WHERE timestamp IN '$today'
SAMPLE BY 1h;
```

`SAMPLE BY` supports [`FILL`](/docs/query/sql/sample-by/#fill-options) to
handle missing buckets with strategies including `NONE`, `NULL`, `PREV`,
`LINEAR`, and constants. [`ALIGN TO CALENDAR`](/docs/query/sql/sample-by/#align-to-calendar)
aligns buckets to civil time boundaries and supports `TIME ZONE` and
`WITH OFFSET`.

### LATEST ON

[`LATEST ON`](/docs/query/sql/latest-on/) returns the most recent row per
partition key, using the designated timestamp's physical sort order to avoid
a full scan.

```questdb-sql demo title="Latest trade per symbol"
SELECT * FROM trades
WHERE timestamp IN '$today'
LATEST ON timestamp PARTITION BY symbol;
```

This is the QuestDB equivalent of PostgreSQL's `DISTINCT ON (...)` and the
window-function patterns commonly used in dialects that lack it.

### TICK interval syntax

QuestDB extends `WHERE` with a concise interval syntax for the designated
timestamp. It compiles to optimized interval scans and is both shorter and
faster than `dateadd()` / `now()` arithmetic.

```questdb-sql demo title="Last hour"
SELECT * FROM trades WHERE timestamp IN '$now - 1h..$now';
```

```questdb-sql demo title="Today"
SELECT * FROM trades WHERE timestamp IN '$today';
```

On QuestDB Enterprise, [exchange calendars](/docs/query/operators/exchange-calendars/)
let TICK address venue schedules directly. `XNYS` is the ISO 10383 MIC code
for the New York Stock Exchange; QuestDB knows the exchange's actual
schedule, so holidays and early closes are excluded automatically.

```questdb-sql title="NYSE trading hours for January 2025"
SELECT * FROM trades WHERE timestamp IN '[2025-01]#XNYS';
```

Other supported calendars include `XLON`, `XHKG`, and more. See
[TICK operator](/docs/query/operators/tick/) for the full grammar.

## Time-series joins

In addition to the standard joins (`INNER`, `LEFT`, `RIGHT`, `FULL`, `CROSS`,
`LATERAL`), QuestDB provides joins designed for time-ordered data.

### ASOF JOIN

[`ASOF JOIN`](/docs/query/sql/asof-join/) attaches to each left row the most
recent right row whose timestamp is less than or equal to the left timestamp.
The textbook case is enriching trades with the prevailing quote.

```questdb-sql demo title="Attach prevailing quote to each trade"
SELECT t.timestamp, t.symbol, t.price, p.bid_price, p.ask_price
FROM fx_trades AS t
ASOF JOIN core_price AS p ON (symbol)
WHERE t.timestamp IN '$now-1h..$now';
```

A `TOLERANCE` clause caps how far back the join will look.

### LT JOIN

[`LT JOIN`](/docs/query/sql/join/#lt-join) is the strict-inequality variant
of `ASOF JOIN`. The right row's timestamp must be strictly less than the
left's. Use this when an equal timestamp would otherwise self-join.

### SPLICE JOIN

[`SPLICE JOIN`](/docs/query/sql/join/#splice-join) interleaves two
time-ordered streams and, at each emitted row, exposes the latest value seen
from each side so far. Used to maintain a live snapshot from two independent
feeds.

### WINDOW JOIN

[`WINDOW JOIN`](/docs/query/sql/window-join/) joins each left row to every
right row inside a time range defined relative to the left row's timestamp.
Used for "all market data in the next 100 ms after a trade" style queries.

### HORIZON JOIN

[`HORIZON JOIN`](/docs/query/sql/horizon-join/) evaluates the right table at
a list or range of time offsets from each left row. Used for post-trade
markout, implementation-shortfall, and other time-series cohort analyses.

```questdb-sql demo title="Markout at non-uniform time horizons after each trade"
SELECT
    h.offset / 1_000_000_000 AS horizon_sec,
    t.symbol,
    avg((m.best_bid + m.best_ask) / 2 - t.price) AS avg_markout
FROM fx_trades AS t
HORIZON JOIN market_data AS m ON (symbol)
LIST (0, 5s, 30s, 1m) AS h
WHERE t.timestamp IN '$now-1h..$now'
ORDER BY t.symbol, horizon_sec;
```

For the full join inventory in one table, see
[Supported joins](#supported-joins) below.

## Query syntax conveniences

These are differences from standard SQL that exist purely as ergonomics.
They are optional shortcuts, not new semantics.

### SELECT * FROM is optional

`SELECT * FROM trades` and `trades` return the same result. The shorter form
is often easier to read inside subqueries.

```questdb-sql demo title="Implicit SELECT *"
trades;
-- equivalent to:
SELECT * FROM trades;
```

### Implicit timestamp ordering and negative LIMIT

Queries against a table with a
[designated timestamp](/docs/concepts/designated-timestamp/) return rows in
ascending timestamp order without an explicit `ORDER BY`. The data is
already physically sorted on disk, so adding `ORDER BY timestamp` is
redundant.

QuestDB also extends [`LIMIT`](/docs/query/sql/limit/) with negative values,
which take from the end of the result set. Combined with the implicit
ordering, this gives "the latest N rows" with no sort:

```questdb-sql demo title="Latest 10 trades"
SELECT * FROM trades LIMIT -10;
```

`LIMIT` accepts a two-argument form with negative bounds for paginating from
the end (`LIMIT -m, -n` takes the last m rows then drops the last n).

### GROUP BY is optional

QuestDB derives the `GROUP BY` set from the non-aggregate columns in
`SELECT`. Enumerating them again in a `GROUP BY` clause is redundant.

```questdb-sql demo title="Implicit GROUP BY"
SELECT symbol, side, sum(price)
FROM trades
WHERE timestamp IN '$today';
```

The explicit `GROUP BY` form is still accepted.

### Implicit HAVING

Standard SQL `HAVING` is not supported. Filter on aggregates by wrapping
them in a subquery and applying a regular `WHERE`:

```questdb-sql demo title="HAVING equivalent via subquery"
(
    SELECT symbol, side, sum(price) AS total_price
    FROM trades WHERE timestamp IN '$today'
)
WHERE total_price > 10_000_000;
```

This pattern is consistently faster than `HAVING` in dialects that have it,
because no extra aggregation pass is required.

### DECLARE variables

[`DECLARE`](/docs/query/sql/declare/) introduces query-scoped variables for
both stand-alone queries and view definitions. Variables make repeated
expressions (date ranges, symbol filters, thresholds) reusable without
losing readability.

```questdb-sql demo title="DECLARE used in a query"
DECLARE
    @symbol := 'BTC-USDT',
    @window := '$now - 1d..$now'
SELECT timestamp, price FROM trades
WHERE symbol = @symbol AND timestamp IN @window;
```

## Storage and table extensions

### Designated timestamp

Every time-series table elects one column as its
[designated timestamp](/docs/concepts/designated-timestamp/). Rows are stored
physically sorted by this column, which is what makes `SAMPLE BY`,
`LATEST ON`, `ASOF JOIN`, partition pruning, and interval scans efficient.

### Partitioning and out-of-order data

Tables are [partitioned by time](/docs/concepts/partitions/) (hour, day,
week, month, year). Out-of-order writes are accepted and merged
automatically. See [Out-of-order data](/docs/concepts/out-of-order-data/) for
per-ingestion-method behavior and tuning.

### Materialized views

QuestDB [materialized views](/docs/concepts/materialized-views/) are
precomputed `SAMPLE BY` tables that refresh automatically as the base table
receives data. Refresh strategies include `IMMEDIATE`, `TIMER`, `PERIOD`,
and manual triggers. Views can be **chained**, so the output of one
materialized view can serve as the base of another, and each view has its
own TTL and partitioning.

### Parameterized views

`CREATE VIEW` and `COMPILE VIEW` accept
[`DECLARE OVERRIDABLE`](/docs/concepts/views/#parameterized-views), which
lets callers override view parameters at query time.

```questdb-sql title="A view that accepts an overridable minimum price"
CREATE VIEW expensive_trades AS (
    DECLARE OVERRIDABLE @min_price := 100
    SELECT * FROM trades WHERE price >= @min_price
);

-- Override at query time
DECLARE @min_price := 500 SELECT * FROM expensive_trades;
```

### N-dimensional arrays

QuestDB supports n-dimensional `DOUBLE` [arrays](/docs/query/datatypes/array/),
typically used to store order-book levels (`bids DOUBLE[][]`,
`asks DOUBLE[][]`) and other structured numeric series. Arrays compose with
the standard SQL operators and with [`UNNEST`](#json-and-unnest) for
row expansion.

### Covering indices

In addition to the default bitmap index, `SYMBOL` columns support a
[posting index with INCLUDE columns](/docs/concepts/deep-dive/posting-index/).
The included columns are stored inline with the index, so equality lookups
read everything they need without touching the main column files.

```questdb-sql title="Posting index with covering columns"
CREATE TABLE trades (
    ts TIMESTAMP,
    symbol SYMBOL INDEX TYPE POSTING INCLUDE (price, amount),
    price DOUBLE,
    amount DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY WAL;
```

## PIVOT

QuestDB has native [`PIVOT`](/docs/query/sql/pivot/) following the
DuckDB-style extended form. It is a superset of SQL Server's PIVOT:

| Capability | SQL Server PIVOT | QuestDB PIVOT |
|---|---|---|
| Aggregates per call | One only | Multiple, comma-separated |
| `FOR` clauses | One | Multiple, producing a Cartesian product |
| `IN` list | Static literals only | Static list or subquery (parsed at compile time) |
| Value aliases | Not supported | `'value' AS alias` |
| Expressions inside aggregates | Column names only | Arbitrary expressions |
| `GROUP BY` | Implicit | Explicit, inside the PIVOT parens |

PostgreSQL has no native `PIVOT`. The closest equivalent is the
`tablefunc.crosstab()` extension or manual `CASE WHEN` / `FILTER (WHERE ...)`
aggregates.

## JSON and UNNEST

QuestDB supports JSON path expressions for reading inside `VARCHAR` columns
that contain JSON. See [JSON functions](/docs/query/functions/json/) for the
path-expression reference.

[`UNNEST`](/docs/query/sql/unnest/) expands both native arrays and JSON
arrays into rows. Use it to flatten an `ARRAY` column for further filtering
or aggregation:

```questdb-sql demo title="UNNEST a literal array"
SELECT value FROM UNNEST(ARRAY[1.0, 2.0, 3.0]);
```

For JSON arrays stored as `VARCHAR`, `UNNEST` accepts a `COLUMNS(...)`
clause that types each extracted field. The example below ingests a slice of
the [Coinbase trades API](https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=3)
response and produces typed columns:

```questdb-sql title="Expand a JSON array of trade objects"
SELECT u.trade_id, u.price, u.size, u.side, u.time
FROM UNNEST(
    '[{"trade_id":994619709,"side":"sell","size":"0.00000100","price":"69839.36","time":"2026-04-06T10:32:55.517183Z"},
      {"trade_id":994619708,"side":"buy","size":"0.00000006","price":"69839.35","time":"2026-04-06T10:32:55.418434Z"}]'::VARCHAR
    COLUMNS(trade_id LONG, price DOUBLE, size DOUBLE, side VARCHAR, time TIMESTAMP)
) u;
```

## Lifecycle, security, and operations

QuestDB exposes a few SQL-level features for operating tables at scale:

- **[TTL](/docs/concepts/ttl/)**. Per-table retention that drops whole
  partitions older than the configured horizon.
- **[Storage policy](/docs/concepts/storage-policy/)** (Enterprise). Moves
  old partitions to Parquet on object storage while keeping them queryable.
- **[RBAC](/docs/security/rbac/)** (Enterprise). Users, groups, and service
  accounts with granular permissions over tables and operations.
- **[Backup / CHECKPOINT](/docs/query/sql/checkpoint/)**. Filesystem-level
  consistent snapshots for backup and restore.

## Function library

QuestDB's function library is intentionally close to PostgreSQL where there
is overlap. Most string, numeric, conditional, date, and aggregation
functions take the names and signatures a PostgreSQL user would expect.
See [Aggregation functions](/docs/query/functions/aggregation/),
[Date and time](/docs/query/functions/date-time/), and the rest of the
function reference for details.

QuestDB also adds groups not typically found in general-purpose databases:

- **[Finance functions](/docs/query/functions/finance/)**. L2 price
  reconstruction, weighted statistics, and other primitives for market data.
- **[Visualization functions](/docs/query/functions/visualization/)**.
  Sparkline-style summaries for the web console and text-based interfaces
  such as `psql`.
- **[Meta functions](/docs/query/functions/meta/)**. `tables()`,
  `table_partitions()`, `table_storage()`, `materialized_views()`,
  `query_activity()`, and so on, for inspecting database state from SQL.
  Only a small subset of PostgreSQL's `pg_catalog` is implemented (enough
  for client tools to identify the server, for example
  `pg_catalog.version()`); use the QuestDB meta functions for actual
  introspection.
- **[Array functions](/docs/query/functions/array/)** for n-dimensional
  numeric arrays.

## Learn by example

Two good places to see this material applied:

- **[demo.questdb.io](https://demo.questdb.io)**. A live instance preloaded
  with FX, crypto, and order-book datasets. Most examples on this page run
  there unchanged.
- **[Cookbook](/docs/cookbook/)**. Recipes for finance, time-series patterns,
  Grafana integration, and ingestion.

To run SQL against a local QuestDB instance, use the built-in
[web console](/docs/getting-started/web-console/overview/) at
`http://localhost:9000`, or connect with `psql`:

```shell
psql -h localhost -p 8812 -U admin -d qdb
# default password: quest
```

The web console works without any configuration. `psql` and other
PostgreSQL clients connect over the
[PostgreSQL Wire Protocol](/docs/query/pgwire/overview/) on port 8812.

## Standard SQL features not supported

When something a PostgreSQL or ANSI-SQL user expects does not work, the
table below points at the QuestDB equivalent.

| Standard SQL | QuestDB equivalent |
|---|---|
| `DELETE FROM t WHERE ...` | Row-level deletion is intentionally not supported. Use `DROP PARTITION` or [TTL](/docs/concepts/ttl/) for retention, and [deduplication](/docs/concepts/deduplication/) for correction workflows. See [Data retention](/docs/operations/data-retention/). |
| `UPDATE` of the designated timestamp | Cannot be updated. Copy data through a temp table, modify, re-insert. See [Updating data](/docs/operations/updating-data/) and [Modifying data](/docs/operations/modifying-data/). |
| `HAVING` | Wrap aggregate in subquery and filter (see [Implicit HAVING](#implicit-having)). |
| `OFFSET n LIMIT m` | `LIMIT lo, hi` (e.g. `LIMIT 10, 30`). |
| `DISTINCT ON (col)` | For the "latest row per group by timestamp" form (`ORDER BY col, timestamp DESC`), use [`LATEST ON timestamp PARTITION BY col`](/docs/query/sql/latest-on/). For any other ordering, wrap in a CTE with `row_number() OVER (PARTITION BY col ORDER BY ...)` and filter where the row number equals 1. |
| `INSERT ... ON CONFLICT (...) DO UPDATE` | [`DEDUP UPSERT KEYS(...)`](/docs/concepts/deduplication/) declared at table level. |
| Correlated subqueries in `WHERE`, `EXISTS`, scalar position | [`LATERAL JOIN`](/docs/query/sql/lateral-join/) for the row-correlated cases. Some scalar correlation can be expressed via `ASOF` or window functions. |
| `generate_series()` in `SELECT` projection | Use [`generate_series()`](/docs/query/functions/row-generator/) in the `FROM` clause. |
| `FETCH BACKWARD`, scrollable cursors | Forward-only cursors. See [pgwire caveats](#pgwire-specific-caveats). |
| Stored procedures, triggers, PL/pgSQL | Not supported. Application code or scheduled jobs replace these patterns. |
| Foreign keys, CHECK constraints | Not supported. High-throughput ingestion paths (ILP, batch `INSERT`) avoid per-row constraint checks; integrity is typically enforced upstream in the ingestion pipeline. |

## Supported joins

For the full inventory in one place:

| Join | Purpose |
|---|---|
| [`(INNER) JOIN`](/docs/query/sql/join/#inner-join) | Standard inner join. |
| [`LEFT (OUTER) JOIN`](/docs/query/sql/join/#left-outer-join) | Standard left outer join. |
| [`RIGHT (OUTER) JOIN`](/docs/query/sql/join/#right-outer-join) | Standard right outer join. |
| [`FULL (OUTER) JOIN`](/docs/query/sql/join/#full-outer-join) | Standard full outer join. |
| [`CROSS JOIN`](/docs/query/sql/join/#cross-join) | Cartesian product. |
| [`LATERAL JOIN`](/docs/query/sql/lateral-join/) | Per-row correlated subquery join. The PG/SQL-standard tool for what other databases handle with correlated subqueries. |
| [`ASOF JOIN`](/docs/query/sql/asof-join/) | Attach the latest preceding row from the right side. |
| [`LT JOIN`](/docs/query/sql/join/#lt-join) | Strict-inequality variant of `ASOF`. |
| [`SPLICE JOIN`](/docs/query/sql/join/#splice-join) | Interleave two streams, expose latest from each. |
| [`WINDOW JOIN`](/docs/query/sql/window-join/) | Right rows inside a time window of the left row. |
| [`HORIZON JOIN`](/docs/query/sql/horizon-join/) | Right table evaluated at one or more time offsets per left row. |

## Pgwire-specific caveats

When connecting via the [PostgreSQL Wire Protocol](/docs/query/pgwire/overview/),
a few client-visible behaviors differ from a real PostgreSQL server:

- **Forward-only cursors.** `FETCH BACKWARD` and other backward operations are
  not supported. Configure drivers (psycopg2, asyncpg, JDBC, etc.) for
  forward-only iteration.
- **Timestamp time zones.** QuestDB stores all timestamps in UTC and emits
  them over the wire as `TIMESTAMP WITHOUT TIMEZONE`. Configure your client
  to interpret these as UTC; do not rely on driver-default local-time
  conversion. See [Timestamp handling](/docs/query/pgwire/overview/#timestamp-handling).
- **Large result sets.** Most drivers buffer entire result sets in memory by
  default, which can OOM the client on large queries. Use cursor-based
  fetching. See [Large result sets](/docs/query/pgwire/large-result-sets/).
- **Protocol coverage.** SSL, BLOB transfer, and remote file upload
  (`COPY ... FROM stdin`) are not supported over pgwire. See
  [pgwire compatibility](/docs/query/pgwire/overview/#compatibility) for the
  full list.

## See also

- [Query and SQL overview](/docs/query/overview/)
- [PostgreSQL Wire Protocol](/docs/query/pgwire/overview/)
- [Designated timestamp](/docs/concepts/designated-timestamp/)
- [Out-of-order data](/docs/concepts/out-of-order-data/)
- [Materialized views](/docs/concepts/materialized-views/)
- [Cookbook](/docs/cookbook/)
