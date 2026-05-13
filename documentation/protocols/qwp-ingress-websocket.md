---
title: QWP Ingress (WebSocket)
description:
  Wire-protocol specification for QuestDB's WebSocket-based columnar binary
  ingest protocol.
---

:::note Page in draft

This is the day-one skeleton. Content will be filled in from
`questdb-enterprise/questdb/docs/qwp/wire-ingress.md`.

:::

:::info Audience

This is a **wire-protocol specification** intended for client implementers
building a new QuestDB ingest client. End users see the
[language client guides](/docs/ingestion/overview) and the
[connect string reference](/docs/client-configuration/connect-string).

:::

## Overview {#overview}

<!-- TODO: what this protocol is, when to use it vs. ILP, design goals
     (columnar binary, schema-stable, deduplication-friendly). -->

## Versioning {#versioning}

<!-- TODO: wire version advertised during handshake, current pinned version,
     compatibility rules. -->

## Connection lifecycle {#lifecycle}

<!-- TODO: WebSocket upgrade, auth handshake, session establishment,
     graceful close, abnormal close. -->

## Frame structure {#framing}

<!-- TODO: top-level frame layout, frame types, length encoding. -->

## Schema messages {#schema}

<!-- TODO: how schemas are declared, schema IDs, schema cache, evolution. -->

## Type codes and column encoding {#types}

<!-- TODO: type code table, per-type encoding rules (varint, zigzag,
     Gorilla, IEEE float, fixed-width, variable-width). -->

## Null encoding {#nulls}

<!-- TODO: null bitmap layout, sentinel-vs-bitmap choice per type. -->

## Error codes {#errors}

<!-- TODO: error code table, semantics, recovery actions. -->

## Close codes {#close-codes}

<!-- TODO: WebSocket close codes used by this protocol, terminal vs.
     retryable, auth-failure handling. -->

## Store-and-forward interaction {#sf}

<!-- TODO: how this protocol cooperates with the SF substrate (FSN, ACK
     framing, replay). Cross-link to sf-client behavioural spec. -->

Client-side store-and-forward behaviour will be documented under the
Connect section (coming with Bundle C).

## Reference implementation {#reference}

<!-- TODO: pinned commit hash, path within java-questdb-client. -->
