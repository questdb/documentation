---
title: Deploying to Hetzner Cloud
sidebar_label: Hetzner
description:
  This document explains what hardware to use, and how to provision QuestDB on Hetzner Cloud.
---

import FileSystemChoice from "../../src/components/DRY/_questdb_file_system_choice.mdx"
import MinimumHardware from "../../src/components/DRY/_questdb_production_hardware-minimums.mdx"
import InterpolateReleaseData from "../../src/components/InterpolateReleaseData"
import CodeBlock from "@theme/CodeBlock"


## Hardware Recommendations

<MinimumHardware />

### Hetzner Cloud servers and Block Storage Volumes


It is recommended to select a server with at least 8gb of RAM, for example the `CPX31`.


Hetzner Block Storage Volumes only supports ext4 or xfs so we will use ext4 which is supported by questdb.


Hetzner does not provide any guarantees on the block storage volume performance, but a simple measurement using `fio` reveals performance in the order of 300MBps and 4700 IOPS with a 64k block size, measured using
`fio --name=write_throughput --directory=/questdb/fiotest --numjobs=8 --size=10G --time_based --runtime=60s --ramp_time=2s --ioengine=libaio --direct=1 --verify=0 --bs=64k --iodepth=64 --rw=write --group_reporting=1`.


## Creating the Hetzner resources

Create the server and storage volume using the Hetzner `hcloud` cli. You should pick a desired location near your other services, e.g. `nbg`.
The named `ssh-key` should be created in advance through the hetzner cloud console. During the creation of the server, the public key will be copied to `/root/.ssh/authorized_keys` so that it is possible to login to the server right after creation.

```
hcloud server create --type cpx41 --name questdb01 --image ubuntu-24.04 --ssh-key <key> --location <location> --label questdb
hcloud volume create --size 50 --name questdb01-storage --server questdb01 --format ext4
```

The above will create a 50gb storage volume. This can be resized later.
Now try and login to the server:

```
hcloud server ssh questdb01
```


It is a good idea to put a firewall in front of the server. 
The following commands will create a `questdb` firewall that applies to servers with the `questdb` label which was attached the created server previously.
`ssh` on port 22 and icmp/echo is allowed as the only rules from anywhere.

```
hcloud firewall create --name questdb
hcloud firewall apply-to-resource questdb --type label_selector --label-selector questdb
hcloud firewall add-rule --direction in --source-ips 0.0.0.0/0 --source-ips ::/0 --protocol tcp --port 22 questdb
hcloud firewall add-rule --direction in --source-ips 0.0.0.0/0 --source-ips ::/0 --protocol icmp questdb
hcloud firewall add-rule --direction in --source-ips 1.2.3.4/32 --protocol tcp --port 9000 questdb
```

Replace `1.2.3.4` with your own ip.

## Mounting the storage volume
Now obtain the linux device for the storage volume:

```
hcloud volume describe questdb01-storage
```

This will output something like:
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

Now ssh into the server and mount the volume:

```
hcloud server ssh questdb01
questdb01$ mkdir /questdb
questdb01$ mount -o discard,defaults /dev/disk/by-id/scsi-0HC_Volume_103719107 /questdb
questdb01$ echo "/dev/disk/by-id/scsi-0HC_Volume_103719107 /questdb ext4 discard,nofail,defaults 0 0" >> /etc/fstab
```


## Launching QuestDB using Docker

