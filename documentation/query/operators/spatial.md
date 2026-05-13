---
title: Spatial Operators
sidebar_label: Spatial
description: Spatial operators
---

This page describes the available operators to perform spatial
calculations. For more information on this type of data, see the
[geohashes documentation](/docs/query/datatypes/geohashes/) and the
[spatial functions documentation](/docs/query/functions/spatial/) which have been added to help with filtering and generating data.

### within

`within(geohash, ...)` - evaluates if a comma-separated list of geohashes are
equal to or within another geohash.

By default, the operator follows normal syntax rules, and `WHERE` is executed before `LATEST ON`. The filter is
compatible with parallel execution in most cases.

:::note

In QuestDB 8.3.2, the `within` implementation was upgraded, and now supports general `WHERE` filtering.

The prior implementation executed `LATEST ON` before `WHERE`, only supported geohashed constants, and all involved symbol 
columns had to be indexed. However, it is highly optimised for that specific execution and uses SIMD instructions.

To re-enable this implementation, you must set `query.within.latest.by.optimisation.enabled=true` in server.conf.

:::

#### Arguments

- `geohash` is a geohash type in text or binary form

#### Returns

- evaluates to `true` if geohash values are a prefix or complete match based on
  the geohashes passed as arguments

#### Examples

```questdb-sql title="example geohash filter" demo
(
SELECT pickup_datetime, 
       make_geohash(pickup_latitude, 
                    pickup_longitude, 
                    60) pickup_geohash
FROM trips
LIMIT 5
)
WHERE pickup_geohash WITHIN (#dr5ru);
```



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
LATEST ON ts PARTITION BY uuid;
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
LATEST ON ts PARTITION BY uuid;
```

| ts                          | device_id | g1c | g8c      |
| --------------------------- | --------- | --- | -------- |
| 2021-09-02T14:20:08.241489Z | device_1  | u   | u33w4r2w |
| 2021-09-02T14:20:08.241489Z | device_3  | u   | u33d8b1b |
