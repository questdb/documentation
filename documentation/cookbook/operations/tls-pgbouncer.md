---
title: TLS with PgBouncer for QuestDB
sidebar_label: TLS with PgBouncer
description: Configure PgBouncer to provide TLS termination for QuestDB PostgreSQL connections
---

Configure PgBouncer to provide TLS termination for QuestDB Open Source PostgreSQL wire protocol connections.

:::note QuestDB Enterprise
For QuestDB Enterprise, there is native TLS support, so you can connect directly with TLS or use PgBouncer with full TLS end-to-end encryption.
:::

## Solution: TLS termination at PgBouncer

QuestDB Open Source does not implement TLS on the PostgreSQL wire protocol, so TLS termination needs to be done at the PgBouncer level.

Configure PgBouncer with:

```ini
[databases]
questdb = host=127.0.0.1 port=8812 dbname=questdb user=admin password=quest

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 5432
auth_type = trust
auth_file = /path/to/pgbouncer/userlist.txt

client_tls_sslmode = require
client_tls_key_file = /path/to/pgbouncer/pgbouncer.key
client_tls_cert_file = /path/to/pgbouncer/pgbouncer.crt
client_tls_ca_file = /etc/ssl/cert.pem

server_tls_sslmode = disable
logfile = /path/to/pgbouncer/pgbouncer.log
pidfile = /path/to/pgbouncer/pgbouncer.pid
```

The key setting is `server_tls_sslmode = disable`. This makes psql connect using TLS to PgBouncer, but PgBouncer will connect without TLS to your QuestDB instance.

Connect with:

```bash
psql "host=127.0.0.1 port=5432 dbname=questdb user=admin sslmode=require"
```

:::warning Unencrypted Traffic
Traffic will be unencrypted between PgBouncer and QuestDB. This setup is only suitable when both services run on the same host or within a trusted network.
:::



:::info Related Documentation
- [PostgreSQL wire protocol](/docs/query/pgwire/overview/)
- [QuestDB security](/docs/security/tls/)
- [PgBouncer documentation](https://www.pgbouncer.org/config.html)
:::
