---
title: Optimize Disk and Memory Usage with Many Tables
sidebar_label: Optimize for many tables
description: Reduce memory and disk usage when running QuestDB with many tables by adjusting memory allocation and disk chunk sizes
---

When operating QuestDB with many tables, the default settings may consume more memory and disk space than necessary. This playbook shows how to optimize these resources.

## Problem

QuestDB allocates memory for out-of-order inserts per column and table. With the default setting of `cairo.o3.column.memory.size=256K`, each table and column uses 512K of memory (2x the configured size). When you have many tables, this memory overhead can become significant.

Similarly, QuestDB allocates disk space in chunks for columns and indexes. While larger chunks make sense for a single large table, multiple smaller tables benefit from smaller allocation sizes, which can noticeably decrease disk storage usage.

## Solution

Reduce memory allocation for out-of-order inserts by setting a smaller `cairo.o3.column.memory.size`. Start with 128K and adjust based on your needs:

```
cairo.o3.column.memory.size=128K
```

Reduce disk space allocation by configuring smaller page sizes for data and indexes:

```
cairo.system.writer.data.append.page.size=128K
cairo.writer.data.append.page.size=128K
cairo.writer.data.index.key.append.page.size=128K
cairo.writer.data.index.value.append.page.size=128K
```

These settings should be added to your `server.conf` file or set as environment variables.

:::info Related Documentation
- [Configuration reference](/docs/configuration/)
- [Capacity planning](/docs/operations/capacity-planning/)
:::
