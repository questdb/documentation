---
title: Configure TLS for Rust Client
sidebar_label: TLS configuration
description: Set up TLS certificates for the QuestDB Rust client including self-signed certificates and production CA roots
---

Configure TLS encryption for the QuestDB Rust client when connecting to QuestDB instances with TLS enabled. This guide covers both production deployments with proper CA certificates and development environments with self-signed certificates.

## Problem: TLS Certificate Validation

When connecting the Rust client to a TLS-enabled QuestDB instance, you'll encounter certificate validation errors if:
- Using self-signed certificates (common in development)
- Using corporate/internal CA certificates not in system trust stores
- Certificate hostname doesn't match the connection address

The default client configuration validates certificates against system certificate stores, which causes "certificate unknown" errors with self-signed certificates.

## Solution Options

The QuestDB Rust client provides three approaches for TLS configuration:

1. **System + WebPKI roots** (recommended for production)
2. **Custom CA certificate** (best for development and internal CAs)
3. **Skip verification** (development/testing only - unsafe)

### Option 1: Use System and WebPKI Certificate Roots

For production deployments with properly signed certificates from public Certificate Authorities:

```rust
use questdb::ingress::{Sender, SenderBuilder};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let sender = SenderBuilder::new("http", "production-host.com", 9000)?
        .username("admin")?
        .password("quest")?
        .tls_ca("webpki_and_os_roots")?  // Use both WebPKI and OS certificate stores
        .build()
        .await?;

    // Use sender...

    sender.close().await?;
    Ok(())
}
```

The `tls_ca("webpki_and_os_roots")` parameter tells the client to trust:
- **WebPKI roots**: Mozilla's standard root CA certificates
- **OS roots**: Operating system's certificate store (Windows, macOS, Linux)

This works with certificates from public CAs like Let's Encrypt, DigiCert, etc.

### Option 2: Custom CA Certificate (Recommended for Development)

For development environments or internal CAs, provide a PEM-encoded certificate file:

#### Step 1: Generate Self-Signed Certificate (if needed)

```bash
# Generate private key
openssl genrsa -out questdb.key 2048

# Generate self-signed certificate (valid for 365 days)
openssl req -new -x509 \
  -key questdb.key \
  -out questdb.crt \
  -days 365 \
  -subj "/CN=localhost"

# Verify certificate
openssl x509 -in questdb.crt -text -noout
```

#### Step 2: Configure QuestDB with Certificate

Add to QuestDB `server.conf`:

```ini
# Enable TLS on HTTP endpoint
http.security.enabled=true
http.security.cert.path=/path/to/questdb.crt
http.security.key.path=/path/to/questdb.key
```

Or via environment variables:

```bash
export QDB_HTTP_SECURITY_ENABLED=true
export QDB_HTTP_SECURITY_CERT_PATH=/path/to/questdb.crt
export QDB_HTTP_SECURITY_KEY_PATH=/path/to/questdb.key
```

#### Step 3: Configure Rust Client

```rust
use questdb::ingress::{Sender, SenderBuilder};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let sender = SenderBuilder::new("https", "localhost", 9000)?
        .username("admin")?
        .password("quest")?
        .tls_ca("pem_file")?                    // Specify PEM file mode
        .tls_roots("/path/to/questdb.crt")?     // Path to certificate file
        .build()
        .await?;

    // Write data
    sender
        .table("trades")?
        .symbol("symbol", "BTC-USDT")?
        .symbol("side", "buy")?
        .column_f64("price", 37779.62)?
        .column_f64("amount", 0.5)?
        .at_now()
        .await?;

    sender.close().await?;
    Ok(())
}
```

**Key points:**
- Use `"https"` protocol (not `"http"`)
- `tls_ca("pem_file")`: Tells client to load from a PEM file
- `tls_roots("/path/to/questdb.crt")`: Path to the certificate file
- Certificate file must be PEM-encoded (text format with `-----BEGIN CERTIFICATE-----`)

### Option 3: Skip Verification (Development Only)

For development/testing when you want to bypass certificate validation entirely:

#### Add Feature to Cargo.toml

```toml
[dependencies]
questdb-rs = { version = "4.0", features = ["insecure-skip-verify"] }
tokio = { version = "1", features = ["full"] }
```

The `insecure-skip-verify` feature must be explicitly enabled in your `Cargo.toml`.

#### Use Unsafe Verification Setting

```rust
use questdb::ingress::{Sender, SenderBuilder};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let sender = SenderBuilder::new("https", "localhost", 9000)?
        .username("admin")?
        .password("quest")?
        .tls_verify("unsafe_off")?  // Disable certificate verification
        .build()
        .await?;

    // Use sender...

    sender.close().await?;
    Ok(())
}
```

