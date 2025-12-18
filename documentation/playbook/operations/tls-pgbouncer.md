---
title: TLS for PostgreSQL Wire Protocol with PgBouncer
sidebar_label: TLS with PgBouncer
description: Add TLS encryption to QuestDB PostgreSQL wire protocol connections using PgBouncer as a TLS-terminating proxy
---

Add TLS/SSL encryption to PostgreSQL wire protocol connections to QuestDB using PgBouncer as a TLS-terminating proxy. QuestDB's PostgreSQL interface doesn't natively support TLS, but PgBouncer provides this capability while also offering connection pooling benefits.

## Problem: No Native TLS for PostgreSQL Wire Protocol

QuestDB supports PostgreSQL wire protocol on port 8812, but connections are unencrypted:

```bash
# Unencrypted connection (passwords and data visible)
psql -h questdb.example.com -p 8812 -U admin -d questdb
```

For production deployments, especially over public networks, you need TLS encryption.

## Solution: PgBouncer as TLS Proxy

Use PgBouncer to:
1. Accept TLS-encrypted client connections
2. Decrypt and forward to QuestDB's unencrypted PostgreSQL port
3. Provide connection pooling as a bonus

```
Client (TLS) → PgBouncer (TLS termination) → QuestDB (unencrypted localhost)
```

## Architecture

**Network flow:**
- Clients connect to PgBouncer on port 5432 with TLS
- PgBouncer terminates TLS and connects to QuestDB on localhost:8812
- PgBouncer and QuestDB communicate over localhost (no network exposure)

**Security benefits:**
- Data encrypted in transit from client to server
- Credentials protected during authentication
- No changes required to QuestDB configuration
- Works with any PostgreSQL-compatible client

## Installation

### Docker Compose Setup

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  questdb:
    image: questdb/questdb:latest
    container_name: questdb
    ports:
      - "9000:9000"   # Web console
      - "9009:9009"   # ILP
    volumes:
      - ./questdb-data:/var/lib/questdb
    environment:
      - QDB_PG_USER=admin
      - QDB_PG_PASSWORD=quest
    restart: unless-stopped

  pgbouncer:
    image: edoburu/pgbouncer:latest
    container_name: pgbouncer
    ports:
      - "5432:5432"   # PostgreSQL with TLS
    volumes:
      - ./pgbouncer/pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:ro
      - ./pgbouncer/userlist.txt:/etc/pgbouncer/userlist.txt:ro
      - ./certs/server.crt:/etc/pgbouncer/server.crt:ro
      - ./certs/server.key:/etc/pgbouncer/server.key:ro
    depends_on:
      - questdb
    restart: unless-stopped
```

### PgBouncer Configuration

**pgbouncer/pgbouncer.ini:**
```ini
[databases]
questdb = host=questdb port=8812 dbname=questdb

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 5432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = session
max_client_conn = 1000
default_pool_size = 25

# TLS Configuration
client_tls_sslmode = require
client_tls_cert_file = /etc/pgbouncer/server.crt
client_tls_key_file = /etc/pgbouncer/server.key
client_tls_protocols = secure

# Optional: Client certificate authentication
# client_tls_ca_file = /etc/pgbouncer/ca.crt

# Logging
logfile = /var/log/pgbouncer/pgbouncer.log
pidfile = /var/run/pgbouncer/pgbouncer.pid
admin_users = admin
```

**Key parameters:**
- `client_tls_sslmode = require`: Force TLS for all client connections
- `client_tls_cert_file`: Server certificate (signed by CA or self-signed)
- `client_tls_key_file`: Server private key
- `client_tls_protocols = secure`: Only allow TLS 1.2+

### User Authentication File

**pgbouncer/userlist.txt:**
```
"admin" "md5<hash>"
"readonly" "md5<hash>"
```

Generate MD5 hashes:
```bash
# Format: md5 + md5(password + username)
echo -n "questadmin" | md5sum | awk '{print "md5"$1}'
# Output: md56c4e8a7e9e3b6f8a9d5c4e8a7e9e3b6f
```

Then add to userlist.txt:
```
"admin" "md56c4e8a7e9e3b6f8a9d5c4e8a7e9e3b6f"
```

## Generating TLS Certificates

### Self-Signed Certificate (Development)

```bash
# Create certificate directory
mkdir -p certs

# Generate private key
openssl genrsa -out certs/server.key 2048

