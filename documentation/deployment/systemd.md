---
title: Launch QuestDB with systemd
sidebar_label: systemd
description: This document describes how to launch QuestDB using systemd.
---

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"
import CodeBlock from "@theme/CodeBlock"
import InterpolateReleaseData from "../../src/components/InterpolateReleaseData"

Use systemd to run QuestDB as a service. For production deployments, we strongly
recommend a system service running as a dedicated, unprivileged user. It starts
at boot without depending on an interactive login and lets systemd apply the
required resource limits directly.

This guide provides system-service examples for QuestDB Open Source and QuestDB
Enterprise.

## Prerequisites

The prerequisites for deploying QuestDB with systemd are:

- A 64-bit Linux system (x86-64 or ARM64) running systemd
- The QuestDB archive for your edition and architecture. Runtime (`rt-`)
  archives bundle their own Java and install it at `/opt/questdb/bin/java`. The
  no-JRE archive ships `questdb.jar` alone and runs on your system Java, so it
  also requires Java 25 and `unzip`. QuestDB Open Source on ARM64 is only
  distributed as the no-JRE archive.

The archive you install determines which unit to use below, so keep track of
which one you extracted to `/opt/questdb`.

## Initial system configuration

:::note

The command blocks below are chained with `&&` so that each one pastes as a
single command. Where `/etc/sudoers` sets `use_pty`, which is the default on
Debian 13, Ubuntu 24.04 and RHEL 9, `sudo` runs its command in a new pty and
consumes whatever is still buffered in the terminal. Pasting a block of separate
`sudo` lines therefore runs the first line and silently discards the rest,
leaving a half-finished install that only surfaces later as a `status=203/EXEC`
failure.

:::

Create a dedicated system user and group. The unit will create and manage its
QuestDB root directory at `/var/lib/questdb`. If the `questdb` user already
exists, skip the `useradd` command.

```bash
sudo useradd --system --user-group \
  --home-dir /var/lib/questdb \
  --shell /usr/sbin/nologin \
  questdb
```

For QuestDB Open Source, select your server architecture:

<Tabs
  groupId="linux-architecture"
  defaultValue="x86-64"
  values={[
    { label: "x86-64", value: "x86-64" },
    { label: "ARM64", value: "arm64" },
  ]}
>

<TabItem value="x86-64">

Download the current Linux runtime and extract it to `/opt/questdb`:

<!-- prettier-ignore-start -->

<InterpolateReleaseData
renderText={(release) => (
<CodeBlock className="language-bash">
{`curl -fL https://github.com/questdb/questdb/releases/download/${release.name}/questdb-${release.name}-rt-linux-x86-64.tar.gz -o questdb.tar.gz &&
sudo install -d -o root -g root -m 0755 /opt/questdb &&
sudo tar -xzf questdb.tar.gz -C /opt/questdb --strip-components 1 &&
sudo chown -R root:root /opt/questdb`}
</CodeBlock>
)}
/>

<!-- prettier-ignore-end -->

:::note

