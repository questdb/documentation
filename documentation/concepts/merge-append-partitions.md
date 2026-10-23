---
title: Merge-append partitions
sidebar_label: Merge-append partitions
description: Reduce out-of-order write amplification with merge-append partitions, and manage their disk space with partition compaction.
---

Merge-append partitions reduce the data copied by backdated writes into large
native partitions. Available since QuestDB 10.1.0 and QuestDB Enterprise 4.1.0,
this opt-in layout lets a partition hold several pieces over one set of column
files: a commit appends
the affected pieces at the tail and leaves untouched pieces in place.

## When to use it

Use merge-append for repeated late data or corrections ingested through
[deduplication](/docs/concepts/deduplication/) in narrow time ranges. It saves
less when backdated rows are spread across the whole partition, and gains
nothing for purely in-order ingestion.

The trade-offs are extra disk space until compaction reclaims superseded rows,
and additional page-frame boundaries at piece boundaries, which can increase
query overhead.

## Enable or disable

This instance-wide setting affects all partitioned WAL tables, including
in-order workloads; there is no per-table opt-in. Set it in `server.conf`,
then restart:

```ini
cairo.o3.partition.merge.append.enabled=true
```

The default is `false`, and the setting is not reloadable. To disable it, set
it to `false` and restart. Each table's writer converts its merge-append
partitions back to the standard layout when it opens; disabling is not an
immediate server-wide conversion. Conversion can delay writer opening and
ingestion, and may need temporary disk space for replacement files.

:::warning
Merge-append is supported only for WAL tables. Before converting a table to
non-WAL, disable the flag, restart, run `ALTER TABLE trades SQUASH PARTITIONS`,
then run `ALTER TABLE trades SET TYPE BYPASS WAL` and restart again.
:::

## Compaction

Compaction reclaims dead space and reduces piece counts on commit. A background
`partition-compaction` worker also sweeps WAL tables on non-read-only servers,
including when merge-append is disabled:

1. Every two minutes, look for idle partitions, skipping partitions whose
   event-time range is too recent, including future-dated data.
2. Non-active split partitions become eligible for merging after all folders
   have been idle for 30 minutes; individual merge-append folders and Parquet
   dead space become eligible for compaction after one hour without writes.
3. Build copies in the background, then let the writer check and publish them.
   If intervening writes make a copy stale, discard it and retry on a later
   sweep; stop starting new work when the sweep's I/O or time budget is spent.

The active partition is not merged by the sweep. Remote partitions and
symbolically linked partitions are skipped. Most users only need the sweep
interval and two idle timeouts in the
[partition compaction settings](/docs/configuration/cairo-engine/#partition-compaction).
Use [`SQUASH PARTITIONS`](/docs/query/sql/alter-table-squash-partitions/)
for an explicit conversion to the standard layout and merge of split folders.

## Monitor partitions

[`SHOW PARTITIONS`](/docs/query/sql/show/#show-partitions) and
[`table_partitions()`](/docs/query/functions/meta/#table_partitions) expose
`deadRows`, `lastWriteTimestamp` and `pieceCount`. For example, this projection
was captured after backdated inserts into a day initially containing one million
rows:

```questdb-sql
SELECT name, numRows, deadRows, lastWriteTimestamp, pieceCount
FROM table_partitions('trades');
```

| name | numRows | deadRows | lastWriteTimestamp | pieceCount |
| ---- | ------- | -------- | ------------------ | ---------- |
| 2026-01-01 | 1010001 | 126 | 2026-10-22T17:24:07.013120Z | 3 |
| 2026-01-02 | 1 | 0 | null | 1 |

Pieces need not imply dead rows: a cut can create pieces without copying data.
`lastWriteTimestamp` is the layout's wall-clock update time, not the latest
event timestamp; compaction can advance it without ingesting rows. It can be
null when unavailable.

:::note
Log messages use the name "composite partition" for a merge-append partition.
:::

## Downgrade safely

:::warning
QuestDB versions before 10.1.0 and QuestDB Enterprise versions before 4.1.0
refuse tables that still contain merge-append partitions.
Before downgrading, stop ingestion, disable the flag and restart on the current
version. Run `ALTER TABLE trades SQUASH PARTITIONS` for every affected table to
open its writer and convert all its partitions, and wait for these operations
to complete before stopping the server and installing the older binary.
Do not rely on disabling the flag alone: an unopened table can retain the layout.
:::

Materialized and live views cannot use `ALTER TABLE ... SQUASH PARTITIONS`.
For their backing partitions, use background compaction instead:

1. Stop ingestion and let pending WAL apply and view refresh finish. Temporarily
   set the following in `server.conf` (the live-view setting is only needed for
   live views):

   ```ini
   cairo.o3.partition.merge.append.enabled=false
   mat.view.refresh.worker.count=0
   live.view.refresh.worker.count=0
   cairo.partition.compaction.check.interval=0
   cairo.partition.compaction.idle.timeout=0
   cairo.partition.compaction.squash.idle.timeout=0
   ```

   The worker counts disable view refresh. Zero is the minimum enabled sweep
   interval; zero idle timeouts remove the normal waiting periods.
2. Restart on the current version and wait for background compaction to finish.
   Keep WAL apply enabled so pending work and compaction commands can complete.
3. Inspect each affected view with `table_partitions('trades_1m')`, replacing
   `trades_1m` with its name. Before downgrading, every native partition must
   report `pieceCount=1`, `deadRows=0` and a null `lastWriteTimestamp`.
   The [sweep's eligibility restrictions](#compaction) still apply; do not
   downgrade while any merge-append partitions remain.
4. Restore the previous refresh-worker and compaction settings and restart
   before resuming normal operation; keep merge-append disabled when using an
   older binary.

## QuestDB Enterprise

Backups preserve the merge-append layout. Storage policies first fold split or
merge-append partitions into the standard layout before converting to Parquet;
conversion can wait for a later policy check while background compaction runs.
Replicas also run compaction unless the server is read-only.
