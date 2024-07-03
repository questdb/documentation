---
title: FILL keyword
sidebar_label: FILL
description: FILL SQL keyword reference documentation.
---

Queries using a [SAMPLE BY](/docs/reference/sql/sample-by/) aggregate on data
which has missing records may return a discontinuous series of results. The
`FILL` keyword allows for specifying a fill behavior for results which have
missing aggregates due to missing rows.

Details for the `FILL` keyword can be found on the
[SAMPLE BY](/docs/reference/sql/sample-by/) page.

To specify a default handling for `null` values within queries, see the
[coalesce() function](/docs/reference/function/conditional/#coalesce)
documentation.
