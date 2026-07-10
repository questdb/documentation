---
title: Launch QuestDB with systemd
sidebar_label: systemd
description: This document describes how to launch QuestDB using systemd.
---

Use systemd to run QuestDB as a system or user service. This guide will
demonstrate an initial configuration which you can use as the basis for your
installation scripts. It will also demonstrate how to set up and start a QuestDB
systemd service.

## Prerequisites

The prerequisites for deploying QuestDB with systemd are:

- A Unix machine supporting systemd
- Java 25 (OpenJDK 25 or compatible distribution)

## Initial system configuration

The following commands inform a basis for your systemd service. Prior to running
systemd, you will require some directory structure and a binary for QuestDB.
Depending on your specific needs and operational preferences, your commands may
differ. The goal is to give you a helpful starting point for the example
service. The example presumes that you have used a privileged user to create a
user with appropriately scoped permissions.

```bash
#!/bin/bash

# Install OpenJDK 25
sudo apt-get update && sudo apt-get install -y openjdk-25-jdk
export JAVA_HOME=/usr/lib/jvm/java-25-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH

# Download and set up QuestDB
curl -s https://dl.questdb.io/snapshots/questdb-latest-no-jre-bin.tar.gz -o questdb.tar.gz
mkdir -p ~/questdb/binary
mkdir -p ~/bin ~/var/lib/questdb
tar -xzf questdb.tar.gz -C ~/questdb/binary --strip-components 1
mv ~/questdb/binary/questdb.jar ~/bin/
```

### Using a QuestDB server.conf

Your QuestDB configuration is done in a `server.conf` file. The `server.conf`
file is populated with safe defaults on first startup if it does not exist. It
is common for users of QuestDB to stick with the default configuration.
However, should you choose to update your own and serve it via a scripted method
or similar, you may do so.

Read more about the available options in our
[Configuration reference page](/docs/configuration/overview/).

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
ExecStart=/usr/lib/jvm/java-25-openjdk-amd64/bin/java \
-XX:+UnlockExperimentalVMOptions \
-XX:+AlwaysPreTouch \
-XX:+UseParallelGC \
-DQuestDB-Runtime-66535 \
-Dcontainerized=false \
-ea -Dnoebug \
--add-exports java.base/jdk.internal.math=io.questdb \
--add-exports java.base/jdk.internal.vm=io.questdb \
-p /home/[USER_NAME]/bin/questdb.jar \
-m io.questdb/io.questdb.ServerMain \
-d /home/[USER_NAME]/var/lib/questdb

ExecReload=/bin/kill -s HUP $MAINPID

# Raise the open-files limit
LimitNOFILE=1048576

# Prevent writes to /usr, /boot, and /etc
ProtectSystem=full
StandardError=syslog
SyslogIdentifier=questdb

[Install]
WantedBy=multi-user.target
```

For QuestDB Enterprise, launch the enterprise module
(`com.questdb/com.questdb.EntServerMain`) and target both `io.questdb` and
`com.questdb` on the module flags. The corresponding `ExecStart` is:

```shell
ExecStart=/home/[USER_NAME]/questdb-enterprise/bin/java \
-XX:+UnlockExperimentalVMOptions \
-XX:+AlwaysPreTouch \
-XX:+UseParallelGC \
-ea -Dnoebug \
--sun-misc-unsafe-memory-access=allow \
--enable-native-access=io.questdb,com.questdb \
--add-opens=java.base/java.lang=io.questdb,com.questdb \
--add-opens=java.base/java.lang.reflect=io.questdb,com.questdb \
--add-opens=java.base/java.nio=io.questdb,com.questdb \
--add-opens=java.base/java.time.zone=io.questdb,com.questdb \
--add-exports=java.base/jdk.internal.vm=io.questdb,com.questdb \
-m com.questdb/com.questdb.EntServerMain \
-d /home/[USER_NAME]/var/lib/questdb
```

The Enterprise package is a self-contained runtime image: the `io.questdb` and
`com.questdb` modules are built into `bin/java`, so no `--module-path` / `-p` is
required.

`LimitNOFILE=1048576` raises the open-files limit above systemd's default of
`524288`, which is below what QuestDB recommends. The kernel `vm.max_map_count`
limit cannot be set from a unit file; configure it separately. See
[OS configuration](/docs/getting-started/capacity-planning/#os-configuration) for
both.

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

- [Web Console](/docs/getting-started/web-console/overview/) &amp; REST API is available on port `9000`
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


## Daily timers

If running QuestDB on a `systemd` based Linux (for example, `Ubuntu`) you may find that, by default, there are a number of daily upgrade timers enabled. 

When executed, these tasks restart `systemd` services, which can cause interruptions to QuestDB. It will appear
that QuestDB restarted with no errors or apparent trigger.

To resolve it, either:

- Force services to be listed for restart, but not restarted automatically.
  - Modify `/etc/needrestart/needrestart.conf` to contain `$nrconf{restart} = 'l'`.
- Disable the auto-upgrade services entirely:

```bash
sudo systemctl disable --now apt-daily-upgrade.timer
sudo systemctl disable --now apt-daily.timer
sudo systemctl disable --now unattended-upgrades.service
```

You can check the status of the timers using:

```bash
systemctl list-timers --all | grep apt
```
