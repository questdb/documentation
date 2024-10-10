---
title: Data types
sidebar_label: Data types
description: Data types reference documentation.
---

The type system is derived from Java types.

| Type Name         | Storage bits    | Nullable | Description                                                                                                                                                                                                                                                                                                                                                                                               |
|-------------------|-----------------|----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `boolean`         | `1`             | No       | Boolean `true` or `false`.                                                                                                                                                                                                                                                                                                                                                                                |
| `ipv4`            | `32`            | Yes      | `0.0.0.1` to `255.255.255. 255`                                                                                                                                                                                                                                                                                                                                                                           |
| `byte`            | `8`             | No       | Signed integer `-128` to `127`.                                                                                                                                                                                                                                                                                                                                                                           |
| `short`           | `16`            | No       | Signed integer `-32768` to `32767`.                                                                                                                                                                                                                                                                                                                                                                       |
| `char`            | `16`            | Yes      | `unicode` character.                                                                                                                                                                                                                                                                                                                                                                                      |
| `int`             | `32`            | Yes      | Signed integer `0x80000000` to `0x7fffffff`.                                                                                                                                                                                                                                                                                                                                                              |
| `float`           | `32`            | Yes      | Single precision IEEE 754 floating point value.                                                                                                                                                                                                                                                                                                                                                           |
| `symbol`          | `32`            | Yes      | Symbols are stored as 32-bit signed indexes from symbol table. Each index will have a corresponding `string` value. Translation from index to string value is done automatically when data is being written or read. Symbol table is stored separately from column.                                                                                                                                       |
| `varchar`         | `128 + utf8Len` | Yes      | Length-prefixed sequence of UTF-8 encoded characters is stored using a 128-bit header and UTF-8 encoded data. Sequences shorter than 9 bytes are fully inlined within the header and do not occupy any additional data space.                                                                                                                                                                             |
| `string`          | `96+n*16`       | Yes      | Length-prefixed sequence of UTF-16 encoded characters whose length is stored as signed 32-bit integer with maximum value of `0x7fffffff`.                                                                                                                                                                                                                                                                 |
| `long`            | `64`            | Yes      | Signed integer `0x8000000000000000L` to `0x7fffffffffffffffL`.                                                                                                                                                                                                                                                                                                                                            |
| `date`            | `64`            | Yes      | Signed offset in **milliseconds** from [Unix Epoch](https://en.wikipedia.org/wiki/Unix_time). While the `date` data type is available, we highly recommend applying the `timestamp` data type in its place. The only material advantage of date is a wider time range; timestamp however is adequate in virtually all cases. Date supports fewer functions and uses milliseconds instead of microseconds. |
| `timestamp`       | `64`            | Yes      | Signed offset in **microseconds** from [Unix Epoch](https://en.wikipedia.org/wiki/Unix_time).                                                                                                                                                                                                                                                                                                             |
| `double`          | `64`            | Yes      | Double precision IEEE 754 floating point value.                                                                                                                                                                                                                                                                                                                                                           |
| `uuid`            | `128`           | Yes      | [UUID](https://en.wikipedia.org/wiki/Universally_unique_identifier) values. See also [the UUID type](#the-uuid-type).                                                                                                                                                                                                                                                                                     |
| `binary`          | `64+n*8`        | Yes      | Length-prefixed sequence of bytes whose length is stored as signed 64-bit integer with maximum value of `0x7fffffffffffffffL`.                                                                                                                                                                                                                                                                            |
| `long256`         | `256`           | Yes      | Unsigned 256-bit integer. Does not support arbitrary arithmetic operations, but only equality checks. Suitable for storing hash code, such as crypto public addresses.                                                                                                                                                                                                                                    |
| `geohash(<size>)` | `8`-`64`        | Yes      | Geohash with precision specified as a number followed by `b` for bits, `c` for chars. See [the geohashes documentation](/docs/concept/geohashes/) for details on use and storage.                                                                                                                                                                                                                         |
| `interval`[^1]    | `128`           | Yes      | Pair of timestamps representating a time interval                                                                                                                                                                                                                                                                                                                                                         |                              


[^1]: non-persisted type, cannot be used in `CREATE` or `ALTER` statements.

## VARCHAR and STRING considerations

QuestDB supports two types for storing strings: `VARCHAR` and `STRING`.

Most users should use `VARCHAR`. `VARCHAR` is encoded in UTF-8. In contrast,
STRING is stored in UTF-16, which is less efficient than UTF-8 but is retained
for compatibility with older versions of QuestDB.

Additionally, `VARCHAR` includes several optimizations for fast access and
storage.

## Variable-sized type limitations

Maximum size of a single `VARCHAR` field size is 268 MB. A size of a `VARCHAR`
column in a single partition is limited by 218 TB or disk size, whichever is
smaller.

`BINARY` field size is limited either by 64-Bit signed int (8388608 peta bytes)
or disk size, whichever is smaller.

`STRING` field size is limited by either 32-bit signed int (1073741824
characters) or disk size, whichever is smaller.

## Type nullability

Nullable types use a specific value to mark `NULL` values:

| Type Name        | Null value                                                           | Description                                                                                                            |
| ---------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `float`          | `NaN`                                                                | As defined by IEEE 754 (`java.lang.Float.NaN`).                                                                        |
| `double`         | `NaN`                                                                | As defined by IEEE 754 (`java.lang.Double.NaN`).                                                                       |
| `long256`        | `0x8000000000000000800000000000000080000000000000008000000000000000` | The value equals four consecutive `long` null literals.                                                                |
| `long`           | `0x8000000000000000L`                                                | Minimum possible value a `long` can take -2^63.                                                                        |
| `date`           | `0x8000000000000000L`                                                | Minimum possible value a `long` can take -2^63.                                                                        |
| `timestamp`      | `0x8000000000000000L`                                                | Minimum possible value a `long` can take -2^63.                                                                        |
| `int`            | `0x80000000`                                                         | Minimum possible value an `int` can take, -2^31.                                                                       |
| `uuid`           | `80000000-0000-0000-8000-000000000000`                               | Both 64 highest bits and 64 lowest bits set to -2^63.                                                                  |
| `char`           | `0x0000`                                                             | 0.                                                                                                                     |
| `geohash(byte)`  | `0xff`                                                               | Geohashes `from 1 up to included 7 bits`.                                                                              |
| `geohash(short)` | `0xffff`                                                             | Geohashes `from 8 up to included 15 bits`.                                                                             |
| `geohash(int)`   | `0xffffffff`                                                         | Geohashes `from 16 up to included 31 bits`.                                                                            |
| `geohash(long)`  | `0xffffffffffffffff`                                                 | Geohashes `from 32 up to included 60 bits`.                                                                            |
| `symbol`         | `0x80000000`                                                         | Symbols are stored as `int` offsets in a lookup file.                                                                  |
| `varchar`        | `N/A`                                                                | Varchar columns have an explicit `NULL` marker in a header.                                                            |
| `string`         | `0xffffffff`                                                         | Strings are length prefixed, the length is an `int` and `-1` marks it `NULL` (no further storage is used).             |
| `binary`         | `0xffffffffffffffff`                                                 | Binary columns are also length prefixed, the length is a `long` and `-1` marks it `NULL` (no further storage is used). |
| `ipv4`           | `null`                                                               | IPv4 addresses are stored as `int`.                                                                                    |

To filter columns that contain, or don't contain, `NULL` values use a filter
like:

```questdb-sql
SELECT * FROM <table> WHERE <column> = NULL;
SELECT * FROM <table> WHERE <column> != NULL;
```

Alternatively, from version 6.3 use the NULL equality operator aliases:

```questdb-sql
SELECT * FROM <table> WHERE <column> IS NULL;
SELECT * FROM <table> WHERE <column> IS NOT NULL;
```

:::note

`NULL` values still occupy disk space.

:::

## The UUID type

QuestDB natively supports the `UUID` type, which should be used for `UUID`
columns instead of storing `UUIDs` as `strings`. `UUID` columns are internally
stored as 128-bit integers, allowing more efficient performance particularly in
filtering and sorting. Strings inserted into a `UUID` column is permitted but
the data will be converted to the `UUID` type.

```questdb-sql title="Inserting strings into a UUID column"
CREATE TABLE my_table (
    id UUID
);
[...]
INSERT INTO my_table VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
[...]
SELECT * FROM my_table WHERE id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
```

If you use the [PostgreSQL Wire Protocol](/docs/reference/api/postgres/) then
you can use the `uuid` type in your queries. The JDBC API does not distinguish
the UUID type, but the Postgres JDBC driver supports it in prepared statements:

```java
UUID uuid = UUID.randomUUID();
PreparedStatement ps = connection.prepareStatement("INSERT INTO my_table VALUES (?)");
ps.setObject(1, uuid);
```

[QuestDB Client Libraries](/docs/ingestion-overview/#first-party-clients) can
send `UUIDs` as `strings` to be converted to UUIDs by the server.

## IPv4

QuestDB supports the IPv4 data type.

The data type adds validity checks and type-specific functions.

They are - as one would imagine - very useful when dealing with IP addresses.

IPv4 addresses exist within the range of `0.0.0.1` - `255.255.255.255`.

A full-zero address - `0.0.0.0` is interpreted as null.

Columns may be created with the IPv4 data type like so:

```sql
-- Creating a table named traffic with two ipv4 columns: src and dst.
CREATE TABLE traffic (ts timestamp, src ipv4, dst ipv4) timestamp(ts) PARTITION BY DAY;
```

IPv4 addresses also support a wide range of existing SQL functions and contain
their own operators. For a full list, see
[IPv4 Operators](/docs/reference/operators/ipv4/).

### Limitations

IPv4 column types cannot be created via InfluxDB Line Protocol as the protocol
lacks support for IPv4. As a result, the server cannot distinguish between
string and IPv4 data. However, InfluxDB Line Protocol can still insert string
data into a pre-existing column of type IPv4.
