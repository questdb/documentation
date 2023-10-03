---
title: Health monitoring
description:
  How to configure health monitoring for querying the status of a QuestDB
  instance using an embedded server, Prometheus metrics and Alertmanager.
---

This document describes the options available for monitoring the health of a
QuestDB instance. There are options for minimal health checks via a `min` server
which provides a basic 'up/down' check, or detailed metrics in Prometheus format
exposed via an HTTP endpoint.

## Prometheus metrics endpoint

Prometheus is an open-source systems monitoring and alerting toolkit. Prometheus
collects and stores metrics as time-series data, i.e. metrics information is
stored with the timestamp at which it was recorded, alongside optional key-value
pairs called labels.

QuestDB exposes a `/metrics` endpoint which provides internal system metrics in
Prometheus format. To use this functionality and get started with example
configuration, refer to the
[Prometheus documentation](/docs/third-party-tools/prometheus/).

## Min health server

REST APIs will often be situated behind a load balancer that uses a monitor URL
for its configuration. Having a load balancer query the QuestDB REST endpoints
(on port `9000` by default) will cause internal logs to become excessively
noisy. Additionally, configuring per-URL logging would increase server latency.

To provide a dedicated health check feature that would have no performance knock
on other system components, we opted to decouple health checks from the REST
endpoints used for querying and ingesting data. For this purpose, a `min` HTTP
server runs embedded in a QuestDB instance and has a separate log and thread
pool configuration.

The configuration section for the `min` HTTP server is available in the
[minimal HTTP server reference](/docs/reference/configuration/#minimal-http-server).

The `min` server is enabled by default and will reply to any `HTTP GET` request
to port `9003`:

```shell title="GET health status of local instance"
curl -v http://127.0.0.1:9003
```

The server will respond with an HTTP status code of `200`, indicating that the
system is operational:

```shell title="200 'OK' response"
*   Trying 127.0.0.1...
* TCP_NODELAY set
* Connected to 127.0.0.1 (127.0.0.1) port 9003 (#0)
> GET / HTTP/1.1
> Host: 127.0.0.1:9003
> User-Agent: curl/7.64.1
> Accept: */*
>
< HTTP/1.1 200 OK
< Server: questDB/1.0
< Date: Tue, 26 Jan 2021 12:31:03 GMT
< Transfer-Encoding: chunked
< Content-Type: text/plain
<
* Connection #0 to host 127.0.0.1 left intact
```

Path segments are ignored which means that optional paths may be used in the URL
and the server will respond with identical results, e.g.:

```shell title="GET health status with arbitrary path"
curl -v http://127.0.0.1:9003/status
```

## Unhandled error detection

When the metrics subsystem is
[enabled](/docs/third-party-tools/prometheus/#scraping-prometheus-metrics-from-questdb)
on the database, the health endpoint may be configured to check the occurrences
of any unhandled errors since the database started. For any errors
detected, it returns the HTTP 500 status code. The check is based on the
`questdb_unhandled_errors_total` metric.

To enabled

```ini title="server.conf to enable critical error checks in the health check endpoint"
metrics.enabled=true
http.pessimistic.health.check.enabled=true
```

When the metrics subsystem is disabled, the health check endpoint always returns
the HTTP 200 status code.

## Avoiding CPU starvation

On systems with
[8 Cores and less](/docs/deployment/capacity-planning/#cpu-cores), contention
for threads might increase the latency of health check service responses. If you
are in a situation where a load balancer thinks QuestDB service is dead with
nothing apparent in QuestDB logs, you may need to configure a dedicated thread
pool for the health check service. For more reference, see the
[minimal HTTP server configuration](/docs/reference/configuration/#minimal-http-server).
