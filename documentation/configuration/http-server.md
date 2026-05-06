---
title: HTTP server
description: Configuration settings for the Web Console and REST API in QuestDB.
---

The HTTP server hosts the [Web Console](/docs/getting-started/web-console/overview/),
the REST API, and ILP-over-HTTP ingestion, all on the same port (default 9000).
These settings control networking, authentication, query result formatting,
text import parsing, and context paths.

## Server

### http.bind.to

- **Default**: `0.0.0.0:9000`
- **Reloadable**: no

IP address and port of the HTTP server. `0.0.0.0` binds to all network
interfaces. You can specify the IP address of any individual network interface.

### http.enabled

- **Default**: `true`
- **Reloadable**: no

Enable or disable the HTTP server.

### http.frozen.clock

- **Default**: `false`
- **Reloadable**: no

Sets the clock to always return zero. Used for internal testing.

### http.server.keep.alive

- **Default**: `true`
- **Reloadable**: no

If set to `false`, the server will disconnect the client after completion of
each request.

### http.version

- **Default**: `HTTP/1.1`
- **Reloadable**: no

Protocol version. Other supported value is `HTTP/1.0`.

### http.worker.affinity

- **Default**: none
- **Reloadable**: no

Comma-separated list of CPU core indexes. The number of items must equal the
worker count.

### http.worker.count

- **Default**: `0`
- **Reloadable**: no

Number of threads in the private HTTP worker pool. When `0`, the HTTP server
uses the shared worker pool. Values above `0` enable a private pool.

### http.worker.haltOnError

- **Default**: `false`
- **Reloadable**: no

Flag that indicates if the worker thread must stop when an unexpected error
occurs. Changing the default value is strongly discouraged.

## Authentication

### http.password

- **Default**: N/A
- **Reloadable**: no

Password for HTTP Basic Authentication in QuestDB Open Source. QuestDB
Enterprise supports more advanced authentication via RBAC.

### http.user

- **Default**: N/A
- **Reloadable**: no

Username for HTTP Basic Authentication in QuestDB Open Source. QuestDB
Enterprise supports more advanced authentication via RBAC.

## Connections

### http.connection.pool.initial.capacity

- **Default**: `4`
- **Reloadable**: no

Initial size of the pool of reusable objects that hold connection state.
Should be configured to the maximum realistic load to avoid runtime resizes.

### http.connection.string.pool.capacity

- **Default**: `128`
- **Reloadable**: no

Initial size of the string pool shared by the HTTP header and multipart
content parsers.

### http.ilp.connection.limit

- **Default**: none
- **Reloadable**: no

Soft limit for simultaneous ILP connections. When breached, new connections
are rejected but existing connections remain open as long as
`http.net.connection.limit` is not exceeded.

### http.keep-alive.max

- **Default**: `10000`
- **Reloadable**: no

See `http.keep-alive.timeout`. Must be `0` when `http.version` is set to
`HTTP/1.0`.

### http.keep-alive.timeout

- **Default**: `5`
- **Reloadable**: no

Used together with `http.keep-alive.max` to set the value of the HTTP
`Keep-Alive` response header, instructing the browser to keep the TCP
connection open. Must be `0` when `http.version` is set to `HTTP/1.0`.

### http.net.bind.to

- **Default**: `0.0.0.0:9000`
- **Reloadable**: no

IP address and port of the HTTP server.

### http.net.connection.hint

- **Default**: `false`
- **Reloadable**: no

Windows-specific flag to overcome OS limitations on TCP backlog size.

### http.net.connection.limit

- **Default**: `64`
- **Reloadable**: no

Maximum number of simultaneous TCP connections to the HTTP server. Controls
server memory consumption.

### http.net.connection.queue.timeout

- **Default**: `5000`
- **Reloadable**: no

Time in milliseconds a connection can wait in the listen backlog queue before
it is refused. Connections are aggressively removed from the backlog until the
active connection limit is breached.

### http.net.connection.rcvbuf

- **Default**: `2M`
- **Reloadable**: no

Maximum receive buffer size on each TCP socket. If set to `-1`, the socket
receive buffer size remains unchanged from OS defaults.

### http.net.connection.sndbuf

- **Default**: `2M`
- **Reloadable**: no

