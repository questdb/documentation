---
title: Monitoring and alerting
description: Shows you how to set up to monitor your database for potential issues, and how to raise alerts
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

## Detect suspended tables

QuestDB exposes a Prometheus gauge called `questdb_suspended_tables`. You can set up
to alert whenever this gauge shows an above-zero value.

## Detect slow ingestion

QuestDB ingests data in two stages: first it records everything to the
Write-Ahead Log. This step is optimized for throughput and usually isn't the
bottleneck. The next step is inserting the data to the table, and this can
take longer if the data is out of order, or touches different time partitions.
You can monitor the overall performance of this process of applying the WAL
data to tables. QuestDB exposes two Prometheus counters for this:

1. `questdb_wal_apply_seq_txn`: sum of all committed transaction sequence numbers
2. `questdb_wal_apply_writer_txn`: sum of all transaction sequence numbers applied to tables

Both of these numbers are continuously growing as the data is ingested. When
they are equal, all WAL data has been applied to the tables. While data is being
actively ingested, the second counter will lag behind the first one. A steady
difference between them is a sign of healthy rate of WAL application, the
database keeping up with the demand. However, if the difference continuously
rises, this indicates that either a table has become suspended and WAL can't be
applied to it, or QuestDB is not able to keep up with the ingestion rate. All of
the data is still safely stored, but a growing portion of it is not yet visible
to queries.

You can create an alert that detects a steadily increasing difference between
these two numbers. It won't tell you which table is experiencing issues, but it
is a low-impact way to detect there's a problem which needs further diagnosing.

## Detect slow queries

QuestDB maintains a table called `_query_trace`, which records each executed
query and the time it took. You can query this table to find slow queries.

Read more on query tracing on the
[Concepts page](/docs/concepts/deep-dive/query-tracing/).
