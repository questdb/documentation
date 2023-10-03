---
title: CSV import via COPY SQL
sidebar_label: Large CSV import
description:
  This document describes how to load large CSV data using COPY SQL keyword.
---

The [COPY](/docs/reference/sql/copy/) SQL command is the preferred way to import
large CSV files into partitioned tables. It should be used to migrate data from
another database into QuestDB. This guide describes the method of migrating data
to QuestDB via CSV files. For the time being this is the only way to migrate
data from other databases into QuestDB.

This guide is applicable for QuestDB version 6.5 and higher.

:::caution

For partitioned tables, the best `COPY` performance can be achieved only on a
machine with a local, physically attached SSD. It is possible to use a network
block storage, such as an AWS EBS volume to perform the operation, with the
following impact:

- Users need to configure the maximum IOPS and throughput setting values for the
  volume.
- The required import time is likely to be 5-10x longer.

:::

## Prepare the import

Preparation is key. Import is a multi-step process, which consists of:

- Export the existing database as CSV files
- Enable and configure `COPY` command to be optimal for the system
- Prepare target schema in QuestDB

### Export the existing database

Export data using one CSV file per table. Make sure to export a column, which
can be used as timestamp. Data in CSV is not expected to be in any particular
order. If it is not possible to export the table as one CSV, export multiple
files and concatenate these files before importing into QuestDB.

#### Concatenate multiple CSV files

The way to concatenate files depends on whether the CSV files have headers.

For CSV files without headers, concatenation is straightforward:

<!-- prettier-ignore-start -->

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"

<Tabs defaultValue="linux" values={[
  { label: "Linux", value: "linux" },
  { label: "macOS", value: "macos" },
  { label: "Windows PowerShell", value: "windows" },
]}>

<!-- prettier-ignore-end -->

<TabItem value="linux">

```shell
ls *.csv | xargs cat > singleFile.csv
```

</TabItem>

<TabItem value="macos">

```shell
ls *.csv | xargs cat > singleFile.csv
```

</TabItem>

<TabItem value="windows">

```shell
$TextFiles = Get-Item C:\Users\path\to\csv\*.csv
# The files are moved to the same folder.
$TextFiles foreach { Add-Content -Value $(Get-Content $_) -Path C:\Users\path\to\csv\singleFile.csv}
```

</TabItem>

</Tabs>

