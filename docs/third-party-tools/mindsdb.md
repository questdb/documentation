---
title: MindsDB
description:
  Guide for getting started in Machine Learning with MindsDB and QuestDB
---

[MindsDB](https://mindsdb.com/questdb-machine-learning/) provides Machine
Learning capabilities to enable predictive questions about your data. With
MindsDB:

- Developers can quickly add AI capabilities to their applications.
- Data scientists can streamline MLOps by deploying ML models as AI Tables.
- Data analysts can easily make forecasts on complex data, such as multivariate
  time-series with [high cardinality](/glossary/high-cardinality/), and visualize
  these in BI tools like Grafana, and Tableau.

Combining both MindsDB and QuestDB provides unbound prediction ability **with
SQL**.

This guide describes how to pre-process data in QuestDB and then access these
data from MindsDB to produce powerful ML models.

## Prerequisites

- [docker](https://docs.docker.com/): To create an image and run the container.
- mysql: The client we use to interact with MindsDB
  (`mysql -h 127.0.0.1 --port 47335 -u mindsdb -p`). Alternatively, use MindsDB
  web console at `http://localhost:47334/` instead.
- [Curl](https://curl.se/download.html): To upload data to QuestDB from a local
  CSV file.

## Instructions

The following are the overall steps to connect MindsDB and QuestDB:

1. Build a Docker image and spawn a container to run MindsDB and QuestDB
   together.
2. Add QuestDB as a datasource to MindsDB using a SQL Statement.
3. Create a table and add data for a simple ML use case using QuestDB's web
   console.
4. Connect to MindsDB using `mysql` as a client and write some SQL.

We have put together all the files needed in
[GH](https://github.com/questdb/mindsdb-tutorial).

### Running the Docker container

Clone the
[repository for this tutorial](https://github.com/questdb/mindsdb-tutorial). The
[Dockerfile](https://github.com/questdb/mindsdb-tutorial/blob/main/Dockerfile)
allows us to build an image with the following command:

```shell
docker build -t questdb/mindsdb:latest .
```

Then, start the service container `qmdb` with the following command:

```shell
docker run --rm \
    -p 8812:8812 \
    -p 9009:9009 \
    -p 9000:9000 \
    -p 8888:8888 \
    -p 47334:47334 \
    -p 47335:47335 \
    -d \
    --name qmdb \
    questdb/mindsdb:latest
```

The container is run as user `quest`. It takes about 10 seconds to become
responsive, logs can be followed in the terminal:

```shell
docker logs -f qmdb
...
http API: starting...
mysql API: starting...
mongodb API: starting...
...
mongodb API: started on 47336
mysql API: started on 47335
http API: started on 47334
```

The container has these mount points:

- **/home/quest**: User home directory.
- **~/questdb/**: QuestDB's root directory.
- **~/questdb/db/**: QuestDB's data root directory.
- **~/backups/**: Directory for backups.
- **~/csv/**: Directory for the `COPY` operation.
- **~/mindsdb/storage/**: MindsDB's data root directory.

The container is running `Debian GNU/Linux 11 (bullseye)` and exposes these
ports:

- 9000: QuestDB Web Console
- 8812: QuestDB pg-wire
- 9009: QuestDB InfluxDB Line Protocol ingress line protocol
- 47334: MindsDB WebConsole
- 47335: MindsDB mysql API
- 47336: MindsDB mongodb API

### Adding data to QuestDB

There are different ways to
[insert data to QuestDB](https://questdb.io/docs/develop/insert-data/).

#### SQL

We can access QuestDB's web console at `http://localhost:9000`.

Run the following SQL query to create a simple table:

```questdb-sql
CREATE TABLE IF NOT EXISTS house_rentals_data (
    number_of_rooms INT,
    number_of_bathrooms INT,
    sqft INT,
    location SYMBOL,
    days_on_market INT,
    initial_price FLOAT,
    neighborhood SYMBOL,
    rental_price FLOAT,
    ts TIMESTAMP
) TIMESTAMP(ts) PARTITION BY YEAR;
```

We could populate table house_rentals_data with random data:

```questdb-sql
INSERT INTO house_rentals_data SELECT * FROM (
    SELECT
        rnd_int(1,6,0),
        rnd_int(1,3,0),
        rnd_int(180,2000,0),
        rnd_symbol('great', 'good', 'poor'),
        rnd_int(1,20,0),
        rnd_float(0) * 1000,
        rnd_symbol('alcatraz_ave', 'berkeley_hills', 'downtown', 'south_side', 'thowsand_oaks', 'westbrae'),
        rnd_float(0) * 1000 + 500,
        timestamp_sequence(
            to_timestamp('2021-01-01', 'yyyy-MM-dd'),
            14400000000L
        )
    FROM long_sequence(100)
);
```

#### CURL command

The
[data CSV file](https://github.com/questdb/mindsdb-tutorial/blob/main/sample_house_rentals_data.csv)
can be downloaded to a local folder and uploaded to QuestDB using the following
command:

```shell
curl -F data=@sample_house_rentals_data.csv "http://localhost:9000/imp?forceHeader=true&name=house_rentals_data"
```

Either way, this gives us 100 data points, one every 4 hours, from
`2021-01-16T12:00:00.000000Z` (QuestDB's timestamps are UTC with microsecond
precision).

### Connect to MindsDB

We can connect to MindsDB with a standard mysql-wire-protocol compliant client
(no password, hit ENTER):

```shell
mysql -h 127.0.0.1 --port 47335 -u mindsdb -p
```

Alternatively, we can use MindsDB web console at `http://localhost:47334`:

From the terminal or the MindsDB web console, run the following command to check
the available databases:

```sql
SHOW DATABASES;
```

QuestDB is not shown in the result:

```shell
+--------------------+
| Database           |
+--------------------+
| mindsdb            |
| files              |
| information_schema |
+--------------------+
```

To see QuestDB as a database we need to add it to MindsDB:

```sql
CREATE DATABASE questdb
    WITH ENGINE = "questdb",
    PARAMETERS = {
        "user": "admin",
        "password": "quest",
        "host": "questdb",
        "port": "8812",
        "database": "questdb"
    };
```

Then, run `SHOW DATABASES;` should display both MindsDB and QuestDB:

```shell
+--------------------+
| Database           |
+--------------------+
| mindsdb            |
| files              |
| questdb            |
| information_schema |
+--------------------+
```

#### `questdb`

This is a read-only view on our QuestDB instance. We can query it leveraging the
full power of QuestDB's unique SQL syntax because statements are sent from
MindsDB to QuestDB without interpreting them. It only works for SELECT
statements:

```sql
SELECT * FROM questdb(
  SELECT
        ts, neighborhood,
            sum(days_on_market) DaysLive,
            min(rental_price) MinRent,
            max(rental_price) MaxRent,
            avg(rental_price) AvgRent
    FROM house_rentals_data
    WHERE ts BETWEEN '2021-01-08' AND '2021-01-10'
    SAMPLE BY 1d FILL (0, 0, 0, 0)
);
```

The result should be something like this:

```shell
+--------------+----------------+----------+----------+----------+--------------------+
| ts           | neighborhood   | DaysLive | MinRent  | MaxRent  | AvgRent            |
+--------------+----------------+----------+----------+----------+--------------------+
| 1610064000.0 | south_side     | 19       | 1285.338 | 1285.338 | 1285.338134765625  |
| 1610064000.0 | downtown       | 7        | 1047.14  | 1047.14  | 1047.1396484375    |
| 1610064000.0 | berkeley_hills | 17       | 727.52   | 727.52   | 727.5198974609375  |
| 1610064000.0 | westbrae       | 36       | 1038.358 | 1047.342 | 1042.85009765625   |
| 1610064000.0 | thowsand_oaks  | 5        | 1067.319 | 1067.319 | 1067.318603515625  |
| 1610064000.0 | alcatraz_ave   | 0        | 0.0      | 0.0      | 0.0                |
| 1610150400.0 | south_side     | 10       | 694.403  | 694.403  | 694.4031982421875  |
| 1610150400.0 | downtown       | 16       | 546.798  | 643.204  | 595.0011291503906  |
| 1610150400.0 | berkeley_hills | 4        | 1256.49  | 1256.49  | 1256.4903564453125 |
| 1610150400.0 | westbrae       | 0        | 0.0      | 0.0      | 0.0                |
| 1610150400.0 | thowsand_oaks  | 0        | 0.0      | 0.0      | 0.0                |
| 1610150400.0 | alcatraz_ave   | 14       | 653.924  | 1250.477 | 952.2005004882812  |
| 1610236800.0 | south_side     | 0        | 0.0      | 0.0      | 0.0                |
| 1610236800.0 | downtown       | 9        | 1357.916 | 1357.916 | 1357.9158935546875 |
| 1610236800.0 | berkeley_hills | 0        | 0.0      | 0.0      | 0.0                |
| 1610236800.0 | westbrae       | 0        | 0.0      | 0.0      | 0.0                |
| 1610236800.0 | thowsand_oaks  | 0        | 0.0      | 0.0      | 0.0                |
| 1610236800.0 | alcatraz_ave   | 0        | 0.0      | 0.0      | 0.0                |
+--------------+----------------+----------+----------+----------+--------------------+
```

Beyond SELECT statements, for instance when we need to save the results of a
query into a new table, we need to use QuestDB's web console available at
`http://localhost:9000/`:

```questdb-sql
CREATE TABLE sample_query_results AS (
    SELECT
        ts,
        neighborhood,
        sum(days_on_market) DaysLive,
        min(rental_price) MinRent,
        max(rental_price) MaxRent,
        avg(rental_price) AvgRent
    FROM house_rentals_data
    WHERE ts BETWEEN '2021-01-08' AND '2021-01-10'
    SAMPLE BY 1d FILL (0, 0, 0, 0)
) TIMESTAMP(ts) PARTITION BY MONTH;
```

#### `mindsdb`

Contains the metadata tables necessary to create ML models:

```sql
USE mindsdb;
SHOW TABLES;
```

```shell
+-------------------+
| Tables_in_mindsdb |
+-------------------+
| models            |
| models_versions   |
+-------------------+
```

### Create a predictor model

We can create a predictor model `mindsdb.home_rentals_model_ts` to predict the
`rental_price` for a neighborhood considering the past 20 days, and no
additional features:

```sql
CREATE PREDICTOR mindsdb.home_rentals_model_ts FROM questdb (
    SELECT
        neighborhood,
        rental_price,
        ts
    FROM house_rentals_data
)
PREDICT rental_price ORDER BY ts GROUP BY neighborhood
WINDOW 20 HORIZON 1;
```

This triggers MindsDB to create/train the model based on the full data available
from QuestDB's table `house_rentals_data` (100 rows) as a time series on the
column `ts`.

When status is complete, the model is ready for use; otherwise, we simply wait
while we observe MindsDB's logs. Creating/training a model will take time
proportional to the number of features, i.e. cardinality of the source table as
defined in the inner SELECT of the CREATE MODEL statement, and the size of the
corpus, i.e. number of rows. The model is a table in MindsDB:

```sql
SHOW TABLES;
```

The new table is displayed:

```shell
+-----------------------+
| Tables_in_mindsdb     |
+-----------------------+
| models                |
| models_versions       |
| home_rentals_model_ts |
+-----------------------+
```

### Describe the predictor model

We can get more information about the trained model, how was the accuracy
calculated or which columns are important for the model by executing the
`DESCRIBE MODEL` statement:

```sql
DESCRIBE MODEL mindsdb.home_rentals_model_ts;
```

```shell
*************************** 1. row ***************************
        accuracies: {'complementary_smape_array_accuracy':0.859}
           outputs: ['rental_price']
            inputs: ['neighborhood', 'ts', '__mdb_ts_previous_rental_price']
        datasource: home_rentals_model_ts
             model: encoders --> dtype_dict --> dependency_dict --> model --> problem_definition --> identifiers --> imputers --> accuracy_functions
```

Or, to see how the model encoded the data prior to training we can execute:

```sql
DESCRIBE MODEL mindsdb.home_rentals_model_ts.features;
```

```shell
+--------------+-------------+------------------+---------+
| column       | type        | encoder          | role    |
+--------------+-------------+------------------+---------+
| neighborhood | categorical | OneHotEncoder    | feature |
| rental_price | float       | TsNumericEncoder | target  |
| ts           | datetime    | ArrayEncoder     | feature |
+--------------+-------------+------------------+---------+
```

Additional information about the models and how they can be customized can be
found on the [Lightwood docs](https://lightwood.io/).

### Query MindsDB for predictions

The latest `rental_price` value per neighborhood in table
`questdb.house_rentals_data` can be obtained directly from QuestDB executing
query:

```sql
SELECT * FROM questdb (
    SELECT
        neighborhood,
        rental_price,
        ts
    FROM house_rentals_data
    LATEST BY neighborhood
);
```

```shell
+----------------+--------------+--------------+
| neighborhood   | rental_price | ts           |
+----------------+--------------+--------------+
| thowsand_oaks  | 1150.427     | 1610712000.0 |   (2021-01-15 12:00:00.0)
| south_side     | 726.953      | 1610784000.0 |   (2021-01-16 08:00:00.0)
| downtown       | 568.73       | 1610798400.0 |   (2021-01-16 12:00:00.0)
| westbrae       | 543.83       | 1610841600.0 |   (2021-01-17 00:00:00.0)
| berkeley_hills | 559.928      | 1610870400.0 |   (2021-01-17 08:00:00.0)
| alcatraz_ave   | 1268.529     | 1610884800.0 |   (2021-01-17 12:00:00.0)
+----------------+--------------+--------------+
```

To predict the next value:

```sql
SELECT
    tb.ts,
    tb.neighborhood,
    tb.rental_price as predicted_rental_price,
    tb.rental_price_explain as explanation
FROM questdb.house_rentals_data AS ta
JOIN mindsdb.home_rentals_model_ts AS tb
WHERE ta.ts > LATEST;
```

```shell
+---------------------+----------------+------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| ts                  | neighborhood   | predicted_rental_price | explanation                                                                                                                                                                              |
+---------------------+----------------+------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| 2021-01-17 00:00:00 | downtown       |      877.3007391233444 | {"predicted_value": 877.3007391233444, "confidence": 0.9991, "anomaly": null, "truth": null, "confidence_lower_bound": 379.43294697022424, "confidence_upper_bound": 1375.1685312764646} |
| 2021-01-19 08:00:00 | westbrae       |      923.1387395936794 | {"predicted_value": 923.1387395936794, "confidence": 0.9991, "anomaly": null, "truth": null, "confidence_lower_bound": 385.8327438509463, "confidence_upper_bound": 1460.4447353364124}  |
| 2021-01-15 16:00:00 | thowsand_oaks  |      1418.678199780345 | {"predicted_value": 1418.678199780345, "confidence": 0.9991, "anomaly": null, "truth": null, "confidence_lower_bound": 1335.4600013965369, "confidence_upper_bound": 1501.8963981641532} |
| 2021-01-17 12:00:00 | berkeley_hills |      646.5979284300436 | {"predicted_value": 646.5979284300436, "confidence": 0.9991, "anomaly": null, "truth": null, "confidence_lower_bound": 303.253838410034, "confidence_upper_bound": 989.9420184500532}    |
| 2021-01-18 12:00:00 | south_side     |       1422.69481363723 | {"predicted_value": 1422.69481363723, "confidence": 0.9991, "anomaly": null, "truth": null, "confidence_lower_bound": 129.97617491441304, "confidence_upper_bound": 2715.413452360047}   |
| 2021-01-18 04:00:00 | alcatraz_ave   |      1305.009073065412 | {"predicted_value": 1305.009073065412, "confidence": 0.9991, "anomaly": null, "truth": null, "confidence_lower_bound": 879.0232742685288, "confidence_upper_bound": 1730.994871862295}   |
+---------------------+----------------+------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
```

### Stop the container

To terminate the container, run:

```shell
docker stop qmdb
```

- [MindsDB GitHub](https://github.com/mindsdb/mindsdb)
- [MindsDB Documentation](https://docs.mindsdb.com/)
- [This tutorial's artefacts](https://github.com/questdb/mindsdb-tutorial/)
