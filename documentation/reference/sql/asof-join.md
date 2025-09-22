---
title: ASOF JOIN keyword
sidebar_label: ASOF JOIN
description:
  Learn how to use the powerful time-series ASOF JOIN SQL keyword from our
  concise and clear reference documentation.
---

ASOF JOIN is a powerful SQL keyword that allows you to join two time-series
tables.

It is a variant of the [`JOIN` keyword](/docs/reference/sql/join/) and shares
many of its execution traits.

This document will demonstrate how to utilize it, and link to other relevant
JOIN context.

## JOIN overview

The JOIN operation is broken into three components:

- Select clause
- Join clause
- Where clause

This document will demonstrate the JOIN clause, while the other keywords
demonstrate their respective clauses.

Visually, a JOIN operation looks like this:

![Flow chart showing the syntax of the high-level syntax of the JOIN keyword](/images/docs/diagrams/joinOverview.svg)

- `selectClause` - see the [SELECT](/docs/reference/sql/select/) reference docs
  for more information.

- `joinClause` `ASOF JOIN` with an optional `ON` clause which allows only the
  `=` predicate and an optional `TOLERANCE` clause:

  ![Flow chart showing the syntax of the ASOF, LT, and SPLICE JOIN keyword](/images/docs/diagrams/AsofJoin.svg)

- `whereClause` - see the [WHERE](/docs/reference/sql/where/) reference docs for
  more information.

In addition, the following are items of importance:

- Columns from joined tables are combined in a single row.

- Columns with the same name originating from different tables will be
  automatically aliased into a unique column namespace of the result set.

- Though it is usually preferable to explicitly specify join conditions, QuestDB
  will analyze `WHERE` clauses for implicit join conditions and will derive
  transient join conditions where necessary.

### Execution order

Join operations are performed in order of their appearance in a SQL query.

Read more about execution order in the
[JOIN reference documentation](/docs/reference/sql/join/).

## ASOF JOIN

`ASOF JOIN` joins two time-series on their timestamp, using the following
logic: for each row in the first time-series...

1. consider all timestamps in the second time-series **earlier or equal to**
the first one
2. choose **the latest** such timestamp
3. If the optional `TOLERANCE` clause is specified, an additional condition applies:
   the chosen record from t2 must satisfy `t1.ts - t2.ts <= tolerance_value`. If no record
   from t2 meets this condition (along with `t2.ts <= t1.ts`), then the row from t1 will not have a match.

### Example

Let's use an example with two tables:

- `market_data`: Multi-level L2 FX order book snapshots per symbol
- `core_price`: Quote streamer per symbol and ECN

`market_data` data: For the purposes of these examples, we will focus only on the best bid price.

```questdb-sql title="Best Bid Price per Symbol from Market Data" demo
SELECT timestamp, symbol, bids[1,1] as best_bid_price
FROM
 market_data limit 20;
 ```

<div className="blue-table">
| timestamp                   | symbol | best_bid_price |
| --------------------------- | ------ | -------------- |
| 2025-09-16T14:00:00.006068Z | USDJPY | 145.67         |
| 2025-09-16T14:00:00.008934Z | GBPUSD | 1.3719         |
| 2025-09-16T14:00:00.014362Z | GBPUSD | 1.3719         |
| 2025-09-16T14:00:00.016543Z | USDJPY | 145.67         |
| 2025-09-16T14:00:00.017379Z | EURUSD | 1.1869         |
| 2025-09-16T14:00:00.020635Z | USDJPY | 145.67         |
| 2025-09-16T14:00:00.021059Z | EURUSD | 1.1869         |
| 2025-09-16T14:00:00.032753Z | GBPUSD | 1.3719         |
| 2025-09-16T14:00:00.035691Z | EURUSD | 1.1869         |
| 2025-09-16T14:00:00.038910Z | EURUSD | 1.1869         |
| 2025-09-16T14:00:00.041939Z | USDJPY | 145.67         |
| 2025-09-16T14:00:00.042338Z | GBPUSD | 1.3719         |
| 2025-09-16T14:00:00.053509Z | GBPUSD | 1.3719         |
| 2025-09-16T14:00:00.060495Z | EURUSD | 1.1869         |
| 2025-09-16T14:00:00.065560Z | GBPUSD | 1.3719         |
| 2025-09-16T14:00:00.068744Z | USDJPY | 145.67         |
| 2025-09-16T14:00:00.073389Z | USDJPY | 145.67         |
| 2025-09-16T14:00:00.073536Z | EURUSD | 1.1869         |
| 2025-09-16T14:00:00.077558Z | GBPUSD | 1.3719         |
| 2025-09-16T14:00:00.078433Z | GBPUSD | 1.3719         |
</div>