# Generate self-signed certificate (valid for 365 days)
openssl req -new -x509 -key certs/server.key -out certs/server.crt -days 365 \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=questdb.example.com"

# Set permissions
chmod 600 certs/server.key
chmod 644 certs/server.crt
```

### CA-Signed Certificate (Production)

```bash
# Generate private key
openssl genrsa -out certs/server.key 2048

# Generate certificate signing request (CSR)
openssl req -new -key certs/server.key -out certs/server.csr \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=questdb.example.com"

# Submit CSR to your CA (Let's Encrypt, DigiCert, etc.)
# Receive server.crt from CA

# Optionally concatenate intermediate certificates
cat server.crt intermediate.crt > certs/server.crt
```

### Let's Encrypt with Certbot

```bash
# Install certbot
sudo apt-get install certbot

# Obtain certificate (requires port 80 temporarily)
sudo certbot certonly --standalone -d questdb.example.com

# Certificates will be in /etc/letsencrypt/live/questdb.example.com/
# Copy to pgbouncer directory
sudo cp /etc/letsencrypt/live/questdb.example.com/fullchain.pem certs/server.crt
sudo cp /etc/letsencrypt/live/questdb.example.com/privkey.pem certs/server.key
sudo chown $USER:$USER certs/*
chmod 600 certs/server.key
```

## Starting the Stack

```bash
# Start QuestDB and PgBouncer
docker-compose up -d

# Check logs
docker-compose logs pgbouncer
docker-compose logs questdb

# Verify PgBouncer is listening
netstat -tlnp | grep 5432
```

## Connecting with TLS

### psql

```bash
# Require TLS
psql "postgresql://admin:quest@questdb.example.com:5432/questdb?sslmode=require"

# Verify certificate (production)
psql "postgresql://admin:quest@questdb.example.com:5432/questdb?sslmode=verify-full&sslrootcert=/path/to/ca.crt"

# Self-signed certificate (development, skips verification)
psql "postgresql://admin:quest@localhost:5432/questdb?sslmode=require"
```

### Python (psycopg2)

```python
import psycopg2

conn = psycopg2.connect(
    host="questdb.example.com",
    port=5432,
    database="questdb",
    user="admin",
    password="quest",
    sslmode="require"
)

cursor = conn.cursor()
cursor.execute("SELECT * FROM trades LIMIT 5")
print(cursor.fetchall())
conn.close()
```

### Node.js (pg)

```javascript
const { Client } = require('pg');

const client = new Client({
  host: 'questdb.example.com',
  port: 5432,
  database: 'questdb',
  user: 'admin',
  password: 'quest',
  ssl: {
    rejectUnauthorized: true,  // Verify certificate
    ca: fs.readFileSync('/path/to/ca.crt').toString(),
  },
});

await client.connect();
const res = await client.query('SELECT * FROM trades LIMIT 5');
console.log(res.rows);
await client.end();
```

### Grafana

**PostgreSQL datasource configuration:**
```
Host: questdb.example.com:5432
Database: questdb
User: readonly
Password: <password>
TLS/SSL Mode: require
TLS/SSL Method: File system path
Server Certificate: /path/to/ca.crt (if verifying)
```

## Connection Pooling Benefits

PgBouncer provides connection pooling in addition to TLS:

**Benefits:**
- Reduces connection overhead (connection setup is expensive)
- Limits concurrent connections to QuestDB
- Handles client connection bursts
- Improves query throughput

**Pool modes:**
- `session`: Connection reused after client disconnects (recommended for QuestDB)
- `transaction`: Connection returned after each transaction
- `statement`: Connection returned after each statement

**Configuration:**
```ini
pool_mode = session
default_pool_size = 25        # Connections per database per user
max_client_conn = 1000        # Total client connections
reserve_pool_size = 5         # Emergency connections
reserve_pool_timeout = 3      # Seconds to wait for connection
```

## Monitoring PgBouncer

### Admin Console

```bash
# Connect to PgBouncer admin console
psql -h localhost -p 5432 -U admin pgbouncer

# Show pool status
SHOW POOLS;

# Show client connections
SHOW CLIENTS;

# Show server connections (to QuestDB)
SHOW SERVERS;

# Show configuration
SHOW CONFIG;

# Show statistics
SHOW STATS;
```

### Key Metrics

```sql
-- Active connections by pool
SHOW POOLS;
```

**Output:**
| database | user | cl_active | cl_waiting | sv_active | sv_idle | sv_used |
|----------|------|-----------|------------|-----------|---------|---------|
| questdb | admin | 15 | 0 | 20 | 5 | 350 |

- `cl_active`: Active client connections
- `cl_waiting`: Clients waiting for a server connection
- `sv_active`: Server connections in use
- `sv_idle`: Idle server connections
- `sv_used`: Server connections used since pool started

## Security Hardening

### Restrict Client Certificate Authorities

**pgbouncer.ini:**
```ini
client_tls_ca_file = /etc/pgbouncer/ca.crt
client_tls_sslmode = verify-full
```

This requires clients to present certificates signed by your CA.

### Disable Weak Ciphers

**pgbouncer.ini:**
```ini
client_tls_ciphers = HIGH:!aNULL:!MD5:!3DES
client_tls_protocols = secure  # TLS 1.2 and 1.3 only
```

### Firewall Rules

```bash
# Allow only PgBouncer port from external
sudo ufw allow 5432/tcp

# Block direct QuestDB PostgreSQL port from external
sudo ufw deny 8812/tcp

# QuestDB should only listen on localhost
# In server.conf:
# pg.net.bind.to=127.0.0.1
```

### Authentication

Use strong passwords in userlist.txt:

```bash
# Generate strong password hash
python3 -c "import hashlib; print('md5' + hashlib.md5(b'<strong_password>admin').hexdigest())"
```

## Troubleshooting

### Connection Refused

**Symptom:** `psql: error: connection to server failed: Connection refused`

**Checks:**
1. Verify PgBouncer is running: `docker ps | grep pgbouncer`
2. Check port binding: `netstat -tlnp | grep 5432`
3. Check firewall: `sudo ufw status`
4. Review PgBouncer logs: `docker logs pgbouncer`

### TLS Certificate Errors

**Symptom:** `SSL error: certificate verify failed`

**Solution for self-signed certs:**
```bash
psql "postgresql://admin:quest@localhost:5432/questdb?sslmode=require"
# Note: "require" doesn't verify certificate, only encrypts
```

**Solution for production:**
```bash
# Verify certificate chain is complete
openssl s_client -connect questdb.example.com:5432 -showcerts
```

### Authentication Failed

**Symptom:** `password authentication failed`

**Checks:**
1. Verify userlist.txt hash is correct
2. Ensure auth_type matches (md5 vs scram-sha-256)
3. Check QuestDB credentials in pgbouncer.ini [databases] section
4. Review PgBouncer auth logs

### Performance Issues

**Check connection pool exhaustion:**
```sql
SHOW POOLS;
-- If cl_waiting > 0, clients are waiting for connections
```

**Solution:**
```ini
default_pool_size = 50  # Increase pool size
max_client_conn = 2000  # Increase if needed
```

## Alternative: Nginx Stream Proxy

For simpler TLS termination without connection pooling:

**nginx.conf:**
```nginx
stream {
    upstream questdb {
        server localhost:8812;
    }

    server {
        listen 5432 ssl;
        proxy_pass questdb;

        ssl_certificate /etc/nginx/certs/server.crt;
        ssl_certificate_key /etc/nginx/certs/server.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
    }
}
```

**Pros:** Simpler configuration, no authentication handling
**Cons:** No connection pooling, no PostgreSQL-specific features

:::tip Production Deployment
For production deployments with client applications:
1. Use CA-signed certificates (Let's Encrypt is free)
2. Set `client_tls_sslmode = require` minimum, `verify-full` for maximum security
3. Enable connection pooling to handle traffic bursts
4. Monitor PgBouncer pools regularly
5. Restrict QuestDB PostgreSQL port to localhost only
:::

:::warning Certificate Renewal
Let's Encrypt certificates expire after 90 days. Set up automatic renewal:

```bash
# Add to crontab
0 0 1 * * certbot renew && docker-compose restart pgbouncer
```

Or use a certbot hook to reload PgBouncer after renewal.
:::

:::info Related Documentation
- [PostgreSQL wire protocol](/docs/reference/api/postgres/)
- [QuestDB security](/docs/operations/security/)
- [PgBouncer documentation](https://www.pgbouncer.org/config.html)
- [Docker deployment](/docs/operations/deployment/docker/)
:::
