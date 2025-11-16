---
title: Deploying to Amazon Web Services (AWS)
sidebar_label: AWS
description:
  This document explains what to hardware to use, and how to provision QuestDB on Amazon Web Services (AWS).
---

import FileSystemChoice from "../../src/components/DRY/_questdb_file_system_choice.mdx"
import MinimumHardware from "../../src/components/DRY/_questdb_production_hardware-minimums.mdx"
import InterpolateReleaseData from "../../src/components/InterpolateReleaseData"
import CodeBlock from "@theme/CodeBlock"


## Hardware recommendations

<MinimumHardware />

### Elastic Compute Cloud (EC2) with Elastic Block Storage (EBS)

We recommend starting with `M8` instances, with an upgrade to
`R8` instances if extra RAM is needed. You can use either `i` (Intel) or `a` (AMD) instances. 

These should be deployed with an `x86_64` Linux distribution, such as Ubuntu.

For storage, we recommend using `gp3` disks, as these provide a better price-to-performance
ratio compared to `gp2` or `io1` offerings.`5000 IOPS/300 MBps` is a good starting point until
you have tested your workload.

<FileSystemChoice />

### Elastic File System (EFS)

QuestDB **does not** support `EFS` for its primary storage. Do not use it instead of `EBS`.

You can use it as object store, but we would recommend using `S3` instead, as a simpler, 
and cheaper, alternative.

### Simple Storage Service (S3)

QuestDB supports `S3` as its replication object-store in the Enterprise edition.

This requires very little provisioning - simply create a bucket or virtual subdirectory and follow
the [Enterprise Quick Start](/docs/guides/enterprise-quick-start/) steps to configure replication.

### Minimum specification

- **Instance**: `m8i.xlarge` or `m8a.xlarge` `(4 vCPUs, 16 GiB RAM)`
- **Storage**
    - **OS disk**: `gp3 (30 GiB)` volume provisioned with `3000 IOPS/125 MBps`.
    - **Data disk**: `gp3 (100 GiB)` volume provisioned with `3000 IOPS/125 MBps`.
- **Operating System**: `Linux Ubuntu 24.04 LTS x86_64`.
- **File System**: `ext4`

### Better specification

- **Instance**: `r8i.2xlarge` or `r8a.2xlarge` `(8 vCPUs, 64 GiB RAM)`
- **Storage**
    - **OS disk**: `gp3 (30 GiB)` volume provisioned with `5000 IOPS/300 MBps`.
    - **Data disk**: `gp3 (300 GiB)` volume provisioned with `5000 IOPS/300 MBps`.
- **Operating System**: `Linux Ubuntu 24.04 LTS x86_64`.
- **File System**: `zfs` with `lz4` compression.

### AWS Graviton

QuestDB can also be run on AWS Graviton (ARM) instances, which have a strong price-to-performance ratio.

For example, `r8g` instances are cheaper than `r6i` instances, and will offer superior performance for most Java-centric code.
Queries which rely on the `JIT` compiler (native WHERE filters) or vectorisation optimisations will potentially run slower.
Ingestion speed is generally unaffected.

Therefore, if your use case is ingestion-centric, or your queries do not heavily leverage SIMD/JIT, `r8g` instances
may offer better performance and better value overall.

### Storage Optimised Instances (Enterprise)

AWS offer storage-optimised instances (e.g. `i7i`), which include locally-attached NVMe devices. Workloads which
are disk-limited (for example, heavy out-of-order writes) will benefit significantly from the faster storage.

However, it is not recommended to use locally-attached NVMe on QuestDB OSS, as instance termination or failure
will lead to data loss. QuestDB Enterprise replicates data eagerly to object storage (`S3`), preserving
data in the event of an instance failure.

## Launching QuestDB on EC2

Once you have provisioned your `EC2` instance with attached `EBS` storage, you can simply
follow the setup instructions for a [Docker](docker.md) or [systemd](systemd.md) installation.

