---
title: UPDATE keyword
sidebar_label: UPDATE
description: UPDATE SQL keyword reference documentation.
---

Updates data in a database table.

## Syntax

![Flow chart showing the syntax of the UPDATE keyword](/images/docs/diagrams/update.svg)

:::note

- the same `columnName` cannot be specified multiple times after the SET keyword
  as it would be ambiguous
- the designated timestamp column cannot be updated as it would lead to altering
  history of the [time-series data](/blog/what-is-time-series-data/)
- If the target partition is
  [attached by a symbolic link](/docs/reference/sql/alter-table-attach-partition/#symbolic-links),
  the partition is read-only. `UPDATE` operation on a read-only partition will
  fail and generate an error.

:::

## Examples

```questdb-sql title="Update with constant"
UPDATE trades SET price = 125.34 WHERE symbol = 'AAPL';
```

```questdb-sql title="Update with function"
UPDATE book SET mid = (bid + ask)/2 WHERE symbol = 'AAPL';
```

```questdb-sql title="Update with subquery"
UPDATE spreads s SET s.spread = p.ask - p.bid FROM prices p WHERE s.symbol = p.symbol;
```

```questdb-sql title="Update with multiple joins"
WITH up AS (
    SELECT p.ask - p.bid AS spread, s.timestamp
    FROM prices p
    JOIN instruments i ON p.symbol = i.symbol
    WHERE i.type = 'BOND'
)
UPDATE spreads s
SET s.spread = up.spread
FROM up
WHERE s.timestamp = up.timestamp;
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
