---
title: Design for performance
description: How to plan and configure database to optimize performance.
---

To optimize the performance of a QuestDB instance, it is important to adjust
system and table configuration according to the nature of the data. This page
lists out common configurations that users should take into account when testing
data using QuestDB.

To monitor various metrics of the QuestDB instances, refer to the
[Prometheus monitoring](/docs/third-party-tools/prometheus/) page or the
[Logging & Monitoring](/docs/operations/logging-metrics/) page.

Refer to [Capacity planning](/docs/operations/capacity-planning/) for deployment
considerations.

## Optimizing queries

The following section describes the underlying aspects to consider when
formulating queries.

### Row serialization

Row serialization and deserialization has a cost on both client and server. The
QuestDB [Web Console](/docs/web-console/) limits fetching to 10,000 dataset. When fetching a large
(10K+) dataset via a single query using other methods, consider using
pagination, hence multiple queries instead.

## Choosing a schema

This section provides some hints for choosing the right schema for a dataset
based on the storage space that types occupy in QuestDB.

### Partitioning

When creating tables, a [partitioning](/glossary/database-partitioning/)
strategy is recommended in order to be able to enforce a data retention policy
to save disk space, and for optimizations on the number of concurrent file reads
performed by the system. For more information on this topic, see the following
resources:

- [partitions](/docs/concept/partitions/) page which provides a general overview
  of this concept
- [data retention](/docs/operations/data-retention/) guide provides further
  details on partitioning tables with examples on how to drop partitions by time
  range

#### Records per partition

The number of records per partition should factor into the partitioning strategy
(`YEAR`, `MONTH`, `WEEK`, `DAY`, `HOUR`). Having too many records per partition
or having too few records per partition and having query operations across too
many partitions has the result of slower query times. A general guideline is
that roughly between 1 million and 100 million records is optimal per partition.

### VARCHAR vs. STRING

For storing high-cardinality string data QuestDB supports two types:

1. `varchar`
2. `string`

While these types can be used interchangeably, new tables should prefer
`varchar` columns as it is more efficient.

| Feature        | `varchar`                                            | `string`                                                      |
| -------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| Encoding       | UTF-8                                                | UTF-16                                                        |
| Storage        | Typically lower storage requirements                 | Higher storage requirements                                   |
| Optimization   | Optimized for common operations (filtering, sorting) | Not optimized for modern use cases                            |
| Recommendation | Recommended for new tables                           | Considered a legacy type, not recommended for new tables      |
| Compatibility  | Compatible with newer versions of QuestDB            | Kept for compatibility with older versions, may be deprecated |

### Symbols

[Symbols](/docs/concept/symbol/) are a data type that is recommended to be used
for strings that are repeated often in a dataset. The benefit of using this data
type is lower storage requirements than storing strings in `varchar` columns and
faster performance on queries as symbols are internally stored as `int` values.

Only symbols can be [indexed](/docs/concept/indexes/) in QuestDB. Although
multiple indexes can be specified for a table, there would be a performance
impact on the rate of ingestion.

The following example shows the creation of a table with a `symbol` type that
has multiple options passed for performance optimization.

```questdb-sql
CREATE TABLE my_table(
    symb SYMBOL CAPACITY 1048576 NOCACHE,
    vch VARCHAR,
    ts TIMESTAMP
) timestamp(ts) PARTITION BY DAY;
```

This example adds a `symbol` type with:

- **capacity** specified to estimate how many unique symbol values to expect
- **caching** disabled which allows dealing with larger value counts
- **index** for the symbol column with a storage block value

A full description of the options used above for `symbol` types can be found in
the [CREATE TABLE](/docs/reference/sql/create-table/#symbols) page.

#### Symbol caching

[Symbol cache](/docs/concept/symbol/#usage-of-symbols) enables the use of
on-heap cache for reads and can enhance performance. However, the cache size
grows as the number of distinct value increases, and the size of the cached
symbol may hinder query performance.

We recommend that users check the JVM and GC metrics via
[Prometheus monitoring](/docs/third-party-tools/prometheus/) before taking one
of the following steps:

- Disabling the symbol cache. See
  [Usage of `symbols`](/docs/concept/symbol/#usage-of-symbols) for server-wide
  and table-wide configuration options.
- Increasing the JVM heap size using the `-Xmx` argument.

#### Symbol capacity

[Symbol capacity](/docs/concept/symbol/#usage-of-symbols) should be the same or
slightly larger than the count of distinct symbol values.

Undersized symbol columns slow down query performance. Similarly, there is a
performance impact when symbol is not used for its designed way, most commonly
assigning `symbol` to columns with a unique value per row. It is crucial to
choose a suitable [data type](/docs/reference/sql/datatypes/) based on the
nature of the dataset.

#### Index

Appropriate us of [indexes](/docs/concept/indexes/) provides faster read access
to a table. However, indexes have a noticeable cost in terms of disk space and
ingestion rate - we recommend starting with no indexes and adding them later,
only if they appear to improve query performance. Refer to
[Index trade-offs](/docs/concept/indexes/#trade-offs) for more information.

### Numbers

The storage space that numbers occupy can be optimized by choosing `byte`,
`short`, and `int` data types appropriately. When values are not expected to
exceed the limit for that particular type, savings on disk space can be made.
See also [Data types](/docs/reference/sql/datatypes/) for more details.

| type   | storage per value | numeric range                            |
| :----- | :---------------- | :--------------------------------------- |
| byte   | 8 bits            | -128 to 127                              |
| short  | 16 bits           | -32768 to 32767                          |
| int    | 32 bits           | -2147483648 to 2147483647                |
| float  | 32 bits           | Single precision IEEE 754 floating point |
| double | 64 bits           | Double precision IEEE 754 floating point |
