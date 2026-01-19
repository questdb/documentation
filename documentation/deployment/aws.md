---
title: Deploying QuestDB on AWS
sidebar_label: AWS
description:
  Deploy QuestDB on Amazon Web Services using EC2, with instance sizing, storage, and networking recommendations.
---

import InterpolateReleaseData from "../../src/components/InterpolateReleaseData"
import CodeBlock from "@theme/CodeBlock"

## Quick reference

| Component | Recommended | Notes |
|-----------|-------------|-------|
| Instance | `m7i.xlarge` or `r7i.2xlarge` | 4-8 vCPUs, 16-64 GiB RAM |
| Storage | `gp3`, 200+ GiB | 16000 IOPS / 1000 MBps |
| File system | `zfs` with `lz4` | Or `ext4` if compression not needed |
| Ports | 9000, 8812, 9009, 9003 | Restrict to known IPs only |

---

## Infrastructure

Plan your infrastructure before launching. This section covers instance types,
storage, and networking requirements.

### Instance sizing

| Workload | Instance | vCPUs | RAM | Use case |
|----------|----------|-------|-----|----------|
| Development | `m7i.large` | 2 | 8 GiB | Testing, small datasets |
| Production (starter) | `m7i.xlarge` | 4 | 16 GiB | Light ingestion, moderate queries |
| Production (standard) | `r7i.2xlarge` | 8 | 64 GiB | High ingestion, complex queries |
| Production (heavy) | `r7i.4xlarge` | 16 | 128 GiB | Heavy workloads, large datasets |

**Choosing an instance family:**

- **`m7i` / `m7a`** - Balanced compute and memory. Good starting point.
- **`r7i` / `r7a`** - Memory-optimized. Better for large datasets or complex queries.
- **`m8i` / `r8i`** - Latest generation. Best performance if available in your region.

Intel (`i`) and AMD (`a`) variants perform similarly. Choose based on
availability and pricing.

**ARM instances (Graviton):**

Graviton instances (`r7g`, `r8g`) cost less and perform well for ingestion.
However, queries using JIT compilation or SIMD vectorization run slower on ARM.
Choose Graviton when your workload is primarily ingestion or cost is a priority.

**Storage-optimized instances:**

Instances with local NVMe (`i7i`, `i8i`) provide fastest disk I/O but lose data
on termination. Only use with QuestDB Enterprise, which replicates to S3.

### Storage

**EBS configuration:**

| Workload | Volume | Size | IOPS | Throughput |
|----------|--------|------|------|------------|
| Development | `gp3` | 50 GiB | 3000 | 125 MBps |
| Production | `gp3` | 200+ GiB | 16000 | 1000 MBps |
| High I/O | `gp3` | 500+ GiB | 16000+ | 1000+ MBps |

Use `gp3` volumes. They offer better price-performance than `gp2` or `io1`.
Separate your OS disk (30 GiB) from your data disk.

