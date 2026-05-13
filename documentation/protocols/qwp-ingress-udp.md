---
title: QWP Ingress (UDP)
description:
  Wire-protocol specification for QuestDB's UDP-based fire-and-forget
  ingest variant.
---

:::note Page in draft

This is the day-one skeleton. Content will be filled in from
`questdb-enterprise/questdb/docs/qwp/wire-udp.md`.

:::

:::info Audience

This is a **wire-protocol specification** intended for client implementers
building a UDP-based ingest agent (typically a metrics collector). End users
see the [language client guides](/docs/ingestion/overview) and the
[connect string reference](/docs/client-configuration/connect-string).

:::

## Overview {#overview}

<!-- TODO: design goals (fire-and-forget, single-table, MTU-bounded
     ~1400 bytes), when to choose UDP over WebSocket. -->

## Versioning {#versioning}

<!-- TODO: in-datagram version field, compatibility rules. -->

## Datagram layout {#layout}

<!-- TODO: header, payload, per-datagram self-contained constraint. -->

## MTU sizing {#mtu}

<!-- TODO: default size, configuration, fragmentation policy. -->

## Single-table constraint {#single-table}

<!-- TODO: why each datagram targets one table, schema reference rules. -->

## Type codes and encoding {#types}

<!-- TODO: subset of QWP type codes available over UDP, per-type encoding. -->

## Loss semantics {#loss}

<!-- TODO: fire-and-forget guarantees, lack of retry, when this is acceptable. -->

## Reference implementation {#reference}

<!-- TODO: pinned commit hash, path within java-questdb-client. -->