`core_price` data: We will focus only on the bid_price

```questdb-sql title="Bid Price per Symbol from Core Prices" demo
select timestamp, symbol, bid_price from
core_price limit 20;
```

<div className="pink-table">

| timestamp                   | symbol | bid_price |
| --------------------------- | ------ | --------- |
| 2025-09-16T14:00:00.009328Z | USDJPY | 145.39    |
| 2025-09-16T14:00:00.043761Z | USDJPY | 145.67    |
| 2025-09-16T14:00:00.056230Z | EURUSD | 1.1863    |
| 2025-09-16T14:00:00.057539Z | USDJPY | 145.57    |
| 2025-09-16T14:00:00.069197Z | GBPUSD | 1.3682    |
| 2025-09-16T14:00:00.083291Z | EURUSD | 1.1835    |
| 2025-09-16T14:00:00.098121Z | GBPUSD | 1.3691    |
| 2025-09-16T14:00:00.105339Z | EURUSD | 1.185     |
| 2025-09-16T14:00:00.111114Z | EURUSD | 1.1863    |
| 2025-09-16T14:00:00.129785Z | GBPUSD | 1.3709    |
| 2025-09-16T14:00:00.145194Z | GBPUSD | 1.3689    |
| 2025-09-16T14:00:00.148178Z | GBPUSD | 1.3694    |
| 2025-09-16T14:00:00.155810Z | USDJPY | 145.51    |
| 2025-09-16T14:00:00.178333Z | USDJPY | 145.48    |
| 2025-09-16T14:00:00.185806Z | GBPUSD | 1.3687    |
| 2025-09-16T14:00:00.191322Z | EURUSD | 1.185     |
| 2025-09-16T14:00:00.220899Z | GBPUSD | 1.3697    |
| 2025-09-16T14:00:00.222574Z | USDJPY | 145.65    |
| 2025-09-16T14:00:00.249440Z | EURUSD | 1.1853    |
| 2025-09-16T14:00:00.274688Z | EURUSD | 1.184     |

</div>

We want to join each market data snapshot to the relevant core price. All
we have to write is

```questdb-sql title="A basic ASOF JOIN example" demo
SELECT
  m.timestamp, m.symbol, bids[1,1] AS best_bid_price,
  p.timestamp, p.symbol, p.bid_price
FROM
  market_data m ASOF JOIN core_price p
LIMIT 20;
```

and we get this result:

<div className="table-alternate">

