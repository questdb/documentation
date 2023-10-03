---
title: Migrating from InfluxDB
description:
  This document describes details about steps to migrate your database from
  InfluxDB to QuestDB.
---

This page describes the steps to importing data from InfluxDB OSS or InfluxDB
Cloud to QuestDB.

## Overview

Data stored in InfluxDB needs to be exported in order to import it into QuestDB.
There are two ways of exporting data from InfluxDB:

- Run a SQL query using InfluxDB API and get results in JSON
- Run the `inspect` command and get results in InfluxDB Line Protocol

The first approach is simpler and might suffice if you are migrating a small to
moderate dataset. For larger datasets it is advised to use the second option.

## SQL query for importing small tables

:::note

This approach is recommended only for small to moderate datasets.

:::

When using InfluxDB API to run a SQL query, results will be in JSON. Since we
cannot import JSON files directly into QuestDB, we will need to convert the
results into CSV. There are many ways to do so, and one of those is using the
[jq JSON processor](https://stedolan.github.io/jq/).

To run the SQL query you will need to have an
[API token](https://docs.influxdata.com/influxdb/cloud/security/tokens/create-token/).

The below is an example to query a table using the SQL API endpoint and convert
the results to CSV:

```shell
curl --get http://localhost:8086/query --header "Authorization: Token zuotzwwBxbXIor4_D-t-BMEpJj1nAj2DGqNSshTUyHUcX0DMjI6fiBv_pgeW-xxpnAwgEVG0uJAucEaJKtvpJA==" --data-urlencode "db=bench" --data-urlencode "q=SELECT * from readings LIMIT 1000;" | jq '.results[].series[].values[] | @csv'
```

The resulting CSV can be then
[imported into QuestDB](/docs/guides/importing-data-rest/).

## The inspect command and InfluxDB Line Protocol for importing datasets at scale

To move data from InfluxDB into QuestDB at scale, it is best to use the
`influxd inspect` command to export the data, as the
[`export-lp`](https://docs.influxdata.com/influxdb/v2.6/reference/cli/influxd/inspect/export-lp/)
subcommand allows exporting all time-structured merge tree (TSM) data in a
bucket as InfluxDB Line Protocol messages in a big text file.

The text file can then be inserted into QuestDB. This assumes you are migrating
from self-managed InfluxDB and have access to execute the `inspect` command.

For InfluxDB Cloud users, the first step should be
[exporting the data from cloud to InfluxDB OSS](https://docs.influxdata.com/influxdb/cloud/migrate-data/migrate-cloud-to-oss/)
before following the instructions.

### Instructions

#### Generate admin token

Make sure you have an _admin token_ generated and set the env variable
export `INFLUX_TOKEN`.

For example:

```shell
export INFLUX_TOKEN=xyoczzmBxbXIor4_D-t-BMEpJj1nAj2DGqNSshTUyHUcX0DMjI6fiBv_pgeW-xxpnAwgEVG0uJAucEaJKtvpJA==
```

#### Find out your org_id and bucket_id

You need to know your org_id and bucket_id you will export. If you don’t know
them you can
issue `influx org list` and `influx bucket list --org-id YOUR_ID` to find those
values.

#### Export the bucket contents

Now you can just export the bucket contents by using `inspect export-lp` command
and by defining a destination folder:

```shell
influxd inspect export-lp --bucket-id YOUR_BUCKET_ID --output-path /var/tmp/influx/outputfolder
```

Please note the step above can take a while. As an example, it took almost an
hour for a 160G bucket on a mid-AWS EC2 instance.

#### Connect to QuestDB

Connect to your QuestDB instance and issue a
[CREATE TABLE](/docs/reference/sql/create-table/) statement. This is not
technically needed as once you start streaming data, your table will be
automatically created. However, this step is recommended because this allows
fine tuning some parameters such as column types or partition.

Since the data is already in InfluxDB Line Protocol format, there is no need to
use the official QuestDB client libraries for ingestion.

You only need to connect via a socket to your instance and stream row by row.

The below is an example Python code streaming the instance:

```python
import socket
import sys

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

def send_utf8(msg):
    print(msg)
    sock.sendall(msg.encode())

if __name__ == '__main__':
    try:
        sock.connect(('localhost', 9009))
        with open("ilp_influx_export.ilp") as infile:
            for line in infile:
                print(line)
                send_utf8(line)
    except socket.error as e:
        sys.stderr.write(f'Got error: {e}')
    sock.close()
```

#### Transform data in QuestDB

Since InfluxDB exports only one metric for each line, this means that if you are
storing more than one metric for the same series, one row will create multiple
InfluxDB Line Protocol lines with one valid metric value and the other metrics
shown as `NULL`. Therefore, we recommend transforming your data in QuestDB.

For example, if you query a table with several metrics:

```questdb-sql
SELECT * FROM diagnostics WHERE timestamp = '2016-01-01T00:00:00.000000Z' AND driver='Andy' AND name='truck_150')
```

Your result may be something like this:

![Screenshot of the query result where each metric forms one line with NULL for other metrics](/img/docs/guide/one-metric.png)

A way to solve this is to execute a SQL query grouping data by all the
dimensions and selecting the maximum values for all the metrics:

```questdb-sql
SELECT
  timestamp,
  device_version,
  driver,
  fleet,
  model,
  name,
  max(current_load) AS current_load,
  max(fuel_capacity) AS fuel_capacity,
  max(fuel_state) AS fuel_state,
  max(load_capacity) AS load_capacity,
  max(nominal_fuel_consumption) AS nominal_fuel_consumption,
  max(status) AS status
FROM
  diagnostics;
```

This produces aggregated rows containing all the metrics for each dimension
group:

![Screenshot of the query result showing aggregated rows based on the SQL query](/img/docs/guide/adjusted-metric.png)

You can use the [INSERT](/docs/reference/sql/insert/) keyword to output the
processed result into a new table.

## See also

- [Comparing InfluxDB and QuestDB databases](/blog/2021/11/29/questdb-versus-influxdb/)
