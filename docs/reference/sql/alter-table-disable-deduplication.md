---
title: ALTER TABLE DEDUP DISABLE
sidebar_label: DEDUP DISABLE
description: DISABLE DEDUPLICATION SQL command reference documentation.
---

Disable storage level data deduplication on inserts

## Syntax

![Flow chart showing the syntax of the ALTER TABLE DISABLE DEDUP statement](/img/docs/diagrams/disableDedup.svg)

## Example

Disable deduplication on table `TICKER_PRICE`:

```sql
ALTER TABLE TICKER_PRICE DEDUP DISABLE
```

See more example at [data deduplication](/docs/concept/deduplication#example)
page
