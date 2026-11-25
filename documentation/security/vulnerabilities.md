---
title: Security vulnerabilities
sidebar_label: Vulnerabilities (CVEs)
description:
  Whether QuestDB and QuestDB Enterprise are affected by published CVEs, which
  versions are affected, and how to mitigate.
---

This page records QuestDB's assessment of publicly disclosed vulnerabilities
(CVEs) that customers ask about, including vulnerabilities in the JVM and
other components QuestDB runs on. Each entry links to the official CVE
record, states which QuestDB and QuestDB Enterprise versions are affected, and
explains why. Entries are listed with the most recent first.

## CVE-2026-114938 (Java4Shell)

- **Official record**:
  [CVE-2026-114938](https://www.cve.org/CVERecord?id=CVE-2026-114938)
- **Component**: OpenJDK HotSpot JVM, not QuestDB code
- **Assessed**: November 2026
- **Not affected**: QuestDB 7.1.4 and later, QuestDB Enterprise 1.1.1 and later
- **Affected under specific conditions**: QuestDB 5.0.4 to 7.1.3, QuestDB
  Enterprise 1.1.0

The vulnerability is in the HotSpot JIT intrinsic for
`java.util.Base64` decoding on x86-64 CPUs with AVX-512 VBMI, in OpenJDK
17.0.6 and later. A crafted Base64 input with trailing `=` padding makes the
optimized decoder write out of bounds. ARM64 is not affected.

### Why current versions are not affected

QuestDB has only one path where remotely supplied input is processed by the
JDK Base64 decoder: the browser login token for
[QWP over WebSocket](/docs/connect/wire-protocols/overview/), added in QuestDB
10.1.0. QuestDB validates that input before passing it to the decoder, and
it refuses the inputs needed to trigger the bug. Every byte must be in
`[A-Za-z0-9_-]`, so the `=` padding never reaches the decoder.

Everything else decodes Base64 with QuestDB's own decoder, which is plain
Java and never runs the vulnerable JVM code. This includes HTTP basic
authentication, OIDC tokens, ILP authentication and the SQL `from_base64()`
function. The remaining JDK decoder calls read key files supplied by the
administrator at startup, so an attacker cannot reach them.

### Older versions

In QuestDB 5.0.4 to 7.1.3, and in QuestDB Enterprise 1.1.0, the
[ILP over TCP authentication](/docs/connect/compatibility/ilp/overview/#authentication)
handshake passed the client's signature to the JDK decoder without
validating it first. The decode runs before the signature is verified, so the
client does not need a private key.

These versions are exposed only when all of the following are true:

- ILP over TCP authentication is enabled, and the attacker can reach the ILP
  port and knows a configured key ID.
- QuestDB runs on OpenJDK 17.0.6 or later. The QuestDB 7.1.2 and 7.1.3
  downloads with a bundled JRE, the QuestDB 7.1.3 Docker image and the QuestDB
  Enterprise 1.1.0 Docker image all ship JDK 17.0.7. Earlier releases bundle an
  older JRE and are exposed only when started on a JDK installed by the user.
- The server CPU is x86-64 with AVX-512 VBMI.

To mitigate, upgrade to a current release. If you cannot upgrade, start the
JVM with `-XX:-UseBASE64Intrinsics`, which disables the vulnerable intrinsic.
