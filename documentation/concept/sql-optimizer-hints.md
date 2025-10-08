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

## Binary Search Optimizations and Hints

Since QuestDB 9.0.0, QuestDB's optimizer defaults to using a binary search-based strategy for **`ASOF JOIN`** and
**`LT JOIN`** (Less Than Join) queries that have a filter on the right-hand side (the joined or lookup table). This
approach is generally faster as it avoids a full table scan.

However, for some specific data distributions and filter conditions, the previous strategy of performing a parallel full
table scan can be more performant. For these cases, QuestDB provides hints to *avoid* the default binary search.

### AVOID\_ASOF\_BINARY\_SEARCH and AVOID\_LT\_BINARY\_SEARCH

These hints instruct the optimizer to revert to the pre-9.0 execution strategy for `ASOF JOIN` and `LT JOIN` queries,
respectively. This older strategy involves performing a full parallel scan on the joined table to apply filters *before*
executing the join.

- `AVOID_ASOF_BINARY_SEARCH(left_table_alias right_table_alias)`: Use for **`ASOF JOIN`** queries.
- `AVOID_LT_BINARY_SEARCH(table_alias)`: Use for **`LT JOIN`** queries.

<!-- end list -->

```questdb-sql title="Avoiding binary search for an ASOF join"
SELECT /*+ AVOID_ASOF_BINARY_SEARCH(orders md) */
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
alt="Diagram showing execution of the USE_ASOF_BINARY_SEARCH hint"
height={447}
src="images/docs/concepts/asof-join-binary-search-strategy.svg"
width={745}
/>

The **hinted strategy (`AVOID_..._BINARY_SEARCH`)** forces this plan:

1. Apply the filter to the *entire* joined table in parallel.
2. Join the filtered (and now much smaller) result set to the main table.

#### When to use the AVOID hints

You should only need these hints in a specific scenario: when the filter on your joined table is **highly selective**.

A filter is considered highly selective if it eliminates a very large percentage of rows (e.g., more than 95%). In this
situation, the hinted strategy can be faster because:

- The parallel pre-filtering step rapidly reduces the joined table to a very small size.
- The subsequent join operation is then very fast.

Conversely, the default binary search can be slower with highly selective filters because its single-threaded backward
scan may have to check many rows before finding one that satisfies the filter condition.

For most other cases, especially with filters that have low selectivity or when the joined table data is not in
memory ("cold"), the default binary search is significantly faster as it minimizes I/O operations.

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

When you use the `AVOID_ASOF_BINARY_SEARCH` hint, the plan changes.

```questdb-sql title="Observing execution plan with the AVOID hint" demo
EXPLAIN SELECT /*+ AVOID_ASOF_BINARY_SEARCH(core_price market_data) */
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

