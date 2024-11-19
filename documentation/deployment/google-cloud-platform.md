---
title: Google Cloud Platform
description:
  This document describes how to deploy QuestDB on Google Cloud platform using a
  Compute Engine VM with additional details on configuring networking rules
---

This guide describes how to run QuestDB on a new Google Cloud Platform (GCP)
Compute Engine instance. After completing this guide, you will have an instance
with QuestDB running in a container using the official QuestDB Docker image, as
well as a network rule that enables communication over HTTP and PostgreSQL wire
protocol.

## Prerequisites

- A [Google Cloud Platform](https://console.cloud.google.com/getting-started)
  (GCP) account and a GCP Project
- The
  [Compute Engine API](https://console.cloud.google.com/apis/api/compute.googleapis.com)
  must be enabled for the corresponding Google Cloud Platform project

## Create a Compute Engine VM

1. In the Google Cloud Console, navigate to
   [Compute Engine](https://console.cloud.google.com/compute/instances) and
   click **Create Instance**

import Screenshot from "@theme/Screenshot"

<Screenshot
  alt="The Create Instance wizard on Google Cloud platform"
  height={598}
  src="/images/guides/google-cloud-platform/create-instance.webp"
  width={650}
/>

2. Give the instance a name - this example uses `questdb-europe-west3`
3. Choose a **Region** and **Zone** where you want to deploy the instance - this
   example uses `europe-west3 (Frankfurt)` and the default zone
4. Choose a machine configuration. The default choice, `ec2-medium`, is a
   general-purpose instance with 4GB memory and should be enough to run this
   example.

   {" "} <Screenshot
     alt="Deploying a QuestDB instance on Google Cloud Platform Compute Engine"
     height={695}
     src="/images/guides/google-cloud-platform/create-vm.webp"
     width={650}
   />

5. To add a running QuestDB container on instance startup, scroll down and click
   the **Deploy Container** button. Then, provide the `latest` QuestDB Docker
   image in the **Container image** textbox.

   ```text
   questdb/questdb:latest
   ```

   Click the **Select** button at the bottom of the dropdown to complete the
   container configuration.

   Your docker configuration should look like this:

   {" "} <Screenshot
     alt="Configuring a Docker container to launch in a new QuestDB instance on Google Cloud Platform Compute Engine"
     height={695}
     src="/images/guides/google-cloud-platform/create-vm-docker.webp"
     width={650}
   />

Before creating the instance, we need to assign it a **Network tag** so that we
can add a firewall rule that exposes QuestDB-related ports to the internet. This
is required for you to access the database from outside your VPC. To create a
**Network tag**:

1. Expand the **Advanced options** menu below the **firewall** section, and then
   expand the **Networking** panel
2. In the **Networking** panel add a **Network tag** to identify the instance.
   This example uses `questdb`

<Screenshot
  alt="Applying a Network tag to a Compute Engine VM Instance on Google Cloud Platform"
  height={610}
  src="/images/guides/google-cloud-platform/add-network-tag.webp"
  width={650}
/>

You can now launch the instance by clicking **Create** at the bottom of the
dialog.

## Create a firewall rule

Now that we've created our instance with a `questdb` network tag, we need to
create a corresponding firewall rule to associate with that tag. This rule will
expose the required ports for accessing QuestDB. With a network tag, we can
easily apply the new firewall rule to our newly created instance as well as any
other QuestDB instances that we create in the future.

1. Navigate to the
   [Firewall configuration](https://console.cloud.google.com/net-security/firewall-manager/firewall-policies)
   page under **Network Security** -> **Firewall policies**
2. Click the **Create firewall rule** button at the top of the page
3. Enter `questdb` in the **Name** field
4. Scroll down to the **Targets** dropdown and select "Specified target tags"
5. Enter `questdb` in the **Target tags** textbox. This will apply the firewall
   rule to the new instance that was created above
6. Under **Source filter**, enter an IP range that this rule applies to. This
   example uses `0.0.0.0/0`, which allows ingress from any IP address. We
   recommend that you make this rule more restrictive, and naturally that you
   include your current IP address within the chosen range.
7. In the **Protocols and ports** section, select **Specified protocols and
   ports**, check the **TCP** option, and type `8812,9000` in the textbox.
8. Scroll down and click the **Create** button

<Screenshot
  alt="Creating a firewall rule in for VPC networking on Google Cloud Platform"
  height={654}
  src="/images/guides/google-cloud-platform/firewall-rules.webp"
  width={650}
/>

All VM instances on Compute Engine in this account which have the **Network
tag** `questdb` will now have this firewall rule applied.

The ports we have opened are:

- `9000` for the REST API and [Web Console](/docs/web-console/)
- `8812` for the PostgreSQL wire protocol

## Verify the deployment

To verify that the instance is running, navigate to **Compute Engine** ->
[VM Instances](https://console.cloud.google.com/compute/instances). A status
indicator should show the instance as **running**:

<Screenshot
  alt="A QuestDB instance running on Google Cloud Platform showing a success status indicator"
  height={186}
  src="/images/guides/google-cloud-platform/instance-available.webp"
  width={650}
/>

To verify that the QuestDB deployment is operating as expected:

1. Copy the **External IP** of the instance
2. Navigate to `http://<external_ip>:9000` in a browser

The [Web Console](/docs/web-console/) should now be visible:

<Screenshot
  alt="The QuestDB Web Console running on a VM instance on Google Cloud Platform"
  height={405}
  src="/images/guides/google-cloud-platform/gcp-portal.webp"
  width={650}
/>

Alternatively, a request may be sent to the REST API exposed on port 9000:

```bash
curl -G \
  --data-urlencode "query=SELECT * FROM telemetry_config" \
  <external_ip>:9000/exec
```

## Set up GCP with Pulumi

If you're using [Pulumi](https://www.pulumi.com/gcp/) to manage your
infrastructure, you can create a QuestDB instance with the following:

```python
import pulumi
import pulumi_gcp as gcp

# Create a Google Cloud Network
firewall = gcp.compute.Firewall(
    "questdb-firewall",
    network="default",
    allows=[
        gcp.compute.FirewallAllowArgs(
            protocol="tcp",
            ports=["9000", "8812"],
        ),
    ],
    target_tags=["questdb"],
    source_ranges=["0.0.0.0/0"],
)

# Create a Compute Engine Instance
instance = gcp.compute.Instance(
    "questdb-instance",
    machine_type="e2-medium",
    zone="us-central1-a",
    boot_disk={
        "initialize_params": {
            "image": "ubuntu-os-cloud/ubuntu-2004-lts",
        },
    },
    network_interfaces=[
        gcp.compute.InstanceNetworkInterfaceArgs(
            network="default",
            access_configs=[{}],  # Ephemeral public IP
        )
    ],
    metadata_startup_script="""#!/bin/bash
        sudo apt-get update
        sudo apt-get install -y docker.io
        sudo docker run -d -p 9000:9000 -p 8812:8812 \
        --env QDB_HTTP_USER="admin" \
        --env QDB_HTTP_PASSWORD="quest" \
        questdb/questdb
        """,
    tags=["questdb"],
)

# Export the instance's name and public IP
pulumi.export("instanceName", instance.name)
pulumi.export("instance_ip", instance.network_interfaces[0].access_configs[0].nat_ip)
```
