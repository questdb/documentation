# Modify data

QuestDB is a [time-series database](/glossary/time-series-database/) optimized
to append data.

For best performance, design your application to avoid having to frequently edit
existing records.

The [`UPDATE`](/docs/reference/sql/update/) statement is available in QuestDB
since version 6.4, `DELETE` is also planned to be included in upcoming releases.
However, they are intended for correcting data that was inserted incorrectly or
should have never been inserted in the first place (for example as part of data
administration tasks).

These are three alternatives to `UPDATE` and `DELETE` you may consider:

- [Append newest state](#append-newest-state): Insert a newer state to replace
  an older one: This has the added advantage that you can query back in time to
  a previous state. It is also the basis of organizing data for
  [bi-temporality](https://martinfowler.com/articles/bitemporal-history.html).

- [Replace a table](#replace-table): Create a new table with the new data you
  need, drop the old one and rename.

- [Delete by dropping partitions](#delete-by-dropping-partitions): Create your
  time-series tables with partitions, then delete the ones you no longer need.

## Append newest state

### Using the timestamp field

Here's a worked example using the timestamp column:

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
SQL statement.

You may then use the
[`ALTER TABLE DROP PARTITION`](/docs/reference/sql/alter-table-drop-partition/)
SQL statement to drop partitions you no longer need.