Maximum send buffer size on each TCP socket. If set to `-1`, the socket send
buffer size remains unchanged from OS defaults.

### http.net.connection.timeout

- **Default**: `300000`
- **Reloadable**: no

TCP connection idle timeout in milliseconds. The connection is closed by the
HTTP server when this timeout lapses.

### http.query.connection.limit

- **Default**: none
- **Reloadable**: no

Soft limit for simultaneous HTTP query connections. When breached, new
connections are rejected but existing connections remain open as long as
`http.net.connection.limit` is not exceeded.

## Buffers

### http.allow.deflate.before.send

- **Default**: `false`
- **Reloadable**: no

Flag that indicates if Gzip compression of outgoing data is allowed.

### http.multipart.header.buffer.size

- **Default**: `512`
- **Reloadable**: yes

Buffer size in bytes used by the HTTP multipart content parser.

### http.multipart.idle.spin.count

- **Default**: `10000`
- **Reloadable**: no

How long the code accumulates incoming data chunks for column and delimiter
analysis.

### http.receive.buffer.size

- **Default**: `1M`
- **Reloadable**: yes

Size of the receive buffer.

### http.request.header.buffer.size

- **Default**: `64K`
- **Reloadable**: yes

Size of the internal buffer allocated for HTTP request headers. The value is
rounded up to the nearest power of 2. When HTTP requests contain headers that
exceed the buffer size, the server will disconnect the client with an HTTP
error in the server log.

### http.send.buffer.size

- **Default**: `2M`
- **Reloadable**: yes

Size of the internal send buffer. Larger buffers result in fewer I/O
interruptions at the expense of memory usage per connection. 2 MB is the
optimal value for most workloads.

## Security

### circuit.breaker.buffer.size

- **Default**: `32`
- **Reloadable**: no

Size of buffer to read from the HTTP connection. If this buffer returns zero
and the HTTP client is no longer sending data, SQL processing will be
terminated.

### circuit.breaker.throttle

- **Default**: `2000000`
- **Reloadable**: no

Number of internal iterations (such as loops over data) before checking if
the HTTP connection is still open.

### http.pessimistic.health.check.enabled

- **Default**: `false`
- **Reloadable**: no

When enabled, the health check returns HTTP 500 for any unhandled errors
since the server started.

### http.security.interrupt.on.closed.connection

- **Default**: `true`
- **Reloadable**: no

Enables termination of SQL processing if the HTTP connection is closed. The
connection is checked after `circuit.breaker.throttle` iterations. The
mechanism also reads from the input stream and discards data, since some HTTP
clients send keep-alive data between requests. `circuit.breaker.buffer.size`
controls the buffer size for this.

### http.security.max.response.rows

- **Default**: `2^63-1`
- **Reloadable**: no

Limit the number of response rows over HTTP.

### http.security.readonly

- **Default**: `false`
- **Reloadable**: no

Forces HTTP read-only mode when `true`, disabling commands which modify data
or data structure (e.g. INSERT, UPDATE, CREATE TABLE).

## Query cache

### http.query.cache.block.count

- **Default**: `4`
- **Reloadable**: no

Number of blocks for the query cache.

### http.query.cache.enabled

- **Default**: `true`
- **Reloadable**: no

Enable or disable the query cache. Cache capacity is
`number_of_blocks * number_of_rows`.

### http.query.cache.row.count

- **Default**: `16`
- **Reloadable**: no

Number of rows for the query cache.

## JSON query output

### http.json.query.connection.check.frequency

- **Default**: `1000000`
- **Reloadable**: no

The value to throttle checking if the client socket has been disconnected.
Changing the default value is strongly discouraged.

### http.json.query.double.scale

- **Default**: `12`
- **Reloadable**: no

The scale of string representation of `DOUBLE` values.

### http.json.query.float.scale

- **Default**: `4`
- **Reloadable**: no

The scale of string representation of `FLOAT` values.

## Text import parsing

These settings control the heuristic text parser used for CSV import via the
`/imp` endpoint.

### http.text.analysis.max.lines

- **Default**: `1000`
- **Reloadable**: no

Number of lines to read on CSV import for heuristics which determine column
names and types. Lower values detect schemas quicker but possibly with less
accuracy. 1000 is the maximum.

### http.text.date.adapter.pool.capacity