The no-JRE archive also runs on x86-64, if you would rather use your own Java 25
installation than the bundled runtime. Follow the ARM64 steps, but extract the
`linux-x86-64` native libraries instead of the `linux-aarch64` ones, and use the
"No-JRE archive" unit in [Example questdb.service](#example-questdbservice).

:::

</TabItem>

<TabItem value="arm64">

On ARM64, use the no-JRE archive. Install Java 25 and `unzip` with your package
manager, then download and extract QuestDB:

<!-- prettier-ignore-start -->

<InterpolateReleaseData
renderText={(release) => (
<CodeBlock className="language-bash">
{`curl -fL https://github.com/questdb/questdb/releases/download/${release.name}/questdb-${release.name}-no-jre-bin.tar.gz -o questdb.tar.gz &&
sudo install -d -o root -g root -m 0755 /opt/questdb &&
sudo tar -xzf questdb.tar.gz -C /opt/questdb --strip-components 1 &&
sudo install -d -o root -g root -m 0755 /opt/questdb/lib &&
sudo unzip -jo /opt/questdb/questdb.jar 'io/questdb/bin/linux-aarch64/*.so' -d /opt/questdb/lib &&
sudo chown -R root:root /opt/questdb`}
</CodeBlock>
)}
/>

<!-- prettier-ignore-end -->

The native libraries are installed under `/opt/questdb/lib` so that QuestDB can
load them directly instead of extracting them to the system temporary directory.

</TabItem>

</Tabs>

For QuestDB Enterprise, extract the runtime archive for your architecture to
`/opt/questdb`. Run these commands from the directory containing the archive:

<Tabs
  groupId="linux-architecture"
  defaultValue="x86-64"
  values={[
    { label: "x86-64", value: "x86-64" },
    { label: "ARM64", value: "arm64" },
  ]}
>

<TabItem value="x86-64">

```bash
sudo install -d -o root -g root -m 0755 /opt/questdb &&
sudo tar -xzf questdb-enterprise-*-rt-linux-amd64.tar.gz -C /opt/questdb --strip-components 1 &&
sudo chown -R root:root /opt/questdb
```

</TabItem>

<TabItem value="arm64">

```bash
sudo install -d -o root -g root -m 0755 /opt/questdb &&
sudo tar -xzf questdb-enterprise-*-rt-linux-aarch64.tar.gz -C /opt/questdb --strip-components 1 &&
sudo chown -R root:root /opt/questdb
```

</TabItem>

</Tabs>

### SELinux

If you have SELinux enabled, apply the default SELinux labels after extracting
QuestDB:

```bash
sudo restorecon -R /opt/questdb
```

### Using a QuestDB server.conf

With this unit, QuestDB creates `/var/lib/questdb/conf/server.conf` with default
settings on first start. See the
[configuration reference](/docs/configuration/overview/) for available options.

## Example questdb.service

Write the unit for your edition to `/etc/systemd/system/questdb.service`. Each
command below creates that file in place, so it can be pasted into a terminal as
it stands. The examples set `QDB_ROOT` to `/var/lib/questdb`; QuestDB stores its
`conf`, `db`, `log`, and `public` directories beneath it. Adjust the
installation paths if necessary, then paste the block.

<!-- prettier-ignore-start -->

<Tabs defaultValue="oss" values={[
  { label: "QuestDB", value: "oss" },
  { label: "QuestDB Enterprise", value: "enterprise" },
]}>

<!-- prettier-ignore-end -->

<TabItem value="oss">

<!-- prettier-ignore-start -->

<Tabs groupId="questdb-archive" defaultValue="rt" values={[
  { label: "Runtime archive", value: "rt" },
  { label: "No-JRE archive", value: "no-jre" },
]}>

<!-- prettier-ignore-end -->

<TabItem value="rt">

The runtime (`rt-`) archive bundles its own Java at `/opt/questdb/bin/java`:

```shell
sudo tee /etc/systemd/system/questdb.service > /dev/null <<'EOF'
[Unit]
Description=QuestDB
Documentation=https://questdb.com/docs/deployment/systemd/

[Service]
Type=exec
User=questdb
Group=questdb
Restart=always
RestartSec=2
KillSignal=SIGTERM
SuccessExitStatus=143

# QuestDB root directory
Environment=QDB_ROOT=/var/lib/questdb
StateDirectory=questdb
StateDirectoryMode=0750
ExecStartPre=/usr/bin/mkdir -p ${QDB_ROOT}/db

ExecStart=/opt/questdb/bin/java \
    -DQuestDB-Runtime-66535 \
    -Dcontainerized=false \
    -ea -Dnoebug \
    -XX:ErrorFile=${QDB_ROOT}/db/hs_err_pid+%%p.log \
    -XX:+UnlockExperimentalVMOptions \
    -XX:+AlwaysPreTouch \
    -XX:+UseParallelGC \
    --sun-misc-unsafe-memory-access=allow \
    --enable-native-access=io.questdb \
    --add-opens=java.base/java.lang=io.questdb \
    --add-opens=java.base/java.lang.reflect=io.questdb \
    --add-opens=java.base/java.nio=io.questdb \
    --add-opens=java.base/java.time.zone=io.questdb \
    --add-exports=java.base/jdk.internal.vm=io.questdb \
    -m io.questdb/io.questdb.ServerMain \
    -d ${QDB_ROOT}

# Raise the open-files limit to QuestDB's recommended value
LimitNOFILE=1048576

ProtectSystem=full
StandardOutput=journal
StandardError=journal
SyslogIdentifier=questdb

[Install]
WantedBy=multi-user.target
EOF
```

</TabItem>

<TabItem value="no-jre">

The no-JRE archive has no bundled Java, so this unit runs your system Java and
puts `questdb.jar` on the module path. Use it on ARM64, and on x86-64 whenever
you installed the no-JRE archive:

```shell
sudo tee /etc/systemd/system/questdb.service > /dev/null <<'EOF'
[Unit]
Description=QuestDB
Documentation=https://questdb.com/docs/deployment/systemd/

[Service]
Type=exec
User=questdb
Group=questdb
Restart=always
RestartSec=2
KillSignal=SIGTERM
SuccessExitStatus=143

# QuestDB root directory
Environment=QDB_ROOT=/var/lib/questdb
StateDirectory=questdb
StateDirectoryMode=0750
ExecStartPre=/usr/bin/mkdir -p ${QDB_ROOT}/db

ExecStart=/usr/bin/java \
    -DQuestDB-Runtime-66535 \
    -Dcontainerized=false \
    -Dquestdb.libs.dir=/opt/questdb/lib \
    -ea -Dnoebug \
    -XX:ErrorFile=${QDB_ROOT}/db/hs_err_pid+%%p.log \
    -XX:+UnlockExperimentalVMOptions \
    -XX:+AlwaysPreTouch \
    -XX:+UseParallelGC \
    --sun-misc-unsafe-memory-access=allow \
    --enable-native-access=io.questdb \
    --add-opens=java.base/java.lang=io.questdb \
    --add-opens=java.base/java.lang.reflect=io.questdb \
    --add-opens=java.base/java.nio=io.questdb \
    --add-opens=java.base/java.time.zone=io.questdb \
    --add-exports=java.base/jdk.internal.vm=io.questdb \
    -p /opt/questdb/questdb.jar \
    -m io.questdb/io.questdb.ServerMain \
    -d ${QDB_ROOT}

# Raise the open-files limit to QuestDB's recommended value
LimitNOFILE=1048576

ProtectSystem=full
StandardOutput=journal
StandardError=journal
SyslogIdentifier=questdb

[Install]
WantedBy=multi-user.target
EOF
```

`questdb.jar` is not on the default module path, so
`-p /opt/questdb/questdb.jar` is required to resolve the `io.questdb` module.

Point `-Dquestdb.libs.dir` at the directory you extracted the native libraries
into, which holds the `linux-x86-64` set on x86-64 rather than the
`linux-aarch64` one. Omit the flag to let QuestDB unpack the libraries to the
system temporary directory instead.

</TabItem>

</Tabs>

</TabItem>

<TabItem value="enterprise">

```shell
sudo tee /etc/systemd/system/questdb.service > /dev/null <<'EOF'
[Unit]
Description=QuestDB Enterprise
Documentation=https://questdb.com/docs/deployment/systemd/

[Service]
Type=exec
User=questdb
Group=questdb
Restart=always
RestartSec=2
KillSignal=SIGTERM
SuccessExitStatus=143

# QuestDB root directory
Environment=QDB_ROOT=/var/lib/questdb
StateDirectory=questdb
StateDirectoryMode=0750
ExecStartPre=/usr/bin/mkdir -p ${QDB_ROOT}/db

ExecStart=/opt/questdb/bin/java \
    -DQuestDB-Runtime-66535 \
    -Dcontainerized=false \
    -ea -Dnoebug \
    -XX:ErrorFile=${QDB_ROOT}/db/hs_err_pid+%%p.log \
    -XX:+UnlockExperimentalVMOptions \
    -XX:+AlwaysPreTouch \
    -XX:+UseParallelGC \
    --sun-misc-unsafe-memory-access=allow \
    --enable-native-access=io.questdb,com.questdb \
    --add-opens=java.base/java.lang=io.questdb,com.questdb \
    --add-opens=java.base/java.lang.reflect=io.questdb,com.questdb \
    --add-opens=java.base/java.nio=io.questdb,com.questdb \
    --add-opens=java.base/java.time.zone=io.questdb,com.questdb \
    --add-exports=java.base/jdk.internal.vm=io.questdb,com.questdb \
    -m com.questdb/com.questdb.EntServerMain \
    -d ${QDB_ROOT}

# Raise the open-files limit to QuestDB's recommended value
LimitNOFILE=1048576

ProtectSystem=full
StandardOutput=journal
StandardError=journal
SyslogIdentifier=questdb

[Install]
WantedBy=multi-user.target
EOF
```

</TabItem>

</Tabs>

`-XX:ErrorFile` writes JVM crash logs beneath `QDB_ROOT/db`; `%%p` is
intentional.

`SuccessExitStatus=143` records `systemctl stop` as a successful orderly
shutdown.

Configure `vm.max_map_count` and other recommended OS settings separately. See
[OS configuration](/docs/getting-started/capacity-planning/#os-configuration).

Reload systemd, enable QuestDB at boot, and start it now:

```shell
sudo systemctl daemon-reload &&
sudo systemctl enable --now questdb.service
```

Check the service status:

```shell
sudo systemctl status questdb.service
```

View its journal:

```shell
sudo journalctl --unit=questdb.service --follow
```

## Startup failures

If the service fails immediately, check the journal for either of the following
errors. Both mean the `ExecStart` directive does not match the archive installed
at `/opt/questdb`.

```shell
sudo journalctl --unit=questdb.service --no-pager -n 20
```

`status=203/EXEC`, alongside
`Failed at step EXEC spawning /opt/questdb/bin/java: No such file or directory`,
means that path does not exist. Check what `/opt/questdb` actually holds:

```shell
ls /opt/questdb
```

An empty or partial directory means the archive never extracted; re-run the
extraction commands from
[Initial system configuration](#initial-system-configuration). A directory
holding `questdb.jar` rather than `bin/` means the no-JRE archive is installed,
so either use the no-JRE unit above or install the runtime archive instead.

`java.lang.module.FindException: Module io.questdb not found` means `ExecStart`
runs a system Java without a module path. Add `-p /opt/questdb/questdb.jar`
before the `-m io.questdb/io.questdb.ServerMain` argument, as the no-JRE
`ExecStart` above does.

## Unexpected restarts

If QuestDB restarts without an error, check the systemd journal:

```shell
sudo journalctl --unit=questdb.service --since "today"
```

On Ubuntu, package updates may restart affected services through `needrestart`,
including during unattended upgrades. See Ubuntu's
[automatic updates documentation](https://ubuntu.com/server/docs/how-to/software/automatic-updates/#service-restarts)
for configuration options.
