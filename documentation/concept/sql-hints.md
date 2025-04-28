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

The `USE_ASOF_BINARY_SEARCH` hint enables a specialized optimization strategy for non-keyd ASOF joins. This hint takes
two parameters - the table aliases involved in the join.

```questdb-sql title="Optimizing ASOF join with binary search"
SELECT /*+ USE_ASOF_BINARY_SEARCH(orders md) */ 
  orders.ts, orders.price, md.ask, md.bid, md.order_ts
FROM orders
ASOF JOIN (
  SELECT ts as order_ts, bid, ask FROM market_data
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

#### When to use

This optimization is particularly beneficial when:

- The joined table is significantly larger than the main table
- The filter on the joined table has low selectivity (doesn't filter out many rows)
- The joined table is likely to be "cold" (not cached in memory)

In these scenarios, the default parallel filtering strategy may process too many rows, resulting in a large intermediate
result set that still needs to be joined. The binary search approach can be more efficient by working record-by-record
from the main table perspective.

When data is cold (not in cache), the default strategy must read all rows from the joined table from disk to evaluate
the filter, which can be particularly expensive on slower I/O systems like EBS (Elastic Block Storage). The binary
search approach can significantly reduce I/O operations by reading only relevant portions of the data.

#### Performance trade-offs

- The binary search strategy processes records sequentially rather than in parallel
- It may perform better when the joined table is very large relative to the main table
- It's particularly useful when filters don't eliminate many rows from the joined table
- It can significantly reduce I/O costs when working with cold data on slower storage systems
- It's more efficient in environments with limited I/O bandwidth or high latency storage

Use this hint when you observe that your ASOF join queries are slow and match the characteristics described above,
especially in cloud environments where storage performance may be variable.

## Error Handling

SQL hints in QuestDB are designed to be robust:

- If there are syntax errors inside a hint block, the entire query won't fail
- The database will apply correctly parsed hints and ignore anything after an error
- Unknown or invalid hints are safely ignored
- The query execution falls back to default behavior when hints can't be applied

This allows users to experiment with different optimization strategies without risking query failures.

## Best Practices

- Use hints only after identifying specific performance issues through profiling
- Test queries with and without hints to verify performance improvements
- Document the use of hints in your application code to aid future maintenance
- Reassess the need for hints after database upgrades, as optimizer improvements may make them unnecessary