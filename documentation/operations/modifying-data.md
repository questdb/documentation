---
title: Alternatives to UPDATE
sidebar_label: Update alternatives
description:
  Append-oriented patterns for modifying data in QuestDB without using UPDATE.
---

QuestDB is optimized for append-only ingestion. For best performance, design
your application to avoid frequently editing existing records.

When you need to modify data, you have two options:

1. **[UPDATE statement](/docs/reference/sql/update/)** - For correcting
   incorrectly inserted data. See
   [How UPDATE works](/docs/operations/updating-data/) for implementation
   details.

2. **Append-oriented alternatives** (this page) - Patterns that work with
   QuestDB's storage model instead of against it.

## Alternatives to UPDATE

- **[Append newest state](#append-newest-state)** - Insert a newer state to
  replace an older one. This preserves history and enables
  [bi-temporal queries](https://martinfowler.com/articles/bitemporal-history.html).

- **[Replace table](#replace-table)** - Create a new table with filtered data,
  drop the original, and rename.

- **[Drop partitions](#delete-by-dropping-partitions)** - Delete entire
  time-based partitions you no longer need.

:::note
Always [backup your database](/docs/operations/backup/) before modifying data.
:::

## Append newest state

### Using the timestamp field

Here's a working example using the timestamp column:

```questdb-sql
CREATE TABLE takeaway_order (
    ts TIMESTAMP,
    id SYMBOL,
    status SYMBOL)
        timestamp(ts);

INSERT INTO takeaway_order VALUES (now(), 'order1', 'placed');
INSERT INTO takeaway_order VALUES (now(), 'order2', 'placed');
INSERT INTO takeaway_order VALUES (now(), 'order1', 'cooking');
INSERT INTO takeaway_order VALUES (now(), 'order1', 'in-transit');
INSERT INTO takeaway_order VALUES (now(), 'order1', 'arrived');
INSERT INTO takeaway_order VALUES (now(), 'order3', 'placed');
INSERT INTO takeaway_order VALUES (now(), 'order3', 'cooking');
INSERT INTO takeaway_order VALUES (now(), 'order3', 'in-transit');
```

We join the latest timestamp of an order id against the rest of the data to
obtain full details.

```questdb-sql
WITH
    ts_takeaway_order AS (
        SELECT
            max(ts) AS ts,
            id
        FROM
            takeaway_order GROUP BY id)
SELECT
    o.*
FROM
    ts_takeaway_order ts_o
    INNER JOIN 'takeaway_order' o
    ON ts_o.ts = o.ts
```

This results in the latest state for each order:

| _timestamp_ ts              | id _symbol_ | status _symbol_ |
| :-------------------------- | :---------- | :-------------- |
| 2022-04-07T15:33:43.944922Z | order1      | arrived         |
| 2022-04-07T15:33:37.370694Z | order2      | placed          |
| 2022-04-07T15:33:50.829323Z | order3      | in-transit      |

### Using dedicated fields

If timestamps don't work for you here, you can also use an extra integer column
called `version`, an extra boolean `deleted` column or similar.

## Replace Table

Another alternative is to:

- Backup your database.
- Select only the data you want from an existing table into a new temporary one.
- Drop the original table.
- Rename the temporary table to the original table's name.

```questdb-sql
CREATE TABLE mytable_copy AS (
    SELECT * FROM mytable WHERE column_value != 42
) TIMESTAMP(ts) PARTITION BY DAY;

DROP TABLE mytable;
RENAME table mytable_copy TO mytable;
```

## Delete by Dropping Partitions

When you create tables with a timestamp, you may organise them into
[partitions](/docs/concept/partitions/) using the
[`CREATE TABLE .. PARTITION BY`](/docs/reference/sql/create-table/#partitioning)
SQL statement. But first, [backup your database](/docs/operations/backup/).

You may then use the
[`ALTER TABLE DROP PARTITION`](/docs/reference/sql/alter-table-drop-partition/)
SQL statement to drop partitions you no longer need.
