---
title: ALTER TABLE ALTER COLUMN SET/DROP PARQUET
sidebar_label: PARQUET ENCODING/COMPRESSION
description: ALTER TABLE ALTER COLUMN SET/DROP PARQUET SQL keyword reference documentation.
---

Sets or removes per-column Parquet encoding and compression configuration on
existing tables. These settings only affect
[Parquet partitions](/docs/query/export-parquet/#in-place-conversion) and are
ignored for native partitions.

## SET

Override the default Parquet encoding, compression, or both for a column.
The syntax is `SET PARQUET(encoding [, compression[(level)]])`. Use `default`
for the encoding when specifying compression only.

```questdb-sql title="Set encoding only"
ALTER TABLE sensors ALTER COLUMN temperature SET PARQUET(rle_dictionary);
```

```questdb-sql title="Set compression only (with optional level)"
ALTER TABLE sensors ALTER COLUMN temperature SET PARQUET(default, zstd(3));
```

```questdb-sql title="Set both encoding and compression"
ALTER TABLE sensors ALTER COLUMN temperature SET PARQUET(rle_dictionary, zstd(3));
```

## DROP

Reset per-column overrides back to the server defaults.

```questdb-sql title="Reset to defaults"
ALTER TABLE sensors ALTER COLUMN temperature DROP PARQUET;
```

## Supported encodings and codecs

See the [CREATE TABLE](/docs/query/sql/create-table/#supported-encodings)
reference for the full list of supported encodings, compression codecs, and
their valid column types.