You can also keep it simple - just [download](https://questdb.com/download/) the binary and run it directly.
QuestDB is a single self-contained binary and easy to deploy.

## Launching QuestDB on the AWS Marketplace

[AWS Marketplace](https://aws.amazon.com/marketplace) is a digital catalog with software listings from independent
software vendors that runs on AWS. This guide describes how to launch QuestDB
via the AWS Marketplace using the official listing. This document also describes
usage instructions after you have launched the instance, including hints for
authentication, the available interfaces, and tips for accessing the REST API
and [Web Console](/docs/web-console/).

The QuestDB listing can be found in the AWS Marketplace under the databases
category. To launch a QuestDB instance:

1. Navigate to the
   [QuestDB listing](https://aws.amazon.com/marketplace/search/results?searchTerms=questdb)
2. Click **Continue to Subscribe** and subscribe to the offering
3. **Configure** a version, an AWS region and click **Continue to** **Launch**
4. Choose an instance type and network configuration and click **Launch**

An information panel displays the ID of the QuestDB instance with launch
configuration details and hints for locating the instance in the EC2 console.

The default user is `admin` and password is `quest` to log in to the Web Console.

## QuestDB configuration

Connect to the instance where QuestDB is deployed using SSH. The server
configuration file is at the following location on the AMI:

```bash
/var/lib/questdb/conf/server.conf
```

For details on the server properties and using this file, see the
[server configuration documentation](/docs/configuration/).

The default ports used by QuestDB interfaces are as follows:

- [Web Console](/docs/web-console/) &amp; REST API is available on port `9000`
- PostgreSQL wire protocol available on `8812`
- InfluxDB line protocol `9009` (TCP and UDP)
- Health monitoring &amp; Prometheus `/metrics` `9003`

### Postgres credentials

Generated credentials can be found in the server configuration file:

```bash
/var/lib/questdb/conf/server.conf
```

The default Postgres username is `admin` and a password is randomly generated
during startup:

```ini
pg.user=admin
pg.password=...
```

To use the credentials that are randomly generated and stored in the
`server.conf`file, restart the database using the command
`sudo systemctl restart questdb`.

### InfluxDB line protocol credentials

The credentials for InfluxDB line protocol can be found at

```bash
/var/lib/questdb/conf/full_auth.json
```

For details on authentication using this protocol, see the
[InfluxDB line protocol authentication guide](/docs/reference/api/ilp/overview/#authentication).

### Disabling authentication

If you would like to disable authentication for Postgres wire protocol or
InfluxDB line protocol, comment out the following lines in the server
configuration file:

```ini title="/var/lib/questdb/conf/server.conf"
# pg.password=...

# line.tcp.auth.db.path=conf/auth.txt
```

### Disabling interfaces

Interfaces may be **disabled completely** with the following configuration:

```ini title="/var/lib/questdb/conf/server.conf"
# disable postgres
pg.enabled=false

# disable InfluxDB line protocol over TCP and UDP
line.tcp.enabled=false
line.udp.enabled=false

# disable HTTP (web console and REST API)
http.enabled=false
```

The HTTP interface may alternatively be set to **readonly**:

```ini title="/var/lib/questdb/conf/server.conf"
# set HTTP interface to readonly
http.security.readonly=true
```

## Upgrading QuestDB

:::note

- Check the [release notes](https://github.com/questdb/questdb/releases) and
  ensure that necessary [backup](/docs/operations/backup/) is completed.

:::

You can perform the following steps to upgrade your QuestDB version on an
official AWS QuestDB AMI:

- Stop the service:

```shell
systemctl stop questdb.service
```

- Download and copy over the new binary

<InterpolateReleaseData
renderText={(release) => (
<CodeBlock className="language-shell">
{`wget https://github.com/questdb/questdb/releases/download/${release.name}/questdb-${release.name}-no-jre-bin.tar.gz \\
tar xzvf questdb-${release.name}-no-jre-bin.tar.gz
cp questdb-${release.name}-no-jre-bin/questdb.jar /usr/local/bin/questdb.jar
cp questdb-${release.name}-no-jre-bin/questdb.jar /usr/local/bin/questdb-${release.name}.jar`}
</CodeBlock>
)}
/>

- Restart the service again:

```shell
systemctl restart questdb.service
systemctl status questdb.service
```
