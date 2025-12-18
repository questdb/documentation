---
title: Configure TLS Certificate Authorities
sidebar_label: TLS CA configuration
description: Configure TLS certificate authority validation for QuestDB clients
---

Configure TLS certificate authority (CA) validation when connecting QuestDB clients to TLS-enabled instances.

## Problem

You are using a QuestDB client (Rust, Python, C++, etc.) to insert data. It works when using QuestDB without TLS, but when you enable TLS on your QuestDB instance using a self-signed certificate, you get an error of "certificate unknown".

When using the PostgreSQL wire interface, you can insert data passing `sslmode=require`, and it works, so you can discard any problems with QuestDB recognizing the certificate. But you need to figure out the equivalent for your ILP client.

## Solution: Configure TLS CA

QuestDB clients support the `tls_ca` parameter, which has multiple values to configure certificate authority validation:

### Option 1: Use WebPKI and OS Certificate Roots (Recommended for Production)

If you want to accept both the webpki-root certificates plus whatever you have on the OS, pass `tls_ca=webpki_and_os_roots`:

```
https::addr=localhost:9000;username=admin;password=quest;tls_ca=webpki_and_os_roots;
```

This will work with certificates signed by standard certificate authorities.

### Option 2: Use a Custom PEM File

Point to a PEM-encoded certificate file for self-signed or custom CA certificates:

```
https::addr=localhost:9000;username=admin;password=quest;tls_ca=pem_file;tls_roots=/path/to/cert.pem;
```

This is useful for self-signed certificates or internal CAs.

### Option 3: Skip Verification (Development Only)

For development environments with self-signed certificates, you might be tempted to disable verification by passing `tls_verify=unsafe_off`:

```
https::addr=localhost:9000;username=admin;password=quest;tls_verify=unsafe_off;
```

:::danger
This is a very bad idea for production and should only be used for testing on a development environment with a self-signed certificate. It disables all certificate validation.
:::

**Note:** Some clients require enabling an optional feature (like `insecure-skip-verify` in Rust) before the `tls_verify=unsafe_off` parameter will work. Check your client's documentation for details.

## Available tls_ca Values

| Value | Description |
|-------|-------------|
| `webpki_roots` | Mozilla's WebPKI root certificates only |
| `os_roots` | Operating system certificate store only |
| `webpki_and_os_roots` | Both WebPKI and OS roots (recommended) |
| `pem_file` | Load from a PEM file (requires `tls_roots` parameter) |

## Example: Rust Client

```rust
use questdb::ingress::{Sender, SenderBuilder};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let sender = SenderBuilder::new("https", "localhost", 9000)?
        .username("admin")?
        .password("quest")?
        .tls_ca("webpki_and_os_roots")?  // Use standard CAs
        .build()
        .await?;

    // Use sender...

    sender.close().await?;
    Ok(())
}
```

For self-signed certificates with a PEM file:

```rust
let sender = SenderBuilder::new("https", "localhost", 9000)?
    .username("admin")?
    .password("quest")?
    .tls_ca("pem_file")?
    .tls_roots("/path/to/questdb.crt")?
    .build()
    .await?;
```

The examples are in Rust but the concepts are similar in other languages. Check the documentation for your specific client.

:::info Related Documentation
- [QuestDB Rust client](https://docs.rs/questdb/)
- [QuestDB Python client](/docs/clients/ingest-python/)
- [QuestDB C++ client](/docs/clients/ingest-c-and-cpp/)
- [QuestDB TLS configuration](/docs/operations/tls/)
:::
