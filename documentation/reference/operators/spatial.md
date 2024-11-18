---
title: Spatial Operators
sidebar_label: Spatial
description: Spatial operators
---

This page describes the available operators to perform spatial
calculations. For more information on this type of data, see the
[geohashes documentation](/docs/concept/geohashes/) and the
[spatial functions documentation](/docs/reference/function/spatial/) which have been added to help with filtering and generating data.

### within

`within(geohash, ...)` - evaluates if a comma-separated list of geohashes are
equal to or within another geohash:

- The `within` operator can only be used in `LATEST ON` queries and all symbol
  columns within the query **must be indexed**.

- Only **geohash literals** (`#ezzn5kxb`) are supported as opposed to geohashes
  passed as strings (`'ezzn5kxb'`).

- Filtering happens logically after `LATEST ON`.

- Apart from the `within` operator, only simple filters on the designated
  timestamp are allowed in the `WHERE` clause.

#### Arguments

- `geohash` is a geohash type in text or binary form

#### Returns

- evaluates to `true` if geohash values are a prefix or complete match based on
  the geohashes passed as arguments

#### Examples

Given a table with the following contents:

| ts                          | device_id | g1c | g8c      |
| --------------------------- | --------- | --- | -------- |
| 2021-09-02T14:20:07.721444Z | device_2  | e   | ezzn5kxb |
| 2021-09-02T14:20:08.241489Z | device_1  | u   | u33w4r2w |
| 2021-09-02T14:20:08.241489Z | device_3  | u   | u33d8b1b |

The `within` operator can be used to filter results by geohash:

```questdb-sql
SELECT * FROM pos
WHERE g8c within(#ezz, #u33d8)
LATEST ON ts PARTITON BY uuid;
```

This yields the following results:

| ts                          | device_id | g1c | g8c      |
| --------------------------- | --------- | --- | -------- |
| 2021-09-02T14:20:07.721444Z | device_2  | e   | ezzn5kxb |
| 2021-09-02T14:20:08.241489Z | device_3  | u   | u33d8b1b |

Additionally, prefix-like matching can be performed to evaluate if geohashes
exist within a larger grid:

```questdb-sql
SELECT * FROM pos
WHERE g8c within(#u33)
LATEST ON ts PARTITON BY uuid;
```

| ts                          | device_id | g1c | g8c      |
| --------------------------- | --------- | --- | -------- |
| 2021-09-02T14:20:08.241489Z | device_1  | u   | u33w4r2w |
| 2021-09-02T14:20:08.241489Z | device_3  | u   | u33d8b1b |
