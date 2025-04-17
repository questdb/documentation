---
title: Touch function
sidebar_label: Touch
description: Touch functions reference documentation.
---

The `touch()` function loads a table from disk to memory. Useful for triggering
a "hot" start from conditions where data may be "cold", such as after a restart
or any condition which caused disk cache to flush. A "hot" start provides the
usual fast and expected query performance, as no caching or movement from disk
to memory is required prior to an initial query.

### Arguments:

Wraps a SQL statement.

### Return value

Returns an `object` representing index state.

```json
{
  "data_pages": number,
  "index_key_pages": number,
  "index_values_pages": number
}
```

### General example

Consider a table with an indexed symbol column:

```sql
CREATE TABLE x AS (
  SELECT
    rnd_geohash(40) g,
    rnd_double(0)* 100 a,
    rnd_symbol(5, 4, 4, 1) b,
    timestamp_sequence(0, 100000000000) k
  FROM
    long_sequence(20)
),
index(b) timestamp(k) PARTITION BY DAY;
```

Run `touch()` to "warm up" the table:

```sql
SELECT touch(SELECT * FROM x WHERE k IN '1970-01-22');
```

On success, an object is returned with the state of the index.

```json
{
  "data_pages": 4,
  "index_key_pages": 1,
  "index_values_pages": 1
}
```

### Practical example

Many people use scripts to restart QuestDB.

Use `touch()` after startup via the REST API:

```shell
curl -G \
  --data-urlencode "SELECT touch(SELECT * FROM x WHERE k IN '1970-01-22');" \
  http://localhost:9000/exec
```

All subsequent queries will be within performance expectations, without
additional latency added for "warming up" the data. Touch simulates a query
without transferring data over the network, apart from the object as
confirmation.
