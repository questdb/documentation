---
title: Out-of-order data
sidebar_label: Out-of-order data
description:
  How QuestDB handles out-of-order and late-arriving data. Behavior per
  ingestion method, engine mechanics, write amplification, and tuning.
---

QuestDB accepts data in any timestamp order. Rows whose timestamps fall behind
already-committed data are merged into their correct chronological position
automatically, with no special configuration or pre-sorting required.

This page covers what counts as out-of-order, how each ingestion method
handles it, what it costs in write amplification, and how to tune for
workloads where it is common.

## What QuestDB considers out of order

A row is out of order when its
[designated timestamp](/docs/concepts/designated-timestamp/) is earlier than
the most recent timestamp already committed to the table. The engine has to
merge the row into its correct chronological position rather than appending
to the end of the data, even if the row's target partition is not the
active (latest) one.

QuestDB's internal shorthand for out-of-order is **O3**. You will see it in
configuration property names such as `cairo.o3.column.memory.size`.

Common situations that produce out-of-order data:

- Late-arriving messages from a queue after a consumer-lag spike
- Replaying a Kafka topic from an earlier offset
- Backfilling historical data while live ingestion continues
- Multiple producers feeding the same table from clocks that are not in sync
- Sensors with intermittent connectivity that buffer readings and flush them
  on reconnect

## Behavior per ingestion method

| Method | Out-of-order behavior |
|--------|-----------------------|
| ILP (HTTP and TCP) | Accepted. Rows are merged into the correct position. |
| `INSERT` (SQL) | Accepted. Rows are merged into the correct position. |
| `COPY` into a partitioned table | Accepted. Sorted as part of the import. |
| `COPY` into a non-partitioned table | **Rejected.** Non-partitioned `COPY` is serial and requires pre-sorted input. |

The recommendation is always to ingest into a partitioned, WAL-enabled table.
Non-partitioned `COPY` is the only path that explicitly errors on out-of-order
rows.

## How the engine handles it

When out-of-order data arrives, QuestDB does not rewrite the whole partition.
It splits the partition so that only the affected portion is rewritten, then
squashes the splits back together in the background once they are no longer
in the hot write path.

