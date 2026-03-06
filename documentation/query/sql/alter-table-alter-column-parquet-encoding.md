---
title: ALTER TABLE ALTER COLUMN SET/DROP PARQUET ENCODING
sidebar_label: PARQUET ENCODING
description: ALTER TABLE ALTER COLUMN SET/DROP PARQUET ENCODING SQL keyword reference documentation.
---

Sets or removes per-column Parquet encoding and compression configuration on
existing tables. These settings only affect
[Parquet partitions](/docs/query/export-parquet/#in-place-conversion) and are
ignored for native partitions.

## SET

Override the default Parquet encoding, compression, or both for a column.

```questdb-sql title="Set encoding only"
ALTER TABLE sensors ALTER COLUMN temperature SET PARQUET ENCODING rle_dictionary;
```

```questdb-sql title="Set compression only (with optional level)"
ALTER TABLE sensors ALTER COLUMN temperature SET PARQUET COMPRESSION zstd 3;
```

```questdb-sql title="Set both encoding and compression"
ALTER TABLE sensors ALTER COLUMN temperature SET PARQUET ENCODING rle_dictionary COMPRESSION zstd 3;
```

## DROP

Reset per-column overrides back to the server defaults.

```questdb-sql title="Drop both encoding and compression overrides"
ALTER TABLE sensors ALTER COLUMN temperature DROP PARQUET ENCODING COMPRESSION;
```

```questdb-sql title="Drop encoding only (keeps compression override)"
ALTER TABLE sensors ALTER COLUMN temperature DROP PARQUET ENCODING;
```

```questdb-sql title="Drop compression only (keeps encoding override)"
ALTER TABLE sensors ALTER COLUMN temperature DROP PARQUET COMPRESSION;
```

## Supported encodings and codecs

See the [CREATE TABLE](/docs/query/sql/create-table/#supported-encodings)
reference for the full list of supported encodings, compression codecs, and
their valid column types.
