---
title: Storage Policy
sidebar_label: Storage Policy
description: Automate partition lifecycle in QuestDB Enterprise - convert to Parquet locally and drop old data on a schedule.
---

:::note

Storage policies are available in **QuestDB Enterprise** only.

:::

A storage policy automates the lifecycle of table partitions. It defines when
partitions are converted to Parquet and when local copies are dropped.
Converting a partition to Parquet removes its native files and serves reads directly from the Parquet file. This replaces the need for manual partition management or external scheduling.

:::info

Storage policies currently operate **locally only**. `TO PARQUET` and
`DROP LOCAL` are the enforced stages. `TO REMOTE` is accepted and stored but
not yet enforced, so setting it has no effect for now: no upload to object
storage happens yet. `DROP REMOTE` is not yet supported and is rejected at SQL
parse time with `'DROP REMOTE' is not supported yet`. In the
[`storage_policies`](/docs/query/functions/meta/#storage_policies) view the
`drop_remote` column is therefore always `0h`, and `to_remote` reads `0h`
unless you set a `TO REMOTE` value (which is stored but has no effect yet).
Object storage integration will be added in a future release.

:::

## Requirements

Storage policies require:

- A [designated timestamp](/docs/concepts/designated-timestamp/) column
- [Partitioning](/docs/concepts/partitions/) enabled
- QuestDB Enterprise

## How it works

A storage policy consists of up to four TTL settings. Each setting controls a
stage in the partition lifecycle:

| Setting       | Description                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `TO PARQUET`  | Convert the partition from native binary format to Parquet. The native files are removed and reads are served from the Parquet file |
| `TO REMOTE`   | Accepted and stored but **not yet enforced**; no upload happens yet. Reserved for future object storage upload                                          |
| `DROP LOCAL`  | Remove all local data (native or Parquet)                                                                                           |
| `DROP REMOTE` | _Not yet supported._ Rejected at parse time with `'DROP REMOTE' is not supported yet`. Reserved for future object storage removal                                        |

All settings are optional. Use only the ones relevant to your use case. All TTL
values must be **positive**; `0` is rejected.

### Partition lifecycle

As time passes, each partition progresses through the stages defined by the
policy:

```text
                       TO PARQUET                 DROP LOCAL
   [Native] ───────────────┬──────────────────────────┬───────
                           │                          │
                           ▼                          ▼
                    Parquet only (local)         Data removed
```

### TTL evaluation

Storage policy TTLs follow the same evaluation rules as
[TTL](/docs/concepts/ttl/). A partition becomes eligible for a lifecycle action
when its **entire time range** falls outside the TTL window:

```text
eligible when: partition_end_time < reference_time - TTL
```

**This rule is applied independently for each stage's TTL.** A partition can
be eligible for `TO PARQUET` long before it is eligible for `DROP LOCAL` (or,
one day, the reserved `TO REMOTE` and `DROP REMOTE` stages). Each stage uses
its own `TTL` in the formula above; the stages share only the reference time
and the [ordering constraints](#ordering-constraint).

The reference time is `min(wall_clock_time, latest_timestamp)` by default —
the same formula used by TTL. The
[`cairo.ttl.use.wall.clock`](/docs/concepts/ttl/#restore-legacy-behavior)
setting applies to storage policies as well: setting it to `false` removes
the wall-clock cap for both TTL and storage policy evaluation. See
[TTL § Reference time](/docs/concepts/ttl/#reference-time) for the rationale
and the data-loss hazard of disabling the cap.

QuestDB checks storage policies periodically (every 5 minutes by default) and
processes eligible partitions automatically.

## Storage policy vs TTL

Storage policies replace [TTL](/docs/concepts/ttl/) in QuestDB Enterprise. If
you are already familiar with TTL, this comparison is the fastest way in:

|                        | TTL                       | Storage Policy                           |
| ---------------------- | ------------------------- | ---------------------------------------- |
| **Availability**       | Open source               | Enterprise only                          |
| **Action**             | Drops partitions entirely | Graduated lifecycle (convert, then drop) |
| **Parquet conversion** | No                        | Yes (automatic local conversion)         |
| **Granularity**        | Single retention window   | Up to four independent TTL stages        |

In QuestDB Enterprise, use storage policies instead of TTL. On a regular table,
`ALTER TABLE SET TTL` with a non-zero value is rejected, while
`CREATE TABLE ... TTL` is accepted only for backward compatibility and is
translated into a `STORAGE POLICY(DROP LOCAL ...)`:

```questdb-sql
-- Instead of:
-- ALTER TABLE trades SET TTL 30 DAYS;

-- Use:
ALTER TABLE trades SET STORAGE POLICY(DROP LOCAL 30d);
```

:::note

A table can carry a TTL only if it was created in QuestDB Open Source and later
upgraded to Enterprise. Clear that legacy TTL with `ALTER TABLE SET TTL 0`
before setting a storage policy; otherwise `SET STORAGE POLICY` is rejected with
`Cannot set storage policy, please, remove TTL settings`. On Enterprise tables
`SET TTL 0` is the only accepted `SET TTL` value; any non-zero value is rejected
with `TTL is not supported on Enterprise tables; use a storage policy instead`.

:::

## Setting a storage policy

### At table creation

```questdb-sql
CREATE TABLE trades (
    ts TIMESTAMP,
    symbol SYMBOL,
    price DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY
    STORAGE POLICY(TO PARQUET 3d, DROP LOCAL 1M)
    WAL;
```

### On existing tables

```questdb-sql
ALTER TABLE trades SET STORAGE POLICY(
    TO PARQUET 3 DAYS,
    DROP LOCAL 1 MONTH
);
```

`SET STORAGE POLICY` replaces the policy in full: every stage you omit is
cleared, not preserved. To keep a stage, restate it in the same statement.

For full syntax details, see
[ALTER TABLE SET STORAGE POLICY](/docs/query/sql/alter-table-set-storage-policy/).

## TTL duration format

Storage policy TTLs accept the same duration formats as
[TTL](/docs/concepts/ttl/):

| Unit   | Long form              | Short form  |
| ------ | ---------------------- | ----------- |
| Hours  | `1 HOUR` / `2 HOURS`   | `1h`        |
| Days   | `1 DAY` / `3 DAYS`     | `1d` / `3d` |
| Weeks  | `1 WEEK` / `2 WEEKS`   | `1W` / `2W` |
| Months | `1 MONTH` / `6 MONTHS` | `1M` / `6M` |
| Years  | `1 YEAR` / `2 YEARS`   | `1Y` / `2Y` |

### Ordering constraint

The stages form a partial order, not a single chain. A drop stage may not fire
before the write stage it depends on:

```text
TO PARQUET <= DROP LOCAL
TO REMOTE  <= DROP LOCAL <= DROP REMOTE
```

`TO PARQUET` and `TO REMOTE` are **independent**: neither has to precede the
other. Once remote upload is enforced, a `TO REMOTE` that runs before
`TO PARQUET` would keep both the native and Parquet copies on local disk, with
reads served from the native format until `TO PARQUET` removes the native
files. All TTL values must be positive; `0` is rejected.

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

| table_dir_name | to_parquet | to_remote | drop_local | drop_remote | status | last_updated                |
| -------------- | ---------- | --------- | ---------- | ----------- | ------ | --------------------------- |
| trades~12      | 72h        | 0h        | 1m         | 0h          | A      | 2025-01-15T10:30:00.000000Z |

- TTL values are rendered in two units: `h` for hours and `m` for **months**.
  Hour-, day-, and week-based durations are stored as hours, so a `3 DAYS` TTL
  appears as `72h` and `1 WEEK` as `168h`. Month- and year-based durations are
  stored as months, so `1 MONTH` appears as `1m` and `1 YEAR` as `12m`. In this
  view **`m` means months, not minutes**; QuestDB's duration shorthand has no
  unit for minutes
- Status `A` means active; `D` means disabled (see
  [Disabling and enabling](#disabling-and-enabling))
- An unset stage renders as `0h`, not blank. Because `DROP REMOTE` is rejected
  at parse time, `drop_remote` is always `0h`; `to_remote` reads `0h` unless a
  `TO REMOTE` value is set (stored, but not yet enforced)

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
accept values with unit suffixes (e.g., `5m`, `1h`, `100ms`) or raw microsecond
values:

| Property                              | Default            | Description                                                      |
| ------------------------------------- | ------------------ | ---------------------------------------------------------------- |
| `storage.policy.check.interval`       | `5m` (5 min)       | How often QuestDB scans for partitions to process                |
| `storage.policy.retry.interval`       | `1m` (1 min)       | Retry interval for failed tasks                                  |
| `storage.policy.max.reschedule.count` | `20`               | Maximum retries before abandoning a task                         |
| `storage.policy.worker.count`         | `4`                | Number of storage policy worker threads (0 disables the feature) |
| `storage.policy.worker.affinity`      | `-1` (no affinity) | CPU affinity for each worker thread (comma-separated list)       |
| `storage.policy.worker.sleep.timeout` | `100ms`            | Sleep duration when worker has no tasks                          |

See
[Storage policy configuration](/docs/configuration/storage-policy/) for the
complete list, including the remaining worker-pool tuning properties.

## Permissions

Storage policy operations require specific permissions in QuestDB Enterprise:

| Operation                | Required permission      |
| ------------------------ | ------------------------ |
| `SET STORAGE POLICY`     | `SET STORAGE POLICY`     |
| `DROP STORAGE POLICY`    | `REMOVE STORAGE POLICY`  |
| `ENABLE STORAGE POLICY`  | `ENABLE STORAGE POLICY`  |
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
    STORAGE POLICY(TO PARQUET 3d, DROP LOCAL 1M)
    WAL;
```

```questdb-sql title="2. Verify via the system view"
SELECT table_dir_name, to_parquet, drop_local, status
FROM storage_policies
WHERE table_dir_name LIKE 'trades%';
```

| table_dir_name | to_parquet | drop_local | status |
| -------------- | ---------- | ---------- | ------ |
| trades~12      | 72h        | 1m         | A      |

```questdb-sql title="3. Replace the policy (omitted stages are cleared)"
ALTER TABLE trades SET STORAGE POLICY(TO PARQUET 1d);
```

```questdb-sql title="4. Inspect the current DDL"
SHOW CREATE TABLE trades;
```

```questdb-sql
CREATE TABLE 'trades' (
    ts TIMESTAMP,
    symbol SYMBOL CAPACITY 256 CACHE,
    price DOUBLE
) timestamp(ts) PARTITION BY DAY
STORAGE POLICY(TO PARQUET 1 DAY) WAL;
```

The `DROP LOCAL 1 MONTH` stage from step 1 is gone: step 3 restated only
`TO PARQUET`, and `SET STORAGE POLICY` replaces the whole policy rather than
merging into it.

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

| Use case          | Suggested policy                | Rationale                                                        |
| ----------------- | ------------------------------- | ---------------------------------------------------------------- |
| Real-time metrics | `TO PARQUET 1d, DROP LOCAL 30d` | Keep recent data fast, drop old data automatically               |
| Trading data      | `TO PARQUET 7d`                 | Keep Parquet locally for long-term queries                       |
| IoT telemetry     | `TO PARQUET 1d, DROP LOCAL 90d` | High volume, convert early to save disk before dropping the data |
| Aggregated views  | `TO PARQUET 30d`                | Low volume, keep locally in Parquet                              |

**Tips:**

- Start with `TO PARQUET` to reduce local disk usage while keeping data
  queryable in Parquet format
- Use `DROP LOCAL` with care as it permanently removes data from the local disk
- TTL values should be significantly larger than the partition interval
