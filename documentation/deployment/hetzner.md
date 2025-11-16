---
title: Deploying to Hetzner Cloud
sidebar_label: Hetzner
description:
  This document explains what hardware to use, and how to provision QuestDB on Hetzner Cloud with storage volumes and automated backups.
---

import FileSystemChoice from "../../src/components/DRY/_questdb_file_system_choice.mdx"
import MinimumHardware from "../../src/components/DRY/_questdb_production_hardware-minimums.mdx"
import InterpolateReleaseData from "../../src/components/InterpolateReleaseData"
import CodeBlock from "@theme/CodeBlock"

This guide covers deploying QuestDB on Hetzner Cloud infrastructure, including server provisioning, storage configuration, and backup setup.

## Prerequisites

- Hetzner Cloud account with API access
- `hcloud` CLI tool installed and configured
- SSH key created in Hetzner Cloud Console

## Hardware Recommendations

<MinimumHardware />

### Hetzner Cloud Server Specifications

For production deployments, we recommend selecting a server with at least 8GB of RAM. The `CPX31` or `CPX41` instances provide good balance of CPU and memory for most QuestDB workloads.

### Storage Considerations

Hetzner Block Storage Volumes support both ext4 and xfs filesystems. This guide uses ext4, which is fully supported by QuestDB and provides excellent performance characteristics.

**Performance benchmarks**: While Hetzner doesn't provide specific performance guarantees for Block Storage Volumes, testing with `fio` typically shows:
- **Throughput**: ~300 MB/s  
- **IOPS**: ~4700 with 64k block size

<details>
<summary>Benchmark command used</summary>

```bash
fio --name=write_throughput --directory=/questdb/fiotest --numjobs=8 \
    --size=10G --time_based --runtime=60s --ramp_time=2s \
    --ioengine=libaio --direct=1 --verify=0 --bs=64k \
    --iodepth=64 --rw=write --group_reporting=1
```
</details>

For more guidance on storage requirements, see the [Capacity Planning](/docs/operations/capacity-planning/) documentation.


## Provisioning Resources

### Step 1: Create the Server and Storage Volume

Use the Hetzner Cloud CLI to provision your infrastructure. Choose a location (`nbg`, `fsn`, `hel`) closest to your other services for optimal latency.

```bash
# Create the QuestDB server
hcloud server create \
  --type cpx41 \
  --name questdb01 \
  --image ubuntu-24.04 \
  --ssh-key <your-ssh-key-name> \
  --location <location> \
  --label questdb

# Create and attach storage volume (50GB, expandable later)
hcloud volume create \
  --size 50 \
  --name questdb01-storage \
  --server questdb01 \
  --format ext4
```

:::tip
Replace `<your-ssh-key-name>` with the SSH key name from your Hetzner Cloud Console. Replace `<location>` with your preferred data center location (e.g., `nbg1`, `fsn1`, `hel1`).
:::

### Step 2: Verify Server Access

Test SSH connectivity to ensure the server is properly configured:

```bash
hcloud server ssh questdb01
```

### Step 3: Configure Firewall Rules

Implement security best practices by creating a firewall with minimal required access:

```bash
# Create firewall
hcloud firewall create --name questdb

# Apply to servers with 'questdb' label
hcloud firewall apply-to-resource questdb \
  --type label_selector \
  --label-selector questdb

# Allow SSH access (port 22)
hcloud firewall add-rule \
  --direction in \
  --source-ips 0.0.0.0/0 \
  --source-ips ::/0 \
  --protocol tcp \
  --port 22 \
  questdb

# Allow ICMP for ping/connectivity tests
hcloud firewall add-rule \
  --direction in \
  --source-ips 0.0.0.0/0 \
  --source-ips ::/0 \
  --protocol icmp \
  questdb

# Allow QuestDB Web Console access (restrict to your IP)
hcloud firewall add-rule \
  --direction in \
  --source-ips <your-ip>/32 \
  --protocol tcp \
  --port 9000 \
  questdb
```

:::warning Security Note
Replace `<your-ip>` with your actual public IP address. For production deployments, consider restricting access to specific IP ranges or implementing additional security measures.
:::

