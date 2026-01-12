---
title: Configure QuestDB with Docker Compose
sidebar_label: Docker Compose config
description: Override QuestDB configuration parameters using environment variables in Docker Compose
---

You can override any QuestDB configuration parameter using environment variables in Docker Compose. This is useful for setting custom ports, authentication credentials, memory limits, and other operational settings without modifying configuration files.

## Environment Variable Format

To override configuration parameters via environment variables:

1. **Prefix with `QDB_`**: Add `QDB_` before the parameter name
2. **Capitalize**: Convert to uppercase
3. **Replace dots with underscores**: Change `.` to `_`

For example:
- `pg.user` becomes `QDB_PG_USER`
- `pg.password` becomes `QDB_PG_PASSWORD`
- `cairo.sql.copy.buffer.size` becomes `QDB_CAIRO_SQL_COPY_BUFFER_SIZE`

## Example: Custom PostgreSQL Credentials

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

## Common Configuration Examples

### Increase Write Buffer Size

```yaml title="Increase buffer sizes for high-throughput writes"
environment:
  - QDB_CAIRO_SQL_COPY_BUFFER_SIZE=4194304
  - QDB_LINE_TCP_MAINTENANCE_JOB_INTERVAL=500
```

### Configure Memory Limits

```yaml title="Set memory allocation for query execution"
environment:
  - QDB_CAIRO_SQL_PAGE_FRAME_MAX_ROWS=1000000
  - QDB_CAIRO_SQL_PAGE_FRAME_MIN_ROWS=100000
```

### Enable Debug Logging

```yaml title="Enable verbose logging for troubleshooting"
environment:
  - QDB_LOG_LEVEL=DEBUG
  - QDB_LOG_BUFFER_SIZE=1048576
```

### Custom Data Directory Permissions

```yaml title="Run with specific user/group for volume permissions"
services:
  questdb:
    image: questdb/questdb
    user: "1000:1000"
    environment:
      - QDB_CAIRO_ROOT=/var/lib/questdb
    volumes:
      - ./questdb_data:/var/lib/questdb
```

## Complete Configuration Reference

For a full list of available configuration parameters, see:
- [Server Configuration Reference](/docs/configuration/overview/) - All configurable parameters with descriptions
- [Docker Deployment Guide](/docs/deployment/docker/) - Docker-specific setup instructions

## Verifying Configuration

After starting QuestDB with custom configuration, verify the settings:

1. **Check logs**: View container logs to confirm configuration was applied:
   ```bash
   docker compose logs questdb
   ```

2. **Query system tables**: Connect via PostgreSQL wire protocol and query configuration:
   ```sql
   SELECT * FROM sys.config;
   ```

3. **Web console**: Access the web console at `http://localhost:9000` and check the "Configuration" tab

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

:::warning Volume Permissions
If you encounter permission errors with mounted volumes, ensure the QuestDB container user has write access to the host directory. You may need to set ownership with `chown -R 1000:1000 ./questdb_root` or run the container with a specific user ID.
:::

:::info Related Documentation
- [Server Configuration](/docs/configuration/overview/)
- [Docker Deployment Guide](/docs/deployment/docker/)
- [PostgreSQL Wire Protocol](/docs/query/pgwire/overview/)
:::
