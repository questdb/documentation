---
title: Parallel SQL execution
description: Configuration settings for parallel SQL execution in QuestDB.
---

These settings control the level of parallelism during SQL execution, affecting
both filter performance and memory usage. JIT compilation of filter expressions
requires parallel filtering to be enabled.

## cairo.page.frame.column.list.capacity

- **Default**: `16`
- **Reloadable**: no

Column list capacity for each slot of the reduce queue. Used by JIT-compiled
filter functions. Larger values reduce memory allocation rate but increase
minimum RSS size.

## cairo.page.frame.reduce.queue.capacity

- **Default**: `64`
- **Reloadable**: no

Reduce queue capacity for data processing. Should be large enough to supply
tasks for worker threads in the shared worker pool.

## cairo.page.frame.rowid.list.capacity

- **Default**: `256`
- **Reloadable**: no

Row ID list initial capacity for each slot of the reduce queue. Larger values
reduce memory allocation rate but increase minimum RSS size.

## cairo.page.frame.shard.count

- **Default**: `4`
- **Reloadable**: no

Number of shards for both dispatch and reduce queues. Shards reduce queue
contention between SQL statements executed concurrently.

## cairo.sql.parallel.filter.enabled

- **Default**: `true`
- **Reloadable**: no

Enable or disable parallel SQL filter execution. JIT compilation only takes
place when this setting is enabled.

## cairo.sql.parallel.filter.pretouch.enabled

- **Default**: `true`
- **Reloadable**: no

Enable column pre-touch as part of parallel SQL filter execution, to improve
query performance for large tables.
