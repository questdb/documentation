---
title: Client failover concepts
sidebar_label: Concepts
description:
  How QuestDB clients detect a failed primary and transparently switch to a
  healthy peer using multi-host addr lists, host-health classification, role
  filtering, and zone-aware selection.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Client failover is most useful with QuestDB Enterprise primary-replica
  replication. OSS users with a single instance gain limited benefit from
  multi-host configuration.
</EnterpriseNote>

:::note Java-only today

Client-side failover support is currently available in the Java client.
Additional language clients are on the roadmap.

:::

When a QuestDB cluster fails over from one primary to another — whether through
a planned promotion, a rolling upgrade, or an unplanned outage — clients with a
single hard-coded address must be reconfigured and restarted. A failover-aware
client instead carries the full list of peers and walks that list automatically
when the current connection breaks.

This page explains the model. The user-facing knobs and worked examples live in
the [Configuration](/docs/high-availability/client-failover/configuration/)
page.

## What failover does

You give the client a comma-separated list of endpoints:

```
addr=node-a:9000,node-b:9000,node-c:9000
```

The client picks one, connects, and uses it until that connection breaks. When
it breaks, the client walks the rest of the list, classifies what it found at
each host, and either reconnects or surfaces a failure to your code. The exact
loop that drives this depends on whether you are ingesting (long-lived
background reconnect) or querying (per-request retry budget). Both loops share
the same primitives described here.

## Host health model

For every entry in `addr`, the client tracks two attributes: a **state** and a
**zone tier**.

### State

The state records what the client most recently observed when it tried that
host.

| State | When the client moves a host here |
|---|---|
| `Healthy` | The last connect attempt succeeded. |
| `Unknown` | The host has not been tried in this round, or its classification was reset. |
| `TransientReject` | The server returned `421` with `X-QuestDB-Role: PRIMARY_CATCHUP` — it is a primary that is still catching up after promotion. Expected to recover. |
| `TransportError` | TCP/TLS handshake failed, an HTTP upgrade returned a transient error code, or an established connection broke mid-stream. |
| `TopologyReject` | The server returned `421` with a role that cannot satisfy the requested `target=` filter — for example, a `REPLICA` when you asked for `target=primary`. The host will not become writable without a topology change. |

A lower state in the table above is preferred when the client picks the next
host to try.

### Zone tier

Each host is also classified relative to the client's configured `zone=`:

| Zone tier | Meaning |
|---|---|
| `Same` | Server's advertised zone matches the client's `zone=` (case-insensitive), or `zone=` is unset, or `target=primary`. |
| `Unknown` | Server has not advertised a zone yet. |
| `Other` | Server advertised a different zone. |

Zone information is advertised by the server on a successful upgrade and
(starting in QWP v2) on `421` rejects. The client remembers it for the lifetime
of the connection.

`target=primary` collapses every host's zone tier to `Same` — writers must
follow the primary regardless of geography. Ingress is currently zone-blind in
both storage modes, so the `zone=` key is silently accepted on ingress
connections and only takes effect on egress.

### Selection priority

When the client needs to pick the next host, it sorts by the tuple `(state,
zone_tier)` lexicographically — state first, zone second. So a known-good host
in another zone wins against an untried local host. Within a tied bucket, the
order in your `addr=` list is preserved verbatim.

The client does **not** shuffle, randomise, or load-balance across peers.
Cluster-level load balancing is the responsibility of QuestDB's server-side
coordinators. If you need a different first-pick distribution across many
simultaneously-starting clients, rotate the connect string at deployment time.

## Sticky-Healthy across rounds

Once the client lands on a `Healthy` host, that host stays the priority pick on
the next round of failover — provided its zone tier is still `Same`. This
avoids unnecessary churn after a short blip: a momentary network glitch
doesn't promote a different node into the active slot just because it
happened to be probed first.

`Healthy` hosts in another zone are reset to `Unknown` between outages rather
than kept sticky. Otherwise a once-healthy cross-zone host would lock the
client out of probing local hosts after they recover.

## Role filter (`target=`)

The `target=` key controls which server role the client is willing to bind to:

| `target=` | STANDALONE | PRIMARY | REPLICA | PRIMARY_CATCHUP |
|---|---|---|---|---|
| `any` (default) | accept | accept | accept | accept (transient) |
| `primary` | accept | accept | reject (topology) | accept (transient) |
| `replica` | reject (topology) | reject (topology) | accept | reject (topology) |

`PRIMARY_CATCHUP` is a primary that has been promoted but has not yet caught
up to its predecessor's WAL — the client treats it as transient and retries
the same host (with a fresh round, no exponential backoff) until it either
becomes a full `PRIMARY` or the outage budget expires.

