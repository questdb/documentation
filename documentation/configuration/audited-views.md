---
title: Audited views
description: Configuration settings for audited views in QuestDB Enterprise.
---

:::note

Audited views are [Enterprise](/enterprise/) only.

:::

An audited view records each read of it in the `sys.view_audit` table. These
settings control the in-memory queue that carries rows from the reading query
to the background job that writes them, and the storage policy the table is
created with.

For details, see [Audited views](/docs/security/audited-views/).

## view.audit.queue.capacity

- **Default**: `4096`
- **Reloadable**: no

Number of audit rows the queue holds between the queries that read audited
views and the job that writes them to `sys.view_audit`. The value is rounded up
to a power of two, and the queue is allocated on the heap at startup.

Recording never makes a read wait. When the queue is full, the read still runs,
its row is dropped, and the server logs `view audit queue is full, dropping
rows`. Raise the capacity if that message appears during bursts of audited
reads. Auditing is lossy by design: see
[Delivery](/docs/security/audited-views/#delivery) for every case in which a
read goes unrecorded.

## view.audit.storage.policy

- **Default**: `TO PARQUET 1d`
- **Reloadable**: no

[Storage policy](/docs/concepts/storage-policy/) that `sys.view_audit` is
created with. The default converts each daily partition to Parquet one day
after the partition ends. An audit trail is append-only and read cold, and
every partition converts once whatever the threshold, so a longer one keeps
native files around without saving any work.

The setting applies only when the server creates the table at startup, which
a primary does and a replica does not: a replica takes the table, and its
policy, from the primary. It does not change the policy of a table that already
exists: use
[`ALTER TABLE SET STORAGE POLICY`](/docs/query/sql/alter-table-set-storage-policy/)
for that. Set the property to an empty value to create the table with no
storage policy. If the server rejects the policy, it logs the error and creates
the table without one.
