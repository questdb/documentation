---
title: Minimal HTTP server
description: Configuration settings for the minimal HTTP server in QuestDB.
---

The minimal HTTP server provides the health check and Prometheus metrics
endpoints, running on a separate port (default 9003) from the main HTTP server.
This lightweight server remains responsive even when the main server is under
heavy load.

## http.min.bind.to

- **Default**: `0.0.0.0:9003`
- **Reloadable**: no

IPv4 address and port of the server. `0.0.0.0` binds to all network
interfaces, otherwise the IP address must be one of the existing network
adapters.

## http.min.enabled

- **Default**: `true`
- **Reloadable**: no

Enable or disable the minimal HTTP server.

## http.min.net.connection.hint

- **Default**: `false`
- **Reloadable**: no

Windows-specific flag to overcome OS limitations on TCP backlog size.

## http.min.net.connection.limit

- **Default**: `4`
- **Reloadable**: no

Active connection limit.

## http.min.net.connection.timeout

- **Default**: `300000`
- **Reloadable**: no

Idle connection timeout in milliseconds.

## http.min.worker.affinity

- **Default**: none
- **Reloadable**: no

Core number to pin the worker thread to.

## http.min.worker.count

- **Default**: auto
- **Reloadable**: no

By default, the minimal HTTP server uses the shared thread pool for CPU core
counts of 16 and below, and a dedicated thread for counts above 16. When `0`,
the server uses the shared pool. Do not set the pool size to more than `1`.

## http.min.worker.haltOnError

- **Default**: `false`
- **Reloadable**: no

Flag that indicates if the worker thread must stop when an unexpected error
occurs.
