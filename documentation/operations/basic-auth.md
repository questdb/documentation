---
title: Basic Authentication
description:
  This document describes how to configure and use HTTP Basic Authentication in
  QuestDB for securing your database endpoints.
---

import Screenshot from "@theme/Screenshot"
import CodeBlock from "@theme/CodeBlock"
import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"

HTTP Basic Authentication provides a simple method to secure access to QuestDB's HTTP endpoints, including the REST API, Web Console, and Health Check endpoints.

This authentication method requires users to provide a username and password with each request, making it ideal for development environments and simple production setups.

## Overview

Basic Authentication in QuestDB supports:

- **REST API Protection**: Secure all REST endpoints with username/password authentication
- **Web Console Access Control**: Protect the web console interface  
- **Health Check Security**: Optional authentication for monitoring endpoints
- **Client Library Integration**: Built-in support across all QuestDB client libraries
- **Multiple User Support**: Configure different users with varying access levels

:::note

For production environments with advanced security requirements, consider using [Role-Based Access Control (RBAC)](/docs/operations/rbac/) available in QuestDB Enterprise, which provides token-based authentication, fine-grained permissions, and SSO integration.

:::

## Configuration

### Server Configuration

Basic Authentication is configured via the `server.conf` file. The minimal configuration requires setting a username and password:

```ini title="server.conf"
# Enable HTTP Basic Authentication
http.user=questdb_user
http.password=secure_password_123
```

### Advanced Configuration Options

For more granular control, you can configure authentication for specific endpoints:

```ini title="server.conf"
# Main HTTP endpoints (REST API, Web Console)
http.user=admin
http.password=admin_password

# Optional: Separate authentication for health check endpoints
http.health.check.authentication.required=true

# Optional: Configure security settings
http.security.max.response.rows=10000
http.security.readonly=false

# Optional: CORS settings for web applications
http.cors.enabled=true
http.cors.allow.credentials=true
```

### Environment Variables

You can also configure Basic Authentication using environment variables, which is useful for containerized deployments:

```bash
export QDB_HTTP_USER=questdb_user
export QDB_HTTP_PASSWORD=secure_password_123
```

## Client Integration

### REST API Requests

<Tabs>
<TabItem value="curl" label="cURL">

```bash
# Execute a SQL query with Basic Authentication
curl -G --data-urlencode "query=SELECT * FROM my_table LIMIT 10;" \
    -u "questdb_user:secure_password_123" \
    http://localhost:9000/exec

# Alternative using Authorization header
curl -G --data-urlencode "query=SELECT COUNT(*) FROM my_table;" \
    -H "Authorization: Basic $(echo -n questdb_user:secure_password_123 | base64)" \
    http://localhost:9000/exec
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests
from requests.auth import HTTPBasicAuth
import json

# Using requests with Basic Auth
auth = HTTPBasicAuth('questdb_user', 'secure_password_123')

# Execute query
response = requests.get(
    'http://localhost:9000/exec',
    params={'query': 'SELECT * FROM my_table LIMIT 10'},
    auth=auth
)

if response.status_code == 200:
    data = response.json()
    print(json.dumps(data, indent=2))
else:
    print(f"Error: {response.status_code} - {response.text}")
```

</TabItem>
<TabItem value="javascript" label="JavaScript">

```javascript
// Using fetch with Basic Authentication
const username = 'questdb_user';
const password = 'secure_password_123';
const credentials = btoa(`${username}:${password}`);

const response = await fetch('http://localhost:9000/exec?query=SELECT * FROM my_table LIMIT 10', {
    method: 'GET',
    headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
    }
});

if (response.ok) {
    const data = await response.json();
    console.log(data);
} else {
    console.error('Authentication failed:', response.status);
}
```

</TabItem>
</Tabs>

### Web Console Access

Once Basic Authentication is enabled, accessing the Web Console at `http://localhost:9000` will prompt for credentials. Your browser will display a standard HTTP Basic Authentication dialog where you can enter your configured username and password to access the console.

:::tip Web Console Login

The browser will automatically prompt for credentials when Basic Authentication is enabled. Enter the username and password you configured in `server.conf` to access the QuestDB Web Console.

:::

### Client Libraries

All QuestDB client libraries support Basic Authentication through connection strings:

<Tabs>
<TabItem value="python-client" label="Python Client">

```python
from questdb.ingress import Sender

# Using connection string
conf = "http::addr=localhost:9000;username=questdb_user;password=secure_password_123;"
with Sender.from_conf(conf) as sender:
    sender.row(
        'temperature_sensors',
        symbols={'location': 'office', 'sensor_id': 'TMP001'},
        columns={'temperature': 23.5, 'humidity': 45.2},
    )
    sender.flush()

# Using environment variable
import os
os.environ['QDB_CLIENT_CONF'] = conf
with Sender.from_env() as sender:
    # ... send data
```

</TabItem>
<TabItem value="java-client" label="Java Client">

