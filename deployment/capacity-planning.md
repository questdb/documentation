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
[configuration](/docs/configuration/) page.

To monitor the various metrics of a QuestDB instance, refer to the
[Prometheus monitoring](/docs/third-party-tools/prometheus/) page or the
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
[ZFS and compression](/docs/guides/compression-zfs/) guide.

### Write amplification

In QuestDB, the write amplification is calculated using the formula from
[metrics](/docs/third-party-tools/prometheus/#scraping-prometheus-metrics-from-questdb):
`questdb_physically_written_rows_total` / `questdb_committed_rows_total`.

When ingesting out-of-order data, a high disk write rate combined with high
write amplification may reduce database performance.

For data ingestion over PostgreSQL Wire Protocol, or as a further step for
InfluxDB Line Protocol ingestion, using smaller table
[partitions](/docs/concept/partitions/) can reduce write amplification. This
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
[Splitting and squashing time partitions](/docs/concept/partitions/#splitting-and-squashing-time-partitions)
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
[The guide on shared worker configuration](#shared-workers) explains how to
change the default settings. Assuming that the disk is not bottlenecked on IOPS,
the throughput of read-only queries scales proportionally with the number of
available cores. As a result, a machine with more cores will provide better
query performance.

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

See your [ILP client](/docs/ingestion-overview/#first-party-clients) for
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
refer to the [server configuration page](/docs/configuration/).

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

Changing system settings on the host OS can improve QuestDB performance. QuestDB
may reach system limits relating to maximum open files, and virtual memory
areas.

QuestDB writes operating system errors to its logs unchanged. We only recommend
changing the following system settings in response to seeing such OS errors in
the logs.

### Maximum open files

QuestDB uses a [columnar](/glossary/columnar-database/) storage model, and
therefore its core data structures relate closely to the file system. Columnar
data is stored in its own `.d` file, per time partition. In edge cases with
extremely large tables, frequent out-of-order ingestion, or a high number of
table partitions, the number of open files may hit a user or system-wide maximum
limit, causing reduced performance and other unwanted behaviours.

In Linux/MacOS environments, maximum open file limits for the current user:

```bash
# Soft limit
ulimit -Sn
# Hard limit
ulimit -Hn
```

#### Setting the open file limit for the current user:

On a Linux environment, one must increase the hard limit. On MacOS, both the
hard and soft limits must be set. See
[Max Open Files Limit on MacOS for the JVM](/blog/max-open-file-limit-macos-jvm/)
for more details.

Modify user limits using `ulimit`:

```bash
# Hard limit
ulimit -H -n 1048576
# Soft limit
ulimit -S -n 1048576
```

The system-wide limit should be increased correspondingly.

#### Setting the system-wide open file limit on Linux:

To increase this setting and persist this configuration change, the limit on the
number of concurrently open files can be amended in `/etc/sysctl.conf`:

```ini title="/etc/sysctl.conf"
fs.file-max=1048576
```

To confirm that this value has been correctly configured, reload `sysctl` and
check the current value:

```bash
# reload configuration
sysctl -p
# query current settings
sysctl fs.file-max
```

#### Extra steps for systemd

If you are running the QuestDB using `systemd`, you will also need to set the `LimitNOFILE` property in your service file.

If you have followed the [setup guide](https://questdb.io/docs/deployment/systemd/), then the file should be called `questdb.service` and located at `~/.config/systemd/user/questdb.service`.

Add this property to the `[Service]` section, setting it to at least `1048576`, or higher if you have set higher OS-wide limits. 

Then restart the service. If you have configured these settings correctly, any warnings in the web console should now be cleared.

#### Setting system-wide open file limit on MacOS:

On MacOS, the system-wide limit can be modified by using `launchctl`:

```shell
sudo launchctl limit maxfiles 98304 2147483647
```

To confirm the change, view the current settings using `sysctl`:

```shell
sysctl -a | grep kern.maxf
```

### Max virtual memory areas limit

The database relies on memory mapping to read and write data to its files. If
the host machine has low limits on virtual memory mapping areas, this can cause
out-of-memory exceptions
([errno=12](https://questdb.io/docs/troubleshooting/os-error-codes/)). To
increase this setting and persist this configuration change, mapped memory area
limits can be amended in `/etc/sysctl.conf`:

```ini title="/etc/sysctl.conf"
vm.max_map_count=1048576
```

Each mapped area may consume ~128 bytes for each map count i.e 1048576 may use
1048576\*128 = 134MB of kernel memory.

```bash
# reload configuration
sysctl -p
# query current settings
cat /proc/sys/vm/max_map_count
```
