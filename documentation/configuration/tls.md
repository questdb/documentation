---
title: TLS encryption
description: Configuration settings for TLS encryption across QuestDB interfaces.
---

:::note

TLS encryption is [Enterprise](/enterprise/) only.

:::

TLS can be enabled globally for all QuestDB interfaces, or selectively for
individual endpoints. Per-endpoint settings override the global configuration.

For OIDC-specific TLS settings
(keystore, certificate validation), see the
[OIDC configuration](/docs/configuration/oidc/#tls).

## Global

### tls.cert.path

- **Default**: none
- **Reloadable**: no

Path to the certificate used for TLS encryption globally. The certificate
should be DER-encoded and saved in PEM format.

### tls.enabled

- **Default**: `false`
- **Reloadable**: no

Enables or disables TLS encryption globally for all QuestDB interfaces.

### tls.private.key.path

- **Default**: none
- **Reloadable**: no

Path to the private key used for TLS encryption globally.

## HTTP server

These settings override the global TLS settings for the HTTP server only.

### http.tls.cert.path

- **Default**: none
- **Reloadable**: no

Path to the certificate used for TLS encryption for the HTTP server only.
The certificate should be DER-encoded and saved in PEM format.

### http.tls.enabled

- **Default**: `false`
- **Reloadable**: no

Enables or disables TLS encryption for the HTTP server only.

### http.tls.private.key.path

- **Default**: none
- **Reloadable**: no

Path to the private key used for TLS encryption for the HTTP server only.

## Minimal HTTP server

### http.min.tls.cert.path

- **Default**: none
- **Reloadable**: no

Path to the certificate used for TLS encryption for the minimal HTTP server
only. The certificate should be DER-encoded and saved in PEM format.

### http.min.tls.enabled

- **Default**: `false`
- **Reloadable**: no

Enables or disables TLS encryption for the minimal HTTP server only.

### http.min.tls.private.key.path

- **Default**: none
- **Reloadable**: no

Path to the private key used for TLS encryption for the minimal HTTP server
only.

## ILP over TCP

### line.tcp.tls.cert.path

- **Default**: none
- **Reloadable**: no

Path to the certificate used for TLS encryption for ILP over TCP only. The
certificate should be DER-encoded and saved in PEM format.

### line.tcp.tls.enabled

- **Default**: `false`
- **Reloadable**: no

Enables or disables TLS encryption for ILP over TCP only.

### line.tcp.tls.private.key.path

- **Default**: none
- **Reloadable**: no

Path to the private key used for TLS encryption for ILP over TCP only.
