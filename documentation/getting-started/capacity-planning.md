---
title: Capacity planning
description:
  How to plan and configure system resources, database configuration, and client
  application code available to QuestDB to ensure that server operation
  continues uninterrupted.
---

This guide will help you optimize your QuestDB deployments for peak performance.

We cover example scenarios across both edge cases and common setup
configurations.

Most configuration settings are configured in QuestDB using the `server.conf`
configuration file, or as environment variables.

For more information about applying configuration settings in QuestDB, see the
[configuration](/docs/configuration/overview/) page.

To monitor the various metrics of a QuestDB instance, refer to the
[Prometheus monitoring](/docs/integrations/other/prometheus/) page or the
[Logging & Metrics](/docs/operations/logging-metrics/) page.

## Storage and filesystem

Some of the aspects to consider regarding the storage of data and file systems.

### Drive selection

If you're using a physically-attached drive, we strongly recommend using NVMe
drives over SATA SSDs.

NVMe drives offer faster read and write speeds compared to other SSDs. This
translates to overall better performance.

If you're using a network-attached drive, like
[AWS EBS](https://aws.amazon.com/ebs/), please refer to the next section.

### Optimizing IOPS and throughput

IOPS is a measure of the number of operations per second. Throughput measures
the amount of data transferred per second, e.g. in megabytes per second.

Both metrics are important. However, your requirements may vary depending on the
workload.

For instance, large batch operations might benefit more from higher throughput,
whereas real-time query performance might need higher IOPS.

For typical loads, particularly when using AWS gp3 volumes, you should aim for
the following baseline IOPS and throughput settings:

- Minimum IOPS: 7000
- Minimum Throughput: 500 MB/s

For optimum performance, utilize the maximum settings:

- Maximum IOPS: 16000
- Maximum Throughput: 1 GB/s

### Supported filesystems

To enable compression and to match our recommended performance profile, we
recommend using [ZFS file system](https://en.wikipedia.org/wiki/ZFS).

ZFS is required for system-level compression.

While ZFS is recommended, QuestDB open source supports the following
filesystems:

- APFS
- EXT4
- NTFS
- OVERLAYFS (used by Docker)
- XFS (`ftype=1` only)
- ZFS

Other file systems supporting
[mmap](https://man7.org/linux/man-pages/man2/mmap.2.html) may work with QuestDB
but they should not be used in production. QuestDB does not test on them.

When you use an unsupported file system, QuestDB logs this warning:

```
-> UNSUPPORTED (SYSTEM COULD BE UNSTABLE)"
```

:::caution

Users **can't use NFS or similar distributed filesystems** directly with a
QuestDB database.

:::

### Data compression

To enable data compression, filesystem must be ZFS.

For instructions on how to do so, see the
[ZFS and compression](/docs/deployment/compression-zfs/) guide.

### Write amplification

Write amplification measures how many physical rows are written to disk per
logical row committed. A value of 1.0 means each row is written once (ideal).
Higher values come from any operation that rewrites existing data: out-of-order
ingestion merging into existing partitions, incremental
[materialized view](/docs/concepts/materialized-views/) refreshes replacing
already-refreshed time buckets, and `UPDATE` statements rewriting column files.

For the full picture on the out-of-order side (per-ingestion-method behavior,
tuning, and common scenarios), see
[Out-of-order data](/docs/concepts/out-of-order-data/).

Calculate it using [Prometheus metrics](/docs/integrations/other/prometheus/#scraping-prometheus-metrics-from-questdb):

```
write_amplification = questdb_physically_written_rows_total / questdb_committed_rows_total
```

These are **cumulative lifetime counters**. To measure current write amplification,
compare the delta of both values over a time window (e.g., 5 minutes).

| Value | Interpretation |
|-------|----------------|
| 1.0 – 1.5 | Excellent – minimal rewrites |
| 1.5 – 3.0 | Normal for moderate out-of-order data |
| 3.0 – 5.0 | Consider reducing partition size |
| > 5.0 | High – reduce partition size or investigate ingestion patterns |

When ingesting out-of-order data, high write amplification combined with high
disk write rate may reduce database performance.

For data ingestion over PostgreSQL Wire Protocol, or as a further step for
InfluxDB Line Protocol ingestion, using smaller table
[partitions](/docs/concepts/partitions/) can reduce write amplification. This
applies in particular to tables with partition directories exceeding several
hundred MBs on disk. For example, `PARTITION BY DAY` could be reduced to
`PARTIION BY HOUR`, `PARTITION BY MONTH` to `PARTITION BY DAY`, and so on.

#### Partition splitting

Since QuestDB 7.2, heavily out-of-order commits may split partitions into
smaller parts to reduce write amplification. When data is merged into an
existing partition due to an out-of-order insert, the partition will be split
into two parts: the prefix sub-partition and the suffix sub-partition.

Consider the following scenario:

- A partition `2023-01-01.1` with 1,000 rows every hour, and therefore 24,000
  rows in total.
- Inserting one row with the timestamp `2023-01-01T23:00`

When the out-of-order row `2023-01-01T23:00` is inserted, the partition is split
into 2 parts:

- Prefix: `2023-01-01.1` with 23,000 rows
- Suffix (including the merged row):`2023-01-01T75959-999999.2` with 1,001 rows

See
[Splitting and squashing time partitions](/docs/concepts/partitions/#partition-splitting-and-squashing)
for more information.

## CPU and RAM configuration

This section describes configuration strategies based on the forecasted behavior
of the database.

### RAM size

We recommend having at least 8GB of RAM for basic workloads, and 32GB for more
advanced ones.

For relatively small datasets i.e 4-40GB, and a read-heavy workload, performance
can be improved by maximising use of the OS page cache. Users should consider
increasing available RAM to improve the speed of read operations.

To bound how much native memory a single query, materialized view refresh, or
WAL apply may allocate, so one runaway workload cannot exhaust the server's RAM,
see [memory limits](/docs/configuration/cairo-engine/#memory-limits).

### Memory page size configuration

With frequent out-of-order (O3) writes over a large number of columns/tables,
database performance may be impacted by large memory page sizes, as this
increases the demand for RAM. The memory page, `cairo.o3.column.memory.size`, is
set to 8M by default. This means that the table writer uses 16MB (2x8MB) RAM per
column when it receives O3 writes. O3 write performance, and overall memory
usage, may be improved by decreasing this value within the range [128K, 8M]. A smaller
page size allows for a larger number of in-use columns, or otherwise frees up memory
for other database processes to use.

### CPU cores

By default, QuestDB tries to use all available CPU cores.
[The guide on shared worker configuration](/docs/configuration/shared-workers/)
explains how to change the default settings. Assuming that the disk is not
bottlenecked on IOPS, the throughput of read-only queries scales proportionally
with the number of available cores. As a result, a machine with more cores will
provide better query performance.

### Writer page size

The default page size for writers is 16MB. This should be adjusted according to
your use case. For example, using a 16MB page-size, to write only 1MB of data is
a waste of resources. To change this default value, set the
`cairo.writer.data.append.page.size` option in `server.conf`:

```ini title="server.conf"
cairo.writer.data.append.page.size=1M
```

For more horizontal use cases i.e databases with a large number of small tables,
the page sizes could be reduced more dramatically. This may better distribute
resources, and help to reduce write amplification.

### InfluxDB Line Protocol (ILP) over HTTP

As of QuestDB 7.4.2, InfluxDB Line Protocol operates over HTTP instead of TCP.

As such, ILP is optimal out-of-the box.

See your [ILP client](/docs/ingestion/overview/#first-party-clients) for
language-specific configurations.

### Postgres Wire Protocol

For clients sending data to QuestDB using the Postgres interface, the following
configuration can be applied, which sets a dedicated worker and pins it with
`affinity` to a CPU by core ID:

```ini title="server.conf"
pg.worker.count=4
pg.worker.affinity=1,2,3,4
```

## Network Configuration

For the InfluxDB Line Protocol, PostgreSQL Wire Protocol and HTTP, there are a
number of configuration settings which control:

- the number of clients that may connect
- the internal I/O capacities
- connection timeout settings

These settings are configured in the `server.conf` file, and follow the naming
convention:

```ini
<protocol>.net.connection.<config>
```

Where `<protocol>` is one of:

- `http` - HTTP connections
- `pg` - PostgreSQL Wire Protocol
- `line.tcp` - InfluxDB line protocol over TCP

And `<config>` is one of the following settings:

| key       | description                                                                                                                                                                                                                |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `limit`   | The number of simultaneous connections to the server. This value is intended to control server memory consumption.                                                                                                         |
| `timeout` | Connection idle timeout in milliseconds. Connections are closed by the server when this timeout lapses.                                                                                                                    |
| `hint`    | Applicable only for Windows, where TCP backlog limit is hit. For example Windows 10 allows max of 200 connection. Even if limit is set higher, without hint=true, it won't be possible to serve more than 200 connections. |
| `sndbuf`  | Maximum send buffer size on each TCP socket. If value is -1 socket send buffer remains unchanged from OS default.                                                                                                          |
| `rcvbuf`  | Maximum receive buffer size on each TCP socket. If value is -1, the socket receive buffer remains unchanged from OS default.                                                                                               |

For example, this is a configuration for Linux with a relatively low number of
concurrent connections:

```ini title="server.conf InfluxDB Line Protocol network example configuration for a low number of concurrent connections"
# bind to all IP addresses on port 9009
line.tcp.net.bind.to=0.0.0.0:9009
# maximum of 30 concurrent connection allowed
line.tcp.net.connection.limit=30
# nothing to do here, connection limit is quite low
line.tcp.net.connection.hint=false
# connections will time out after 60s of no activity
line.tcp.net.connection.timeout=60000
# receive buffer is 4MB to accomodate large messages
line.tcp.net.rcvbuf=4M
```

This is an example for when one would like to configure InfluxDB Line Protocol
for a large number of concurrent connections, on Windows:

```ini title="server.conf InfluxDB Line Protocol network example configuration for large number of concurrent connections on Windows"
# bind to specific NIC on port 9009, NIC is identified by IP address
line.tcp.net.bind.to=10.75.26.3:9009
# large number of concurrent connections
line.tcp.net.connection.limit=400
# Windows will not allow 400 client to connect unless we use the "hint"
line.tcp.net.connection.hint=true
# connections will time out after 30s of inactivity
line.tcp.net.connection.timeout=30000
# receive buffer is 1MB because messages are small, smaller buffer will
# reduce memory usage, 400 connections times 1MB = 400MB RAM required to handle input
line.tcp.net.rcvbuf=1M
```

For more information on the default settings for the `http` and `pg` protocols,
refer to the [server configuration page](/docs/configuration/overview/).

### Pooled connections

Connection pooling should be used for any production-ready use of PostgreSQL
Wire Protocol or InfluxDB Line Protocol over TCP.

The maximum number of pooled connections is configurable,
(`pg.connection.pool.capacity` for PostgreSQL Wire Protocol and
(`line.tcp.connection.pool.capacity` for InfluxDB Line Protocol over TCP. The
default number of connections for both interfaces is 64. Users should avoid
using too many connections, as large numbers of concurrent connections will
increase overall CPU usage.

## OS configuration

QuestDB relies on two per-process OS limits that are often too low by default: the
number of open files and the number of memory-mapped areas. Raise **both to
1048576** before running in production. QuestDB warns when either is too low, in the
[Web Console](/docs/getting-started/web-console/overview/) and the startup log;
hitting a limit at runtime causes OS errors and can leave the database unstable.

| Limit | What it caps | Typical default | Recommended | Check current value |
| --- | --- | --- | --- | --- |
| Open files (`ulimit -n`) | File descriptors per process | `524288` (systemd) | `1048576` | QuestDB startup log |
| `vm.max_map_count` | Memory-mapped regions per process | `65530` | `1048576` | startup log, or `cat /proc/sys/vm/max_map_count` |

### Maximum open files {#maximum-open-files}

QuestDB's [columnar](/glossary/columnar-database/) storage keeps many files open,
at least one per column per partition. Large tables, many partitions, or heavy
out-of-order ingestion can push this past a low limit, causing "too many open
files" errors (`errno=24`) and reduced performance. The Web Console shows:

```
fs.file-max limit is too low [current=524288, recommended=1048576]
```

:::note

Despite the name, this is the **per-process** limit (`ulimit -n`), not the
system-wide `fs.file-max` sysctl, which is already high on modern Linux and needs
no change. On systemd distributions the per-process hard limit defaults to
**524288**, below the recommended value, so a fresh install can trigger the warning.

:::

#### Raise the limit

QuestDB logs both limits at startup:

```
A server-main fs.file-max checked [limit=1048576]
A server-main vm.max_map_count checked [limit=1048576]
```

On Linux it is enough to raise the **hard** limit; the JVM raises its own soft limit
to match at startup. For a **systemd service**, set `LimitNOFILE` in the unit's
`[Service]` section:

```ini title="questdb.service"
[Service]
LimitNOFILE=1048576
```

```bash
sudo systemctl daemon-reload && sudo systemctl restart questdb
```

When started **manually from a shell**, add a drop-in for the user that runs
QuestDB, then log out and back in:

```ini title="/etc/security/limits.d/99-questdb.conf"
questdb soft nofile 1048576
questdb hard nofile 1048576
```

On **macOS**, the JVM has a low built-in file-descriptor cap, but the `questdb.sh`
launcher lifts it for you; you only need to raise the OS limits:

```bash
sudo launchctl limit maxfiles 98304 2147483647
ulimit -H -n 1048576
```

See [Max Open Files Limit on macOS for the JVM](/blog/max-open-file-limit-macos-jvm/)
for the details.

### Maximum virtual memory areas (`vm.max_map_count`) {#max-virtual-memory-areas-limit}

This applies to **Linux only**; macOS and Windows have no equivalent setting.

QuestDB memory-maps its data files and can hold a very large number of mappings at
once, especially under out-of-order ingestion. Each counts against the kernel's
`vm.max_map_count`. On RHEL 9, Ubuntu 22.04, and Debian 12 this defaults to
**65530**, far too low (newer distributions such as Ubuntu 24.04+, Fedora 39+ already
ship `1048576`). When exhausted, `mmap` fails with out-of-memory errors
([errno=12](/docs/troubleshooting/os-error-codes/)) that can destabilize the database.
The Web Console shows:

```
vm.max_map_count limit is too low [current=65530, recommended=1048576]
```

It is a kernel sysctl, independent of the open-files limit above. Set it with a
drop-in and apply:

```ini title="/etc/sysctl.d/99-questdb.conf"
vm.max_map_count=1048576
```

```bash
sudo sysctl --system
```