For the mechanics, including how splits are named and when squashing runs,
see
[Partition splitting and squashing](/docs/concepts/partitions/#partition-splitting-and-squashing).

## Write amplification

The most visible cost of out-of-order ingestion is **write amplification**:
how many physical rows are written to disk per logical row committed.
Append-only workloads stay close to 1.0. Out-of-order workloads push the
ratio higher because the engine rewrites portions of existing partitions
to merge new rows into their correct position.

You can monitor write amplification at two levels:

- **Per table**, via the `table_write_amp_*` columns in
  [`tables()`](/docs/query/functions/meta/#table-metrics-table_-prefix).
  These expose p50, p90, p99, and max for recent activity, which is more
  diagnostic than a single cumulative ratio.
- **Cluster-wide**, via
  [Prometheus metrics](/docs/integrations/other/prometheus/#scraping-prometheus-metrics-from-questdb):

  ```
  write_amplification = questdb_physically_written_rows_total / questdb_committed_rows_total
  ```

  These counters are cumulative for the process lifetime. Compare deltas
  over a time window (for example 5 minutes) to see the current rate
  rather than the lifetime average.

### What counts as "high"

There is no universal threshold. Write amplification is a sensitivity
indicator, not a pass/fail metric. The same ratio can be fine on one
system and crippling on another:

- **Absolute volume matters more than the ratio.** A ratio of 10,000 that
  rewrites one extra row per commit is irrelevant. A ratio of 5 that
  rewrites 100 million rows per commit will saturate disk.
- **Disk throughput sets the ceiling.** Fast local NVMe can mask high
  ratios that would suspend ingestion on slower network-attached storage.
  A workload running fine on SSD can fail when moved to EBS.
- **It behaves like a cliff.** Either the storage subsystem keeps up or it
  does not. There is little smooth degradation in between.

A ratio of 1.0 is the ideal. Beyond that, treat the metric as a *relative*
signal: a sudden jump from your normal baseline indicates a change in
ingestion pattern worth investigating, even if the absolute number is low.
Real production deployments routinely run with write amplification in the
double digits without problems when disk throughput accommodates it.

### Other sources of write amplification

Write amplification is not exclusively caused by out-of-order writes.
Other operations that rewrite data show up in the same metric:

- Incremental [materialized view](/docs/concepts/materialized-views/)
  refreshes. Each refresh issues a replace-range commit for the affected
  time buckets, so any bucket that is recomputed (because the base table
  is still streaming into it, or because late base data lands in an
  already-refreshed range) rewrites the prior result on the view.
- `UPDATE` statements, which rewrite the affected column files
  (copy-on-write).

If write amplification is high but your designated timestamps arrive
mostly in order, investigate these other sources before changing partition
size or other O3 tuning.

## Tuning for out-of-order workloads

### Fix the source first

Before tuning partition size, check whether the out-of-order writes are
accidental: a misconfigured client, clock skew between producers, an
unnecessary sort step removed from the pipeline, a Kafka consumer that
got rewound. Fixing the source is almost always more effective than
tuning the storage layout.

If the out-of-order pattern is genuinely required by your workload
(intermittent connectivity, scheduled backfills, exchange corrections),
proceed to the tuning options below.

### Partition size

Smaller partitions reduce the amount of data rewritten per out-of-order
event. If write amplification is causing storage throughput problems and
the out-of-order pattern is unavoidable, step down one partition interval:

- `PARTITION BY MONTH` to `PARTITION BY DAY`
- `PARTITION BY DAY` to `PARTITION BY HOUR`

Smaller partitions also mean more partitions overall, which increases
filesystem overhead. The target remains 30 to 80 million rows per
partition. See
[Choosing a partition interval](/docs/concepts/partitions/#choosing-a-partition-interval).

### O3 memory page size

The `cairo.o3.column.memory.size` configuration controls how much memory the
writer reserves per column when receiving out-of-order writes. The default
is 8MB, so the writer holds 16MB of RAM per column (2× the page size) during
O3 commits.

For tables with many columns and frequent out-of-order writes, this can
become a noticeable memory cost. Reducing the value (range 128KB to 8MB)
trades per-write efficiency for lower memory use and the ability to keep
more columns in flight.

### Deduplication

If your out-of-order writes may include rows that overwrite existing rows
with the same key (for example, exchange corrections or third-party data
re-published with revisions), enable
[deduplication](/docs/concepts/deduplication/) on the relevant key columns.
The full-row equality check lets QuestDB skip writes for unchanged rows
entirely, which reduces write amplification when reloading large datasets
where only a small portion has changed.

### Choice of designated timestamp

When most of your data arrives significantly behind its event time, consider
using ingestion time as the designated timestamp and keeping event time as a
regular column. This converts the workload from out-of-order into
append-only, at the cost of losing event-time interval scans (queries that
filter by event time will read more partitions than strictly necessary).

This trade-off is rarely worth it for moderate out-of-order workloads but
can help in extreme cases such as bulk replays or sensor networks with
multi-day backfill windows.

## Common scenarios

### Exchange time vs gateway time

Market data tables often have multiple plausible timestamp columns. Exchange
time is when the venue published the event; gateway time is when your
infrastructure received it. Exchange time is the correct event time but can
arrive out of order due to network jitter or batched feeds. Gateway time is
monotonic per consumer but loses temporal accuracy.

Use exchange time as the designated timestamp for most workloads. The
out-of-order overhead is usually small compared to the analytical value of
querying by event time. Switch to gateway time only if jitter is large
enough that storage throughput cannot keep up after tuning partition size.

### Kafka replay

Consuming a Kafka topic from an earlier offset replays old data into
QuestDB. Each batch counts as out-of-order against the live data already
committed.

Enable deduplication on the row key so that re-consumed rows are detected
as identical to the existing rows and skipped without rewriting. This makes
replay safe to repeat without inflating write amplification.

### Sensor backfill

A field device loses connectivity, buffers several hours of readings, and
flushes them when reconnected. The buffered rows have timestamps older than
the live data already in QuestDB.

This works as expected over ILP. The buffered batch is merged into the
relevant partitions. The cost is proportional to the size of the batch and
how far back in time it reaches.

## Parquet partitions

Out-of-order writes targeting a partition that has been converted to Parquet
are governed by storage-tier rules rather than the standard merge path. See
[Storage policy](/docs/concepts/storage-policy/) for the full behavior.

## See also

- [Designated timestamp](/docs/concepts/designated-timestamp/)
- [Partition splitting and squashing](/docs/concepts/partitions/#partition-splitting-and-squashing)
- [Deduplication](/docs/concepts/deduplication/)
- [Write-ahead log](/docs/concepts/write-ahead-log/)
- [Write amplification](/docs/getting-started/capacity-planning/#write-amplification)
