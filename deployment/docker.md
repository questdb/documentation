---
title: Using Docker with QuestDB
sidebar_label: Docker
description:
  Guide showing how to use QuestDB with Docker. This also covers how to import
  and persist QuestDB data in a docker container.
---

import InterpolateReleaseData from "../../src/components/InterpolateReleaseData"
import CodeBlock from "@theme/CodeBlock"
import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"

QuestDB has images for both Linux/macOS and Windows on
[Docker Hub](https://hub.docker.com/r/questdb/questdb).

## Install Docker

To begin, install Docker. You can find guides for your platform on the
[official documentation](https://docs.docker.com/get-docker/).

## Run QuestDB image

Once Docker is installed, you will need to pull QuestDB's image from
[Docker Hub](https://hub.docker.com/r/questdb/questdb) and create a container.

This can be done with a single command using:

<InterpolateReleaseData
  renderText={(release) => (
    <CodeBlock className="language-shell">
      {`docker run \\
  -p 9000:9000 -p 9009:9009 -p 8812:8812 -p 9003:9003 \\
  questdb/questdb:${release.name}`}
    </CodeBlock>
  )}
/>

This command starts a Docker container from `questdb/questdb` image. In
addition, it exposes some ports, allowing you to explore QuestDB.

In order to configure QuestDB, it is recommended to mount a
[volume](#v-parameter-to-mount-storage) to allow data persistance. This can be
done by adding a `-v` flag to the above command:

```
-v "/host/volume/location:/var/lib/questdb"
```

Below each parameter is described in detail.

### `-p` parameter to expose ports

This parameter will expose a port to the host. You can specify:

- `-p 9000:9000` - [REST API](/docs/reference/api/rest/) and
  [Web Console](/docs/web-console/)
- `-p 9009:9009` - [InfluxDB line protocol](/docs/reference/api/ilp/overview/)
- `-p 8812:8812` - [Postgres wire protocol](/docs/reference/api/postgres/)
- `-p 9003:9003` -
  [Min health server](/docs/operations/logging-metrics/#minimal-http-server)

All ports are optional, you can pick only the ones you need. For example, it is
enough to expose `8812` if you only plan to use
[Postgres wire protocol](/docs/reference/api/postgres/).

### `-v` parameter to mount storage

This parameter will make a local directory available to QuestDB Docker
container. It will have all data ingested to QuestDB, server logs and
configuration.

The QuestDB [root_directory](/docs/concept/root-directory-structure/) is located
at the `/var/lib/questdb` path in the container.

### Docker image version

By default, `questdb/questdb` points to the latest QuestDB version available on
Docker. However, it is recommended to define the version used.

<InterpolateReleaseData
  renderText={(release) => (
    <CodeBlock className="language-shell">
      {`questdb/questdb:${release.name}`}
    </CodeBlock>
  )}
/>

## Environment variables

Server configuration can be passed to QuestDB running in Docker by using the
`-e` flag to pass an environment variable to a container:

```bash
docker run -p 4000:4000 -e QDB_HTTP_BIND_TO=0.0.0.0:4000 questdb/questdb
```

For a list of configuration options, see [Configuration](/docs/configuration/).

## Container status

You can check the status of your container with `docker ps`.

It also lists the exposed ports, container name, uptime and more:

```shell title="Finding container status with docker ps"
docker ps
```

```shell title="Result of docker ps"
CONTAINER ID        IMAGE               COMMAND                  CREATED             STATUS              PORTS                NAMES
dd363939f261        questdb/questdb     "/app/bin/java -m io…"   3 seconds ago       Up 2 seconds        8812/tcp, 9000/tcp   frosty_gauss
```

This container:

- has an id of `dd363939f261`
- uses ports `8812` & `9000`, for Postgres wire protocol and HTTP respectively
- is using a `questdb/questdb` image
- ran java to start the binary
- is 3 seconds old
- has been up for 2 seconds
- has the unfortunate name of `frosty_gauss`

For full container status information, see the
[`docker ps` manual](https://docs.docker.com/engine/reference/commandline/ps/).

### Debugging container logs

Docker may generate a runtime error.

The error may not be accurate, as the true culprit is often indicated higher up
in the logs.

To see the full log, retrieve the UUID - also known as the `CONTAINER ID` -
using `docker ps`:

```shell title="Finding the CONTAINER ID"
CONTAINER ID        IMAGE               ...
dd363939f261        questdb/questdb     ...
```

Now pass the `CONTAINER ID` - or `dd363939f261` - to the `docker logs` command:

```shell title="Generating a docker log from a CONTAINER ID"
$ docker logs dd363939f261
No arguments found, start with default arguments
Running as questdb user
Log configuration loaded from: /var/lib/questdb/conf/log.conf
...
...
```

Note that the log will pull from `/var/lib/questdb/conf/log.conf` by default.

Sharing this log when seeking support for Docker deployments will help us find
the root cause.

## Importing data and sending queries

When QuestDB is running, you can start interacting with it:

- Port `9000` is for REST. More info is available on the
  [REST documentation page](/docs/reference/api/rest/).
- Port `8812` is used for Postgres. Check our
  [Postgres reference page](/docs/reference/api/postgres/).
- Port `9009` is dedicated to InfluxDB Line Protocol. Consult our
  [InfluxDB protocol page](/docs/reference/api/ilp/overview/).

## Data persistence

### Mounting a volume

Volumes can be mounted to the QuestDB Docker container so that data may be
persisted or server configuration settings may be passed to an instance. The
following example demonstrated how to mount the current directory to a QuestDB
container using the `-v` flag in a Docker `run` command:

<InterpolateReleaseData
  renderText={(release) => (
    <CodeBlock className="language-shell" title={"Mounting a volume"}>
      {`docker run -p 9000:9000 \\
  -p 9009:9009 \\
  -p 8812:8812 \\
  -p 9003:9003 \\
  -v "$(pwd):/var/lib/questdb" \\
  questdb/questdb:${release.name}`}
    </CodeBlock>
  )}
/>

The current directory will then have data persisted to disk for convenient
migration or backups:

```bash title="Current directory contents"
├── conf
│   └── server.conf
├── db
├── log
├── public
└── snapshot (optional)
```

A server configuration file can also be provided by mounting a local directory
in a QuestDB container. Given the following configuration file which overrides
the default HTTP bind property:

```shell title="./server.conf"
http.bind.to=0.0.0.0:4000
```

Running the container with the `-v` flag allows for mounting the current
directory to QuestDB's `conf` directory in the container. With the server
configuration above, HTTP ports for the web console and REST API will be
available on [localhost:4000](http://localhost:4000):

```bash
docker run -v "$(pwd):/var/lib/questdb/conf" -p 4000:4000 questdb/questdb
```

:::note 

If you wish to use ZFS for your QuestDB deployment, with Docker, then you will need to enable ZFS on the host volume that Docker uses.

Please see the [docker documentation](https://docs.docker.com/storage/storagedriver/zfs-driver/) for more information.

:::

### Upgrade QuestDB version

It is possible to upgrade your QuestDB instance on Docker when a volume is
mounted to maintain data persistence.

:::note

- Check the [release notes](https://github.com/questdb/questdb/releases) and
  ensure that necessary [backup](/docs/operations/backup/) is completed.
- Upgrading an instance is possible only when the original instance has a volume
  mounted. Without mounting a volume for the original instance, the following
  steps create a new instance and data in the old instance cannot be retrieved.

:::

1. Run `docker ps` to copy the container name or ID:

```shell title="Container status"

# The existing QuestDB version is 6.5.2:

CONTAINER ID        IMAGE                    COMMAND                  CREATED             STATUS              PORTS                NAMES
dd363939f261        questdb/questdb:6.5.2     "/app/bin/java -m io…"   3 seconds ago       Up 2 seconds        8812/tcp, 9000/tcp   frosty_gauss
```

2. Stop the instance and then remove the container:

```shell
docker stop dd363939f261
docker rm dd363939f261
```

3. Download the latest QuestDB image:

<InterpolateReleaseData
  renderText={(release) => (
    <CodeBlock className="language-shell">
      {`docker pull questdb/questdb:${release.name}`}
    </CodeBlock>
  )}
/>

4. Start a new container with the new version and the same volume mounted:

<InterpolateReleaseData
  renderText={(release) => (
    <CodeBlock className="language-shell">
      {`docker run -p 8812:8812 -p 9000:9000 -v "$(pwd):/var/lib/questdb" questdb/questdb:${release.name}`}
    </CodeBlock>
  )}
/>

### Writing logs to disk

When mounting a volume to a Docker container, a logging configuration file may
be provided in the container located at `/conf/log.conf`:

```bash title="Current directory contents"
└── conf
    ├── log.conf
    └── server.conf
```

For example, a file with the following contents can be created:

```shell title="./conf/log.conf"
# list of configured writers
writers=file,stdout,http.min

# file writer
w.file.class=io.questdb.log.LogFileWriter
w.file.location=questdb-docker.log
w.file.level=INFO,ERROR,DEBUG

# stdout
w.stdout.class=io.questdb.log.LogConsoleWriter
w.stdout.level=INFO

# min http server, used monitoring
w.http.min.class=io.questdb.log.LogConsoleWriter
w.http.min.level=ERROR
w.http.min.scope=http-min-server
```

The current directory can be mounted:

```shell title="Mounting the current directory to a QuestDB container"
docker run -p 9000:9000 \
 -p 9009:9009 \
 -p 8812:8812 \
 -p 9003:9003 \
 -v "$(pwd):/root/.questdb/" questdb/questdb
```

The container logs will be written to disk using the logging level and file name
provided in the `conf/log.conf` file, in this case in `./questdb-docker.log`:

```shell title="Current directory tree"
├── conf
│  ├── log.conf
│  └── server.conf
├── db
│  ├── table1
│  └── table2
├── public
│  ├── ui / assets
│  ├── ...
│  └── version.txt
└── questdb-docker.log
```

For more information on logging, see the
[configuration reference documentation](/docs/operations/logging-metrics/#docker-logging).

### Restart an existing container

Running the following command will create a new container for the QuestDB image:

```shell
docker run -p 9000:9000 \
  -p 9009:9009 \
  -p 8812:8812 \
  -p 9003:9003 \
  questdb/questdb
```

By giving the container a name with `--name container_name`, we have an easy way
to refer to the container created by run later on:

```shell
docker run -p 9000:9000 \
  -p 9009:9009 \
  -p 8812:8812 \
  -p 9003:9003 \
  --name docker_questdb \
  questdb/questdb
```

If we want to re-use this container and its data after it has been stopped, we
can use the following commands:

```shell
# bring the container up
docker start docker_questdb
# shut the container down
docker stop docker_questdb
```

Alternatively, restart it using the `CONTAINER ID`:

```shell title="Starting a container by CONTAINER ID"
docker start dd363939f261
```
