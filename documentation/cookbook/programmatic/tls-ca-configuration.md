---
title: Configure TLS certificate authorities
sidebar_label: TLS CA configuration
description: Configure TLS certificate authority validation for QuestDB clients
---

Configure TLS certificate authority (CA) validation when connecting QuestDB clients to TLS-enabled instances.

## Problem

You are using a QuestDB client (Rust, Python, C++, etc.) to insert data. It works when using QuestDB without TLS, but when you enable TLS on your QuestDB instance using a self-signed certificate, you get an error of "certificate unknown".

When using the PostgreSQL wire interface, you can insert data passing `sslmode=require`, and it works, so you can discard any problems with QuestDB recognizing the certificate. But you need to figure out the equivalent for your ILP client.

## Solution: Configure TLS CA

The Rust, C, C++, Python and Ruby clients support the `tls_ca` parameter, which selects the certificate authorities used for validation. Java, Go, .NET and Node.js reject `tls_ca`: they validate against the system or JVM trust store, and all but Go take a custom CA through `tls_roots`. See [TLS](/docs/connect/clients/connect-string/#tls) in the connect string reference.

### Option 1: Use WebPKI and OS certificate roots (recommended for production)

If you want to accept both the webpki-root certificates plus whatever you have on the OS, pass `tls_ca=webpki_and_os_roots`:

```
https::addr=localhost:9000;username=admin;password=quest;tls_ca=webpki_and_os_roots;
```

This will work with certificates signed by standard certificate authorities.

### Option 2: Use a custom PEM file

Point to a PEM-encoded certificate file for self-signed or custom CA certificates. Setting `tls_roots` selects the file, so no `tls_ca` value is needed:

```
https::addr=localhost:9000;username=admin;password=quest;tls_roots=/path/to/cert.pem;
```

This is useful for self-signed certificates or internal CAs.

### Option 3: Skip verification (development only)

For development environments with self-signed certificates, you might be tempted to disable verification by passing `tls_verify=unsafe_off`:

```
https::addr=localhost:9000;username=admin;password=quest;tls_verify=unsafe_off;
```

:::danger
This is a very bad idea for production and should only be used for testing on a development environment with a self-signed certificate. It disables all certificate validation.
:::

**Note:** Some clients require enabling an optional feature (like `insecure-skip-verify` in Rust) before the `tls_verify=unsafe_off` parameter will work. Check your client's documentation for details.

## Available tls_ca values

| Value | Description |
|-------|-------------|
| `webpki_roots` | Mozilla's WebPKI root certificates only |
| `os_roots` | Operating system certificate store only |
| `webpki_and_os_roots` | Both WebPKI and OS roots (recommended) |

A PEM file is not a `tls_ca` value in the connect string: set `tls_roots`
instead. In the Rust crate, `os_roots` and `webpki_and_os_roots` need the
`tls-native-certs` feature.

## Example: Rust client

```rust
use questdb::ingress::{CertificateAuthority, Protocol, SenderBuilder};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut sender = SenderBuilder::new(Protocol::Https, "localhost", 9000)
        .username("admin")?
        .password("quest")?
        .tls_ca(CertificateAuthority::WebpkiAndOsRoots)? // Use standard CAs
        .build()?;

    // Use sender...

    Ok(())
}
```

For self-signed certificates with a PEM file, `tls_roots` selects the file:

```rust
let mut sender = SenderBuilder::new(Protocol::Https, "localhost", 9000)
    .username("admin")?
    .password("quest")?
    .tls_roots("/path/to/questdb.crt")?
    .build()?;
```

The examples are in Rust but the concepts are similar in other languages. Check the documentation for your specific client.

:::info Related Documentation
- [QuestDB Rust client](https://docs.rs/questdb/)
- [QuestDB Python client](/docs/connect/clients/python/)
- [QuestDB C++ client](/docs/connect/clients/c-and-cpp/)
- [QuestDB TLS configuration](/docs/security/tls/)
:::