:::note
EBS throughput is limited by instance type. Smaller instances cannot sustain
high IOPS or throughput regardless of volume provisioning. Check your instance's
EBS bandwidth limits in the [AWS documentation](https://docs.aws.amazon.com/ec2/latest/instancetypes/gp.html)
before provisioning storage.
:::

**File system:**

Use `zfs` with `lz4` compression to reduce storage costs. If you don't need
compression, `ext4` or `xfs` offer slightly better performance.

**Unsupported storage:**

- **EFS** - Not supported. Network latency is too high for database workloads.
- **S3** - Not supported as primary storage. Use for replication (Enterprise only).

### Networking

**Security group rules:**

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22 | TCP | Your IP | SSH access |
| 9000 | TCP | Your IP / VPC | Web Console & REST API |
| 8812 | TCP | Your IP / VPC | PostgreSQL wire protocol |
| 9009 | TCP | Application servers | InfluxDB line protocol |
| 9003 | TCP | Monitoring servers | Health check & Prometheus |

:::warning
Never expose ports 9000, 8812, or 9009 to `0.0.0.0/0`. Restrict access to known
IP ranges or use a bastion host.
:::

**VPC recommendations:**

- Deploy QuestDB in a private subnet
- Use a NAT gateway for outbound access (package updates, etc.)
- Use VPC endpoints for S3 if using Enterprise replication
- Consider placement groups for low-latency application access

---

## Deployment

Choose your deployment method:

- **[AWS Marketplace](#aws-marketplace)** - Pre-configured AMI, fastest setup
- **[Manual EC2](#manual-ec2)** - Full control, use your own AMI

### AWS Marketplace

The QuestDB AMI comes pre-configured and ready to run.

**Steps:**

1. Go to the [QuestDB Marketplace listing](https://aws.amazon.com/marketplace/search/results?searchTerms=questdb)
2. Click **Continue to Subscribe** and accept terms
3. Click **Continue to Configure**, select your region
4. Click **Continue to Launch**
5. Select instance type, VPC, subnet, and security group
6. Click **Launch**

**After launch:**

Connect to the Web Console at `http://<instance-public-ip>:9000`

Default credentials:
- **Web Console**: `admin` / `quest`
- **PostgreSQL**: `admin` / random (check `/var/lib/questdb/conf/server.conf`)

:::warning
Change default credentials immediately. See [Security](#security) below.
:::

**Configuration file location:**

```
/var/lib/questdb/conf/server.conf
```

### Manual EC2

Deploy QuestDB on any EC2 instance you configure yourself.

**Steps:**

1. Launch an EC2 instance with your preferred AMI (Ubuntu 22.04+ recommended)
2. Attach a `gp3` EBS volume for data
3. Configure the security group per the [Networking](#networking) section
4. SSH into the instance
5. Install QuestDB via [Docker](/docs/deployment/docker/) or [systemd](/docs/deployment/systemd/)

You can also download the binary directly:

```bash
curl -L https://questdb.com/download -o questdb.tar.gz
tar xzf questdb.tar.gz
./questdb.sh start
```

---

## Security

### Change default credentials

Update credentials immediately after deployment.

**Web Console and REST API** - edit `server.conf`:

```ini
http.user=your_username
http.password=your_secure_password
```

**PostgreSQL** - edit `server.conf`:

```ini
pg.user=your_username
pg.password=your_secure_password
```

**InfluxDB line protocol** - edit `conf/auth.json`. See
[ILP authentication](/docs/ingestion/ilp/overview/#authentication).

Restart after changes:

```bash
sudo systemctl restart questdb
```

### Disable unused interfaces

Reduce attack surface by disabling protocols you don't use:

```ini title="server.conf"
pg.enabled=false           # Disable PostgreSQL
line.tcp.enabled=false     # Disable ILP
http.enabled=false         # Disable Web Console & REST API
http.security.readonly=true  # Or make HTTP read-only
```

---

## Operations

### Upgrading

**Marketplace AMI:**

1. Stop QuestDB:
   ```bash
   sudo systemctl stop questdb
   ```

2. Back up data:
   ```bash
   sudo cp -r /var/lib/questdb /var/lib/questdb.backup
   ```

3. Download new version:

<InterpolateReleaseData
renderText={(release) => (
<CodeBlock className="language-bash">
{`wget https://github.com/questdb/questdb/releases/download/${release.name}/questdb-${release.name}-no-jre-bin.tar.gz
tar xzf questdb-${release.name}-no-jre-bin.tar.gz
sudo cp questdb-${release.name}-no-jre-bin/questdb.jar /usr/local/bin/questdb.jar`}
</CodeBlock>
)}
/>

4. Restart:
   ```bash
   sudo systemctl start questdb
   ```

**Manual deployments:** Follow upgrade steps for [Docker](/docs/deployment/docker/)
or [systemd](/docs/deployment/systemd/).

### Monitoring

**Health check:**

```bash
curl http://localhost:9003/status
```

**Prometheus metrics:**

```bash
curl http://localhost:9003/metrics
```

**CloudWatch integration:**

Use the CloudWatch agent to collect:
- System metrics (CPU, memory, disk I/O)
- QuestDB logs from `/var/lib/questdb/log/`
- Custom metrics scraped from the Prometheus endpoint

---

## Enterprise on AWS

QuestDB Enterprise adds production features for AWS:

- **S3 replication** - Continuous backup for durability
- **Cold storage** - Move old partitions to S3, query on-demand
- **High availability** - Automatic failover across instances

See [Enterprise Quick Start](/docs/getting-started/enterprise-quick-start/).
