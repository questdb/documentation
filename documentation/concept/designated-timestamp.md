---
title: Designated timestamp
sidebar_label: Designated timestamp
description:
  How designated timestamps are implemented and why it is an important
  functionality for time series.
---

QuestDB offers the option to elect a column as a _designated timestamp_. This
allows you to specify which column the tables will be indexed by in order to
leverage time-oriented language features and high-performance functionalities.

A designated timestamp is elected by using the
[`timestamp(columnName)`](/docs/reference/function/timestamp/) function:

- during a [CREATE TABLE](/docs/reference/sql/create-table/#designated-timestamp) operation
- during a [SELECT](/docs/reference/sql/select/#timestamp) operation
  (`dynamic timestamp`)
- when ingesting data via InfluxDB Line Protocol, for tables that do not already
  exist in QuestDB, partitions are applied automatically by day by default with
  a `timestamp` column

:::note

- The native timestamp format used by QuestDB is a Unix timestamp in microsecond
  resolution. See
  [Timestamps in QuestDB](/docs/guides/working-with-timestamps-timezones/#timestamps-in-questdb)
  for more details.

:::

## Properties

- Only a column of type `timestamp` can be elected as a designated timestamp.
- Only one column can be elected for a given table.

## Checking the designated timestamp settings

The [meta functions](/docs/reference/function/meta/), `tables()` and
`table_columns()`, are designed to show the designated timestamp settings of the
selected table.

## Advantages of electing a designated timestamp

Electing a designated timestamp allows you to:

- Partition tables by time range. For more information, see the
  [partitions reference](/docs/concept/partitions/).
- Use time series joins such as `ASOF JOIN`. For more information, see the
  [ASOF JOIN reference](/docs/reference/sql/asof-join/) or the more general
  [JOIN reference](/docs/reference/sql/join/).
- Optimize queries with [Interval scan](/docs/concept/interval-scan)

## Out-of-order policy

As of version 6.0.0, QuestDB supports the ingestion of records that are
out-of-order (O3) by time. QuestDB detects and adjusts data ingestion for O3
data automatically and no manual configuration is required.