**Default QuestDB Ports:**
- `9000`: [Web Console](/docs/web-console/) and [REST API](/docs/reference/api/rest/)
- `8812`: [PostgreSQL wire protocol](/docs/reference/api/postgres/)
- `9009`: [InfluxDB line protocol](/docs/reference/api/ilp/overview/) (TCP)
- `9003`: [Health monitoring](/docs/operations/logging-metrics/#minimal-http-server) and Prometheus metrics

Add firewall rules for additional ports as needed for your specific use case.

## Storage Volume Configuration

### Step 1: Identify the Storage Device

Get the Linux device path for your storage volume:

```bash
hcloud volume describe questdb01-storage
```

Example output:
```
ID:             103719107
Name:           questdb01-storage
Created:        Fri Oct 10 11:56:38 CEST 2025 (1 hour ago)
Size:           50 GB
Linux Device:   /dev/disk/by-id/scsi-0HC_Volume_103719107
Location:
  Name:         nbg1
  Description:  Nuremberg DC Park 1
  Country:      DE
  City:         Nuremberg
  Latitude:     49.452102
  Longitude:    11.076665
Server:
  ID:           110531131
  Name:         questdb01
Protection:
  Delete:       yes
Labels:
  No labels
```

### Step 2: Mount the Storage Volume

Connect to your server and configure the storage:

```bash
# SSH into the server
hcloud server ssh questdb01

# Create mount point directory
questdb01$ mkdir -p /questdb

# Mount the volume with optimized settings
questdb01$ mount -o discard,defaults /dev/disk/by-id/scsi-0HC_Volume_103719107 /questdb

# Add to fstab for persistent mounting
questdb01$ echo "/dev/disk/by-id/scsi-0HC_Volume_103719107 /questdb ext4 discard,nofail,defaults 0 0" >> /etc/fstab

# Verify the mount is successful
questdb01$ df -h /questdb
```

:::note Mount Options Explained
- `discard`: Enables TRIM support for better SSD performance
- `nofail`: Prevents boot failure if volume is unavailable  
- `defaults`: Uses standard mount options (rw,suid,dev,exec,auto,nouser,async)
:::

The QuestDB [root directory structure](/docs/concept/root-directory-structure/) will be created automatically on first startup.


## Installing and Running QuestDB

### Installation Options

Once you have provisioned your server with attached storage, you have several installation options:

- **[Docker](docker.md)** - Containerized deployment (recommended for this guide)
- **[systemd](systemd.md)** - Native Linux service 
- **Binary** - Direct execution of the [QuestDB binary](https://questdb.com/download/)

### Docker Installation

This guide uses Docker for its simplicity and portability. Install Docker on Ubuntu following the [official Docker documentation](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository).

#### Quick Docker installation:
```bash
questdb01$ curl -fsSL https://get.docker.com -o get-docker.sh
questdb01$ sudo sh get-docker.sh
questdb01$ sudo usermod -aG docker $USER
```

### Running QuestDB Container

Start QuestDB with persistent storage mounted from your Block Storage Volume:

<InterpolateReleaseData
renderText={(release) => (
<CodeBlock className="language-bash">
{`questdb01$ docker run -d --name questdb \\
  --restart unless-stopped \\
  -p 9000:9000 -p 9009:9009 -p 8812:8812 -p 9003:9003 \\
  -v "/questdb/qdbroot:/var/lib/questdb" \\
  -e JVM_PREPEND="-Xmx12g" \\
  questdb/questdb:${release.name}`}
</CodeBlock>
)}
/>

**Port mappings explained:**
- `-p 9000:9000`: [Web Console](/docs/web-console/) and [REST API](/docs/reference/api/rest/)
- `-p 9009:9009`: [InfluxDB line protocol](/docs/reference/api/ilp/overview/) (TCP)
- `-p 8812:8812`: [PostgreSQL wire protocol](/docs/reference/api/postgres/)
- `-p 9003:9003`: [Health monitoring](/docs/operations/logging-metrics/#minimal-http-server) and Prometheus metrics

:::tip Port Selection
You can expose only the ports you need. For example, if you only plan to use PostgreSQL wire protocol, you can use `-p 8812:8812` exclusively.
:::

**Memory allocation guidelines:**

For production workloads, configure JVM memory allocation based on your server's available RAM.
In the example command above for a CPX41 (16GB RAM) instance we allocate ~12GB to QuestDB. For other instances consider these memory allocations:

- Leave 25-30% of total RAM for the operating system and other processes
- For 16GB server: Use `-Xmx12g` 
- For 32GB server: Use `-Xmx24g`
- For 64GB server: Use `-Xmx48g`

### Verification

Verify your QuestDB deployment:

```bash
# Get the server's external IP
questdb01$ curl -s ifconfig.me

# Check container status
questdb01$ docker ps

# View logs
questdb01$ docker logs questdb
```

Navigate to `http://<external_ip>:9000` in your browser to access the [Web Console](/docs/web-console/).

## QuestDB Configuration

### Basic Security Setup

Configure essential security settings by editing the QuestDB configuration file:

```bash
# Edit the configuration file
questdb01$ nano /questdb/qdbroot/conf/server.conf
```

**Essential configurations:**

```ini title="/questdb/qdbroot/conf/server.conf"
# PostgreSQL authentication
pg.user=admin
pg.password=<your_secure_password>

# Optional: Web Console authentication
http.user=admin
http.password=<your_secure_password>
```

### Secure Configuration File

Protect sensitive configuration data by restricting file permissions:

```bash
# Restrict access to configuration file
questdb01$ chmod 600 /questdb/qdbroot/conf/server.conf

# Verify permissions
questdb01$ ls -la /questdb/qdbroot/conf/server.conf
```

### Apply Configuration Changes

Restart the container to apply configuration changes:

```bash
questdb01$ docker restart questdb
```

### Additional Configuration Options

For comprehensive configuration options, see the [Configuration reference](/docs/configuration/) documentation. Common production settings include:

- **Connection limits**: `pg.connection.pool.size`
- **Memory settings**: `shared.worker.count`
- **Security**: [TLS configuration](/docs/operations/tls/)
- **Authentication**: [RBAC setup](/docs/operations/rbac/)

The QuestDB [root directory structure](/docs/concept/root-directory-structure/) contains all configuration files and data.


## Upgrading QuestDB

### Pre-upgrade Checklist

Before upgrading, always:

1. Check the [release notes](https://github.com/questdb/questdb/releases) for breaking changes
2. Complete a [backup](/docs/operations/backup/) of your data (see instruction later)
3. Test the upgrade in a staging environment if possible

### Upgrade Process

<InterpolateReleaseData
renderText={(release) => (
<>
<p><strong>To upgrade to the latest version ({release.name}):</strong></p>
<CodeBlock className="language-bash">
{`# Stop the current container
questdb01$ docker stop questdb

# Remove the container (data persists in mounted volume)
questdb01$ docker rm questdb

# Pull the latest image
questdb01$ docker pull questdb/questdb:${release.name}

# Start with the new version (include memory configuration)
questdb01$ docker run -d --name questdb \\
  --restart unless-stopped \\
  -p 9000:9000 -p 9009:9009 -p 8812:8812 -p 9003:9003 \\
  -v "/questdb/qdbroot:/var/lib/questdb" \\
  -e JVM_PREPEND="-Xmx12g" \\
  questdb/questdb:${release.name}`}
</CodeBlock>
</>
)}
/>

### Verification

After upgrading, verify the deployment:

```bash
# Check container status
questdb01$ docker ps

# View startup logs
questdb01$ docker logs questdb

# Test connectivity
questdb01$ curl -f http://localhost:9000/status
```

:::warning Data Safety
Your data remains safe during upgrades as it's stored on the persistent Block Storage Volume. However, always maintain regular backups as described in the backup section below.
:::

## Backup Strategy

Since Hetzner Block Storage Volumes can only be attached to a single server, backups must be performed directly from the QuestDB server. This section demonstrates automated backup using [Borg Backup](https://www.borgbackup.org/) with [Hetzner Storage Box](https://www.hetzner.com/storage/storage-box/).

### Storage Box Setup

Hetzner Storage Boxes provide cost-effective remote storage with native Borg Backup support for efficient incremental backups.

:::note Storage Box Creation
Storage Box creation via `hcloud` CLI is not yet supported ([tracking issue](https://github.com/hetznercloud/hcloud-go/issues/675)). Create through the [Hetzner Cloud Console](https://console.hetzner.cloud/) instead.
:::

**Storage Box configuration:**
- **Type**: BX11 or higher based on data size requirements
- **SSH support**: Enable for Borg Backup access
- **Location**: Choose a different geographic region than your server for disaster recovery
- **Additional settings**: Enable SSH support and mark the storage box as external reachable

After creation, your Storage Box will have a hostname like `uXXXXX.your-storagebox.de` and is accessible via SSH on port 23:

```bash
ssh -p 23 uXXXXX@uXXXXX.your-storagebox.de
```

For detailed QuestDB backup concepts, see the [Backup Operations](/docs/operations/backup/) documentation.

### SSH Key Configuration

Set up secure authentication between your QuestDB server and Storage Box following [Hetzner's SSH key documentation](https://docs.hetzner.com/storage/storage-box/backup-space-ssh-keys/).

#### Step 1: Generate SSH Key Pair

Create a dedicated SSH key pair for backup operations (no passphrase required for automation):

```bash
# Generate key pair on your local machine
ssh-keygen -f questdb-backup -N ""
```

#### Step 2: Deploy Private Key

Copy the private key to your QuestDB server with secure permissions:

```bash
# Copy private key to server
scp questdb-backup root@<server_ip>:/root/.ssh/

# Set secure permissions via SSH
hcloud server ssh questdb01 -- chmod 400 /root/.ssh/questdb-backup
```

#### Step 3: Install Public Key

Add the public key to your Storage Box:

```bash
# Install public key on Storage Box
cat questdb-backup.pub | ssh -p 23 uXXXXX@uXXXXX.your-storagebox.de install-ssh-key
```

#### Step 4: Test Connection

Verify SSH connectivity from your QuestDB server:

```bash
# SSH to QuestDB server
hcloud server ssh questdb01

# Test Storage Box connection
questdb01$ ssh -p 23 -i ~/.ssh/questdb-backup uXXXXX@uXXXXX.your-storagebox.de
```

The connection should succeed without prompting for a password.

### Borg Backup Repository Setup

Configure Borg Backup following [Hetzner's Borg documentation](https://docs.hetzner.com/storage/storage-box/access/access-ssh-rsync-borg#borgbackup).

#### Install Backup Tools

```bash
# Install Borg Backup and Borgmatic
questdb01$ apt update && apt install -y borgbackup borgmatic
```

#### Initialize Backup Repository

```bash
# Set SSH configuration for Borg
questdb01$ export BORG_RSH="ssh -p 23 -i ~/.ssh/questdb-backup"

# Initialize encrypted repository
questdb01$ borg init --encryption=repokey --remote-path=borg-1.4 \
    ssh://uXXXXX@uXXXXX.your-storagebox.de:23/./questdb01
```

:::warning Passphrase Security
You'll be prompted for an encryption passphrase. **Store this securely** - it's required for backup restoration. Consider using a password manager or secure vault.
:::

#### Create Borgmatic Configuration

Create `/etc/borgmatic/config.yaml` with retention policies and source directories:

```yaml title="/etc/borgmatic/config.yaml"
# Source directories to backup
source_directories:
    - /questdb/qdbroot

# Backup repository location
repositories:
    - path: ssh://uXXXXX@uXXXXX.your-storagebox.de:23/./questdb01

# Retention policy
retention:
    keep_daily: 30
    keep_monthly: 12
    keep_yearly: 10

# Consistency checks
checks:
    - repository
    - archives

# Borg-specific options
borg_ssh_command: ssh -p 23 -i /root/.ssh/questdb-backup
```

### PostgreSQL Client Setup

QuestDB requires [checkpoint management during backup operations](/docs/operations/backup/) to ensure data consistency. Install the PostgreSQL client for checkpoint commands:

```bash
# Install PostgreSQL client
questdb01$ apt update && apt install -y postgresql-client
```

#### Configure Database Credentials

Create secure credential storage for automated backup operations:

```bash
# Create credentials file
questdb01$ cat > /root/.psql.env << EOF
PGUSER="admin"
PGPASSWORD="<your_secure_password>"
PGHOST="localhost"
PGPORT="8812"
PGDATABASE="qdb"
EOF

# Secure the credentials file
questdb01$ chmod 600 /root/.psql.env
```

#### Test Database Connection

Verify PostgreSQL connectivity:

```bash
# Load environment variables
questdb01$ set -a && source /root/.psql.env && set +a

# Test connection
questdb01$ psql -c "SELECT version();"
```

Expected output should show QuestDB version information, confirming successful database connectivity.

For more details on QuestDB's PostgreSQL compatibility, see the [PostgreSQL wire protocol](/docs/reference/api/postgres/) documentation.

### Manual Backup Test

Perform a test backup to verify the complete backup pipeline. The backup process follows QuestDB's [recommended backup sequence](/docs/operations/backup/):

1. **Create checkpoint** - Ensures consistent state
2. **Run backup** - Copy data to remote storage  
3. **Release checkpoint** - Resume normal operations

```bash
# Load database credentials
questdb01$ set -a && source /root/.psql.env && set +a

# Step 1: Create checkpoint for consistent backup
questdb01$ psql -c "CHECKPOINT CREATE"

# Step 2: Execute backup with progress monitoring
questdb01$ borgmatic --progress --stats -v 2

# Step 3: Release checkpoint
questdb01$ psql -c "CHECKPOINT RELEASE"
```

#### Verify Backup Success

Check backup completion and repository status:

```bash
# List backup archives
questdb01$ borg list ssh://uXXXXX@uXXXXX.your-storagebox.de:23/./questdb01

# Check repository info
questdb01$ borg info ssh://uXXXXX@uXXXXX.your-storagebox.de:23/./questdb01
```

If the backup reports success, proceed to automated backup configuration.

### Automated Backup Configuration

Set up automated nightly backups using cron scheduling.

#### Create Borg Environment Configuration

Store Borg-specific environment variables securely:

```bash
# Create Borg environment file
questdb01$ cat > /root/.borg.env << EOF
BORG_RSH="ssh -p 23 -i ~/.ssh/questdb-backup"
BORG_PASSPHRASE="<your_encryption_passphrase>"
EOF

# Secure the environment file
questdb01$ chmod 600 /root/.borg.env
```

#### Create Backup Script

Create an automated backup script that implements [QuestDB's checkpoint-based backup](/docs/operations/backup/):

```bash
questdb01$ cat > /root/borg-run.sh << 'EOF'
#!/bin/bash

# Exit on any error
set -e

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Cleanup function - always release checkpoint
function cleanup {
    log "Releasing checkpoint"
    psql -c "CHECKPOINT RELEASE" || log "WARNING: Failed to release checkpoint"
}

# Load environment variables
set -a
source /root/.psql.env
source /root/.borg.env
set +a

# Ensure checkpoint is released on script exit
trap cleanup EXIT

log "Starting QuestDB backup process"

# Create consistent checkpoint before backup
log "Creating database checkpoint"
psql -c "CHECKPOINT CREATE"

# Execute backup with minimal logging for cron
log "Running Borgmatic backup"
borgmatic --progress --stats -v 0 2>&1

log "Backup completed successfully"
EOF

# Make script executable
questdb01$ chmod +x /root/borg-run.sh
```

#### Schedule Automated Backups

Configure nightly backups at 4:00 AM:

```bash
# Add to crontab
questdb01$ (crontab -l 2>/dev/null; echo "0 4 * * * /root/borg-run.sh >> /var/log/questdb-backup.log 2>&1") | crontab -

# Verify crontab entry
questdb01$ crontab -l
```

#### Monitor Backup Operations

Track backup execution through logs:

```bash
# View recent backup logs
questdb01$ tail -f /var/log/questdb-backup.log

# Check backup history
questdb01$ borg list ssh://uXXXXX@uXXXXX.your-storagebox.de:23/./questdb01 | tail -10
```

:::tip Monitoring Best Practices
- Monitor backup logs regularly for failures
- Test backup restoration procedures periodically  
- Consider setting up alerting for failed backups
- Verify backup integrity with `borg check` monthly
:::

Your QuestDB instance on Hetzner Cloud is now fully configured with automated backups.