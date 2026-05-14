---
title: Ingestion (ILP/HTTP)
description: Configuration settings for InfluxDB Line Protocol ingestion in QuestDB.
---

These settings control data ingestion via InfluxDB Line Protocol (ILP). ILP
over HTTP is the preferred ingestion method. ILP over TCP is available for
legacy workloads. UDP is deprecated.

For general HTTP server settings (port, buffers, connections), see the
[HTTP server](/docs/configuration/http-server/) configuration.

## General

### line.auto.create.new.columns

- **Default**: `true`
- **Reloadable**: no

When enabled, automatically creates new columns when they appear in the
ingested data. When disabled, messages with new columns will be rejected.

### line.auto.create.new.tables

- **Default**: `true`
- **Reloadable**: no

When enabled, automatically creates new tables when they appear in the
ingested data. When disabled, messages for non-existent tables will be
rejected.

### line.default.partition.by

- **Default**: `DAY`
- **Reloadable**: no

Table partition strategy for tables created automatically by ILP. Possible
values are: `HOUR`, `DAY`, `WEEK`, `MONTH`, and `YEAR`.

### line.log.message.on.error

- **Default**: `true`
- **Reloadable**: no

Controls whether malformed ILP messages are printed to the server log when
errors occur.

## HTTP

ILP over HTTP is the preferred way of ingesting data.

### line.http.enabled

- **Default**: `true`
- **Reloadable**: no

Enable ILP over HTTP. Default port is 9000. Enabled by default in open source
versions, defaults to false and must be explicitly enabled for Enterprise.

### line.http.ping.version

- **Default**: `v2.2.2`
- **Reloadable**: no

Version information for the ping response of ILP over HTTP.

## TCP

### line.tcp.auth.db.path

- **Default**: none
- **Reloadable**: no

Path to the authentication database file.

### line.tcp.commit.interval.default

- **Default**: `1000`
- **Reloadable**: no

Default commit interval in milliseconds.

### line.tcp.commit.interval.fraction

- **Default**: `0.5`
- **Reloadable**: no

Commit lag fraction. Used to calculate the commit interval for a table:
`commit_interval = commit_lag * fraction`. The calculated interval defines
how long uncommitted data remains uncommitted.

### line.tcp.connection.pool.capacity

- **Default**: `64`
- **Reloadable**: no

Maximum number of pooled connections for this interface.

### line.tcp.disconnect.on.error

- **Default**: `true`
- **Reloadable**: no

Disconnect TCP sockets that send malformed messages.

### line.tcp.enabled

- **Default**: `true`
- **Reloadable**: no

Enable or disable ILP over TCP.

### line.tcp.io.worker.affinity

- **Default**: none
- **Reloadable**: no

Comma-separated list of CPU core indexes to pin I/O worker threads to.
Core indexes are 0-based.

### line.tcp.io.worker.count

- **Default**: `0`
- **Reloadable**: no

Number of dedicated I/O worker threads for parsing TCP input. When `0`,
uses the shared worker pool.

### line.tcp.io.worker.sleep.threshold

- **Default**: `1000`
- **Reloadable**: no

Number of consecutive idle loop iterations before the I/O worker goes to
sleep.

### line.tcp.io.worker.yield.threshold

- **Default**: `10`
- **Reloadable**: no

Number of consecutive idle loop iterations before the I/O worker thread
yields.

### line.tcp.maintenance.job.interval

- **Default**: `1000`
- **Reloadable**: no

Maximum time in milliseconds between maintenance jobs committing uncommitted
data on inactive tables.

### line.tcp.max.measurement.size

- **Default**: `32768`
- **Reloadable**: no

Maximum size of any measurement.

### line.tcp.min.idle.ms.before.writer.release

- **Default**: `500`
- **Reloadable**: no

Minimum idle time in milliseconds before a table writer is released.

### line.tcp.msg.buffer.size

- **Default**: `32768`
- **Reloadable**: no

Size of the buffer read from the queue. Maximum size of a write request,
regardless of the number of measurements.

### line.tcp.net.bind.to

- **Default**: `0.0.0.0:9009`
- **Reloadable**: no

IP address and port for the TCP listener. By default, listens on all network
interfaces.

### line.tcp.net.connection.hint

- **Default**: `false`
- **Reloadable**: no

Windows-specific flag to overcome OS limitations on TCP backlog size.

