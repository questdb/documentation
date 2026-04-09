---
title: ALTER TABLE ALTER COLUMN SET PARQUET
sidebar_label: PARQUET ENCODING/COMPRESSION
description: ALTER TABLE ALTER COLUMN SET PARQUET SQL keyword reference documentation.
---

Sets or removes per-column Parquet encoding, compression, and
bloom filter configuration on
existing tables. These settings only affect
[Parquet partitions](/docs/query/export-parquet/#in-place-conversion) and are
ignored for native partitions.

## SET

Override the default Parquet encoding, compression, bloom filter, or any
combination for a column. The syntax is
`SET PARQUET(encoding [, compression[(level)]] [, BLOOM_FILTER])`. Use
`default` for the encoding when specifying compression only.

```questdb-sql title="Set encoding only"
ALTER TABLE trades ALTER COLUMN price SET PARQUET(rle_dictionary);
```

```questdb-sql title="Set compression only (with optional level)"
ALTER TABLE trades ALTER COLUMN price SET PARQUET(default, zstd(3));
```

```questdb-sql title="Set both encoding and compression"
ALTER TABLE trades ALTER COLUMN price SET PARQUET(rle_dictionary, zstd(3));
```

Reset per-column overrides back to the server defaults.

```questdb-sql title="Reset to defaults"
ALTER TABLE trades ALTER COLUMN price SET PARQUET(default);
```

### Bloom filter

The optional `BLOOM_FILTER` keyword enables bloom filter generation for the
column when partitions are converted to Parquet. It can be combined with
encoding and compression, and always appears as the last argument.

```questdb-sql title="Enable bloom filter with default encoding"
ALTER TABLE trades ALTER COLUMN symbol SET PARQUET(default, BLOOM_FILTER);
```

```questdb-sql title="Enable bloom filter with encoding and compression"
ALTER TABLE trades ALTER COLUMN symbol SET PARQUET(rle_dictionary, zstd(3), BLOOM_FILTER);
```

To **remove** the bloom filter from a column, re-issue `SET PARQUET` without
the `BLOOM_FILTER` keyword:

```questdb-sql title="Clear bloom filter, keep encoding"
ALTER TABLE trades ALTER COLUMN symbol SET PARQUET(rle_dictionary);
```

The bloom filter false positive probability (FPP) is a global setting and
cannot be configured per column. See
the [Configuration reference](/docs/configuration/overview/) for details.

## Supported encodings and codecs

See the [CREATE TABLE](/docs/query/sql/create-table/#supported-encodings)
reference for the full list of supported encodings, compression codecs, and
their valid column types.
