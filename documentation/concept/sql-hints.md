---
title: SQL Hints
description:
  SQL Hints allow expert users to guide the query optimizer in QuestDB when default optimization strategies are not optimal.
  This document describes available hints and when to use them.
---

QuestDB's query optimizer automatically selects execution plans for SQL queries based on heuristics. However, in some
scenarios, the optimizer may not have all the information needed to choose the most efficient plan. SQL Hints provide
a mechanism for expert users to influence the execution strategy without changing the semantic meaning of their queries.

## Hint Syntax

In QuestDB, SQL hints are specified as SQL block comments with a plus sign after the opening comment marker. Hints must
be placed immediately after the SELECT keyword:

```questdb-sql title="SQL hint syntax"
SELECT /*+ HINT_NAME(parameter1 parameter2) */ columns FROM table
```

Hints are entirely optional and designed to be a safe optimization mechanism:

- The database will use default optimization strategies when no hints are provided
- Syntax errors inside a hint block won't fail the entire SQL query
- The database safely ignores unknown hints
- Only block comment hints (`/*+ HINT */`) are supported, not line comment hints (`--+ HINT`)

## Available Hints

### USE_ASOF_BINARY_SEARCH

The `USE_ASOF_BINARY_SEARCH` hint enables a specialized optimization strategy for non-keyd [ASOF joins](/reference/sql/asof-join/).
This hint takes two parameters - the table aliases involved in the join.

```questdb-sql title="Optimizing ASOF join with binary search"
SELECT /*+ USE_ASOF_BINARY_SEARCH(orders md) */ 
  orders.ts, orders.price, md.md_ts, md.bid, md.ask
FROM orders
ASOF JOIN (
  SELECT ts as md_ts, bid, ask FROM market_data
  WHERE state = 'VALID'
) md;
```

#### How it works

By default (without this hint), QuestDB processes ASOF joins by:

1. Applying filters to the joined table in parallel
2. Joining the filtered results to the main table

With the `USE_ASOF_BINARY_SEARCH` hint, QuestDB changes the execution strategy:

1. For each record in the main table, it uses binary search to locate a record with a matching timestamp in the joined
   table
2. It then iterates backward in a single thread until finding joined records that match the filter

<Screenshot
alt="Diagram showing execution of the USE_ASOF_BINARY_SEARCH hint"
height={447}
src="images/docs/concepts/asof-join-binary-search-strategy.svg"
width={745}
/>

#### When to use

This optimization is particularly beneficial when:

- The joined table is significantly larger than the main table
- The filter on the joined table has low selectivity (meaning it doesn't eliminate many rows)
- The joined table data is likely to be "cold" (not cached in memory)

When joined table data is cold, the default strategy must read all rows from disk to evaluate the filter. This becomes
especially expensive on slower I/O systems like EBS (Elastic Block Storage). The binary search approach significantly
reduces I/O operations by reading only the specific portions of data needed for each join operation.

However, when a filter is highly selective (eliminates most rows), the binary search strategy may be less efficient. In
these cases, the default strategy's parallel processing can filter the joined table more quickly, making it the better
choice despite the initial full table scan.

#### Execution Plan Observation
To observe the execution plan for a query with the `USE_ASOF_BINARY_SEARCH` hint, you can use the 
[`EXPLAIN` statement](/reference/sql/explain/):

```questdb-sql title="Observing execution plan with USE_ASOF_BINARY_SEARCH"
EXPLAIN SELECT /*+ USE_ASOF_BINARY_SEARCH(orders md) */ 
  orders.ts, orders.price, md.md_ts, md.bid, md.ask
FROM orders
ASOF JOIN (
  SELECT ts as md_ts, bid, ask FROM market_data
  WHERE state = 'VALID'
) md;
```
This will provide you with a detailed breakdown of the execution plan, including the use of the binary search strategy.
When the hint is applied, you will see the `Filtered AsOf Join Fast Scan` operator in the plan,
indicating that the binary search strategy is being used.

<Screenshot
alt="Screen capture of the EXPLAIN output for USE_ASOF_BINARY_SEARCH"
src="images/docs/concepts/filtered-asof-plan-example.png"
/>

## Error Handling

SQL hints in QuestDB are designed to be robust:

- If there are syntax errors inside a hint block, the entire query won't fail
- The database will apply correctly parsed hints and ignore anything after an error
- Unknown or invalid hints are safely ignored
- The query execution falls back to default behavior when hints can't be applied
