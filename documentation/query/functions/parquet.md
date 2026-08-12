---
title: Parquet functions
sidebar_label: Parquet
description: QuestDB Apache Parquet functions reference documentation.
---

QuestDB can read and query external [Apache Parquet](/glossary/apache-parquet/) files using SQL.

To export data as Parquet, see [Parquet Export](/docs/concepts/parquet/).

:::info
Apache Parquet support is in **beta**. Please report issues via [email](mailto:support@questdb.io), [Slack](https://slack.questdb.com/), or [Discourse](https://community.questdb.com/).
:::

## read_parquet

Reads a parquet file as a table.

`read_parquet(parquet_file_path)`

### Usage

The file path must be within the [configured root directory](#configuration). It can be specified as a relative path (resolved under the root) or as an absolute path (which must still start with the root directory). Path traversal (`../`) is not allowed.

```questdb-sql demo title="Relative path"
SELECT * FROM read_parquet('trades.parquet')
WHERE side = 'buy'
LIMIT 1;
```

| symbol  | side | price   | amount     | timestamp                   |
|---------|------|---------|:-----------|-----------------------------|
| BTC-USD | buy  | 62755.6 | 0.00043367 | 2024-07-01T00:46:39.754075Z |

```questdb-sql demo title="Absolute path (must be within the configured root)"
SELECT * FROM read_parquet('/var/lib/questdb/import/trades.parquet');
```

### Designated timestamp

Parquet files carry no notion of a
[designated timestamp](/docs/concepts/designated-timestamp/), so `read_parquet`
returns a table without one. Time-series clauses such as `SAMPLE BY` reject that
input:

```questdb-sql demo title="Fails: the base query has no designated timestamp"
SELECT timestamp, symbol, side,
    avg(price) AS avg_price,
    avg(amount) AS avg_amount
FROM read_parquet('trades.parquet')
WHERE side = 'buy'
SAMPLE BY 1m;
```

```text
base query does not provide designated TIMESTAMP column
```

Nominate the timestamp column with
[`TIMESTAMP()`](/docs/concepts/designated-timestamp/#on-query-results-dynamic-timestamp).
It can be applied directly to the `read_parquet()` call:

```questdb-sql demo title="Nominating a designated timestamp"
SELECT timestamp, symbol, side,
    avg(price) AS avg_price,
    avg(amount) AS avg_amount
FROM read_parquet('trades.parquet') TIMESTAMP(timestamp)
WHERE side = 'buy'
SAMPLE BY 1m;
```

It works equally on a wrapping sub-query, which is useful when the read is
already nested:

```questdb-sql demo title="Nominating a designated timestamp on a sub-query"
SELECT timestamp, symbol, side,
    avg(price) AS avg_price,
    avg(amount) AS avg_amount
FROM (
    SELECT * FROM read_parquet('trades.parquet')
    WHERE side = 'buy'
) TIMESTAMP(timestamp)
SAMPLE BY 1m;
```

Or on a [CTE](/docs/query/sql/with/):

```questdb-sql demo title="Nominating a designated timestamp on a CTE"
WITH buys AS (
    SELECT * FROM read_parquet('trades.parquet')
    WHERE side = 'buy'
)
SELECT timestamp, symbol, side,
    avg(price) AS avg_price,
    avg(amount) AS avg_amount
FROM buys TIMESTAMP(timestamp)
SAMPLE BY 1m;
```

Time-series joins need the same treatment. `ASOF JOIN` rejects a Parquet file on
its left side with `left side of time series join has no timestamp` until the
column is nominated. Note that the table alias comes before the `TIMESTAMP()`
clause:

```questdb-sql demo title="ASOF JOIN a Parquet file with a QuestDB table"
SELECT p.timestamp, p.symbol,
    p.price AS archived_price,
    t.price AS live_price
FROM read_parquet('trades.parquet') p TIMESTAMP(timestamp)
ASOF JOIN trades t ON (symbol);
```

In practice most non-trivial `read_parquet` queries need this override, so it is
worth applying it by default.

:::warning

`TIMESTAMP()` assumes the rows are already ordered by that column. If the file
is not sorted on its timestamp column, add `ORDER BY` inside the sub-query
before applying `TIMESTAMP()`, otherwise the results will be wrong.

```questdb-sql demo title="Sorting an unordered file first"
SELECT timestamp, symbol, avg(price) AS avg_price
FROM (
    SELECT * FROM read_parquet('trades.parquet')
    ORDER BY timestamp
) TIMESTAMP(timestamp)
SAMPLE BY 1h;
```

:::

### Importing a Parquet file into a table

Combine `read_parquet` with [`INSERT INTO`](/docs/query/sql/insert/) to load a
file into a QuestDB table.

When the target table already exists, its own designated timestamp governs the
write, so a straight column-for-column load needs no `TIMESTAMP()` override:

```questdb-sql title="Import a Parquet file into an existing table"
INSERT INTO trades
SELECT symbol, side, price, amount, timestamp
FROM read_parquet('trades.parquet');
```

Add the override when the `SELECT` itself uses a time-series clause, such as
aggregating the file into one-minute buckets on the way in:

```questdb-sql title="Aggregate on import"
INSERT INTO trades_1m
SELECT timestamp, symbol, side,
    avg(price) AS avg_price,
    avg(amount) AS avg_amount
FROM (
    SELECT * FROM read_parquet('trades.parquet')
    WHERE side = 'buy'
) TIMESTAMP(timestamp)
SAMPLE BY 1m;
```

#### Creating the target table

If the table does not exist yet,
[`CREATE TABLE AS`](/docs/query/sql/create-table/#create-table-as) infers the
schema from the Parquet file. Here the `TIMESTAMP()` clause is mandatory:
without it the new table inherits the sub-query's lack of a designated
timestamp.

```questdb-sql title="Create a table from a Parquet file"
CREATE TABLE trades AS (
    SELECT * FROM read_parquet('trades.parquet')
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

:::warning

Omitting `TIMESTAMP()` does not raise an error. It silently creates a
non-partitioned, non-WAL table with no designated timestamp, so `SAMPLE BY` and
other time-series clauses fail against it afterwards. Adding `PARTITION BY`
without `TIMESTAMP()` does fail, with
`partitioning is possible only on tables with designated timestamps`.

The designated timestamp
[cannot be set after table creation](/docs/concepts/designated-timestamp/#cannot-be-changed-after-table-creation),
so recovering means recreating the table and copying the data across. Get it
right in the `CREATE TABLE` statement.

:::

Inference is convenient but it only gives you what the file describes. Parquet
string columns land as `VARCHAR`, and nothing in the file tells QuestDB about
deduplication, indexes, or symbol capacities. Create the table up front when you
care about any of that:

```questdb-sql title="Create the table first to control the schema"
CREATE TABLE trades (
    symbol SYMBOL CAPACITY 256,
    side SYMBOL,
    price DOUBLE,
    amount DOUBLE,
    timestamp TIMESTAMP
) TIMESTAMP(timestamp) PARTITION BY DAY
DEDUP UPSERT KEYS(timestamp, symbol);

INSERT INTO trades
SELECT symbol, side, price, amount, timestamp
FROM read_parquet('trades.parquet');
```

With deduplication enabled the import is idempotent, so re-running it after a
partial failure will not duplicate rows.

### Configuration

For security reasons, reading is only allowed from a configured directory. By default, this is the `import` directory
inside the QuestDB root directory (e.g. `/var/lib/questdb/import/`). To change it, set `cairo.sql.copy.root`:

- In `server.conf`: `cairo.sql.copy.root=/path/to/dir`
- Or via the environment variable `QDB_CAIRO_SQL_COPY_ROOT`

### Limitations

Parquet format supports a rich set of data types, including structural types. QuestDB can only read Parquet columns whose types map to QuestDB types:

- Boolean
- Byte
- Short
- Char
- Int
- Long
- Long128
- Long256
- Float
- Double
- Varchar (also reads Symbol columns as Varchar)
- Timestamp
- Date
- UUID
- IPv4
- GeoHash (Byte, Short, Int, Long)
- Binary
- Array (Double)

Parquet columns with unsupported data types are ignored.

Only a single file can be read per `read_parquet` call.

## Related documentation

- [Parquet](/docs/concepts/parquet/) covers in-place partition conversion,
  compression, bloom filters, and exporting QuestDB data as Parquet.
- [Partition format](/docs/query/sql/create-table/#partition-format) shows how
  to store a table's partitions as Parquet with `FORMAT PARQUET`.
- [Designated timestamp](/docs/concepts/designated-timestamp/) explains what the
  designated timestamp is and what it enables.
- [INSERT](/docs/query/sql/insert/) documents `INSERT INTO ... SELECT`,
  including the `ATOMIC` and `BATCH` keywords.
