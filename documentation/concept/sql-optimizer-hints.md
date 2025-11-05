---
title: SQL optimizer hints
description:
  SQL Hints allow expert users to guide the query optimizer in QuestDB when default optimization strategies are not optimal.
  This document describes available hints and when to use them.
---

QuestDB's query optimizer automatically selects execution plans for SQL queries
based on heuristics. While the default execution strategy should be the fastest
for most scenarios, you can use hints to select a specific strategy that may
better suit your data's characteristics. SQL hints influence the execution
strategy of queries without changing their semantics.

## Hint Syntax

In QuestDB, you specify SQL hints in block comments with a plus sign after the
opening comment marker. You must place the hint immediately after the `SELECT`
keyword:

```questdb-sql title="SQL hint syntax"
SELECT /*+ HINT_NAME(parameter1 parameter2) */ columns FROM table;
```

Only block comment hints (`/*+ HINT */`) are supported, not line comment hints
(`--+ HINT`).

Hints are designed to be a safe optimization mechanism:

- without hints, QuestDB uses default optimization strategies
- QuestDB silently ignores unknown hints and those that don't apply to a query
- QuestDB silently ignores any syntax errors in a hint block

-----

## Temporal JOIN hints

### `asof_linear(l r)`

:::info

This hint applies to `LT` joins as well.

:::

The main performance challenge in a temporal (ASOF/LT) JOIN is locating the
right-hand row with the timestamp matching a given left-hand row.

QuestDB uses two main strategies for this:

1. _Linear scan_ of the right-hand table until reaching the left-hand timestamp
2. _Fast Scan_: binary search of the right-hand table to zero in on the matching
   row

<Screenshot
alt="Diagram explaining the Fast Scan algorithm"
height={447}
src="images/docs/concepts/asof-join-binary-search-strategy.svg"
width={745}
/>

Fast Scan's binary search excels when the number of right-hand rows between any
two left-hand rows is high (in terms of their timestamps). As the algorithm
advances over the left-hand rows, at every step there are many new right-hand
rows to consider. Linear scan is bad in this case, because it must scan all
these rows.

However, in many use cases there is a dense interleaving of left-hand and
right-hand rows. For example, trades on the left hand, and quotes on the right
hand. Both happen frequently through the trading day. In this case the lower
fixed overhead of linear scan may result in better performance.

Another advantage of linear scan is when the right-hand side is a subquery with
a WHERE clause that is highly selective, passing through a small number of rows.
QuestDB has parallelized filtering support, but this is disabled with Fast Scan.

By default, QuestDB chooses the Fast Scan due to it graceful performance
degradation with sparse intearleaving, and allows you to enable the Linear Scan
using a query hint, as in this example:

```questdb-sql title="Using linear search for an ASOF join"
SELECT /*+ asof_linear(orders md) */
  orders.ts, orders.price, md.md_ts, md.bid, md.ask
FROM orders
ASOF JOIN (
  SELECT ts as md_ts, bid, ask FROM market_data
  WHERE state = 'INVALID' -- Highly selective filter
) md;
```

### `asof_dense(l r)`

This hint enables Dense Scan, an improvement on Linear Scan that avoids the
pitfall of scanning the whole history in the right-hand table. It uses binary
search at the beginning, to locate the right-hand row that matches the first
left-hand row. From then on, it proceeds just like Linear Scan, but, since it
skipped all the history, also performs a backward scan through history as
needed, when the forward scan didn't find the join key.

When the left-hand rows are densely interleaved with the right-hand rows, Dense
Scan may be faster than the default due to its lower fixed overhead.

```questdb-sql title="Using Dense Scan for an ASOF join"
SELECT /*+ asof_dense(orders md) */
    orders.timestamp, orders.symbol, orders.price
FROM orders
ASOF JOIN (md) ON (symbol);
```

### `asof_memoized(l r)`

