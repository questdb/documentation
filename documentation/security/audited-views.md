---
title: Audited views
sidebar_label: Audited views
description:
  Keep an audit trail of reads of a QuestDB Enterprise view in sys.view_audit,
  with the principal, the time, and the parameter values each read ran with.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Record who read a view, when, and with which parameters.
</EnterpriseNote>

An audited view keeps an audit trail of its reads in the `sys.view_audit`
table: the principal that ran the query, when the read finished, how long it
took, and the values its parameters resolved to. Use it where you have to
answer who looked at which data, for example a view that exposes trades or
positions for a symbol and time range that the caller chooses. Recording is
asynchronous and best-effort: a read never waits for its row, and under
overload a row can be lost. See [Delivery guarantees](#delivery).

A view created `WITH AUDIT` records a row for each read. Each of its
[`DECLARE`](/docs/query/sql/declare/) variables marked `AUDITED` adds its
resolved value to the row's `params` column, as JSON. A caller's override, a
bind variable, or a default built on `now()` is recorded as the value that read
actually ran with, so the trail records the parameter values each read ran
with. It does not record the query text, the caller's own filters, columns or
`LIMIT`, how many rows the read returned, or the view's body at the time.

To record the text of every query instead, see
[query tracing](/docs/concepts/deep-dive/query-tracing/), which is off by
default and keeps 24 hours of queries.

## Quick start

The steps run as three principals: the built-in admin, `view_owner` and
`analyst`.

As the admin, let `view_owner` create the view. That needs `CREATE VIEW`,
`AUDIT VIEW`, `SELECT` on the tables the view reads, and an endpoint permission
such as `HTTP` to connect:

```questdb-sql title="Admin: let view_owner create the view"
GRANT HTTP, CREATE VIEW, AUDIT VIEW TO view_owner;
GRANT SELECT ON trades TO view_owner;
```

As `view_owner`, create the view:

```questdb-sql title="view_owner: create an audited view"
CREATE VIEW trades_by_symbol AS (
  DECLARE
    OVERRIDABLE AUDITED @symbols := ('BTC-USDT', 'ETH-USDT'),
    AUDITED @since := dateadd('h', -1, now())
  SELECT timestamp, symbol, side, price, amount
  FROM trades
  WHERE symbol IN @symbols AND timestamp >= @since
) WITH AUDIT;
```

As the admin, revoke the owner's `SELECT` on `trades`, so that it cannot read
the table unaudited, and grant it again only when the owner changes the view.
Then grant `analyst` the view, and not the table:

```questdb-sql title="Admin: close the owner's unaudited path, let analyst read"
REVOKE SELECT ON trades FROM view_owner;
GRANT HTTP, PGWIRE TO analyst;
GRANT SELECT ON trades_by_symbol TO analyst;
```

As `analyst`, read the view:

```questdb-sql title="analyst: read it, overriding the symbols"
DECLARE @symbols := ('SOL-USDT',)
SELECT * FROM trades_by_symbol;
```

As the admin, or a principal granted `SELECT` on the trail, inspect it. Quote
the table name, in a `GRANT` too:

```questdb-sql title="Admin: let auditors read the trail"
GRANT SELECT ON 'sys.view_audit' TO auditors;
```

```questdb-sql title="Inspect the trail"
SELECT ts, principal, view_name, params, status
FROM 'sys.view_audit'
WHERE view_name = 'trades_by_symbol'
ORDER BY ts DESC
LIMIT 10;
```

| ts                          | principal | view_name        | params                                                        | status |
| --------------------------- | --------- | ---------------- | ------------------------------------------------------------- | ------ |
| 2026-09-19T10:15:02.418331Z | analyst   | trades_by_symbol | `{"since":"2026-09-19T09:15:02.417950Z","symbols":["SOL-USDT"]}` | ok     |

Rows are written in the background and appear in the table shortly after the
read.

## Syntax

```questdb-sql title="Create an audited view"
CREATE [ OR REPLACE ] VIEW [ IF NOT EXISTS ] viewName AS ( query )
    WITH AUDIT [ OWNED BY ownerName ]
```

```questdb-sql title="Mark the parameters to record"
DECLARE [ OVERRIDABLE ] [ AUDITED ] @variable := expression
    [, [ OVERRIDABLE ] [ AUDITED ] @variable := expression ...]
```

- `WITH AUDIT` and `OWNED BY` may appear in either order. `WITH AUDIT` requires
  the [`AUDIT VIEW`](#permissions) permission.
- `AUDITED` and `OVERRIDABLE` are independent and may appear in either order.
- `AUDITED` belongs in the `DECLARE` block that opens the view's body. In a
  subquery or a CTE, it fails with
  `AUDITED is only allowed in the top-level DECLARE block`.
- A view created `WITH AUDIT` with no `AUDITED` variables still records each
  read, with `{}` in `params`.

A view's auditing is set when it is created:

- `ALTER VIEW` and `CREATE OR REPLACE VIEW` over an existing view keep it. To
  audit an existing view, or to stop auditing one, drop it and create it again.
- `CREATE OR REPLACE VIEW ... WITH AUDIT` over an audited view is accepted: the
  body is replaced as usual, the view stays audited, and `WITH AUDIT` adds
  nothing. So a deploy script that creates the view this way can run again,
  unless it uses `OWNED BY`, which `CREATE OR REPLACE VIEW` over an existing
  view rejects. Over a view that is not audited, it fails with
  `cannot audit an existing view, drop and re-create it WITH AUDIT`.
- `ALTER VIEW` does not accept `WITH AUDIT`.

:::warning

`CREATE VIEW IF NOT EXISTS ... WITH AUDIT` does nothing when a view of that
name exists, even one that is not audited, and reports success. A deploy script
that uses it can leave an existing view unaudited.
[Check](#check-that-a-view-is-audited) the view after it runs.

:::

### Check that a view is audited

[`SHOW CREATE VIEW`](/docs/query/sql/show/#show-create-view) shows `WITH AUDIT`
after the body of an audited view:

```questdb-sql title="Show the view's definition"
SHOW CREATE VIEW trades_by_symbol;
```

```questdb-sql title="Result"
CREATE VIEW 'trades_by_symbol' AS (
DECLARE
    OVERRIDABLE AUDITED @symbols := ('BTC-USDT', 'ETH-USDT'),
    AUDITED @since := dateadd('h', -1, now())
  SELECT timestamp, symbol, side, price, amount
  FROM trades
  WHERE symbol IN @symbols AND timestamp >= @since
) WITH AUDIT
OWNED BY 'admin';
```

[`views()`](/docs/query/functions/meta/#views) does not report whether a view is
audited.

## Choose what a read records

Mark a variable `AUDITED` when its value describes which data a read covered:

- **`OVERRIDABLE AUDITED`**: a parameter the caller can set. The row records the
  caller's value, or the view's default when the caller sets nothing.
- **`AUDITED` only**: a parameter the caller cannot change. Worth recording when
  its value changes between reads, such as a window built on `now()`, because
  the trail is otherwise the only place that value is kept.

Only the view's own declarations count. A caller cannot add a parameter to the
row, or remove one, by declaring variables of their own, `AUDITED` or not.

The row's `principal` is the identity the read ran as. An application that
connects with one shared login records only that login, and after
`ASSUME SERVICE ACCOUNT` the row names the service account, not the user who
assumed it. To record the end user, declare a parameter the application sets,
such as `OVERRIDABLE AUDITED @end_user := ''`. The query need not use it. Its
value is whatever the application passes, so it is only as trustworthy as the
application.

Values are evaluated for each execution. A prepared statement that binds a
view parameter to a bind variable records the values bound on each execution:

```questdb-sql title="One plan, a row per execution with its own values"
DECLARE @symbols := ($1, $2)
SELECT * FROM trades_by_symbol;
```

The statement text fixes the number of members: `($1, $2)` always takes two
values, so prepare one statement for each list length. A single member needs
the trailing comma, `($1,)`. With a client that sends parameters untyped, such
as psql `\bind`, cast it, `($1::varchar,)`: untyped, `($1,)` is taken as one
array bind, which an `AUDITED` parameter refuses. With JDBC, write `?` in place
of each `$n`.

An `AUDITED` parameter cannot hold an array, so the
[text array bind](/docs/query/sql/declare/#lists-of-bind-variables) that passes
a list of any length to other views fails here with
`audited view parameter has a type that cannot be audited`.

:::tip

Record resolved values rather than text that resolves later. A
[TICK](/docs/query/operators/tick/) string such as `'$now-1h..$now'` is recorded
as that text, not as the time range it resolved to. To keep the range in the
trail, declare the bounds as timestamps, as `@since` does above.

:::

### Values that cannot be audited

A read fails, rather than record a row that misstates it, when an `AUDITED`
variable:

- Resolves to a type that [`params`](#the-params-column) cannot hold, such as
  an array. The error is
  `audited view parameter has a type that cannot be audited`.
- Holds a subquery anywhere in its value, such as
  `(SELECT max(timestamp) FROM trades)`. The error is the same, with the type
  `CURSOR`.
- Refers to a column, such as `price`. An `AUDITED` value is evaluated once
  per read, not per row. The error is `Invalid column: price`.
- Is an aggregate function, such as `count()`. The error is
  `audited view parameter cannot be an aggregate function`.
- Can change while the query runs, such as `rnd_int()` or `systimestamp()`. The
  error is `audited view parameter has a value that can change during the query`.
  A value built on `now()` is fixed for the whole query, and is recorded.

`CREATE VIEW ... WITH AUDIT`, `ALTER VIEW` and `CREATE OR REPLACE VIEW` check
the view's own default values against the same rules.

A read also fails, without reading any data, when an `AUDITED` value raises an
error, for example a function given a bad bind value, even if the query does
not use the variable. The same applies when a read's `params` would be larger
than
[`view.audit.params.max.size`](/docs/configuration/audited-views/#viewauditparamsmaxsize),
1 MiB by default, for example after a very long override of a list. The error
is `view audit parameters are too large to record, the read is refused`.

## The sys.view_audit table {#the-audit-table}

`sys.view_audit` is a WAL table, partitioned by day, that holds the audit
trail. The server creates it at startup. No client can create a table or view
of that name. The `sys.` prefix follows
[`cairo.system.table.prefix`](/docs/configuration/cairo-engine/#cairosystemtableprefix).
Its schema:

| Column           | Type        | Description                                                                                                  |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `ts`             | `TIMESTAMP` | When the read finished and the row was recorded. The designated timestamp.                                   |
| `principal`      | `SYMBOL`    | The user or service account the read ran as, taken when the read starts. After `ASSUME SERVICE ACCOUNT`, it is the service account. |
| `view_name`      | `SYMBOL`    | The name of the audited view.                                                                                |
| `params`         | `VARCHAR`   | The resolved values of the view's `AUDITED` variables, as a JSON object. `NULL` when they could not be evaluated or were too large to record. |
| `latency_micros` | `LONG`      | How long the read took, in microseconds. For QWP queries, Parquet export and `COPY TO`, it can cover only the start of the read. |
| `status`         | `SYMBOL`    | `ok` when the read ran, `error` when it failed or was cancelled. A statement refused while it compiles records no row: see [What counts as a read](#what-counts-as-a-read). |
| `view_id`        | `INT`       | The view's internal id. A view that is dropped and created again under the same name gets a new id. `ALTER VIEW` keeps the id. |

`ok` does not guarantee that the client received every row: some failures after
the read has started still record `ok`.

### The params column

`params` is deterministic JSON: the same values, written the same way, produce
the same text.

- Keys are the variable names without the `@`, sorted by name.
- A declared list renders as a JSON array, in the order it was written,
  duplicates included. Declare a one-member list with a trailing comma,
  `('SOL-USDT',)`, so that the value stays an array. Without the comma it is a
  scalar, and a caller who overrides a list that way records a scalar.
- A value renders by the type the read gave it. A caller who passes a timestamp
  as text records that text: `'2026-10-01T00:00:00Z'` and
  `'2026-10-01T00:00:00Z'::timestamp` render differently. Cast an extracted
  value, as in `json_extract(params, '$.since')::timestamp`, to compare them.
- A `NULL` value renders as JSON `null`, and so do `NaN` and `±Infinity` in a
  `FLOAT` or `DOUBLE`.

So group a report on the values it is about, extracted from `params`, rather
than on the whole column. See [Query the audit trail](#query-the-trail).

| SQL type                                          | JSON                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `BOOLEAN`                                         | `true` or `false`                                                      |
| `BYTE`, `SHORT`, `INT`, `LONG`, `FLOAT`, `DOUBLE` | Number                                                                 |
| `DECIMAL`                                         | Number at the type's scale, every digit written out: `150.00m` is `150.00` |
| `CHAR`, `STRING`, `SYMBOL`, `VARCHAR`             | String                                                                 |
| `TIMESTAMP`                                       | ISO 8601 string, in the timestamp's own precision (micro or nanosecond) |
| `DATE`                                            | ISO 8601 string, with microseconds                                     |
| `UUID`, `IPv4`                                    | String                                                                 |

### Query the audit trail {#query-the-trail}

The examples read the trail of the [Quick start](#quick-start) view. Its
`since` differs on every read, so group on the parameters a report is about,
not on the whole `params` column.

```questdb-sql title="Reads per principal and symbol list, today"
SELECT principal, json_extract(params, '$.symbols') AS symbols,
       count() AS reads
FROM 'sys.view_audit'
WHERE view_name = 'trades_by_symbol' AND ts IN '$today'
GROUP BY principal, symbols
ORDER BY reads DESC;
```

To answer who read a given symbol, unnest the list. The `CASE` turns a scalar,
recorded when a caller overrides the list without the trailing comma, into an
array of one, which [`UNNEST`](/docs/query/sql/unnest/) needs:

```questdb-sql title="Reads per principal and symbol, today"
SELECT a.principal, u.symbol, count() AS reads
FROM 'sys.view_audit' a, UNNEST(
    CASE WHEN json_extract(a.params, '$.symbols') LIKE '[%'
         THEN json_extract(a.params, '$.symbols')
         ELSE '["' || json_extract(a.params, '$.symbols') || '"]'
    END::varchar COLUMNS(symbol VARCHAR)
) u
WHERE a.view_name = 'trades_by_symbol' AND a.ts IN '$today'
  AND a.params IS NOT NULL
GROUP BY a.principal, u.symbol;
```

The `params IS NOT NULL` filter leaves out `error` rows whose parameters could
not be recorded, which would otherwise count as a read of an empty symbol.
A read whose list repeats a symbol counts once for each repeat.
Both reports count the other `error` rows as reads. Filter on `status` to tell
them apart.

```questdb-sql title="Extract one parameter"
SELECT ts, principal, json_extract(params, '$.since')::timestamp AS since
FROM 'sys.view_audit'
WHERE view_name = 'trades_by_symbol' AND ts IN '$today';
```

See [`json_extract()`](/docs/query/functions/json/#json_extract) for the path
syntax.

### Retention

Only the [built-in admin](/docs/security/rbac/#built-in-admin) can remove rows
from the trail, or set its storage policy or TTL, whatever other principals are
granted: see [Tamper protection](#protection).

The table is created with the storage policy that
[`view.audit.storage.policy`](/docs/configuration/audited-views/#viewauditstoragepolicy)
sets, `TO PARQUET 1d` by default, so older partitions of the trail move to
Parquet. That default never deletes a row. The setting applies only when the
server creates the table. After that, the built-in admin changes the policy with
[`ALTER TABLE SET STORAGE POLICY`](/docs/query/sql/alter-table-set-storage-policy/),
for example to keep a fixed window of the trail:

```questdb-sql title="Built-in admin: keep 90 days of trail on every node"
ALTER TABLE 'sys.view_audit'
    SET STORAGE POLICY(TO PARQUET 1d, DROP LOCAL 90d);
```

- `SET STORAGE POLICY` replaces the whole policy, so restate every stage you
  want to keep.
- A policy set on the primary applies on every node, replicas included.
- `TRUNCATE TABLE`, partition operations and `SET TTL` act only on the node
  that runs them, and a replica refuses them. A storage policy is the way to
  prune a replica's trail.
- Use a storage policy rather than a TTL. Enterprise accepts `SET TTL` on
  system tables such as the trail, but while a TTL is set, `SET STORAGE POLICY`
  fails with `Cannot set storage policy, please, remove TTL settings`. Clear it
  first with `ALTER TABLE 'sys.view_audit' SET TTL 0 HOURS`.
- A principal granted `DISABLE STORAGE POLICY` or `REMOVE STORAGE POLICY` can
  pause or remove the policy, which stops the pruning, but only the built-in
  admin can enable it again or set another.

A policy can convert and drop local partitions, but cannot move the trail to
object storage: `TO REMOTE` and `DROP REMOTE` are
[refused](#protection). Every node keeps its own trail under the same table
name, so in the remote tier the nodes would overwrite and delete each other's
partitions.

To remove older rows by hand, the built-in admin drops partitions, or truncates
the table with [`TRUNCATE TABLE`](/docs/query/sql/truncate/). Nothing records
that these statements ran.

:::note

With the built-in admin disabled,
[`acl.admin.user.enabled=false`](/docs/configuration/iam/#acladminuserenabled),
no principal can set the trail's storage policy or remove its rows. Settle
retention before you disable the admin: set the storage policy the trail should
keep, or set `view.audit.storage.policy` before the server first creates the
table. The policy keeps pruning the trail without the admin. To change it later,
enable the admin again, which takes a restart, since `acl.admin.user.enabled`
is not reloadable.

:::

### Tamper protection {#protection}

Only the server writes the trail. Statements that would forge or rewrite its
rows, drop or rename the table, change its structure, or stop the server
writing it are refused for every principal, the built-in admin included. Each
statement below fails with the error under it:

- `DROP TABLE`, or a
  [CSV import](/docs/connect/compatibility/rest-api/#imp---import-data) with
  `overwrite=true`:<br/>
  `cannot drop the view audit table`
- `RENAME TABLE`, from or to its name:<br/>
  `cannot rename the view audit table`
- `INSERT`, `UPDATE`, `COPY`, any other CSV import, ILP, including an ILP row
  that would add a column, and `ALTER TABLE ADD COLUMN`:<br/>
  `cannot write to the view audit table, only the server records rows in it`
- `ALTER TABLE` that drops, renames or retypes a column, or turns deduplication
  on or off:<br/>
  `cannot change the structure of the view audit table`
- `ALTER TABLE SET TYPE BYPASS WAL`:<br/>
  `cannot change the type of the view audit table`
- `ALTER TABLE SUSPEND WAL`:<br/>
  `cannot suspend the view audit table`
- `ALTER TABLE RESUME WAL FROM TRANSACTION n`:<br/>
  `cannot resume the view audit table from a transaction, it would skip recorded reads`
- A storage policy with `TO REMOTE` or `DROP REMOTE`:<br/>
  `cannot set storage policy with 'TO REMOTE' on the view audit table`, or
  `'DROP REMOTE'`
- `CREATE TABLE`, `CREATE VIEW` or another `CREATE` of its name, or `COPY` into
  it, while the table is missing:<br/>
  `cannot create the view audit table, only the server creates it`

`DROP ALL TABLES` skips system tables, so it leaves the trail in place.

Only the [built-in admin](/docs/security/rbac/#built-in-admin) can remove rows,
or set the table up to remove them. Every other principal is refused these
statements, whatever it holds, including `DATABASE ADMIN` and grants
`ON ALL TABLES`. Each fails with
`only the built-in admin can manage the retention, partitions and parameters of the view audit table`:

- [`TRUNCATE TABLE`](/docs/query/sql/truncate/)
- [`DROP PARTITION`](/docs/query/sql/alter-table-drop-partition/) and
  [`SQUASH PARTITIONS`](/docs/query/sql/alter-table-squash-partitions/), which
  needs the same `DROP PARTITION` permission
- [`DETACH PARTITION`](/docs/query/sql/alter-table-detach-partition/)
- [`SET TTL`](/docs/query/sql/alter-table-set-ttl/), which Enterprise accepts
  on the trail, and [`SET PARAM`](/docs/query/sql/alter-table-set-param/),
  which needs the same `SET TABLE PARAM` permission
- [`SET STORAGE POLICY`](/docs/query/sql/alter-table-set-storage-policy/), with
  any policy, and `ENABLE STORAGE POLICY`

The built-in admin runs them as on any other table, unless it has assumed a
service account. Nothing records that they ran. QuestDB Enterprise 4.1.0
allowed them to any principal holding the permission they need, as on any other
table: see the [upgrade notes](/docs/operations/upgrade/#upgrading-to-411).

These remain available to any principal granted the permission they need:
`SELECT`, `DISABLE STORAGE POLICY` and `DROP STORAGE POLICY`, other partition
operations such as `CONVERT PARTITION TO PARQUET`, and a plain
`ALTER TABLE RESUME WAL`, which recovers a suspended trail without losing a
row.

With access control turned off,
[`acl.enabled=false`](/docs/configuration/iam/#aclenabled), writes to the
trail, `SET TYPE` and the statements that remove rows are not refused. With ILP
over TCP authentication turned off,
[`line.tcp.acl.enabled=false`](/docs/configuration/iam/#linetcpaclenabled),
ILP over TCP writes are not refused: any ILP over TCP client can then add rows
to the trail.

## What counts as a read

A read is one execution of a statement that reads rows through an audited view:
`SELECT`, `INSERT INTO ... SELECT`, `CREATE TABLE AS SELECT`, an `UPDATE` of a
non-WAL table, or an [`EXPLAIN`](/docs/query/sql/explain/) of a query, which
runs the plan's subqueries. Each execution of a prepared statement records its
own row. When one statement reads the same view more than once, it records one
row for each distinct set of parameter values.

These record nothing:

- A statement refused when it compiles: a syntax error, an unknown column, an
  `AUDITED` value that [cannot be audited](#values-that-cannot-be-audited), or
  a principal without `SELECT` on the view.
- `CREATE VIEW`, `CREATE MATERIALIZED VIEW`, `ALTER VIEW` and
  `CREATE OR REPLACE VIEW` whose query reads an audited view. They check the
  query, but return no rows.
- Reads the database runs on its own behalf, such as materialized view
  refreshes and [`COMPILE VIEW`](/docs/query/sql/compile-view/).
- An `UPDATE` of a WAL table. See [Limitations](#limitations).

## Audited views that read other audited views

When an audited view reads another audited view, both record a row, unless the
outer view also declares as `AUDITED` every variable that the inner view
declares `OVERRIDABLE AUDITED`. Then only the outer view records a row, which
shows every value the caller could set, and the inner view's other `AUDITED`
values are not recorded. An inner view with no `OVERRIDABLE AUDITED` variables
records no row of its own.

Here the caller's `@sym` reaches the inner view through the outer one, so both
record a row:

```questdb-sql title="The inner view has a parameter the caller can set"
CREATE VIEW symbol_trades AS (
  DECLARE OVERRIDABLE AUDITED @sym := 'BTC-USDT'
  SELECT timestamp, symbol, side, price, amount
  FROM trades
  WHERE symbol = @sym
) WITH AUDIT;

CREATE VIEW buy_trades AS (
  SELECT * FROM symbol_trades WHERE side = 'buy'
) WITH AUDIT;
```

```questdb-sql title="The caller's @sym passes through buy_trades"
DECLARE @sym := 'ETH-USDT' SELECT * FROM buy_trades;
```

| view_name       | params               |
| --------------- | -------------------- |
| `buy_trades`    | `{}`                 |
| `symbol_trades` | `{"sym":"ETH-USDT"}` |

To record one row, re-declare the parameter in the outer view. The view stays
audited through `ALTER VIEW`, which on an audited view also needs the
[`AUDIT VIEW`](#permissions) permission:

```questdb-sql title="The outer view records @sym itself"
ALTER VIEW buy_trades AS (
  DECLARE OVERRIDABLE AUDITED @sym := 'BTC-USDT'
  SELECT * FROM symbol_trades WHERE side = 'buy'
);
```

The same read now records one row, `buy_trades` with `{"sym":"ETH-USDT"}`.
Declare it `AUDITED` without `OVERRIDABLE` instead to fix the value for every
caller.

An audited view read through a plain view always records its own row. A plain
view that an audited view reads can be changed without `AUDIT VIEW`, which
changes what the audited view returns while its rows record the same values:
see [Permissions](#permissions).

## Delivery guarantees {#delivery}

Auditing is lossy by design, and there is no lossless mode. Recording a read
never makes the read wait. A read is refused for the sake of its row in two
cases only: on an
[instance started with `readonly=true`](#replication-backups-and-read-only-instances),
which cannot write the trail, and when an `AUDITED` value
[cannot be recorded faithfully](#values-that-cannot-be-audited). Otherwise the
read runs whether or not its row is recorded, so under overload, or when a
write fails, a read can go unrecorded.

A read puts its row on a bounded in-memory queue, and a background job writes
the queue to the table. The queue holds
[`view.audit.queue.capacity`](/docs/configuration/audited-views/#viewauditqueuecapacity)
rows, 4096 by default, and the `params` of the rows in it may add up to
[`view.audit.queue.params.max.size`](/docs/configuration/audited-views/#viewauditqueueparamsmaxsize),
64 MiB by default.

A read goes unrecorded when:

- **The queue is full when the read finishes**: it has no free slot, or no room
  left for the row's `params`, because audited reads outpace the job. The
  server logs `view audit queue is full, dropping rows`. Raise the capacity if
  this appears during bursts of audited reads, or the size limit if the reads
  carry large parameters.
- **The job fails to write a batch.** The batch, up to 1024 rows, is lost, and
  the server logs `could not write view audit rows` with the number lost.
- **The server stops or crashes with rows still in the queue.** The queue is
  held in memory only.

Lost rows show in the server log only. No metric reports them.

## Permissions

| Action                                                              | Permissions                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| Create a view `WITH AUDIT`                                          | `CREATE VIEW` and `AUDIT VIEW`, and `SELECT` on the tables it reads |
| Drop an audited view, with `DROP VIEW` or `DROP ALL TABLES`         | `DROP VIEW` on the view and `AUDIT VIEW`                  |
| Change an audited view with `ALTER VIEW` or `CREATE OR REPLACE VIEW` | `ALTER VIEW` on the view and `AUDIT VIEW`, and `SELECT` on the tables the new body reads |
| Read an audited view                                                | `SELECT` on the view, as for any [view](/docs/concepts/views/#definer-security-model-enterprise) |
| Read the trail                                                      | `SELECT` on `sys.view_audit`                              |
| Remove rows from the trail, or set its storage policy or TTL        | None: only the [built-in admin](/docs/security/rbac/#built-in-admin) can, see [Tamper protection](#protection) |

`AUDIT VIEW` is a database-level permission, included in `DATABASE ADMIN`. It
guards every statement that binds a view to the trail, changes what it records,
or releases it: creating, redefining and dropping an audited view.

`AUDIT VIEW` guards the audited view's own definition, not the views it reads.
A principal who can alter, drop or replace a view that an audited view reads
can change what the audited view returns, with no change to the trail: the
rows keep recording the same parameter values, and nothing records the change.
Have audited views read tables or other audited views. If one reads a plain
view, revoke `ALTER VIEW` and `DROP VIEW` on that view from every principal
without `AUDIT VIEW`, including the view's creator, which receives both when
it creates the view.

:::note

A principal granted a database-level `GRANT ALL` on Enterprise 2.3.1 or later
holds `DATABASE ADMIN`, and so `AUDIT VIEW`. Others need it granted explicitly,
as in `GRANT AUDIT VIEW TO view_admins;`. See
[Database administrator](/docs/security/rbac/#database-administrator).

:::

Grant readers `SELECT` on the audited view and not on the tables it reads. A
principal who can read those tables, directly or through a view that is not
audited, reads the same data with no audit row. Under the
[definer model](/docs/concepts/views/#definer-security-model-enterprise),
`SELECT` on the view, plus an endpoint permission such as `HTTP` or `PGWIRE` to
connect, is all a reader needs.

`SELECT ON ALL TABLES` covers `sys.view_audit` and every table an audited view
reads, so its holder bypasses auditing and can read the whole trail, with every
principal's `params`. Check existing grants for it, such as the analyst roles
in [RBAC](/docs/security/rbac/#read-only-analyst).

Grant `SELECT` on `sys.view_audit` to the people who review the trail. No
principal can write rows to it, whatever it holds, and only the built-in admin
can remove them: see [Tamper protection](#protection).

## Replication, backups, and read-only instances

Every node records the reads it serves, replicas included, into its own
`sys.view_audit`. The rows are not replicated between nodes, so the complete
trail is the union of the tables on all nodes. The rows carry no node
identifier, so tag each node's rows with its name when you merge them.

The table's definition and storage policy replicate from the primary.

A [backup](/docs/operations/backup/) includes the node's `sys.view_audit`, and
restoring it onto an empty node brings that table back. Back up every node
whose trail you need to keep: a backup of the primary holds only the reads the
primary served. Scheduled backups run on the primary only, so back up a replica
with a manual `BACKUP DATABASE`. See
[Schedules on a replica](/docs/operations/backup/#schedules-on-a-replica).

A replica [created from a backup](/docs/operations/backup/#create-a-replica-from-a-backup)
of the primary starts with a copy of the primary's rows, up to the time of the
backup, and records its own reads after them. Those rows are also in the
primary's table, so when you merge the trails, take only the replica's rows
recorded after the backup, or they count twice. Any instant between the end of
the backup and the replica's first start is a safe cutoff, such as the backup's
`end_ts` in [`backups()`](/docs/operations/backup/#monitor-and-abort) on the
primary: every copied row is older, and every read the replica records itself
is newer.

```questdb-sql title="On a replica created from a backup: only its own reads"
SELECT 'replica-1' AS node, *
FROM 'sys.view_audit'
WHERE ts > '2026-10-01T12:00:00.000000Z'; -- after the backup it came from
```

Run a query like this on each node, with the cutoff only on a replica created
from a backup, then combine the results outside QuestDB, for example by
exporting each with
[`/exp`](/docs/connect/compatibility/rest-api/#exp---export-data).

An instance started with `readonly=true` cannot write the trail, so it refuses
reads of audited views with
`cannot read an audited view on a read-only instance`. Views that are not
audited are unaffected.

## Limitations

- **Only reads through the audited view are recorded.** A principal with
  `SELECT` on its tables, including the view's creator while it holds that
  grant, or on a plain view over them, reads the same rows with no audit row:
  see [Permissions](#permissions).
- **A materialized view over an audited view is not audited.** Its refreshes
  record nothing, reads of the materialized view are not audited, and
  `CREATE MATERIALIZED VIEW` records nothing either. A principal who can read an
  audited view and create materialized views can therefore make its data
  readable with no audit row. Grant `CREATE MATERIALIZED VIEW` with that in
  mind. A [live view](/docs/concepts/live-views/) cannot be defined over a
  view, so it cannot be used this way.
- **An `UPDATE` of a WAL table records nothing** when it reads an audited view
  in a subquery. The same statement on a non-WAL table is recorded.
- **Denied reads are usually not recorded.** Access to a view is checked when a
  statement compiles, and a statement refused there records no row. So the trail
  is not a record of failed access attempts: see
  [What counts as a read](#what-counts-as-a-read).
- **Copies are recorded once.** `INSERT INTO ... SELECT` and
  `CREATE TABLE AS SELECT` record the read that made the copy. Reads of the copy
  are not audited.
- **The trail is best-effort.** A read can go unrecorded: see
  [Delivery guarantees](#delivery).

## See also

- [Views](/docs/concepts/views/)
- [CREATE VIEW](/docs/query/sql/create-view/)
- [DECLARE](/docs/query/sql/declare/)
- [Role-based access control](/docs/security/rbac/)
- [Audited views configuration](/docs/configuration/audited-views/)
- [Storage policy](/docs/concepts/storage-policy/)
- [Query tracing](/docs/concepts/deep-dive/query-tracing/)
