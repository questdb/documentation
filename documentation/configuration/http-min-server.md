---
title: Minimal HTTP server
description: Configuration settings for the minimal HTTP server in QuestDB.
---

The minimal HTTP server provides the health check, Prometheus metrics, and
lifecycle endpoints, running on a separate port (default 9003) from the main
HTTP server. This lightweight server remains responsive even when the main
server is under heavy load.

It serves `GET /status` (any unbound path answers the same health check),
`GET /metrics` when metrics are enabled, `GET /lifecycle`, and in QuestDB
Enterprise `POST /lifecycle/switch`. See the
[minimal HTTP server](/docs/operations/logging-metrics/#minimal-http-server)
section for the health check and lifecycle endpoints, and
[Failover and role switch](/docs/high-availability/failover/#lifecycle-api) for
the switch endpoint. TLS for this port is configured with the `http.min.tls.*`
settings on the [TLS](/docs/configuration/tls/) page.

This port shares the main HTTP server's
[`http.allowed.hosts`](/docs/configuration/http-server/#httpallowedhosts) and
[`http.browser.allowed.origins`](/docs/configuration/http-server/#httpbrowserallowedorigins)
settings. Without HTTP authentication, a probe, Prometheus scrape, or lifecycle
client using a name such as `questdb.monitoring` receives `403 Forbidden`
unless the name is allowed. The fully qualified
`questdb.monitoring.svc.cluster.local` name is accepted by default.

## http.health.check.authentication.required

- **Default**: `true`
- **Reloadable**: no

Whether `GET /status`, `GET /metrics`, and `GET /lifecycle` require
authentication when the HTTP server does. Set to `false` to let a load balancer
or a Kubernetes probe call them without credentials. `POST /lifecycle/switch`
always requires credentials, regardless of this setting.

Setting this to `false` does not disable the browser request check. When HTTP
authentication is enabled, the host-name check remains skipped even for
endpoints that this setting makes accessible without credentials.

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
