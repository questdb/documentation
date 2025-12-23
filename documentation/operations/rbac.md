---
title: Role-based Access Control (RBAC)
description:
  Granular access control list. Learn how permissions and access control works
  in QuestDB, and see examples.
---

import Screenshot from "@theme/Screenshot"

Describes role-based access control (RBAC), authentication and authorization in
QuestDB.

This document provides the context to setup a robust Access Control List in
QuestDB.

It covers:

- A [conceptual overview](/docs/operations/rbac/#rbac-conceptual-review)
- [Permission reference](/docs/operations/rbac/#permissions) with
  [examples](/docs/operations/rbac/#permission-levels)
- Full list of related
  [SQL statements](/docs/operations/rbac/#full-sql-grammar-list)
- Special cases such as within the
  [built-in admin](/docs/operations/rbac/#built-in-admin-1)

:::note

Role-based Access Control (RBAC) is available in QuestDB Enterprise.

:::

## RBAC conceptual review

### User and service accounts

QuestDB's access control system applies both _user_ and _service accounts_.
Users and service accounts are the entities that can be authenticated, then
authorized to perform operations in the database.

Although users and service accounts look similar, they are fundamentally
different:

- A user generally belongs to an individual. Individuals are often part of a
  team or a department of an organization.

- A service account generally belongs to an org. A service account is suited for
  an application accessing the database.

Organizational units, such as teams or departments are represented by _groups_.
Users can be associated with multiple groups at the same time. Members of a team
often require the same permissions - a group of analysts, for example. As a
consequence, both users and groups can be granted permissions. Users inherit
permissions from the groups with which they are associated.

Service accounts, on the other hand, do not inherit permissions from anywhere.
All permissions required by the application accessing the database must be
granted directly to the service account. This is because applications work with
the data programmatically, so their access is usually more restrictive than the
permissions of a user or a group. For example, a service account would not
usually need to create and drop database tables, while users are often granted
this ability.

The below diagram is an example of a QuestDB access control system. Inherited
permissions are shown in grey colour:

<!-- This image is used also at the questdb-internals page. Please keep in sync -->

<Screenshot
  alt="Diagram showing users, service accounts and groups in QuestDB"
  title="Users, service accounts and groups"
  src="images/docs/acl/users_service_accounts_groups.webp"
  width={745}
/>

Based on the above, service accounts seem to be very isolated entities. But you
might have already noticed the appearance of the above `ASSUME SERVICE ACCOUNT`
permission.

Applications are usually owned by teams or a group of individuals. Hence,
service accounts can be linked to a number of users and/or groups by granting
them this permission. Being able to _assume a service account_ means that a user
can switch to the access list of the service account from their own account.
This concept provides a great way of debugging access control related bugs in an
application, and also controls who can see the permissions of a service account.

Ultimately, users are granted a set of permissions, either directly or
indirectly via groups. The overall set of permissions granted to them forms
their _access control list_. This list governs their authorization, what they
can and cannot do.

The diagram below shows the authentication and authorization flow in QuestDB:

<Screenshot
  alt="Diagram shows authentication and authorization flow in QuestDB"
  title="Authentication and authorization flow"
  src="images/docs/acl/auth_flow.webp"
  width={745}
/>

### Authentication

Users must authenticate themselves before they perform any database operations.
Authentication is required to determine an identity, and then subsequently to
find their access control list.

Authentication must happen via a [secure TLS connection](/docs/operations/tls),
otherwise the user's secrets used for authentication will travel unencrypted.

QuestDB supports three different ways of authentication:

- **Password**: The user is required to provide their credentials for successful
  authentication. An initial password can be set when the user is created. This
  password should be modified by the user after their first successful login.
  Only a single password can be set for a user; there is no option to have
  multiple passwords at the same time. Password authentication is supported by
  the [REST](/docs/reference/api/rest/#authentication-rbac) and the
  [PostgreSQL Wire](/docs/pgwire/pgwire-intro/) endpoints.
- **JWK Token**: The user is required to provide a JWK token. The private key of
  the token is tested against their public key which has been recorded
  previously in the database. Only a single token can be set for a user; there
  is no option to have multiple tokens at the same time. JWK token
  authentication is supported by the
  [InfluxDB Line Protocol (ILP)](/docs/reference/api/ilp/overview/#authentication)
  endpoint.
- **REST API Token**: The user is required to provide a REST API token. The
  token is tested against other tokens that were previously generated in the
  database. A user may have multiple REST API tokens. REST API token
  authentication is supported by the
  [REST](/docs/reference/api/rest/#authentication-rbac) endpoint.

Users and service accounts can have both password and token authentication
enabled at the same time.

The only exception is QuestDB's built-in admin, which supports only password
authentication. The built-in admin should be used to create the users and groups
initially. More on the [built-in admin](#built-in-admin) later.

### User Management

User management happens via
[SQL commands](/docs/operations/rbac/#full-sql-grammar-list).

The `CREATE USER` / `CREATE SERVICE ACCOUNT` commands are used to create new
users and service accounts. These commands also provide the option to specify an
initial password, which should be changed after the first login. The name of the
principal **must be unique** across all users, service accounts and groups. This
is enforced by QuestDB.

```questdb-sql
CREATE USER user0;
CREATE USER user1 WITH PASSWORD pwd1;

CREATE SERVICE ACCOUNT application0;
CREATE SERVICE ACCOUNT application1 WITH PASSWORD pwd1;
```

The list of users can be displayed with the help of the `SHOW USERS` command.

```questdb-sql
SHOW USERS;

name
-----
admin
user0
user1
```

A similar command exists for service accounts too.

```questdb-sql
SHOW SERVICE ACCOUNTS;

name
-----
application0
application1
```

Principals can change their password with the help of the `ALTER USER` /
`ALTER SERVICE ACCOUNT` commands.

```questdb-sql
ALTER USER user1 WITH PASSWORD pwd2;

ALTER SERVICE ACCOUNT application1 WITH PASSWORD pwd2;
```

JWK tokens can be used for authentication too. The `ALTER` command can be used
to create a new JWK token.

```questdb-sql
ALTER USER user1 CREATE TOKEN TYPE JWK;

ALTER SERVICE ACCOUNT application1 CREATE TOKEN TYPE JWK;
```

The output of the command is the public and private keys of the principal. The
keys should be copied and stored safely by the user. QuestDB **does not** store
the private key. If the private key is lost, **it cannot be recovered**. A new
token must be generated. If the above command is repeated, the token gets
replaced with a new one.

As mentioned earlier, REST API tokens can be used for authentication as well.
The `ALTER` command can be used to create a new REST API token:

```questdb-sql
ALTER USER user1 CREATE TOKEN TYPE REST WITH TTL '30d';

ALTER SERVICE ACCOUNT application1 CREATE TOKEN TYPE REST WITH TTL '1d' REFRESH;
```

The output of the command is the generated token. The token should be copied and
stored safely by the user. QuestDB **does not** store the token. If the token is
lost, **it cannot be recovered**. A new token must be generated. If the above
command is repeated, a new token gets generated, but all generated tokens will
remain valid.

Check which authentication mode is enabled for a user with the `SHOW USER`
command:

```questdb-sql
SHOW USER user1;

auth_type   enabled
---------   -------
Password    true
JWK Token   false
REST Token  false
```

A similar command exists for service accounts too:

```questdb-sql
SHOW SERVICE ACCOUNT application1;

auth_type   enabled
---------   -------
Password    false
JWK Token   true
REST Token  false
```

Passwords and tokens also can be removed with the help of `ALTER`:

```questdb-sql
ALTER USER user1 WITH NO PASSWORD;
ALTER USER user1 DROP TOKEN TYPE JWK;
-- drop single REST API token
ALTER USER user1 DROP TOKEN TYPE REST 'qt1cNK6s2t79f76GmTBN9k7XTWm5wwOtF7C0UBxiHGPn44';
-- drop all REST API tokens for the given user
ALTER USER user1 DROP TOKEN TYPE REST;

ALTER SERVICE ACCOUNT application1 WITH NO PASSWORD;
ALTER SERVICE ACCOUNT application1 DROP TOKEN TYPE JWK;
ALTER SERVICE ACCOUNT application1 DROP TOKEN TYPE REST;
```

By removing all secrets, the user is essentially disabled. They cannot access
the database anymore.

If we wanted to remove the user entirely, we can use the `DROP USER` /
`DROP SERVICE ACCOUNT` statements:

```questdb-sql
DROP USER user1;

DROP SERVICE ACCOUNT application1;
```

Related SQL commands:

- [CREATE USER](/docs/reference/sql/acl/create-user)
- [CREATE SERVICE ACCOUNT](/docs/reference/sql/acl/create-service-account)
- [ALTER USER](/docs/reference/sql/acl/alter-user)
- [ALTER SERVICE ACCOUNT](/docs/reference/sql/acl/alter-service-account)
- [DROP USER](/docs/reference/sql/acl/drop-user)
- [DROP SERVICE ACCOUNT](/docs/reference/sql/acl/drop-service-account)
- [SHOW USERS](/docs/reference/sql/show/#show-users)
- [SHOW SERVICE ACCOUNTS](/docs/reference/sql/show/#show-service-accounts)
- [SHOW USER](/docs/reference/sql/show/#show-user)
- [SHOW SERVICE ACCOUNT](/docs/reference/sql/show/#show-service-account)

### Managing Groups

Groups are a great tool to reduce the burden of user management. They help
_group_ people together when many users require the same or similar permissions.

The `CREATE GROUP` command is used to create new groups.

```questdb-sql
CREATE GROUP group1;
CREATE GROUP group2;
```

To avoid confusion, the name of the group **must be unique** across all users,
service accounts and groups.

The list of groups can be displayed with the help of the `SHOW GROUPS` command:

```questdb-sql
SHOW GROUPS;

name
------
group1
group2
```

Users can be added to or removed from groups:

```questdb-sql
ADD USER user1 TO group1;
REMOVE USER user1 FROM group2;
```

Users of a group inherit the permissions granted to the group.

:::note

Permissions inherited from groups cannot be revoked directly from the user.

:::

We can check the groups of a user with the `SHOW GROUPS` command:

```questdb-sql
SHOW GROUPS user1;

name
------
group1
```

Groups can be deleted with `DROP GROUP`:

```questdb-sql
DROP GROUP group2;
```

If a group is deleted, **all users of the group lose the permissions they
previously inherited** from the group.

Related SQL commands:

- [CREATE GROUP](/docs/reference/sql/acl/create-group)
- [DROP GROUP](/docs/reference/sql/acl/drop-group)
- [ADD USER](/docs/reference/sql/acl/add-user)
- [REMOVE USER](/docs/reference/sql/acl/remove-user)
- [SHOW GROUPS](/docs/reference/sql/show/#show-groups)

### Built-in admin

A new QuestDB instance starts with a single user, which is the built-in admin.
The default built-in admin settings are:

- Username: `admin`
- Password: `quest`

It is **strongly recommended** that the built-in admin's password and all other
default password are changed via QuestDB's
[server configuration](/docs/configuration/) before the instance is started.

**Please remember to change both the admin's username and password!**

The following property keys are used to configure the built-in admin in
`server.conf`:

```shell
# only needed if the built-in admin has been disabled previously
# the admin is enabled by default
acl.admin.user.enabled=true

# the built-in admin's user name and password
acl.admin.user=myadmin
acl.admin.password=mypwd
```

The built-in admin has all permissions granted by default. Its access cannot be
modified. It is root.

After startup we can use the built-in admin to create new users, service
accounts and groups with different set of permissions.

It is recommended that one or more database administrators are created by
granting `ALL` or the `DATABASE ADMIN` permission to them.
After the database administrators are setup, the built-in admin should be
disabled in the configuration files.
The following property key is used to enable/disable the built-in admin in
server.conf:

```shell
# disable built-in admin
acl.admin.user.enabled=false
```

## Permissions

Permissions are the building blocks of access lists, and determine what a user
can or cannot do. They can be granted to users, service accounts and groups,
allowing them to access specific functionality.

First, learn to list all permissions.

Next, we'll unpack the depths of database, table & column permission levels.

### List all permissions

Use the `all_permissions()` function to review all permissions of the access control system.

```questdb-sql
select * from all_permissions();
```

#### Database permissions

| permission                | level                               | description                                                                                                                                                               |
|---------------------------|-------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ADD COLUMN                | Database &#124; Table               | Allows adding new column to existing table in rest api and pg wire protocol.                                                                                              |
| ADD INDEX                 | Database &#124; Table &#124; Column | Allows adding an index on symbol column.                                                                                                                                  |
| ALTER COLUMN CACHE        | Database &#124; Table &#124; Column | Allows disabling or enabling caching of symbol column values via ALTER TABLE command.                                                                                     |
| ALTER COLUMN TYPE         | Database &#124; Table &#124; Column | Allows changing the type of columns via ALTER TABLE command.                                                                                                              |
| ATTACH PARTITION          | Database &#124; Table               | Allows attaching partition to existing table.                                                                                                                             |
| BACKUP DATABASE           | Database                            | Allows creating database backup via BACKUP DATABASE command.                                                                                                              |
| BACKUP TABLE              | Database &#124; Table               | Allows creating table BACKUP TABLE command.                                                                                                                               |
| CANCEL ANY COPY           | Database                            | Allows cancelling running COPY command via COPY importId CANCEL command.                                                                                                  |
| CREATE TABLE              | Database                            | Allows creating tables.                                                                                                                                                   |
| CREATE MATERIALIZED VIEW  | Database                            | Allows creating materialized views.                                                                                                                                       |
| DEDUP ENABLE              | Database &#124; Table               | Allows enabling deduplication and setting of upsert keys.                                                                                                                 |
| DEDUP DISABLE             | Database &#124; Table               | Allows disabling deduplication.                                                                                                                                           |
| DETACH PARTITION          | Database &#124; Table               | Allows detaching partitions from tables.                                                                                                                                  |
| DROP COLUMN               | Database &#124; Table &#124; Column | Allows dropping table columns.                                                                                                                                            |
| DROP INDEX                | Database &#124; Table &#124; Column | Allows dropping symbol columns indexes via ALTER TABLE command.                                                                                                           |
| DROP PARTITION            | Database &#124; Table               | Allows dropping or squashing existing table partitions.                                                                                                                   |
| DROP TABLE                | Database &#124; Table               | Allows dropping tables.                                                                                                                                                   |
| DROP MATERIALIZED VIEW    | Database &#124; Table               | Allows dropping materialized views.                                                                                                                                       |
| INSERT                    | Database &#124; Table               | Allows inserting data into table columns.                                                                                                                                 |
| REFRESH MATERIALIZED VIEW | Database &#124; Table               | Allows refreshing/rebuilding materialized views.                                                                                                                          |
| REINDEX                   | Database &#124; Table &#124; Column | Allows reindexing table's columns.                                                                                                                                        |
| RENAME COLUMN             | Database &#124; Table &#124; Column | Allows renaming columns.                                                                                                                                                  |
| RENAME TABLE              | Database &#124; Table               | Allows renaming tables.                                                                                                                                                   |
| RESUME WAL                | Database &#124; Table               | Allows resuming WAL processing via ALTER TABLE RESUME WAL command.                                                                                                        |
| SELECT                    | Database &#124; Table &#124; Column | Allows selecting/reading table or column data.                                                                                                                            |
| SET TABLE PARAM           | Database &#124; Table               | Allows setting table parameters via ALTER TABLE SET PARAM command.                                                                                                        |
| SET TABLE TYPE            | Database &#124; Table               | Allows changing table type via ALTER TABLE SET TYPE command.                                                                                                              |
| SETTINGS                  | Database                            | Allows changing database instance properties (name, colour and description) via the Web Console.                                                                          |
| SNAPSHOT                  | Database                            | Allows preparing database snapshot.                                                                                                                                       |
| SQL ENGINE ADMIN          | Database                            | Allows the listing of currently running queries, and cancelling them via CANCEL QUERY command.                                                                            |
| SYSTEM ADMIN              | Database                            | Allows the execution of various system related functions, such as reload_tls(), dump_memory_usage(), dump_thread_stacks(), flush_query_cache(), hydrate_table_metadata(). |
| TRUNCATE TABLE            | Database &#124; Table               | Allows truncating tables.                                                                                                                                                 |
| UPDATE                    | Database &#124; Table &#124; Column | Allows updating table columns.                                                                                                                                            |
| VACUUM TABLE              | Database &#124; Table               | Allows reclaiming storage via VACUUM TABLE command.                                                                                                                       |

#### User management permissions

| permission             | level    | description                                                                                    |
|------------------------|----------|------------------------------------------------------------------------------------------------|
| ADD EXTERNAL ALIAS     | Database | Allows creating external group mappings in CREATE GROUP and ALTER GROUP commands.              |
| ADD PASSWORD           | Database | Allows setting user password in CREATE USER and ALTER USER commands.                           |
| ADD USER               | Database | Allows adding user to group(s).                                                                |
| CREATE GROUP           | Database | Allows creating groups.                                                                        |
| CREATE JWK             | Database | Allows creating JWK tokens via ALTER USER command.                                             |
| CREATE REST TOKEN      | Database | Allows creating REST API tokens via ALTER USER command.                                        |
| CREATE SERVICE ACCOUNT | Database | Allows creating service accounts.                                                              |
| CREATE USER            | Database | Allows creating users.                                                                         |
| DISABLE USER           | Database | Allows disabling users.                                                                        |
| DROP GROUP             | Database | Allows dropping groups.                                                                        |
| DROP JWK               | Database | Allows dropping JWK tokens via ALTER USER command.                                             |
| DROP REST TOKEN        | Database | Allows dropping REST API tokens via ALTER USER command.                                        |
| DROP SERVICE ACCOUNT   | Database | Allows dropping service accounts.                                                              |
| DROP USER              | Database | Allows dropping users.                                                                         |
| ENABLE USER            | Database | Allows enabling users.                                                                         |
| LIST USERS             | Database | Allows listing user details in SHOWS GROUPS, SHOW SERVICE ACCOUNTS and SHOW USERS.             |
| REMOVE EXTERNAL ALIAS  | Database | Allows removing external group mappings via ALTER GROUP command.                               |
| REMOVE PASSWORD        | Database | Allows setting no password via WITH NO PASSWORD clause in CREATE USER and ALTER USER commands. |
| REMOVE USER            | Database | Allows removing user from group(s).                                                            |
| USER DETAILS           | Database | Applies to SHOW USER, SHOW SERVICE ACCOUNTS, SHOW PERMISSIONS, SHOW GROUPS commands.           |

#### Database endpoint permissions

| permission | level    | description                                                                                                                    |
|------------|----------|--------------------------------------------------------------------------------------------------------------------------------|
| HTTP       | Database | Allows access to the REST API endpoint, this includes connection from the [Web Console](/docs/web-console/) and ILP over HTTP. |
| ILP        | Database | Allows access to the InfluxDB Line Protocol (ILP) endpoint.                                                                    |
| PGWIRE     | Database | Allows access to the Postgres Wire endpoint.                                                                                   |

#### Permission groups

Currently only the `ALL` permission group supported.

| permission | level                               | description                                                                                                                                                                 |
|------------|-------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ALL        | Database &#124; Table &#124; Column | All permissions on any (database, table or column) level. It does not include permissions added to QuestDB's permission system in the future or to assume service accounts. |

#### Special permissions

| permission     | level    | description                                                                                                                                                                                                                                                  |
|----------------|----------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| DATABASE ADMIN | Database | All permissions, including any permissions introduced in QuestDB in the future. It also grants permission to assume any service account present in the database. When granted with grant options, the user essentially gets the power of the built-in admin. |

Note the values in the `level` column.

### Permission levels

Permissions can be granted on database, table or column levels.

The granularity of a permission determines on which levels it can be granted.
See the table below.

| permission's granularity | grant levels                        |
|--------------------------|-------------------------------------|
| Database                 | Database                            |
| Table                    | Database &#124; Table               |
| Column                   | Database &#124; Table &#124; Column |

Let's look at some examples!

- `BACKUP DATABASE` is a global action, it does not make sense to grant it to
  a specific table or column.

  The backup captures the state of the entire database as a whole, therefore
  this permission has **database** granularity, and _can be granted on database
  level only_.
```questdb-sql
--database level
GRANT BACKUP DATABASE TO user;
```

- `ATTACH PARTITION` makes sense only in the context of a table, because a
  partition is always attached to a table. This permission has **table**
  granularity, and _can be granted on database or table level_.

  When granted to specific tables, the user can attach partitions only to
  the tables specified.

  If granted on database level, the user can attach partitions to any tables
  of the database.
```questdb-sql
--database level
GRANT ATTACH PARTITION ON ALL TABLES TO user;

--table level
GRANT ATTACH PARTITION ON table1, table2 TO user;
```

- `SELECT` works on any level. Data is queried from columns, so this permission
  has **column** granularity, and _can be granted on database, table or column
  level_.

  When granted on specific columns of a table, the user can query only the columns
  specified.

  When granted on a table or on a list of tables, the user can query any data from
  the tables specified.

  If granted on database level, the user can query any column of any table in the
  entire database.
```questdb-sql
--database level
GRANT SELECT ON ALL TABLES TO user;

--table level
GRANT SELECT ON table1 TO user;

--column level
GRANT SELECT ON table1(col1, col4) TO user;
```

Notice the slight variations in syntax when granting permissions on database
level. When permissions with table or column granularity, such as
`ATTACH PARTITION` or `SELECT`, were granted on **database** level,
we used the `ON ALL TABLES` expression to make it obvious that the permission is
granted for the entire database. In the case of `BACKUP DATABASE` this is not
needed.

Functionality related to user management is always granted on **database**
level. However, users are always able to manage their own passwords and tokens,
and view the list of permissions granted to them. Users can also view the
permissions of the groups and service accounts they are associated with.

Related SQL commands:

- [GRANT](/docs/reference/sql/acl/grant)
- [REVOKE](/docs/reference/sql/acl/revoke)
- [SHOW PERMISSIONS](/docs/reference/sql/show/#show-permissions-for-current-user)

### Endpoint permissions

Endpoint permissions are granted on **database** level. They are used to
manage how users and service accounts connect to the database. If endpoint
permissions are not granted, the user or service account cannot access the
database at all.

The table below shows the permission required for each endpoint and protocol
combination.

| Endpoint               | Protocol   | Transport Layer | Port (default) |     | Permission |
|------------------------|------------|-----------------|----------------|-----|------------|
| Web Console            | JSON       | HTTP            | 9000           |     | HTTP       |
| REST API               | JSON, TEXT | HTTP            | 9000           |     | HTTP       |
| ILP over HTTP          | ILP        | HTTP            | 9000           |     | HTTP       |
| InfluxDB Line Protocol | ILP        | TCP             | 9009           |     | ILP        |
| Postgres Wire Protocol | PG Wire    | TCP             | 8812           |     | PGWIRE     |

An example where we create a new user to access the database only via the
Postgres endpoint:

```questdb-sql
CREATE USER user1 WITH PASSWORD pwd1;
GRANT PGWIRE TO user1;
```

### Permission level re-adjustment

An interesting - and perhaps risky - property of granted high level permissions
is that they implicitly provide access to database objects created in the
future. For example, if a user has been granted `SELECT` permission on the
**database** level, the user can query all tables in the database, and also will
access any tables created in the future. Those tables will be part of the
database too!

Let's look at an example:

```questdb-sql
CREATE TABLE table1...;
CREATE TABLE table2...;
CREATE TABLE table3...;
CREATE USER user1...;
GRANT SELECT ON ALL TABLES TO user1;
CREATE TABLE table4...;

SHOW PERMISSIONS user1;

permission	table_name	column_name	grant_option	origin
----------	----------	-----------	------------	------
SELECT		null		null		false			G
```

`user1` has access to all four tables in the database.

When you grant access at the **database** level, it applies to all database
tables. QuestDB does not support an exclusion list, meaning you cannot grant
**database**-level access and then exclude specific tables.

If you revoke access to any table, QuestDB automatically adjusts the permission
level from the **database** level to the individual **table** level. As a
result, revoking access to even a single table will not only remove access to
that specific table, but also to any tables created in the future, unless access
is explicitly granted for each new table.

For example:

```questdb-sql
CREATE TABLE table1...;
CREATE TABLE table2...;
CREATE TABLE table3...;
CREATE USER user1...;
GRANT SELECT ON ALL TABLES TO user1;
REVOKE SELECT ON table1 FROM user1;
CREATE TABLE table4...;

SHOW PERMISSIONS user1;

permission	table_name	column_name	grant_option	origin
----------	----------	-----------	------------	------
SELECT		table2		null		false			G
SELECT		table3		null		false			G
```

Now `user1` has access to `table2` and `table3` only. The revoke statement
re-adjusted the **database** level permission to **table** level, meaning it
revoked `SELECT` on **database** level and granted it to `table2` and `table3`
only.

If we want the user to access the newly created `table4`, we must grant access
explicitly:

```questdb-sql
GRANT SELECT ON table4 TO user1;
```

Permission re-adjustment can also happen when a permission is granted on
**table** level, but then gets revoked on one or more columns.

An example of permission re-adjustment from **table** to **column** level:

```questdb-sql
CREATE TABLE table1 (col1 SYMBOL, col2 INT, col3 STRING);
CREATE USER user1...;
GRANT SELECT ON table1 TO user1;
REVOKE SELECT ON table1(col1) FROM user1;
ALTER TABLE table1 ADD COLUMN col4 DOUBLE;

SHOW PERMISSIONS user1;

permission	table_name	column_name	grant_option	origin
----------	----------	-----------	------------	------
SELECT		table1		col2		false			G
SELECT		table1		col3		false			G
```

In the above example, revoking access on `col1` triggers permission
re-adjustment. Access is revoked on **table** level and granted to `col2` and
`col3` only. When `col4` is added to the table, the user cannot access it.
Access has to be granted explicitly, if needed.

```questdb-sql
GRANT SELECT ON table1(col4) TO user1;
```

### Implicit permissions

Since QuestDB is a [time-series database](/glossary/time-series-database/), the
designated timestamp column is treated on a special way. Some functionality,
such as [SAMPLE BY](/docs/reference/sql/sample-by/),
[LATEST ON](/docs/reference/sql/latest-on/) or
[ASOF JOIN](/docs/reference/sql/asof-join/), require a designated timestamp. If
a user can access only some columns of a table, but not the designated
timestamp, then these operations would become unavailable to the user. It is
something of a dependency.

As a solution, QuestDB derives permissions for the designated timestamp column
based on the access granted to other columns of the table. If a user is granted
`SELECT` or `UPDATE` permission to any of the columns of a table, the same
permission is then granted to the designated timestamp column implicitly.

Let's look at an example:

```questdb-sql
CREATE TABLE table1 (col1 SYMBOL, col2 INT, col3 TIMESTAMP) timestamp(col3);
CREATE USER user1...;
GRANT SELECT ON table1(col1) TO user1;

SHOW PERMISSIONS user1;

permission	table_name	column_name	grant_option	origin
----------	----------	-----------	------------	------
SELECT		table1		col1		false			G
SELECT		table1		ts			false			I
```

The overall permissions on the designated timestamp column will be the union of
the permissions granted to the column explicitly and implicitly:

```questdb-sql
GRANT UPDATE ON table1(ts) TO user1;

SHOW PERMISSIONS user1;

permission	table_name	column_name	grant_option	origin
----------	----------	-----------	------------	------
SELECT		table1		col1		false			G
UPDATE		table1		ts			false			G
SELECT		table1		ts			false			I
```

Implicit permissions cannot be revoked directly from the designated timestamp
column:

```questdb-sql
REVOKE SELECT, UPDATE ON table1(ts) FROM user1;

SHOW PERMISSIONS user1;

permission	table_name	column_name	grant_option	origin
----------	----------	-----------	------------	------
SELECT		table1		col1		false			G
SELECT		table1		ts			false			I
```

### Grant verification

It is possible to grant permission to non-existent users, service accounts or
groups. These permissions will get picked up when the entity eventually gets
created.

For example:

```questdb-sql
CREATE TABLE table1 (col1 SYMBOL, col2 INT);
GRANT SELECT ON table1 TO user1;
CREATE USER user1...;

SHOW PERMISSIONS user1;

permission	table_name	column_name	grant_option	origin
----------	----------	-----------	------------	------
SELECT		table1		null		false			G
```

Flexibility is great, but can lead to issues when a typo in the name of the
entity occurs.

If we want to avoid problems caused by typos, we can use the `WITH VERIFICATION`
option:

```questdb-sql
CREATE TABLE table1 (col1 SYMBOL, col2 INT);
GRANT SELECT ON table1 TO user1 WITH VERIFICATION;
```

The above will fail, because QuestDB will not find the user. This is especially
useful for scripts.

If a user, service account or group is deleted and later re-created, permissions
do not get reinstated.

### Non-existent database objects

Permissions can be granted not only to non-existent users and groups, but also
on non-existent tables and columns.

This is useful in some situations. For example, when it is expected that the
table or the column will be created automatically via InfluxDB Line Protocol
(ILP):

```questdb-sql
GRANT SELECT ON table1 TO user1;
CREATE USER user1...;

SHOW PERMISSIONS user1;

permission	table_name	column_name	grant_option	origin
----------	----------	-----------	------------	------
```

Permission is picked up after the table is created.

```questdb-sql
CREATE TABLE table1 (col1 SYMBOL, col2 INT);

SHOW PERMISSIONS user1;

permission	table_name	column_name	grant_option	origin
----------	----------	-----------	------------	------
SELECT		table1		null		false			G
```

When the table is deleted permissions disappear.

```questdb-sql
DROP TABLE table1;

SHOW PERMISSIONS user1;

permission	table_name	column_name	grant_option	origin
----------	----------	-----------	------------	------
```

However, if a table with the same name is re-created, the permissions are
re-instated:

```questdb-sql
CREATE TABLE table1 (col1 SYMBOL, col2 INT);

SHOW PERMISSIONS user1;

permission	table_name	column_name	grant_option	origin
----------	----------	-----------	------------	------
SELECT		table1		null		false			G
```

This can be useful in situations when a table is deleted only temporarily.

For example, when you need to remove some data from a table, and the data to be
deleted is not aligned to partitions, so `DROP PARTITION` is not an option:

```questdb-sql
CREATE USER user1...;
CREATE TABLE table1 (col1 SYMBOL, col2 INT);
GRANT SELECT ON table1 TO user1;

CREATE TABLE tmp AS (SELECT * FROM table1 WHERE col2 != 42);
DROP TABLE table1;
RENAME TABLE tmp TO table1;

SHOW PERMISSIONS user1;

permission	table_name	column_name	grant_option	origin
----------	----------	-----------	------------	------
SELECT		table1		null		false			G
```

Reinstating permissions on the re-created table is not always desirable. If we
want a clean start, we can delete the old table along with the permissions
assigned to it.

This can be done by using the `CASCADE PERMISSIONS` option:

```questdb-sql
CREATE USER user1...;
CREATE TABLE table1(col1 SYMBOL, col2 INT);
GRANT SELECT ON table1 TO user1;

CREATE TABLE tmp AS (SELECT * FROM table1 WHERE col2 != 42);
DROP TABLE table1 CASCADE PERMISSIONS;
RENAME TABLE tmp TO table1;

SHOW PERMISSIONS user1;

permission	table_name	column_name	grant_option	origin
----------	----------	-----------	------------	------
```

:::note

`CASCADE PERMISSIONS` is not implemented yet, but will be available soon!

:::

The same is true for columns.

When a column is deleted and then re-created, permissions are re-instated.

### Owner grants

When a user creates a new table or adds a new column to an existing table,
it receives owner permissions on the newly created database object.
The same stands for creating a new service account.

If the user creates a table, the user automatically gets all table level
permissions with the `GRANT` option on it.

If the user adds a new column to an existing table, the user automatically gets
all column level permissions with the `GRANT` option on it.

If the user creates a new service account, the user automatically gets the
`ASSUME SERVICE ACCOUNT` permission with the `GRANT` option on it.

In QuestDB ownership does not persist. This means that the user gets full
control over the newly created table or column at the time of creating it, but
if the permissions are later revoked, then the user cannot get it back without
someone re-granting it to them.

## Full SQL grammar list

Managing or verifying what users have access to is possible with the following
SQL commands:

- [ADD USER](/docs/reference/sql/acl/add-user/) - add user to one or more groups
- [ALTER USER](/docs/reference/sql/acl/alter-user/) - modifies user settings
- [ALTER SERVICE ACCOUNT](/docs/reference/sql/acl/alter-service-account/) -
  modifies service account settings
- [ASSUME SERVICE ACCOUNT](/docs/reference/sql/acl/assume-service-account/) -
  switches current user to a service account
- [CREATE GROUP](/docs/reference/sql/acl/create-group) - creates user group
- [CREATE SERVICE ACCOUNT](/docs/reference/sql/acl/create-service-account/) -
  creates service account
- [CREATE USER](/docs/reference/sql/acl/create-user/) - creates user
- [DROP GROUP](/docs/reference/sql/acl/drop-group/) - drops user group
- [DROP SERVICE ACCOUNT](/docs/reference/sql/acl/drop-service-account/) - drops
  an existing service account
- [DROP USER](/docs/reference/sql/acl/drop-user/) - drops an existing user
- [EXIT SERVICE ACCOUNT](/docs/reference/sql/acl/exit-service-account/) -
  switches current user back from service account
- [GRANT](/docs/reference/sql/acl/grant/) - grants permission to user, service
  account or group
- [GRANT ASSUME SERVICE ACCOUNT](/docs/reference/sql/acl/grant-assume-service-account) -
  grants a service account to a user or a group
- [REMOVE USER](/docs/reference/sql/acl/remove-user/) - removes user from one or
  more groups
- [REVOKE](/docs/reference/sql/acl/revoke/) - revokes permission from user,
  service account or group
- [REVOKE ASSUME SERVICE ACCOUNT](/docs/reference/sql/acl/revoke-assume-service-account/) -
  revokes a service account from a user or a group
- [SHOW USER](/docs/reference/sql/show/#show-user) - shows enabled
  authentication methods of a user
- [SHOW USERS](/docs/reference/sql/show/#show-users) - shows all users
- [SHOW GROUPS](/docs/reference/sql/show/#show-groups) - displays all groups or
  those the user is part of
- [SHOW SERVICE ACCOUNT](/docs/reference/sql/show/#show-service-account) - shows
  enabled authentication methods of a user
- [SHOW SERVICE ACCOUNTS](/docs/reference/sql/show/#show-service-accounts) -
  displays all service accounts or those assigned to the user/group
- [SHOW PERMISSIONS](/docs/reference/sql/show/#show-permissions-for-current-user) -
  displays permissions of a user, service account or group

List of all permissions is available at
[permissions summary](/docs/operations/rbac/#permissions) .

## SHOW commands

There are a number of access control related
[SHOW commands](/docs/reference/sql/show) in QuestDB.

We can list all users, service accounts and groups, which groups are associated
with a user, which service accounts a user or the members of a group can assume;
we can list their permissions and also view which authentication mode is enabled
for users and service accounts.

However, this functionality is only available to the user if the necessary
permissions are granted to them. When trying to list all users, service accounts
or groups, QuestDB checks for the `LIST USERS` permission. When trying to view
the groups, service accounts, permissions or authentication modes of an entity,
QuestDB checks for the `USER DETAILS` permission.

The only exception is when the user is querying information related to
themselves or to the groups/service accounts with which they are associated. In
this case no permission is required. Anyone is allowed to check their own
groups, service accounts, permissions, and the list of authentication methods
enabled for them.

## Built-in admin

The following considerations are important when leveraging the built-in admin.

### Special treatment of built-in admin

The built-in _admin_ is special because it is pre-configured in the system, and
has all permissions granted on the database level, meaning it can do anything.
It is **root**.

The access list of the built-in _admin_ is hardcoded in the system, and cannot
be changed. Any attempt to issue a `GRANT` or `REVOKE` statement involving the
built-in _admin_ is rejected by the database.

The
[SHOW PERMISSIONS](/docs/reference/sql/show/#show-permissions-for-current-user)
command also treats the built-in _admin_ differently. When trying to list the
permissions of the built-in _admin_, nothing will be displayed.
