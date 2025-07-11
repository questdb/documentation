---
title: Data Deduplication
sidebar_label: Data Deduplication
description: What is built-in storage deduplication and why it can be useful.
---

Starting from QuestDB 7.3, there is an option to enable storage-level data
deduplication on a table. Data deduplication works on all the data inserted into
the table and replaces matching rows with the new versions. Only new rows that
do no match existing data will be inserted.

:::note

Deduplication can only be enabled for
[Write-Ahead Log (WAL)](/docs/concept/write-ahead-log) tables.

:::

## Practical considerations

Deduplication in QuestDB makes table inserts
[idempotent](https://en.wikipedia.org/wiki/Idempotence). The primary use case is[deduplication.md](..%2Fguides%2Fdeduplication.md)
to allow for re-sending data within a given time range without creating
duplicates.

This can be particularly useful in situations where there is an error in sending
data, such as when using
[InfluxDB Line Protocol](/docs/reference/api/ilp/overview), and there is no
clear indication of how much of the data has already been written. With
deduplication enabled, it is safe to re-send data from a fixed period in the
past to resume the writing process.

Enabling deduplication on a table has an impact on writing performance,
especially when multiple `UPSERT KEYS` are configured. Generally, if the data
have mostly unique timestamps across all the rows, the performance impact of
deduplication is low. Conversely, the most demanding data pattern occurs when
there are many rows with the same timestamp that need to be deduplicated on
additional columns.

For example, in use cases where 10 million devices send CPU metrics every second
precisely, deduplicating the data based on the device ID can be expensive.
However, in cases where CPU metrics are sent at random and typically have unique
timestamps, the cost of deduplication is negligible.

:::note

The on-disk ordering of rows with duplicate timestamps differs when deduplication is enabled. 

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

The SQL standard does not guarantee the ordering of result sets without explicit `ORDER BY` clauses.

:::

## Configuration

Create a WAL-enabled table with deduplication using
[`CREATE TABLE`](/docs/reference/sql/create-table/#deduplication) syntax.

Enable or disable deduplication at any time for individual tables using the
following statements:

- [ALTER TABLE DEDUP ENABLE ](/docs/reference/sql/alter-table-enable-deduplication)
- [ALTER TABLE DEDUP DISABLE](/docs/reference/sql/alter-table-disable-deduplication)

Remember: correct `UPSERT KEYS` ensure that deduplication functions as expected.

## Deduplication UPSERT Keys

_UPSERT_ is an abbreviation for _UPDATE_ or _INSERT_, which is a common database
concept. It means that the new row _UPDATEs_ the existing row (or multiple rows
in the general case) when the matching criteria are met. Otherwise, the new row
is _INSERTed_ into the table. In QuestDB deduplication, the _UPSERT_ matching
criteria are set by defining a column list in the `UPSERT KEYS` clause in the
`CREATE` or `ALTER` table statement.

`UPSERT KEYS` can be changed at any time. It can contain one or more columns.

Please be aware that the [designated Timestamp](/docs/concept/designated-timestamp) 
column must always be included in the `UPSERT KEYS` list.


## Example

The easiest way to explain the usage of `UPSERT KEYS` is through an example:

```sql
CREATE TABLE TICKER_PRICE (
    ts TIMESTAMP,
    ticker SYMBOL,
    price DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY WAL
DEDUP UPSERT KEYS(ts, ticker);
```

In this example, the deduplication keys are set to the `ts` column, which is the
designated timestamp, and the `ticker` column. The intention is to have no more
than one price point per ticker at any given time. Therefore, if the same
price/day combination is sent twice, only the last price is saved.

The following inserts demonstrate the deduplication behavior:

```sql
INSERT INTO TICKER_PRICE VALUES ('2023-07-14', 'QQQ', 78.56); -- row 1
INSERT INTO TICKER_PRICE VALUES ('2023-07-14', 'QQQ', 78.34); -- row 2

INSERT INTO TICKER_PRICE VALUES ('2023-07-14', 'AAPL', 104.40); -- row 3
INSERT INTO TICKER_PRICE VALUES ('2023-07-14', 'AAPL', 105.18); -- row 4
```

In this case, deduplication overwrites row 1 with row 2 because both
deduplication keys have the same values: `ts='2023-07-14'` and `ticker='QQQ'`.
The same behavior applies to the second pair of rows, where row 4 overwrites
row 3.

As a result, the table contains only two rows:

```sql
SELECT * FROM TICKER_PRICE;
```

| ts         | ticker | price  |
| ---------- | ------ | ------ |
| 2023-07-14 | QQQ    | 78.34  |
| 2023-07-14 | AAPL   | 105.18 |

Regardless of whether the inserts are executed in a single transaction/batch or
as individual inserts, the outcome remains unchanged as long as the order of the
inserts is maintained.

Deduplication can be disabled using the DEDUP DISABLE SQL statement:

```sql
ALTER TABLE TICKER_PRICE DEDUP DISABLE
```

This reverts the table to behave as usual, allowing the following inserts:

```sql
INSERT INTO TICKER_PRICE VALUES ('2023-07-14', 'QQQ', 84.59); -- row 1
INSERT INTO TICKER_PRICE VALUES ('2023-07-14', 'AAPL', 105.21); -- row 2
```

These inserts add two more rows to the TICKER_PRICE table:

```sql
SELECT * FROM TICKER_PRICE;
```

| ts         | ticker | price  |
| ---------- | ------ | ------ |
| 2023-07-14 | QQQ    | 78.34  |
| 2023-07-14 | QQQ    | 84.59  |
| 2023-07-14 | AAPL   | 105.18 |
| 2023-07-14 | AAPL   | 105.21 |

Deduplication can be enabled again at any time:

```sql
ALTER TABLE TICKER_PRICE DEDUP ENABLE UPSERT KEYS(ts, ticker)
```

:::note

Enabling deduplication does not have any effect on the existing data and only
applies to newly inserted data. This means that a table with deduplication
enabled can still contain duplicate data.

:::

Enabling deduplication does not change the number of rows in the table. After
enabling deduplication, the following inserts demonstrate the deduplication
behavior:

```sql
INSERT INTO TICKER_PRICE VALUES ('2023-07-14', 'QQQ', 98.02); -- row 1
INSERT INTO TICKER_PRICE VALUES ('2023-07-14', 'QQQ', 91.16); -- row 2
```

After these inserts, all rows with `ts='2023-07-14'` and `ticker='QQQ'` are
replaced, first by row 1 and then by row 2, and the price is set to **91.16**:

```sql
SELECT * FROM TICKER_PRICE;
```

| ts         | ticker | price  |
| ---------- | ------ | ------ |
| 2023-07-14 | QQQ    | 91.16  |
| 2023-07-14 | QQQ    | 91.16  |
| 2023-07-14 | AAPL   | 105.18 |
| 2023-07-14 | AAPL   | 105.21 |

## Checking Deduplication Configuration

It is possible to utilize metadata
[tables](/docs/reference/function/meta#tables) query to verify whether
deduplication is enabled for a specific table:

```sql
SELECT dedup FROM tables() WHERE table_name = '<the table name>'
```

The function [table_columns](/docs/reference/function/meta#table_columns) can be
used to identify which columns are configured as deduplication UPSERT KEYS:

```sql
SELECT `column`, upsertKey from table_columns('<the table name>')
```
