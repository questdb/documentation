---
title: CUBE keyword
sidebar_label: CUBE
description: CUBE SQL keyword reference for computing aggregates over every combination of columns in a single query.
---

`CUBE` computes aggregates for every combination of the listed columns in a
single query. For example, `GROUP BY CUBE(symbol, side)` returns a row per
symbol and side, a total per symbol, a total per side, and a grand total,
which suits cross-tabulation. With N columns, `CUBE` produces 2^N grouping
sets. It works with both `GROUP BY` and `SAMPLE BY`.

For syntax, examples, and limitations, see
[CUBE](/docs/query/sql/grouping-sets/#cube) on the GROUPING SETS page.
