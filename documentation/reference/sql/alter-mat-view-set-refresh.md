---
title: ALTER MATERIALIZED VIEW SET REFRESH
sidebar_label: SET REFRESH
description:
  ALTER MATERIALIZED VIEW SET REFRESH SQL keyword reference documentation.
---

Changes a materialized view's refresh strategy and parameters.

## Syntax

![Flow chart showing the syntax of ALTER MATERIALIZED VIEW SET REFRESH command](/images/docs/diagrams/alterMatViewSetRefresh.svg)

## Description

Sometimes, the view's refresh strategy and its parameters may need to be changed.
Say, you may want to change the view to be timer refreshed instead of immediate
refresh.

The `REFRESH` follows the same format as [CREATE MATERIALIZED VIEW](/docs/reference/sql/create-mat-view/).

## Examples

```questdb-sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH EVERY '1h';
```

```questdb-sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH PERIOD (LENGTH 1d DELAY 1h);
```

```questdb-sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH IMMEDIATE;
```

```questdb-sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET REFRESH MANUAL;
```
