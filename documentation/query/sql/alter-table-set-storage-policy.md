---
title: ALTER TABLE SET STORAGE POLICY
sidebar_label: SET STORAGE POLICY
description: ALTER TABLE SET STORAGE POLICY SQL keyword reference documentation.
---

Sets, modifies, enables, disables, or removes a storage policy on a table.

:::note

Storage policies are available in **QuestDB Enterprise** only.

:::

Refer to the [Storage Policy](/docs/concepts/storage-policy/) concept guide for
a full overview.

## Syntax

### Set or modify a storage policy

```questdb-sql
ALTER TABLE table_name SET STORAGE POLICY(
    [TO PARQUET ttl,]
    [TO REMOTE ttl,]
    [DROP LOCAL ttl,]
    [DROP REMOTE ttl]
);
```

`SET STORAGE POLICY` replaces the policy as a whole. Any stage you do not list
is cleared, not preserved, so restate every stage you want to keep.

### Enable or disable a storage policy

```questdb-sql
ALTER TABLE table_name ENABLE STORAGE POLICY;
ALTER TABLE table_name DISABLE STORAGE POLICY;
```

Disabling a policy suspends processing without removing the policy definition.

### Remove a storage policy

```questdb-sql
ALTER TABLE table_name DROP STORAGE POLICY;
```

This permanently removes the storage policy from the table.

## Description

A storage policy defines up to four TTL-based stages that control how partitions
transition from native format to Parquet and eventually get removed:

| Setting             | Effect                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `TO PARQUET <ttl>`  | Convert partition from native format to Parquet locally. The native files are removed and reads are served from the Parquet file |
| `TO REMOTE <ttl>`   | Upload a compact Parquet snapshot to object storage. The local partition stays writable and is still the serving copy            |
| `DROP LOCAL <ttl>`  | Seal the partition as read-only and remove its local copies. With `TO REMOTE` set, reads switch to the remote copy               |
| `DROP REMOTE <ttl>` | Remove the partition from the table and reclaim its remote objects after a grace period                                          |

The two remote stages drive [cold storage](/docs/concepts/cold-storage/) and require it to be enabled and configured on every instance.

:::warning

`DROP LOCAL` without `TO REMOTE` permanently deletes the partition. With `TO REMOTE` it makes the partition read-only for good: later writes targeting it are skipped, and there is no way to unseal it.

`DROP REMOTE` is the only stage that physically deletes data with no local copy left behind.

:::

### TTL format

Follow each setting with a duration value using one of these formats:

- Long form: `3 DAYS`, `1 MONTH`, `2 YEARS`
- Short form: `3d`, `1M`, `2Y`

Supported units: `HOUR`/`h`, `DAY`/`d`, `WEEK`/`W`, `MONTH`/`M`, `YEAR`/`Y`.
Both singular and plural forms are accepted.

### Constraints

- A drop stage may not fire before the write stage it depends on:
  `TO PARQUET <= DROP LOCAL`, `TO REMOTE <= DROP LOCAL`, and
  `DROP LOCAL <= DROP REMOTE`. `TO PARQUET` and `TO REMOTE` are independent of
  each other
- All TTL values must be positive; `0` is rejected
- The TTL unit cannot be finer than the table's partition size. For example, a
  `MONTH`-partitioned table accepts only month- or year-based values, not
  `HOUR`, `DAY`, or `WEEK`; a `DAY`-partitioned table also accepts coarser
  units such as `DROP LOCAL 1 MONTH`
- Each setting can only appear once per statement
- The table must have a designated timestamp and partitioning enabled
- `TO REMOTE` and `DROP REMOTE` additionally require [cold storage](/docs/concepts/cold-storage/) to be enabled and a WAL-enabled table. They are rejected on non-WAL tables
- Storage policies do not apply to materialized views at all, local stages included. `SET STORAGE POLICY` on one is rejected with `storage policy is not supported for materialized views`
- If the table has a TTL set, clear it with `ALTER TABLE SET TTL 0` first;
  otherwise `SET STORAGE POLICY` is rejected with `Cannot set storage policy,
  please, remove TTL settings`. On Enterprise tables, any non-zero `SET TTL`
  value is itself rejected with `TTL is not supported on Enterprise tables; use
  a storage policy instead`
