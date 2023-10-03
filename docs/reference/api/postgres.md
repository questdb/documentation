---
title: Postgres
description: Postgres compatibility reference documentation.
---

QuestDB supports the Postgres wire protocol. As a result, QuestDB is capable of
running most of Postgres queries. This means that you can use your favorite
Postgres client or driver with QuestDB, at no extra cost.

The storage model used by Postgres is fundamentally different to the one used by
QuestDB. Some features that exists for Postgres do not apply to QuestDB.

## Examples

We provide examples in a number of programming languages. See our "develop" docs
for:

- [Inserting](/docs/develop/insert-data/#postgresql-wire-protocol)
- [Querying](/docs/develop/query-data/#postgresql-wire-protocol)
- [Updating](/docs/develop/update-data/#postgres-compatibility)

## Compatibility

### List of supported features

- Querying (all types expect `BLOB`)
- Prepared statements with bind parameters (check for specific libraries
  [below](/docs/reference/api/postgres/#libraries--programmatic-clients))
- `INSERT` statements with bind parameters
- `UPDATE` statements with bind parameters
- DDL execution
- Batch inserts with `JDBC`
- Plain authentication

Examples which demonstrate how to use Postgres clients in a number of different
languages can be found on the following pages:

- [Insert data](/docs/develop/insert-data/#postgresql-wire-protocol) demonstrates
  how to use the parameterized queries and prepared statements to insert data.
- [Query data](/docs/develop/query-data/#postgresql-wire-protocol) shows how to
  run queries against tables.
- [Update data](/docs/develop/update-data/#postgres-compatibility) shows how to
  update tables.

### List of supported connection properties

| Name       | Example                    | Description                                                                                                                          |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `database` | qdb                        | Should be set to any value for example `qdb`, database name is ignored, QuestDB does not have database instance name                 |
| `user`     | admin                      | User name configured in `pg.user` or `pg.readonly.user` property in `server.conf`. Default value is `admin`                          |
| `password` | quest                      | Password from `pg.password` or `pg.readonly.password` property in `server.conf`. Default value is `quest`                            |
| `options`  | -c statement_timeout=60000 | The only supported option is `statement_timeout`. It specifies maximum execution time in milliseconds for SELECT or UPDATE statement |

### List of unsupported features

- SSL
- Remote file upload (`COPY` from `stdin`)
- `DELETE` statements
- `BLOB` transfer

## Recommended third party tools

The following list of third party tools includes drivers, clients or utility
CLIs that our team has tested extensively. Picking an item from it will
guarantee that your code will work with QuestDB.

We recognize that our community might value some features more than others. This
is why we encourage you to [open an issue on GitHub]({@githubUrl@}/issues) if
you think we are missing something important for your workflow.

### CLIs

#### [PSQL](https://www.postgresql.org/docs/current/app-psql.html) `12`

Support for `SELECT`, `INSERT`, `UPDATE`, `CREATE`, `DROP`, `TRUNCATE`.

### Libraries / Programmatic clients

#### [node-postgres](https://node-postgres.com/) (NodeJS) `8.4`

#### [pq](https://github.com/lib/pq) (Go) `1.8`

#### [pq](https://www.postgresql.org/docs/12/libpq.html) (C) `12`

#### [Psycopg](https://www.psycopg.org) (Python) `2.9.3` and `3.1`

#### [ruby-pg](https://github.com/ged/ruby-pg) (Ruby) `1.4.3`

#### [pg_connect](https://www.php.net/manual/en/function.pg-connect.php) (PHP) `8.1.0`

### Drivers

#### [JDBC](https://jdbc.postgresql.org/) `42.2`
