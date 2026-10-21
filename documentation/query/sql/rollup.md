---
title: ROLLUP keyword
sidebar_label: ROLLUP
description: ROLLUP SQL keyword reference for computing hierarchical subtotals and a grand total in a single query.
---

`ROLLUP` computes hierarchical subtotals in a single query. For example,
`GROUP BY ROLLUP(symbol, side)` returns a row per symbol and side, a subtotal
per symbol, and a grand total, which suits reports that drill down from a
total to its parts. With N columns, `ROLLUP` produces N+1 grouping sets. It
works with both `GROUP BY` and `SAMPLE BY`.

For syntax, examples, and limitations, see
[ROLLUP](/docs/query/sql/grouping-sets/#rollup) on the GROUPING SETS page.
