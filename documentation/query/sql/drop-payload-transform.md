---
title: DROP PAYLOAD TRANSFORM
sidebar_label: DROP PAYLOAD TRANSFORM
description:
  Documentation for the DROP PAYLOAD TRANSFORM SQL keyword in QuestDB.
---

Permanently deletes a payload transform definition. The target table and any DLQ
table are not affected.

## Syntax

```
DROP PAYLOAD TRANSFORM [ IF EXISTS ] transformName
```

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `transformName` | Name of the payload transform to drop |
| `IF EXISTS` | Suppress error if the transform does not exist |

## Examples

```questdb-sql title="Drop a payload transform"
DROP PAYLOAD TRANSFORM binance_depth;
```

```questdb-sql title="Drop only if exists (no error if missing)"
DROP PAYLOAD TRANSFORM IF EXISTS binance_depth;
```

## Behavior

| Aspect | Description |
| ------ | ----------- |
| Target table | Not affected - existing data remains |
| DLQ table | Not affected - existing error rows remain |
| Active requests | In-flight `/ingest` requests may still complete |

## Permissions

:::note Enterprise

In [QuestDB Enterprise](/enterprise/) deployments with
[RBAC](/docs/security/rbac/) enabled, the user must hold the
`DROP PAYLOAD TRANSFORM` grant.

```questdb-sql
GRANT DROP PAYLOAD TRANSFORM TO ingest_admin;
```

:::

:::info Related documentation
- [CREATE PAYLOAD TRANSFORM](/docs/query/sql/create-payload-transform/)
- [Payload transforms overview](/docs/ingestion/payload-transforms/)
:::