### line.tcp.net.connection.limit

- **Default**: `256`
- **Reloadable**: yes

Maximum number of simultaneous connections. Controls server memory
consumption.

### line.tcp.net.connection.queue.timeout

- **Default**: `5000`
- **Reloadable**: no

Time in milliseconds a connection can wait in the listen backlog queue before
it is refused. Connections are aggressively removed from the backlog until
the active connection limit is breached.

### line.tcp.net.connection.rcvbuf

- **Default**: `-1`
- **Reloadable**: no

Maximum receive buffer size on each TCP socket. If set to `-1`, the socket
receive buffer remains unchanged from OS defaults.

### line.tcp.net.connection.timeout

- **Default**: `300000`
- **Reloadable**: no

Connection idle timeout in milliseconds. Connections are closed by the server
when this timeout lapses.

### line.tcp.timestamp

- **Default**: `n`
- **Reloadable**: no

Input timestamp resolution. Possible values are `n`, `u`, `ms`, `s`, and `h`.

### line.tcp.writer.halt.on.error

- **Default**: `false`
- **Reloadable**: no

Flag that indicates if the writer thread must stop when an unexpected error
occurs.

### line.tcp.writer.queue.capacity

- **Default**: `128`
- **Reloadable**: no

Size of the queue between I/O jobs and writer jobs. Each queue entry
represents a measurement.

### line.tcp.writer.worker.affinity

- **Default**: none
- **Reloadable**: no

Comma-separated list of CPU core indexes to pin writer worker threads to.
Core indexes are 0-based.

### line.tcp.writer.worker.count

- **Default**: `0`
- **Reloadable**: no

Number of dedicated I/O worker threads for writing data to tables. When `0`,
uses the shared worker pool.

### line.tcp.writer.worker.sleep.threshold

- **Default**: `1000`
- **Reloadable**: no

Number of consecutive idle loop iterations before the writer worker goes to
sleep.

### line.tcp.writer.worker.yield.threshold

- **Default**: `10`
- **Reloadable**: no

Number of consecutive idle loop iterations before the writer worker thread
yields.

## UDP (deprecated)

:::note

The UDP receiver is deprecated since QuestDB version 6.5.2. We recommend
[ILP over HTTP](/docs/connect/compatibility/ilp/overview/) instead.

:::

### line.udp.bind.to

- **Default**: `0.0.0.0:9009`
- **Reloadable**: no

IP address and port for the UDP listener. By default, listens on all network
interfaces.

### line.udp.commit.mode

- **Default**: `nosync`
- **Reloadable**: no

Commit durability. Available values are `nosync`, `sync`, and `async`.

### line.udp.commit.rate

- **Default**: `1000000`
- **Reloadable**: no

For packet bursts, the number of continuously received messages after which
the receiver will force a commit. The receiver commits regardless of this
parameter when there are no messages.

### line.udp.enabled

- **Default**: `false`
- **Reloadable**: no

Enable or disable the UDP receiver.

### line.udp.join

- **Default**: `232.1.2.3`
- **Reloadable**: no

Multicast address the receiver joins. Ignored when the receiver is in
unicast mode.

### line.udp.msg.buffer.size

- **Default**: `2048`
- **Reloadable**: no

Buffer used to receive a single message. Should be roughly equal to your MTU
size.

### line.udp.msg.count

- **Default**: `10000`
- **Reloadable**: no

Linux only. Maximum number of messages to receive at once via the
`recvmmsg()` system call.

### line.udp.own.thread

- **Default**: `false`
- **Reloadable**: no

When `true`, the UDP receiver uses its own thread with busy spin for
performance. When `false`, the receiver uses shared worker threads.

### line.udp.own.thread.affinity

- **Default**: `-1`
- **Reloadable**: no

CPU core to pin the receiver thread to. `-1` means no affinity (OS
schedules the thread). Only valid when `line.udp.own.thread` is `true`.

### line.udp.receive.buffer.size

- **Default**: `8388608`
- **Reloadable**: no

UDP socket buffer size. Larger buffers help reduce message loss during
bursts.

### line.udp.timestamp

- **Default**: `n`
- **Reloadable**: no

Input timestamp resolution. Possible values are `n`, `u`, `ms`, `s`, and `h`.

### line.udp.unicast

- **Default**: `false`
- **Reloadable**: no

When `true`, UDP uses unicast. Otherwise multicast.
