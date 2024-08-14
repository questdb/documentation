---
title: Client configuration string
description:
  How to apply the configuration string used in multiple QuestDB clients.
  Demonstrates available options, caveats, and more.
---

The QuestDB clients leverage a configuration string to pass common values.

The presiding method will vary from client-to-client, but the string composition
is consistent.

Naturally, languages will each have their own approach, and these will be
covered in the clients' documentation.

This document provides a general overview.

## Configuration string breakdown

When using the configuration string, the following options are available:

### HTTP transport authentication

- `username` : Username for HTTP basic authentication.
- `password` : Password for HTTP basic authentication.
- `token` : Bearer token for HTTP authentication.

### TCP transport authentication

- `username`: Username for TCP authentication.
- `token`: Token for TCP authentication.

### Auto-flushing

- `auto_flush` : Global switch for the auto-flushing behavior. Options are `on`
  or `off`. Defaults to `on`.
- `auto_flush_rows` : The number of rows that will trigger a flush. This option
  is supported for HTTP transport only. Defaults to 75,000.
- `auto_flush_interval` : The time in milliseconds that will trigger a flush.
  Defaults to 1000. This option is support for HTTP transport only.

The TCP transport for a client automatically flushes when its buffer is full.
The TCP transport utilizes a fixed-size buffer, and its maximum size is the same
as the initial size. Thus, the option `init_buf_size` (see below) effectively
controls the auto-flushing behavior of the TCP transport.

### Buffer

- `init_buf_size` : The initial size of the buffer in bytes. Default: 65536
  (64KiB)
- `max_buf_size` : The maximum size of the buffer in bytes. Default: 104857600
  (100MiB) This option is support for HTTP transport only. TCP transport uses a
  fixed-size buffer and its maximum size is the same as the initial size.

### HTTP Transport

- `retry_timeout` : The time in milliseconds to continue retrying after a failed
  HTTP request. The interval between retries is an exponential backoff starting
  at 10ms and doubling after each failed attempt up to a maximum of 1 second.
  Default: 10000 (10 seconds)
- `request_timeout` : The time in milliseconds to wait for a response from the
  server. This is in addition to the calculation derived from the
  `request_min_throughput` parameter. Default: 10000 (10 seconds)
- `request_min_throughput` : Minimum expected throughput in bytes per second for
  HTTP requests. If the throughput is lower than this value, the connection will
  time out. This is used to calculate an additional timeout on top of
  `request_timeout`. This is useful for large requests. You can set this value
  to `0` to disable this logic.

### TLS encryption

To enable TLS, select the `https` or `tcps` protocol.

The following options are available:

- `tls_roots` : Path to a Java keystore file containing trusted root
  certificates. Defaults to the system default trust store.
- `tls_roots_password` : Password for the keystore file. It's always required
  when `tls_roots` is set.
- `tls_verify` : Whether to verify the server's certificate. This should only be
  used for testing as a last resort and never used in production as it makes the
  connection vulnerable to man-in-the-middle attacks. Options are `on` or
  `unsafe_off`. Defaults to `on`.

## Other considerations

- Please refer to the [ILP overview](/docs/reference/api/ilp/overview) for
  details about transactions, error control, delivery guarantees, health check,
  or table and column auto-creation.
- The method `flush()` can be called to force sending the internal buffer to a
  server, even when the buffer is not full yet.
