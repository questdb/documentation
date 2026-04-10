---
title: ALTER MATERIALIZED VIEW SET STORAGE POLICY
sidebar_label: SET STORAGE POLICY
description:
  ALTER MATERIALIZED VIEW SET STORAGE POLICY SQL keyword reference documentation.
---

Sets, modifies, enables, disables, or removes a storage policy on a materialized
view.

:::note

Storage policies are available in **QuestDB Enterprise** only.

:::

Refer to the [Storage Policy](/docs/concepts/storage-policy/) concept guide for
a full overview.

## Syntax

### Set or modify a storage policy

```questdb-sql
ALTER MATERIALIZED VIEW view_name SET STORAGE POLICY(
    [TO PARQUET ttl,]
    [DROP NATIVE ttl,]
    [DROP LOCAL ttl,]
    [DROP REMOTE ttl]
);
```

Only the specified settings are changed. Omitted settings retain their current
values.

### Enable or disable a storage policy

```questdb-sql
ALTER MATERIALIZED VIEW view_name ENABLE STORAGE POLICY;
ALTER MATERIALIZED VIEW view_name DISABLE STORAGE POLICY;
```

Disabling a policy suspends processing without removing the policy definition.

### Remove a storage policy

```questdb-sql
ALTER MATERIALIZED VIEW view_name DROP STORAGE POLICY;
```

This permanently removes the storage policy from the materialized view.

## Description

A storage policy defines up to four TTL-based stages that control how partitions
transition from native format to Parquet and eventually get removed:

| Setting | Effect |
|---------|--------|
| `TO PARQUET <ttl>` | Convert partition from native format to Parquet locally |
| `DROP NATIVE <ttl>` | Remove native binary files, keeping only the local Parquet copy |
| `DROP LOCAL <ttl>` | Remove all local copies of the partition |
| `DROP REMOTE <ttl>` | Remove the partition from object storage _(not yet supported)_ |

:::info

`DROP REMOTE` is accepted in the syntax but is not yet operational. Automatic
upload of Parquet files to object storage is not currently supported. Storage
policies operate locally only.

:::

### TTL format

Follow each setting with a duration value using one of these formats:

- Long form: `3 DAYS`, `1 MONTH`, `2 YEARS`
- Short form: `3d`, `1M`, `2Y`

Supported units: `HOUR`/`h`, `DAY`/`d`, `WEEK`/`W`, `MONTH`/`M`, `YEAR`/`Y`.
Both singular and plural forms are accepted.

### Constraints

- TTL values must be in ascending order:
  `TO PARQUET <= DROP NATIVE <= DROP LOCAL <= DROP REMOTE`
- Each setting can only appear once per statement
- The materialized view must have a designated timestamp and partitioning enabled
- If the materialized view has a TTL set, remove it with
  `ALTER MATERIALIZED VIEW DROP TTL` before setting a storage policy

### Permissions

Each operation requires a specific permission:

| SQL command | Required permission |
|-------------|-------------------|
| `SET STORAGE POLICY` | `SET STORAGE POLICY` |
| `DROP STORAGE POLICY` | `REMOVE STORAGE POLICY` |
| `ENABLE STORAGE POLICY` | `ENABLE STORAGE POLICY` |
| `DISABLE STORAGE POLICY` | `DISABLE STORAGE POLICY` |

## Examples

Set a storage policy with multiple stages:

```questdb-sql
ALTER MATERIALIZED VIEW trades_hourly SET STORAGE POLICY(
    TO PARQUET 7 DAYS,
    DROP NATIVE 14 DAYS,
    DROP LOCAL 1 MONTH
);
```

Update only the Parquet conversion threshold:

```questdb-sql
ALTER MATERIALIZED VIEW trades_hourly SET STORAGE POLICY(TO PARQUET 14d);
```

Temporarily suspend a policy:

```questdb-sql
ALTER MATERIALIZED VIEW trades_hourly DISABLE STORAGE POLICY;
```

Re-enable it:

```questdb-sql
ALTER MATERIALIZED VIEW trades_hourly ENABLE STORAGE POLICY;
```

Remove a policy entirely:

```questdb-sql
ALTER MATERIALIZED VIEW trades_hourly DROP STORAGE POLICY;
```

Check active policies:

```questdb-sql
SELECT * FROM storage_policies;
```

## See also

- [Storage Policy concept](/docs/concepts/storage-policy/)
- [ALTER TABLE SET STORAGE POLICY](/docs/query/sql/alter-table-set-storage-policy/)
- [CREATE MATERIALIZED VIEW](/docs/query/sql/create-mat-view/)
- [ALTER MATERIALIZED VIEW SET TTL](/docs/query/sql/alter-mat-view-set-ttl/)
