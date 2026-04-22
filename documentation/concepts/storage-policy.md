---
title: Storage Policy
sidebar_label: Storage Policy
description: Automate partition lifecycle in QuestDB Enterprise - convert to Parquet locally and drop old data on a schedule.
---

:::note

Storage policies are available in **QuestDB Enterprise** only.

:::

A storage policy automates the lifecycle of table partitions. It defines when
partitions are converted to Parquet, when native data is removed, and when local
copies are dropped. This replaces the need for manual partition management or
external scheduling.

:::info

Storage policies currently operate **locally only**. Parquet files are not
automatically uploaded to object storage, and the `DROP REMOTE` clause is
reserved syntax — it is recognised by the parser but rejected at execute time
with `'DROP REMOTE' is not supported yet`. Accordingly, the `drop_remote`
column in the [`storage_policies`](/docs/query/functions/meta/#storage_policies)
view is always blank in the current release; it is kept for forward
compatibility. Object storage integration will be added in a future release.

:::

## Requirements

Storage policies require:

- A [designated timestamp](/docs/concepts/designated-timestamp/) column
- [Partitioning](/docs/concepts/partitions/) enabled
- QuestDB Enterprise

## How it works

A storage policy consists of up to four TTL settings. Each setting controls a
stage in the partition lifecycle:

| Setting | Description |
|---------|-------------|
| `TO PARQUET` | Convert the partition from native binary format to Parquet |
| `DROP NATIVE` | Remove native binary files, keeping only the local Parquet copy |
| `DROP LOCAL` | Remove all local data (both native and Parquet) |
| `DROP REMOTE` | _Reserved._ Will remove the Parquet file from object storage when remote upload is supported |

All settings are optional. Use only the ones relevant to your use case. All TTL
values must be **positive**; `0` is rejected.

### Partition lifecycle

As time passes, each partition progresses through the stages defined by the
policy:

```text
                  TO PARQUET        DROP NATIVE       DROP LOCAL
   [Native] ──────────┬──────────────────┬──────────────────┬───────
                      │                  │                  │
                      ▼                  ▼                  ▼
               Native + Parquet    Parquet only       Data removed
                  (local)            (local)
```

### TTL evaluation

Storage policy TTLs follow the same evaluation rules as
[TTL](/docs/concepts/ttl/). A partition becomes eligible for a lifecycle action
when its **entire time range** falls outside the TTL window:

```text
eligible when: partition_end_time < reference_time - TTL
```

**This rule is applied independently for each stage's TTL.** A partition can
be eligible for `TO PARQUET` long before it is eligible for `DROP NATIVE`,
`DROP LOCAL`, or (one day) `DROP REMOTE`. Each stage uses its own `TTL` in the
formula above; the stages share only the reference time and the ordering
constraint `TO PARQUET <= DROP NATIVE <= DROP LOCAL <= DROP REMOTE`.

The reference time is `min(wall_clock_time, latest_timestamp)` by default.

QuestDB checks storage policies periodically (every 15 minutes by default) and
processes eligible partitions automatically.

## Storage policy vs TTL

Storage policies replace [TTL](/docs/concepts/ttl/) in QuestDB Enterprise. If
you are already familiar with TTL, this comparison is the fastest way in:

| | TTL | Storage Policy |
|---|-----|----------------|
| **Availability** | Open source | Enterprise only |
| **Action** | Drops partitions entirely | Graduated lifecycle (convert, then drop) |
| **Parquet conversion** | No | Yes (automatic local conversion) |
| **Granularity** | Single retention window | Up to four independent TTL stages |

In QuestDB Enterprise, `CREATE TABLE ... TTL` and `ALTER TABLE SET TTL` are
deprecated. Use storage policies instead:

```questdb-sql
-- Instead of:
-- ALTER TABLE trades SET TTL 30 DAYS;

-- Use:
ALTER TABLE trades SET STORAGE POLICY(DROP LOCAL 30d);
```

:::note

If a table already has a TTL set, you must clear it with
`ALTER TABLE SET TTL 0` before setting a storage policy. `SET TTL 0` is the
only `SET TTL` value Enterprise accepts; any non-zero value is rejected with
`TTL settings are deprecated, please, create a storage policy instead`.

:::

## Setting a storage policy

### At table creation

```questdb-sql
CREATE TABLE trades (
    ts TIMESTAMP,
    symbol SYMBOL,
    price DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY
    STORAGE POLICY(TO PARQUET 3d, DROP NATIVE 10d, DROP LOCAL 1M)
    WAL;
```

### On existing tables

```questdb-sql
ALTER TABLE trades SET STORAGE POLICY(
    TO PARQUET 3 DAYS,
    DROP NATIVE 10 DAYS,
    DROP LOCAL 1 MONTH
);
```

Only the specified settings are changed. Omitted settings remain unchanged.

### On materialized views

```questdb-sql
CREATE MATERIALIZED VIEW hourly_trades AS (
    SELECT ts, symbol, sum(price) total
    FROM trades
    SAMPLE BY 1h
) PARTITION BY DAY
    STORAGE POLICY(TO PARQUET 7d, DROP NATIVE 14d);
```

```questdb-sql
ALTER MATERIALIZED VIEW hourly_trades SET STORAGE POLICY(TO PARQUET 7d);
```

For full syntax details, see
[ALTER TABLE SET STORAGE POLICY](/docs/query/sql/alter-table-set-storage-policy/).

## TTL duration format

Storage policy TTLs accept the same duration formats as
[TTL](/docs/concepts/ttl/):

| Unit | Long form | Short form |
|------|-----------|------------|
| Hours | `1 HOUR` / `2 HOURS` | `1h` |
| Days | `1 DAY` / `3 DAYS` | `1d` / `3d` |
| Weeks | `1 WEEK` / `2 WEEKS` | `1W` / `2W` |
| Months | `1 MONTH` / `6 MONTHS` | `1M` / `6M` |
| Years | `1 YEAR` / `2 YEARS` | `1Y` / `2Y` |

### Ordering constraint

TTL values must be in ascending order:

```text
TO PARQUET <= DROP NATIVE <= DROP LOCAL <= DROP REMOTE
```

For example, you cannot drop native files before the Parquet conversion
completes. All TTL values must be positive — `0` is rejected.

## Disabling and enabling

Temporarily suspend a storage policy without removing it:

```questdb-sql
ALTER TABLE trades DISABLE STORAGE POLICY;
```

Re-enable it later:

```questdb-sql
ALTER TABLE trades ENABLE STORAGE POLICY;
```

Both `ENABLE` and `DISABLE` require a policy to exist on the table; the
statement returns an error otherwise.

## Removing a storage policy

To permanently remove a storage policy from a table:

```questdb-sql
ALTER TABLE trades DROP STORAGE POLICY;
```

## Checking storage policies

Query the `storage_policies` system view to see all active policies:

```questdb-sql
SELECT * FROM storage_policies;
```

| table_dir_name | to_parquet | drop_native | drop_local | drop_remote | status | last_updated |
|----------------|-----------|-------------|------------|-------------|--------|--------------|
| trades~12 | 72h | 240h | 1M | | A | 2025-01-15T10:30:00.000000Z |

- TTL values are rendered in their native stored units. `h` means hours; `M`
  means months. **`1M` in this view means one month, not one minute** — the
  view uses the `MONTH` shorthand documented in
  [TTL duration format](#ttl-duration-format)
- Status `A` means active; `D` means disabled (see
  [Disabling and enabling](#disabling-and-enabling))
- Unset stages appear blank. `drop_remote` is **always blank in the current
  release** because `DROP REMOTE` is rejected at execute time with
  `'DROP REMOTE' is not supported yet`; the column is kept for forward
  compatibility

For the full column reference and types, see
[`storage_policies`](/docs/query/functions/meta/#storage_policies).

## Replication

Storage policy definitions are persisted in WAL-backed system tables, so the
policy itself is replicated to every instance in the cluster. Enforcement runs
**independently on each instance** — Parquet files are produced locally and
are not replicated.

This means the primary and its replicas can temporarily disagree on which
partitions have been converted to Parquet or dropped, depending on when each
node's storage policy [check interval](#configuration) last fired. The state
converges as each instance processes its own queue. See
[Replication overview](/docs/high-availability/overview/#storage-policies-in-a-replicated-cluster)
for details.

## Configuration

Storage policy behavior can be tuned in `server.conf`. Time-based properties
accept values with unit suffixes (e.g., `15m`, `30s`, `1h`) or raw microsecond
values:

| Property | Default | Description |
|----------|---------|-------------|
| `storage.policy.check.interval` | `15m` (15 min) | How often QuestDB scans for partitions to process |
| `storage.policy.retry.interval` | `1m` (1 min) | Retry interval for failed tasks |
| `storage.policy.max.reschedule.count` | `20` | Maximum retries before abandoning a task |
| `storage.policy.writer.wait.timeout` | `30s` (30 sec) | Timeout for acquiring the table writer |
| `storage.policy.worker.count` | `2` | Number of storage policy worker threads (0 disables the feature) |
| `storage.policy.worker.affinity` | `-1` (no affinity) | CPU affinity for each worker thread (comma-separated list) |
| `storage.policy.worker.sleep.timeout` | `100ms` | Sleep duration when worker has no tasks |

## Permissions

Storage policy operations require specific permissions in QuestDB Enterprise:

| Operation | Required permission |
|-----------|-------------------|
| `SET STORAGE POLICY` | `SET STORAGE POLICY` |
| `DROP STORAGE POLICY` | `REMOVE STORAGE POLICY` |
| `ENABLE STORAGE POLICY` | `ENABLE STORAGE POLICY` |
| `DISABLE STORAGE POLICY` | `DISABLE STORAGE POLICY` |

Grant permissions using standard RBAC syntax:

```questdb-sql
GRANT SET STORAGE POLICY ON trades TO analyst;
GRANT REMOVE STORAGE POLICY ON trades TO admin;
```

## End-to-end example

A complete lifecycle on a single table, from creation through verification,
modification, inspection of the generated DDL, temporary suspension, and
permanent removal:

```questdb-sql title="1. Create the table with a storage policy"
CREATE TABLE trades (
    ts TIMESTAMP,
    symbol SYMBOL,
    price DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY
    STORAGE POLICY(TO PARQUET 3d, DROP NATIVE 10d, DROP LOCAL 1M)
    WAL;
```

```questdb-sql title="2. Verify via the system view"
SELECT table_dir_name, to_parquet, drop_native, drop_local, status
FROM storage_policies
WHERE table_dir_name LIKE 'trades%';
```

| table_dir_name | to_parquet | drop_native | drop_local | status |
|----------------|------------|-------------|------------|--------|
| trades~12      | 72h        | 240h        | 1M         | A      |

```questdb-sql title="3. Modify one stage (others remain unchanged)"
ALTER TABLE trades SET STORAGE POLICY(TO PARQUET 1d);
```

```questdb-sql title="4. Inspect the current DDL"
SHOW CREATE TABLE trades;
```

```text
CREATE TABLE 'trades' (
    ts TIMESTAMP,
    symbol SYMBOL CAPACITY 256 CACHE,
    price DOUBLE
) timestamp(ts) PARTITION BY DAY
STORAGE POLICY(TO PARQUET 1 DAY, DROP NATIVE 10 DAYS, DROP LOCAL 1 MONTH) WAL;
```

```questdb-sql title="5. Temporarily suspend the policy (e.g. during a backfill)"
ALTER TABLE trades DISABLE STORAGE POLICY;
-- status in storage_policies changes to 'D'
```

```questdb-sql title="6. Re-enable and, later, drop it for good"
ALTER TABLE trades ENABLE STORAGE POLICY;
ALTER TABLE trades DROP STORAGE POLICY;
-- row disappears from storage_policies
```

## Guidelines

| Use case | Suggested policy | Rationale |
|----------|-----------------|-----------|
| Real-time metrics | `TO PARQUET 1d, DROP NATIVE 7d, DROP LOCAL 30d` | Keep recent data fast, drop old data automatically |
| Trading data | `TO PARQUET 7d, DROP NATIVE 30d` | Keep Parquet locally for long-term queries |
| IoT telemetry | `TO PARQUET 1d, DROP NATIVE 3d, DROP LOCAL 90d` | High volume, convert early to save disk; keep a brief native overlap for in-flight queries before dropping the native files |
| Aggregated views | `TO PARQUET 30d` | Low volume, keep locally in Parquet |

**Tips:**

- Start with `TO PARQUET` and `DROP NATIVE` to reduce local disk usage while
  keeping data queryable in Parquet format
- Use `DROP LOCAL` with care as it permanently removes data from the local disk
- TTL values should be significantly larger than the partition interval
