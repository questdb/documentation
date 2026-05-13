---
title: QWP Egress (WebSocket)
description:
  Wire-protocol specification for QuestDB's WebSocket-based streaming
  query-result protocol.
---

:::note Page in draft

This is the day-one skeleton. Content will be filled in from
`questdb-enterprise/questdb/docs/qwp/wire-egress.md`. This page documents
the **Phase 1** surface — Phase 2 features (row iterator, unbounded CANCEL,
lazy decode, multi-query, prepared statements) are tracked separately and
not yet public.

:::

:::info Audience

This is a **wire-protocol specification** intended for client implementers
building a new QuestDB query client. End users see the
[language client guides](/docs/query/overview) and the
[connect string reference](/docs/client-configuration/connect-string).

:::

## Overview {#overview}

<!-- TODO: design goals (streaming, columnar, schema cache, credit-based
     flow control), when to use vs. PGWire / REST. -->

## Versioning {#versioning}

<!-- TODO: wire version v1 vs. v2 (zone hints), handshake negotiation. -->

## Connection lifecycle {#lifecycle}

<!-- TODO: WebSocket upgrade, auth handshake, session establishment,
     graceful close. -->

## Query submission {#submission}

<!-- TODO: request frame, parameter binding, query text framing. -->

## Result framing {#results}

<!-- TODO: result frame structure, batching, schema-then-rows pattern. -->

## Schema messages {#schema}

<!-- TODO: schema declaration, schema cache, per-connection schema budget
     (`max_schemas_per_connection`). -->

## Flow control {#flow-control}

<!-- TODO: credit-based in-flight window (`in_flight_window`), keepalive,
     backpressure. -->

## Durable ACK {#durable-ack}

<!-- TODO: opt-in durable acknowledgements (`request_durable_ack`),
     keepalive (`durable_ack_keepalive_interval_millis`). -->

## Error codes {#errors}

<!-- TODO: error code table, cancellation, query-level vs. session-level
     failure. -->

## Close codes {#close-codes}

<!-- TODO: WebSocket close codes, terminal vs. retryable. -->

## Reference implementation {#reference}

<!-- TODO: pinned commit hash, path within java-questdb-client. -->
