---
title: Launch QuestDB with systemd
sidebar_label: systemd
description: This document describes how to launch QuestBD using systemd.
---

Use systemd to run QuestDB as a system or user service. This guide will
demonstrate an initial configuration which you can use as the basis for your
installation scripts. It will also demonstrate how to setup and start a QuestDB
systemd service.

## Prerequisites

The prerequisites for deploying QuestDB with systemd are:

- A Unix machine supporting systemd

## Initial system configuration

The following commands inform a basis for your systemd service. Prior to running
systemd, you will require some directory structure and a binary for QuestDB.
Depending on your specific needs and operational preferences, your commands may
differ. The goal is to give you a helpful starting point for the example
service. The example presumes that you have used a privileged user to create a
user with appropriately scoped permissions.

```bash
#!/bin/bash

# Download and install the JDK
curl -s https://download.oracle.com/java/17/latest/jdk-17_linux-x64_bin.tar.gz -o jdk.tar.gz
mkdir -p ~/jdk
tar -xzf jdk.tar.gz -C ~/jdk --strip-components=1
export JAVA_HOME=~/jdk
export PATH=$JAVA_HOME/bin:$PATH

# Download and set up QuestDB
curl -s https://dl.questdb.io/snapshots/questdb-latest-no-jre-bin.tar.gz -o questdb.tar.gz
mkdir -p ~/questdb/binary
tar -xzf questdb.tar.gz -C ~/questdb/binary --strip-components 1
mv ~/questdb/binary/questdb.jar ~/bin/
```

### Using a QuestDB server.conf

Your QuestDB configuration is done in a `server.conf` file. The `server.conf`
file is populated with safe defaults on first startup if it does not exist. It
is common for user's of QuestDB to stick with the default configuration.
However, should you choose to update your own and serve it via a scripted method
or similar, you may do so.

Read more about the available options in our
[Configuration reference page](/docs/configuration/).

## Example questdb.service

Create a new file called `questdb.service`:

```shell
touch questdb.service
```

The example below is a recommended starting point. Note the default QuestDB
service configuration and system paths in line with the above example. Next,
open the `questdb.service` file and add the following:

```shell
[Unit]
Description=QuestDB
Documentation=https://www.questdb.com/docs/
After=network.target

[Service]
Type=simple
Restart=always
RestartSec=2
# Adjust java path to match requirements of a given distro
ExecStart=/home/[USER_NAME]/jdk/bin/java \
--add-exports java.base/jdk.internal.math=io.questdb \
-p /home/[USER_NAME]/bin/questdb.jar \
-m io.questdb/io.questdb.ServerMain \
-DQuestDB-Runtime-66535 \
-ea -Dnoebug \
-XX:+UnlockExperimentalVMOptions \
-XX:+AlwaysPreTouch \
-XX:+UseParallelOldGC \
-d /home/[USER_NAME]/var/lib/questdb

ExecReload=/bin/kill -s HUP $MAINPID

# Prevent writes to /usr, /boot, and /etc
ProtectSystem=full
StandardError=syslog
SyslogIdentifier=questdb

[Install]
WantedBy=multi-user.target
```

Next, move your `questdb.service` file into your user's `systemd` config:

```shell
mv questdb.service  ~/.config/systemd/user/questdb.service
```

Enable the service:

```shell
systemctl --user enable questdb.service
```

Start the service:

```shell
systemctl --user start questdb
```

Check out the service status:

```shell
systemctl --user status questdb.service
```

Your QuestDB instance should now be accessible at localhost, with services
available at the following default ports:

- [Web Console](/docs/web-console/) &amp; REST API is available on port `9000`
- PostgreSQL wire protocol available on `8812`
- InfluxDB line protocol `9009` (TCP and UDP)
- Health monitoring &amp; Prometheus `/metrics` `9003`

## User vs. System

As an operator, you can decide whether to run systemd as the "system" from root
permissions, or a user with its own privileges. At the system level, root is
required to make changes to the `systemctl` application. Services created this
way will start and stop when the system is restarted.

Unlike at the system level, user services will start & stop as the user session
is activated or de-activated. You also do not need to apply `sudo` to make
changes to the services.

Consistent with the examples on this page, we recommend scoped users.