- **Default**: `16`
- **Reloadable**: no

Size of the date adapter pool. Should be set to the anticipated maximum
number of `DATE` fields a text input can have.

### http.text.json.cache.limit

- **Default**: `16384`
- **Reloadable**: no

JSON parser cache limit. The cache is used to compose JSON elements broken up
by TCP. This value limits the maximum length of individual tags or tag values.

### http.text.json.cache.size

- **Default**: `8192`
- **Reloadable**: no

Initial size of the JSON parser cache. Must not exceed
`http.text.json.cache.limit`. Should be set to avoid runtime resizes.

### http.text.lexer.string.pool.capacity

- **Default**: `64`
- **Reloadable**: no

Initial capacity of the string pool which wraps `STRING` column types in text
input. Should correspond to the maximum anticipated number of STRING columns.

### http.text.max.required.delimiter.stddev

- **Default**: `0.1222d`
- **Reloadable**: no

Maximum standard deviation for the algorithm that calculates text file
delimiters. When the parser cannot recognise a delimiter, it logs the
calculated and maximum standard deviation for the delimiter candidate.

### http.text.max.required.line.length.stddev

- **Default**: `0.8`
- **Reloadable**: no

Maximum standard deviation for the algorithm that classifies input as text
or binary. Values above this threshold cause input to be considered binary.

### http.text.metadata.string.pool.capacity

- **Default**: `128`
- **Reloadable**: no

Initial size of the pool for objects that wrap individual elements of metadata
JSON, such as column names, date pattern strings, and locale values.

### http.text.roll.buffer.limit

- **Default**: `4M`
- **Reloadable**: no

The limit of the text roll buffer. See `http.text.roll.buffer.size`.

### http.text.roll.buffer.size

- **Default**: `1024`
- **Reloadable**: no

The roll buffer holds a copy of a line that has been broken up by TCP. Should
be set to the maximum length of a text line in the input.

### http.text.timestamp.adapter.pool.capacity

- **Default**: `64`
- **Reloadable**: no

Size of the timestamp adapter pool. Should be set to the anticipated maximum
number of `TIMESTAMP` fields a text input can have.

### http.text.utf8.sink.size

- **Default**: `4096`
- **Reloadable**: no

Initial size of the UTF-8 adapter sink. Should correspond to the maximum
individual field value length in text input.

## Context paths

### http.context.execute

- **Default**: `/exec`
- **Reloadable**: no

Context path for the SQL execution service.

### http.context.export

- **Default**: `/exp`
- **Reloadable**: no

Context path for the SQL result CSV export service.

### http.context.ilp

- **Default**: `/write,/api/v2/write`
- **Reloadable**: no

Context paths for the InfluxDB Line Protocol (ILP) HTTP services. Not used
by the Web Console.

### http.context.ilp.ping

- **Default**: `/ping`
- **Reloadable**: no

Context path for the ILP ping endpoint.

### http.context.import

- **Default**: `/imp`
- **Reloadable**: no

Context path for the file import service.

### http.context.settings

- **Default**: `/settings`
- **Reloadable**: no

Context path for the service which provides server-side settings to the Web
Console.

### http.context.table.status

- **Default**: `/chk`
- **Reloadable**: no

Context path for the table status service used by the Import UI in the Web
Console.

### http.context.warnings

- **Default**: `/warnings`
- **Reloadable**: no

Context path for the Web Console warnings service.

### http.context.web.console

- **Default**: `/`
- **Reloadable**: no

Context path for the Web Console. If other REST services remain on the
default context paths, they will move to the same context path as the Web
Console. ILP HTTP services are not affected. When default context paths are
changed, QuestDB creates copies of services on the Web Console paths so that
both the Web Console and custom services remain operational.

## Redirects

### http.redirect.1

- **Default**: `/ -> /index.html`
- **Reloadable**: no

Redirect configuration. Format is `source -> destination`.

### http.redirect.count

- **Default**: `1`
- **Reloadable**: no

Number of HTTP redirects. All redirects are 301 (Moved Permanently).

## Static content

### http.static.index.file.name

- **Default**: `index.html`
- **Reloadable**: no

Name of the index file for the Web Console.

### http.static.public.directory

- **Default**: `public`
- **Reloadable**: no

The name of the directory for the public web site.
