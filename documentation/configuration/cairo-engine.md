---
title: Cairo engine
description: Configuration settings for the Cairo SQL engine in QuestDB.
---

The Cairo engine is the core storage and query engine in QuestDB. These settings
control how data is written, read, indexed, and queried. Most defaults work well
for typical workloads, but tuning may be needed for high-throughput ingestion,
large analytical queries, or specific storage configurations.

## General

### cairo.date.locale

- **Default**: `en`
- **Reloadable**: no

The locale used to handle date types.

### cairo.root

- **Default**: `db`
- **Reloadable**: no

Directory for storing database tables and metadata. This directory is relative
to the server root directory provided at startup.

### cairo.system.table.prefix

- **Default**: `sys.`
- **Reloadable**: no

Prefix for QuestDB internal data storage tables. These tables are hidden from
the web console.

### cairo.timestamp.locale

- **Default**: `en`
- **Reloadable**: no

The locale used to handle timestamp types.

### config.reload.enabled

- **Default**: `true`
- **Reloadable**: no

When `false`, disables the `reload_config()` SQL function.

### query.timeout.sec

- **Default**: `60`
- **Reloadable**: no

A global timeout in seconds for long-running queries. Per-query overrides are
available via the HTTP header
[`Statement-Timeout`](/docs/query/rest-api/#headers) or the Postgres
[`options`](/docs/query/pgwire/overview/)
connection property.

## Commit and write behavior

### cairo.commit.mode

- **Default**: `nosync`
- **Reloadable**: no

How changes are flushed to disk upon commit. Options:

- `nosync`: no explicit flush (relies on OS page cache)
- `async`: flush call is scheduled but returns immediately
- `sync`: waits for flush on appended column files to complete

### cairo.max.uncommitted.rows

- **Default**: `500000`
- **Reloadable**: no

Maximum number of uncommitted rows per table. When pending rows reach this
threshold, a commit is issued automatically.

### cairo.wal.enabled.default

- **Default**: `true`
- **Reloadable**: no

Whether WAL tables are the default when using `CREATE TABLE`.

## Writer settings

### cairo.system.writer.data.append.page.size

- **Default**: `256k`
- **Reloadable**: no

mmap sliding page size that the table writer uses to append data for each
column, specifically for system tables.

### cairo.writer.alter.busy.wait.timeout

- **Default**: `500`
- **Reloadable**: no

Maximum wait timeout in milliseconds for `ALTER TABLE` statements executed
via REST or PostgreSQL wire protocol when execution is asynchronous.

### cairo.writer.command.queue.capacity

- **Default**: `32`
- **Reloadable**: no

Maximum capacity of the writer ALTER TABLE and replication command queue.
Shared between all tables.

### cairo.writer.data.append.page.size

- **Default**: `16M`
- **Reloadable**: no

mmap sliding page size that the table writer uses to append data for each
column.

### cairo.writer.data.index.key.append.page.size

- **Default**: `512K`
- **Reloadable**: no

mmap page size for appending index key data. Key data is the number of
distinct symbol values times 4 bytes.

### cairo.writer.data.index.value.append.page.size

- **Default**: `16M`
- **Reloadable**: no

mmap page size for appending index value data.

### cairo.writer.misc.append.page.size

- **Default**: `4K`
- **Reloadable**: no

mmap page size for mapping small files. Default is the OS page size (4KB
on Linux, 64KB on Windows, 16KB on macOS Apple Silicon). Overriding this
rounds up to the nearest multiple of the OS page size.

### cairo.writer.tick.rows.count

- **Default**: `1024`
- **Reloadable**: no

How often the writer checks its command queue during busy writes, measured
in rows written.

## Reader and writer pools

### cairo.idle.check.interval

- **Default**: `300000`
- **Reloadable**: no

Frequency of the writer maintenance job in milliseconds.

### cairo.inactive.reader.ttl

- **Default**: `120000`
- **Reloadable**: no

Time-to-live in milliseconds before closing inactive readers.

### cairo.inactive.writer.ttl

- **Default**: `600000`
- **Reloadable**: no

Time-to-live in milliseconds before closing inactive writers.

### cairo.reader.pool.max.segments

- **Default**: `10`
- **Reloadable**: no

Number of segments in the table reader pool. Each segment holds up to 32
readers.

### cairo.wal.inactive.writer.ttl

- **Default**: `120000`
- **Reloadable**: no

Time-to-live in milliseconds before closing inactive WAL writers.

### cairo.wal.writer.pool.max.segments

- **Default**: `10`
- **Reloadable**: no

Number of segments in the WAL writer pool. Each segment holds up to 32
writers.

## Out-of-order (O3) ingestion

These settings control the in-memory buffer used for out-of-order data
ingestion. The buffer size is determined dynamically based on the shape of
incoming data, within the bounds set here.

### cairo.o3.column.memory.size

- **Default**: `256k`
- **Reloadable**: no

Memory page size per column for O3 operations. O3 uses 2x this value per
column (so the default effective size is 512KB per column).

### cairo.o3.last.partition.max.splits

- **Default**: `20`
- **Reloadable**: no

Number of partition pieces allowed before the last piece is merged back into
the physical partition.

### cairo.o3.max.lag

- **Default**: `10 minutes`
- **Reloadable**: no

Upper limit for the in-memory O3 buffer size, in milliseconds.

### cairo.o3.min.lag

- **Default**: `1 second`
- **Reloadable**: no

Lower limit for the in-memory O3 buffer size, in milliseconds.

### cairo.o3.partition.purge.list.initial.capacity

- **Default**: `1`
- **Reloadable**: no

Initial allocation for the partition purge job. Extended automatically at
runtime.

### cairo.o3.partition.split.min.size

- **Default**: `50MB`
- **Reloadable**: no

Estimated partition size on disk. This is one of the conditions that triggers
[auto-partitioning](/docs/getting-started/capacity-planning/).

## Symbol and indexing

### cairo.default.symbol.cache.flag

- **Default**: `true`
- **Reloadable**: no

When `true`, symbol values are cached on the Java heap instead of being
looked up in database files.

### cairo.default.symbol.capacity

- **Default**: `256`
- **Reloadable**: no

Approximate capacity for `SYMBOL` columns. Should equal the number of unique
symbol values stored in the table. Getting this value significantly wrong
causes performance degradation. Must be a power of 2.

### cairo.index.value.block.size

- **Default**: `256`
- **Reloadable**: no

Approximation of the number of rows for a single index key. Must be a power
of 2. Applies to bitmap indexes only; posting indexes manage their own block
layout.

### cairo.mat.view.covering.index.enabled

- **Default**: `false`
- **Reloadable**: no

When `false`, the SQL planner skips the covering-index path for
[materialized view](/docs/concepts/materialized-views/) refresh queries
and uses the regular plan instead. Set to `true` to opt the refresh
back into covering for setups where the covering path is faster (small,
highly selective filters with `INCLUDE` columns). Ad-hoc queries against
the view are unaffected and use covering when eligible.

### cairo.parallel.index.threshold

- **Default**: `100000`
- **Reloadable**: no

Minimum number of rows before parallel indexation is used.

### cairo.parallel.indexing.enabled

- **Default**: `true`
- **Reloadable**: no

Enables parallel indexation. Works in conjunction with
`cairo.parallel.index.threshold`.

### cairo.posting.index.auto.include.timestamp

- **Default**: `true`
- **Reloadable**: no

When `true`, the designated timestamp column is automatically added to the
covering index for any
[posting index](/docs/concepts/deep-dive/posting-index/), including bare
`INDEX TYPE POSTING` declarations with no `INCLUDE` clause.

### cairo.posting.index.indexer.spill.bytes.max

- **Default**: `268435456` (256 MiB)
- **Reloadable**: no

Caps the per-key spill arena used by one-shot
[posting index](/docs/concepts/deep-dive/posting-index/) build paths —
`ALTER ADD INDEX`, `REINDEX`, snapshot restore, and O3 partition rewrites
on posting-indexed wide columns. When the cap is reached, the writer
drains pending state into a fresh sparse generation and continues.
Steady-state WAL ingestion is unaffected. Set to `0` or a negative value
to disable back-pressure entirely.

### cairo.posting.index.row.id.encoding

- **Default**: `adaptive`
- **Reloadable**: no

Default row ID encoding for posting indexes when no encoding variant is
specified. Valid values: `adaptive` (trial-encodes both delta +
Frame-of-Reference and Elias-Fano per stride and picks the smaller), `delta`
(delta + Frame-of-Reference only), `ef` (Elias-Fano only).

### cairo.posting.seal.gen.threshold

- **Default**: `16`
- **Reloadable**: no

Maximum number of unsealed generations per partition before
[posting index](/docs/concepts/deep-dive/posting-index/) sealing is triggered.
Sealing compacts active generations into a single dense generation with a
stride-indexed layout.

### cairo.spin.lock.timeout

- **Default**: `1000`
- **Reloadable**: no

Timeout in milliseconds when attempting to acquire index readers (bitmap and
posting).

### cairo.work.steal.timeout.nanos

- **Default**: `10000`
- **Reloadable**: no

Latch await timeout in nanoseconds for stealing indexing work from other
threads.

## File operations

### cairo.file.descriptor.cache.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables the file descriptor cache.

### cairo.file.operation.retry.count

- **Default**: `30`
- **Reloadable**: no

Number of attempts to open files.

### cairo.max.swap.file.count

- **Default**: `30`
- **Reloadable**: no

Number of attempts to open swap files.

### cairo.mkdir.mode

- **Default**: `509`
- **Reloadable**: no

File permission mode for new directories.

### cairo.volumes

- **Default**: none
- **Reloadable**: no

A comma-separated list of `alias -> root-path` pairs defining allowed volumes
for use in
[CREATE TABLE IN VOLUME](/docs/query/sql/create-table/#table-target-volume)
statements.

## Snapshot settings

### cairo.snapshot.instance.id

- **Default**: empty string
- **Reloadable**: no

Instance ID to include in disk snapshots.

### cairo.snapshot.recovery.enabled

- **Default**: `true`
- **Reloadable**: no

When `false`, disables snapshot recovery on database start.

## SQL compiler pools

Internal object pool sizes for the SQL compiler. Increasing these reduces
garbage collection pressure at the cost of higher baseline memory usage.

### cairo.character.store.capacity

- **Default**: `1024`
- **Reloadable**: no

Size of the CharacterStore.

### cairo.character.store.sequence.pool.capacity

- **Default**: `64`
- **Reloadable**: no

Size of the CharacterSequence pool.

### cairo.column.pool.capacity

- **Default**: `4096`
- **Reloadable**: no

Size of the Column pool in the SQL compiler.

### cairo.expression.pool.capacity

- **Default**: `8192`
- **Reloadable**: no

Size of the ExpressionNode pool in the SQL compiler.

### cairo.lexer.pool.capacity

- **Default**: `2048`
- **Reloadable**: no

Size of the FloatingSequence pool in GenericLexer.

### cairo.model.pool.capacity

- **Default**: `1024`
- **Reloadable**: no

Size of the QueryModel pool in the SQL compiler.

### cairo.sql.analytic.column.pool.capacity

- **Default**: `64`
- **Reloadable**: no

Size of the AnalyticColumn pool in the SQL parser.

### cairo.sql.column.cast.model.pool.capacity

- **Default**: `16`
- **Reloadable**: no

Size of the CreateTableModel pool in the SQL parser.

### cairo.sql.copy.model.pool.capacity

- **Default**: `32`
- **Reloadable**: no

Size of the CopyModel pool in the SQL parser.

### cairo.sql.insert.model.pool.capacity

- **Default**: `64`
- **Reloadable**: no

Size of the InsertModel pool in the SQL parser.

### cairo.sql.join.context.pool.capacity

- **Default**: `64`
- **Reloadable**: no

Size of the JoinContext pool in the SQL compiler.

### cairo.sql.query.registry.pool.size

- **Default**: auto
- **Reloadable**: no

Pre-sizes the internal data structure that stores active query executions.
Automatically chosen based on the number of shared worker threads.

### cairo.sql.rename.table.model.pool.capacity

- **Default**: `16`
- **Reloadable**: no

Size of the RenameTableModel pool in the SQL parser.

### cairo.sql.with.clause.model.pool.capacity

- **Default**: `128`
- **Reloadable**: no

Size of the WithClauseModel pool in the SQL parser.

## SQL map settings

These settings control the hash maps used internally for GROUP BY, JOIN,
and other operations that build intermediate result sets.

### cairo.compact.map.load.factor

- **Default**: `0.7`
- **Reloadable**: no

Load factor for CompactMaps.

### cairo.default.map.type

- **Default**: `fast`
- **Reloadable**: no

Type of map used. Options: `fast` (speed at the expense of storage) or
`compact`.

### cairo.fast.map.load.factor

- **Default**: `0.5`
- **Reloadable**: no

Load factor for FastMaps.

### cairo.sql.map.key.capacity

- **Default**: `2M`
- **Reloadable**: no

Key capacity in FastMap and CompactMap.

### cairo.sql.map.max.pages

- **Default**: `2^31`
- **Reloadable**: no

Maximum memory pages for CompactMap.

### cairo.sql.map.max.resizes

- **Default**: `2^31`
- **Reloadable**: no

Maximum number of map resizes in FastMap and CompactMap before a resource
limit exception is thrown. Each resize doubles the previous size.

### cairo.sql.map.page.size

- **Default**: `4m`
- **Reloadable**: no

Memory page size for FastMap and CompactMap.

### cairo.sql.unordered.map.max.entry.size

- **Default**: `24`
- **Reloadable**: no

Threshold in bytes for switching from a single-buffer hash table (unordered)
to a hash table with a separate heap for entries (ordered).

## SQL sort and join

Memory settings for sort operations and hash joins.

### cairo.sql.hash.join.light.value.max.pages

- **Default**: `2^31`
- **Reloadable**: no

Maximum pages of the slave chain in light hash joins.

### cairo.sql.hash.join.light.value.page.size

- **Default**: `1048576`
- **Reloadable**: no

Memory page size of the slave chain in light hash joins.

### cairo.sql.hash.join.value.max.pages

- **Default**: `2^31`
- **Reloadable**: no

Maximum pages of the slave chain in full hash joins.

### cairo.sql.hash.join.value.page.size

- **Default**: `16777216`
- **Reloadable**: no

Memory page size of the slave chain in full hash joins.

### cairo.sql.join.metadata.max.resizes

- **Default**: `2^31`
- **Reloadable**: no

Maximum number of map resizes in JoinMetadata before a resource limit
exception is thrown. Each resize doubles the previous size.

### cairo.sql.join.metadata.page.size

- **Default**: `16384`
- **Reloadable**: no

Memory page size for the JoinMetadata file.

### cairo.sql.latest.by.row.count

- **Default**: `1000`
- **Reloadable**: no

Number of rows for LATEST BY.

### cairo.sql.sort.key.max.pages

- **Default**: `2^31`
- **Reloadable**: no

Maximum pages for storing keys in LongTreeChain before a resource limit
exception is thrown.

### cairo.sql.sort.key.page.size

- **Default**: `4M`
- **Reloadable**: no

Memory page size for storing keys in LongTreeChain.

### cairo.sql.sort.light.value.max.pages

- **Default**: `2^31`
- **Reloadable**: no

Maximum pages for storing values in LongTreeChain.

### cairo.sql.sort.light.value.page.size

- **Default**: `1048576`
- **Reloadable**: no

Memory page size for storing values in LongTreeChain.

### cairo.sql.sort.value.max.pages

- **Default**: `2^31`
- **Reloadable**: no

Maximum pages for storing values in SortedRecordCursorFactory.

### cairo.sql.sort.value.page.size

- **Default**: `16777216`
- **Reloadable**: no

Memory page size for storing values in SortedRecordCursorFactory.

## Page frames

### cairo.sql.page.frame.max.rows

- **Default**: `1000000`
- **Reloadable**: no

Maximum number of rows in page frames used in SQL queries.

### cairo.sql.page.frame.min.rows

- **Default**: `1000`
- **Reloadable**: no

Minimum number of rows in page frames used in SQL queries.

## JIT compilation

These settings control Just-In-Time compilation of SQL filter expressions.
JIT compilation can significantly speed up queries with simple filter
predicates.

### cairo.sql.jit.bind.vars.memory.max.pages

- **Default**: `8`
- **Reloadable**: no

Maximum memory pages for storing bind variable values in JIT compiled filters.

### cairo.sql.jit.bind.vars.memory.page.size

- **Default**: `4K`
- **Reloadable**: no

Memory page size for storing bind variable values in JIT compiled filters.

### cairo.sql.jit.debug.enabled

- **Default**: `false`
- **Reloadable**: no

When enabled, prints generated assembly to `stdout`.

### cairo.sql.jit.ir.memory.max.pages

- **Default**: `8`
- **Reloadable**: no

Maximum memory pages for storing intermediate representation during JIT
compilation.

### cairo.sql.jit.ir.memory.page.size

- **Default**: `8K`
- **Reloadable**: no

Memory page size for storing intermediate representation during JIT
compilation.

### cairo.sql.jit.max.in.list.size.threshold

- **Default**: `10`
- **Reloadable**: no

If an `IN` predicate list exceeds this length, JIT compilation is skipped for
that query.

### cairo.sql.jit.mode

- **Default**: `on`
- **Reloadable**: no

JIT compilation for SQL queries. Set to `off` to disable.

### cairo.sql.jit.page.address.cache.threshold

- **Default**: `1M`
- **Reloadable**: no

Minimum cache size to shrink the page address cache after query execution.

## GROUP BY

### cairo.sql.groupby.allocator.default.chunk.size

- **Default**: `128k`
- **Reloadable**: no

Default size for memory buffers in the GROUP BY function native memory
allocator.

### cairo.sql.groupby.allocator.max.chunk.size

- **Default**: `4gb`
- **Reloadable**: no

Maximum allowed native memory allocation for GROUP BY functions.

### cairo.sql.parallel.groupby.enabled

- **Default**: `true`
- **Reloadable**: no

Enables parallel GROUP BY execution. Requires at least 4 shared worker
threads.

### cairo.sql.parallel.groupby.merge.shard.queue.capacity

- **Default**: auto
- **Reloadable**: no

Merge queue capacity for parallel GROUP BY. Used for parallel tasks that
merge shard hash tables.

### cairo.sql.parallel.groupby.sharding.threshold

- **Default**: `100000`
- **Reloadable**: no

Row count threshold for parallel GROUP BY to shard the hash table holding
the aggregates.

## SAMPLE BY

### cairo.sql.sampleby.default.alignment.calendar

- **Default**: `0`
- **Reloadable**: no

Default SAMPLE BY alignment behavior. `true` corresponds to ALIGN TO
CALENDAR, `false` corresponds to ALIGN TO FIRST OBSERVATION.

### cairo.sql.sampleby.page.size

- **Default**: `0`
- **Reloadable**: no

SAMPLE BY index query page size (maximum values returned in a single scan).
`0` means to use the symbol block capacity.

## Window functions

### cairo.sql.analytic.initial.range.buffer.size

- **Default**: `32`
- **Reloadable**: no

Window function buffer size in record counts. Pre-sizes the buffer for
every window function execution.

### cairo.sql.window.max.recursion

- **Default**: `128`
- **Reloadable**: no

Prevents stack overflow errors when evaluating complex nested SQL. The value
is the approximate number of nested SELECT clauses allowed.

## Batch operations

### cairo.create.as.select.retry.count

- **Default**: `5`
- **Reloadable**: no

Number of times table creation or insertion will be attempted.

### cairo.sql.copy.buffer.size

- **Default**: `2M`
- **Reloadable**: no

Size of buffer used when copying tables.

### cairo.sql.create.table.model.batch.size

- **Default**: `1000000`
- **Reloadable**: no

Batch size for non-atomic CREATE AS SELECT statements.

### cairo.sql.insert.model.batch.size

- **Default**: `1000000`
- **Reloadable**: no

Batch size for non-atomic INSERT INTO SELECT statements.

## Type casting and formatting

### cairo.sql.copy.formats.file

- **Default**: `/text_loader.json`
- **Reloadable**: no

Name of the file containing user-defined date and timestamp formats.

### cairo.sql.double.cast.scale

- **Default**: `12`
- **Reloadable**: no

Maximum number of decimal places for types cast as doubles.

### cairo.sql.float.cast.scale

- **Default**: `4`
- **Reloadable**: no

Maximum number of decimal places for types cast as floats.

## JSON UNNEST

### cairo.json.unnest.max.value.size

- **Default**: `4096`
- **Reloadable**: no

Maximum byte size of a single VARCHAR or TIMESTAMP field value extracted
during JSON [UNNEST](/docs/query/sql/unnest/). Numeric types (DOUBLE, LONG,
INT, SHORT, BOOLEAN) are unaffected. Each VARCHAR/TIMESTAMP column allocates
`2 * maxValueSize` bytes of native memory per active UNNEST cursor, so
increase with care.

## Random function memory

### cairo.rnd.memory.max.pages

- **Default**: `128`
- **Reloadable**: no

Maximum number of pages for memory used by `rnd_` functions. Supports
`rnd_str()` and `rnd_symbol()`.

### cairo.rnd.memory.page.size

- **Default**: `8K`
- **Reloadable**: no

Memory page size used by `rnd_` functions. Supports `rnd_str()` and
`rnd_symbol()`.

## Parquet encoding

Settings for Parquet-encoded partitions, used by storage policies and
COPY TO exports.

### cairo.partition.encoder.parquet.bloom.filter.fpp

- **Default**: `0.01`
- **Reloadable**: no

Default bloom filter false positive probability for in-place partition
encoding. Lower values produce larger but more accurate filters. Range:
0.0 to 1.0.

### cairo.partition.encoder.parquet.compression.codec

- **Default**: `ZSTD`
- **Reloadable**: no

Default compression codec for parquet-encoded partitions. Alternatives
include `LZ4_RAW` and `SNAPPY`.

### cairo.partition.encoder.parquet.compression.level

- **Default**: `9` (ZSTD), `0` (otherwise)
- **Reloadable**: no

Default compression level for parquet-encoded partitions. Dependent on
the underlying compression codec.

### cairo.partition.encoder.parquet.data.page.size

- **Default**: `1048576`
- **Reloadable**: no

Default page size for parquet-encoded partitions.

### cairo.partition.encoder.parquet.min.compression.ratio

- **Default**: `1.2`
- **Reloadable**: no

Minimum compression ratio (uncompressed / compressed) for Parquet pages.
When a compressed page does not meet this threshold, it is stored
uncompressed instead. A value of `0.0` disables the check.

### cairo.partition.encoder.parquet.raw.array.encoding.enabled

- **Default**: `false`
- **Reloadable**: no

When `true`, exports arrays in QuestDB-native binary format (less
compatible). When `false`, uses Parquet-native format (more compatible).

### cairo.partition.encoder.parquet.row.group.size

- **Default**: `100000`
- **Reloadable**: no

Default row-group size for parquet-encoded partitions.

### cairo.partition.encoder.parquet.statistics.enabled

- **Default**: `true`
- **Reloadable**: no

Controls whether statistics are included in parquet-encoded partitions.

### cairo.partition.encoder.parquet.version

- **Default**: `1`
- **Reloadable**: no

Output Parquet version for parquet-encoded partitions. Can be `1` or `2`.

### cairo.sql.parquet.row.group.pruning.enabled

- **Default**: `true`
- **Reloadable**: no

Enables row group pruning for queries on Parquet partitions. When enabled,
QuestDB uses min/max statistics, bloom filters, and null counts to skip row
groups that cannot match the query filter.

## Column purge

These settings control the background job that cleans up stale column files
after UPDATE statements.

### cairo.sql.column.purge.queue.capacity

- **Default**: `128`
- **Reloadable**: no

Purge column version job queue capacity. Increase if column versions are not
automatically cleaned up after UPDATE statements. Reduce to decrease initial
memory footprint.

### cairo.sql.column.purge.retry.delay

- **Default**: `10000`
- **Reloadable**: no

Initial delay in microseconds before re-trying purge of stale column files.

### cairo.sql.column.purge.retry.delay.limit

- **Default**: `60000000`
- **Reloadable**: no

Delay limit in microseconds. Once reached, the retry delay remains constant.

### cairo.sql.column.purge.retry.delay.multiplier

- **Default**: `10.0`
- **Reloadable**: no

Multiplier used to increase retry delay with each iteration.

### cairo.sql.column.purge.retry.limit.days

- **Default**: `31`
- **Reloadable**: no

Number of days the purge system will continue retrying before giving up on
stale column files.

### cairo.sql.column.purge.task.pool.capacity

- **Default**: `256`
- **Reloadable**: no

Column version task object pool capacity. Increase to reduce GC, reduce to
decrease memory footprint.
