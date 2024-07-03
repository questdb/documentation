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
Telegraf, Kafka, or Prometheus. If your interest lies in data ingestion rather
than generation, refer to our [ingestion overview](/docs/ingestion-overview/).
Alternatively, the [QuestDB demo instance](https://demo.questdb.io) offers a
practical way to explore data creation and manipulation without setting up your
dataset.

All that said, in this tutorial you will learn how to:

1. [Create tables](#creating-a-table)
2. [Populate tables with sample data](#inserting-data)
3. [Run simple and advanced queries](#running-queries)
4. [Delete tables](#deleting-tables)

### Before we begin...

All commands are run through the [Web Console](/docs/web-console/) accessible at
[http://localhost:9000](http://localhost:9000).

You can also run the same SQL via the
[Postgres endpoint](/docs/reference/api/postgres/) or the
[REST API](/docs/reference/api/rest/).

If QuestDB is not running locally, checkout the
[quick start](/docs/quick-start/).

### Creating a table

With QuestDB running, the first step is to create a table.

We'll start with one representing financial market data. Then in the insert
section, we'll create another pair of tables representing temperature sensors
and their readings.

Let's start by creating the `ticker_price` table:

```questdb-sql
CREATE TABLE ticker_price (
    ts TIMESTAMP,
    ticker SYMBOL,
    side SYMBOL,
    price DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY WAL
DEDUP UPSERT KEYS(ts, ticker);
```

This is a basic yet robust table. It applies [SYMBOL](/docs/concept/symbol/)s
for ticker and side, a price, and a
[designated timestamp](/docs/concept/designated-timestamp/). It's
[partitioned by day](/docs/concept/partitions/), is a
[WAL table](/docs/concept/write-ahead-log/), and
[deduplicates](/docs/concept/deduplication/) the timestamp and ticker columns.
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

Let's populate our `ticker_price` table with procedurally-generated data:

```questdb-sql title="Insert as SELECT"
INSERT INTO ticker_price
    SELECT
        timestamp_sequence('2023-01-01T00:00:00', 60000L * x) ts, -- Generate a timestamp every minute starting from Jan 1, 2023
        rnd_str('AAPL', 'GOOGL', 'MSFT', 'AMZN', 'FB') ticker, -- Random ticker symbols
        rnd_str('BUY', 'SELL') side, -- Random side (BUY or SELL)
        rnd_double() * 100 + 10 price -- Random price between 10.0 and 110.0
    FROM long_sequence(10000) x;
```

Our `ticker_price` table now contains 10,000 randomly-generated trades. The
comments indicate how we've structured our random data. We picked a few
companies, BUY vs. SELL, and created a timestamp every minute. We've dictated
the overall number of rows generated via `long_sequence(10000)`. We can bump
that up, if we want.

We've also conservatively generated a timestamp per minute, even though in
reality trades against these companies are likely much more frequent. This helps
keep our basic examples basic.

Now let's look at the table and its data:

```questdb-sql
'ticker_price';
```

It will look similar to this, albeit with alternative randomized values.

| ts                          | ticker | side | price           |
| --------------------------- | ------ | ---- | --------------- |
| 2023-01-01T00:00:00.000000Z | AAPL   | SELL | 91.166295916161 |
| 2023-01-01T00:00:00.060000Z | AMZN   | SELL | 68.260944075324 |
| 2023-01-01T00:00:00.180000Z | FB     | SELL | 99.29323755252  |
| 2023-01-01T00:00:00.360000Z | MSFT   | BUY  | 57.891314056011 |
| 2023-01-01T00:00:00.600000Z | AAPL   | SELL | 10.249165832651 |

That's some fake market data. What about, say, sensor data?

### Sensors and readings

This next example will create and populate two more tables. One table will
contain the metadata of our sensors, and the other will contain the actual
readings (payload data) from these sensors. In both cases, we will create the
table and generate the data at the same time.

This combines the CREATE & SELECT operations to perform a create-and-insert:

```questdb-sql title="Create table as, readings"
CREATE TABLE readings
AS(
    SELECT
        x ID,
        timestamp_sequence(to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss'), rnd_long(1,10,0) * 100000L) ts,
        rnd_double(0)*8 + 15 temp,
        rnd_long(0, 10000, 0) sensorId
    FROM long_sequence(10000000) x)
TIMESTAMP(ts)
PARTITION BY MONTH DEDUP UPSERT KEYS(ts);
```

For our table, we've again hit the following key notes:

- `TIMESTAMP(ts)` elects the `ts` column as a
  [designated timestamp](/docs/concept/designated-timestamp/) for partitioning
  over time.
- `PARTITION BY MONTH` creates a monthly partition, where the stored data is
  effectively sharded by month.
- `DEDUP UPSERT KEYS(ts)` deduplicates the timestamp column

The generated data will look like the following:

| ID  | ts                          | temp        | sensorId |
| :-- | :-------------------------- | :---------- | :------- |
| 1   | 2019-10-17T00:00:00.000000Z | 19.37373911 | 9160     |
| 2   | 2019-10-17T00:00:00.600000Z | 21.91184617 | 9671     |
| 3   | 2019-10-17T00:00:01.400000Z | 16.58367834 | 8731     |
| 4   | 2019-10-17T00:00:01.500000Z | 16.69308815 | 3447     |
| 5   | 2019-10-17T00:00:01.600000Z | 19.67991569 | 7985     |
| ... | ...                         | ...         | ...      |

Nice - and our next table, which includes the sensors themselves and their
detail:

```questdb-sql title="Create table as, sensors"
CREATE TABLE sensors
AS(
    SELECT
        x ID, -- Increasing integer
        rnd_str('Eberle', 'Honeywell', 'Omron', 'United Automation', 'RS Pro') make, -- Random manufacturer
        rnd_str('New York', 'Miami', 'Boston', 'Chicago', 'San Francisco') city -- Random city
    FROM long_sequence(10000) x)
```

Note that we've not included a timestamp in this sensors column. This is one of
the rare, demonstrative examples where we're not including it, and thus not
taking advantage of the bulk of the benefits received via time-series
optimization. As we have a timestamp in the paired `readings` table, it's
helpful to demonstrate them as a pair.

With these two new tables, and our prior financial market data table, we've got
a lot of useful queries we can test.

### Running queries

Our financial market data table is a great place to test various
[aggregate functions](/docs/reference/function/aggregation/), to compute price
over time intervals, and similar anaylsis.

However, we'll expand on the `readings` \* `sensors` tables.

First, let's look at `readings`, running our shorthand for
`SELECT * FROM readings;`:

```questdb-sql
readings;
```

Let's then select the `count` of records from `readings`:

```questdb-sql
SELECT count() FROM readings;
```

| count      |
| :--------- |
| 10,000,000 |

And then the average reading:

```questdb-sql
SELECT avg(temp) FROM readings;
```

| average         |
| :-------------- |
| 18.999217780895 |

We can now use the `sensors` table alongside the `readings` table to get more
interesting results using a `JOIN`:

```questdb-sql
SELECT *
FROM readings
JOIN(
    SELECT ID sensId, make, city
    FROM sensors)
ON readings.sensorId = sensId;
```

The results should look like the table below:

| ID  | ts                          | temp            | sensorId | sensId | make      | city          |
| :-- | :-------------------------- | :-------------- | :------- | :----- | :-------- | :------------ |
| 1   | 2019-10-17T00:00:00.000000Z | 16.472200460982 | 3211     | 3211   | Omron     | New York      |
| 2   | 2019-10-17T00:00:00.100000Z | 16.598432033599 | 2319     | 2319   | Honeywell | San Francisco |
| 3   | 2019-10-17T00:00:00.100000Z | 20.293681747009 | 8723     | 8723   | Honeywell | New York      |
| 4   | 2019-10-17T00:00:00.100000Z | 20.939263119843 | 885      | 885    | RS Pro    | San Francisco |
| 5   | 2019-10-17T00:00:00.200000Z | 19.336660059029 | 3200     | 3200   | Honeywell | San Francisco |
| 6   | 2019-10-17T00:00:01.100000Z | 20.946643576954 | 4053     | 4053   | Honeywell | Miami         |

Note the timestamps returned as we've JOIN'd the tables together.

Let's try another type of aggregation:

```questdb-sql title="Aggregation keyed by city"
SELECT city, max(temp)
FROM readings
JOIN(
    SELECT ID sensId, city
    FROM sensors) a
ON readings.sensorId = a.sensId;
```

The results should look like the table below:

| city          | max             |
| :------------ | :-------------- |
| New York      | 22.999998786398 |
| San Francisco | 22.999998138348 |
| Miami         | 22.99999994818  |
| Chicago       | 22.999991705861 |
| Boston        | 22.999999233377 |

Back to time, given we have one table (`readings`) partitioned by time, let's
see what we can do when we JOIN the tables together to perform an aggregation
based on an hour of time:

```questdb-sql title="Aggregation by hourly time buckets"
SELECT ts, city, make, avg(temp)
FROM readings timestamp(ts)
JOIN
    (SELECT ID sensId, city, make
    FROM sensors
    WHERE city='Miami' AND make='Omron') a
ON readings.sensorId = a.sensId
WHERE ts IN '2019-10-21;1d' -- this is an interval between 2019/10/21 and the next day
SAMPLE BY 1h -- aggregation by hourly time buckets
ALIGN TO CALENDAR; -- align the ts with the start of the hour (hh:00:00)
```

The results should look like the table below:

| ts                          | city  | make  | average         |
| :-------------------------- | :---- | :---- | :-------------- |
| 2019-10-21T00:00:00.000000Z | Miami | Omron | 20.004285872098 |
| 2019-10-21T00:01:00.000000Z | Miami | Omron | 16.68436714013  |
| 2019-10-21T00:02:00.000000Z | Miami | Omron | 15.243684089291 |
| 2019-10-21T00:03:00.000000Z | Miami | Omron | 17.193984104315 |
| 2019-10-21T00:04:00.000000Z | Miami | Omron | 20.778686822666 |
| ...                         | ...   | ...   | ...             |

For more information about these statements, please refer to the
[SELECT](/docs/reference/sql/select/), [JOIN](/docs/reference/sql/join/) and
[SAMPLE BY](/docs/reference/sql/sample-by/) pages.

### Deleting tables

We can now clean up the demo data by using
[`DROP TABLE`](/docs/reference/sql/drop/) SQL. Be careful using this statement
as QuestDB cannot recover data that is deleted in this way:

```questdb-sql
DROP TABLE readings;
DROP TABLE sensors;
DROP TABLE ticker_price;
```
