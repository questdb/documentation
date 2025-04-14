---
title: FAQ
description: FAQ for QuestDB troubleshooting.
---

The following document contains common hardware and software configuration
issues met when running QuestDB, as well as solutions to them. If you cannot
find the answers to your question, please join our
[community forums](https://community.questdb.com/) and post your questions there.

## Where do I find the log and how do I filter the log messages?

Log files are stored in the `log` folder under the
[root_directory](/docs/concept/root-directory-structure/). The log has the
following levels to assist filtering:

Check the [log](/docs/operations/logging-metrics/) page for the available log levels.

## How do I delete a row?

See our guide on [modifying data](/docs/guides/modifying-data/).

## How do I migrate a `STRING` column to a `VARCHAR`?

It is possible to change column type from `STRING` to `VARCHAR` using
`ALTER COLUMN TYPE` SQL. The columns are fully compatible and the conversion is
lossless. The `VARCHAR` column type reduces storage size up to 2x. Due to this,
we highly recommended migrating all `STRING` columns to `VARCHAR`:

```questdb-sql
ALTER TABLE my_table ALTER COLUMN str_col TYPE VARCHAR;
```

See more details at
[ALTER TABLE COLUMN TYPE documentation](/docs/reference/sql/alter-table-change-column-type/)

## How do I convert a `VARCHAR` column to a `SYMBOL` or vice versa?

It is possible to change column type from `VARCHAR` to `SYMBOL`.

We recommed converting a column to the `SYMBOL` type when the column has limited
number of repetitive values:

```questdb-sql
ALTER TABLE my_table ALTER COLUMN var_col TYPE SYMBOL CAPACITY 4096;
```

See more details at
[ALTER TABLE COLUMN TYPE documentation](/docs/reference/sql/alter-table-change-column-type/)

While setting the capacity of `SYMBOL` is optional, doing so enhances the
performance of both the conversion process and data inserts. Therefore, it's
advisable to choose the capacity correctly. To learn more, see the
[SYMBOL column capacity](/docs/operations/design-for-performance/#symbol-caching)
section in our design for performance page.

## Why do I get `table busy` error messages when inserting data over PostgreSQL wire protocol?

You may get `table busy [reason=insert]` or similar errors when running `INSERT`
statements concurrently on the same table. This means that the table is locked
by inserts issued from another SQL connection or other client protocols for data
import, like InfluxDB Line Protocol over TCP or CSV over HTTP.

To avoid this error, we recommend using [WAL](/docs/concept/write-ahead-log/)
tables to allow concurrent ingestion across all interfaces.

## Why do I see `could not open read-write` messages when creating a table or inserting rows?

Log messages may appear like the following:

```
2022-02-01T13:40:11.336011Z I i.q.c.l.t.LineTcpMeasurementScheduler could not create table [tableName=cpu, ex=could not open read-write
...
io.questdb.cairo.CairoException: [24] could not open read-only [file=/root/.questdb/db/cpu/service.k]
```

The machine may have insufficient limits for the maximum number of open files.
Try checking the `ulimit` value on your machine. Refer to
[capacity planning](/docs/operations/capacity-planning/#maximum-open-files) page
for more details.

## Why do I see `errno=12` mmap messages in the server logs?

Log messages may appear like the following:

```
2022-02-01T13:40:10.636014Z E i.q.c.l.t.LineTcpConnectionContext [8655] could not process line data [table=test_table, msg=could not mmap  [size=248, offset=0, fd=1766, memUsed=314809894008, fileLen=8192], errno=12]
```

The machine may have insufficient limits of memory map areas a process may have.
Try checking and increasing the `vm.max_map_count` value on your machine. Refer
to
[capacity planning](/docs/operations/capacity-planning/#max-virtual-memory-areas-limit)
page for more details.

## Why do I see `async command/event queue buffer overflow` messages when dropping partitions?

It could be the case that there are a lot of partitions to be dropped by the
DROP PARTITION [statement](/docs/reference/sql/alter-table-drop-partition)
you're trying to run, so the internal queue used by the server cannot fit them.
Try to increase `cairo.writer.command.queue.slot.size` value. Its default value
is `2K`, i.e. 2KB, so you may need to set it to a larger value, e.g. `32K`.

## How do I avoid duplicate rows with identical fields?

We have an open
[feature request to optionally de-duplicate rows](https://github.com/questdb/roadmap/issues/3)
inserted with identical fields. Until then, you need to
[modify the data](/docs/guides/modifying-data/) after it's inserted and use a
`GROUP BY` query to identify duplicates.

## Can I query by time?

Yes! When using the `WHERE` statement to define the time range for a query, the
[`IN`](/docs/reference/sql/where/#time-range-with-modifier) keyword allows
modifying the range and interval of the search. The range can be tuned to a
second resolution.

For example, the following query search for daily records between 9:15 to 16:00
inclusively from Jan 1 2000 for 365 days. The original timestamp,
2000-01-01T09:15, is extended for 405 minutes to cover the range. This range is
repeated every day for 365 times:

```questdb-sql
SELECT timestamp, col1
FROM 'table1'
WHERE timestamp IN '2000-01-01T09:15;405m;1d;365';
```

## My time or timezone is incorrect

If you are using a PostgreSQL client, such as the NodeJS client, then you may
see a mismatch in your timestamps. The documentation from the PG library has
this written in the [data types page](https://node-postgres.com/features/types):

> node-postgres will convert instances of JavaScript date objects into the
> expected input value for your PostgreSQL server. Likewise, when reading a
> date, timestamp, or timestamptz column value back into JavaScript,
> node-postgres will parse the value into an instance of a JavaScript Date
> object.

And then most importantly:

> **... node-postgres converts `DATE` and `TIMESTAMP` columns into the local
> time of the node process set at process.env.TZ.**

Therefore, in your `.env`, you may need to add:

```shell
TZ=UTC
```

The author suggests using `TIMESTAMPTZ`. When a `TIMESTAMPTZ` value is stored,
PostgreSQL converts the timestamp to UTC. When the value is retrieved,
PostgreSQL converts it back from UTC to the time zone set in the client's
system. This ensures that the timestamp is correctly interpreted, no matter what
time zone the client is in.

On the other hand, `TIMESTAMP` (timestamp without time zone) does not store any
time zone data. It simply stores a date and time. If a client in a different
time zone retrieves a TIMESTAMP value, they might interpret it as being in their
local time zone, which could lead to incorrect results.

So, if your application needs to handle time data across different time zones,
`TIMESTAMPTZ` is usually the better choice. It ensures that timestamps are
correctly interpreted, no matter where your users are located.

## Why do I see `cannot delete file, will retry` in the logs?

If you are using Windows, we recommend disabling Windows Defender. Windows
Defender will scan each new file that it sees. If a file is being scanned, it
cannot be deleted. Therefore, QuestDB creates files, Windows Defender scans
them, QuestDB goes to clean up and cannot delete the files being scanned.

## How can I fix `DatabaseError: unexpected token: CURSOR`? This query works in PostgreSQL!

QuestDB does not support scrollable cursors that require explicit creation and
management through `DECLARE CURSOR` and subsequent operations like `FETCH`.
Instead, QuestDB supports non-scrollable, or "forward-only", cursors. This
distinction means that while you can iterate over query results sequentially,
you cannot navigate backwards or access result positions as you might with
scrollable cursors in PostgreSQL.

For more information and for tips to work around, see the
[PostgreSQL compatability seciton](/docs/reference/sql/overview/#postgresql-compatibility)
in our Query & SQL overview.

## My table has corrupted WAL data due to a previous full disk or kernel limits error. What do I do?

You need to skip the problematic transation using the [RESUME WAL](/docs/reference/sql/alter-table-resume-wal/) SQL statement. If there are multiple transactions that rely on the corrupted WAL data, you may need to follow [this instruction](/docs/reference/sql/alter-table-resume-wal/#diagnosing-corrupted-wal-transactions).
