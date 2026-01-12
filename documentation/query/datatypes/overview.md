---
title: Data Types Overview
sidebar_label: Overview
description: Data types reference documentation.
---

| Type Name                       | Storage bits    | Nullable | Description                                                                                                                                                                                                                     |
| ------------------------------- | --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boolean`                       | `1`             | No       | Boolean `true` or `false`.                                                                                                                                                                                                      |
| `ipv4`                          | `32`            | Yes      | `0.0.0.1` to `255.255.255.255`                                                                                                                                                                                                  |
| `byte`                          | `8`             | No       | Signed integer, `-128` to `127`.                                                                                                                                                                                                |
| `short`                         | `16`            | No       | Signed integer, `-32,768` to `32,767`.                                                                                                                                                                                          |
| `char`                          | `16`            | Yes      | `unicode` character.                                                                                                                                                                                                            |
| `int`                           | `32`            | Yes      | Signed integer, `-2,147,483,648` to `2,147,483,647`.                                                                                                                                                                            |
| `float`                         | `32`            | Yes      | Single precision IEEE 754 floating point value.                                                                                                                                                                                 |
| `symbol`                        | `32`            | Yes      | A symbol, stored as a 32-bit signed index into the symbol table. Each index corresponds to a `string` value. The index is transparently translated to the string value. Symbol table is stored separately from the column data. |
| `varchar`                       | `128 + utf8Len` | Yes      | Length-prefixed sequence of UTF-8 encoded characters, stored using a 128-bit header and UTF-8 encoded data. Sequences shorter than 9 bytes are fully inlined within the header and do not occupy any additional data space.     |
| `string`                        | `96+n*16`       | Yes      | Length-prefixed sequence of UTF-16 encoded characters whose length is stored as signed 32-bit integer with maximum value of `0x7fffffff`.                                                                                       |
| `long`                          | `64`            | Yes      | Signed integer, `-9,223,372,036,854,775,808` to `9,223,372,036,854,775,807`.                                                                                                                                                    |
| `date`                          | `64`            | Yes      | Signed offset in **milliseconds** from [Unix Epoch](https://en.wikipedia.org/wiki/Unix_time).                                                                                                                                   |
| `timestamp`                     | `64`            | Yes      | Signed offset in **microseconds** from [Unix Epoch](https://en.wikipedia.org/wiki/Unix_time).                                                                                                                                   |
| `timestamp_ns`                  | `64`            | Yes      | Signed offset in **nanoseconds** from [Unix Epoch](https://en.wikipedia.org/wiki/Unix_time).                                                                                                                                    |
| `double`                        | `64`            | Yes      | Double precision IEEE 754 floating point value.                                                                                                                                                                                 |
| `uuid`                          | `128`           | Yes      | [UUID](https://en.wikipedia.org/wiki/Universally_unique_identifier) values. See also [the UUID type](#the-uuid-type).                                                                                                           |
| `binary`                        | `64+n*8`        | Yes      | Length-prefixed sequence of bytes whose length is stored as signed 64-bit integer with maximum value of `0x7fffffffffffffffL`.                                                                                                  |
| `long256`                       | `256`           | Yes      | Unsigned 256-bit integer. Does not support arithmetic operations, only equality checks. Suitable for storing a hash code, such as crypto public addresses.                                                                      |
| `geohash(<size>)`               | `8`-`64`        | Yes      | Geohash with precision specified as a number followed by `b` for bits, `c` for chars. See [the geohashes documentation](/docs/query/datatypes/geohashes/) for details on use and storage.                                               |
| `array`                         | See description | Yes      | Header: 20 + 4 \* `nDims` bytes. Payload: dense array of values. Example: `DOUBLE[3][4]`: header 28 bytes, payload 3\*4\*8 = 96 bytes.                                                                                          |
| `interval`                      | `128`           | Yes      | Pair of timestamps representing a time interval. Not a persisted type: you can use it in expressions, but can't have a database column of this type.                                                                            |
| `decimal(<precision>, <scale>)` | `8`-`256`       | Yes      | Decimal floating point with user-specified precision and scale.                                                                                                                                                                 |

## N-dimensional array

In addition to the scalar types above, QuestDB also supports
[N-dimensional arrays](/docs/query/datatypes/array), currently only for the `DOUBLE`
type.

## Decimal

The `DECIMAL` type provides exact decimal arithmetic with user-specified
precision and scale. Use it when floating point approximation is unacceptable,
such as financial calculations.

QuestDB's decimal is high-performance: only ~2x slower than double, faster than
ClickHouse and DuckDB decimals, and non-allocating during computations.

```questdb-sql
CREATE TABLE prices (
    ts TIMESTAMP,
    amount DECIMAL(18, 6)  -- 18 total digits, 6 after decimal point
) TIMESTAMP(ts);
```

For detailed information on precision, scale, storage, and arithmetic behavior,
see [Decimal](/docs/query/datatypes/decimal/).

## VARCHAR and STRING considerations

QuestDB supports two types for storing strings: `VARCHAR` and `STRING`.

Most users should use `VARCHAR`. It uses the UTF-8 encoding, whereas `STRING`
uses UTF-16, which is less space-efficient for strings containing mostly ASCII
characters. QuestDB keeps supporting it only to maintain backward compatibility.

Additionally, `VARCHAR` includes several optimizations for fast access and
storage.

## TIMESTAMP and DATE considerations

While the `date` type is available, we highly recommend using the `timestamp`
instead. The only material advantage of `date` is a wider time range, but
`timestamp` is adequate in virtually all cases. It has microsecond resolution
(vs. milliseconds for `date`), and is fully supported by all date/time
functions, while support for `date` is limited. If nanosecond precision is
required, we recommend using the `timestamp_ns` data type.

## Limitations for variable-sized types

The maximum size of a single `VARCHAR` field is 268 MB, and the maximum total
size of a `VARCHAR` column in a single partition is 218 TB.

The maximum size of a `BINARY` field is defined by the limits of the 64-bit
signed integer (8,388,608 petabytes).

The maximum size of a `STRING` field is defined by the limits of the 32-bit
signed integer (1,073,741,824 characters).

The maximum number of dimensions an array can have is 32. The hard limit on the
total number of elements in an array (lengths of all dimensions multiplied
together) is `2^31 - 1` divided by the byte size of array element. For a
`DOUBLE[]`, this is `2^28 - 1` or 268,435,455. The actual limit QuestDB will
enforce is configurable via `cairo.max.array.element.count`, with the default of
10,000,000. The length of each individual dimension has a limit of `2^28 - 1` or
268,435,455, regardless of element size.

## Type nullability

Many nullable types reserve a value that marks them `NULL`:

| Type Name        | Null value                                                           | Description                                                                                                        |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `float`          | `NaN`, `+Infinity`, `-Infinity`                                      | As defined by IEEE 754 (`java.lang.Float.NaN` etc.)                                                                |
| `double`         | `NaN`, `+Infinity`, `-Infinity`                                      | As defined by IEEE 754 (`java.lang.Double.NaN`, etc.)                                                              |
| `long256`        | `0x8000000000000000800000000000000080000000000000008000000000000000` | The value equals four consecutive `long` null literals.                                                            |
| `long`           | `0x8000000000000000L`                                                | Minimum possible value a `long` can take, -2^63.                                                                   |
| `date`           | `0x8000000000000000L`                                                | Minimum possible value a `long` can take, -2^63.                                                                   |
| `timestamp`      | `0x8000000000000000L`                                                | Minimum possible value a `long` can take, -2^63.                                                                   |
| `timestamp_ns`   | `0x8000000000000000L`                                                | Minimum possible value a `long` can take, -2^63.                                                                   |
| `int`            | `0x80000000`                                                         | Minimum possible value an `int` can take, -2^31.                                                                   |
| `uuid`           | `80000000-0000-0000-8000-000000000000`                               | Both 64 highest bits and 64 lowest bits set to -2^63.                                                              |
| `char`           | `0x0000`                                                             | The zero char (`NUL` in ASCII).                                                                                    |
| `geohash(byte)`  | `0xff`                                                               | Valid for geohashes of 1 to 7 bits (inclusive).                                                                    |
| `geohash(short)` | `0xffff`                                                             | Valid for geohashes of 8 to 15 bits (inclusive).                                                                   |
| `geohash(int)`   | `0xffffffff`                                                         | Valid for geohashes of 16 to 31 bits (inclusive).                                                                  |
| `geohash(long)`  | `0xffffffffffffffff`                                                 | Valid for geohashes of 32 to 60 bits (inclusive).                                                                  |
| `symbol`         | `0x80000000`                                                         | Symbol is stored as an `int` offset into a lookup file. The value `-1` marks it `NULL`.                            |
| `ipv4`           | `0.0.0.0` (`0x00000000`)                                             | IPv4 address is stored as a 32-bit integer and the zero value represents `NULL`.                                   |
| `varchar`        | `N/A`                                                                | Varchar column has an explicit `NULL` marker in the header.                                                        |
| `string`         | `N/A`                                                                | String column is length-prefixed, the length is an `int` and `-1` marks it `NULL`.                                 |
| `binary`         | `N/A`                                                                | Binary column is length prefixed, the length is a `long` and `-1` marks it `NULL`.                                 |
| `array`          | `N/A`                                                                | Array column marks a `NULL` value with a zero in the `size` field of the header.                                   |
| `decimal`        | `N/A`                                                                | Minimal value of the underlying decimal type, impossible to reach through arithmetic as it is always out-of-range. |

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

If you use the [PostgreSQL Wire Protocol](/docs/query/pgwire/overview/) then
you can use the `uuid` type in your queries. The JDBC API does not distinguish
the UUID type, but the Postgres JDBC driver supports it in prepared statements:

```java
UUID uuid = UUID.randomUUID();
PreparedStatement ps = connection.prepareStatement("INSERT INTO my_table VALUES (?)");
ps.setObject(1, uuid);
```

[QuestDB Client Libraries](/docs/ingestion/overview/#first-party-clients) can
send `UUIDs` as `strings` to be converted to UUIDs by the server.

## IPv4

QuestDB supports the IPv4 data type. It has validity checks and some
IPv4-specific functions.

IPv4 addresses exist within the range of `0.0.0.1` - `255.255.255.255`.

An all-zero address - `0.0.0.0` - is interpreted as `NULL`.

Create a column with the IPv4 data type like this:

```sql
-- Creating a table named traffic with two ipv4 columns: src and dst.
CREATE TABLE traffic (ts timestamp, src ipv4, dst ipv4) timestamp(ts) PARTITION BY DAY;
```

IPv4 addresses support a wide range of existing SQL functions, and there are
some operators specifically for them. For a full list, see
[IPv4 Operators](/docs/query/operators/ipv4/).

### Limitations

You cannot auto-create an IPv4 column using the InfluxDB Line Protocol, since it
doesn't support this type explicitly. The QuestDB server cannot distinguish
between string and IPv4 data. However, you can insert IPv4 data into a
pre-existing IPv4 column by sending IPs as strings.
