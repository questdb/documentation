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

| Setting | Effect |
|---------|--------|
| `TO PARQUET <ttl>` | Convert partition from native format to Parquet locally. The native files are removed and reads are served from the Parquet file |
| `TO REMOTE <ttl>` | Accepted and stored but not yet enforced; no upload happens yet. Reserved for future object storage upload |
| `DROP LOCAL <ttl>` | Remove all local copies of the partition |
| `DROP REMOTE <ttl>` | _Not yet supported._ Rejected at parse time with `'DROP REMOTE' is not supported yet`. Reserved for future object storage removal |

:::info

Storage policies operate locally only for now. `TO REMOTE` is accepted and
stored but not yet enforced: no upload to object storage happens yet.
`DROP REMOTE` is not yet supported and is rejected at parse time with
`'DROP REMOTE' is not supported yet`. In the
[`storage_policies`](/docs/query/functions/meta/#storage_policies) view,
`drop_remote` is therefore always `0h`, and `to_remote` reads `0h` unless a
`TO REMOTE` value is set (stored, but not yet enforced).

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
- Each TTL must be an integer multiple of the partition size. For example, a
  `MONTH`-partitioned table accepts only month- or year-based values, not
  `HOUR`, `DAY`, or `WEEK`
- Each setting can only appear once per statement
- The table must have a designated timestamp and partitioning enabled
- If the table has a TTL set, clear it with `ALTER TABLE SET TTL 0` first;
  otherwise `SET STORAGE POLICY` is rejected with `Cannot set storage policy,
  please, remove TTL settings`. On Enterprise tables, any non-zero `SET TTL`
  value is itself rejected with `TTL is not supported on Enterprise tables; use
  a storage policy instead`
- `ENABLE` and `DISABLE` require a policy to exist on the table; both return an
  error otherwise

### Permissions

Each operation requires a specific permission:

| SQL command | Required permission |
|-------------|-------------------|
| `SET STORAGE POLICY` | `SET STORAGE POLICY` |
| `DROP STORAGE POLICY` | `REMOVE STORAGE POLICY` |
| `ENABLE STORAGE POLICY` | `ENABLE STORAGE POLICY` |
| `DISABLE STORAGE POLICY` | `DISABLE STORAGE POLICY` |

## Examples

Set a storage policy with both currently-supported stages:

```questdb-sql
ALTER TABLE sensor_data SET STORAGE POLICY(
    TO PARQUET 3 DAYS,
    DROP LOCAL 1 MONTH
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
