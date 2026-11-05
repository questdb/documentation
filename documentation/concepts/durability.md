---
title: Durability and commit modes
sidebar_label: Durability
description:
  How QuestDB commit modes trade write speed for durability, and how adaptive
  commit mode keeps commits to WAL tables safe from power loss.
---

QuestDB writes data through the operating system's page cache. The commit mode,
set by [`cairo.commit.mode`](/docs/configuration/cairo-engine/#cairocommitmode),
decides when that data is flushed to the disk, and so what an acknowledged
commit survives. Every mode survives a crash of the QuestDB process, because the
page cache outlives the process. Only data flushed to the disk survives an
operating system crash or a power loss.

The default mode, `nosync`, flushes nothing. The `adaptive` mode makes commits
to [WAL tables](/docs/concepts/write-ahead-log/) survive a power loss at a much
lower cost than `sync`: each commit flushes only its small write-ahead log
files, and the table files are flushed at periodic save points.

:::note Availability

Adaptive commit mode and the `local` durable acknowledgement are available in
QuestDB releases after 10.1.0 and QuestDB Enterprise releases after 4.1.0.

:::

## Commit modes

| Mode | What a commit flushes | After an OS crash or power loss | Use it when |
| --- | --- | --- | --- |
| `nosync` (default) | Nothing. The operating system writes the data to the disk later, on its own schedule. | Recent commits can be lost, and table files can be left damaged. | Write speed matters most, and the data can be sent again or a replica holds it. |
| `async` | Starts writing the commit's data to the disk, without waiting for it to finish. | No guarantee. Less data is at risk than in `nosync`. | You want data on the disk sooner, without slowing commits down. |
| `sync` | Waits until the written files are on the disk, on every commit and every WAL apply. | Nothing acknowledged is lost. | Non-WAL tables must survive a power loss, and you accept much slower commits. |
| `adaptive` | WAL tables: the commit's write-ahead log files. Table files only at save points. | WAL tables keep every commit, except those acknowledged in the last [group-commit window](#group-commit-window) (50 ms by default). Non-WAL tables: as `nosync`. | WAL tables must survive a power loss. |

The mode applies to the whole instance: there is no per-table mode. QuestDB
reads it once at start, and you can change it at any restart, in any direction.
Any value other than `nosync`, `async`, `sync`, or `adaptive` stops the start
with this error (one line in the log, wrapped here):

```text
invalid configuration value [key=cairo.commit.mode, value=<value>,
expected=nosync|async|sync|adaptive]
```

## How adaptive commit mode works {#how-adaptive-commit-mode-works}

Adaptive mode treats a table's write-ahead log (WAL) as the durable copy of the
table, and the table files as a copy that can be rebuilt from it.

1. **Commit.** The writer flushes the WAL files of the commit. The commit then
   gets its transaction number from the table's sequencer, which records it in
   the sequencer log. With a [group-commit window](#group-commit-window) of `0`,
   the sequencer log is flushed before the commit returns. With a larger
   window, one flush covers every commit made within the window.
2. **Apply.** The WAL apply job writes committed transactions into the table
   files without flushing them, as in `nosync`.
3. **Save points.** Each table takes a save point once a minute, or after 5
   million applied rows, whichever comes first. A save point flushes the table
   files, then writes a durable copy of the table's state (its `_txn`, `_cv`,
   and `_meta` files) to `_epoch.manifest.0` or `_epoch.manifest.1` in the
   table directory, alternately. A table also takes a save point when its
   writer closes cleanly, and once more about one interval after its last
   change. Some operations, such as `ALTER COLUMN TYPE`, `ATTACH PARTITION`,
   and `DETACH PARTITION`, also take a save point.
4. **Recovery.** After a crash, the start puts each table back at its last save
   point, and the WAL apply replays every transaction after it. A table keeps
   its last two save points, so the start falls back to the older one if the
   newer one is damaged.
5. **Damage detection.** `_txn`, `_cv`, and the records of the version 2
   sequencer log carry checksums. A file torn by a power loss is detected
   instead of being read as data.

Configuration keys and log messages call a save point an *epoch*.

Because the start can fall back to the older save point, QuestDB keeps the files
that save point still needs: the WAL written since it, and the partition,
column, and index files that later writes replaced or dropped. They are removed
one to two save point intervals later, which is one to two minutes at the
defaults. `VACUUM TABLE` does not remove them sooner.

## Enable adaptive commit mode {#enable-adaptive-commit-mode}

Set the mode in `server.conf` and restart QuestDB:

```ini title="server.conf"
cairo.commit.mode=adaptive
```

Existing tables need no migration, including tables created by an earlier
release. Each WAL table switches to adaptive mode when a writer first opens it,
usually at its next write. Its first save point flushes the whole table: one
`syncfs` call on Linux, every file of the table on macOS and Windows.

On macOS and Windows, the first save point of every new table writer flushes
every file of the table again. This happens once after each start, and again
whenever the table's writer was closed after
[`cairo.inactive.writer.ttl`](/docs/configuration/cairo-engine/#cairoinactivewriterttl)
without use (10 minutes by default). The cost grows with the number of
partitions and columns.

On QuestDB Enterprise, see also [QuestDB Enterprise](#questdb-enterprise).

## Group-commit window {#group-commit-window}

[`cairo.adaptive.commit.group.window`](/docs/configuration/cairo-engine/#cairoadaptivecommitgroupwindow)
trades commit latency against how much a power loss can take:

- **`0`**: every commit flushes the sequencer log before it returns. No
  acknowledged commit is lost.
- **Above `0` (default `50ms`)**: commits share one flush of the sequencer log,
  made once the oldest pending commit is one window old. Most commits return
  before that flush, so a power loss can lose the commits acknowledged in the
  last window.

Every commit still flushes its own WAL files before it gets a transaction
number, so the sequencer log never names data that is not on the disk.

Only commits made through a writer that stays open share a flush: ILP over TCP,
ILP over HTTP on a kept-alive connection, and QWP. Each SQL `INSERT` through the
HTTP `/exec` endpoint or the embedded API, and each PostgreSQL wire protocol
Sync (one per statement, or one per batch for drivers that batch statements),
flushes the sequencer log before it returns, as with a window of `0`. These
commits are on the disk when they are acknowledged. The flush holds the table's
sequencer lock, so commits from other writers to the same table wait for it.

When commits stop in the middle of a window, a background job makes the last
flush about one window later. This is not a hard time bound: busy worker
threads or slow storage can delay it.

To learn when specific rows are on the disk, whatever the window, request
[durable acknowledgements](#durable-acknowledgements).

## Durable acknowledgements {#durable-acknowledgements}

A QWP client can ask the server to confirm when its rows are durable. Set
[`request_durable_ack`](/docs/connect/clients/connect-string/#durable-ack) in the
connect string to the durability tiers you need:

| Value | The server confirms a batch once | Server requirement |
| --- | --- | --- |
| `local` | its WAL is on the server's disk. It survives a power loss, not the loss of that disk. | `cairo.commit.mode=adaptive` |
| `replicated` | it reached the replication object store. It survives the loss of the server. | QuestDB Enterprise primary with replication |
| `local,replicated` | both, as two separate confirmations | QuestDB Enterprise primary with replication and `cairo.commit.mode=adaptive` |
| `on` | as `replicated`. The original name, which QuestDB Enterprise 4.1.0 and earlier also accept. | QuestDB Enterprise primary with replication |
| `off` (default) | no durable confirmation | none |

The server grants every requested tier or none. When it cannot grant them all,
the client fails the connection at once, so it never waits for confirmations
that will not come. A store-and-forward sender keeps its copy of the rows until
the strongest requested tier confirms them: with `local,replicated`, until the
replicated confirmation.

The server sends confirmations only while it handles traffic from the client.
An idle client sends a keepalive ping, every 200 ms by default, so a
confirmation can arrive up to one ping interval after the data reached the
disk.

The `local`, `replicated`, and `local,replicated` values need the
[Java client](/docs/connect/clients/java/#durable-acknowledgement) after 1.3.11,
or the [C, C++](/docs/connect/clients/c-and-cpp/) or
[Rust](/docs/connect/clients/rust/) client after 7.2.1. The other clients accept
`on` and `off`. The wire format is in the
[QWP ingress protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/#durable-acknowledgement).

## What adaptive mode guarantees

These hold for WAL tables on a server running in adaptive mode (on QuestDB
Enterprise, on the primary), on storage that honours flushes:

- **Acknowledged commits survive.** After a power loss, an operating system
  crash, or a killed process, once the WAL apply has caught up after the
  restart, each table holds every commit whose WAL reached the disk. With a
  window of `0`, that is every acknowledged commit. With a larger window,
  commits acknowledged in the last window before a power loss may be missing;
  commits confirmed by a `local` durable acknowledgement are not. After a
  killed process, nothing acknowledged is lost, in any mode.
- **The table is consistent after recovery.** Its files name only partitions
  and rows that are on the disk.
- **A damaged save point is never trusted silently.** The start falls back to
  the older save point and replays the WAL kept for it, or it
  [refuses to start](#the-start-refuses).
- **Recovery can be interrupted.** A crash during the start, followed by
  another start, gives the same result as one uninterrupted start.
- **A clean restart replays nothing.** After a clean shutdown, every table is
  already at its save point, as long as
  [`cairo.adaptive.epoch.flush.on.close`](/docs/configuration/cairo-engine/#cairoadaptiveepochflushonclose)
  keeps its default, `true`.
- **The mode can change at any restart**, in any direction, including the
  restart right after a crash. See [Change the commit mode](#change-the-commit-mode).

## What adaptive mode does not cover {#limits}

- **Non-WAL tables.** A table created with `BYPASS WAL` has no WAL to replay
  and behaves as in `nosync`. This includes every table a parallel
  [`COPY`](/docs/query/sql/copy/) creates, which is always a non-WAL table: to
  protect an import, create the table first, then `COPY` into it. It also
  includes the tables the deprecated ILP over UDP receiver writes, which are
  always non-WAL.
- **Storage that ignores flushes.** The guarantees need every flush to reach
  stable storage through the file system, any virtual disk, the host, and the
  device. Disabled write barriers, or a write cache that acknowledges data it
  would lose in a power loss, break them. QuestDB does not test the storage.
- **The last group-commit window**, when the window is above `0`.
- **Loss of the disk.** A save point limits the replay after a crash; it is not
  a backup. Keep [backups](/docs/operations/backup/).
- **Power losses before the switch.** A power loss during a `nosync` or
  `async` run loses what those modes lose, even if you switch to adaptive mode
  later.
- **Damage other than torn writes.** The checksums detect writes torn by a
  power loss, not every kind of corruption. For example, damage to an already
  written record of a version 1 sequencer log is not detected.
- **Going back to an older release and returning.** See
  [Downgrade to an earlier release](#downgrade).

`sync` mode has known gaps: `ALTER COLUMN TYPE` and `ADD INDEX` do not flush
all the files they write. A power loss right after them can lose the converted
column, make the table unreadable, or break queries on the indexed column
([#7843](https://github.com/questdb/questdb/issues/7843),
[#7844](https://github.com/questdb/questdb/issues/7844),
[#7845](https://github.com/questdb/questdb/issues/7845)).

## What adaptive mode costs

These figures were measured on Linux, on ext4 and an NVMe SSD. Other storage,
macOS, and Windows can differ widely.

- **Commit latency.** A commit flushes each WAL file it wrote, about 11 flushes
  for a table with nine columns. One writer that waits for each 100-row commit
  takes about 4 ms per commit in adaptive mode, against 0.3 ms in `nosync`:
  about 12 times slower. The cost is per commit, not per row, so larger batches
  and concurrent writers spread it. A `sync` commit also waits for the table
  files: about 12 ms for a one-row commit. On Windows each flush is much slower
  than on Linux, so measure there before you rely on adaptive mode.
- **Save points.** About 20 ms each, whatever the size of the table, and mostly
  spent in one `syncfs` call. A table being written takes one a minute. On
  Linux, `syncfs` flushes the whole file system, so its cost also depends on
  other unflushed data on that file system.
- **Disk space.** The WAL, and the partition files that later writes replaced
  or dropped, stay on the disk one to two save point intervals longer.
- **Starts.** A clean start of 1,000 tables in adaptive mode took about 0.24 s.
  After a crash, each table is restored and replays its WAL since the save
  point: about 34 ms per table with 20 commits to replay.

## Change the commit mode {#change-the-commit-mode}

Change `cairo.commit.mode` and restart. The mode can change in any direction,
any number of times.

- **Into adaptive.** Each WAL table switches at its first writer open, as
  described in [Enable adaptive commit mode](#enable-adaptive-commit-mode).
- **Out of adaptive** (to `nosync`, `async`, or `sync`). The first start in the
  new mode flushes every table that ran in adaptive mode, removes its save
  point files, and logs
  `table left adaptive commit mode, its save point is removed [table=...]`.
- **Right after a crash.** The start first recovers every table that ran in
  adaptive mode from its save point, then applies the new mode. A crash in
  adaptive mode is repaired even when the next start runs in another mode.
- **From `nosync` or `async` to `sync` or `adaptive`, after a run that did not
  stop cleanly.** The first start reads and flushes each WAL table's sequencer
  log once, because the earlier run never flushed it: a few seconds for 1,000
  tables. Later starts skip it.

## Downgrade to an earlier release {#downgrade}

QuestDB 10.1.0, QuestDB Enterprise 4.1.0, and earlier releases do not maintain
the checksums and save points that later releases rely on. Going back to one of
them, writing with it, and then starting a later release on the same database
again is not supported, in any commit mode.

To go back to one of these releases:

1. If the instance ran in adaptive mode, set `cairo.commit.mode=nosync` and
   restart the current release once. Let the start finish: it flushes every
   table that ran in adaptive mode and removes its save point files.
2. Stop QuestDB cleanly.
3. Install the earlier release.

After the earlier release has written to the database, do not start a later
release on it again.

## Monitor adaptive mode

[`wal_tables()`](/docs/query/functions/meta/#wal_tables) reports the durable
state of each table:

| Column | Meaning |
| --- | --- |
| `localDurableSeqTxn` | The highest transaction whose WAL is on the disk. `-1` until a flush establishes it. |
| `durableEpochSeqTxn` | The transaction of the table's current save point. A crash replays the WAL from here. |
| `lastEpochTs` | When this process last took a save point for the table. `NULL` after a restart until the first new save point. |
| `recoveryIncarnation` | How many times this process restored the table from a save point. |

```questdb-sql title="Commits not yet on the disk, and the replay after a crash"
SELECT
  name,
  sequencerTxn - localDurableSeqTxn AS not_yet_on_disk,
  sequencerTxn - durableEpochSeqTxn AS replay_after_crash,
  lastEpochTs
FROM wal_tables();
```

[Prometheus metrics](/docs/integrations/other/prometheus/#wal-metrics):

| Metric | Type | Meaning |
| --- | --- | --- |
| `questdb_wal_apply_local_durable_seq_txn` | gauge | The highest transaction whose WAL is on the disk, summed over all tables. |
| `questdb_wal_adaptive_epoch_advances_total` | counter | Save points taken. |
| `questdb_wal_adaptive_recovery_events_total` | counter | Tables restored from a save point at a start. |

What to watch:

- **`not_yet_on_disk`** should stay near `0` with a window of `0`, and move
  within one window's worth of commits otherwise. A value that keeps growing
  means the flushes do not keep up: check the disk.
- **`lastEpochTs`** should change at least once a minute on a table that is
  being written. If it does not, search the log for
  `could not advance adaptive durable epoch`. Without new save points, the WAL
  is never removed and the replay after a crash keeps growing.
- **`recoveryIncarnation`** and the recovery counter change only after a crash.
  After a clean shutdown they stay at `0`.

## Troubleshooting

Keep the log and a copy of the affected table directory before any manual
repair, and do not remove save point files only to make a start succeed.

### The server stops after a failed flush

In `sync` and `adaptive` mode, a failed flush stops the server at once, with
exit code 55, because the data it was flushing may not be on the disk. The log
shows two lines like these (wrapped here):

```text
fatal durability barrier failure [operation=..., errno=...,
message=could not fsync [fd=...] [path=...]]
QuestDB fatal durability failure; hard-halting without writer cleanup [...]
```

Nothing that the failed flush covered was acknowledged. Fix the cause, such as
a full disk, a failing device, or an I/O error in the system log, then start
again: recovery puts every table back at its save point and replays the rest.
While the disk keeps failing, every start stops the same way.

In `nosync` and `async` mode, a failed flush fails only the operation that ran
it.

An embedded engine, which uses QuestDB as a Java library, does not stop.
Instead, it refuses every further write with
`engine is poisoned by a failed durability barrier`. Close it, fix the cause,
and create a new engine.

Flushes of Parquet partition metadata, and QuestDB Enterprise cold storage
flushes, do not stop the server. When they fail, the statement fails or the
table is suspended, and no acknowledged data is lost.

### The start refuses {#the-start-refuses}

Each refusal names the table, and the start stops before QuestDB accepts
connections. Each message below is one line in the log, wrapped here.

**The save point file cannot be written.**

```text
could not rewrite adaptive save point header [path=...]
```

Or `could not open read-write` naming an `_epoch.manifest` file. Every start in
adaptive mode rewrites and flushes the header of each table's current save
point. The file has the wrong owner or permissions, the file system is
read-only, or the disk fails. Fix the cause and start again. Nothing is lost.

**Both save points are damaged.**

```text
no trustworthy adaptive epoch generation; refusing unsafe live-state fallback
[table=..., dir=...]; after a clean stop or a process kill, move
_epoch.manifest.0 and _epoch.manifest.1 out of the table directory and start
again; after a power loss, restore the table from a backup or a checkpoint
```

QuestDB never leaves this state by itself. It means damage on the disk, or a
defect.

1. Copy the table directory aside, with both `_epoch.manifest` files, for a
   report.
2. If the last stop was clean, or only the QuestDB process was killed, the
   table files are complete. Move `_epoch.manifest.0` and `_epoch.manifest.1`
   out of the table directory and start again. The table keeps every row and
   takes a new save point at its next write.
3. After a power loss or an operating system crash, restore the table from a
   [backup](/docs/operations/backup/) or a checkpoint instead. If you cannot
   tell, for example because a container restart may have been a host crash,
   treat it as a power loss.

When the message ends with
`recovery has rewritten the live table files, restore the table from a backup or a checkpoint`,
recovery already wrote a save point over the table files before that save
point failed its checks. Moving the files out does not help: restore the table
from a backup or a checkpoint.

**The newer save point is ahead of the table files.**

```text
adaptive epoch post-dates live state; refusing wrong-lineage recovery
[table=..., dir=..., epochSeqTxn=...]; move _epoch.manifest.<generation> out
of the table directory and start again
```

QuestDB leaves this state only after an earlier start rejected a damaged save
point and two crashes in a row interrupted the recovery. Keep a copy of the
named file, move it out of the table directory, and start again: the start
restores the older save point and replays the WAL after it. If table files were
copied back by hand, from a backup or another copy, restore the whole table from
that backup instead.

### Other messages

| Message | What to do |
| --- | --- |
| `could not advance adaptive durable epoch [table=..., error=...]` | A periodic save point failed. The table keeps its previous save point and its WAL. Fix the cause in the error; the next WAL apply tries again. |
| `could not take the durable epoch the table owes, the table stays suspended; retry RESUME WAL [table=...]` | `RESUME WAL` could not take the save point the table needs. Fix the logged cause, then retry [`ALTER TABLE ... RESUME WAL`](/docs/query/sql/alter-table-resume-wal/). |
| `could not complete durable epoch after <operation>; retry the operation or RESUME WAL [table=...]` | A `DETACH PARTITION` or a direct partition change could not take its save points. Its effect may be visible, but it is not complete. Fix the cause, then retry the operation or `RESUME WAL`. |
| `durable epoch skipped after <operation>, a crash before the next one undoes it [table=...]` | The save point after an operation such as `ATTACH PARTITION` was skipped. The change is visible. Check that a later save point succeeds. |
| `adaptive save point failed its checksums, trying the other generation [...]` or `removing adaptive save point that failed its content checks [...]` | The newer save point was damaged. The start used the older one and replayed the WAL kept for it, so no row is lost. Keep the log for a report. |
| `adaptive epoch roll-forward restored durable cut [table=..., epochSeqTxn=...]` | The start restored the table after a crash. No action needed. |
| A QWP client fails its connection with a durable-ack mismatch | The server cannot grant every requested tier. See [Durable acknowledgements](#durable-acknowledgements) for what each tier needs. |

## QuestDB Enterprise

- **Configure every node.** The default is `nosync`, as in open source. Set
  `cairo.commit.mode=adaptive` on every node that can become primary.
- **Replicas.** A replica takes no save points and runs at `nosync` grade,
  even when configured `adaptive`: the object store holds the durable copy.
  The mode takes effect when the node is promoted. After a power loss, a
  replica does not download again what it lost locally; if it does not
  recover, [recreate it](/docs/high-availability/disaster-recovery/#failure-scenarios).
- **Durable acknowledgements.** Only a primary running in adaptive mode grants
  `local` and `local,replicated`. QuestDB Enterprise 4.1.0 and earlier accept
  only `on`.
- **Role switches.** Promoting a node in adaptive mode flushes once what it
  applied as a replica: on Linux, one `syncfs` for the database root and one
  for each volume. Demoting an adaptive primary flushes each of its adaptive
  tables before it starts to replicate: about 20 ms per table on Linux, so
  about 20 s for 1,000 tables.
- **A primary can refuse to start after a power loss.** In `nosync` and `async`
  mode, a primary uploads transactions before they are flushed to its disk.
  After a power loss or an operating system crash, its log of a table can end
  before the last transaction in the object store, and the primary refuses to
  start. See
  [Instance crashes](/docs/high-availability/disaster-recovery/#instance-crashes).
  In `sync` and `adaptive` mode, a primary uploads only transactions that are
  on its disk.
