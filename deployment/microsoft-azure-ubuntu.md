---
title: Microsoft Azure
description:
  This document describes how to deploy QuestDB on an Azure Virtual Machine
  running an LTS version of Ubuntu
---

This guide demonstrates how to spin up a Microsoft Azure Virtual Machine that is
running QuestDB on Ubuntu. This will help get you comfortable with Azure VM
basics.

## Prerequisites

- A [Microsoft Azure account](https://azure.microsoft.com/) with billing
  enabled. Adding a credit card is required to create an account, but this demo
  will only use resources in the free tier.

## Create an Azure VM

1. In the Azure console, navigate to the **Virtual Machines** page. Once you are
   on this page, click the **Create** dropdown in the top left-hand corner of
   the screen and select the **Azure virtual machine** option.

2. From here, fill out the required options. If you don't already have a
   **Resource group**, you can create one on this page. We made a "default"
   group for this example, but you are free to choose any name you like. Enter
   the name of your new virtual machine, as well as its desired Region and
   Availability Zone. Your dialog should look something like this:

import Screenshot from "@theme/Screenshot"

<Screenshot
  alt="The Create Instance dialog on Microsoft Azure"
  height={598}
  src="/img/guides/microsoft-azure-ubuntu/create-vm.webp"
  width={650}
/>

3. Scroll down and select your desired instance type. In this case, we used a
   `Standard_B1s` to take advantage of Azure's free tier.
4. If you don't already have one, create a new SSH key pair to securely connect
   to the instance once it has been created.

<Screenshot
  alt="The Create Instance dialog on Microsoft Azure, continued"
  height={598}
  src="/img/guides/microsoft-azure-ubuntu/ssh-setup.webp"
  width={650}
/>

5. We will use Azure defaults for the rest of the VM's settings. Click
   **Review + create** to confirm your settings, then **Create** to download
   your new key pair and launch the instance.

<Screenshot
  alt="Deployment Complete"
  height={598}
  src="/img/guides/microsoft-azure-ubuntu/deployment-complete.webp"
  width={650}
/>

Once you see this screen, click the **Go to resource** button and move on to the
next section

## Set up networking

We now need to set up the appropriate firewall rules which will allow you to
connect to your new QuestDB instance over the several protocols that we support.

1. In the **Settings** sidebar, click the **Networking** button. This will lead
   you to a page with all firewall rules for your instance. To open up the
   required ports, click the **Add inbound port rule** on the right-hand side.
2. Change the **Destination port ranges** to the `8812,9000,9009`, set the
   **Protocol** to `TCP`, change the name to `questdb`, and click the **Add**
   button. This will add the appropriate ingress rules to your instance's
   firewall. It may take a few seconds, and possibly a page refresh, but you
   should see your new firewall rule in the list.

<Screenshot
  alt="Firewall rules for your Azure VM"
  height={598}
  src="/img/guides/microsoft-azure-ubuntu/firewall-rules.webp"
  width={650}
/>

## Connect to your instance and install QuestDB

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

Once we've connected to the instance, we will be following the
[binary installation method](https://questdb.io/download/). Here, we use `wget`
to download the latest QuestDB binary, extract it, and run the start script.

```bash
wget https://github.com/questdb/questdb/releases/download/7.3.3/questdb-7.3.3-rt-linux-amd64.tar.gz
tar -xvf questdb-7.3.3-rt-linux-amd64.tar.gz
cd questdb-7.3.3-rt-linux-amd64/bin
./questdb.sh start
```

Once you've run these commands, you should be able to navigate to your instance
at its IP on port 9000: `https://$YOUR_INSTANCE_IP:9000`

<Screenshot
  alt="Firewall rules for your Azure VM"
  height={598}
  src="/img/guides/microsoft-azure-ubuntu/web-console.webp"
  width={650}
/>
