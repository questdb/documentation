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

```questdb-sql title="Create an audited view"
CREATE VIEW trades_by_symbol AS (
  DECLARE
    OVERRIDABLE AUDITED @symbols := ('BTC-USDT', 'ETH-USDT'),
    AUDITED @since := dateadd('h', -1, now())
  SELECT timestamp, symbol, side, price, amount
  FROM trades
  WHERE symbol IN @symbols AND timestamp >= @since
) WITH AUDIT;
```

Creating it needs `CREATE VIEW`, `AUDIT VIEW`, and `SELECT` on the tables it
reads, which the built-in admin holds. To let another principal create it:

```questdb-sql title="Let view_owner create the view"
GRANT CREATE VIEW, AUDIT VIEW TO view_owner;
GRANT SELECT ON trades TO view_owner;
```

The owner keeps that `SELECT`, so it can read `trades` with no audit row. Use
an owner that nobody reads data as.

Readers need `SELECT` on the view, plus an endpoint permission, such as `HTTP`
or `PGWIRE`, to connect. Do not grant them the table it reads, so that the view
is their only way to the data:

```questdb-sql title="Let analyst read the view"
GRANT HTTP, PGWIRE TO analyst;
GRANT SELECT ON trades_by_symbol TO analyst;
```

```questdb-sql title="Read it, overriding the symbols"
DECLARE @symbols := ('SOL-USDT',)
SELECT * FROM trades_by_symbol;
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
- `AUDITED` takes effect only in the `DECLARE` block that opens the body of a
  view created `WITH AUDIT`. In a subquery, a CTE, or a set-operation branch
  after the first, it fails with
  `AUDITED is only allowed in the top-level DECLARE block`. In the block that
  opens a statement, or the body of a view created without `WITH AUDIT`, it is
  accepted and has no effect.
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
  the trail is otherwise the only place that value is kept. When another
  audited view reads this one and
  [covers it](#audited-views-that-read-other-audited-views), the value is not
  recorded.

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
as psql `\bind`, it also needs a cast, `($1::varchar,)`: untyped, `($1,)` is
taken as one array bind variable for the whole list.

An `AUDITED` parameter cannot hold an array, so the
[text array bind](/docs/query/sql/declare/#lists-of-bind-variables) that passes
a list of any length to other views is refused here. Both cases fail with
`audited view parameter has a type that cannot be audited`, for example
`[view=trades_by_symbol, parameter=@symbols, type=unknown]` for an untyped
bind.

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
- Refers to a column, such as `price` or `price * 2`. An `AUDITED` value is
  evaluated once per read, apart from the rows the read returns, so it cannot
  use a column. The error is `Invalid column: price`. The same declaration
  without `AUDITED` is accepted.
- Is an aggregate function, such as `count()`. The error is
  `audited view parameter cannot be an aggregate function`. An aggregate over a
  column, such as `max(price)`, fails on the column first, with
  `Invalid column: price`.
- Can change while the query runs, such as `rnd_int()` or `systimestamp()`. The
  error is `audited view parameter has a value that can change during the query`.
  A value built on `now()` is fixed for the whole query, and is recorded.

These rules are checked when the read compiles, so a read refused by one of them
records no row. `CREATE VIEW ... WITH AUDIT`, `ALTER VIEW` and
`CREATE OR REPLACE VIEW` check the view's own declarations against the same
rules, so a view whose default values break one is refused when it is defined.
The size limit below is not checked there: a view whose default values are too
large to record is created, and every read that uses those defaults fails.

A read also fails when an `AUDITED` value cannot be evaluated as the read
starts, for example when a value bound to a bind variable makes a function
raise an error. This holds even when the query never uses the variable, such as
one that only feeds a column the query does not select. The read returns the
error without reading any data, and records a row with status `error` and
`NULL` in `params`. The trail cannot show what such a read was given, so the
read does not run. A constant value, including a caller's literal override, is
evaluated when the read compiles instead, so its failure records no row, as
with the rules above.

The same happens when a read's `params` would be larger than
[`view.audit.params.max.size`](/docs/configuration/audited-views/#viewauditparamsmaxsize),
1 MiB by default, for example when a caller overrides a list or a text
parameter with a very long value. The error is
`view audit parameters are too large to record, the read is refused`.

## The sys.view_audit table {#the-audit-table}

`sys.view_audit` is a WAL table, partitioned by day, that holds the audit
trail. The server creates it at startup, and a replica promoted to primary
creates it if it does not have it yet. No client can create a table or view of
that name. The `sys.` prefix follows
[`cairo.system.table.prefix`](/docs/configuration/cairo-engine/#cairosystemtableprefix).
Its schema:

| Column           | Type        | Description                                                                                                  |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `ts`             | `TIMESTAMP` | When the read finished and the row was recorded. The designated timestamp.                                   |
| `principal`      | `SYMBOL`    | The user or service account the read ran as, taken when the read starts. After `ASSUME SERVICE ACCOUNT`, it is the service account. |
| `view_name`      | `SYMBOL`    | The name of the audited view.                                                                                |
| `params`         | `VARCHAR`   | The resolved values of the view's `AUDITED` variables, as a JSON object. `NULL` when they could not be evaluated or were too large to record. |
| `latency_micros` | `LONG`      | How long the read took, from opening it to closing it, in microseconds. For a read served as page frames, only the open: see below. |
| `status`         | `SYMBOL`    | `ok` when the read opened and ran, which does not mean it completed: see below. `error` when a compiled read failed or was cancelled. A statement refused while it compiles, such as a read by a principal without `SELECT` on the view, records no row: see [What counts as a read](#what-counts-as-a-read). |
| `view_id`        | `INT`       | The view's internal id. A view that is dropped and created again under the same name gets a new id. `ALTER VIEW` keeps the id. |

`ok` does not mean the client received every row. A failure while computing a
selected column of a row the read has already produced, such as a cast or a
string function raising an error, returns the error to the client and still
records `ok`. The read reached that row.

A read served as page frames records its row when the read opens, not when it
finishes: `latency_micros` covers only the open, and a failure after that still
shows `ok`. QWP queries, Parquet export and `COPY TO` read a view this way when
its query allows it, as a plain scan of one table does.

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
SELECT a.principal, u.symbol, count_distinct(a.ts) AS reads
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
`count_distinct(a.ts)` counts a read once even when its list repeats a symbol.
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

The table is created with the storage policy that
[`view.audit.storage.policy`](/docs/configuration/audited-views/#viewauditstoragepolicy)
sets, `TO PARQUET 1d` by default, so older partitions of the trail move to
Parquet. That default never deletes a row. The setting applies only when the
server creates the table. After that, change the policy with
[`ALTER TABLE SET STORAGE POLICY`](/docs/query/sql/alter-table-set-storage-policy/),
for example to keep a fixed window of the trail:

```questdb-sql title="Keep 90 days of trail on every node"
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