| timestamp                   | symbol | best_bid_price | timestamp_2                 | symbol_2 | bid_price |
| --------------------------- | ------ | -------------- | --------------------------- | -------- | --------- |
| 2025-09-16T14:00:00.006068Z | USDJPY | 145.67         | 2025-09-16T14:00:00.004409Z | CADJPY   | 106.49    |
| 2025-09-16T14:00:00.008934Z | GBPUSD | 1.3719         | 2025-09-16T14:00:00.008094Z | NZDUSD   | 0.5926    |
| 2025-09-16T14:00:00.014362Z | GBPUSD | 1.3719         | 2025-09-16T14:00:00.013547Z | CADJPY   | 106.41    |
| 2025-09-16T14:00:00.016543Z | USDJPY | 145.67         | 2025-09-16T14:00:00.015730Z | CADJPY   | 106.6     |
| 2025-09-16T14:00:00.017379Z | EURUSD | 1.1869         | 2025-09-16T14:00:00.017359Z | EURGBP   | 0.8726    |
| 2025-09-16T14:00:00.020635Z | USDJPY | 145.67         | 2025-09-16T14:00:00.017813Z | EURCHF   | 0.9363    |
| 2025-09-16T14:00:00.021059Z | EURUSD | 1.1869         | 2025-09-16T14:00:00.017813Z | EURCHF   | 0.9363    |
| 2025-09-16T14:00:00.032753Z | GBPUSD | 1.3719         | 2025-09-16T14:00:00.031278Z | USDSGD   | 1.2865    |
| 2025-09-16T14:00:00.035691Z | EURUSD | 1.1869         | 2025-09-16T14:00:00.034997Z | GBPJPY   | 200.45    |
| 2025-09-16T14:00:00.038910Z | EURUSD | 1.1869         | 2025-09-16T14:00:00.037147Z | EURNZD   | 1.9588    |
| 2025-09-16T14:00:00.041939Z | USDJPY | 145.67         | 2025-09-16T14:00:00.039227Z | USDTRY   | 41.133    |
| 2025-09-16T14:00:00.042338Z | GBPUSD | 1.3719         | 2025-09-16T14:00:00.042233Z | EURGBP   | 0.8726    |
| 2025-09-16T14:00:00.053509Z | GBPUSD | 1.3719         | 2025-09-16T14:00:00.052584Z | USDSEK   | 9.221     |
| 2025-09-16T14:00:00.060495Z | EURUSD | 1.1869         | 2025-09-16T14:00:00.059674Z | NZDCAD   | 0.8171    |
| 2025-09-16T14:00:00.065560Z | GBPUSD | 1.3719         | 2025-09-16T14:00:00.061656Z | EURGBP   | 0.8733    |
| 2025-09-16T14:00:00.068744Z | USDJPY | 145.67         | 2025-09-16T14:00:00.068729Z | GBPCHF   | 1.0722    |
| 2025-09-16T14:00:00.073389Z | USDJPY | 145.67         | 2025-09-16T14:00:00.072195Z | EURGBP   | 0.8737    |
| 2025-09-16T14:00:00.073536Z | EURUSD | 1.1869         | 2025-09-16T14:00:00.072195Z | EURGBP   | 0.8737    |
| 2025-09-16T14:00:00.077558Z | GBPUSD | 1.3719         | 2025-09-16T14:00:00.077447Z | NZDUSD   | 0.5936    |
| 2025-09-16T14:00:00.078433Z | GBPUSD | 1.3719         | 2025-09-16T14:00:00.077447Z | NZDUSD   | 0.5936    |

</div>

Note the result doesn't really make sense, as we are joining each row in `market_data` with the row in `core_price` with
exact or immediately before timestamp, regardless of the symbol. If our join does not depend only on timestamp, but also
on matching columns, we need to add extra keywords.

### Using `ON` for matching column value

By using the `ON` clause, you can point out the key (`symbol` in our example)
column and get results separate for each key.

Here's the ASOF JOIN query with the `ON` clause added:

```questdb-sql title="ASOF JOIN with symbol matching" demo
SELECT
  m.timestamp, m.symbol, bids[1,1] AS best_bid_price,
  p.timestamp, p.symbol, p.bid_price
FROM
  market_data m ASOF JOIN core_price p
ON (symbol)
LIMIT 20;
```

Result:

<div className="table-alternate">

