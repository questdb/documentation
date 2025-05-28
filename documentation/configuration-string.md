---
title: Client configuration string
description:
  How to apply the configuration string used in multiple QuestDB clients.
  Demonstrates available options, caveats, and more.
---

You configure a QuestDB ingestion client with a configuration string. The syntax
is the same in all clients, and there are a number of common options. There are
also language-specific settings.

This document provides a general overview and documents the common options.

## Configuration string breakdown

These are the common configuration options.

### Protocol Version

`protocol_version` — sets the line protocol version

Valid options are:

| Value  | Behavior                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| `1`    | - plain-text serialization <br /> - compatible with InfluxDB servers <br /> - no array type support                 |
| `2`    | - binary encoding for f64 <br /> - full support for array                                                           |
| `auto` | - **HTTP/HTTPS**: negotiates the best version with the server <br /> - **TCP/TCPS**: no negotiation, uses version 1 |

### HTTP transport authentication

- `username` — username for HTTP basic authentication
- `password` — password for HTTP basic authentication
- `token` — bearer token for HTTP authentication

### TCP transport authentication

- `username` — username for TCP authentication
- `token` — token for TCP authentication

### Auto-flushing

- `auto_flush` — global switch for the auto-flushing behavior. Options are `on`
  or `off`. Defaults to `on`
- `auto_flush_rows` — number of rows that will trigger a flush. This option is
  supported for HTTP transport only. Defaults to 75,000
- `auto_flush_interval` — time in milliseconds that will trigger a flush.
  Defaults to 1000. Used only for HTTP transport

When using the TCP transport, the client automatically flushes when its buffer
is full. It uses a fixed-size buffer, whose size you can set with
`init_buf_size` (see below).

### Buffer

- `init_buf_size` — initial size of the buffer in bytes. Default: 65536
  (64KiB). Also sets the fixed buffer size for TCP transport
- `max_buf_size` — maximum size of the buffer in bytes. Default: 104857600
  (100MiB). Used only for HTTP transport

### HTTP Transport

- `retry_timeout` — time in milliseconds to continue retrying after a failed
  HTTP request. The interval between retries is an exponential backoff starting
  at 10ms and doubling after each failed attempt up to a maximum of 1 second.
  Default: 10000 (10 seconds)
- `request_timeout` — time in milliseconds to wait for a response from the
  server. This is in addition to the calculation derived from the
  `request_min_throughput` parameter. Default: 10000 (10 seconds)
- `request_min_throughput` — minimum expected throughput in bytes per second for
  HTTP requests. If the throughput is lower than this value, the connection will
  time out. This is used to calculate an additional timeout on top of
  `request_timeout`. This is useful for large requests. You can set this value
  to `0` to disable this logic

### TLS encryption

To enable TLS, select the `https` or `tcps` protocol.

The following options are available:

- `tls_roots` — path to a Java keystore file containing trusted root
  certificates. Defaults to the system default trust store
- `tls_roots_password` — password for the keystore file. It's always required
  when `tls_roots` is set
- `tls_verify` — whether to verify the server's certificate. This should only be
  used for testing as a last resort and never used in production as it makes the
  connection vulnerable to man-in-the-middle attacks. Options are `on` or
  `unsafe_off`. Defaults to `on`

## Other considerations

- Please refer to the [ILP overview](/docs/reference/api/ilp/overview) for
  details about transactions, error control, delivery guarantees, health check,
  or table and column auto-creation.
- The method `flush()` can be called to force sending the internal buffer to a
  server, even when the buffer is not full yet.
