---
title: Write-Ahead Log (WAL)
sidebar_label: Write-Ahead Log
description:
  WAL enables concurrent writes, crash recovery, and replication for
  high availability.
---

import Screenshot from "@theme/Screenshot"

Write-Ahead Log (WAL) records all changes before applying them to storage.
This enables concurrent writes, crash recovery, and replication.

**WAL is enabled by default and recommended for all tables.**

## Why WAL matters

| Capability | Description |
|------------|-------------|
| **Concurrent writes** | Multiple clients can write simultaneously without blocking |
| **Crash recovery** | Committed data is never lost — replay from log after restart |
| **Replication** | WAL enables high availability and disaster recovery |
| **Out-of-order handling** | Late-arriving data is merged efficiently. See [Out-of-order data](/docs/concepts/out-of-order-data/). |
| **Deduplication** | Enables [DEDUP UPSERT KEYS](/docs/concepts/deduplication/) |

In QuestDB Enterprise, WAL segments are sent to object storage immediately
on commit, enabling real-time replication to standby nodes.

## Creating WAL tables

WAL is enabled by default for partitioned tables:

```questdb-sql
CREATE TABLE prices (
    ts TIMESTAMP,
    ticker SYMBOL,
    price DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY;
-- This is a WAL table (default)
```

You can be explicit with the `WAL` keyword:

```questdb-sql
CREATE TABLE prices (...)
TIMESTAMP(ts) PARTITION BY DAY WAL;
```

## Requirements

**WAL requires partitioning.** Non-partitioned tables cannot use WAL.

| Table creation method | Default partitioning | WAL enabled? |
|----------------------|---------------------|--------------|
| SQL `CREATE TABLE` without `PARTITION BY` | None | **No** |
| SQL `CREATE TABLE` with `PARTITION BY` | As specified | Yes |
| ILP auto-created tables | `PARTITION BY DAY` | Yes |

```questdb-sql
-- Non-partitioned = no WAL (not recommended for time-series)
CREATE TABLE static_data (key VARCHAR, value VARCHAR);

-- Partitioned = WAL enabled (recommended)
CREATE TABLE prices (...)
TIMESTAMP(ts) PARTITION BY DAY;
```

If you need WAL features (concurrent writes, replication, deduplication),
always specify `PARTITION BY` when creating tables via SQL.

## Checking WAL status

Check if a table uses WAL:

```questdb-sql
SELECT name, walEnabled FROM tables() WHERE name = 'prices';
```

Check WAL table status:

```questdb-sql
SELECT * FROM wal_tables();
```

If WAL transactions are suspended (rare), resume them:

```questdb-sql
ALTER TABLE prices RESUME WAL;
```

For a suspended materialized view or live view, use
[`ALTER MATERIALIZED VIEW RESUME WAL`](/docs/query/sql/alter-mat-view-resume-wal/)
or [`ALTER LIVE VIEW RESUME WAL`](/docs/query/sql/alter-live-view-resume-wal/)
instead.

## How WAL works

When data is written to a WAL table:

1. Data is written to WAL segments (fast sequential writes)
2. Transaction is committed and acknowledged to client
3. WAL apply job merges data into table storage asynchronously
4. In Enterprise, WAL segments replicate to object storage

This decouples the commit (fast) from storage application (background),
enabling high write throughput.

WAL apply sorts and commits many WAL transactions together as one block;
larger blocks reduce out-of-order merges but use more memory per block.
[Adaptive blocks](/docs/configuration/wal/#adaptive-wal-apply-blocks) are enabled
by default and grow within a memory budget.

<Screenshot
  alt="Diagram showing the sequencer allocating txn numbers to events chronologically"
  title="The sequencer allocates unique transaction numbers and serves as the single source of truth."
  height={435}
  src="images/docs/concepts/wal_sequencer.webp"
  width={745}
/>

<Screenshot
  alt="Diagram showing the WAL job application and WAL collect events and commit to QuestDB"
  title="The WAL apply job collects transactions sequentially for writing to storage."
  height={435}
  src="images/docs/concepts/wal_process.webp"
  width={745}
/>

## Configuration

WAL behavior can be tuned via server configuration:

- `cairo.wal.enabled.default` — WAL enabled by default (default: `true`)
- Parallel threads for WAL application — see [WAL configuration](/docs/configuration/wal/)
- Adaptive WAL apply blocks: [starting size](/docs/configuration/wal/#cairowalapplyblocksize), [row cap](/docs/configuration/wal/#cairowalapplyblockmaxrows), and [memory budget](/docs/configuration/wal/#cairowalapplyblockmemorypercent).
- `cairo.wal.apply.memory.limit.bytes` — cap on the native memory a WAL apply
  batch may allocate; see [memory limits](/docs/configuration/cairo-engine/#memory-limits)

To convert an existing table between WAL and non-WAL:

```questdb-sql
ALTER TABLE prices SET TYPE WAL;
-- Requires database restart to take effect
```

See [ALTER TABLE SET TYPE](/docs/query/sql/alter-table-set-type/) for details.

## See also

- [Replication](/docs/high-availability/overview/) — high availability and failover
- [Deduplication](/docs/concepts/deduplication/) — requires WAL
- [CREATE TABLE](/docs/query/sql/create-table/#write-ahead-log-wal-settings) — WAL syntax
