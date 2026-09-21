---
title: Configure QuestDB with Docker Compose
sidebar_label: Docker Compose config
description: Override QuestDB configuration parameters using environment variables in Docker Compose
---

You can override any QuestDB configuration parameter using environment variables in Docker Compose. This is useful for setting custom ports, authentication credentials, memory limits, and other operational settings without modifying configuration files.

## Environment variable format

To override configuration parameters via environment variables:

1. **Prefix with `QDB_`**: Add `QDB_` before the parameter name
2. **Capitalize**: Convert to uppercase
3. **Replace dots with underscores**: Change `.` to `_`

For example:
- `pg.user` becomes `QDB_PG_USER`
- `pg.password` becomes `QDB_PG_PASSWORD`
- `cairo.sql.copy.buffer.size` becomes `QDB_CAIRO_SQL_COPY_BUFFER_SIZE`

:::tip
Keep sensitive configuration like passwords in a `.env` file and reference them in `docker-compose.yml`:

```yaml
environment:
  - QDB_PG_PASSWORD=${QUESTDB_PASSWORD}
```

Then create a `.env` file:
```
QUESTDB_PASSWORD=your_secure_password
```
:::


## Example: Custom PostgreSQL credentials

This Docker Compose file overrides the default PostgreSQL wire protocol credentials:

```yaml title="docker-compose.yml - Override pg.user and pg.password"
version: "3.9"

services:
  questdb:
    image: questdb/questdb
    container_name: custom_questdb
    restart: always
    ports:
      - "8812:8812"
      - "9000:9000"
      - "9009:9009"
      - "9003:9003"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - QDB_PG_USER=borat
      - QDB_PG_PASSWORD=clever_password
    volumes:
      - ./questdb/questdb_root:/var/lib/questdb/
```

This configuration:
- Sets PostgreSQL wire protocol username to `borat`
- Sets password to `clever_password`
- Persists data to `./questdb/questdb_root` on the host machine
- Exposes all QuestDB ports (web console, HTTP, ILP, PostgreSQL wire)




:::warning Volume Permissions
By default the `questdb/questdb` image starts as `root`, takes ownership of the
mounted data directory, and then drops privileges to its own `questdb` user. In
most cases you do not need to do anything.

If you pin the container user with `user:`, the entrypoint can no longer fix
ownership, so the host directory must already be writable by the uid and gid you
pin.
:::

## Custom data directory permissions

Pin the container user when you want QuestDB to write files as a specific
account on the host, for example so that the data directory stays readable by
your own user. Set `user:` to a uid and gid that owns the host directory, which
is often `1000:1000` for the first non-root account on a Linux host. Run
`id -u` and `id -g` to check:

```yaml title="Run with a specific user/group for volume permissions"
services:
  questdb:
    image: questdb/questdb
    user: "1000:1000"
    volumes:
      - ./questdb_data:/var/lib/questdb
```

Make sure that user owns the host directory before starting the container:

```bash
mkdir -p questdb_data && sudo chown -R 1000:1000 questdb_data
```

:::caution Do not set `QDB_CAIRO_ROOT` in Docker
The Docker image already uses `/var/lib/questdb` as its root directory, so
`QDB_CAIRO_ROOT` is unnecessary. Setting it to an absolute path also changes how
QuestDB derives its other directories: they become siblings of the data
directory rather than children of the root directory.

With `QDB_CAIRO_ROOT=/var/lib/questdb`, the checkpoint, import, export and
temporary directories move to `/var/lib/.checkpoint`, `/var/lib/import`,
`/var/lib/export` and `/var/lib/tmp` — all outside the mounted volume, in a
directory the container user cannot write to. `CHECKPOINT CREATE` then fails
with an error such as:

```
Could not create [dir=/var/lib/.checkpoint//var/lib/questdb/]
```

To change where data is stored on the host, change the left-hand side of the
volume mapping instead.
:::

## Complete configuration reference

For a full list of available configuration parameters, see:
- [Server Configuration Reference](/docs/configuration/overview/) - All configurable parameters with descriptions
- [Docker Deployment Guide](/docs/deployment/docker/) - Docker-specific setup instructions




:::info Related Documentation
- [Server Configuration](/docs/configuration/overview/)
- [Docker Deployment Guide](/docs/deployment/docker/)
- [PostgreSQL Wire Protocol](/docs/connect/compatibility/pgwire/overview/)
:::
