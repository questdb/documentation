---
title: QuestDB Wire Protocol (QWP)
description:
  Server-side configuration for QWP ingestion and query endpoints.
---

QWP is QuestDB's columnar binary protocol for high-throughput data ingestion
(`/write/v4`) and streaming query results (`/read/v1`) over WebSocket and UDP.
These properties control protocol limits, browser connections, and the UDP
receiver. WebSocket
ingestion and egress share the HTTP server's network settings (port, TLS,
worker threads); see
[HTTP server configuration](/docs/configuration/http-server/) for those.

## Protocol limits

### qwp.max.rows.per.table

- **Default**: `1000000`
- **Reloadable**: no

Maximum number of rows per table block in a single QWP message. The server
rejects batches that exceed this limit with a parse error.

### qwp.max.tables.per.connection

- **Default**: `10000`
- **Reloadable**: no

Maximum number of distinct tables a single connection may write to. The
server rejects messages referencing additional tables once this limit is
reached.

### qwp.max.uncommitted.rows

- **Default**: `1000000`
- **Reloadable**: no

Maximum number of rows that may sit uncommitted in WAL writers across
`FLAG_DEFER_COMMIT` frames before the server forces a commit. This is the
server-side bound on the batch-splitting mechanism described in the
[QWP ingress protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/#flag_defer_commit).

## Browser connections

A browser sends an `Origin` header with every WebSocket upgrade. QuestDB
accepts browser upgrades on the QWP routes when the page has the same origin as
QuestDB, and rejects other origins unless they are listed here. These settings
are used by web applications built on the
[browser client](/docs/connect/clients/browser/). Clients that send no `Origin`
header, such as the Node.js client, are not affected.

### qwp.browser.allowed.origins

- **Default**: empty
- **Reloadable**: yes

Comma-separated list of browser origins, besides QuestDB's own, that may open
QWP WebSockets on `/write/v4` and `/read/v1`, for example
`https://app.example.com,https://desk.example.com:8443`. Write each origin
exactly as browsers send it: scheme and lowercase host, a port only when it is
not the default for the scheme, and no path, trailing slash, or wildcard. An
entry in any other form stops the server from starting. A change applied with
`reload_config()` that contains such an entry is ignored, the previous list
stays in force, and the error appears only in the server log.

With authentication enabled, an upgrade from a listed origin must carry its
credential in the WebSocket subprotocol, which the browser client sends when
configured with `auth`. QuestDB accepts that credential only from a listed
origin, so a page served from QuestDB's own origin that uses `auth` must list
that origin too. QuestDB ignores session cookies on cross-origin upgrades. List
only trusted applications: a listed origin can open authenticated connections
to the server. The setting does not enable CORS on the REST API.

### qwp.browser.tls.termination.enabled

- **Default**: `false`
- **Reloadable**: no

Treats plain HTTP connections as secure when checking whether a browser upgrade
is same-origin. Enable it when a reverse proxy terminates TLS and forwards to
QuestDB over plain HTTP: otherwise the page's `https://` origin does not match
the plain connection, and browser upgrades fail. The proxy must forward the
browser's original `Host` header, port included, because QuestDB compares it
with the `Origin` header. Enable this setting only when QuestDB's HTTP port is
reachable through the proxy alone.

## Egress

### qwp.egress.compression.force.level

- **Default**: `0` (off)
- **Reloadable**: yes

Forces a server-side zstd compression level for query result batches,
overriding the level the client requests via `X-QWP-Accept-Encoding`. `0`
disables the override and honours the client's request. Any other value must
be in the range `1`-`9`; the server refuses to start otherwise.

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
