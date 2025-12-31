---
title: Create a sample database
description:
  "This guide demonstrates generating and managing sample time-series data in
  QuestDB, including table creation, data insertion, querying, and cleanup."
---

This guide walks you through creating a sample dataset.

It utilizes `rnd_` functions and basic SQL grammar to generate 'mock' data of
specific types.

For most applications, you will import your data using methods like the InfluxDB
Line Protocol, CSV imports, or integration with third-party tools such as
Telegraf, [Kafka](/docs/ingestion/message-brokers/kafka), or Prometheus. If your interest lies in data ingestion rather
than generation, refer to our [ingestion overview](/docs/ingestion/overview/).
Alternatively, the [QuestDB demo instance](https://demo.questdb.io) offers a
practical way to explore data creation and manipulation without setting up your
dataset.

All that said, in this tutorial you will learn how to:

1. [Create tables](#creating-a-table)
2. [Populate tables with sample data](#inserting-data)
3. [Run simple and advanced queries](#running-queries)
4. [Delete tables](#deleting-tables)

### Before we begin...

All commands are run through the [Web Console](/docs/getting-started/web-console/overview/) accessible at
[http://localhost:9000](http://localhost:9000).

You can also run the same SQL via the
[Postgres endpoint](/docs/query/pgwire/overview/) or the
[REST API](/docs/query/rest-api/).

If QuestDB is not running locally, checkout the
[quick start](/docs/getting-started/quick-start/).

### Creating a table

With QuestDB running, the first step is to create a table.

We'll start with one representing financial market data. Then in the insert
section, we'll create another pair of tables representing temperature sensors
and their readings.

Let's start by creating the `trades` table:

```questdb-sql
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    side SYMBOL,
    price DOUBLE,
    amount DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY
DEDUP UPSERT KEYS(timestamp, symbol);
```

This is a basic yet robust table. It applies [SYMBOL](/docs/concepts/symbol/)s
for ticker and side, a price, and a
[designated timestamp](/docs/concepts/designated-timestamp/). It's
[partitioned by day](/docs/concepts/partitions/) and
[deduplicates](/docs/concepts/deduplication/) the timestamp and ticker columns.
As the links above show, there's lots to unpack in this table! Feel free to
learn more about the nuances.

We've done all of this to match the nature of how we'll query this data. We're
focused on a the flow of the market, the pulse of the market's day-to-day, hence
we've partitioned it as such. We're also leery of duplicates, for accuracy of
data, so we'll ensure that if timestamps are identical that we do not create a
duplicate. Timestamps are essential for time-series analysis.

We'll proceed forward to INSERT.

### Inserting data

#### Financial market data

Let's populate our `trades` table with procedurally-generated data:

```questdb-sql title="Insert as SELECT"
INSERT INTO trades
    SELECT
        timestamp_sequence('2024-01-01T00:00:00', 60000L * x) timestamp, -- Generate a timestamp every minute starting from Jan 1, 2024
        rnd_str('ETH-USD', 'BTC-USD', 'SOL-USD', 'LTC-USD', 'UNI-USD') symbol, -- Random ticker symbols
        rnd_str('buy', 'sell') side, -- Random side (BUY or SELL)
        rnd_double() * 1000 + 100 price, -- Random price between 100.0 and 1100.0,
        rnd_double() * 2000 + 0.1 amount -- Random price between 0.1 and 2000.1
    FROM long_sequence(10000) x;
```

Our `trades` table now contains 10,000 randomly-generated trades. The
comments indicate how we've structured our random data. We picked a few
companies, BUY vs. SELL, and created a timestamp every minute. We've dictated
the overall number of rows generated via `long_sequence(10000)`. We can bump
that up, if we want.

We've also conservatively generated a timestamp per minute, even though in
reality trades against these companies are likely much more frequent. This helps
keep our basic examples basic.

Now let's look at the table and its data:

```questdb-sql
'trades';
```

It will look similar to this, albeit with alternative randomized values.

| timestamp                   | symbol  | side | price            | amount           |
| --------------------------- | ------- | ---- | ---------------- | ---------------- |
| 2024-01-01T00:00:00.000000Z | BTC-USD | sell | 483.904143675277 | 139.449481016294 |
| 2024-01-01T00:00:00.060000Z | ETH-USD | sell | 920.296245196274 | 920.296245196274 |
| 2024-01-01T00:00:00.180000Z | UNI-USD | sell | 643.277468441839 | 643.277468441839 |
| 2024-01-01T00:00:00.360000Z | LTC-USD | buy  | 218.0920768859   | 729.81119178972  |
| 2024-01-01T00:00:00.600000Z | BTC-USD | sell | 157.596416931116 | 691.081778396176 |

That's some fake market data. Let's create more tables to demonstrate joins.

### Quotes and instruments

This next example will create and populate two more tables. One table will
contain price quotes, and the other will contain instrument metadata. In both
cases, we will create the table and generate the data at the same time.

This combines the CREATE & SELECT operations to perform a create-and-insert:

```questdb-sql title="Create table as, quotes"
CREATE TABLE quotes
AS(
    SELECT
        x ID,
        timestamp_sequence(to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss'), rnd_long(1,10,0) * 100000L) ts,
        rnd_double(0)*80 + 100 price,
        rnd_long(0, 10000, 0) instrument_id
    FROM long_sequence(10000000) x)
TIMESTAMP(ts)
PARTITION BY MONTH DEDUP UPSERT KEYS(ts);
```

For our table, we've again hit the following key notes:

- `TIMESTAMP(ts)` elects the `ts` column as a
  [designated timestamp](/docs/concepts/designated-timestamp/) for partitioning
  over time.
- `PARTITION BY MONTH` creates a monthly partition, where the stored data is
  effectively sharded by month.
- `DEDUP UPSERT KEYS(ts)` deduplicates the timestamp column

The generated data will look like the following:

| ID  | ts                          | price       | instrument_id |
| :-- | :-------------------------- | :---------- | :------------ |
| 1   | 2019-10-17T00:00:00.000000Z | 145.37      | 9160          |
| 2   | 2019-10-17T00:00:00.600000Z | 162.91      | 9671          |
| 3   | 2019-10-17T00:00:01.400000Z | 128.58      | 8731          |
| 4   | 2019-10-17T00:00:01.500000Z | 131.69      | 3447          |
| 5   | 2019-10-17T00:00:01.600000Z | 155.68      | 7985          |
| ... | ...                         | ...         | ...           |

Nice - and our next table, which includes the instruments themselves and their
detail:

```questdb-sql title="Create table as, instruments"
CREATE TABLE instruments
AS(
    SELECT
        x ID, -- Increasing integer
        rnd_str('NYSE', 'NASDAQ', 'LSE', 'TSE', 'HKEX') exchange, -- Random exchange
        rnd_str('Tech', 'Finance', 'Energy', 'Healthcare', 'Consumer') sector -- Random sector
    FROM long_sequence(10000) x)
```

Note that we've not included a timestamp in this instruments table. This is one
of the rare examples where we're not including it, and thus not taking advantage
of time-series optimization. As we have a timestamp in the paired `quotes`
table, it's helpful to demonstrate them as a pair.

With these two new tables, and our prior financial market data table, we've got
a lot of useful queries we can test.

### Running queries

Our financial market data table is a great place to test various
[aggregate functions](/docs/query/functions/aggregation/), to compute price
over time intervals, and similar analysis.

Let's expand on the `quotes` and `instruments` tables.

First, let's look at `quotes`, running our shorthand for
`SELECT * FROM quotes;`:

```questdb-sql
quotes;
```

Let's then select the `count` of records from `quotes`:

```questdb-sql
SELECT count() FROM quotes;
```

| count      |
| :--------- |
| 10,000,000 |

And then the average price:

```questdb-sql
SELECT avg(price) FROM quotes;
```

| average         |
| :-------------- |
| 139.99217780895 |

We can now use the `instruments` table alongside the `quotes` table to get more
interesting results using a `JOIN`:

```questdb-sql
SELECT *
FROM quotes
JOIN(
    SELECT ID inst_id, exchange, sector
    FROM instruments)
ON quotes.instrument_id = inst_id;
```

The results should look like the table below:

| ID  | ts                          | price           | instrument_id | inst_id | exchange | sector     |
| :-- | :-------------------------- | :-------------- | :------------ | :------ | :------- | :--------- |
| 1   | 2019-10-17T00:00:00.000000Z | 146.47          | 3211          | 3211    | LSE      | Tech       |
| 2   | 2019-10-17T00:00:00.100000Z | 136.59          | 2319          | 2319    | NASDAQ   | Finance    |
| 3   | 2019-10-17T00:00:00.100000Z | 160.29          | 8723          | 8723    | NYSE     | Tech       |
| 4   | 2019-10-17T00:00:00.100000Z | 170.94          | 885           | 885     | HKEX     | Healthcare |
| 5   | 2019-10-17T00:00:00.200000Z | 149.34          | 3200          | 3200    | NASDAQ   | Energy     |
| 6   | 2019-10-17T00:00:01.100000Z | 160.95          | 4053          | 4053    | TSE      | Consumer   |

Note the timestamps returned as we've JOIN'd the tables together.

Let's try another type of aggregation:

```questdb-sql title="Aggregation keyed by sector"
SELECT sector, max(price)
FROM quotes
JOIN(
    SELECT ID inst_id, sector
    FROM instruments) a
ON quotes.instrument_id = a.inst_id;
```

The results should look like the table below:

| sector     | max             |
| :--------- | :-------------- |
| Tech       | 179.99998786398 |
| Finance    | 179.99998138348 |
| Energy     | 179.9999994818  |
| Healthcare | 179.99991705861 |
| Consumer   | 179.99999233377 |

Back to time, given we have one table (`quotes`) partitioned by time, let's
see what we can do when we JOIN the tables together to perform an aggregation
based on an hour of time:

```questdb-sql title="Aggregation by hourly time buckets"
SELECT ts, sector, exchange, avg(price)
FROM quotes timestamp(ts)
JOIN
    (SELECT ID inst_id, sector, exchange
    FROM instruments
    WHERE sector='Tech' AND exchange='NYSE') a
ON quotes.instrument_id = a.inst_id
WHERE ts IN '2019-10-21;1d' -- this is an interval between 2019/10/21 and the next day
SAMPLE BY 1h -- aggregation by hourly time buckets
ALIGN TO CALENDAR; -- align the ts with the start of the hour (hh:00:00)
```

The results should look like the table below:

| ts                          | sector | exchange | average         |
| :-------------------------- | :----- | :------- | :-------------- |
| 2019-10-21T00:00:00.000000Z | Tech   | NYSE     | 140.004285872   |
| 2019-10-21T00:01:00.000000Z | Tech   | NYSE     | 136.68436714    |
| 2019-10-21T00:02:00.000000Z | Tech   | NYSE     | 135.24368409    |
| 2019-10-21T00:03:00.000000Z | Tech   | NYSE     | 137.19398410    |
| 2019-10-21T00:04:00.000000Z | Tech   | NYSE     | 150.77868682    |
| ...                         | ...    | ...      | ...             |

For more information about these statements, please refer to the
[SELECT](/docs/query/sql/select/), [JOIN](/docs/query/sql/join/) and
[SAMPLE BY](/docs/query/sql/sample-by/) pages.

### Deleting tables

We can now clean up the demo data by using
[`DROP TABLE`](/docs/query/sql/drop/) SQL. Be careful using this statement
as QuestDB cannot recover data that is deleted in this way:

```questdb-sql
DROP TABLE quotes;
DROP TABLE instruments;
DROP TABLE trades;
```
