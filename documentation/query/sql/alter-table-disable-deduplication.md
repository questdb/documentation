---
title: ALTER TABLE DEDUP DISABLE
sidebar_label: DEDUP DISABLE
description: DISABLE DEDUPLICATION SQL command reference documentation.
---

Disable storage level data deduplication on inserts

## Syntax

```questdb-sql
ALTER TABLE tableName DEDUP DISABLE;
```

## Example

Disable deduplication on table `fx_trades`:

```sql
ALTER TABLE fx_trades DEDUP DISABLE;
```

See more example at [data deduplication](/docs/concepts/deduplication/#quick-example)
page
