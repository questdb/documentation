---
title: Audited views configuration
sidebar_label: Audited views
description: Configuration settings for audited views in QuestDB Enterprise.
---

:::note

Audited views are [Enterprise](/enterprise/) only.

:::

An audited view records each read of it in the `sys.view_audit` table. These
settings control how large a read's recorded parameters may be, the in-memory
queue that carries rows from the reading query to the background job that
writes them, and the storage policy the table is created with.

None of these settings are reloadable: changing any of them requires a restart.
The server checks the values at startup, and refuses to start, naming the
property, when a numeric value is out of range.

For example, to absorb longer bursts of audited reads and keep 90 days of the
trail:

```ini title="server.conf"
view.audit.queue.capacity=16384
view.audit.queue.params.max.size=256M
view.audit.storage.policy=TO PARQUET 1d, DROP LOCAL 90d
```

For details, see [Audited views](/docs/security/audited-views/).

## view.audit.params.max.size

- **Default**: `1M` (1 MiB)
- **Reloadable**: no
- **Range**: `1024` to `268435455` (1 KiB to 256 MiB minus one byte, the
  largest value a `VARCHAR` column holds)

Largest `params` value, in bytes, that one read of an audited view may record.
A read whose audited parameters render past it is refused with
`view audit parameters are too large to record, the read is refused`, and
records a row with status `error` and `NULL` in `params`. This keeps a caller
from passing a value too large to record, such as a very long override of a
list or text parameter.

## view.audit.queue.capacity

- **Default**: `4096`
- **Reloadable**: no
- **Range**: `1` to `1073741824` (2<sup>30</sup>)

Number of audit rows the queue holds between the queries that read audited
views and the job that writes them to `sys.view_audit`. The value is rounded up
to a power of two, and the queue is allocated on the heap at startup.

Recording never makes a read wait. When the queue is full, the read still runs,
its row is dropped, and the server logs `view audit queue is full, dropping
rows`. Raise the capacity if that message appears during bursts of audited
reads. Auditing is lossy by design: see
[Delivery guarantees](/docs/security/audited-views/#delivery) for every case in
which a read goes unrecorded.

## view.audit.queue.params.max.size

- **Default**: `64M` (64 MiB)
- **Reloadable**: no
- **Range**: at least [`view.audit.params.max.size`](#viewauditparamsmaxsize)

Total size, in bytes, that the `params` of the rows waiting in the queue may add
up to. It bounds the heap the queue can hold, which the slot count alone does
not: each slot can hold up to
[`view.audit.params.max.size`](#viewauditparamsmaxsize). A read whose row does
not fit is still served, and its row is dropped as on a full queue, with the
same log message.

The lower bound ensures that a read within `view.audit.params.max.size` always
fits an empty queue.

## view.audit.storage.policy

- **Default**: `TO PARQUET 1d`
- **Reloadable**: no

[Storage policy](/docs/concepts/storage-policy/) that `sys.view_audit` is
created with. The value is the list of stages written inside
`SET STORAGE POLICY(...)`, separated by commas, such as
`TO PARQUET 1d, DROP LOCAL 90d`. The default converts each daily partition to
Parquet one day after the partition ends, and never deletes a row. An audit
trail is append-only and read cold, and every partition converts once whatever
the threshold, so a longer one keeps native files around without saving any
work.

- The setting applies only when a server creates the table: a primary at
  startup, or a replica promoted to primary before the table reached it. A
  replica otherwise takes the table, and its policy, from the primary.
- A node restored from a backup taken before audited views existed creates the
  table without a policy, whatever this setting says, and logs the statement
  that applies it.
- It does not change the policy of a table that already exists. Use
  [`ALTER TABLE SET STORAGE POLICY`](/docs/query/sql/alter-table-set-storage-policy/)
  for that.
- Set the property to an empty value to create the table with no storage
  policy. If the server rejects the policy, it logs the error and creates the
  table without one.
- A policy with `TO REMOTE` or `DROP REMOTE` is always rejected, because each
  node keeps its own trail under the same table name: see
  [Retention](/docs/security/audited-views/#retention).
