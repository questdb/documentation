---
title: EXPLAIN keyword
sidebar_label: EXPLAIN
description: EXPLAIN SQL keyword reference documentation.
---

`EXPLAIN` displays the execution plan of an `INSERT`, `SELECT`, or `UPDATE`
statement.

## Syntax

![Flow chart showing the syntax of the EXPLAIN keyword](/img/docs/diagrams/explain.svg)

### Description

A query execution plan shows how a statement will be implemented: which table is
going to be accessed and how, what join method are employed, and which
predicates are JIT-compiled etc.  
`EXPLAIN` output is a tree of nodes containing properties and subnodes (aka
child nodes).

In a plan such as:

| QUERY PLAN                                                                 |
| -------------------------------------------------------------------------- |
| Async JIT Filter                                                           |
| &nbsp;&nbsp;filter: 100<l                                                  |
| &nbsp;&nbsp;workers: 1                                                     |
| &nbsp;&nbsp;&nbsp;&nbsp;DataFrame                                          |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Row forward scan           |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Frame forward scan on: tab |

there are:

- 4 nodes:
  - Async JIT Filter
  - DataFrame
  - Row forward scan
  - Frame forward scan
- 2 properties (both belong to Async JIT Filter node):
  - filter
  - workers

For simplicity, some nodes have special properties shown on the same line as
type; for example, `Filter filter: b.age=10` or `Limit lo: 10`.

The following list contains some plan node types:

- `Async Filter` - a parallelized filter that evaluates expressions with Java
  code. In certain scenarios, it also implements the `LIMIT` keyword.
- `Async JIT Filter` - a parallelized filter that evaluates expressions with
  Just-In-Time-compiled filter. In certain scenarios, it also implements the
  `LIMIT` keyword.
- `Interval forward` - scans one or more table data ranges based on the
  designated timestamp predicates. Scan endpoints are found via a binary search
  on timestamp column.
