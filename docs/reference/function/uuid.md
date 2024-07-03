---
title: UUID functions
sidebar_label: UUID
description: UUID functions reference documentation.
---

This page describes the available functions related to UUID data type.

## to_uuid

`to_uuid(value, value)` combines two 64-bit `long` into a single 128-bit `uuid`.

### Arguments

- `value` is any `long`

### Return value

Return value type is `uuid`.

### Examples

```questdb-sql
SELECT to_uuid(2, 1)
AS uuid FROM long_sequence(1);
```

Returns:

```
00000000-0000-0001-0000-000000000002
```
