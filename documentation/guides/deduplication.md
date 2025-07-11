---
title: Data Deduplication
description:
 A guide to using QuestDB's efficient data deduplication, and how it helps to simplify your ingestion platform.
---


:::info

Data deduplication support was made generally available in QuestDB 7.3. It can be enabled on any WAL table, at creation
time or post-creation.

:::


## Related documentation

- **Concepts**
  - Understanding the basics of data deduplication with QuestDB.

- **SQL Commands**
  - [`CREATE TABLE`](/docs/reference/sql/create-table/#deduplication)
  - [ALTER TABLE DEDUP ENABLE ](/docs/reference/sql/alter-table-enable-deduplication)
  - [ALTER TABLE DEDUP DISABLE](/docs/reference/sql/alter-table-disable-deduplication)

- **Blogs**
   - See our original [release blog](https://questdb.com/blog/solving-duplicate-data-performant-deduplication/). 

## What is data deduplication for?

Time-series data often originates from a real-time source, where data is constantly streamed into the database,
transformed, and later offloaded. In a perfect world, data would be sent once, committed, and be perfectly durable forever after.

Unfortunately, the world isn't perfect, and all sorts of issues can arise when working with complex ingestion pipelines, 
including network partitions, data loss, and insufficient hardware to cope with the load.

Data deduplication is an efficient and easy-to-use tool to simplify your ingestion pipeline, and improve its resiliency. 

Data can be streamed directly to QuestDB, using our efficient ILP clients <link>, which can handle millions of rows ingested per
second, even on modest hardware. In the event of a failure, it may be unclear what data successfully reached the database, and what didn't.

By enabling deduplication, you can resend whole datasets en-masse and efficiently deduplicate it, merging the truly new rows with
the old. This makes your tables [idempotent](https://questdb.com/glossary/idempotency/) and simplifies your queries.

### Life without DEDUP

You may use SQL or a variety of third-party tools to handle deduplication in your ingestion pipelines, but this can 
become difficult to manage and maintain performance in high-end use cases.

todo: comparisons to other tools

## How are deduplicated tables different?

A non-deduplicated table will write duplicate rows to the table, which must be handled later in queries, using
`GROUP BY`, `SAMPLE BY`, or `LATEST ON`. If these duplicates are not needed, this can cause unnecessary increases 
in disk storage usage.

The rows written to the table will have the write-order preserved. However, this behaviour changes when deduplication
is enabled.

- Without deduplication:
  - the insertion order of each row will be preserved for rows with the same timestamp
- With deduplication:
  - the rows will be stored in order sorted by the `DEDUP UPSERT` keys, with the same timestamp

For example:

```questdb-sql
DEDUP UPSERT keys(timestamp, symbol, price)

-- will be stored on-disk in an order like:

ORDER BY timestamp, symbol, price
```

This is the natural order of data returned in plain queries, without any grouping, filtering or ordering.

The SQL standard does not guarantee the ordering of result sets without explicit `ORDER BY` clauses,
so you should not rely on a specific insertion order when using `DEDUP`.


## Configuring data deduplication

Deduplication is easy to configure, and can be added or removed from tables at any time. Here's how you can create a
table with deduplication enabled:

```questdb-sql title="trades DDL with dedup keys"
CREATE TABLE 'trades' ( 
	symbol SYMBOL CAPACITY 256 CACHE,
	side SYMBOL CAPACITY 256 CACHE,
	price DOUBLE,
	amount DOUBLE,
	timestamp TIMESTAMP
) timestamp(timestamp) PARTITION BY DAY WAL
DEDUP UPSERT KEYS(timestamp, symbol, side);
```

In this example, we define three `DEDUP` keys, and specify the deduplication mode as `UPSERT`. `UPSERT` mode
corresponds means that any rows matching the specified keys exactly will be overwritten and replaced with
new rows (last-writer-wins).

:::note

The `KEYS` list must include the table's [designated timestamp](/docs/concept/designated-timestamp).

:::

If you have a pre-existing table, you can use the [`DEDUP ENABLE`](/docs/reference/sql/alter-table-enable-deduplication) command to enable it for any new data written to the table:

```questdb-sql
ALTER TABLE TRADES DEDUP ENABLE UPSERT KEYS(timestamp, symbol, side);
```

:::tip

Only new data written to the table will be deduplicated after running `DEDUP ENABLE`, not historical data.

If you need to deduplicate the historical data, you should create a new table, enable `DEDUP`, and then copy
the data into it, using `INSERT INTO SELECT`.

:::

Now let's try it out! Here is some test data:

```questdb-sql
INSERT INTO 'trades' (symbol, side, price, amount, timestamp) 
VALUES 
    ('ETH-USD', 'sell', 2615.54,  0.00044, '2022-03-08T18:03:57.609765Z'),
    ('BTC-USD', 'sell', 39269.98, 0.001,   '2022-03-08T18:03:57.710419Z'),
    ('ETH-USD', 'buy',  2615.4,   0.002,   '2022-03-08T18:03:57.764098Z');
```

### Overwriting a single row

Let's pretend that we made a mistake with one of our rows, and need to correct the row.

One way to do this would be to use `UPDATE`, but this is not recommended as it is slower, and also incompatible with 
`Materialized View` refreshing.

Instead, we can just reinsert the same row, with a corrected value. Here, we reinsert the same row,
but change the `price` value from `2615.54` to `2622.54`.

```questdb-sql
INSERT INTO 'trades' (symbol, side, price, amount, timestamp) 
VALUES ('ETH-USD', 'sell', 2622.54, 0.00044, '2022-03-08T18:03:57.609765Z');
```

Now let's check the table by running `trades;`:

| symbol  | side | price       | amount  | timestamp                   |
|---------|------|-------------|---------|-----------------------------|
| ETH-USD | sell | **2622.54** | 0.00044 | 2022-03-08T18:03:57.609765Z |
| BTC-USD | sell | 39269.98    | 0.001   | 2022-03-08T18:03:57.710419Z |
| ETH-USD | buy  | 2615.4      | 0.002   | 2022-03-08T18:03:57.764098Z |

All it took was a few milliseconds, and the rows have been deduplicated and replaced!


### Overwriting multiple rows

All the rows in your batch can be deduplicated, with no API change - just send the new data and it will be replaced en-masse:


```questdb-sql
INSERT INTO 'trades' (symbol, side, price, amount, timestamp) 
VALUES 
    ('ETH-USD', 'sell', 2615.54,  0.00045, '2022-03-08T18:03:57.609765Z'),
    ('BTC-USD', 'sell', 39274.98, 0.001,   '2022-03-08T18:03:57.710419Z'),
    ('ETH-USD', 'buy',  2613.4,   0.002,   '2022-03-08T18:03:57.764098Z');
```

| symbol  | side | price        | amount      | timestamp                   |
|---------|------|--------------|-------------|-----------------------------|
| ETH-USD | sell | **2615.54**  | **0.00045** | 2022-03-08T18:03:57.609765Z |
| BTC-USD | sell | **39274.98** | 0.001       | 2022-03-08T18:03:57.710419Z |
| ETH-USD | buy  | **2613.4**   | 0.002       | 2022-03-08T18:03:57.764098Z |


### Interleaving new rows

The database may contain incomplete data for many reasons - for example, perhaps the data didn't arrive in good time,
or you were only storing a few time-series in the table, and need to introduce a new one.

The combination of out-of-order writes (for interleaving rows) and deduplication (for deduplicating rows) allows you to
easily backfill your historic data.

Let's interleave some missing `ETH-USD` trades into our dataset, and deduplicate old rows:

```questdb-sql
INSERT INTO 'trades' (symbol, side, price, amount, timestamp) 
VALUES 
    ('ETH-USD', 'sell', 2615.54,  0.00045, '2022-03-08T18:03:57.609765Z'),
    ('ETH-USD', 'sell', 2615.51,  0.00042, '2022-03-08T18:03:57.609997Z'),
    ('ETH-USD', 'buy',  2613.8,   0.00044, '2022-03-08T18:03:57.720321Z'),
    ('BTC-USD', 'sell', 39274.98, 0.001,   '2022-03-08T18:03:57.710419Z'),
    ('ETH-USD', 'buy',  2613.4,   0.002,   '2022-03-08T18:03:57.764098Z');
```

| symbol  | side | price    | amount  | timestamp                   |
| ------- | ---- | -------- | ------- | --------------------------- |
| ETH-USD | sell | 2615.54  | 0.00045 | 2022-03-08T18:03:57.609765Z |
| ETH-USD | sell | 2615.51  | 0.00042 | 2022-03-08T18:03:57.609997Z |
| BTC-USD | sell | 39274.98 | 0.001   | 2022-03-08T18:03:57.710419Z |
| ETH-USD | buy  | 2613.8   | 0.00044 | 2022-03-08T18:03:57.720321Z |
| ETH-USD | buy  | 2613.4   | 0.002   | 2022-03-08T18:03:57.764098Z |


### Disabling deduplication

Deduplication can be [disabled](/docs/reference/sql/alter-table-disable-deduplication) if needed:

```questdb-sql
ALTER TABLE TRADES DEDUP DISABLE;
```

If new rows are written, they will no longer be deduplicated:

```questdb-sql
INSERT INTO 'trades' (symbol, side, price, amount, timestamp) 
VALUES 
    ('ETH-USD', 'sell', 2615.54,  0.00045, '2022-03-08T18:03:57.609765Z'),
    ('ETH-USD', 'sell', 2615.54,  0.00045, '2022-03-08T18:03:57.609765Z');
```

| symbol  | side | price    | amount  | timestamp                   |
| ------- | ---- | -------- | ------- | --------------------------- |
| ETH-USD | sell | 2615.54  | 0.00045 | 2022-03-08T18:03:57.609765Z |
| ETH-USD | sell | 2615.54  | 0.00045 | 2022-03-08T18:03:57.609765Z |
| ETH-USD | sell | 2615.54  | 0.00045 | 2022-03-08T18:03:57.609765Z |
| ETH-USD | sell | 2615.51  | 0.00042 | 2022-03-08T18:03:57.609997Z |
| BTC-USD | sell | 39274.98 | 0.001   | 2022-03-08T18:03:57.710419Z |
| ETH-USD | buy  | 2613.8   | 0.00044 | 2022-03-08T18:03:57.720321Z |
| ETH-USD | buy  | 2613.4   | 0.002   | 2022-03-08T18:03:57.764098Z |

### Inspecting deduplication metadata

You can use common metadata queries to check whether a table has dedup configured:

```questdb-sql
SELECT table_name, dedup FROM tables() WHERE table_name = 'trades';
```

| table_name | dedup |
| ---------- |-------|
| trades     | true  |

You can also inspect the column metadata to find out which columns are the dedup keys:

```questdb-sql
SELECT "column", "type", upsertKey 
FROM table_columns('trades')
WHERE upsertKey = true;
```

| column    | type      | upsertKey |
| --------- | --------- | --------- |
| symbol    | SYMBOL    | true      |
| side      | SYMBOL    | true      |
| timestamp | TIMESTAMP | true      |


## How does it perform?

Ingestion performance depends heavily in your use case and ingestion patterns. However, we can give a
rough idea of how cheap the deduplication process itself is.

In the [original release blog](https://questdb.com/blog/solving-duplicate-data-performant-deduplication/), `DEDUP`
was put to the test, and found to have around an 8% overhead for a basic dataset. 

In QuestDB 9.0.0, the performance for large bulk reloads was dramatically improved.

Here are some figures from a TSBS benchmark with `scale=4000` and `workers=4`, with 10 `SYMBOL` column used as `DEDUP` keys:

| Version / Action |  Initial load | Full reload  |
|------------------|---------------|--------------|
|            8.3.3 | ~1m rows/s    | ~520k rows/s |
|            9.0.0 | ~1.2m rows/s  | ~1.7m rows/s |

<details>
  <summary>Benchmark details</summary>

    - Type: cpu-only
    - Scale: 4000
    - Workers: 4
    - Total rows: ~100m
    - Hardware: 2021 M1 Macbook Pro 16 GB
</details>

todo: revised benchmarks
