---
title: WITH keyword
sidebar_label: WITH
description: WITH SQL keyword reference documentation.
---

Supports Common Table Expressions (CTEs), e.i., naming one or several
sub-queries to be used with a [`SELECT`](/docs/reference/sql/select/),
[`INSERT`](/docs/reference/sql/insert/), or
[`UPDATE`](/docs/reference/sql/update/) query.

Using a CTE makes it easy to simplify large or complex statements which involve
sub-queries, particularly when such sub-queries are used several times.

## Syntax

![Flow chart showing the syntax of the WITH clause](/img/docs/diagrams/with.svg)

Where:

- `alias` is the name given to the sub-query for ease of reusing
- `subQuery` is a SQL query (e.g `SELECT * FROM table`)

## Examples

```questdb-sql title="Single alias"
WITH first_10_users AS (SELECT * FROM users limit 10)
SELECT user_name FROM first_10_users;
```

```questdb-sql title="Using recursively"
WITH first_10_users AS (SELECT * FROM users limit 10),
first_5_users AS (SELECT * FROM first_10_users limit 5)
SELECT user_name FROM first_5_users;
```

```questdb-sql title="Flag whether individual trips are longer or shorter than average"
WITH avg_distance AS (SELECT avg(trip_distance) average FROM trips)
SELECT pickup_datetime, trips.trip_distance > avg_distance.average longer_than_average
FROM trips CROSS JOIN avg_distance;
```

```questdb-sql title="Update with a sub-query"
WITH up AS (
    SELECT symbol, spread, ts
    FROM temp_spreads
    WHERE timestamp between '2022-01-02' and '2022-01-03'
)
UPDATE spreads s
SET spread = up.spread
FROM up
WHERE up.ts = s.ts AND s.symbol = up.symbol;
```

```questdb-sql title="Insert with a sub-query"
WITH up AS (
    SELECT symbol, spread, ts
    FROM temp_spreads
    WHERE timestamp between '2022-01-02' and '2022-01-03'
)
INSERT INTO spreads
SELECT * FROM up;
```
