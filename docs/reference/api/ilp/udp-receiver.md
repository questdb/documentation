---
title: InfluxDB Line Protocol UDP Receiver
sidebar_label: UDP Receiver
description: InfluxDB line protocol UDP receiver reference documentation.
---

:::note

The UDP receiver is deprecated since QuestDB version 6.5.2. We recommend the
[TCP receiver](/docs/reference/api/ilp/overview/) instead.

:::

The UDP receiver can handle both single and multi row write requests. It is
currently single-threaded, and performs both network I/O and write jobs out of
one thread. The UDP worker thread can work either on its own thread or use the
common thread pool. It supports both multicast and unicast.

## Overview

By default, QuestDB listens for `multicast` line protocol packets over UDP on
`232.1.2.3:9009`. If you are running QuestDB with Docker, you will need to
publish the port `9009` using `-p 9009:9009` and publish multicast packets with
TTL of at least 2. This port can be customized, and you can also configure
QuestDB to listen for `unicast`.

The UDP receiver is disabled by default. To enable it, change the
`line.udp.enabled` setting in the
[server configuration](/docs/reference/configuration/).

## Commit strategy

Uncommitted rows are committed either:

- after receiving a number of continuous messages equal to
  `line.udp.commit.rate` or
- when UDP receiver has idle time, i.e. ingestion slows down or completely
  stops.

## Configuration

The UDP receiver configuration can be completely customized using
[configuration keys](/docs/reference/configuration/#udp-specific-settings). You
can use this to configure the IP address and port the receiver binds to, commit
rates, buffer size, whether it should run on a separate thread etc.

## Examples

Find an example of how to use this in the
[InfluxDB sender library section](/docs/reference/api/java-embedded/#influxdb-sender-library).
