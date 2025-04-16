---
title: Enterprise quick start
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

- [Requirements](#requirements)
- [0. Secure the built in admin](#0-secure-the-built-in-admin)
- [1. Setup TLS](#1-setup-tls)
- [2. Setup a database administrator](#2-setup-a-database-administrator)
- [3. Create interactive user accounts](#3-create-interactive-user-accounts)
- [4. Ingest data, InfluxDB Line Protocol](#4-ingest-data-influxdb-line-protocol)
- [5. Ingest data, Kafka Connect (optional)](#5-ingest-data-kafka-connect-optional)
- [6. Query data, PostgreSQL query](#6-query-data-postgresql-query)
- [7. Setup replication](#7-setup-replication)
- [8. Enable compression](#8-enable-compression)
- [9. Double-check kernel limits](#9-double-check-kernel-limits)
- [Next steps](#next-steps)
- [FAQ](#faq)

---

## Requirements

The following are required prior to following this guide:

- QuestDB Enterprise binary with an active license
  - No license? [Contact us](/enterprise/contact/) for more information.
- Use of a [supported file system](/docs/operations/capacity-planning/#supported-filesystems)
  - A [Zettabyte File System (ZFS)](https://openzfs.org/wiki/Main_Page) is recommended to enable compression

## Installation guide

Changes take place in your `conf/server.conf` file, the QuestDB [Web Console](/docs/web-console/),
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

## 1. Setup TLS

QuestDB supports TLS versions 1.2 and 1.3.

To configure TLS on all interfaces, set the following:

```bash title="server.conf - Changing cert paths"
tls.enabled=true
tls.cert.path=/path/to/certificate.pem
tls.private.key.path=/path/to/private_key
```

To hot-reload the certificate and private key and update the files on disk,
login to your QuestDB [Web Console](/docs/web-console/). This is accessible by default at
[localhost:9000](http://localhost:9000). Login using the built-in administrator
credential.

Then, execute:

```questdb-sql title="Web Console - Reloading TLS"
SELECT reload_tls();
```

TLS is now active.

For more details on TLS see the
[TLS operations documentation](/docs/operations/tls/).

## 2. Setup a database administrator

The built-in admin aids in the first mile, and as needed on a recovery basis.

A helpful practice is to have one created admin through which to setup other
accounts.

Create a new database admin:

```sql title="Web Console - Creating an admin; use your own, secure password!"
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

Interactive users may utilize the [Web Console](/docs/web-console/) and/or the Postgres querying
clients. It is common practice to set them up as `readonly`. But how you setup
these users or groups is up to you.

For ingestion, we'll cover that in the next section. Consider this first wave of
users your "database consumers".

For permissions, the [Web Console](/docs/web-console/) requires `HTTP`, and the PostgreSQL interface
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
  the [RBAC operations guide](/docs/operations/rbac/).

- For a full list of available permissions, see the
  [permissions sub-section in the RBAC operations guide](/docs/operations/rbac/#permissions).

## 4. Ingest data, InfluxDB Line Protocol

Perform data ingestion through a service account or an interactive user. Service
accounts are recommended over users, as they apply a cleaner set of access
permissions, and are less likely to be affected by day-to-day user management
operations.

First, set up the service account. Then, use it to create a token which is
associated with the service account. This token is then provided to your
InfluxDB client to form a secure, access-controlled connection.

A service account is "an account for a service". This is in contrast to an
account for a user. When service accounts are created, we assume that they
belong to an organization and not an individual. Your sensors, apps or cars may
use service accounts. Sam, the plucky analyst, may have an interactive user.

The recommended ingestion method is via the InfluxDB Line Protocol (ILP).

To setup a service account:

```questdb-sql title="Web Console - Setup a service account"
CREATE SERVICE ACCOUNT ingest;
GRANT ilp, create table TO ingest;
GRANT add column, insert ON all tables TO ingest;
--  OR
GRANT add column, insert ON table1, table2 TO ingest;
```

This creates a service account called `ingest`, which:

- Can create a table
- Add table columns
- Insert to all tables OR insert to specific tables

The account exists, and that means that a client of some kind can connect to
QuestDB via that account. Next, create a token to create a secure link between
the client and the account:

```questdb-sql title="Web Console - Generate a token for ingest client"
ALTER SERVICE ACCOUNT ingest CREATE TOKEN TYPE JWK;
```

This creates a token comprised of three parts:

- public_key_x
- public_key_y
- private_key

| name   | public_key_x                               | public_key_y                               | private_key                                 |
| ------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------- |
| ingest | gxVbx90=MtYMmIEek2L5jFa5e9qTIvxI2TKSfI3GVE | kEUZjIfU9=S6w6uR=j130v003YgB3NBpYcVswvvacs | kom7j38LG44HcPfO92oZ4558e6KoeTHn6H5rA8vK3PQ |

Now, this private key is then added to the client.

This provides authenticated access to QuestDB for the "ingest" user.

For example, if you are leveraging Java and our recommended InfluxDB Line Protocol over HTTP client:

```java
Java client example:

import io.questdb.client.Sender;
import java.time.temporal.ChronoUnit;

public class ILPMain {
    public static void main(String[] args) {
        try (Sender sender = Sender.builder(Sender.Transport.HTTP)
                .address("localhost:9000")
                .enableTls()
                .enableAuth("ingest")
                .authToken("kom7j38LG44HcPfO92oZ4558e6KoeTHn6H5rA8vK3PQ")
                .build()) {

            sender.table("ilptest");
            sender.symbol("sym1", "symval1")
                  .doubleColumn("double1", 100.0)
                  .at(System.currentTimeMillis(), ChronoUnit.MILLIS);
        }
    }
}
```

Please note that the private key is not stored in the database.

There is **no way to get your private key back** at a later time!

Once generated, safely store it.

Connecting a client to ILP is a common path.

However, you may use something like [Kafka](/docs/third-party-tools/kafka).

## 5. Ingest data, Kafka Connect (optional)

_If you're not applying Kafka, skip to step 6._

The
[Kafka Connect](https://docs.confluent.io/platform/current/connect/index.html)
connector can be thought of as a specialized ILP client.

Thus the steps are similar to ILP ingestion:

1. Create a Kafka service account and assign permissions
1. Configure the connector to use the service account

```questdb-sql title="Web Console - Create a service account and grant required permissions"
CREATE SERVICE ACCOUNT kafka;
GRANT ilp, create table TO kafka;
GRANT add column, insert ON all tables TO kafka;
    OR
GRANT add column, insert ON table1, table2 to kafka;
```

```questdb-sql title="Web Console - Generate a token for the service account"
ALTER SERVICE ACCOUNT kafka CREATE TOKEN TYPE JWK;
```

The token SQL returns a multi-part token, as before:

| name  | public_key_x                              | public_key_y                                | private_key                                   |
| ----- | ----------------------------------------- | ------------------------------------------- | --------------------------------------------- |
| kafka | uE3MxG5_PMTor0V40LIBNTaUv-xh0dMPRN83nsQUI | 73wq8nx02Pj6W6yt53VxFT9K-TnopdM0s0UeeBxTgb0 | tDNC3DJ_L_QYIZRu_L4S4YTZYZXbjr7JX_bxFYdHhhhQU |

Remember, the private key cannot be retrieved.

Save the private key in a secure location!

Next, configure the username, token and TLS settings inside of Kafka:

```bash title="Kafka Connect - Configuring the QuestDB Kafka connector"
username=kafka
token=[the private key saved in the previous step]
tls=true

# If QuestDB server does not use trusted certificates
# then you have to disable TLS validation
# This is recommended for testing purposes only,
# In production, use a QuestDB server certificate trusted
# by your Kafka Connect installation
tls.validation.mode=insecure

# Rest of the Kafka config
host=localhost
topics=example-topics
table=example-table
```

Can't connect? Check within your server logs.

## 6. Query data, PostgreSQL query

Now onto querying.

We will demonstrate programmatic querying via the PostgreSQL interface.

Again, in this case we recommend a unique user or a service account.

We will create a service account named "dashboard".

We'd assume that this is Grafana or a similar visual data representation
application.

To setup the service account:

```sql title="Web Console - Create a service account called "dashboard" and grant permissions"
CREATE SERVICE ACCOUNT dashboard WITH password 'pwd';
GRANT pgwire TO dashboard;
GRANT select on all tables TO dashboard;
```

Applying Java & jdbc, we can setup a client to query.

We're providing a username and password instead of a token:

```java
Java client example:

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

> For the full role-based access control docs, including group management, see
> the [RBAC operations guide](/docs/operations/rbac/).

Next, we will enable Enterprise-specific features.

## 7. Setup replication

[Replication](/docs/concept/replication/) consists of:

- a primary database instance
- an object storage
- any number of replica instances

The primary instance uploads its Write Ahead Log (WAL) to the object storage,
and the replica instances apply the same data to their tables by downloading and
processing the WAL.

Full instructions can be found within the
[replication page](/docs/operations/replication/), however the key parts are:

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

## 9. Double-check kernel limits

QuestDB works together with your server operating system to achieve maximum
performance. Prior to putting your server under heavy loads, consider checking
your
[kernel-based limitations](/docs/operations/capacity-planning/#os-configuration).

Specifically, increase the limits for how many files can be opened by your OS
and its users, and the maximum amount of virtual memory allowed. This helps
QuestDB operate most effectively.

## Next steps

This guide has prepared you for reliable, production-ready usage of QuestDB
Enterprise.

If you're new to QuestDB, consider checking out:

- [Ingestion overview](/docs/ingestion-overview/): Learn the various ingestion
  methods and their benefits and tradeoffs, and pick a language client.
- [Query & SQL overview](/docs/reference/sql/overview/): Learn how to query
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
troubleshooting, consult the [TLS operations](/docs/operations/tls/)
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