For CSV files with headers, concatenation can be tricky. You could manually
remove the first line of the files before concatenating, or use some smart
command line to concatenate and remove the headers. A good alternative is using
the open source tool
[csvstack](https://csvkit.readthedocs.io/en/latest/scripts/csvstack.html).

This is how you can concatenate multiple CSV files using _csvstack_:

```shell
csvstack *.csv > singleFile.csv
```

### Things to know about `COPY`

- `COPY` is disabled by default, as a security precaution. Configuration is
  required.

- `COPY` is more efficient when source and target disks are different.

- `COPY` is parallel when target table is partitioned.

- `COPY` is _serial_ when target table is non-partitioned, out-of-order
  timestamps will be rejected.

- `COPY` cannot import data into non-empty table.

- `COPY` indexes CSV file; reading indexed CSV file benefits hugely from disk
  IOPS. We recommend using NVME.

- `COPY` imports one file at a time; there is no internal queuing system yet.

- [COPY reference](/docs/reference/sql/copy/)

### Configure `COPY`

- Enable `COPY` and [configure](/docs/reference/configuration/#csv-import) the
  `COPY` directories to suit your server.
- `cairo.sql.copy.root` must be set for `COPY` to work.

## Create the target table schema

If you know the target table schema already, you can
[skip this section](/docs/guides/importing-data/#import-csv).

QuestDB could analyze the input file and "guess" the schema. This logic is
activated when target table does not exist.

To have QuestDB help with determining file schema, it is best to work with a
sub-set of CSV. A smaller file allows us to iterate faster if iteration is
required.

Let's assume we have the following CSV:

```csv "weather.csv"
"locationId","timestamp","windDir","windSpeed","windGust","cloudCeiling","skyCover","visMiles","tempF","dewpF","rain1H","rain6H","rain24H","snowDepth"
1,"2010-07-05T00:23:58.981263Z",3050,442,512,,"OBS",11.774906006761,-5,-31,58.228032196984,70.471606345673,77.938252342637,58
2,"2017-10-10T10:13:55.246046Z",900,63,428,5487,"BKN",4.958601701089,-19,-7,4.328016420894,36.020659549374,97.821114441800,41
3,"2010-03-12T11:17:13.727137Z",2880,299,889,371,"BKN",10.342717709226,46,81,9.149518425127,20.229637391479,20.074738007931,80
4,"2018-08-21T15:42:23.107543Z",930,457,695,4540,"OBS",13.359184086767,90,-47,33.346163208862,37.501996055160,58.316836760009,13
...
```

1. Extract the first 1000 line to `test_file.csv` (assuming both files are in
   the `cairo.sql.copy.root` directory):

```shell
head -1000 weather.csv > test_file.csv
```

2. Use a simple `COPY` command to import `test_file.csv` and define the table
   name:

   ```questdb-sql
   COPY weather from 'test_file.csv' WITH HEADER true;
   ```

Table `weather` is created and it quickly returns an id of asynchronous import
process running in the background:

| id               |
| ---------------- |
| 5179978a6d7a1772 |

3. In the Web Console right click table and select `Copy Schema to Clipboard` -
   this copies the schema generated by the input file analysis.

4. Paste the table schema to the code editor:

   ```questdb-sql
   CREATE TABLE 'weather' (
     timestamp TIMESTAMP,
     windDir INT,
     windSpeed INT,
     windGust INT,
     cloudCeiling INT,
     skyCover STRING,
     visMiles DOUBLE,
     tempF INT,
     dewpF INT,
     rain1H DOUBLE,
     rain6H DOUBLE,
     rain24H DOUBLE,
     snowDepth INT
   );
   ```

5. Identify the correct schema:

   5.1. The generated schema may not be completely correct. Check the log table
   and log file to resolve common errors using the id (see also
   [Track import progress](/docs/guides/importing-data/#track-import-progress)
   and [FAQ](/docs/guides/importing-data/#faq)):

   ```questdb-sql
   SELECT * FROM sys.text_import_log WHERE id = '5179978a6d7a1772' ORDER BY ts DESC;
   ```

| ts                          | id               | table   | file                       | phase | status   | message | rows_handled | rows_imported | errors |
| --------------------------- | ---------------- | ------- | -------------------------- | ----- | -------- | ------- | ------------ | ------------- | ------ |
| 2022-08-08T16:38:06.262706Z | 5179978a6d7a1772 | weather | test_file.csvtest_file.csv |       | finished |         | 999          | 999           | 0      |
| 2022-08-08T16:38:06.226162Z | 5179978a6d7a1772 | weather | test_file.csvtest_file.csv |       | started  |         |              |               | 0      |

Check `rows_handled`, `rows_imported`, and `message` for any errors and amend
the schema as required.

5.2. Drop the table and re-import `test_file.csv` using the updated schema.

6. Repeat the steps to narrow down to a correct schema.

   The process may require either truncating:

   ```questdb-sql
   TRUNCATE TABLE table_name;
   ```

   or dropping the target table:

   ```questdb-sql
   DROP TABLE table_name;
   ```

7. Clean up: Once all the errors are resolved, copy the final schema, drop the
   small table.
8. Make sure table is correctly partitioned. The final schema in our example
   should look like this:

   ```questdb-sql
   CREATE TABLE 'weather' (
     timestamp TIMESTAMP,
     windDir INT,
     windSpeed INT,
     windGust INT,
     cloudCeiling INT,
     skyCover STRING,
     visMiles DOUBLE,
     tempF INT,
     dewpF INT,
     rain1H DOUBLE,
     rain6H DOUBLE,
     rain24H DOUBLE,
     snowDepth INT
   ) TIMESTAMP (timestamp) partition by DAY;
   ```

9. Ready for import: Create an empty table using the final schema.

## Import CSV

Once an empty table is created in QuestDB using the correct schema, import can
be initiated with:

```questdb-sql
COPY weather FROM 'weather.csv' WITH HEADER true TIMESTAMP 'timestamp' FORMAT 'yyyy-MM-ddTHH:mm:ss.SSSUUUZ';
```

It quickly returns id of asynchronous import process running in the background:

| id               |
| :--------------- |
| 55020329020b446a |

## Track import progress

`COPY` returns an id for querying the log table (`sys.text_import_log`), to
monitor the progress of ongoing import:

```questdb-sql
SELECT * FROM sys.text_import_log WHERE id = '55020329020b446a';
```

| ts                          | id               | table   | file        | phase                  | status   | message | rows_handled | rows_imported | errors |
| :-------------------------- | ---------------- | ------- | ----------- | ---------------------- | -------- | ------- | ------------ | ------------- | ------ |
| 2022-08-03T14:00:40.907224Z | 55020329020b446a | weather | weather.csv | null                   | started  | null    | null         | null          | 0      |
| 2022-08-03T14:00:40.910709Z | 55020329020b446a | weather | weather.csv | analyze_file_structure | started  | null    | null         | null          | 0      |
| 2022-08-03T14:00:42.370563Z | 55020329020b446a | weather | weather.csv | analyze_file_structure | finished | null    | null         | null          | 0      |
| 2022-08-03T14:00:42.370793Z | 55020329020b446a | weather | weather.csv | boundary_check         | started  | null    | null         | null          | 0      |

Looking at the log from the newest to the oldest might be more convenient:

```questdb-sql
SELECT * FROM sys.text_import_log WHERE id = '55020329020b446a' ORDER BY ts DESC;
```

Once import successfully ends the log table should contain a row with a 'null'
phase and 'finished' status :

| ts                          | id               | table   | file        | phase | status   | message | rows_handled | rows_imported | errors |
| :-------------------------- | ---------------- | ------- | ----------- | ----- | -------- | ------- | ------------ | ------------- | ------ |
| 2022-08-03T14:10:59.198672Z | 55020329020b446a | weather | weather.csv | null  | finished |         | 300000000    | 300000000     | 0      |

Import into non-partitioned tables uses single-threaded implementation (serial
import) that reports only start and finish records in the status table. Given an
ordered CSV file `weather1mil.csv`, when importing, the log table shows:

| ts                          | id               | table   | file            | phase | status   | message | rows_handled | rows_imported | errors |
| :-------------------------- | ---------------- | ------- | --------------- | ----- | -------- | ------- | ------------ | ------------- | ------ |
| 2022-08-03T15:00:40.907224Z | 42d31603842f771a | weather | weather1mil.csv | null  | started  | null    | null         | null          | 0      |
| 2022-08-03T15:01:20.000709Z | 42d31603842f771a | weather | weather1mil.csv | null  | finished | null    | 999999       | 999999        | 0      |

The log table contains only coarse-grained, top-level data. Import phase run
times vary a lot (e.g. `partition_import` often takes 80% of the whole import
execution time), and therefore
[the server log](/docs/reference/configuration/#logging) provides an alternative
to follow more details of import:

```log title="import log"
2022-08-03T14:00:40.907224Z I i.q.c.t.ParallelCsvFileImporter started [importId=5502031634e923b2, phase=analyze_file_structure, file=`C:\dev\tmp\weather.csv`, workerCount=10]
2022-08-03T14:00:40.917224Z I i.q.c.p.WriterPool >> [table=`weather`, thread=43]
2022-08-03T14:00:41.440049Z I i.q.c.t.ParallelCsvFileImporter finished [importId=5502031634e923b2, phase=analyze_file_structure, file=`C:\dev\tmp\weather.csv`, duration=0s, errors=0]
2022-08-03T14:00:41.440196Z I i.q.c.t.ParallelCsvFileImporter started [importId=5502031634e923b2, phase=boundary_check, file=`C:\dev\tmp\weather.csv`, workerCount=10]
2022-08-03T14:01:18.853212Z I i.q.c.t.ParallelCsvFileImporter finished [importId=5502031634e923b2, phase=boundary_check, file=`C:\dev\tmp\weather.csv`, duration=6s, errors=0]
2022-08-03T14:01:18.853303Z I i.q.c.t.ParallelCsvFileImporter started [importId=5502031634e923b2, phase=indexing, file=`C:\dev\tmp\weather.csv`, workerCount=10]
2022-08-03T14:01:18.853516Z I i.q.c.t.ParallelCsvFileImporter temporary import directory [path='E:\dev\tmp\weather\]
2022-08-03T14:01:42.612302Z I i.q.c.t.CsvFileIndexer finished chunk [chunkLo=23099021813, chunkHi=26948858785, lines=29999792, errors=0]
2022-08-03T14:01:42.791789Z I i.q.c.t.CsvFileIndexer finished chunk [chunkLo=11549510915, chunkHi=15399347885, lines=30000011, errors=0]
```

If the [`ON ERROR` option](/docs/reference/sql/copy/#options) is set to `ABORT`,
import stops on the first error and the error is logged. Otherwise, all errors
are listed in the log.

The reference to the error varies depending on the phase of an import:

- In the indexing phase, if an error occurs, the absolute input file line is
  referenced:

```log
2022-08-08T11:50:24.319675Z E i.q.c.t.CsvFileIndexer could not parse timestamp [line=999986, column=1]
```

- In the data import phase, if an error occurs, the log references the offset as
  related to the start of the file.

```log
2022-08-08T12:19:56.828792Z E i.q.c.t.TextImportTask type syntax [type=INT, offset=5823, column=0, value='CMP2']
```

The errored rows can then be extracted for further investigation.

<!--
## Handle errors


TBD there is no good way to extract offset due to quote. Commenting this section out until we have a better way to gather errored rows.

### Extract the rows

To extract file line `[line=999986, column=1]`, use the [`sed` command](https://www.gnu.org/software/sed/manual/sed.html#Common-Commands):

```shell
sed -n -e 1  input_file.csv >> errors.csv
```

To extract rows from offset, `[type=INT, offset=5823, column=0, value='CMP2']`, use the [`dd` command](https://www.man7.org/linux/man-pages/man1/dd.1.html):

```shell
dd bs=1 count=1000 skip=56 if=input_file.csv 2>/dev/null | head -1 >> errors.csv
```
-->

## FAQ

<details>
  <summary>COPY on a table with symbol columns is very slow. How can I speed it up?</summary>
<p>

QuestDB uses `256` as the default symbol capacity. If the number of distinct
symbol values exceeds this default significantly, the `COPY` performance will
suffer. Make sure that you specify symbol capacities when creating the table
before running the `COPY` command.

Here is an example:

```questdb-sql
CREATE TABLE table_name (
  ts TIMESTAMP,
  sym SYMBOL CAPACITY 100000
) TIMESTAMP(ts) PARTITION BY DAY;
```

Refer to the [symbol type documentation](/docs/concept/symbol/#symbol-columns)
for more information on configuring the symbol capacity.

</p>
</details>

<details>
  <summary>What happens in a database crash or OS reboot?</summary>
<p>

If reboot/power loss happens while partitions are being attached, then table
might be left with incomplete data. Please truncate table before re-importing
with:

```questdb-sql
TRUNCATE TABLE table_name;
```

If reboot/power loss happens before any partitions being attached, the import
should not be affected.

</p>
</details>

<details>
  <summary>I'm getting "COPY is disabled ['cairo.sql.copy.root' is not set?]" error message</summary>
<p>

Please set `cairo.sql.copy.root` setting, restart the instance and try again.

</p>
</details>

<details>
  <summary>I'm getting "could not create temporary import work directory [path='somepath', errno=-1]" error message</summary>
<p>

Please make sure that the `cairo.sql.copy.root` and `cairo.sql.copy.work.root`
are valid paths pointing to existing directories.

</p>
</details>

<details>
  <summary>I'm getting "[2] could not open read-only [file=somepath]" error message</summary>
<p>

Please check that import file path is valid and accessible to QuestDB instance
users.

If you are running QuestDB using Docker, please check if the directory mounted
for storing source CSV files is identical to the one `cairo.sql.copy.root`
property or `QDB_CAIRO_SQL_COPY_ROOT` environment variable points to.

For example, the following command can start a QuestDB instance:

```shell
docker run -p 9000:9000 \
-v "/tmp/questdb:/var/lib/questdb" \
-v "/tmp/questdb/my_input_root:/tmp/questdb_import" \
-e QDB_CAIRO_SQL_COPY_ROOT=/tmp/questdb_wrong \
questdb/questdb
```

However, running:

```questdb-sql
COPY weather from 'weather_example.csv' WITH HEADER true;
```

Results in the "[2] could not open read-only
[file=/tmp/questdb_wrong/weather_example.csv]" error message.

</p>
</details>

<details>
  <summary>I'm getting "column count mismatch [textColumnCount=4, tableColumnCount=3, table=someTable]" error message</summary>
<p>

There are more columns in input file than in the existing target table. Please
remove column(s) from input file or add them to the target table schema.

</p>
</details>

<details>
  <summary>I'm getting "timestamp column 'ts2' not found in file header" error message</summary>
<p>

Either input file is missing header or timestamp column name given in `COPY`
command is invalid. Please add file header or fix timestamp option.

</p>
</details>

<details>
  <summary>I'm getting "column is not a timestamp [no=0, name='ts']" error message</summary>
<p>

Timestamp column given by the user or (if header is missing) assumed based on
target table schema is of a different type.  
Please check timestamp column name in input file header or make sure input file
column order matches that of target table.

</p>
</details>

<details>
  <summary>I'm getting "target table must be empty [table=t]" error message</summary>
<p>

`COPY` doesn't yet support importing into partitioned table with existing data.

Please truncate table before re-importing with:

```questdb-sql
TRUNCATE TABLE table_name;
```

or import into another empty table and then use `INSERT INTO SELECT`:

```questdb-sql
INSERT INTO table_name batch 100000
SELECT * FROM other_table;
```

to copy data into original target table.

</p>
</details>

<details>
  <summary>I'm getting "io_uring error" error message</summary>
<p>

It's possible that you've hit a IO_URING-related kernel error.  
Please set `cairo.iouring.enabled` setting to false, restart QuestDB instance,
and try again.

</p>
</details>

<details>
  <summary>I'm getting "name is reserved" error message</summary>
<p>

The table you're trying import into is in bad state (metadata is incomplete).

Please either drop the table with:

```questdb-sql
DROP TABLE table_name;
```

and recreate the table or change the table name in the `COPY` command.

</p>
</details>

<details>
  <summary>I'm getting "Unable to process the import request. Another import request may be in progress." error message</summary>
<p>

Only one import can be running at a time.

Either cancel running import with:

```questdb-sql
COPY 'paste_import_id_here' CANCEL;
```

or wait until the current import is finished.

</p>
</details>

<details>
  <summary>Import finished but table is (almost) empty</summary>
<p>

Please check the latest entries in log table:

```questdb-sql
SELECT * FROM sys.text_import_log LIMIT -10;
```

If "errors" column is close to number of records in the input file then it may
mean:

- `FORMAT` option of `COPY` command or auto-detected format doesn't match
  timestamp column data in file
- Other column(s) can't be parsed and `ON ERROR SKIP_ROW` option was used
- Input file is unordered and target table has designated timestamp but is not
  partitioned

If none of the above causes the error, please check the log file for messages
like:

```log
2022-08-08T11:50:24.319675Z E i.q.c.t.CsvFileIndexer could not parse timestamp [line=999986, column=1]
```

or

```log
2022-08-08T12:19:56.828792Z E i.q.c.t.TextImportTask type syntax [type=INT, offset=5823, column=0, value='CMP2']
```

that should explain why rows were rejected. Note that in these examples, the
former log message mentions the absolute input file line while the latter is
referencing the offset as related to the start of the file.

</p>
</details>

<details>
  <summary>Import finished but table column names are `f0`, `f1`, ...</summary>
<p>

Input file misses header and target table does not exist, so columns received
synthetic names . You can rename them with the `ALTER TABLE` command:

```questdb-sql
ALTER TABLE table_name RENAME COLUMN f0 TO ts;
```

</p>
</details>
