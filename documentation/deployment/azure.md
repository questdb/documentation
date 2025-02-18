---
title: Deploying to Microsoft Azure
sidebar_label: Azure
description:
  This document explains what to hardware to use, and how to provision QuestDB on Microsoft Azure.
---

import FileSystemChoice from "../../src/components/DRY/_questdb_file_system_choice.mdx"
import MinimumHardware from "../../src/components/DRY/_questdb_production_hardware-minimums.mdx"
import InterpolateReleaseData from "../../src/components/InterpolateReleaseData"
import CodeBlock from "@theme/CodeBlock"


## Hardware recommendations

<MinimumHardware />

### Azure Virtual Machines with Azure Managed Disk

Azure Virtual Machines have a naming convention that is handy for finding compatible instances.

**Do not** use instances with the letter `p`. These are `ARM` architecture instances, usually running
on `Cobalt` chips.

**Do** use instances with the letter `s`. This indicates that it is compatible with `Premium SSD` storage,
preferred for QuestDB.

Either `AMD` CPUs (`a` letter) or `Intel` (no letter) are appropriate for `x86_64` deployments.

We recommend starting with `D-series` instances, and then later upgrading to `E-series` if necessary i.e. for more RAM.

You should deploy using an  `x86_64` Linux distribution, such as Ubuntu.