```java
import io.questdb.client.Sender;

// Using connection string
try (Sender sender = Sender.fromConfig("http::addr=localhost:9000;username=questdb_user;password=secure_password_123;")) {
    sender.table("temperature_sensors")
          .symbol("location", "office")
          .symbol("sensor_id", "TMP001")
          .doubleColumn("temperature", 23.5)
          .doubleColumn("humidity", 45.2)
          .atNow();
    sender.flush();
}
```

</TabItem>
<TabItem value="go-client" label="Go Client">

```go
package main

import (
    "context"
    "log"
    qdb "github.com/questdb/go-questdb-client/v4"
)

func main() {
    ctx := context.TODO()
    
    sender, err := qdb.NewLineSender(
        ctx,
        qdb.WithHttp(),
        qdb.WithAddress("localhost:9000"),
        qdb.WithBasicAuth("questdb_user", "secure_password_123"),
    )
    if err != nil {
        log.Fatal(err)
    }
    defer sender.Close(ctx)
    
    err = sender.Table("temperature_sensors").
        Symbol("location", "office").
        Symbol("sensor_id", "TMP001").
        Float64Column("temperature", 23.5).
        Float64Column("humidity", 45.2).
        AtNow(ctx)
    
    if err != nil {
        log.Fatal(err)
    }
}
```

</TabItem>
<TabItem value="nodejs" label="Node.js Client">

```javascript
const { Sender } = require('@questdb/nodejs-client');

const sender = Sender.fromConfig('http::addr=localhost:9000;username=questdb_user;password=secure_password_123;');

await sender.table('temperature_sensors')
    .symbol('location', 'office')
    .symbol('sensor_id', 'TMP001')
    .floatColumn('temperature', 23.5)
    .floatColumn('humidity', 45.2)
    .atNow();

await sender.flush();
await sender.close();
```

</TabItem>
</Tabs>

## Security Best Practices

### Password Security

1. **Use Strong Passwords**: Choose passwords with at least 12 characters, including uppercase, lowercase, numbers, and special characters
2. **Avoid Default Credentials**: Never use default or common passwords like "admin", "password", or "questdb"
3. **Regular Rotation**: Implement a password rotation policy for production environments
4. **Environment Variables**: Store credentials in environment variables rather than configuration files when possible

### Network Security

1. **HTTPS/TLS**: Always use HTTPS in production environments. See [TLS Configuration](/docs/operations/tls/) for setup instructions
2. **Network Restrictions**: Limit access to QuestDB ports using firewalls or security groups
3. **VPN/Private Networks**: Access QuestDB through VPNs or private networks when possible

### Monitoring and Auditing

1. **Log Authentication Attempts**: Monitor failed authentication attempts in QuestDB logs
2. **Rate Limiting**: Implement rate limiting at the network level to prevent brute force attacks
3. **Regular Security Audits**: Periodically review user access and authentication logs

## Troubleshooting

### Common Issues

**Issue**: Authentication not working after configuration
```bash
# Solution: Restart QuestDB after configuration changes
sudo systemctl restart questdb
# or if running directly
java -jar questdb.jar
```

**Issue**: Receiving 401 Unauthorized errors
```bash
# Check if credentials are correctly encoded
echo -n "username:password" | base64

# Verify server configuration
grep -E "http\.(user|password)" /path/to/server.conf
```

**Issue**: Web Console not prompting for authentication
```bash
# Clear browser cache and cookies for the QuestDB domain
# Check if configuration is loaded correctly in server logs
```

### Testing Authentication

You can test if Basic Authentication is properly configured:

```bash
# Test without authentication (should fail)
curl http://localhost:9000/exec?query=SELECT%201

# Test with correct credentials (should succeed)
curl -u "questdb_user:secure_password_123" \
     http://localhost:9000/exec?query=SELECT%201

# Test health endpoint
curl -u "questdb_user:secure_password_123" \
     http://localhost:9000/ping
```

## Migration from No Authentication

If you're adding Basic Authentication to an existing QuestDB installation:

1. **Plan Downtime**: Authentication changes require a server restart
2. **Update Client Applications**: Modify all client applications to include authentication
3. **Test Thoroughly**: Verify all integrations work with authentication enabled
4. **Monitor Logs**: Watch for authentication failures after deployment

```bash
# Example migration script
#!/bin/bash

# Backup current configuration
cp /path/to/server.conf /path/to/server.conf.backup

# Add authentication settings
echo "http.user=questdb_user" >> /path/to/server.conf
echo "http.password=secure_password_123" >> /path/to/server.conf

# Restart QuestDB
sudo systemctl restart questdb

# Test authentication
curl -u "questdb_user:secure_password_123" http://localhost:9000/ping
```

## Next Steps

- [Configure TLS encryption](/docs/operations/tls/) for secure communication
- [Set up Role-Based Access Control](/docs/operations/rbac/) for advanced security (Enterprise)
- [Monitor and alert](/docs/operations/monitoring-alerting/) on authentication events
- [Configure backup strategies](/docs/operations/backup/) for your secured database

Basic Authentication provides a solid foundation for securing your QuestDB installation. For enterprise environments requiring advanced features like SSO, fine-grained permissions, and audit logging, consider upgrading to [QuestDB Enterprise](/enterprise/).