A policy can convert and drop local partitions, but cannot move the trail to
object storage: `TO REMOTE` and `DROP REMOTE` are
[refused](#protection). Every node keeps its own trail under the same table
name, so in the remote tier the nodes would overwrite and delete each other's
partitions.

To remove older rows, drop partitions, or truncate the table with
[`TRUNCATE TABLE`](/docs/query/sql/truncate/). Retention is the operator's to
manage, and nothing records that these statements ran: see
[Tamper protection](#protection) for the statements that remove rows, and
[Permissions](#permissions) for who may run them.

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

Removing rows is not refused. These statements are retention operations,
governed only by the [permissions](#permissions) they need, as on any other
table. Nothing records that they ran.

- [`TRUNCATE TABLE`](/docs/query/sql/truncate/)
- [`DROP PARTITION`](/docs/query/sql/alter-table-drop-partition/) and
  [`DETACH PARTITION`](/docs/query/sql/alter-table-detach-partition/)
- [`SET TTL`](/docs/query/sql/alter-table-set-ttl/). Enterprise rejects a TTL
  on other tables, but accepts it on system tables such as the trail. A TTL
  acts only on the node that runs it, and blocks `SET STORAGE POLICY` until it
  is cleared with `SET TTL 0 HOURS`: see [Retention](#retention).
- A [storage policy](/docs/query/sql/alter-table-set-storage-policy/) with a
  `DROP LOCAL` stage

These remain available too: `SELECT`, other partition operations such as
`CONVERT PARTITION TO PARQUET`, any other change to a storage policy that stays
local, and a plain `ALTER TABLE RESUME WAL`, which recovers a suspended trail
without losing a row.

Changes to the table's columns are refused because each node keeps its own
table, so such a change would stay on the node that made it, and because the
server stops writing the trail when a column it writes is missing or retyped.
See [Delivery guarantees](#delivery).

The write and `SET TYPE` refusals are made by access control, so they do not
apply when it is turned off with
[`acl.enabled=false`](/docs/configuration/iam/#aclenabled). The other refusals
always apply, and `ALTER TABLE ADD COLUMN` is then refused with
`cannot change the structure of the view audit table`.

## What counts as a read

A read is one execution of a statement that reads rows through an audited view:
`SELECT`, `INSERT INTO ... SELECT`, `CREATE TABLE AS SELECT`, an `UPDATE` of a
non-WAL table that reads the view in its `FROM` clause or in a subquery, or an
[`EXPLAIN`](/docs/query/sql/explain/) of a `SELECT`, `INSERT INTO ... SELECT`
or `CREATE TABLE AS SELECT`. Each execution records its own rows, including
every execution of a cached or prepared statement.

`EXPLAIN` counts because it opens the plan it prints. That runs the plan's
subqueries, and the printed plan can show values they read, such as a scalar
subquery's result used as an interval bound.

A [`PIVOT ... FOR ... IN (SELECT ...)`](/docs/query/sql/pivot/) subquery runs
when the statement compiles, to find the pivot's columns. When it reads an
audited view, it records a row at that point, even if the statement is only
prepared or fails later. Executing the statement then records another.

When one statement mentions the same view more than once, in a join, a union,
or a subquery, the view records one row for each distinct set of parameter
values. References that resolve to the same values are one read and share a
row. Values are compared as rendered, so `1` and `1.0` count as different
values.

These record nothing:

- A statement refused before it runs: a syntax error, an unknown column or
  function, an `AUDITED` value that
  [cannot be audited](#values-that-cannot-be-audited), or a principal without
  `SELECT` on the view. Access is checked when the statement compiles, so a
  denied attempt to read an audited view is usually not in the trail. The
  exception is a cached or prepared plan, which is checked again when it runs:
  a refusal there records a row with status `error`. The plan can come from an
  earlier execution of the same SQL text, or from a statement prepared before a
  `REVOKE`.
- `CREATE VIEW`, `CREATE MATERIALIZED VIEW`, `ALTER VIEW` and
  `CREATE OR REPLACE VIEW` whose query reads an audited view, when the check
  passes. Each opens its query only to check it, and hands no rows to anyone. A
  check that fails while it runs records a row with status `error`, like any
  read that fails, because its error message can carry values from the rows it
  read.
- Reads the database runs on its own behalf: materialized view refreshes, WAL
  apply, and view compilation, including
  [`COMPILE VIEW`](/docs/query/sql/compile-view/). No principal is reading data
  there.
- An attempt that fails before it reads anything, because its plan went stale
  when a view or table changed after it compiled, or because a reader pool was
  full. The server recompiles and retries a stale plan, and the retry records
  the read.
- An `UPDATE` of a WAL table. See [Limitations](#limitations).

## Audited views that read other audited views

An audited view read inside the body of another audited view records no row of
its own when the outer view's row covers it. The outer view covers the inner
one when every variable the inner view declares `OVERRIDABLE AUDITED` is also
declared `AUDITED` in the outer view, by name, overridable or not. Those are the
only values a caller can change through the outer view, so the outer row then
shows everything the caller chose.

An inner view with no `OVERRIDABLE AUDITED` variables is always covered. So an
audited view that unions several audited views with fixed or no audited
parameters records one row, for itself.

An inner view that is not covered keeps its row, because a caller's value can
reach it through the outer view without appearing on the outer row:

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

The rule in full:

- Coverage is checked against the outermost audited view around the read,
  through any views between them, audited or not.
- A view that is not audited never covers another. An audited view read
  through a plain view always records its row.
- A reference to the inner view outside the outer view, in the same statement,
  records as usual. If it resolves the same values as an inner read that is not
  covered, the two share one row.
- When an inner view is covered, its `AUDITED` variables that are not
  `OVERRIDABLE` are not recorded. Read directly, the view records them.
- Coverage depends only on the view definitions, so a given statement always
  records the same set of views.

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
  server logs `view audit queue is full, dropping rows` with a running total,
  on the first drop and every 1024th after that. Raise the capacity if this
  appears during bursts of audited reads, or the size limit if the reads carry
  large parameters.
- **The read cannot copy its row into the queue**, for example when the heap is
  exhausted. The server logs `could not record view audit row`.
- **The job fails to write a batch.** The batch, up to 1024 rows, is lost, and
  the server logs `could not write view audit rows` with the number lost.
- **The audit table cannot take rows**: a column is missing or has the wrong
  type, `ts` is not its designated timestamp, or it is not a WAL table. This
  happens only to a table of that name that predates the upgrade to audited
  views, or, with access control off, to one converted to non-WAL: the server
  creates the table in the right shape, and [SQL cannot change](#protection)
  its columns. The server logs the reason once, and discards audit rows until
  it restarts with the table repaired. Convert a non-WAL table with
  [`ALTER TABLE SET TYPE WAL`](/docs/query/sql/alter-table-set-type/).
- **The server stops or crashes with rows still in the queue.** The queue is
  held in memory only.

Lost rows show in the server log only. No metric reports them.

## Permissions

| Action                                                              | Permissions                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| Create a view `WITH AUDIT`                                          | `CREATE VIEW` and `AUDIT VIEW`, and `SELECT` on the tables it reads |
| Drop an audited view, with `DROP VIEW` or `DROP ALL TABLES`         | `DROP VIEW` on the view and `AUDIT VIEW`                  |
| Change an audited view with `ALTER VIEW` or `CREATE OR REPLACE VIEW` | `ALTER VIEW` on the view and `AUDIT VIEW`                 |
| Read an audited view                                                | `SELECT` on the view, as for any [view](/docs/concepts/views/#definer-security-model-enterprise) |
| Read the trail                                                      | `SELECT` on `sys.view_audit`                              |
| Remove rows from the trail                                          | Any of `TRUNCATE TABLE`, `DROP PARTITION`, `DETACH PARTITION`, `SET TABLE PARAM` (for `SET TTL`) or `SET STORAGE POLICY` (for a `DROP LOCAL` stage), on `sys.view_audit` or `ON ALL TABLES` |

`AUDIT VIEW` is a database-level permission, included in `ALL` and
`DATABASE ADMIN`. It guards every statement that binds a view to the trail,
changes what it records, or releases it: creating, redefining and dropping an
audited view. A new body can remove the view's `AUDITED` declarations, or keep
a variable `OVERRIDABLE` while no longer recording it, so without the
permission a principal who can alter a view, or drop and recreate it, could
shed its auditing unremarked. See [Syntax](#syntax) for how each statement
treats a view's auditing.

:::note

A database-level `GRANT ALL` includes `DATABASE ADMIN`, which also covers
permissions added in later versions. So a principal granted `ALL` before the
upgrade to audited views holds `AUDIT VIEW`, and can create, alter and drop
audited views. A principal that holds individual permissions without
`DATABASE ADMIN` needs it granted explicitly:
`GRANT AUDIT VIEW TO view_admins;`.

:::

Grant readers `SELECT` on the audited view and not on the tables it reads. A
principal who can read those tables, directly or through a view that is not
audited, reads the same data with no audit row. Under the
[definer model](/docs/concepts/views/#definer-security-model-enterprise),
`SELECT` on the view, plus an endpoint permission such as `HTTP` or `PGWIRE` to
connect, is all a reader needs.

`SELECT ON ALL TABLES` covers `sys.view_audit` and every table an audited view
reads. Its holder bypasses auditing, and can read the whole trail, with every
principal's `params`. Give readers of audited views `SELECT` on the views
instead, and check existing grants, such as the analyst roles in
[RBAC](/docs/security/rbac/#read-only-analyst), for this one.

Grant `SELECT` on `sys.view_audit` to the people who review the trail, and the
permissions that remove its rows only to the operators who manage its
retention. A grant of those permissions `ON ALL TABLES` covers the trail too, so
review existing grants as well. No principal can write rows to it, whatever it
holds: see [Tamper protection](#protection).

## Replication, backups, and read-only instances

Every node records the reads it serves, replicas included, into its own
`sys.view_audit`. The rows are not replicated between nodes, so the complete
trail is the union of the tables on all nodes. The rows carry no node
identifier, so tag each node's rows with its name when you merge them.

A replica does not create `sys.view_audit` itself. The table's definition
reaches the replica from the primary, and the replica writes the reads it
serves into that table. The table's storage policy, and any later change to
it, reach the replica the same way. Until the definition arrives, the replica
keeps its audit rows in the queue, and a read whose row finds the queue full
goes unrecorded, as in [Delivery guarantees](#delivery). This matters only for
a replica that starts before its primary has created the table, such as when
replicas are upgraded first. A replica promoted to primary before the table reached it
creates the table itself, with
[`view.audit.storage.policy`](/docs/configuration/audited-views/#viewauditstoragepolicy).

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

A node restored from a backup taken before audited views existed creates the
table at startup without a storage policy, and logs an advisory with the
`ALTER TABLE ... SET STORAGE POLICY` statement that applies it.

An instance started with `readonly=true` cannot write the trail, so it refuses
reads of audited views with
`cannot read an audited view on a read-only instance`. Views that are not
audited are unaffected.

## Limitations

- **Only reads through the audited view are recorded.** A principal with
  `SELECT` on the tables the view reads, or on a view over them that is not
  audited, reads the same rows with no audit row. This includes the view's
  owner, which needs `SELECT` on those tables to create the view: use an owner
  that nobody reads data as. Grant readers `SELECT` on the audited view and not
  on its tables, as in [Permissions](#permissions).
- **A materialized view over an audited view is not audited.** Its refreshes
  record nothing, reads of the materialized view are not audited, and
  `CREATE MATERIALIZED VIEW` records nothing either. A principal who can read an
  audited view and create materialized views can therefore make its data
  readable with no audit row. Grant `CREATE MATERIALIZED VIEW` with that in
  mind. A [live view](/docs/concepts/live-views/) cannot be defined over a
  view, so it cannot be used this way.
- **An `UPDATE` of a WAL table records nothing** when it reads an audited view,
  because its read runs during WAL apply, on every node, rather than in the
  session that submitted it. Such an `UPDATE` is rare: a WAL table's `UPDATE`
  cannot join or read another table, so it can read an audited view only in a
  subquery, and only one whose query reads the updated table alone. The same
  statement on a non-WAL table is recorded.
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
