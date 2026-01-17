---
title: Deduplication
sidebar_label: Deduplication
description:
  Deduplication prevents duplicate rows and reduces write amplification
  when reloading data.
---

import Screenshot from "@theme/Screenshot"

Deduplication ensures that only one row exists for a given set of key columns.
When a new row matches an existing row's keys, the old row is replaced.

<Screenshot
  alt="Animation showing how deduplication handles incoming rows - inserting new keys, replacing duplicates, and skipping identical rows"
  src="images/docs/concepts/deduplication.svg"
  width={700}
  forceTheme="dark"
/>

## When to use deduplication

**Use deduplication when:**

- You need idempotent writes (safe to retry or resend data)
- You're reloading data that may have changed (e.g., third-party data feeds)
- You want "last write wins" behavior for a given key
- You're recovering from ingestion errors and need to resend a time range

**Skip deduplication when:**

- Your timestamps are always unique (no duplicates possible)
- You're doing append-only logging where duplicates are acceptable
- Write performance is critical and you're certain duplicates won't occur

## Quick example

```questdb-sql
CREATE TABLE prices (
    ts TIMESTAMP,
    ticker SYMBOL,
    price DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY WAL
DEDUP UPSERT KEYS(ts, ticker);
```

With this configuration, each `(ts, ticker)` combination can have only one row:

```questdb-sql
INSERT INTO prices VALUES ('2024-01-15T10:00:00', 'AAPL', 185.50);
INSERT INTO prices VALUES ('2024-01-15T10:00:00', 'AAPL', 186.00);  -- replaces previous

SELECT * FROM prices;
```

| ts | ticker | price |
|----|--------|-------|
| 2024-01-15T10:00:00 | AAPL | 186.00 |

Only the last value is kept.

## How it works

When deduplication is enabled, QuestDB:

1. Checks if incoming rows match existing rows by UPSERT KEYS
2. If keys match, compares the full row content
3. If the row is identical, skips the write entirely (no disk I/O)
4. If the row differs, replaces the old row with the new one

This full-row comparison significantly reduces write amplification when
reloading large datasets where only a small portion has changed — common
when consuming third-party data feeds that provide full snapshots.

## Performance

Deduplication has minimal overhead when:

- Timestamps are mostly unique across rows
- Data arrives in roughly time-ordered fashion

Deduplication is more expensive when:

- Many rows share the same timestamp
- Deduplication keys have high cardinality

The full-row check optimization means that reloading unchanged data is
cheap — QuestDB detects identical rows and skips unnecessary writes.

## Configuration

### Create table with deduplication

```questdb-sql
CREATE TABLE prices (
    ts TIMESTAMP,
    ticker SYMBOL,
    price DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY WAL
DEDUP UPSERT KEYS(ts, ticker);
```

The designated timestamp must always be included in UPSERT KEYS.

### Enable on existing table

```questdb-sql
ALTER TABLE prices DEDUP ENABLE UPSERT KEYS(ts, ticker);
```

### Disable deduplication

```questdb-sql
ALTER TABLE prices DEDUP DISABLE;
```

### Change UPSERT KEYS

```questdb-sql
ALTER TABLE prices DEDUP ENABLE UPSERT KEYS(ts, ticker, exchange);
```

## Checking configuration

Check if deduplication is enabled:

```questdb-sql
SELECT dedup FROM tables() WHERE table_name = 'prices';
```

Check which columns are UPSERT KEYS:

```questdb-sql
SELECT "column", upsertKey FROM table_columns('prices');
```

## Requirements

- Deduplication requires [WAL tables](/docs/concepts/write-ahead-log/)
- The designated timestamp must be included in UPSERT KEYS
- Enabling deduplication does not deduplicate existing data — only new inserts

## See also

- [CREATE TABLE ... DEDUP](/docs/query/sql/create-table/#deduplication)
- [ALTER TABLE DEDUP ENABLE](/docs/query/sql/alter-table-enable-deduplication/)
- [ALTER TABLE DEDUP DISABLE](/docs/query/sql/alter-table-disable-deduplication/)
