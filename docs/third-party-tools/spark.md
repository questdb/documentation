---
title: Apache Spark and Time-Series Analytics
sidebar_label: Spark
description:
  This document describes how to load data from QuestDB to Apache Spark for
  large-scale data engineering.
---

import InterpolateReleaseData from "../../src/components/InterpolateReleaseData"

High-level instructions for loading data from QuestDB to Spark and back.

## What is Spark?

[Apache Spark](https://spark.apache.org/) is an analytics engine for large-scale
data engineering and [stream processing](/glossary/stream-processing), well-known in the big data landscape. It is suitable for
executing data engineering, data science, and machine learning on single-node
machines or clusters.

## QuestDB Spark integration

A typical Spark application processes data in the following steps:

1.  Loading data from different sources
1.  Transforming and analyzing the data
1.  Saving the result to a data storage

Our example demonstrates these steps using QuestDB as the data source and
storage. It loads data from QuestDB into a Spark Dataframe; then the data is
enriched with new features, and eventually, it is written back into QuestDB.

## Prerequisites

- **Package manager**: This depends on your choice of OS. The below instructions
  are for macOS using [Homebrew](/docs/get-started/homebrew/).

- **QuestDB**: An instance must be running and accessible. You can do so from
  [Docker](/docs/get-started/docker/), the
  [binaries](/docs/get-started/binaries/), or
  [Homebrew](/docs/get-started/homebrew/).

## Installing Apache Spark

Spark can be installed and set up in many ways, depending on requirements.
Typically, it is part of a Big Data stack, installed on multiple nodes with an
external cluster manager, such as
[Yarn](https://hadoop.apache.org/docs/stable/hadoop-yarn/hadoop-yarn-site/YARN.html)
or [Apache Mesos](https://mesos.apache.org/). In this tutorial, we will work
with a single-node standalone Spark installation.

Spark has a multi-language environment. It is written in Scala, runs on the Java
Virtual Machine, and also integrates with R and Python. Our example is written
using Python. By running the below commands Spark will be installed with all
required dependencies:

```shell
brew install openjdk@11
brew install python@3.10
brew install scala
brew install apache-spark
```

The exact versions used for this example:

```shell
openjdk@11 11.0.12
python@3.10 3.10.10_1
scala 3.2.2
apache-spark 3.3.2
```

## Installing the JDBC driver

Spark communicates with QuestDB via JDBC, connecting to its Postgres Wire
Protocol endpoint. This requires the Postgres JDBC driver to be present.

- Create a working directory:

```shell
mkdir sparktest
cd sparktest
```

- Download the JDBC driver from [here](https://jdbc.postgresql.org/download/)
  into the working directory. The exact version used for this example:

```shell
postgresql-42.5.1.jar
```

## Setting up database tables

First, start QuestDB. If you are using Docker run the following command:

<InterpolateReleaseData
  renderText={(release) => (
    <CodeBlock className="language-shell">
      {
        `docker run -p 9000:9000 -p 8812:8812 questdb/questdb:${release.name}`
      }
    </CodeBlock>
  )}
/>

The port mappings allow us to connect to QuestDB's REST and PGWire endpoints.
The former is required for opening the Web Console, and the latter is used by
Spark to connect to the database.

Open the Web Console in your browser at `http://localhost:9000`.

Run the following SQL commands using the console:

```questdb-sql

CREATE TABLE trades (
  symbol SYMBOL,
  side SYMBOL,
  price DOUBLE,
  amount DOUBLE,
  timestamp TIMESTAMP
) timestamp (timestamp) PARTITION BY DAY;

CREATE TABLE trades_enriched (
  symbol SYMBOL,
  volume DOUBLE,
  mid DOUBLE,
  ts TIMESTAMP,
  ma10 DOUBLE,
  std DOUBLE
) timestamp (ts) PARTITION BY DAY;

INSERT INTO trades SELECT * FROM (
  SELECT 'BTC-USD' symbol,
  rnd_symbol('buy', 'sell') side,
  rnd_double() * 10000 price,
  rnd_double() amount,
  timestamp_sequence(1677628800000000, 10000000) ts
  FROM long_sequence(25920)
) timestamp (ts);
```

The `INSERT` command generates 3 days' worth of test data, and stores it in the
`trades` table.

## Feature engineering examples

Save the below Python code into a file called `sparktest.py` inside the working
directory:

```python
from pyspark.sql import SparkSession
from pyspark.sql.window import Window
from pyspark.sql.functions import avg, stddev, when

# create Spark session
spark = SparkSession.builder.appName("questdb_test").getOrCreate()

# load 1-minute aggregated trade data into the dataframe
df = spark.read.format("jdbc") \
    .option("url", "jdbc:postgresql://localhost:8812/questdb") \
    .option("driver", "org.postgresql.Driver") \
    .option("user", "admin").option("password", "quest") \
    .option("dbtable", "(SELECT symbol, sum(amount) as volume, "
                       "round((max(price)+min(price))/2, 2) as mid, "
                       "timestamp as ts "
                       "FROM trades WHERE symbol = 'BTC-USD' "
                       "SAMPLE BY 1m ALIGN to CALENDAR) AS mid_prices") \
    .option("partitionColumn", "ts") \
    .option("numPartitions", "3") \
    .option("lowerBound", "2023-03-01T00:00:00.000000Z") \
    .option("upperBound", "2023-03-04T00:00:00.000000Z") \
    .load()

# extract new features, clean data
window_10 = Window.partitionBy(df.symbol).rowsBetween(-10, Window.currentRow)
df = df.withColumn("ma10", avg(df.mid).over(window_10))
df = df.withColumn("std", stddev(df.mid).over(window_10))
df = df.withColumn("std", when(df.std.isNull(), 0.0).otherwise(df.std))

# save the data as 'trades_enriched', overwrite if already exists
df.write.format("jdbc") \
    .option("url", "jdbc:postgresql://localhost:8812/questdb") \
    .option("driver", "org.postgresql.Driver") \
    .option("user", "admin").option("password", "quest") \
    .option("dbtable", "trades_enriched") \
    .option("truncate", True) \
    .option("createTableColumnTypes", "volume DOUBLE, mid DOUBLE, ma10 DOUBLE, std DOUBLE") \
    .save(mode="overwrite")
```

This Spark application loads aggregated data from the `trades` table into a
Dataframe, then adds two new features, a 10-minute moving average and the
standard deviation. Finally, it writes the enriched data back into QuestDB and
saves it to the `trades_enriched` table.

## Run the example

Submit the application to Spark for execution using `spark-submit`:

```shell
spark-submit --jars postgresql-42.5.1.jar sparktest.py
```

The example requires the JDBC driver at runtime. This dependency is submitted to
Spark using the `--jars` option.

After the execution is completed, we can check the content of the
`trades_enriched` table:

```questdb-sql
SELECT * FROM trades_enriched;
```

The enriched data should be displayed in the Web Console.

## See also

For a more detailed explanation of the QuestDB Spark integration, please also
see our tutorial
[Integrate Apache Spark and QuestDB for Time-Series Analytics](/blog/integrate-apache-spark-questdb-time-series-analytics/#loading-data-to-spark/).
