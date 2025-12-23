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
| **Out-of-order handling** | Late-arriving data is merged efficiently |
| **Deduplication** | Enables [DEDUP UPSERT KEYS](/docs/concept/deduplication/) |

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

WAL tables must be partitioned. Non-partitioned tables cannot use WAL:

```questdb-sql
-- Non-partitioned = no WAL (not recommended)
CREATE TABLE static_data (key VARCHAR, value VARCHAR);

-- Partitioned = WAL enabled (recommended)
CREATE TABLE prices (...)
TIMESTAMP(ts) PARTITION BY DAY;
```

Always use partitioned tables to get WAL benefits.

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

## How WAL works

When data is written to a WAL table:

1. Data is written to WAL segments (fast sequential writes)
2. Transaction is committed and acknowledged to client
3. WAL apply job merges data into table storage asynchronously
4. In Enterprise, WAL segments replicate to object storage

This decouples the commit (fast) from storage application (background),
enabling high write throughput.

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
- Parallel threads for WAL application — see [WAL configuration](/docs/configuration/#wal-table-configurations)

To convert an existing table between WAL and non-WAL:

```questdb-sql
ALTER TABLE prices SET TYPE WAL;
-- Requires database restart to take effect
```

See [ALTER TABLE SET TYPE](/docs/reference/sql/alter-table-set-type/) for details.

## See also

- [Replication](/docs/concept/replication/) — high availability and failover
- [Deduplication](/docs/concept/deduplication/) — requires WAL
- [CREATE TABLE](/docs/reference/sql/create-table/#write-ahead-log-wal-settings) — WAL syntax
