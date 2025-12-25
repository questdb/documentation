---
title: TLS Encryption
description:
  Details and resources which describe how to configure TLS encryption for
  available network interfaces.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  TLS encryption secures all network interfaces and protocols.
</EnterpriseNote>

Transport Layer Security (TLS) encryption is available on all supported network
interfaces and protocols:

- [InfluxDB Line Protocol over TCP](/docs/reference/api/ilp/overview/)
- [PGWire](/docs/pgwire/pgwire-intro/)
- [HTTP](/docs/reference/api/rest/) (REST API)

It's possible to configure encryption on all interfaces at once or individually.

QuestDB supports TLS v1.2 and v1.3.

## Enabling TLS

To enable TLS on all interfaces, set the following configuration
[configuration](/docs/configuration/) options:

```ini title=server.conf
tls.enabled=true
tls.cert.path=/path/to/certificate.pem
tls.private.key.path=/path/to/private_key
```

The certificate `.pem` file should contain a DER-encoded server certificate. The
file must include the full certificate chain, which consists of the server's own
certificate followed by any intermediate certificates necessary to establish a
trust path to a trusted root certificate.

Example:

```
-----BEGIN CERTIFICATE-----
encoded server cert
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
encoded intermediate cert
-----END CERTIFICATE-----
```

The private key file must contain the key in one of the following formats:

- A DER-encoded plaintext RSA private key; as specified in PKCS#1/RFC3447
- A DER-encoded plaintext private key; as specified in PKCS#8/RFC5958
- A SEC1-encoded plaintext private key; as specified in RFC5915

If you need to create a quick `.pem` file for testing, see the
[below steps](/docs/operations/tls/#generating-a-test-pem-certificate-manually).

### Enabling TLS for InfluxDB Line Protocol

To enable TLS for InfluxDB Line Protocol, apply the following configuration:

```ini title=server.conf
line.tcp.tls.enabled=true
line.tcp.tls.cert.path=/path/to/certificate_ilp.pem
line.tcp.tls.private.key.path=/path/to/private_key_ilp
```

### Enabling TLS for PGWire

To enable TLS for PGWire protocol, apply the following configuration:

```ini title=server.conf
pg.tls.enabled=true
pg.tls.cert.path=/path/to/certificate_pgwire.pem
pg.tls.private.key.path=/path/to/private_key_pgwire
```

### Enabling TLS for HTTP server (REST API)

To enable TLS for the REST API, apply the following configuration:

```ini title=server.conf
http.tls.enabled=true
http.tls.cert.path=/path/to/certificate_http.pem
http.tls.private.key.path=/path/to/private_key_http
```

### Enabling TLS for minimal HTTP server

To enable TLS for the
[minimal HTTP server](/docs/operations/logging-metrics/#minimal-http-server),
apply the following configuration:

```ini title=server.conf
http.min.tls.enabled=true
http.min.tls.cert.path=/path/to/certificate_http_min.pem
http.min.tls.private.key.path=/path/to/private_key_http_min
```

## Rotating certificate and key

In case if you want to rotate the certificate and the private key periodically,
QuestDB supports hot reload for the TLS files. To do that, first you need to
replace the certificate and key files on disk with the new ones. Next, you need
to call the `reload_tls()` SQL function like the following:

```questdb-sql
SELECT reload_tls();
```

The function returns `true` if the reload is successful; otherwise, it returns
`false`. In case of unsuccessful reload, you should check error messages in the
[server logs](/docs/operations/logging-metrics/) for more details.

When Role-based Access Control (RBAC) is enabled, the `reload_tls()` SQL
function is only available to the admin user, i.e. to the built-in user account
configured with the `acl.admin.user.enabled` property.

## Demo certificates

The QuestDB server can generate a demo certificate and private key for testing
purposes upon startup. This feature is useful for quickly testing TLS
connections without the need to manually create a certificate and private key.

To enable this feature, set the following configuration options in server.conf:

```ini title=server.conf
tls.enabled=true
tls.demo.mode=true
```

:::note

This method is suitable for testing purposes only and should never be used in a
production environment.

:::

The certificate and private key are generated when the server starts and are
stored on disk in the `$dbroot/conf` directory. It is not possible to customize
the generated demo certificate in any way.

The certificate is self-signed and is not recognized as trusted by any
certificate authority.

## Generating a test .pem certificate manually

:::note

Remember to use securely crafted certificates for production cases.

:::

There are many ways that a valid `.pem` certificate can be created.

For a quick .pem certificate to use for testing, conduct the following steps.

1. Create a `.csr` and `.key` file:

```shell title=OpenSSL
openssl req -new -newkey rsa:4096 -nodes -keyout questdb_test.key -out questdb_test.csr
```

2. Combine the `.csr` and `.key` files into a new `.pem` file:

```shell title=OpenSSL
openssl x509 -req -sha256 -days 365 -in questdb_test.csr -signkey questdb_test.key -out questdb_test.pem
```

Finally, you can configure QuestDB server to use the newly generated certificate
and key, e.g. with the following configuration:

```ini title=server.conf
tls.enabled=true
tls.cert.path=/path/to/questdb_test.pem
tls.private.key.path=/path/to/questdb_test.key
```
