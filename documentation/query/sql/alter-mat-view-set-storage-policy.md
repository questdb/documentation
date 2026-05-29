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
    [TO REMOTE ttl,]
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
| `TO PARQUET <ttl>` | Convert partition from native format to Parquet locally. The native files are removed and reads are served from the Parquet file |
| `TO REMOTE <ttl>` | _Reserved._ Will upload the partition to object storage when remote upload is supported |
| `DROP LOCAL <ttl>` | Remove all local copies of the partition |
| `DROP REMOTE <ttl>` | _Reserved._ Will remove the partition from object storage when remote upload is supported |

:::info

`TO REMOTE` and `DROP REMOTE` are reserved syntax. They are rejected at SQL
parse time with `'TO REMOTE' is not supported yet` and
`'DROP REMOTE' is not supported yet`. Automatic upload of Parquet files to
object storage is not currently supported — storage policies operate locally
only. Because these clauses cannot take effect, the `to_remote` and
`drop_remote` columns in the
[`storage_policies`](/docs/query/functions/meta/#storage_policies) view are
always blank in the current release.

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
- All TTL values must be positive — `0` is rejected
- Each setting can only appear once per statement
- The materialized view must have a designated timestamp and partitioning enabled
- If the materialized view has a TTL set, clear it with
  `ALTER MATERIALIZED VIEW SET TTL 0` before setting a storage policy. Any
  non-zero `SET TTL` value is rejected in Enterprise with
  `TTL settings are deprecated, please, create a storage policy instead`
- `ENABLE` and `DISABLE` require a policy to exist on the view; both return an
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

Set a storage policy with multiple stages:

```questdb-sql
ALTER MATERIALIZED VIEW trades_hourly SET STORAGE POLICY(
    TO PARQUET 7 DAYS,
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
- [`storage_policies`](/docs/query/functions/meta/#storage_policies) — system
  view listing active policies
- [RBAC permissions](/docs/security/rbac/#permissions) — `SET`, `REMOVE`,
  `ENABLE`, and `DISABLE STORAGE POLICY` permissions
