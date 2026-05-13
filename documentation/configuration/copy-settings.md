---
title: COPY settings
description: Configuration settings for CSV import and Parquet export in QuestDB.
---

These settings control the `COPY` SQL statement for importing CSV files and
exporting Parquet files. Import and export use separate root directories to
isolate source files from output.

## Import

Settings for `COPY FROM` (CSV import):

### cairo.iouring.enabled

- **Default**: `true`
- **Reloadable**: no

Enable or disable the io_uring implementation. Applicable to newer Linux
kernels only. Can be used to switch io_uring off if a kernel bug affects it.

### cairo.sql.copy.buffer.size

- **Default**: `2 MiB`
- **Reloadable**: no

Size of read buffers used during import.

### cairo.sql.copy.log.retention.days

- **Default**: `3`
- **Reloadable**: no

Number of days to keep import messages in `sys.text_import_log`.

### cairo.sql.copy.max.index.chunk.size

- **Default**: `100M`
- **Reloadable**: no

Maximum size of an index chunk file, used to limit total memory during import.
The indexing phase uses roughly `thread_count * cairo.sql.copy.max.index.chunk.size`
of memory.

### cairo.sql.copy.queue.capacity

- **Default**: `32`
- **Reloadable**: no

Size of the copy task queue. Increase if there are more than 32 import workers.

### cairo.sql.copy.root

- **Default**: `import`
- **Reloadable**: no

Input root directory for CSV imports via `COPY` SQL and for Parquet file
reading. This path must not overlap with other directories (e.g. `db`, `conf`)
of the running instance, otherwise import may delete or overwrite existing
files. Relative paths are resolved against the server root directory.

For QuestDB instances using Docker, `cairo.sql.copy.root` must be defined
using either the environment variable `QDB_CAIRO_SQL_COPY_ROOT` or the
`cairo.sql.copy.root` property in `server.conf`. The mounted source path and
the configured copy root must be identical. It is optional to define
`QDB_CAIRO_SQL_COPY_WORK_ROOT`.

Example Docker command:

```shell
docker run -p 9000:9000 \
-v "/tmp/questdb:/var/lib/questdb" \
-v "/tmp/questdb/my_input_root:/var/lib/questdb/questdb_import" \
-e QDB_CAIRO_SQL_COPY_ROOT=/var/lib/questdb/questdb_import \
questdb/questdb
```

Where:

- `-v "/tmp/questdb/my_input_root:/var/lib/questdb/questdb_import"`: Defining a
  source CSV file location to be `/tmp/questdb/my_input_root` on local machine
  and mounting it to `/var/lib/questdb/questdb_import` in the container.
- `-e QDB_CAIRO_SQL_COPY_ROOT=/var/lib/questdb/questdb_import`: Defining the
  copy root directory to be `/var/lib/questdb/questdb_import`.

It is important that the two paths are identical
(`/var/lib/questdb/questdb_import` in the example).

### cairo.sql.copy.work.root

- **Default**: `null`
- **Reloadable**: no

Temporary import file directory. Defaults to `root_directory/tmp` if not set
explicitly.

## Export

Settings for `COPY TO` (Parquet export):

### cairo.parquet.export.bloom.filter.fpp

- **Default**: `0.01`
- **Reloadable**: no

Default bloom filter false positive probability (FPP) for Parquet exports via
`COPY TO` and REST `/exp`. Lower values produce larger but more accurate
filters. Range: 0.0 to 1.0.

### cairo.parquet.export.statistics.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables generation of column statistics (min/max, null count) in
Parquet exports.

### cairo.sql.copy.export.root

- **Default**: `export`
- **Reloadable**: no

Root directory for Parquet exports via `COPY TO` SQL. This path must not
overlap with other directories (e.g. `db`, `conf`) of the running instance,
otherwise export may delete or overwrite existing files. Relative paths are
resolved against the server root directory.

Parquet export is also impacted by the general Parquet encoding parameters in
the [Cairo engine](/docs/configuration/cairo-engine/#parquet-encoding)
configuration.