:::danger Security Warning
**Never use `unsafe_off` in production!** This disables all certificate validation and makes your connection vulnerable to man-in-the-middle attacks. Only use for local development with self-signed certificates.
:::

## Complete Example

Here's a complete example handling different environments:

```rust
use questdb::ingress::{Sender, SenderBuilder};
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let environment = env::var("ENVIRONMENT").unwrap_or_else(|_| "development".to_string());

    let sender = match environment.as_str() {
        "production" => {
            // Production: Use system CA roots
            SenderBuilder::new("https", "production-host.com", 9000)?
                .username("admin")?
                .password("quest")?
                .tls_ca("webpki_and_os_roots")?
                .build()
                .await?
        }
        "development" => {
            // Development: Use self-signed certificate
            SenderBuilder::new("https", "localhost", 9000)?
                .username("admin")?
                .password("quest")?
                .tls_ca("pem_file")?
                .tls_roots("./certs/questdb.crt")?
                .build()
                .await?
        }
        _ => {
            return Err("Unknown environment".into());
        }
    };

    // Write sample data
    sender
        .table("trades")?
        .symbol("symbol", "BTC-USDT")?
        .symbol("side", "buy")?
        .column_f64("price", 37779.62)?
        .column_f64("amount", 0.5)?
        .at_now()
        .await?;

    println!("Data sent successfully over TLS");

    sender.close().await?;
    Ok(())
}
```

Run with:

```bash
# Production
ENVIRONMENT=production cargo run

# Development
ENVIRONMENT=development cargo run
```

## TLS Configuration Options

### Available tls_ca Values

| Value | Description | Use Case |
|-------|-------------|----------|
| `webpki_roots` | Mozilla's WebPKI root certificates only | Public CAs, web-hosted QuestDB |
| `os_roots` | Operating system certificate store only | Corporate environments with custom CAs |
| `webpki_and_os_roots` | Both WebPKI and OS roots | Production (recommended) - covers all valid certificates |
| `pem_file` | Load from PEM file | Self-signed certificates, internal CAs |

### Connection String Format

Alternatively, configure TLS via connection string:

```rust
let sender = SenderBuilder::from_conf(
    "https::addr=localhost:9000;username=admin;password=quest;tls_ca=webpki_and_os_roots;"
)?
.build()
.await?;
```

For self-signed certificates with PEM file:

```rust
let sender = SenderBuilder::from_conf(
    "https::addr=localhost:9000;username=admin;password=quest;tls_ca=pem_file;tls_roots=/path/to/cert.crt;"
)?
.build()
.await?;
```

## Troubleshooting

**"certificate unknown" error:**
- Verify certificate is valid and not expired: `openssl x509 -in cert.crt -noout -dates`
- Check certificate hostname matches connection address
- Ensure certificate file path is correct and readable
- For self-signed certs, use `tls_ca("pem_file")` with `tls_roots()`

**"certificate verify failed":**
- Self-signed certificate: Use Option 2 (custom CA) or Option 3 (unsafe skip)
- Wrong CA: Verify certificate chain is complete in PEM file
- Expired certificate: Regenerate with longer validity period

**"connection refused":**
- QuestDB TLS not enabled - check QuestDB configuration
- Wrong port - TLS uses same port (9000 for HTTP, 9009 for TCP)
- Firewall blocking HTTPS connections

**"feature `insecure-skip-verify` is required":**
- Add feature to Cargo.toml: `features = ["insecure-skip-verify"]`
- This feature is required even just to use `tls_verify("unsafe_off")`

## Certificate File Formats

The Rust client expects PEM-encoded certificates:

**Correct format (PEM):**
```
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKL0UG+mRKqzMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
...
-----END CERTIFICATE-----
```

**If you have DER format**, convert to PEM:
```bash
openssl x509 -inform der -in certificate.der -out certificate.pem
```

**Certificate chain**: If using an intermediate CA, concatenate certificates:
```bash
cat server.crt intermediate.crt root.crt > chain.pem
```

Use `chain.pem` with `tls_roots()`.

:::tip Production Best Practices
1. **Use proper CA certificates** from Let's Encrypt or commercial CAs in production
2. **Never commit certificates** to version control - use secure secret management
3. **Rotate certificates** before expiration - monitor expiry dates
4. **Use environment variables** for certificate paths to support different environments
5. **Test certificate validation** in staging environment before production deployment
:::

:::info Related Documentation
- [QuestDB Rust client documentation](https://docs.rs/questdb/)
- [QuestDB Rust client GitHub](https://github.com/questdb/c-questdb-client)
- [TLS configuration examples](https://github.com/questdb/c-questdb-client/tree/main/questdb-rs/examples)
- [QuestDB TLS configuration](/docs/operations/tls/)
:::
