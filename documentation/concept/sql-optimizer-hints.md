---
title: SQL optimizer hints
description:
  SQL Hints allow expert users to guide the query optimizer in QuestDB when default optimization strategies are not optimal.
  This document describes available hints and when to use them.
---

QuestDB's query optimizer automatically selects execution plans for SQL queries based on heuristics. While the default
execution strategy should be the fastest for most scenarios, you can use hints to select a specific strategy that may
better suit your data's characteristics. SQL hints influence the execution strategy of queries without changing their
semantics.

## Hint Syntax

In QuestDB, SQL hints are specified as SQL block comments with a plus sign after the opening comment marker. Hints must
be placed immediately after the `SELECT` keyword:

```questdb-sql title="SQL hint syntax"
SELECT /*+ HINT_NAME(parameter1 parameter2) */ columns FROM table;
```

Hints are designed to be a safe optimization mechanism:

- The database uses default optimization strategies when no hints are provided.
- Syntax errors inside a hint block won't fail the entire SQL query.
- The database safely ignores unknown hints.
- Only block comment hints (`/*+ HINT */`) are supported, not line comment hints (`--+ HINT`).

-----

## Time-series JOIN hints

Since QuestDB 9.0.0, QuestDB's optimizer defaults to using a binary search-based strategy for **`ASOF JOIN`** and
**`LT JOIN`** (Less Than Join) queries that have a filter on the right-hand side (the joined or lookup table). This
approach is generally faster as it avoids a full table scan.

However, for some specific data distributions and filter conditions, the previous strategy of performing a parallel full
table scan can be more performant. For these cases, QuestDB provides hints to modify the default search strategy.

The `asof`-prefixed hints will also apply to `lt` joins.

### `asof_linear_search(l r)`

This hint instructs the optimizer to revert to the pre-9.0 execution strategy for `ASOF JOIN` and `LT JOIN` queries,
respectively. This older strategy involves performing a full parallel scan on the joined table to apply filters *before*
executing the join.

```questdb-sql title="Using linear search for an ASOF join"
SELECT /*+ asof_linear_search(orders md) */
  orders.ts, orders.price, md.md_ts, md.bid, md.ask
FROM orders
ASOF JOIN (
  SELECT ts as md_ts, bid, ask FROM market_data
  WHERE state = 'INVALID' -- Highly selective filter
) md;
```

#### How it works

The **default strategy (binary search)** works as follows:

1. For each record in the main table, it uses a binary search to quickly locate a record with a matching timestamp in
   the joined table.
2. Starting from this located timestamp, it then iterates backward through rows in the joined table, in a single thread,
   evaluating the filter condition until a match is found.

<Screenshot
alt="Diagram showing execution of the asof_linear_search hint"
height={447}
src="images/docs/concepts/asof-join-binary-search-strategy.svg"
width={745}
/>

The hinted strategy forces this plan:

1. Apply the filter to the *entire* joined table in parallel.
2. Join the filtered (and now much smaller) result set to the main table.

#### When to use it

You should only need this hint in a specific scenario: when the filter on your joined table is **highly selective**.

A filter is considered highly selective if it eliminates a very large percentage of rows (e.g., more than 95%). In this
situation, the hinted strategy can be faster because:

- The parallel pre-filtering step rapidly reduces the joined table to a very small size.
- The subsequent join operation is then very fast.

Conversely, the default binary search can be slower with highly selective filters because its single-threaded backward
scan may have to check many rows before finding one that satisfies the filter condition.

For most other cases, especially with filters that have low selectivity or when the joined table data is not in
memory ("cold"), the default binary search is significantly faster as it minimizes I/O operations.

### `asof_index_search(l r)`

This hint instructs the optimizer to use a symbol's index to skip over any time partitions where the symbol does not appear. 

In partitions where the symbol does appear, there will still be some scanning to locate the matching rows.

```questdb-sql title="Using index search for an ASOF join"
SELECT /*+ asof_index_search(orders md) */
    orders.timestamp, orders.symbol, orders.price
FROM orders
ASOF JOIN (md) ON (symbol);
```

#### When to use it

This hint can be effective when your symbol is rare, meaning the index is highly selective, rarely appearing in any of
your partitions. 

If the symbol appears frequently, then this hint may cause a slower execution plan than the default.


### `asof_memoized_search(l r)`

This hint instructs the optimizer to memoize (remember) rows it has previously seen, and use this information to avoid 
repeated re-scanning of data.

Imagine a linear scan. For each symbol, we must scan forward to find the next available row. This symbol could be far away.
When the matching row is located, we store it, pick the next symbol, and repeat this scan. This causes repeated re-reading of data.

Instead, the query engine will check each row for a matching symbol, recording the locations. Then when the symbol is next
processed, the memoized rows are checked (look-ahead) and the cursor skips forward.

```questdb-sql title="Using memoized search for an ASOF join"
SELECT /*+ asof_memoized_search(orders md) */
    orders.timestamp, orders.symbol, orders.price
FROM orders
ASOF JOIN (md) ON (symbol);
```

#### When to use it

If your table has a very skewed symbol distribution, this hint can dramatically speed up the query. A typical skew
would be a few symbols with very large row counts, and many symbols with very small row counts. This hint works well
for Zipfian-distributed data.

-----

### Execution Plan Observation

You can verify how QuestDB executes your query by examining its execution plan with the `EXPLAIN` statement.

#### Default Execution Plan (Binary Search)

Without any hints, a filtered `ASOF JOIN` will use the binary search strategy.

```questdb-sql title="Observing the default execution plan" demo
EXPLAIN SELECT  *
FROM core_price
ASOF JOIN market_data
ON symbol
WHERE bids[1,1]=107.03 -- Highly selective filter
;
```

The execution plan will show a `Filtered AsOf Join Fast Scan` operator, confirming the binary search strategy is being
used.

```text
SelectedRecord
    Filter filter: market_data.bids[1,1]=107.03
        AsOf Join Fast Scan
          condition: market_data.symbol=core_price.symbol
            PageFrame
                Row forward scan
                Frame forward scan on: core_price
            PageFrame
                Row forward scan
                Frame forward scan on: market_data
```


#### Hinted Execution Plan (Full Scan)

When you use the `asof_linear_search` hint, the plan changes.

```questdb-sql title="Observing execution plan with the AVOID hint" demo
EXPLAIN SELECT /*+ asof_linear_search(core_price market_data) */
  *
FROM core_price
ASOF JOIN market_data
ON symbol
WHERE bids[1,1]=107.03 -- Highly selective filter
;
```

The execution plan will now show a standard `AsOf Join` operator and a separate, preceding filtering step on the joined
table.

```text
SelectedRecord
    Filter filter: market_data.bids[1,1]=107.03
        AsOf Join Light
          condition: market_data.symbol=core_price.symbol
            PageFrame
                Row forward scan
                Frame forward scan on: core_price
            PageFrame
                Row forward scan
                Frame forward scan on: market_data
```

## Deprecated hints

- `avoid_asof_binary_search`
  - superceded by `asof_linear_search`
- `avoid_lt_binary_search`
  - superceded by `asof_linear_search`