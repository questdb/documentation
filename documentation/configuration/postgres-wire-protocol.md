---
title: Postgres wire protocol
description: Configuration settings for PostgreSQL wire protocol connections in QuestDB.
---

These settings control client connections using the PostgreSQL wire protocol,
including networking, authentication, query caching, and worker threads.

## Server

### pg.enabled

- **Default**: `true`
- **Reloadable**: no

Enable or disable the Postgres wire protocol interface.

### pg.worker.affinity

- **Default**: none
- **Reloadable**: no

Comma-separated list of CPU core indexes to pin worker threads to. Example:
`pg.worker.affinity=1,2,3`.

### pg.worker.count

- **Default**: `0`
- **Reloadable**: no

Number of dedicated worker threads for PostgreSQL wire protocol queries.
When `0`, uses the shared worker pool.

### pg.daemon.pool

- **Default**: `true`
- **Reloadable**: no

Whether to run all PostgreSQL wire protocol worker threads in daemon mode.

### pg.halt.on.error

- **Default**: `false`
- **Reloadable**: no

Whether ingestion should stop upon internal error.

## Authentication

### pg.password

- **Default**: `quest`
- **Reloadable**: yes

Postgres database password.

### pg.readonly.password

- **Default**: `quest`
- **Reloadable**: yes

Postgres database read-only user password.

### pg.readonly.user

- **Default**: `user`
- **Reloadable**: yes

Postgres database read-only user username.

### pg.readonly.user.enabled

- **Default**: `false`
- **Reloadable**: yes

Enable or disable the Postgres database read-only user account. When enabled,
this additional user can open read-only connections to the database.

### pg.user

- **Default**: `admin`
- **Reloadable**: yes

Postgres database username.

## Connections

### pg.connection.pool.capacity

- **Default**: `64`
- **Reloadable**: no

Maximum number of pooled connections for this interface.

### pg.net.bind.to

- **Default**: `0.0.0.0:8812`
- **Reloadable**: no

IP address and port for the Postgres wire protocol server. `0.0.0.0` binds
to all network interfaces.

### pg.net.connection.hint

- **Default**: `false`
- **Reloadable**: no

Windows-specific flag to overcome OS limitations on TCP backlog size.

### pg.net.connection.limit

- **Default**: `64`
- **Reloadable**: yes

Maximum number of simultaneous Postgres connections. Controls server memory
consumption.

### pg.net.connection.queue.timeout

- **Default**: `300000`
- **Reloadable**: no

Time in milliseconds a connection can wait in the listen backlog queue before
it is refused. Connections are aggressively removed from the backlog until the
active connection limit is breached.

### pg.net.connection.rcvbuf

- **Default**: `-1`
- **Reloadable**: no

Maximum send buffer size on each TCP socket. If set to `-1`, the socket
buffer remains unchanged from OS defaults.

### pg.net.connection.sndbuf

- **Default**: `-1`
- **Reloadable**: no

Maximum receive buffer size on each TCP socket. If set to `-1`, the socket
buffer remains unchanged from OS defaults.

### pg.net.connection.timeout

- **Default**: `300000`
- **Reloadable**: no

Connection idle timeout in milliseconds. Connections are closed by the server
when this timeout lapses.

## Buffers

### pg.binary.param.count.capacity

- **Default**: `2`
- **Reloadable**: no

Initial capacity for the pool used for binary bind variables.

### pg.max.blob.size.on.query

- **Default**: `512k`
- **Reloadable**: no

For binary values, clients receive an error when requesting blob sizes above
this value.

### pg.recv.buffer.size

- **Default**: `1M`
- **Reloadable**: yes

Size of the buffer for receiving data.

### pg.send.buffer.size

- **Default**: `1M`
- **Reloadable**: yes

Size of the buffer for sending data.

## Security

### pg.security.readonly

- **Default**: `false`
- **Reloadable**: no

Forces PostgreSQL wire protocol read-only mode when `true`, disabling
commands which modify data or data structure (e.g. INSERT, UPDATE, CREATE
TABLE).

## Query cache

### pg.insert.cache.block.count

- **Default**: `8`
- **Reloadable**: no

Number of blocks to cache INSERT query execution plans.

### pg.insert.cache.enabled

- **Default**: `true`
- **Reloadable**: no

Enable or disable the INSERT query cache. Cache capacity is
`number_of_blocks * number_of_rows`.

### pg.insert.cache.row.count

- **Default**: `8`
- **Reloadable**: no

Number of rows to cache for INSERT query execution plans.

### pg.named.statement.limit

- **Default**: `64`
- **Reloadable**: yes

Size of the named statement pool.

### pg.select.cache.block.count

- **Default**: `16`
- **Reloadable**: no

Number of blocks to cache SELECT query execution plans.

### pg.select.cache.enabled

- **Default**: `true`
- **Reloadable**: no

Enable or disable the SELECT query cache. Cache capacity is
`number_of_blocks * number_of_rows`.

### pg.select.cache.row.count

- **Default**: `16`
- **Reloadable**: no

Number of rows to cache for SELECT query execution plans.

### pg.update.cache.block.count

- **Default**: `8`
- **Reloadable**: no

Number of blocks to cache UPDATE query execution plans.

### pg.update.cache.enabled

- **Default**: `true`
- **Reloadable**: no

Enable or disable the UPDATE query cache. Cache capacity is
`number_of_blocks * number_of_rows`.

### pg.update.cache.row.count

- **Default**: `8`
- **Reloadable**: no

Number of rows to cache for UPDATE query execution plans.

## Internal pools

### pg.character.store.capacity

- **Default**: `4096`
- **Reloadable**: no

Size of the CharacterStore.

### pg.character.store.pool.capacity

- **Default**: `64`
- **Reloadable**: no

Size of the CharacterStore pool capacity.

## Locale

### pg.date.locale

- **Default**: `en`
- **Reloadable**: no

The locale to handle date types.

### pg.timestamp.locale

- **Default**: `en`
- **Reloadable**: no

The locale to handle timestamp types.
