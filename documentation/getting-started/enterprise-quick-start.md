---
title: QuestDB Enterprise quick start
description:
  "Get started with QuestDB Enterprise, as quickly as possible. Instructions
  follow a happy path, and will get you running with all the latest and greatest
  features."
---

import Screenshot from "@theme/Screenshot"

import Button from "@theme/Button"

QuestDB Enterprise offers the entire feature set of QuestDB open source, with
premium additions.

This guide will walk you through a basic Enterprise setup.

Each production configuration will be unique, however these examples will help
inform your own unique choices.

---

[Requirements](#requirements)\
[0. Secure the built in admin](#0-secure-the-built-in-admin)\
[1. Setup TLS](#1-setup-tls)\
[2. Setup a database administrator](#2-setup-a-database-administrator)\
[3. Create interactive user accounts](#3-create-interactive-user-accounts)\
[4. Ingest data, InfluxDB Line Protocol](#4-ingest-data-influxdb-line-protocol)\
[5. Ingest data, Kafka Connect (optional)](#5-ingest-data-kafka-connect-optional)\
[6. Query data, PostgreSQL query](#6-query-data-postgresql-query)\
[7. Setup replication](#7-setup-replication)\
[8. Enable compression](#8-enable-compression)\
[9. Double-check kernel limits](#9-double-check-kernel-limits)\
[Next steps](#next-steps)\
[FAQ](#faq)

---

## Requirements

The following are required prior to following this guide:

- QuestDB Enterprise binary with an active license
  - No license? [Contact us](/enterprise/contact/) for more information.
- Use of a [supported file system](/docs/getting-started/capacity-planning/#supported-filesystems)
  - A [Zettabyte File System (ZFS)](https://openzfs.org/wiki/Main_Page) is recommended to enable compression

## Installation guide

Changes take place in your `conf/server.conf` file, the QuestDB [Web Console](/docs/getting-started/web-console/overview/),
your app code or third-party tool.

Check the code snippet's title to see where the command is to be invoked.

If you run into any trouble, please [contact us](mailto:support@questdb.io) by
email or visit the [Community Forum](https://community.questdb.com/).

## 0. Secure the built in admin

QuestDB Enterprise provides a built-in administrator account.

By default, it has the login `admin` and the password `quest`.

Before you go any further, please **change the default password**!

Consider changing the name, too.

To change these values, swap your own in place of `myadmin` and
`my_very_secure_pwd`:

```bash title="server.conf - Securing built-in admin account"
# the built-in admin's user name and password
acl.admin.user=myadmin
acl.admin.password=my_very_secure_pwd
```

We will optionally disable this built-in administrator account later.

For more on access control, see [Role-Based Access Control](/docs/security/rbac/).

## 1. Setup TLS

QuestDB supports TLS versions 1.2 and 1.3.

To configure TLS on all interfaces, set the following:

```bash title="server.conf - Changing cert paths"
tls.enabled=true
tls.cert.path=/path/to/certificate.pem
tls.private.key.path=/path/to/private_key
```

To hot-reload the certificate and private key and update the files on disk,
login to your QuestDB [Web Console](/docs/getting-started/web-console/overview/). This is accessible by default at
http://localhost:9000. Login using the built-in administrator
credential.

Then, execute:

```questdb-sql title="Web Console - Reloading TLS"
SELECT reload_tls();
```

TLS is now active.

For more details on TLS see the
[TLS operations documentation](/docs/security/tls/).

## 2. Setup a database administrator

The built-in admin aids in the first mile, and as needed on a recovery basis.

A helpful practice is to have one created admin through which to setup other
accounts.

Create a new database admin:

```questdb-sql title="Web Console - Creating an admin; use your own, secure password!"
CREATE USER myadmin WITH PASSWORD 'xyz';
GRANT all TO myadmin WITH GRANT OPTION;
```

For emphasis: Please choose a secure password!

After admin creation, we can now disable the built-in `admin`:

```shell title="server.conf - Disabling service account"
acl.admin.user.enabled=false
```

Can you keep it? If it's secured, it's up to you. Consider different roles. You
may be setting up an Enterprise cluster as the infrastructure admin. In this
case, the built-in admin is your tool to do infrastructure tasks. The admin we
just created may be of a different persona, the one who sets up users, groups,
dictates how data can enter and be queried.

However you break it down, remember that it can always be reactivated.

## 3. Create interactive user accounts

Now that you have an admin account, create interactive users.

Interactive users are those who will ingest into and query your database, and
manipulate its data. These are different than administrators, like you, who
delegate permissions.

Create and govern users through **role-based access control** and the curation
of your **access control list**.

Interactive users may utilize the [Web Console](/docs/getting-started/web-console/overview/) and/or the Postgres querying
clients. It is common practice to set them up as `readonly`. But how you setup
these users or groups is up to you.

For ingestion, we'll cover that in the next section. Consider this first wave of
users your "database consumers".

For permissions, the [Web Console](/docs/getting-started/web-console/overview/) requires `HTTP`, and the PostgreSQL interface
requires `PGWIRE`:

```questdb-sql title="Web Console - Creating multiple users with differing permissions."
-- Read only user, can read all tables:
CREATE USER readonly WITH PASSWORD 'xyz';
GRANT HTTP, PGWIRE TO readonly;
GRANT SELECT ON ALL TABLES TO readonly;

-- User with all permissions on a specific table:
CREATE USER user1 WITH PASSWORD 'abc';
GRANT HTTP, PGWIRE TO user1;
GRANT ALL ON table1 TO user1;

-- User who can manage access to a specific table:
CREATE USER user2 WITH PASSWORD 'abc';
GRANT HTTP, PGWIRE TO user2;
GRANT ALL ON table2 TO user2 WITH GRANT OPTION;
```

Permission grants can be specific and fine-tuned.

List the full list of applied permissions with `all_permissions()`.

- For the full role-based access control docs, including group management, see
  the [RBAC operations guide](/docs/security/rbac/).

- For a full list of available permissions, see the
  [permissions sub-section in the RBAC operations guide](/docs/security/rbac/#permissions).

## 4. Ingest data, InfluxDB Line Protocol

The recommended method for high-throughput ingestion is InfluxDB Line Protocol (ILP) over HTTP.

We recommend using a service account for programmatic ingestion. Service accounts apply a cleaner set of access
permissions and are less likely to be affected by day-to-day user management.

The process is:

1. Create a service account and grant it permissions.
2. Generate a **REST token** for the service account.
3. Use this token in your client's connection string.

### Step 1: Create the Service Account

First, run the following SQL in the web console. This creates a service account named `ingest_http` and grants it the
necessary permissions to use HTTP endpoints and manage data.

```questdb-sql title="Web Console - Setup a service account"
CREATE SERVICE ACCOUNT ingest_ilp;
-- Grant permission to create tables and use HTTP endpoints
GRANT HTTP, CREATE TABLE TO ingest_ilp;
-- Grant permission to add columns and insert data
GRANT ADD COLUMN, INSERT ON ALL TABLES TO ingest_ilp;

-- OR, for more granular control:
-- GRANT ADD COLUMN, INSERT ON table1, table2 TO ingest_ilp;
```

### Step 2: Generate an Authentication Token

Next, generate a REST API token for the service account. This token acts as a password, so you must store it securely.

```questdb-sql title="Web Console - Generate a token for the ingest client"
ALTER SERVICE ACCOUNT ingest_ilp CREATE TOKEN TYPE REST WITH TTL '3000d' REFRESH;
```

This command returns a token. **Copy it immediately**, as it's shown only once.

| name       | token                                          | expires_at                  | refresh |
|------------|------------------------------------------------|-----------------------------|---------|
| ingest_ilp | qt1KAsf1U9YbUVAX1H2IahXEE3-4qBcK-zx_jsZUzV9bLY | 2033-09-19T15:32:51.628453Z | true    |

### Step 3: Use the Token in Your Client

You can now use this token to authenticate your application. The following Java example shows how to use the client
library by configuring it from a connection string. This is the recommended approach.

```java title="Java - Ingesting data via ILP"
import io.questdb.client.Sender;
import java.time.temporal.ChronoUnit;

public class Ingest {
    public static void main(String[] args) {
        try (Sender sender = Sender.fromConfig("https::addr=localhost:9000;token=qt1KAsf1U9YbUVAX1H2IahXEE3-4qBcK-zx_jsZUzV9bLY;")) {
            sender.table("ilptest");
            sender.symbol("sym1", "symval1")
                    .doubleColumn("double1", 100.0)
                    .at(System.currentTimeMillis(), ChronoUnit.MILLIS);
        }
    }
}
```

:::note A Note on TLS
The `https::` prefix in the connection string tells the client to connect using TLS. By default, the client will verify
the server's certificate. For local testing with self-signed certificates, you can disable this validation by adding
`tls.verify=insecure;` to the configuration string. **This is not recommended for production.**
:::

Connecting a client to ILP is a common path.

However, you may use something like [Kafka](/docs/ingestion/message-brokers/kafka).

For more on ILP ingestion, see:
- [ILP Overview](/docs/ingestion/ilp/overview/) — Protocol details and configuration
- [Ingestion Overview](/docs/ingestion/overview/) — Client libraries and ingestion methods

## 5. Ingest data, Kafka Connect (optional)

_If you're not using Kafka, you can skip to section 6._

The official **QuestDB Kafka Connect sink** forwards messages from Kafka topics directly to your database using ILP protocol.
The setup process is straightforward:

1. Create a dedicated service account in QuestDB.
2. Generate an authentication token for the account.
3. Configure the Kafka sink connector with your QuestDB address and the token.

### **Step 1: Create the Service Account**

In the QuestDB web console, create a service account named `kafka` and grant it the permissions required to connect and
write data.

```questdb-sql title="Web Console - Create a Kafka service account"
CREATE SERVICE ACCOUNT kafka;

-- Grant permissions to use HTTP, create tables, add new columns and insert data
GRANT HTTP, CREATE TABLE TO kafka;
GRANT ADD COLUMN, INSERT ON ALL TABLES TO kafka;

-- OR, for more granular control:
-- GRANT ADD COLUMN, INSERT ON table1, table2 TO ingest_ilp;
```

### **Step 2: Generate an Authentication Token**

Next, generate a REST API token for the `kafka` service account. This token is a secret credential and should be treated like a
password.

```questdb-sql title="Web Console - Generate a token for the service account"
-- Creates a token that is valid for 1 year (365 days)
ALTER SERVICE ACCOUNT kafka CREATE TOKEN TYPE REST WITH TTL '365d';
```

The command returns a token. **Copy it immediately**, as it will not be shown again.

| name  | token                                            | expires\_at                   |
|-------|--------------------------------------------------|-------------------------------|
| kafka | `qt1KAsf1U9YbUVAX1H2IahXEE3-4qBcK-zx_jsZUzV9bLY` | `2026-07-03T18:05:00.000000Z` |

Save the private key in a secure location!

### **Step 3: Configure the Kafka Connect Sink**

Create a configuration file for the QuestDB sink connector. In the `client.conf.string` property, provide your QuestDB
server address and paste the token you just generated.

```properties title="questdb-sink.properties"
# --- Connector Identity ---
name=QuestDBSinkConnector
connector.class=io.questdb.kafka.QuestDBSinkConnector
tasks.max=1

# --- Source Kafka Topic ---
topics=your_kafka_topic

# --- QuestDB Connection ---
# Use https:: if your QuestDB server has TLS enabled.
# Replace the placeholder with the token you generated.
client.conf.string=https::addr=localhost:9000;token=qt1KAsf1U9YbUVAX1H2IahXEE3-4qBcK-zx_jsZUzV9bLY;

# --- Optional: Data Mapping ---
# Use a field from the Kafka message key or value as a QuestDB symbol.
# symbol.columns=device_id
```

Once you deploy this configuration, the connector will start sending data from your Kafka topic to QuestDB. If you
encounter any issues, check the logs for both your Kafka Connect worker and your QuestDB server for more details.

See the [QuestDB Kafka Connector documentation](/docs/ingestion/message-brokers/kafka/#questdb-kafka-connect-connector) for more details
on the configuration options and how to set up the connector.

## 6. Query data, PostgreSQL query

Now onto querying.

We will demonstrate programmatic querying via the PostgreSQL interface.

Again, in this case we recommend a unique user or a service account.

We will create a service account named "dashboard".

We'd assume that this is Grafana or a similar visual data representation
application.

To setup the service account:

```questdb-sql title="Web Console - Create a service account called 'dashboard' and grant permissions"
CREATE SERVICE ACCOUNT dashboard WITH password 'pwd';
GRANT pgwire TO dashboard;
GRANT select on all tables TO dashboard;
```

Applying Java & jdbc, we can setup a client to query.

We're providing a username and password instead of a token:

```java title="Java - Querying via JDBC"
import java.sql.*;
import java.util.Properties;

public class App {
    public static void main(String[] args) throws SQLException {
        Properties properties = new Properties();
        properties.setProperty("user", "dashboard");
        properties.setProperty("password", "pwd");
        properties.setProperty("sslmode", "require");

        final Connection connection = DriverManager.getConnection(
            "jdbc:postgresql://localhost:8812/qdb", properties);
        try (PreparedStatement preparedStatement = connection.prepareStatement(
                "SELECT x, timestamp_sequence('2023-07-20', 1000000) FROM long_sequence(5);")) {
            try (ResultSet rs = preparedStatement.executeQuery()) {
                while (rs.next()) {
                    System.out.println(rs.getLong(1));
                    System.out.println(rs.getTimestamp(2));
                }
            }
        }
        connection.close();
    }
}
```

This covers the very basics of user creation and service accounts.

We have an `ingest` service account and a `dashboard` service account.

For more on querying, see:
- [PostgreSQL Wire Protocol](/docs/query/pgwire/overview/) — Connection details and compatibility
- [Query & SQL Overview](/docs/query/overview/) — SQL syntax and functions

> For the full role-based access control docs, including group management, see
> the [RBAC operations guide](/docs/security/rbac/).

Next, we will enable Enterprise-specific features.

## 7. Setup replication

[Replication](/docs/high-availability/overview/) consists of:

- a primary database instance
- an object storage
- any number of replica instances

The primary instance uploads its Write Ahead Log (WAL) to the object storage,
and the replica instances apply the same data to their tables by downloading and
processing the WAL.

Full instructions can be found within the
[replication page](/docs/high-availability/setup/), however the key parts are:

1. _Setup the object storage_: Supported options are Azure Blob Storage, Amazon
   S3 or Network File Storage (NFS).
1. _Set up a primary node_: Alter the `server.conf` within the primary-to-be and
   create a snapshot of the database.
1. _Setting up a replica node_: Alter the `server.conf` in the replica(s)-to-be
   and perform "recovery" from the snapshot of the primary database. The
   snapshot provides a starting point for the instance, which will soon catch up
   with the primary node.

## 8. Enable compression

Compression requires the
[Zettabyte File System (ZFS)](https://openzfs.org/wiki/Main_Page).

We'll assume Ubuntu, and demonstrate the basics CLI commands which you'd apply
in something like an AWS EC2 to enable ZFS:

```bash title="Ubuntu - Install ZFS"
sudo apt update
sudo apt install zfsutils-linux
```

To enable compression, create a ZPool with compression enabled:

```shell title="Ubuntu - Enable compression"
zpool create -m legacy -o feature@lz4_compress=enabled autoexpand=on -O compression=lz4 -t volume1 questdb-pool sdf
```

The exact commands depend on which version of ZFS you are running. Use the
[ZFS docs](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-create.8.html)
to customize your ZFS to meet your requirements.

If you are running QuestDB Enterprise in Kubernetes, QuestDB offers a
[Container Storage Interface](https://github.com/container-storage-interface/spec/blob/master/spec.md)
(CSI) Driver to create ZFS volumes in your cluster.

Please contact us for more information to see if your version and distribution
of Kubernetes is supported.

For more on storage and compression, see [Enable compression with ZFS](/docs/deployment/compression-zfs/).

## 9. Double-check kernel limits

QuestDB works together with your server operating system to achieve maximum
performance. Prior to putting your server under heavy loads, consider checking
your
[kernel-based limitations](/docs/getting-started/capacity-planning/#os-configuration).

Specifically, increase the limits for how many files can be opened by your OS
and its users, and the maximum amount of virtual memory allowed. This helps
QuestDB operate most effectively.

## Next steps

This guide has prepared you for reliable, production-ready usage of QuestDB
Enterprise.

If you're new to QuestDB, consider checking out:

- [Ingestion overview](/docs/ingestion/overview/): Learn the various ingestion
  methods and their benefits and tradeoffs, and pick a language client.
- [Query & SQL overview](/docs/query/overview/): Learn how to query
  QuestDB.

Otherwise, enjoy!

## FAQ

### General Setup and Configuration

**Q: How do I change the default administrator password?**

A: To change the default administrator password, update your `server.conf` file
with the following lines, replacing `myadmin` and `my_very_secure_pwd` with your
chosen administrator username and a secure password:

```bash
acl.admin.user=myadmin
acl.admin.password=my_very_secure_pwd
```

**Q: What should I do if I encounter errors during the TLS setup process?**

A: If you encounter errors during the TLS setup, ensure that the certificate and
private key paths are correctly specified in your `server.conf` file. Also,
verify that your certificates are valid and not expired. For further
troubleshooting, consult the [TLS operations](/docs/security/tls/)
documentation.

### Security and Access Control

**Q: Can I recover a lost private key for a service account?**

A: No, once a private key for a service account is generated, it cannot be
retrieved again. It is crucial to store it securely immediately upon creation.
If lost, you will need to generate a new token for the service account.

**Q: How do I securely manage service account tokens?**

A: Securely managing service account tokens involves storing them in a safe
location, such as a secure secrets management tool. Limit the distribution of
these tokens and regularly rotate them to enhance security.

### Ingestion and Querying

**Q: What should I do if data ingestion via Kafka Connect fails?**

A: If data ingestion via Kafka Connect fails, check your service account
permissions and ensure the private key used in Kafka's configuration matches the
one generated for your service account. Also, verify your network settings and
ensure there are no connectivity issues between Kafka and QuestDB.

**Q: How can I troubleshoot issues with querying data using the PostgreSQL
interface?**

A: Ensure the service account or user has the correct permissions to query the
tables of interest. Verify the connection string and authentication details used
in your client application. For issues related to SSL, make sure the SSL mode is
appropriately configured in your client connection settings.

### Replication and Compression

**Q: What steps should I take if replication is not working as expected?**

A: Verify that the object storage is correctly set up and accessible by the
primary instance. Ensure the `server.conf` settings for replication are
correctly configured on both the primary and replica nodes. Check the logs for
any errors related to replication and ensure there's network connectivity
between all involved parties.

**Q: Compression is enabled, but I'm not observing reduced storage usage. What
could be the issue?**

A: Ensure that the ZFS filesystem is correctly configured with compression
enabled. Note that the actual compression ratio achieved can vary significantly
depending on the nature of your data. Some types of data may not compress well.
Review the ZFS compression statistics to understand the compression level being
achieved. If it seems out of expected range, please contact us.