A `421 Misdirected Request` response **without** an `X-QuestDB-Role` header
is treated as a generic transport error, not a role reject — the client walks
to the next host but does not pin the rejecting host as topology-unreachable.

`target=replica` is intended for read-side workloads that explicitly want to
spread query load across read-only peers (see the egress flow below).

## Two failover contexts

Failover applies to both directions of QWP traffic, but the two contexts have
very different goals.

### Ingress (writes)

The ingress reconnect loop sits inside the store-and-forward I/O thread. It
runs continuously in the background, retrying through outages while the
producer keeps appending to the local buffer. The defaults are tuned for
throughput-oriented workloads that can tolerate minutes of server unavailability:

- Initial backoff: `100 ms`
- Maximum backoff: `5 s`
- Per-outage budget: `5 minutes` (`reconnect_max_duration_millis`)
- Jitter: **equal-jitter** `[base, 2·base)` — non-zero lower bound damps
  reconnect storms when many producers share a cluster
- Inter-host pause within a round: **none** — the client walks the full
  address list as fast as `auth_timeout_ms` allows, paying one backoff
  sleep at round exhaustion

See the [store-and-forward concepts](/docs/high-availability/store-and-forward/concepts/)
page for how the reconnect loop interacts with the disk-backed segment ring.

### Egress (queries)

The egress failover loop wraps each `Execute()` call on the read-side query
client. It is interactive: a slow failover is worse than a clear error, so
the budget is short:

- Initial backoff: `50 ms`
- Maximum backoff: `1 s`
- Total wall-clock budget: `30 s` (`failover_max_duration_ms`)
- Attempt cap: `8` (`failover_max_attempts`)
- Jitter: **full-jitter** `[0, base)` — a single-user query benefits from the
  lowest expected recovery time, and one client per workload removes the
  thundering-herd concern

The egress loop also respects the `target=` role filter and prefers same-zone
hosts when `zone=` is set.

## Error classification

Every error the client encounters falls into one of three buckets, which drives
the loop's response:

### Terminal — bypass failover

The client surfaces the error to your code immediately. Retrying every host
will not help.

| Condition | Why terminal |
|---|---|
| HTTP `401` / `403` on upgrade | Credentials are cluster-wide; retrying floods server logs without recovery. |
| Server-status reject (SF) | Application-layer reject; replay reproduces the same response. |

### Topology — handled inside the round

The host is demoted in the priority lattice; the client walks to the next host
within the same round. No exponential backoff is consumed.

- `421` + `X-QuestDB-Role: PRIMARY_CATCHUP` → `TransientReject`
- `421` + any other recognised role → `TopologyReject`
- `SERVER_INFO.Role` does not match the requested `target=`

If every host in a round role-rejects, ingress pays one fixed backoff sleep
(reset to `InitialBackoff`, no doubling) and starts a fresh round; egress
fails the current `Execute()` call.

### Transient — enter backoff

Everything else: TCP/TLS errors, `auth_timeout_ms` expiry, mid-stream send or
receive failures, `404` / `426` / `503` on upgrade, version mismatches
(per-endpoint — a rolling upgrade in flight does not lock out compatible
peers), and generic frame-decode errors. The client records `TransportError`
and walks to the next host.

When a round exhausts with transient errors, the client sleeps for the
backoff interval (clamped to the remaining outage budget) and starts the
next round.

## Mid-stream demotion

If a connection breaks mid-stream — for example, the receive pump throws after
a successful upgrade — the client marks the failed host as `TransportError`
**before** picking the next host. Without this ordering, the sticky-Healthy
rule would re-pick the same just-failed host as the priority candidate, and
the next attempt would target the broken node again.

This invariant only matters when you are reading client source code or
debugging a custom implementation. As a user, you observe it as "failover
moves off a broken node on the very next attempt, with no exponential delay
when at least one peer is healthy."

## Authentication is cluster-wide

A `401` or `403` on the HTTP upgrade is terminal — the client does not retry
other hosts. The assumption is that auth credentials are configured
identically across the cluster, so a credential failure against one node is
a credential failure against all of them. Retrying would spam every peer's
audit log without recovering.

If your deployment has per-host credentials, that is unsupported and outside
the failover model — split the workload into one connect string per credential.

## Next steps

- [Configuration](/docs/high-availability/client-failover/configuration/) —
  the connect-string keys and worked examples for each context.
- [Store-and-forward concepts](/docs/high-availability/store-and-forward/concepts/) —
  how the ingress failover loop interacts with the disk-backed substrate.