| timestamp                   | symbol | best_bid_price | timestamp_2                 | symbol_2 | bid_price |
| --------------------------- | ------ | -------------- | --------------------------- | -------- | --------- |
| 2025-09-16T14:00:00.006068Z | USDJPY | 145.67         | null                        | null     | null      |
| 2025-09-16T14:00:00.008934Z | GBPUSD | 1.3719         | null                        | null     | null      |
| 2025-09-16T14:00:00.014362Z | GBPUSD | 1.3719         | null                        | null     | null      |
| 2025-09-16T14:00:00.016543Z | USDJPY | 145.67         | 2025-09-16T14:00:00.009328Z | USDJPY   | 145.39    |
| 2025-09-16T14:00:00.017379Z | EURUSD | 1.1869         | null                        | null     | null      |
| 2025-09-16T14:00:00.020635Z | USDJPY | 145.67         | 2025-09-16T14:00:00.009328Z | USDJPY   | 145.39    |
| 2025-09-16T14:00:00.021059Z | EURUSD | 1.1869         | null                        | null     | null      |
| 2025-09-16T14:00:00.032753Z | GBPUSD | 1.3719         | null                        | null     | null      |
| 2025-09-16T14:00:00.035691Z | EURUSD | 1.1869         | null                        | null     | null      |
| 2025-09-16T14:00:00.038910Z | EURUSD | 1.1869         | null                        | null     | null      |
| 2025-09-16T14:00:00.041939Z | USDJPY | 145.67         | 2025-09-16T14:00:00.009328Z | USDJPY   | 145.39    |
| 2025-09-16T14:00:00.042338Z | GBPUSD | 1.3719         | null                        | null     | null      |
| 2025-09-16T14:00:00.053509Z | GBPUSD | 1.3719         | null                        | null     | null      |
| 2025-09-16T14:00:00.060495Z | EURUSD | 1.1869         | 2025-09-16T14:00:00.056230Z | EURUSD   | 1.1863    |
| 2025-09-16T14:00:00.065560Z | GBPUSD | 1.3719         | null                        | null     | null      |
| 2025-09-16T14:00:00.068744Z | USDJPY | 145.67         | 2025-09-16T14:00:00.057539Z | USDJPY   | 145.57    |
| 2025-09-16T14:00:00.073389Z | USDJPY | 145.67         | 2025-09-16T14:00:00.057539Z | USDJPY   | 145.57    |
| 2025-09-16T14:00:00.073536Z | EURUSD | 1.1869         | 2025-09-16T14:00:00.056230Z | EURUSD   | 1.1863    |
| 2025-09-16T14:00:00.077558Z | GBPUSD | 1.3719         | 2025-09-16T14:00:00.069197Z | GBPUSD   | 1.3682    |
| 2025-09-16T14:00:00.078433Z | GBPUSD | 1.3719         | 2025-09-16T14:00:00.069197Z | GBPUSD   | 1.3682    |

</div>

Note how the first few rows for each symbol don't match anything on the `core_price` table, as there are no rows
with timestamps equal or earlier than the timestamp on the `market_data` table for those first rows.

### How ASOF JOIN uses timestamps

`ASOF JOIN` requires tables or subqueries to be ordered by time. The best way to meet this requirement is to use a
[designated timestamp](/docs/concept/designated-timestamp/), which is set when you create a table.
This not only enforces the chronological order of your data but also tells QuestDB which column to use for time-series
operations automatically.

#### Default behavior

By default, an `ASOF JOIN` will always use the designated timestamp of the tables involved.

This behavior is so fundamental that it extends to subqueries in a unique way: even if you do not explicitly SELECT the
designated timestamp column in a subquery, QuestDB implicitly propagates it. The join is performed correctly under the
hood using this hidden timestamp, which is then omitted from the final result set.

This makes most `ASOF JOIN` queries simple and intuitive.

```questdb-sql title="ASOF JOIN with designated timestamp" demo
-- The 'market_data' table has 'timestamp' as its designated timestamp.
-- Even though 'timestamp' is not selected in the subquery,
-- it is used implicitly for the ASOF JOIN.
WITH market_subset AS (
  SELECT symbol,bids
  FROM market_data
)
SELECT *
FROM market_subset ASOF JOIN core_price ON (symbol);
```

In more complicated subqueries, the implicit propagation of the designated timestamp may not work QuestDB responds with an error
`left side of time series join has no timestamp`. In such cases, your subquery should explicitly include the designated
timestamp column in the `SELECT` clause to ensure it is used for the join.

#### The standard override method: Using ORDER BY

The easiest and safest way to join on a different timestamp column is to use an `ORDER BY ... ASC` clause in your subquery.

When you sort a subquery by a `TIMESTAMP` column, QuestDB makes that column the new designated timestamp for the subquery's results. The subsequent `ASOF JOIN` will automatically detect and use this new timestamp.

Example: Joining on `ingestion_time` instead of the default `trade_ts`