- `ENABLE` and `DISABLE` require a policy to exist on the table; both return an
  error otherwise

### Permissions

Each operation requires a specific permission:

| SQL command              | Required permission      |
| ------------------------ | ------------------------ |
| `SET STORAGE POLICY`     | `SET STORAGE POLICY`     |
| `DROP STORAGE POLICY`    | `REMOVE STORAGE POLICY`  |
| `ENABLE STORAGE POLICY`  | `ENABLE STORAGE POLICY`  |
| `DISABLE STORAGE POLICY` | `DISABLE STORAGE POLICY` |

## Examples

Set a local-only storage policy:

```questdb-sql
ALTER TABLE sensor_data SET STORAGE POLICY(
    TO PARQUET 3 DAYS,
    DROP LOCAL 1 MONTH
);
```

Tier partitions to object storage, keeping them queryable after local eviction:

```questdb-sql
ALTER TABLE trades SET STORAGE POLICY(
    TO PARQUET 7 DAYS,
    TO REMOTE 14 DAYS,
    DROP LOCAL 30 DAYS
);
```

Add a remote retention boundary, after which the partition is removed and its objects are reclaimed:

```questdb-sql
ALTER TABLE trades SET STORAGE POLICY(
    TO PARQUET 7 DAYS,
    TO REMOTE 14 DAYS,
    DROP LOCAL 30 DAYS,
    DROP REMOTE 7 YEARS
);
```

Replace the policy with a single Parquet-conversion stage (any previously set
stages are cleared):

```questdb-sql
ALTER TABLE sensor_data SET STORAGE POLICY(TO PARQUET 7d);
```

Temporarily suspend a policy:

```questdb-sql
ALTER TABLE sensor_data DISABLE STORAGE POLICY;
```

Re-enable it:

```questdb-sql
ALTER TABLE sensor_data ENABLE STORAGE POLICY;
```

Remove a policy entirely:

```questdb-sql
ALTER TABLE sensor_data DROP STORAGE POLICY;
```

Check active policies:

```questdb-sql
SELECT * FROM storage_policies;
```

The storage policy also appears in `SHOW CREATE TABLE` output:

```questdb-sql
SHOW CREATE TABLE sensor_data;
```

```text
CREATE TABLE 'sensor_data' (
    ts TIMESTAMP,
    value DOUBLE
) timestamp(ts) PARTITION BY DAY
STORAGE POLICY(TO PARQUET 3 DAYS, DROP LOCAL 1 MONTH) WAL;
```

Stages that are not set are omitted from the output.

## See also

- [Storage Policy concept](/docs/concepts/storage-policy/)
- [Cold storage](/docs/concepts/cold-storage/) — what the `TO REMOTE` and `DROP REMOTE` stages do
- [`table_cold_partitions()`](/docs/query/functions/meta/#table_cold_partitions) — per-partition remote state
- [CREATE TABLE](/docs/query/sql/create-table/) — `STORAGE POLICY` clause at
  table creation
- [ALTER TABLE SET TTL](/docs/query/sql/alter-table-set-ttl/) — the TTL
  feature storage policies supersede in Enterprise
- [`storage_policies`](/docs/query/functions/meta/#storage_policies) — system
  view listing active policies
- [`SHOW CREATE TABLE`](/docs/query/sql/show/#show-create-table) — displays
  the attached `STORAGE POLICY` clause
- [RBAC permissions](/docs/security/rbac/#permissions) — `SET`, `REMOVE`,
  `ENABLE`, and `DISABLE STORAGE POLICY` permissions
