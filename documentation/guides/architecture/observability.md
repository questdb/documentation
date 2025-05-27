---
title: Observability
slug: observability
description: QuestDB provides real-time metrics, a health check endpoint, and logging to monitor performance and simplify troubleshooting.
---


## Observability & diagnostics

- **Metrics:**
  QuestDB exposes detailed [metrics in Prometheus format](/docs/operations/logging-metrics/#metrics), including query
  statistics, memory usage, and I/O details.

- **Health check:**
  A [minimal HTTP server](/docs/operations/logging-metrics/#minimal-http-server) monitors system health.

- **Metadata tables:**
  The engine provides [metadata tables](/docs/reference/function/meta/) to query
   table status, partition status, query execution, and latency.

- **Extensive logging:**
  [Logging](/docs/operations/logging-metrics/) covers SQL parsing, execution, background processing, and runtime exceptions. The framework minimizes performance impact.

- **Real-time metric dashboards:**
  The web console lets you create dashboards that display per-table metrics.

<Screenshot
  alt="Metric dashboard at the QuestDB Console"
  title="Metric dashboard at the QuestDB Console"
  height={447}
  src="images/guides/questdb-internals/telemetry.webp"
  width={745}
/>


## Next Steps

- Back to the [QuestDB Architecture](/docs/guides/architecture/questdb-architecture) overview
- [QuestDB GitHub Repository](https://github.com/questdb/questdb)
- [QuestDB Documentation](/docs)

