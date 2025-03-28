---
title: Data types
sidebar_label: Data types
description: Data types reference documentation.
---

The type system is derived from Java types.

| Type Name         | Storage bits    | Nullable | Description                                                                                                                                                                                                                     |
|-------------------|-----------------|----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `boolean`         | `1`             | No       | Boolean `true` or `false`.                                                                                                                                                                                                      |
| `ipv4`            | `32`            | Yes      | `0.0.0.1` to `255.255.255. 255`                                                                                                                                                                                                 |
| `byte`            | `8`             | No       | Signed integer `-128` to `127`.                                                                                                                                                                                                 |
| `short`           | `16`            | No       | Signed integer `-32768` to `32767`.                                                                                                                                                                                             |
| `char`            | `16`            | Yes      | `unicode` character.                                                                                                                                                                                                            |
| `int`             | `32`            | Yes      | Signed integer `0x80000000` to `0x7fffffff`.                                                                                                                                                                                    |
| `float`           | `32`            | Yes      | Single precision IEEE 754 floating point value.                                                                                                                                                                                 |
| `symbol`          | `32`            | Yes      | A symbol, stored as a 32-bit signed index into the symbol table. Each index corresponds to a `string` value. The index is transparently translated to the string value. Symbol table is stored separately from the column data. |
| `varchar`         | `128 + utf8Len` | Yes      | Length-prefixed sequence of UTF-8 encoded characters, stored using a 128-bit header and UTF-8 encoded data. Sequences shorter than 9 bytes are fully inlined within the header and do not occupy any additional data space.     |
| `string`          | `96+n*16`       | Yes      | Length-prefixed sequence of UTF-16 encoded characters whose length is stored as signed 32-bit integer with maximum value of `0x7fffffff`.                                                                                       |
| `long`            | `64`            | Yes      | Signed integer `0x8000000000000000L` to `0x7fffffffffffffffL`.                                                                                                                                                                  |
| `date`[^1]        | `64`            | Yes      | Signed offset in **milliseconds** from [Unix Epoch](https://en.wikipedia.org/wiki/Unix_time).                                                                                                                                   |
| `timestamp`       | `64`            | Yes      | Signed offset in **microseconds** from [Unix Epoch](https://en.wikipedia.org/wiki/Unix_time).                                                                                                                                   |
| `double`          | `64`            | Yes      | Double precision IEEE 754 floating point value.                                                                                                                                                                                 |
| `uuid`            | `128`           | Yes      | [UUID](https://en.wikipedia.org/wiki/Universally_unique_identifier) values. See also [the UUID type](#the-uuid-type).                                                                                                           |
| `binary`          | `64+n*8`        | Yes      | Length-prefixed sequence of bytes whose length is stored as signed 64-bit integer with maximum value of `0x7fffffffffffffffL`.                                                                                                  |
| `long256`         | `256`           | Yes      | Unsigned 256-bit integer. Does not support arithmetic operations, only equality checks. Suitable for storing a hash code, such as crypto public addresses.                                                                      |
| `geohash(<size>)` | `8`-`64`        | Yes      | Geohash with precision specified as a number followed by `b` for bits, `c` for chars. See [the geohashes documentation](/docs/concept/geohashes/) for details on use and storage.                                               |
| `array`           | See description | Yes      | Header: 20 + 4 \* `nDims` bytes. Payload: dense array of values. Example: `DOUBLE[3][4]`: header 28 bytes, payload 3\*4\*8 = 96 bytes.                                                                                    |
| `interval`[^2]    | `128`           | Yes      | Pair of timestamps representing a time interval.                                                                                                                                                                                |

[^1]: While the `date` type is available, we highly recommend using the
`timestamp` instead. The only material advantage of `date` is a wider time
range, but `timestamp` is adequate in virtually all cases. It has microsecond
resolution (vs. milliseconds for `date`), and is fully supported by all
date/time functions, while support for `date` is limited.

[^2]: `interval` is not a persisted type. You can use it in expressions, but
can't have a database column of this type.

## VARCHAR and STRING considerations

QuestDB supports two types for storing strings: `VARCHAR` and `STRING`.

Most users should use `VARCHAR`. It uses the UTF-8 encoding, whereas `STRING`
uses UTF-16, which is less space-efficient for strings containing mostly ASCII
characters. QuestDB keeps supporting it only to maintain backward compatibility.

Additionally, `VARCHAR` includes several optimizations for fast access and
storage.

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

| Type Name        | Null value                                                           | Description                                                                              |
| ---------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `float`          | `NaN`                                                                | As defined by IEEE 754 (`java.lang.Float.NaN`).                                          |
| `double`         | `NaN`                                                                | As defined by IEEE 754 (`java.lang.Double.NaN`).                                         |
| `long256`        | `0x8000000000000000800000000000000080000000000000008000000000000000` | The value equals four consecutive `long` null literals.                                  |
| `long`           | `0x8000000000000000L`                                                | Minimum possible value a `long` can take, -2^63.                                         |
| `date`           | `0x8000000000000000L`                                                | Minimum possible value a `long` can take, -2^63.                                         |
| `timestamp`      | `0x8000000000000000L`                                                | Minimum possible value a `long` can take, -2^63.                                         |
| `int`            | `0x80000000`                                                         | Minimum possible value an `int` can take, -2^31.                                         |
| `uuid`           | `80000000-0000-0000-8000-000000000000`                               | Both 64 highest bits and 64 lowest bits set to -2^63.                                    |
| `char`           | `0x0000`                                                             | The zero char (`NUL` in ASCII).                                                          |
| `geohash(byte)`  | `0xff`                                                               | Valid for geohashes of 1 to 7 bits (inclusive).                                          |
| `geohash(short)` | `0xffff`                                                             | Valid for geohashes of 8 to 15 bits (inclusive).                                         |
| `geohash(int)`   | `0xffffffff`                                                         | Valid for geohashes of 16 to 31 bits (inclusive).                                        |
| `geohash(long)`  | `0xffffffffffffffff`                                                 | Valid for geohashes of 32 to 60 bits (inclusive).                                        |
| `symbol`         | `0x80000000`                                                         | Symbol is stored as an `int` offset into a lookup file. The value `-1` marks it `NULL`.  |
| `ipv4`           | `128.0.0.0` (`0x80000000`)                                           | IPv4 address is stored as `int` and uses the same `NULL` marker value.                   |
| `varchar`        | `N/A`                                                                | Varchar column has an explicit `NULL` marker in the header.                              |
| `string`         | `N/A`                                                                | String column is length-prefixed, the length is an `int` and `-1` marks it `NULL`.       |
| `binary`         | `N/A`                                                                | Binary column is length prefixed, the length is a `long` and `-1` marks it `NULL`.       |
| `array`          | `N/A`                                                                | Array column marks a `NULL` value with a zero in the `size` field of the header.         |

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

You cannot auto-create an IPv4 column using the InfluxDB Line Protocol, since it
doesn't support this type explicitly. The QuestDB server cannot distinguish
between string and IPv4 data. However, you can insert IPv4 data into a
pre-existing IPv4 column by sending IPs as strings.

## N-Dimensional Array

QuestDB supports the N-dimensional array type. Its design matches that of the
`NDArray` type in NumPy, which has become the de-facto standard for handling
N-dimensional data. In order to effectively use arrays in QuestDB, you should
understand the basic design principle behind it.

The physical layout of the N-dimensional array is a single memory block with
values arranged in the _row-major_ order, where the coordinates of the adjacent
elements differ in the rightmost coordinate first (much like the adjacent
numbers differ in the rightmost digit first: 41, 42, 43, etc.)

Separately, there are two lists of integers that describe this block of values,
and give it its N-dimensional appearance: _shape_ and _strides_. Both have
length equal to the number of dimensions.

- the numbers in _shape_ tell the length along each dimension -- the range of
values you can use as a coordinate for that dimension
- the numbers in _strides_ tell how far apart are adjacent elements along that
dimension

Here's a visual example of a 3-dimensional array of type `DOUBLE[2][3][2]`:

```text
dim 1: |. . . . . .|. . . . . .| -- stride = 6, len = 2
dim 2: |. .|. .|. .|. .|. .|. .| -- stride = 2, len = 3
dim 3: |.|.|.|.|.|.|.|.|.|.|.|.| -- stride = 1, len = 2
```

The dots are the individual values (`DOUBLE` numbers in our case). Each row
shows the whole array, but with different subdivisions according to the
dimension. So, in `dim 1`, the row is divided into two slots, the sub-arrays at
coordinates 1 and 2 along that dimension, and the distance between the start of
slot 1 and slot 2 is equal to 6 (the stride for that dimension). In `dim 3`,
each slots contains an individual number, and the stride is 1.

The legal values for the coordinate in `dim 3` are just 1 and 2, even though you
would be able to access any array element just by using a large-enough number.
This is how the flat array gets its 3-dimensional appearance: for each value,
there's a unique list of coordinates, `[i, j, k]`, that addresses it.

The relevance of all this to you as the user is that QuestDB can perform all of
the following operations cheaply, by editing just the two small lists, `shape`
and `strides`, and doing nothing to the potentially huge block of memory holding
the array values:

1. _Slice_: extract a 3-dimensional array that is just a part of the full one,
   by constraining the range of legal coordinates at each dimension. Example:
   `array[1:2, 2:4, 1:2]` will give us a view into the array with the shape
   `DOUBLE[1, 2, 1]`, covering just the ranges of coordinates indicated in the
   expression.

2. _Take a sub-array_: constrain the coordinate at a given dimension to just one
   choice, and then eliminate that dimension from the array. Example:
   `array[2]` has the shape `DOUBLE[3, 2]` and consists of the second subarray
   in the 1st dimension.

3. _Flatten_: remove a dimension from the array, flattening it into the
   next-finer dimension. Example: flattening `dim 2` gives us an array shape
   `DOUBLE[2, 6]`. All elements are still available, but using just 2
   coordinates.

4. _Transpose_: reverse the strides, changing the meaning of each coordinate.
   Example: transposing our array changes the strides from `(6, 2, 1)` to
   `(1, 2, 6)`. What we used to access with the 3rd coordinate, now we access
   with the 1st coordinate. On a 2D array, this would have the effect of
   swapping rows and columns (transposing a matrix).

:::note

QuestDB does not currently support the `flatten` operation.

:::

### The importance of the "vanilla" array shape

QuestDB stores the _shape_ along with the array. However, it has no need to
store _strides_: they can be calculated from the shape. Strides become relevant
once you perform one of the mentioned array shape transformations. We say that
an array whose shape hasn't been transformed (that is, it matches the physical
arrangement of elements) is a _vanilla_ array, and this has consequences for
performance. A vanilla array can be processed by optimized bulk operations that
go over the entire block of memory, disregarding the shape and strides, whereas
for any other array we have to step through all the coordinates one by one and
calculate the position of each element.

So, while performing a shape transformation is cheap on its own, whole-array
operations on transformed arrays, such as equality checks, adding/multiplying
two arrays, etc., are expected to be slower than on vanilla arrays.

QuestDB always stores arrays in vanilla form. Even if you transform an array's
shape and then store the result to the database, it will be stored in vanilla
form.
