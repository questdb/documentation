---
slug: /connect/wire-protocols/overview
title: Wire protocols overview
description:
  QuestDB's wire-protocol specifications for client implementers.
---

:::info Audience

This section documents QuestDB's wire protocols at the byte-on-the-wire
level for **client implementers** — engineers building a new QuestDB client
from scratch. End users should see the
[language client guides](/docs/connect/overview) and the
[connect string reference](/docs/connect/clients/connect-string).

:::

## QWP — QuestDB Wire Protocol

QWP is QuestDB's native wire protocol for both ingest and query traffic. The
specifications below are normative — if a client's behaviour conflicts with
a spec, the spec wins.

| Protocol | Transport | Purpose |
| --- | --- | --- |
| [QWP Ingress (WebSocket)](/docs/connect/wire-protocols/qwp-ingress-websocket) | WebSocket | Columnar binary ingest with optional store-and-forward |
| [QWP Egress (WebSocket)](/docs/connect/wire-protocols/qwp-egress-websocket) | WebSocket | Streaming SQL query results |

## Versioning

Each connection negotiates a protocol version during the WebSocket upgrade.
The client advertises the highest version it supports via the
`X-QWP-Max-Version` header; the server replies with `X-QWP-Version` set to
`min(clientMax, serverMax)`. Every message on the connection then carries the
negotiated version in its header. See each protocol page for the exact headers
and the per-version message layout.

## Reference implementation

The reference client implementation is the Java client
([`java-questdb-client`](https://github.com/questdb/java-questdb-client)).
Each protocol page below pins the reference-implementation commit that matches
its documented version.

## Source specifications

The canonical specs live in the QuestDB Enterprise repository under
`docs/qwp/`. The pages in this section are the public expression of those
specs; the specs themselves remain the source of truth.