Once you have provisioned your server with the attached storage volume, you can simply
follow the setup instructions for a [Docker](docker.md) or [systemd](systemd.md) installation.
You can also keep it simple - just [download](https://questdb.com/download/) the binary and run it directly.
QuestDB is a single self-contained binary and easy to deploy

In the following we will go with a Docker setup.
You can find guides for installing Docker on Ubuntu in the
[official docker documentation](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository).


Now run docker with forwarning of relevant ports and a volume mount to the mounted block storage volume:

```
questdb01$ docker run -d --name questdb \
  --restart unless-stopped \
  -p 9000:9000 -p 9009:9009 -p 8812:8812 -p 9003:9003 \
  -v "/questdb/qdbroot:/var/lib/questdb" \
  questdb/questdb:9.1.0
```

All ports are optional, you can pick only the ones you need. For example, it is
enough to expose `8812` if you only plan to use
[Postgres wire protocol](/docs/reference/api/postgres/).

To verify that the QuestDB deployment is operating as expected:
Copy the External IP of the instance. This can be found by running `ip -4 a s` on the server.
Navigate to `http://<external_ip>:9000` in a browser.

## Configuring QuestDB
Now is probably a good time to do some basic questdb configuration. Open `/questdb/qdbroot/conf/server.conf` and set a password:

```
pg.password=<my_secret_password>
```

Since the configuration file contains the admin password it is a good idea to restrict the access permissions to the file:

```
questdb01$ chmod 600 /questdb/qdbroot/conf/server.conf
```


## Upgrading QuestDB

Stop the questdb docker service
```
questdb01$ docker stop questbdb
questdb01$ docker rm questdb
```

And then re-run the `docker run ...` from above with a different questdb version.


:::note

- Check the [release notes](https://github.com/questdb/questdb/releases) and
  ensure that necessary [backup](/docs/operations/backup/) is completed.

:::

## Backup

A Hetzner Block Storage Volume can only be attached at a single server at a time, so backups must be run directly from the server itself.
As an example of an on-prem backup, we will use [Borg Backup](https://www.borgbackup.org/).
Hetzner has [Storage Boxes](https://www.hetzner.com/storage/storage-box/) which provide cheap storage and it natively supports Borg Backup which makes the backup run reasonably fast.

### Create Storage Box

We start by creating a storage box using the `hcloud` cli:

TODO: Not yet supported through hcloud (https://github.com/hetznercloud/hcloud-go/issues/675)
```
hcloud storage-box create questdb-backup --type bx11 --name questdb-backup --ssh-key <key> --location <location> --with-ssh-support --external-reachable --label questdb
```

It is a good idea to pick a location that is geographically separated from the server itself.


When the storage box is created it will get a name like: `uXXXXX.your-storagebox.de`, and is accessible with a limited ssh shell on port 23:

```
ssh -p 23 uXXXXX@uXXXXX.your-storagebox.de
```

### Setting up SSH keys

We need to generate a keypair for accessing the storage box from the questdb server instance.
From the [official Hetzner instructions](https://docs.hetzner.com/storage/storage-box/backup-space-ssh-keys/) we first generate a keypair on our local machine (no passphrase needed):

```
ssh-keygen -f questdb-backup
```

Copy the private key to the questdb server and modify the file permissions:
```
scp questdb-backup.pub root@<server_ip>:/root/.ssh/
hcloud server ssh questdb01 -- chmod 400 /root/.ssh/questdb-backup
```

Copy the public key to the questdb-backup storage box:
```
cat questdb-backup.pub | ssh -p 23 uXXXXX@uXXXXX.your-storagebox.de install-ssh-key
```

The questdb server should now be able to connect to the backup storage box using the keypair.
Lets see if it works; ssh to the questdb server and run the following:

```
hcloud server ssh questdb01
questdb01$ ssh -p 23 -i ~/.ssh/questdb-backup uXXXXX@uXXXXX.your-storagebox.de
```

It should login to the storagebox without requesting a password.

### Setting up Borg Backup Repository

It is now time to actually [setup borg backup](https://docs.hetzner.com/storage/storage-box/access/access-ssh-rsync-borg#borgbackup), now that the questdb server can connect to the backup storage.

From the questdb server run
```
questdb01$ apt install borgbackup borgmatic
questdb01$ export BORG_RSH="ssh -p 23 -i ~/.ssh/questdb-backup"
questdb01$ borg init --encryption=repokey --remote-path=borg-1.4 ssh://uXXXXX@uXXXXX.your-storagebox.de:23/./questdb01
```

It will request a passphrase. This passphrase is used to encrypt the backup, and is used when doing a restore.

### Create a backup configuration

Create the borgmatic configuration file `/etc/borgmatic/config.yaml` with the following content:

```
source_directories:
- /questdb/qdbroot
repositories:
- path: ssh://uXXXXX@uXXXXX.your-storagebox.de:23/./questdb01
keep_daily: 30
keep_monthly: 12
keep_yearly: 10
```

### Install and configure the postgresql client

QuestDB [needs a checkpoint](https://questdb.com/docs/operations/backup/) to be created and released during backup.
We therefore need the postgresql-client to be installed on the server:

```
questdb01$ apt install postgresql-client
```

We now create an environment file in where we can store the admin password.
Create a `/root/.psql.env` file on the server with the following:
```
PGUSER="admin"
PGPASSWORD="<my_secret_password>"
```

Ensure that the file is only readable by root:
```
questdb01$ chmod 600 .psql.env
```

Try and run the client so that it connects to the questdb service:

```
questdb01$ set -a && source .psql.env && set +a
questdb01$ psql postgresql://localhost:8812 -c "SELECT 1"
```

This should run the `SELECT 1` command successfully and output the result to the terminal.

### Run the first backup

It is now time to run the first backup. The backup sequence is as follows: 1) Create a checkpoint, 2) run the backup, and 3) release the checkpoint:

```
questdb01$ psql postgresql://localhost:8812 -c "CHECKPOINT CREATE"
questdb01$ borgmatic --progress --stats -v 2
questdb01$ psql postgresql://localhost:8812 -c "CHECKPOINT RELEASE"
```

If it reports success then we are ready to configure automatic backup.

### Setup automatic backup using cron

Create a `/root/.borg.env` on the `questdb01` server with the following:

```
BORG_RSH="ssh -p 23 -i ~/.ssh/questdb-backup"
BORG_PASSPHRASE="<the_questdb_repo_passphrase>"
```

Ensure that the file is only readable by root:

```
questdb01$ chmod 600 .borg.env
```

Now create a shell script `/root/borg-run.sh` with the following:

```bash
#!/bin/bash

function finally {
    echo "Releasing checkpoint"
    psql postgresql://localhost:8812 -c "CHECKPOINT RELEASE"
}

set -a
source /root/.psql.env
source /root/.borg.env
set +a

# Create a consistent checkpoint before backup and release it afterwards
# See https://questdb.com/docs/operations/backup/

echo "Creating checkpoint"
psql postgresql://localhost:8812 -c "CHECKPOINT CREATE"

# Ensure that the checkpoint is released when the script exits
trap finally EXIT

echo "Running borgmatic backup"
borgmatic --progress --stats -v 0 2>&1
```

The script first creates a checkpoint, it then runs the backup, and finishes by releasing the checkpoint.
Add execution permissions to the script:
```
chmod +x borg-run.sh
```

It is now time to configure cron to run the borg-run script.
Run `crontab -e` and add the following line

```
0 4 * * * /root/borg-run.sh
```

It will run the backup every night at 04:00.