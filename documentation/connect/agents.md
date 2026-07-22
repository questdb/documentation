---
slug: /connect/agents
title: Agents
description:
  How AI agents operate QuestDB — which protocols they use, what tooling
  exists, and how to give them safe access.
---

AI agents — Claude Code, Cursor, OpenAI Codex, autonomous research tools —
are first-class clients of QuestDB. They drive the database the same way a
developer would: discover the schema, write SQL, plot results, ingest new
data. What changes is the loop: an agent runs that cycle continuously,
often without a human in the inner loop.

This page covers the three things to know:

1. [Protocols](#protocols) — which endpoints agents use, and when.
2. [Tooling](#tooling) — concrete agents and skills that work with QuestDB.
3. [Practices](#practices) — how to give an agent safe, scoped access.

For a hands-on walkthrough with named agents, see
[AI Coding Agents](/docs/getting-started/ai-coding-agents/) in Getting
Started.

## Protocols

Agents reach QuestDB through the same interfaces as any other client. The
right choice depends on what the agent is doing and which SDK or framework
it ships with.

| Interface                                                 | Best for                                                                              | Why                                                                                                                                                                          |
|-----------------------------------------------------------|---------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [**QWP egress**](/docs/connect/wire-protocols/qwp-egress-websocket/)   | The primary path for executing SQL — DDL, exploratory SELECT, and large result streaming. | Binary, columnar, byte-credit flow control, multi-host failover. Use a native [client library](/docs/connect/overview/) when one exists for the agent's runtime; otherwise an agent can implement one directly against the protocol spec. |
| [**QWP ingress**](/docs/connect/wire-protocols/qwp-ingress-websocket/) | The primary path for ingesting data — agentic ETL, sensor feeds, bulk loads.          | Native binary protocol with multi-host failover and store-and-forward built into the client.                                                                                  |
| [**REST API**](/docs/connect/compatibility/rest-api/)                     | Schema discovery and small ad-hoc queries (a few hundred rows or fewer).             | HTTP + JSON. Every agent framework supports it; no SDK to install. `SHOW TABLES` / `SHOW COLUMNS` and other lookups map naturally to function-calling tools.                  |

**QWP egress is the recommended path for any sustained SQL work** —
exploratory or production. Reach for REST when the agent is doing schema
discovery or pulling small result sets that fit comfortably in a single
HTTP response.

## Tooling

### General-purpose coding agents

Claude Code, OpenAI Codex, Cursor, Aider, and similar code-execution agents
work with QuestDB out of the box. They read the public QuestDB documentation
and generate code that talks to a QWP client library or the REST API. No
setup, no MCP server required — point them at a QuestDB endpoint and ask.

See [AI Coding Agents](/docs/getting-started/ai-coding-agents/) for the
quickstart, including the public demo at `https://demo.questdb.io/`.

### QuestDB agent skills (Claude)

The
[QuestDB agent skill](/docs/getting-started/ai-coding-agents/#questdb-agent-skill)
embeds QuestDB-specific context (SQL idioms, ingestion patterns, Grafana
dashboards) directly into the agent. Claude Code loads it on demand, so the
agent produces correct `SAMPLE BY`, `LATEST ON`, and time-series queries on
the first try instead of approximating PostgreSQL syntax.

The
[TSBS Benchmark skill](/docs/getting-started/ai-coding-agents/#tsbs-benchmark-skill)
goes further: it automates end-to-end ingestion benchmarking, useful when an
agent is evaluating QuestDB against alternative time-series databases.

## Practices

### Schema discovery

Agents need to know the shape of the data before they can query it. The
useful entry points all run over the standard SQL interfaces:

```questdb-sql
-- List all tables
SHOW TABLES;

-- Inspect a specific table's columns and types
SHOW COLUMNS FROM trades;

-- Meta-query: full table metadata including designated timestamp
SELECT * FROM tables();
```

Over REST, the same queries run as `GET /exec?query=SHOW%20TABLES`.

See the [`SHOW` reference](/docs/query/sql/show/) and
[`tables()`](/docs/query/functions/meta/) for the full surface.

### Read-only access

Production deployments should give agents read-only credentials whenever
possible:

- **Open Source**: configure HTTP basic auth and provide read-only
  credentials to the agent. The same credentials authenticate the QWP
  endpoints via the WebSocket upgrade.
- **Enterprise**: use [RBAC](/docs/security/rbac/) to create a role with
  query-only permissions and assign it to the agent's user. The same role
  applies whether the agent connects over REST or QWP.

Pick the transport by data volume:

- **Small queries** — schema inspection, parameter lookup, a few hundred
  rows — fit naturally on REST `/exec`. The JSON response is directly
  consumable by the agent without an SDK.
- **Large result sets** — exporting data into another system, materializing
  analytics output — should go through a
  [QWP egress client](/docs/connect/wire-protocols/qwp-egress-websocket/). Byte-credit
  flow control prevents the agent from being overwhelmed mid-export, and
  the binary columnar format keeps wire size low.

Containing the blast radius this way matters: if the agent's prompt is
compromised or it hallucinates a destructive statement, the credentials
themselves prevent damage.

### Query budgets

Agents will write expensive queries while exploring. Set realistic ceilings:

- Always include `LIMIT` in exploratory queries; the agent rarely needs more
  than a few hundred rows to reason about the shape of the data.
- Cap concurrent agent traffic at the reverse proxy (HTTP rate limits) or
  via QWP connection limits on the server side.
- Watch the [query log and metrics](/docs/operations/logging-metrics/) for
  runaway scans.

### Write access for ingest

If the agent is generating ingestion code, not just querying, **QWP is the
recommended path for all writes**:

- **Bulk upload and sustained ingestion** (agentic ETL, a streaming sensor
  feed fronted by an LLM, batch loads from another system): use a
  [QWP client library](/docs/connect/overview/). The agent generates
  setup code; the runtime gets throughput, multi-host failover, and
  store-and-forward for free.
- **No native client for the agent's runtime?** The agent can implement an
  uploader directly against the
  [QWP ingress wire spec](/docs/connect/wire-protocols/qwp-ingress-websocket/) — the
  protocol is fully documented for clean-room implementations and a
  minimum-viable client is on the order of a few hundred lines.
- **Quick one-off inserts** during exploration: `INSERT INTO ...` via REST
  `/exec` is acceptable for ad-hoc testing, but production write paths
  should always be on QWP.

### Observability

Treat agent traffic like any production workload:

- Log all SQL the agent executes (most agent frameworks expose a hook for
  pre-execution inspection).
- Surface query latency and result-size metrics — runaway scans show up
  there first.
- Audit DDL statements separately if you allow them at all; an agent that
  drops a table by accident is a different incident class from one that
  writes a slow query.

## Recipes

### Uploading CSV or Parquet from the agent's local machine

**Failure mode to avoid:** SQL functions like `read_parquet()`,
`read_csv()`, and the `COPY` statement all read files from the
**QuestDB server's filesystem** (via `cairo.sql.copy.root`). They do not
work when the agent has the file locally and the database is on another
host — a remote VM, a Docker container, a cloud deployment, or
`demo.questdb.io`. An agent reaching for these to upload a local file is
on a dead-end path; it will either fail with a permissions error or
"file not found", or beat around the bush trying to mount a directory it
can't reach.

**Correct path:** parse the file in the agent's runtime, then push the
rows to QuestDB through a QWP ingress client.

1. Check the [Ingestion overview](/docs/connect/overview/) for the
   current list of QWP client libraries supported in the agent's runtime
   language.
2. **Native client available** — the agent reads the file locally
   (e.g., pyarrow / pandas / polars for Parquet; the language's built-in
   CSV reader for CSV) and streams rows to QuestDB through the client.
3. **No native client for that runtime** — the agent can implement an
   uploader directly against the
   [QWP ingress wire spec](/docs/connect/wire-protocols/qwp-ingress-websocket/). The
   protocol is fully documented for clean-room implementations and a
   minimum-viable client (BOOLEAN, LONG, DOUBLE, TIMESTAMP, VARCHAR) is
   on the order of a few hundred lines. See the next recipe for the two
   patterns that matter for throughput.

This works regardless of where QuestDB runs — Docker, cloud,
`demo.questdb.io`, remote VM — and gives the agent throughput,
multi-host failover, and store-and-forward for free.

### Writing a fast QWP ingress uploader

If the agent is implementing a QWP ingress client against the
[wire spec](/docs/connect/wire-protocols/qwp-ingress-websocket/) — because no native
client exists for its runtime, or as a bespoke one-off uploader — two
patterns make the difference between a slow client and a fast one. An LLM
left to its own devices tends to default to the slow shape because it
"looks correct" and the bottleneck only shows up under load.

**Pipeline frames; don't wait for each ack.** QWP allows many frames in
flight per connection (up to the
[max in-flight batches](/docs/connect/wire-protocols/qwp-ingress-websocket/#protocol-limits)
limit, 128 by default). Acks arrive asynchronously on the same connection,
in send order, and the server-assigned `sequence` field correlates each
ack with its frame. A lock-step `send → await OK → send next` loop wastes
a round-trip time per batch and caps throughput at a small fraction of
what the link supports. Decouple the writer (which streams frames into
the WebSocket) from the reader (which drains OK frames and advances the
ack watermark), and let the writer keep pushing while the reader catches
up. The writer only needs to check **transport-level** backpressure — the
socket's send buffer fill, or a bounded queue between encoder and sender —
not application-level acks.

**Encode column-major, not row-major.** QWP's wire format lays out all
values for column 0 first, then all values for column 1, and so on. Source
data from columnar formats (Parquet, Arrow, columnar DB exports) is
already in this shape; preserve it end-to-end. An encoder that
materialises an intermediate row-major buffer — pseudocode
`for row in rows: for col in cols: emit(row[col])` — pays for the
allocation, breaks CPU cache locality, and prevents the bulk memcpy / SIMD
path that fixed-width column buffers would otherwise allow. The right
shape is `for col in cols: bulkCopy(columnBuffers[col])` — one tight loop
per column, often a single bulk copy for fixed-width types.

These two changes compound: a pipelined, column-major client is often
several-fold faster than a lock-step, row-major one — sometimes the
difference between "the client is the bottleneck" and "the link
saturates".

## Next steps

- **Quickstart**: [AI Coding Agents](/docs/getting-started/ai-coding-agents/)
- **Query interfaces**: [QWP egress (WebSocket)](/docs/connect/wire-protocols/qwp-egress-websocket/),
  [REST API](/docs/connect/compatibility/rest-api/)
- **Ingest interfaces**: [Ingestion overview](/docs/connect/overview/),
  [QWP ingress (WebSocket)](/docs/connect/wire-protocols/qwp-ingress-websocket/)
- **Operating safely**: [RBAC](/docs/security/rbac/) (Enterprise),
  [TLS](/docs/security/tls/)