- `CachedAnalytic` - container for window functions, e.g.
  [row_number()](/docs/reference/function/analytic/#row_number)
- `Count` - returns the count of records in subnode.
- `Cursor-order scan` - scans table records using row ids taken from an index,
  in index order - first all row ids linked to index value A, then B, etc.
- `DataFrame` - full or partial table scan. It contains two children:
  - row cursor - which iterates over rows inside a frame (e.g.
    `Row forward scan`).
  - frame cursor - which iterates over table partitions or partition chunks
    (e.g. `Frame forward scan`).
- `Filter` - standalone (non-JIT-compiled, non-parallelized) filter.
- `Frame forward/backward scan` - scans table partitions in a specified
  direction.
- `GroupBy` - group by with or without key(s). If `vectorized` field shows
  `true`, then the node is parallelized and uses vectorized calculations.
- `Hash` - subnode of this node is used to build a hash table that is later
  looked up (usually in a `JOIN` clause but also applies to `EXCEPT` or
  `INTERSECT`).
- `Index forward/backward scan` - scans all row ids associated with a given
  `symbol` value from start to finish or vice versa.
- `Limit` - standalone node implementing the `LIMIT` keyword. Other nodes can
  implement `LIMIT` internally, e.g. the `Sort` node.
- `Row forward/backward scan` - scans data frame (usually partitioned) records
  in a specified direction.
- `Sort` - sorts data. If low or hi property is specified, then the sort buffer
  size is limited and a number of rows are skipped after sorting.
- `SampleBy` - `SAMPLE BY` keyword implementation. If the `fill` is not shown,
  it means `fill(none)`.
- `Selected Record` - used to reorder or rename columns. It does not do any
  significant processing on its own.
- `Table-order scan` - scans table records using row ids taken from an index in
  table (physical) order - from the lowest to highest row id.
- `VirtualRecord` - adds expressions to a subnode's columns.

Other node types should be easy to link to SQL and database concepts, e.g.
`Except`, `Hash Join` or `Lt Join`.

Many nodes, especially join and sort, have 'light' and 'heavy' variants, e.g.
`Hash Join Light` and `Hash Join`. The former is used when child node(s) support
efficient random access lookups (e.g. `DataFrame`) so storing row id in the
buffer is enough; otherwise, the whole record needs to be copied and the 'heavy'
factory is used.

## Examples

To illustrate how `EXPLAIN` works, consider the `trades` table
[in the QuestDB demo instance](https://demo.questdb.io/):

```questdb-sql
CREATE TABLE trades (
  symbol SYMBOL CAPACITY 256 CACHE,
  side SYMBOL CAPACITY 256 CACHE,
  price DOUBLE,
  amount DOUBLE,
  timestamp TIMESTAMP
) TIMESTAMP (timestamp) PARTITION BY DAY
```

### Using `EXPLAIN` for the plan for `SELECT`

The following query highlight the plan for `ORDER BY` for the table:

```questdb-sql
EXPLAIN SELECT * FROM trades ORDER BY ts DESC;
```

| QUERY PLAN                                             |
| ------------------------------------------------------ |
| DataFrame                                              |
| &nbsp;&nbsp;&nbsp;&nbsp;Row backward scan              |
| &nbsp;&nbsp;&nbsp;&nbsp;Frame backward scan on: trades |

The plan shows that no sort is required and the result is produced by scanning
the table backward.  
The scanning direction is possible because the data in the `trades` table is
stored in timestamp order.

Now, let's check the plan for `trades` with a simple filter:

```questdb-sql
EXPLAIN SELECT * FROM trades WHERE amount > 100.0;
```

| QUERY PLAN                                                                    |
| ----------------------------------------------------------------------------- |
| Async JIT Filter                                                              |
| &nbsp;&nbsp;filter: 100.0<amount                                              |
| &nbsp;&nbsp;workers: 1                                                        |
| &nbsp;&nbsp;&nbsp;&nbsp;DataFrame                                             |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Row forward scan              |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Frame forward scan on: trades |

In this example, the plan shows that the `trades` table undergoes a full scan
(`DataFrame` and subnodes) and the data is processed by the parallelized
JIT-compiled filter.

### Using `EXPLAIN` for the plan for `CREATE` and `INSERT`

Apart from `SELECT`, `EXPLAIN` also works on `CREATE` and `INSERT` statements.
Single-row inserts are straightforward. The examples in this section show the
plan for more complicated `CREATE` and `INSERT` queries.

```questdb-sql
EXPLAIN CREATE TABLE trades AS
(
  SELECT
    rnd_symbol('a', 'b') symbol,
    rnd_symbol('Buy', 'Sell') side,
    rnd_double() price,
    rnd_double() amount,
    x::timestamp timestamp
  FROM long_sequence(10)
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

| QUERY PLAN                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------- |
| Create table: trades                                                                                                             |
| &nbsp;&nbsp;&nbsp;&nbsp;VirtualRecord                                                                                            |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;functions: [rnd_symbol([a,b]),rnd_symbol([Buy,Sell]),rnd_double(),rnd_double(),x::timestamp] |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;long_sequence count: 10                                                          |

The plan above shows that the data is fetched from a `long_sequence` cursor,
with random data generating functions called in `VirtualRecord`.

The same applies to the following query:

```questdb-sql
EXPLAIN INSERT INTO trades
  SELECT
    rnd_symbol('a', 'b') symbol,
    rnd_symbol('Buy', 'Sell') side,
    rnd_double() price,
    rnd_double() amount,
    x::timestamp timestamp
  FROM long_sequence(10);
```

| QUERY PLAN                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------- |
| Insert into table: trades                                                                                                        |
| &nbsp;&nbsp;&nbsp;&nbsp;VirtualRecord                                                                                            |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;functions: [rnd_symbol([a,b]),rnd_symbol([Buy,Sell]),rnd_double(),rnd_double(),x::timestamp] |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;long_sequence count: 10                                                          |

Of course, statements could be much more complex than that. Consider the
following `UPDATE` query:

```questdb-sql
EXPLAIN UPDATE trades SET amount = 0 WHERE timestamp IN '2022-11-11';
```

| QUERY PLAN                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------ |
| Update table: trades                                                                                                                       |
| &nbsp;&nbsp;&nbsp;&nbsp;VirtualRecord                                                                                                      |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;functions: [0]                                                                                         |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;DataFrame                                                                                  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Row forward scan                                                   |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Interval forward scan on: trades                                   |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;intervals: [static=[1668124800000000,1668211199999999] |

The important bit here is `Interval forward scan`. It means that the table is
forward scanned only between points designated by the
`timestamp IN '2022-11-11'` predicate, that is between
`2022-11-11 00:00:00,000000` and `2022-11-11 23:59:59,999999` (shown as raw
epoch micro values in the plan above). `VirtualRecord` is only used to pass 0
constant for each row coming from `DataFrame`.

## Limitations:

To minimize resource usage, the `EXPLAIN` command does not execute the
statement, to avoid paying a potentially large upfront cost for certain queries
(especially those involving hash join or sort).

`EXPLAIN` provides a useful indication of the query execution, but it does not
guarantee to show the actual execution plan. This is because elements determined
during query runtime are missing.

While `EXPLAIN` shows the number of workers that could be used by a parallelized
node it is only the upper limit. Depending on the data volume and system load, a
query can use fewer workers.

:::note

Under the hood, the plan nodes are called `Factories`. Most plan nodes can be
mapped to implementation by adding the `RecordCursorFactory` or
`FrameCursorFactory` suffix, e.g.

- `DataFrame` -> `DataFrameRecordCursorFactory`
- `Async JIT Filter` -> `AsyncJitFilteredRecordCursorFactory`
- `SampleByFillNoneNotKeyed` -> `SampleByFillNoneNotKeyedRecordCursorFactory`
  while some are a bit harder to identify, e.g.
- `GroupByRecord vectorized: false` ->
  `io.questdb.griffin.engine.groupby.GroupByRecordCursorFactory`
- `GroupByRecord vectorized: true` ->
  `io.questdb.griffin.engine.groupby.vect.GroupByRecordCursorFactory`

Other classes can be identified by searching for the node name in the `toPlan()`
methods.

:::

## See also

This section includes links to additional information such as tutorials:

- [EXPLAIN Your SQL Query Plan](/blog/explain-sql-query-plan/)
- [Exploring Query Plan Scan Nodes with SQL EXPLAIN](/blog/exploring-query-plan-scan-nodes-sql-explain/)
