---
title: ALTER MATERIALIZED VIEW SET REFRESH START
sidebar_label: SET REFRESH START
description:
  ALTER MATERIALIZED VIEW SET REFRESH START SQL keyword reference documentation.
---

Changes a materialized view's refresh to run on a schedule.

## Syntax

![Flow chart showing the syntax of ALTER MATERIALIZED VIEW SET REFRESH START command](/images/docs/diagrams/alterMatViewSetRefreshStart.svg)

## Description

Sometimes, the view may not need to be updated eagerly. For example, perhaps the data is only queried every five minutes.

In this circumstance, you can defer updating the view in small pieces, and instead let it be updated in a larger
incremental write every five minutes.

The schedule is defined using a start time and then a timing unit, with a minimum of `1m`.

Each triggered refresh is itself incremental, and will only consider data since the last refresh.

The unit follows the same format as [SAMPLE BY](/docs/reference/sql/sample-by/).

## Examples

```questdb-sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH START '2025-05-30T00:00:00Z' EVERY '1h';
```
