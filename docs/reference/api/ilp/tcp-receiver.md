---
title: InfluxDB Line Protocol TCP Receiver
sidebar_label: TCP Receiver
description: InfluxDB line protocol TCP receiver reference documentation.
---

## Capacity planning

TCP receiver makes use of 3 logical thread pools:

- I/O worker pool - `line.tcp.io.worker.count`, threads responsible for handling
  incoming TCP connections and parsing received InfluxDB Line Protocol messages
- writer pool - `line.tcp.writer.worker.count`, threads responsible for table
  writes
- shared pool - `shared.worker.count`, threads responsible for handling out-of-order data

Depending on the number of concurrent TCP connections `io worker pool` size
might need to be adjusted. The ideal ratio is `1:1` - a thread per connection.
In less busy environments it is possible for single `io worker` thread to handle
multiple connections simultaneously. We recommend starting with conservative
ratio, measure and increase the ratio up to `1:1`. More threads than connections
will be wasting server CPU.

Another consideration is the number of tables updated concurrently.
`writer pool` should be tuned to increase concurrency. `writer` threads can also
handle multiple tables concurrently. `1:1` ratio is the maximum required ratio
between `writer` threads and tables. If `1:1` ratio is not an option, avoid
writing to all tables from each connection. Instead, group connections and
tables. For example, if there are 10 tables, 8 TCP connections and `writer pool`
size is set to 2, 4 TCP connections may be used to write into tables 1-5, while
4 connections may write into tables 6-10.

:::note

Sending updates for multiple tables from a single TCP connection might be
inefficient. Consider using multiple connections to improve performance. If a
single connection is unavoidable, keep `writer pool` size set to 1 for optimal
CPU resource utilization.

:::

When ingesting data out of order (O3) `shared pool` accelerates O3 tasks. It is
also responsible for SQL execution. `shared pool` size should be set to use the
remaining available CPU cores.