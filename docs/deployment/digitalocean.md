---
title: Launch QuestDB on DigitalOcean
sidebar_label: DigitalOcean Droplet
description:
  This document describes how to launch DigitalOcean droplet with QuestDB
---

DigitalOcean is a platform with software listings from independent vendors that
run on cloud resources. This guide describes how to launch QuestDB via the
DigitalOcean marketplace using the official listing. This document also
describes usage instructions after you have launched the instance, including
hints for authentication, the available interfaces, and tips for accessing the
REST API and web console.

## Prerequisites

The prerequisites for deploying QuestDB on DigitalOcean are as follows:

- A DigitalOcean account (sign up using
  [the QuestDB referral link](https://m.do.co/c/50d6b551562b) for 100 USD free
  credit)
- Basic `shell` knowledge for executing commands on the DigitalOcean droplet

## Create a QuestDB Droplet

DigitalOcean has a marketplace which offers **1-Click Apps** reviewed by their
staff. QuestDB is available on the marketplace recently, so setup using this
method is preferred:

1. Navigate to the
   [QuestDB listing](https://marketplace.digitalocean.com/apps/questdb?refcode=50d6b551562b)
   on DigitalOcean
2. Click **Create QuestDB Droplet**
3. Select the basic plan for your Droplet (4GB RAM is recommended)

import Screenshot from "@theme/Screenshot"

<Screenshot
  alt="Choosing the RAM and CPU capacity for a QuestDB DigitalOcean Droplet"
  height={591}
  src="/img/blog/2021-07-09/choosing-droplet.webp"
  width={770}
/>

4. Choose a region closest to you
5. At the **Authentication** section, enter your SSH public key, or set a
   password
6. Set a hostname for the droplet such as `questdb-demo`
7. Leave all other settings with their defaults, and click **Create Droplet** at
   the bottom of the page

<Screenshot
  alt="Finalizing the creation step of a DigitalOcean Droplet running QuestDB"
  height={591}
  src="/img/blog/2021-07-09/questdb-droplet.webp"
  width={770}
/>

After 30 seconds, QuestDB should be ready to use. To validate that we set
everything up successfully, copy the Droplet's IP address by clicking on it and
navigate to `http://<IP ADDRESS>:9000/` where `<IP ADDRESS>` is the IP address
you just copied. The interactive console should load and we can start querying
the database and inserting data.

## QuestDB droplet configuration

The server configuration file is at the following location on the droplet:

```bash
/home/questdb/server.conf
```

For details on the server properties and using this file, see the
[server configuration documentation](/docs/configuration/).

The default ports used by QuestDB interfaces are as follows:

- Web console &amp; REST API is available on port `9000`
- PostgreSQL wire protocol available on `8812`
- InfluxDB line protocol `9009` (TCP and UDP)
- Health monitoring &amp; Prometheus `/metrics` `9003`

### QuestDB Credentials

Credentials may be configured in the server configuration file:

```bash
/home/questdb/server.conf
```

The default Postgres credentials should be changed:

```ini
pg.user=...
pg.password=...
```

For details on authentication using InfluxDB line protocol, see the
[InfluxDB line protocol authentication guide](/docs/reference/api/ilp/overview/#authentication).

### Disabling authentication

If you would like to disable authentication for Postgres wire protocol or
InfluxDB line protocol, comment out the following lines in the server
configuration file:

```ini title="/home/questdb/server.conf"
# pg.password=...

# line.tcp.auth.db.path=conf/auth.txt
```

### Disabling interfaces

Interfaces may be **disabled completely** with the following configuration:

```ini title="/home/questdb/server.conf"
# disable postgres
pg.enabled=false

# disable InfluxDB line protocol over TCP and UDP
line.tcp.enabled=false
line.udp.enabled=false

# disable HTTP (web console and REST API)
http.enabled=false
```

The HTTP interface may alternatively be set to **readonly**:

```ini title="/home/questdb/server.conf"
# set HTTP interface to readonly
http.security.readonly=true
```

## API creation

In addition to creating a Droplet from the QuestDB 1-Click App via the control
panel, you can also
[use the DigitalOcean API](https://digitalocean.com/docs/api/).

As an example, to create a 4GB QuestDB Droplet in the SFO2 region, you can use
the following curl command. You’ll need to either save your API access token to
an environment variable or substitute it into the command below.

```bash
curl -X POST -H 'Content-Type: application/json' \
     -H 'Authorization: Bearer '$TOKEN'' -d \
    '{"name":"choose_a_name","region":"sfo2","size":"s-2vcpu-4gb","image":"questdb-20-04"}' \
    "https://api.digitalocean.com/v2/droplets"
```
