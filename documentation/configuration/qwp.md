---
title: QuestDB Wire Protocol (QWP)
description:
  Server-side configuration for QWP ingestion and query endpoints.
---

QWP is QuestDB's columnar binary protocol for high-throughput data ingestion
(`/write/v4`) and streaming query results (`/read/v1`) over WebSocket and UDP.
These properties control protocol limits and the UDP receiver. WebSocket
ingestion and egress share the HTTP server's network settings (port, TLS,
worker threads); see
[HTTP server configuration](/docs/configuration/http-server/) for those.

## Protocol limits

### qwp.max.rows.per.table

- **Default**: `1000000`
- **Reloadable**: no

Maximum number of rows per table block in a single QWP message. The server
rejects batches that exceed this limit with a parse error.

### qwp.max.schemas.per.connection

- **Default**: `65535`
- **Reloadable**: no

Maximum number of distinct schemas the server registers per connection. Each
unique combination of column names and types consumes one schema slot. When
the limit is reached, the server rejects further full-schema messages. For
egress connections, a lower soft cap (4,096 by default) triggers a
`CACHE_RESET` frame that clears and restarts the registry before hitting
this hard limit.

### qwp.max.tables.per.connection

- **Default**: `10000`
- **Reloadable**: no

Maximum number of distinct tables a single connection may write to. The
server rejects messages referencing additional tables once this limit is
reached.

## UDP receiver

:::note

The QWP UDP receiver is a fire-and-forget ingestion path for metrics
workloads where occasional message loss is acceptable. It is disabled by
default. For reliable ingestion, use the WebSocket transport.

:::

### qwp.udp.bind.to

- **Default**: `0.0.0.0:9007`
- **Reloadable**: no

IP address and port the UDP receiver binds to. The default listens on all
network interfaces on port 9007.

### qwp.udp.commit.interval

- **Default**: `2000` (milliseconds)
- **Reloadable**: no

Time interval between commits for data received over UDP. Lower values
reduce the window of uncommitted data at the cost of more frequent I/O.

### qwp.udp.enabled

- **Default**: `false`
- **Reloadable**: no

Enable or disable the QWP UDP receiver.

### qwp.udp.join

- **Default**: `224.1.1.1`
- **Reloadable**: no

Multicast group address the UDP receiver joins. Only relevant when
`qwp.udp.unicast` is `false`.

### qwp.udp.max.uncommitted.datagrams

- **Default**: `1048576`
- **Reloadable**: no

Maximum number of uncommitted datagrams before the receiver forces a commit,
regardless of the time-based commit interval.

### qwp.udp.msg.buffer.size

- **Default**: `65536` (bytes)
- **Reloadable**: no

Size of each message buffer allocated for the UDP receiver.

### qwp.udp.msg.count

- **Default**: `10000`
- **Reloadable**: no

Number of message buffers to pre-allocate. Higher values absorb larger
bursts at the cost of more memory.

### qwp.udp.own.thread

- **Default**: `true`
- **Reloadable**: no

When `true`, the UDP receiver runs in a dedicated thread with a busy-spin
loop for lowest latency. When `false`, the receiver uses the shared worker
pool.

### qwp.udp.own.thread.affinity

- **Default**: `-1` (no affinity)
- **Reloadable**: no

CPU core affinity for the dedicated UDP receiver thread. A value of `-1`
lets the OS schedule the thread. Only applies when `qwp.udp.own.thread` is
`true`.

### qwp.udp.receive.buffer.size

- **Default**: `-1` (OS default)
- **Reloadable**: no

OS-level socket receive buffer size in bytes. A value of `-1` uses the
operating system's default. Increase this if you observe datagram drops
under high throughput.

### qwp.udp.unicast

- **Default**: `true`
- **Reloadable**: no

When `true`, the UDP receiver operates in unicast mode. When `false`, it
joins the multicast group specified by `qwp.udp.join`.