This enables Memoized Scan, a variant of the [Fast Scan](#asof_linearl-r). It
uses the same binary search as the initial step that locates the right-hand row
with the timestamp matching the left-hand row. When you join on a symbol column,
as in `left ASOF JOIN right ON (symbol)`, this hint instructs QuestDB to use
additional RAM to remember where it last saw a symbol in the right-hand table.
When looking again for a memorized symbol, it will only scan the yet-unseen part
of the right-hand table, and if it doesn't find the symbol there, it will jump
directly to the row it memorized earlier.

This hint will help you if many left-hand rows have a symbol that occurs rarely
in the right-hand table, so that the same right-hand row matches several
left-hand rows. It is especially helpful if some symbols occur way in the past,
because it will search for each such symbol only once.

```questdb-sql title="Using Memoized Scan for an ASOF join"
SELECT /*+ asof_memoized(orders md) */
    orders.timestamp, orders.symbol, orders.price
FROM orders
ASOF JOIN (md) ON (symbol);
```

### `asof_memoized_driveby(l r)`

This hint hint enables the Memoized Scan, just like `asof_memoized(l r)`, but
with one more mechanism: the _Drive-By cache_. In addition to memorizing the
previously matched right-hand rows, it remembers the location of _all_ symbols
it encounters during its backward scan. This pays off when there's a significant
number of very rare symbols. While the regular Memoized Scan searches for each
symbol separately, resulting in repeated scans for rare symbols, the Drive-By
Cache allows it to make just one deep backward scan, and collect all of them.

Maintaining the Drive-By Cache requires a hashtable lookup at every step of the
algorithm, so if it doesn't help finding rare symbols, it will incur an
additional overhead and reduce query performance.

```questdb-sql title="Using Memoized Scan with Drive-By Cache for an ASOF join"
SELECT /*+ asof_memoized_driveby(orders md) */
    orders.timestamp, orders.symbol, orders.price
FROM orders
ASOF JOIN (md) ON (symbol);
```

### `asof_index(l r)`

This enables the Indexed Scan, a variant of the [Fast Scan](#asof_linearl-r). It
uses the same binary search as the initial step that locates the right-hand row
with the timestamp matching the left-hand row. When you join on a symbol column,
as in `left ASOF JOIN right ON (symbol)`, and the right-hand symbol column is
indexed, this hint instructs QuestDB to consult the index, and skip entire
partitions where the symbol does not appear.

If the symbol does appear in the most recent applicable partition (close to the
left-hand row's timestamp), QuestDB must scan the index linearly to locate the
matching row.

This hint is helpful only when a significant number of left-hand rows use a
symbol that occurs rarely in the right-hand table.

```questdb-sql title="Using Indexed Scan for an ASOF join"
SELECT /*+ asof_index(orders md) */
    orders.timestamp, orders.symbol, orders.price
FROM orders
ASOF JOIN md ON (symbol);
```

-----

### Check the Execution Plan

You can verify how QuestDB executes your query by examining its execution plan
with the `EXPLAIN` statement.

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

The execution plan will show a `Filtered AsOf Join Fast Scan` operator,
confirming the binary search strategy is being used.

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

When you use the `asof_linear` hint, the plan changes.

```questdb-sql title="Observing execution plan with the AVOID hint" demo
EXPLAIN SELECT /*+ asof_linear(core_price market_data) */
  *
FROM core_price
ASOF JOIN market_data
ON symbol
WHERE bids[1,1]=107.03 -- Highly selective filter
;
```

The execution plan will now show the `AsOf Join Light` operator and a separate,
preceding filtering step on the joined table.

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
  - superseded by `asof_linear`
- `avoid_lt_binary_search`
  - superseded by `asof_linear`
- `asof_linear_search`
  - superseded by `asof_linear`
- `asof_index_search`
  - superseded by `asof_index`
- `asof_memoized_search`
  - superseded by `asof_memoized`