```questdb-sql title="ASOF JOIN with custom timestamp"
WITH trades_ordered_by_ingestion AS (
  SELECT symbol, price, ingestion_time
  FROM trades
  -- This ORDER BY clause tells QuestDB to use 'ingestion_time'
  -- as the new designated timestamp for this subquery.
  ORDER BY ingestion_time ASC
)
-- No extra syntax is needed here. The ASOF JOIN automatically uses
-- the new designated timestamp from the subquery.
SELECT *
FROM trades_ordered_by_ingestion
ASOF JOIN quotes ON (symbol);
```

#### Using the timestamp() syntax

The `timestamp()` syntax is an expert-level hint for the query engine. It should only be used to manually assign a
timestamp to a dataset that does not have one, without forcing a sort.

You should only use this when you can guarantee that your data is already sorted by that timestamp column. Using
`timestamp()` incorrectly on unsorted data will lead to incorrect join results.

The primary use case is performance optimization on a table that has no designated timestamp in its schema, but where
you know the data is physically stored in chronological order. Using the `timestamp()` hint avoids a costly ORDER BY
operation. This can be the case, for example, with external Parquet files where you know data is already sorted by
timestamp.

```questdb-sql title="ASOF JOIN with timestamp()" demo
-- Use this ONLY IF the left-side table has NO designated timestamp,
-- but you can guarantee its data is already physically ordered by the
-- column you declare.

SELECT *
FROM (
      (SELECT * from read_parquet('trades.parquet') )
      timestamp(timestamp)
      )
ASOF JOIN trades ON (symbol);
```

To summarize:

1. By default, the table's designated timestamp is used.
2. To join on a different column, the standard method is to `ORDER BY` that column in a subquery.
3. Use the `timestamp()` syntax as an expert-level hint to avoid a sort on a table with no designated timestamp, if and
   only if you are certain the data is already sorted.

### TOLERANCE clause

The `TOLERANCE` clause enhances ASOF and LT JOINs by limiting how far back in time the join should look for a match in the right
table. The `TOLERANCE` parameter accepts a time interval value (e.g., `2s`, `100ms`, `1d`).

When specified, a record from the left table t1 at t1.ts will only be joined with a record from the right table t2 at
t2.ts if both conditions are met: `t2.ts <= t1.ts` and `t1.ts - t2.ts <= tolerance_value`

This ensures that the matched record from the right table is not only the latest one on or before t1.ts, but also within
the specified time window.

TOLERANCE works both with or without the ON clause:

```questdb-sql title="ASOF JOIN with keys and 50 milliseconds of TOLERANCE" demo
SELECT market_data.timestamp, market_data.symbol, bids, core_price.*
FROM market_data
ASOF JOIN core_price ON (symbol) TOLERANCE 50T
WHERE market_data.timestamp IN today();
```

The interval_literal must be a valid QuestDB interval string, like '5s' (5 seconds), '100T' (100 milliseconds), '2m'
(2 minutes), '3h' (3 hours), or '1d' (1 day).


#### Supported Units for interval_literal
The `TOLERANCE` interval literal supports the following time unit qualifiers:
- U: Microseconds
- T: Milliseconds
- s: Seconds
- m: Minutes
- h: Hours
- d: Days
- w: Weeks

For example, '100U' is 100 microseconds, '50T' is 50 milliseconds, '2s' is 2 seconds, '30m' is 30 minutes,
'1h' is 1 hour, '7d' is 7 days, and '2w' is 2 weeks. Please note that months (M) and years (Y) are not supported as
units for the `TOLERANCE` clause.

#### Performance impact of TOLERANCE

Specifying `TOLERANCE` can also improve performance. `ASOF JOIN` execution plans often scan backward in time on the right
table to find a matching entry for each left-table row. `TOLERANCE` allows these scans to terminate early - once a
right-table record is older than the left-table record by more than the specified tolerance - thus avoiding unnecessary
processing of more distant records.

## SPLICE JOIN

Want to join all records from both tables?

`SPLICE JOIN` is a full `ASOF JOIN`.

Read the [JOIN reference](/docs/reference/sql/join/#splice-join) for more
information on SPLICE JOIN.
