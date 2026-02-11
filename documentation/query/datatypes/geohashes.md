---
title: Geospatial data
description:
  This document describes how to work with geohashes as geospatial types in
  QuestDB, including hints on converting back and forth from latitude and
  longitude, inserting via SQL, InfluxDB line protocol, CSV, and more.
---

QuestDB adds support for working with geospatial data through a `geohash` type.
This page describes how to use geohashes, with an overview of the syntax,
including hints on converting from latitude and longitude, inserting via SQL,
InfluxDB line protocol, and via Java embedded API.

To facilitate working with this data type,
[spatial functions](/docs/query/functions/spatial/) and
[operators](/docs/query/operators/spatial/) have been added to help with
filtering and generating data.

## Geohash description

A geohash is a convenient way of expressing a location using a short
alphanumeric string, with greater precision obtained with longer strings. The
basic idea is that the Earth is divided into grids of defined size, and each
area is assigned a unique id called its Geohash. For a given location on Earth,
we can convert latitude and longitude as
[the approximate center point](https://en.wikipedia.org/wiki/Geohash#Limitations_when_used_for_deciding_proximity)
of a grid represented by a geohash string. This string is the Geohash and will
determine which of the predefined regions the point belongs to.

In order to be compact, [base32](https://en.wikipedia.org/wiki/Base32#Geohash)
is used as a representation of Geohashes, and is therefore comprised of:

- all decimal digits (0-9) and
- almost all of the alphabet (case-insensitive) **except "a", "i", "l", "o"**.

The following figure illustrates how increasing the length of a geohash result
in a higher-precision grid size:

import Screenshot from "@theme/Screenshot"

<Screenshot
  alt="An illustration showing three maps with different geohash precision levels applied"
  height={598}
  src="images/docs/geohashes/increasing-precision.webp"
  width={850}
/>

## QuestDB geohash type

Geohash column types are represented in QuestDB as `geohash(<precision>)`.
Precision is specified in the format `n{units}` where `n` is a numeric
multiplier and `units` may be either `c` for char or `b` for bits (`c` being
shorthand for 5 x `b`).

The following example shows basic usage of geohashes by creating a column of 5
`char` precision, 29 bits of precision, and inserting geohash values into these
columns:

```questdb-sql
CREATE TABLE geo_data (g5c geohash(5c), g29b geohash(29b));
INSERT INTO geo_data VALUES(#u33d8, ##10101111100101111111101101101)
-- Querying by geohash
SELECT * FROM geo_data WHERE g5c = #u33d8;
```

It's not possible to store variable size geohashes within a column, therefore
the size and precision of a geohash must be known beforehand. Shorter-precision
geohashes **cannot be inserted** into longer-precision columns as all bits are
significant. Details on the size of geohashes is described in the
[geohash precision](#specifying-geohash-precision) section below. Additionally,
`NULL` is supported as a separate value for geohash columns of all precision.

### Geohash literals

Geohashes have a literal syntax which starts with the hash `#` symbol followed
by up to 12 chars, i.e.:

```questdb-sql
INSERT INTO my_geo_data VALUES(#u33, #u33d8b12)
```

Geohash literals with a single hash (`#`) may include a suffix in the format
`/{bits}` where `bits` is the number of bits from 1-60 to allow for further
granularity of the geohash size. This is useful if a specific precision is
desired on the column size, but the values being inserted are using a char
notation:

```questdb-sql
-- insert a 5-bit geohash into a 4 bit column
INSERT INTO my_geo_data VALUES(#a/4)
-- insert a 20-bit geohash into an 18 bit column
INSERT INTO my_geo_data VALUES(#u33d/18)
```

The binary equivalent of geohashes may be expressed with two hash symbols (`##`)
followed by up to 60 bits:

```questdb-sql
INSERT INTO my_geo_data VALUES(##0111001001001001000111000110)
```

Implicit casts from strings to literal geohashes is possible, but less efficient
as string conversion to geohash must be performed:

```questdb-sql
INSERT INTO my_geo_data VALUES(#u33, #u33d8b12)
-- equivalent to
INSERT INTO my_geo_data VALUES('u33', 'u33d8b12')
```

`NULL` values reserve 1 bit which means 8-bit geohashes are stored in 9-bits as
`short`s internally.

### Specifying geohash precision

The size of the `geohash` type may be:

- 1 to 12 chars or
- 1 to 60 bits

The following table shows all options for geohash precision using `char`s and
the calculated area of the grid the geohash refers to:

| Type           | Example         | Area              |
| -------------- | --------------- | ----------------- |
| `geohash(1c)`  | `#u`            | 5,000km × 5,000km |
| `geohash(2c)`  | `#u3`           | 1,250km × 625km   |
| `geohash(3c)`  | `#u33`          | 156km × 156km     |
| `geohash(4c)`  | `#u33d`         | 39.1km × 19.5km   |
| `geohash(5c)`  | `#u33d8`        | 4.89km × 4.89km   |
| `geohash(6c)`  | `#u33d8b`       | 1.22km × 0.61km   |
| `geohash(7c)`  | `#u33d8b1`      | 153m × 153m       |
| `geohash(8c)`  | `#u33d8b12`     | 38.2m × 19.1m     |
| `geohash(9c)`  | `#u33d8b121`    | 4.77m × 4.77m     |
| `geohash(10c)` | `#u33d8b1212`   | 1.19m × 0.596m    |
| `geohash(11c)` | `#u33d8b12123`  | 149mm × 149mm     |
| `geohash(12c)` | `#u33d8b121234` | 37.2mm × 18.6mm   |

For geohashes with size determined by `b` for bits, the following table compares
the precision of some geohashes with units expressed in bits compared to chars:

| Type (char)    | Equivalent to  |
| -------------- | -------------- |
| `geohash(1c)`  | `geohash(5b)`  |
| `geohash(6c)`  | `geohash(30b)` |
| `geohash(12c)` | `geohash(60b)` |

### Casting geohashes

Explicit casts are not necessary, but given certain constraints, it may be
required to cast from strings to geohashes. Empty strings are cast as `null` for
geohash values which are stored in the column with all bits set:

```questdb-sql
INSERT INTO my_geo_data VALUES(cast({my_string} as geohash(8c))
```

It may be desirable to cast as geohashes in the circumstance where a table with
a desired schema should be created such as the following query. Note that the
use of `WHERE 1 != 1` means that no rows are inserted, only the table schema is
prepared:

```questdb-sql
CREATE TABLE new_table AS (
SELECT cast(null AS geohash(4c)) gh4c
FROM source_table WHERE 1 != 1
)
```

Geohash types can be cast from higher to lower precision, but not from lower to
higher precision:

```questdb-sql
-- The following cast is valid:
CAST(
     #123
     AS geohash(1c))
-- Invalid (low-to-high precision):
CAST(
     #123
     AS geohash(4c))
```

### make_geohash() function

Need to create a geohash? Use `make_geohash()`

Returns a geohash equivalent of latitude and longitude, with precision specified
in bits.

```questdb-sql title="make_geohash(lat,long,bits)" demo
SELECT make_geohash(142.89124148, -12.90604153, 40)
```

Returns:

```
rjtwedd0
```

Use this function via:

- SQL over HTTP
- PostgreSQL wire protocol
- [Java embedded usage](/docs/query/datatypes/geohashes/#java-embedded-usage) scenario

For more information on the `make_geohash()` function, see the
[Spatial functions](/docs/query/functions/spatial/#make_geohash) page.

## SQL examples

The following queries create a table with two `geohash` type columns of varying
precision and insert geohashes as string values:

```questdb-sql
CREATE TABLE my_geo_data (g1c geohash(1c), g8c geohash(8c));
INSERT INTO my_geo_data values(#u, #u33d8b12);
```

Larger-precision geohashes are truncated when inserted into smaller-precision
columns, and inserting smaller-precision geohases into larger-precision columns
produces an error, i.e.:

```questdb-sql
-- SQL will execute successfully with 'u33d8b12' truncated to 'u'
INSERT INTO my_geo_data values(#u33d8b12, #eet531sq);
-- ERROR as '#e' is too short to insert into 8c_geohash column
INSERT INTO my_geo_data values(#u, #e);
```

Performing geospatial queries is done by checking if geohash values are equal to
or within other geohashes. Consider the following table:

```questdb-sql
CREATE TABLE geo_data
  (ts timestamp,
  device_id symbol,
  g1c geohash(1c),
  g8c geohash(8c)),
index(device_id) timestamp(ts);
```

This creates a table with a `symbol` type column as an identifier and we can
insert values as follows:

```questdb-sql
INSERT INTO geo_data values(now(), 'device_1', #u, #u33d8b12);
INSERT INTO geo_data values(now(), 'device_1', #u, #u33d8b18);
INSERT INTO geo_data values(now(), 'device_2', #e, #ezzn5kxb);
INSERT INTO geo_data values(now(), 'device_1', #u, #u33d8b1b);
INSERT INTO geo_data values(now(), 'device_2', #e, #ezzn5kxc);
INSERT INTO geo_data values(now(), 'device_3', #e, #u33dr01d);
```

This table contains the following values:

| ts                          | device_id | g1c | g8c      |
| --------------------------- | --------- | --- | -------- |
| 2021-09-02T14:20:04.669312Z | device_1  | u   | u33d8b12 |
| 2021-09-02T14:20:06.553721Z | device_1  | u   | u33d8b12 |
| 2021-09-02T14:20:07.095639Z | device_1  | u   | u33d8b18 |
| 2021-09-02T14:20:07.721444Z | device_2  | e   | ezzn5kxb |
| 2021-09-02T14:20:08.241489Z | device_1  | u   | u33d8b1b |
| 2021-09-02T14:20:08.807707Z | device_2  | e   | ezzn5kxc |
| 2021-09-02T14:20:09.280980Z | device_3  | e   | u33dr01d |

We can check if the last-known location of a device is a specific geohash with
the following query which will return an exact match based on geohash:

```questdb-sql
SELECT * FROM geo_data
WHERE g8c = #u33dr01d
LATEST ON ts PARTITION BY device_id
```

| ts                          | device_id | g1c | g8c      |
| --------------------------- | --------- | --- | -------- |
| 2021-09-02T14:20:09.280980Z | device_3  | e   | u33dr01d |

### First and last functions

The use of `first()` and `last()` functions within geospatial queries has been
significantly optimized so that common types of queries relating to location are
improved. This means that queries such as "last-known location" by indexed
column for a given time range or sample bucket is specifically optimized for
query speed over large datasets:

```questdb-sql
SELECT ts, last(g8c) FROM geo_data WHERE device_id = 'device_3';
-- first and last locations sample by 1 hour:
SELECT ts, last(g8c), first(g8c) FROM geo_data
WHERE device_id = 'device_3' sample by 1h;
```

### Within operator

The `within` operator can be used as a prefix match to evaluate if a geohash is
equal to or is within a larger grid.

It can only be applied in `LATEST ON` queries and all symbol columns within the
query **must be indexed**.

The following query will return the most recent entries by device ID if the
`g8c` column contains a geohash within `u33d`:

```questdb-sql title="LATEST BY usage"
SELECT * FROM geo_data
WHERE g8c within(#u33d)
LATEST ON ts PARTITION BY device_id;
```

| ts                          | device_id | g1c | g8c      |
| --------------------------- | --------- | --- | -------- |
| 2021-09-02T14:20:08.241489Z | device_1  | u   | u33d8b1b |
| 2021-09-02T14:20:09.280980Z | device_3  | e   | u33dr01d |

For more information on the use of this operator, see the
[spatial operators](/docs/query/operators/spatial/) reference.

## Java embedded usage

Geohashes are inserted into tables via Java (embedded) QuestDB instance through
the selected `Writer`'s `putGeoHash` method. The `putGeoHash` method accepts
`LONG` values natively with the destination precision. Additionally,
`GeoHashes.fromString` may be used for string conversion, but comes with some
performance overhead as opposed to `long` values directly.

Depending on whether the table is a [WAL](/docs/concepts/write-ahead-log/) table
or not, the following components may be used:

- `TableWriter` is used to write data directly into a table.
- `WalWriter` is used to write data into a WAL-enabled table via WAL.
- `TableWriterAPI` is used for both WAL and non-WAL tables, as it requests the
  suitable `Writer` based on the table metadata.

```java title="TableWriter"
// Insert data into a non-WAL table:
final TableToken tableToken = engine.getTableToken("geohash_table");
try (TableWriter writer = engine.getTableWriter(ctx.getCairoSecurityContext(), tableToken, "test")) {
  for (int i = 0; i < 10; i++) {
      TableWriter.Row row = writer.newRow();
      row.putSym(0, "my_device");
      // putGeoStr(columnIndex, hash)
      row.putGeoStr(1, "u33d8b1b");
      // putGeoHashDeg(columnIndex, latitude, longitude)
      row.putGeoHashDeg(2, 48.669, -4.329)
      row.append();
  }
  writer.commit();
}

```

```java title="WalWriter"
// Insert data into a WAL table:
final TableToken tableToken = engine.getTableToken("geohash_table");
try (WalWriter writer = engine.getWalWriter(ctx.getCairoSecurityContext(), tableToken)) {
    for (int i = 0; i < 10; i++) {
        TableWriter.Row row = writer.newRow();
        row.putSym(0, "my_device");
        // putGeoStr(columnIndex, hash)
        row.putGeoStr(1, "u33d8b1b");
        // putGeoHashDeg(columnIndex, latitude, longitude)
        row.putGeoHashDeg(2, 48.669, -4.329)
        row.append();
    }
    writer.commit();

    // Apply WAL to the table
    try (ApplyWal2TableJob walApplyJob = new ApplyWal2TableJob(engine, 1, 1)) {
        while (walApplyJob.run(0));
    }
}

```

```java title="TableWriterAPI"
// Insert table into either a WAL or a non-WAL table:
final TableToken tableToken = engine.getTableToken("geohash_table");
try (TableWriterAPI writer = engine.getTableWriterAPI(ctx.getCairoSecurityContext(), tableToken, "test")) {
    for (int i = 0; i < 10; i++) {
        TableWriter.Row row = writer.newRow();
        row.putSym(0, "my_device");
        // putGeoStr(columnIndex, hash)
        row.putGeoStr(1, "u33d8b1b");
        // putGeoHashDeg(columnIndex, latitude, longitude)
        row.putGeoHashDeg(2, 48.669, -4.329)
        row.append();
    }
    writer.commit();

    // Apply WAL to the table
    try (ApplyWal2TableJob walApplyJob = new ApplyWal2TableJob(engine, 1, 1)) {
        while (walApplyJob.run(0));
    }
}
```

Reading geohashes via Java is done by means of the following methods:

- `Record.getGeoByte(columnIndex)`
- `Record.getGeoShort(columnIndex)`
- `Record.getGeoInt(columnIndex)`
- `Record.getGeoLong(columnIndex)`

Therefore it's necessary to know the type of the column beforehand through
column metadata by index:

```java
ColumnType.tagOf(TableWriter.getMetadata().getColumnType(columnIndex));
```

Invoking the method above will return one of the following:

- `ColumnType.GEOBYTE`
- `ColumnType.GEOSHORT`
- `ColumnType.GEOINT`
- `ColumnType.GEOLONG`

For more information and detailed examples of using table readers and writers,
see the [Java API documentation](/docs/ingestion/java-embedded/).

## InfluxDB Line Protocol

Geohashes may also be inserted via InfluxDB Line Protocol by the following
steps:

1. Create a table with columns of geohash type beforehand:

```questdb-sql
CREATE TABLE tracking (ts timestamp, geohash geohash(8c));
```

2. Insert via InfluxDB Line Protocol using the `geohash` field:

```bash
tracking geohash="46swgj10"
```

:::note

The InfluxDB Line Protocol parser does not support geohash literals, only
strings. This means that table columns of type `geohash` type with the desired
precision must exist before inserting rows with this protocol.

If a value cannot be converted or is omitted it will be set as `NULL`

:::

Inserting geohashes with larger precision than the column it is being inserted
into will result in the value being truncated, for instance, given a column with
`8c` precision:

```bash
# Inserting the following line
geo_data geohash="46swgj10r88k"
# Equivalent to truncating to this value:
geo_data geohash="46swgj10"
```

## CSV import

Geohashes may also be inserted via
[REST API](/docs/ingestion/import-csv/#import-csv-via-rest). In order to perform
inserts in this way;

1. Create a table with columns of geohash type beforehand:

```questdb-sql
CREATE TABLE tracking (ts timestamp, geohash geohash(8c));
```

Note that you may skip this step, if you specify column types in the `schema`
JSON object.

2. Import the CSV file via REST API using the `geohash` field:

```bash
curl -F data=@tracking.csv 'http://localhost:9000/imp?name=tracking'
```

The `tracking.csv` file's contents may look like the following:

```csv
ts,geohash
17/01/2022 01:02:21,46swgj10
```

Just like InfluxDB Line Protocol, CSV import supports geohash strings only, so
the same restrictions apply.

## The PostgreSQL wire protocol

Geohashes may also be used over Postgres wire protocol as other data types. When
querying geohash values over Postgres wire protocol, QuestDB always returns
geohashes in text mode (i.e. as strings) as opposed to binary

The Python example below demonstrates how to connect to QuestDB over postgres
wire, insert and query geohashes. It uses the
[psycopg3](https://www.psycopg.org/psycopg3/docs/) adapter.

To install `psycopg3`, use `pip`:

```shell
python3 -m pip install "psycopg[binary]"
```

```python
import psycopg as pg
import time
# Connect to an existing QuestDB instance
conn_str = 'user=admin password=quest host=127.0.0.1 port=8812 dbname=qdb'
with pg.connect(conn_str, autocommit=True) as connection:
    # Open a cursor to perform database operations
    with connection.cursor() as cur:
      cur.execute('''
        CREATE TABLE IF NOT EXISTS geo_data (
          ts timestamp,
          device_id symbol index,
          g1c geohash(1c),
          g8c geohash(8c)
          )
          timestamp(ts);
          ''')
      print('Table created.')

      cur.execute("INSERT INTO geo_data values(now(), 'device_1', 'u', 'u33d8b12');")
      cur.execute("INSERT INTO geo_data values(now(), 'device_1', 'u', 'u33d8b18');")
      cur.execute("INSERT INTO geo_data values(now(), 'device_2', 'e', 'ezzn5kxb');")
      cur.execute("INSERT INTO geo_data values(now(), 'device_3', 'e', 'u33dr01d');")
      print('Data in geo_data table:')
      cur.execute('SELECT * FROM geo_data;')
      records = cur.fetchall()
      for row in records:
        print(row)
      print('Records within the "u33d" geohash:')
      cur.execute('SELECT * FROM geo_data WHERE g8c within(#u33d) LATEST ON ts PARTITION BY device_id;')
      records = cur.fetchall()
      for row in records:
          print(row)
```
