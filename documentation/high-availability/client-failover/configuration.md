---
title: Client failover configuration
sidebar_label: Configuration
description:
  Connect-string keys that configure multi-host failover for QuestDB clients,
  including addr lists, zone preference, role filtering, and the ingress and
  egress retry budgets.
---

This page is the configuration reference for client failover. For the model
behind these keys — host-health states, zone tiers, role filtering, and the
two retry loops — read [Concepts](/docs/high-availability/client-failover/concepts/)
first.

## Common keys

`addr` and `auth_timeout_ms` apply to every WS / WSS / HTTP / HTTPS client.
`zone` is accepted everywhere but only takes effect on egress; `target` is an
egress-only key and is rejected as an unknown key on an ingress connect string.
They are documented in full on the
[connect-string reference](/docs/client-configuration/connect-string#failover-keys);
the table below summarises the failover-relevant subset.

| Key | Type | Default | Notes |
|---|---|---|---|
| `addr` | `host:port[,host:port…]` | required | Comma-separated peer list. The two syntactic forms (`addr=h1,h2` and repeated `addr=h1;addr=h2`) accumulate. Empty entries are rejected. |
| `zone` | string | unset | Client's zone identifier (opaque, case-insensitive — `eu-west-1a`, `dc-amsterdam`, etc.). Egress prefers same-zone peers when `target` is `any` or `replica`. Silently accepted but ignored on ingress. |
| `target` | `any` \| `primary` \| `replica` | `any` | **Egress only.** Which server role the query client accepts. Rejected as an unknown key on an ingress connect string. See [Role filter](/docs/high-availability/client-failover/concepts/#role-filter-target) for the role table. |
| `auth_timeout_ms` | int (ms) | `15000` | Upper bound on the HTTP-upgrade response read per host. Does **not** cover the TCP connect or TLS handshake — those use the OS default. Set lower if you have well-known network paths and want faster failover; set higher only if upgrade is genuinely slow. |

`addr` syntax — both of these are equivalent and produce the same three-peer
list:

```
addr=node-a:9000,node-b:9000,node-c:9000
addr=node-a:9000;addr=node-b:9000;addr=node-c:9000
```

## Ingress (write)

The ingress reconnect loop is driven by store-and-forward connect-string
keys. See
[Store-and-forward configuration](/docs/high-availability/store-and-forward/configuration/#reconnect-keys)
and the
[connect-string reference](/docs/client-configuration/connect-string#sf-keys)
for the full list. The failover-relevant keys are:

| Key | Type | Default | Notes |
|---|---|---|---|
| `reconnect_max_duration_millis` | int (ms) | `300000` (5 min) | Per-outage wall-clock budget. Resets on every successful reconnect. Size this to span your largest expected failover window, but short enough to surface permanent topology issues. |
| `reconnect_initial_backoff_millis` | int (ms) | `100` | Starting backoff sleep at round exhaustion. Doubles up to `reconnect_max_backoff_millis`. |
| `reconnect_max_backoff_millis` | int (ms) | `5000` | Cap on the exponential backoff. With equal-jitter, the actual sleep lands in `[max, 2·max)` once the base saturates. |
| `initial_connect_retry` | `off` \| `on` \| `async` | `off` | Whether to apply the same retry loop to the very first connect attempt. See below. |

### `initial_connect_retry`

By default, the first connect failure is **terminal** — typically the first
attempt failing means a misconfiguration (wrong host, wrong port, no
network), and retrying for five minutes only hides it.

| Value | Behaviour |
|---|---|
| `off` (default; alias `false`) | First-connect failure is terminal. The producer's call to build the sender throws immediately. |
| `on` (aliases `sync`, `true`) | First-connect failures enter the same reconnect loop as mid-stream failures. The constructor blocks until success or the per-outage budget expires. |
| `async` | The constructor returns immediately; the background I/O thread drives the reconnect loop. The producer experiences backpressure if it tries to publish before the connection comes up. Intended for unattended producers where the SF directory may already carry segments from a prior process and the server may come up later. |

## Egress (query)

The egress failover loop wraps each `execute()` call on the read-side query
client. The full key list lives on the
[connect-string reference](/docs/client-configuration/connect-string#egress-flow);
the user-visible knobs are:

| Key | Type | Default | Notes |
|---|---|---|---|
| `failover` | `on` \| `off` | `on` | Global on/off. With `failover=off`, a single failed `execute()` call surfaces the underlying error without walking the address list. |
| `failover_max_attempts` | int | `8` | Hard cap on attempts within a single `execute()` call. |
| `failover_max_duration_ms` | int (ms) | `30000` | Wall-clock budget for failover eligibility. Bounds **when failover stops**, not the wall-clock of `execute()` itself — a final `WalkTracker` round can still cost up to `hostCount × auth_timeout_ms` after the budget expires. |
| `failover_backoff_initial_ms` | int (ms) | `50` | Starting backoff sleep. Doubles up to the cap. |
| `failover_backoff_max_ms` | int (ms) | `1000` | Cap on the exponential backoff. With full-jitter, the actual sleep lands in `[0, max)`. |

## Worked examples

### Three-node Enterprise cluster, default failover

Most users need only the `addr` list — defaults cover the rest.

```java
try (Sender sender = Sender.fromConfig(
        "ws::addr=node-a:9000,node-b:9000,node-c:9000;sf_dir=/var/lib/qdb-sender;")) {
    sender.table("events")
          .symbol("source", "edge-42")
          .longColumn("count", 1)
          .atNow();
}
```

The `ws::` scheme picks the QWP WebSocket transport. `sf_dir` enables the
disk-backed store-and-forward substrate, which keeps unacked data across
sender restarts; see
[Store-and-forward concepts](/docs/high-availability/store-and-forward/concepts/).

### Zone-aware read replicas

For read-only queries spread across same-zone replicas, with a primary as
final fallback:

```java
try (QwpQueryClient client = QwpQueryClient.fromConfig(
        "ws::addr=replica-eu-1a:9000,replica-eu-1b:9000,primary:9000;"
        + "zone=eu-west-1a;target=any;")) {
    client.connect();
    // handler is a QwpColumnBatchHandler that receives the result batches
    client.execute("SELECT * FROM trades WHERE ts > now() - 1h", handler);
}
```

Setting `target=replica` would skip the primary entirely; `target=any` is
usually preferable so the query still completes after a replica outage.

### Long-tolerated ingest with async first connect

Useful for unattended ingest processes (edge sensors, ETL jobs) that may
restart before the server comes up:

```java
try (Sender sender = Sender.fromConfig(
        "ws::addr=primary:9000;sf_dir=/var/lib/qdb-sender;"
        + "initial_connect_retry=async;"
        + "reconnect_max_duration_millis=1800000;")) {
    // appendBlocking() will absorb up to sf_max_total_bytes of writes
    // while the I/O thread retries the initial connect.
}
```

The 30-minute reconnect budget gives a wide failover window; the `async`
initial-connect policy lets the producer thread proceed immediately.

### Tight egress failover for an interactive dashboard

```java
try (QwpQueryClient client = QwpQueryClient.fromConfig(
        "ws::addr=node-a:9000,node-b:9000;"
        + "failover_max_duration_ms=5000;failover_max_attempts=3;")) {
    client.connect();
    // Surfaces an error within a few seconds if the cluster is unreachable.
}
```

## Where each key is documented

| Key | Concept | Reference |
|---|---|---|
| `addr`, `zone`, `target`, `auth_timeout_ms` | Host selection, role filter | [connect-string #failover-keys](/docs/client-configuration/connect-string#failover-keys) |
| `reconnect_*`, `initial_connect_retry` | Ingress retry budget | [connect-string #reconnect-keys](/docs/client-configuration/connect-string#reconnect-keys) |
| `failover`, `failover_*` | Egress retry budget | [connect-string #egress-flow](/docs/client-configuration/connect-string#egress-flow) |
| `username` / `password` / `token` | Authentication | [connect-string #auth](/docs/client-configuration/connect-string#auth) |
| `tls_*` | TLS configuration | [connect-string #tls](/docs/client-configuration/connect-string#tls) |
