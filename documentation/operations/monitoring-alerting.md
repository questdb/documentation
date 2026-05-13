---
title: Monitoring and alerting
description: Monitor QuestDB health and detect table issues like suspended WAL, memory pressure, and slow queries.
---

There are many variables to consider when monitoring an active production
database. This document is designed to be a helpful starting point. We plan to
expand this guide to be more helpful. If you have any recommendations, feel free
to [create an issue](https://github.com/questdb/documentation/issues) or a PR on
GitHub.

For detailed instructions on setting up Prometheus to scrape QuestDB metrics,
see the [Prometheus integration guide](/docs/integrations/other/prometheus/).

## Basic health check

QuestDB comes with an out-of-the-box health check HTTP endpoint:

```shell title="GET health status of local instance"
curl -v http://127.0.0.1:9003
```

Getting an OK response means the QuestDB process is up and running. This method
provides no further information.

If you allocate 8 vCPUs/cores or less to QuestDB, the HTTP server thread may not
be able to get enough CPU time to respond in a timely manner. Your load balancer
may flag the instance as dead. In such a case, create an isolated thread pool
just for the health check service (the `min` HTTP server), by setting this
configuration option:

```text
http.min.worker.count=1
```

## Alert on critical errors

QuestDB includes a log writer that sends any message logged at critical level to
Prometheus Alertmanager over a TCP/IP socket. To configure this writer, add it
to the `writers` config alongside other log writers. This is the basic setup:

```ini title="log.conf"
writers=stdout,alert
w.alert.class=io.questdb.log.LogAlertSocketWriter
w.alert.level=CRITICAL
```

For more details, see the
[Logging and metrics page](/docs/operations/logging-metrics/#prometheus-alertmanager).

## Detect table health issues

This section covers monitoring and troubleshooting table health issues. For
detailed per-table monitoring, use the [`tables()`](/docs/query/functions/meta/#tables)
function which returns real-time statistics including WAL status, memory pressure,
and performance histograms. The function is lightweight and fully in-memory,
suitable for frequent polling.

### Health dashboard query

```questdb-sql
SELECT
    table_name,
    table_row_count,
    wal_pending_row_count,
    CASE
        WHEN table_suspended THEN 'SUSPENDED'
        WHEN table_memory_pressure_level = 2 THEN 'BACKOFF'
        WHEN table_memory_pressure_level = 1 THEN 'PRESSURE'
        ELSE 'OK'
    END AS status,
    wal_txn - table_txn AS lag_txns,
    table_write_amp_p50 AS write_amp,
    table_merge_rate_p99 AS slowest_merge
FROM tables()
WHERE walEnabled
ORDER BY
    table_suspended DESC,
    table_memory_pressure_level DESC,
    wal_pending_row_count DESC;
```

### Detect suspended tables

A WAL table becomes suspended when an error occurs during WAL apply, such as
disk full, corrupted WAL segment, or kernel limits reached. While suspended,
new data continues to be written to WAL but is not applied to the table.

**Detection:**

```questdb-sql
SELECT table_name FROM tables() WHERE table_suspended;
```

**Resolution:**

Resume from the failed transaction:

```questdb-sql
ALTER TABLE my_table RESUME WAL;
```

If the transaction is corrupted, skip it by specifying the next transaction:

```questdb-sql
-- Find the last applied transaction
SELECT writerTxn FROM wal_tables() WHERE name = 'my_table';

-- Resume from the next transaction
ALTER TABLE my_table RESUME WAL FROM TXN <next_txn>;
```

For corrupted WAL segments (common after disk full errors), you may need to skip
multiple transactions. Query `wal_transactions()` to find all transactions in
the corrupted segment, then resume from the first transaction after that segment.

See [ALTER TABLE RESUME WAL](/docs/query/sql/alter-table-resume-wal/) for
detailed recovery procedures including corrupted segment handling.

### Detect invalid materialized views

Materialized views become invalid when their base table is modified in
incompatible ways: dropping referenced columns, dropping partitions, renaming
the table, or running TRUNCATE/UPDATE operations.

**Detection:**

```questdb-sql
SELECT view_name, invalidation_reason
FROM materialized_views()
WHERE view_status = 'invalid';
```

**Resolution:**

Perform a full refresh to rebuild the view:

```questdb-sql
REFRESH MATERIALIZED VIEW my_view FULL;
```

This deletes existing data and rebuilds from the base table. For large tables,
this may take significant time.

See [Materialized view invalidation](/docs/concepts/materialized-views/#view-invalidation)
for more details on causes and prevention.

### Detect memory pressure

Memory pressure indicates the system is running low on memory for out-of-order
(O3) operations. Level 1 reduces parallelism to conserve memory. Level 2 enters
backoff mode, which can significantly impact throughput.

**Detection:**

```questdb-sql
SELECT table_name,
       CASE table_memory_pressure_level
           WHEN 1 THEN 'PRESSURE'
           WHEN 2 THEN 'BACKOFF'
       END AS status
FROM tables()
WHERE table_memory_pressure_level > 0;
```

**Resolution:**

Reduce O3 memory allocation per column. The default of 256K actually uses 512K
(2x the configured size). Reducing this frees memory for other operations:

```ini title="server.conf"
cairo.o3.column.memory.size=128K
```

Other options:

- Add more RAM to the server
- Reduce concurrent ingestion load
- Reduce the number of tables with active O3 writes

See [Capacity planning](/docs/getting-started/capacity-planning/#memory-page-size-configuration)
and [Optimize for many tables](/docs/cookbook/operations/optimize-many-tables/)
for detailed configuration guidance.

### Detect small transactions

Small transaction sizes may indicate that the client is sending individual rows
instead of batching. Larger batch sizes reduce transaction overhead and improve
ingestion throughput.

**Detection:**

```questdb-sql
SELECT table_name, wal_tx_size_p50, wal_tx_size_p90, wal_tx_size_max
FROM tables()
WHERE walEnabled
  AND wal_tx_size_p90 > 0
  AND wal_tx_size_p90 < 100;
```

**Resolution:**

- Use the [official client libraries](/docs/ingestion/overview/#first-party-clients)
  which handle batching automatically
- For custom ILP clients, configure auto-flush by row count or time interval
  rather than flushing after each row
- For HTTP/PostgreSQL ingestion, send multiple rows per request

### Detect high write amplification

Write amplification measures how many times data is rewritten during ingestion.
A value of 1.0 is ideal, meaning each row is written exactly once. Higher values
indicate O3 merge overhead from out-of-order data being merged into existing
partitions.

| Value | Interpretation |
|-------|----------------|
| 1.0 – 1.5 | Excellent – minimal rewrites |
| 1.5 – 3.0 | Normal for moderate out-of-order data |
| 3.0 – 5.0 | Consider reducing partition size |
| > 5.0 | High – reduce partition size or investigate ingestion patterns |

**Detection:**

```questdb-sql
SELECT table_name,
       table_write_amp_p50,
       table_write_amp_p99,
       table_merge_rate_p99 AS slowest_merge
FROM tables()
WHERE walEnabled
  AND table_write_amp_p50 > 3.0
ORDER BY table_write_amp_p99 DESC;
```

**Resolution:**

Reduce partition size to limit the scope of O3 merges. For example, a table
with `PARTITION BY DAY` experiencing high amplification may benefit from
`PARTITION BY HOUR`:

```questdb-sql
-- Recreate with smaller partitions
CREATE TABLE trades_new (
    ...
) TIMESTAMP(ts) PARTITION BY HOUR;
```

Other options:

- Reduce `cairo.writer.data.append.page.size` in server.conf
- Enable [deduplication](/docs/concepts/deduplication/) if data can be replayed
- Investigate client-side to reduce out-of-order data at the source

See [Write amplification](/docs/getting-started/capacity-planning/#write-amplification)
for detailed guidance.

### Detect transaction lag and pending rows

When `wal_txn - table_txn` (pending transactions) or `wal_pending_row_count`
(pending rows) continuously grows, the WAL apply process cannot keep up with
ingestion. The data is safely stored in WAL but not yet visible to queries.

A continuously rising difference indicates that either a table has become
suspended and WAL can't be applied to it, or QuestDB is not able to keep up
with the ingestion rate.

**Detection:**

```questdb-sql
SELECT table_name,
       wal_txn - table_txn AS pending_txns,
       wal_pending_row_count
FROM tables()
WHERE walEnabled
  AND (wal_txn - table_txn > 10 OR wal_pending_row_count > 1000000)
ORDER BY wal_pending_row_count DESC;
```

**Resolution:**

- Check if the table is suspended and resume it. See
  [Detect suspended tables](#detect-suspended-tables).
- Check for memory pressure which limits parallelism. See
  [Detect memory pressure](#detect-memory-pressure).
- Check for high write amplification which slows merges. See
  [Detect high write amplification](#detect-high-write-amplification).
- Temporarily reduce ingestion rate to allow the backlog to clear.

See the [`tables()` reference](/docs/query/functions/meta/#tables) for the
complete list of columns and additional example queries.

## Detect slow queries

QuestDB maintains a table called `_query_trace`, which records each executed
query and the time it took. You can query this table to find slow queries.

Read more on query tracing on the
[Concepts page](/docs/concepts/deep-dive/query-tracing/).