For storage, we recommend using [Premium SSD v2](https://learn.microsoft.com/en-us/azure/virtual-machines/disks-types#premium-ssd-v2) disks, and provisioning this at `5000 IOPS/300 MBps` until you have
tested your workload.

:::note

`Premium SSD v2` disks only support locally-redundant storage (LRS). For Enterprise users, this
is not an issue, as your data is secured using replication over Azure Blob Storage.

For open-source users, you may want to:

- downgrade to `Premium SSD` storage, which supports zone-redundant storage (ZRS).
- or publish to multiple instances
- or take frequent ZRS snapshots of your LRS disk.

:::

<FileSystemChoice />

:::warning

QuestDB does **not** support `blobfuse2`. Please use the above recommendations, or refer to [capacity planning](../deployment/capacity-planning.md)

:::

### Azure NetApp Files

Azure NetAppFiles is a volume-as-a-service (VaaS) offering from Microsoft, supporting an NFS API.

This should **not** be used as primary storage for QuestDB, but could be used as an object store for Enterprise replication.

We would recommend using `Azure Blob Storage` instead as a simpler, and cheaper, alternative.

### Azure Blob Storage

QuestDB supports `Azure Blob Storage` as its replication object-store in the Enterprise edition.

To get started, use `Azure Storage Explorer` to create new `Blob Container`, and then follow the 
[Enterprise Quick Start](../guides/enterprise-quick-start.md) steps to create a connection string and 
configure QuestDB.

### Minimum specification

- **Instance**:  `D4as v5` or `D4s v5` `(4 vCPUs, 16 GiB RAM)`
- **Storage**
    - **OS disk**: `Premium SSD v2 (30 GiB)` volume provisioned with `3000 IOPS/125 MBps`.
    - **Data disk**: `Premium SSD v2 (100 GiB)` volume provisioned with `3000 IOPS/125 MBps`.
- **Operating System**: `Linux Ubuntu 24.04 LTS x86_64`.
- **File System**: `ext4`

:::note

If you use `Premium SSD` instead of `Premium SSD v2`, you should start with a `P20` size (`512 GiB`).
This offers `2300 IOPS/150 MBps` which should be enough for basic workloads.

:::

### Better specification

- **Instance**: `E8as v5`or `E8s v5` `(8 vCPUs, 64 GiB RAM)`
- **Storage**
    - **OS disk**: `Premium SSD v2 (30 GIB)` volume provisioned with `5000 IOPS/300 MBps`.
    - **Data disk**: `Premium SSD v2 (300 GiB)` volume provisioned with `5000 IOPS/300 MBps`.
- **Operating System**: `Linux Ubuntu 24.04 LTS x86_64`.
- **File System**: `zfs`

:::note

If you use `Premium SSD` instead of `Premium SSD v2`, you should upgrade to a `P30` size disk (`1 TiB`).
This offers `5000 IOPS/200 MBps` which should be enough for higher workloads.

:::

## Launching QuestDB on Azure Virtual Machines

This guide demonstrates how to spin up a Microsoft Azure Virtual Machine that is
running QuestDB on Ubuntu. This will help get you comfortable with Azure VM
basics.

### Prerequisites

- A [Microsoft Azure account](https://azure.microsoft.com/) with billing
  enabled. Adding a credit card is required to create an account, but this demo
  will only use resources in the free tier.

### Create an Azure VM

1. In the Azure console, navigate to the **Virtual Machines** page. Once you are
   on this page, click the **Create** dropdown in the top left-hand corner of
   the screen and select the **Azure virtual machine** option.

2. From here, fill out the required options. If you don't already have a
   **Resource group**, you can create one on this page. We made a "default"
   group for this example, but you are free to choose any name you like. Enter
   the name of your new virtual machine, as well as its desired Region and
   Availability Zone. Your dialog should look something like this:

<Screenshot
alt="The Create Instance dialog on Microsoft Azure"
src="images/guides/microsoft-azure-ubuntu/create-vm.webp"
width={450}
title="Click to zoom"
/>

3. Scroll down and select your desired instance type. In this case, we used a
   `Standard_B1s` to take advantage of Azure's free tier.
4. If you don't already have one, create a new SSH key pair to securely connect
   to the instance once it has been created.

<Screenshot
alt="The Create Instance dialog on Microsoft Azure, continued"
src="images/guides/microsoft-azure-ubuntu/ssh-setup.webp"
width={450}
title="Click to zoom"
/>

5. We will use Azure defaults for the rest of the VM's settings. Click
   **Review + create** to confirm your settings, then **Create** to download
   your new key pair and launch the instance.

<Screenshot
alt="Deployment Complete"
src="images/guides/microsoft-azure-ubuntu/deployment-complete.webp"
width={450}
title="Click to zoom"
/>

Once you see this screen, click the **Go to resource** button and move on to the
next section

### Set up networking

We now need to set up the appropriate firewall rules which will allow you to
connect to your new QuestDB instance over the several protocols that we support.

1. In the **Settings** sidebar, click the **Networking** button. This will lead
   you to a page with all firewall rules for your instance. To open up the
   required ports, click the **Add inbound port rule** on the right-hand side.
2. Change the **Destination port ranges** to the `8812,9000,9003`, set the
   **Protocol** to `TCP`, change the name to `questdb`, and click the **Add**
   button. This will add the appropriate ingress rules to your instance's
   firewall. It may take a few seconds, and possibly a page refresh, but you
   should see your new firewall rule in the list. Port 8812 is used for the
   postgresql protocol, port 9000 is used for the web interface, the REST API,
   and ILP ingestion over HTTP. Port 9003 is used for metrics and health check.

<Screenshot
alt="Firewall rules for your Azure VM"
src="images/guides/microsoft-azure-ubuntu/firewall-rules.webp"
width={450}
title="Click to zoom"
/>

### Install QuestDB

Now that you've opened up the required ports, it's time to install and run
QuestDB. To do this, you first need to connect to your instance over SSH. Since
we named our SSH key `questdb_key`, this is the filename that the commands below
use. You should substitute this with your own key name that you downloaded in
the previous step. You also need to use your VM's external IP address instead of
the placeholder that we have provided.

We first need to adjust the permissions on the downloaded file, and then use it
to ssh into your instance.

```bash
export YOUR_INSTANCE_IP=172.xxx.xxx.xxx
chmod 400 ~/download/questdb_key.pem
ssh -i ~/download/questdb_key.pem azureuser@$YOUR_INSTANCE_IP
```

Once we've connected to the instance, we will use `wget`
to download the QuestDB binary, extract it, and run the start script. Please visit
the Ubuntu section at the [binary installation page](/download/) to make sure you are using the latest
version of the binary package and replace the URL below as appropriate.

<InterpolateReleaseData
renderText={(release) => (
<CodeBlock className="language-bash">
{`wget https://github.com/questdb/questdb/releases/download/${release.name}/questdb-${release.name}-rt-linux-x86-64.tar.gz
tar -xvf questdb-${release.name}-rt-linux-x86-64.tar.gz
cd questdb-${release.name}-rt-linux-x86-64/bin
./questdb.sh start`}
</CodeBlock>
)}
/>

Once you've run these commands, you should be able to navigate to your instance
at its IP on port 9000: `http://$YOUR_INSTANCE_IP:9000`

<Screenshot
alt="Firewall rules for your Azure VM"
src="images/guides/microsoft-azure-ubuntu/web-console.webp"
width={450}
title="Click to zoom"
/>

## Single Sign On with EntraID

If you are using EntraID to manage users, [QuestDB enterprise](/enterprise/) offers the possibility to do Single Sign On and manage your database permissions.
See more information at the [Microsoft EntraID OIDC guide](/docs/guides/microsoft-entraid-oidc).
