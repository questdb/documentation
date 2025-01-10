---
title: Time To Live (TTL)
sidebar_label: Time To Live (TTL)
description: Conceptual overview of the time-to-live feature in QuestDB. Use it to limit data size.
---

If you're interested in storing and analyzing only recent data with QuestDB, you
can configure a time-to-live (TTL) for the table data. Both the `CREATE TABLE`
and `ALTER TABLE` commands support the `TTL` clause.

This feature works as follows:

1. The age of the data is measured by the most recent timestamp stored in the table
2. As you keep inserting time-series data, the age of the oldest data starts
   exceeding its TTL limit
3. When **all** the data in a partition becomes stale, the partition as a whole
   becomes eligible to be dropped
4. QuestDB detects a stale partition and drops it as a part of the commit
   operation

To be more precise, the latest timestamp stored in a given partition does not
matter. Instead, QuestDB considers the entire time period for which a partition
is responsible. As a result, it will drop the partition only when the end of
that period falls behind the TTL limit. This is a compromise that favors a low
overhead of the TTL enforcement procedure.

To demonstrate, assume we have created a table partitioned by hour, with TTL set
to one hour:

```sql
CREATE TABLE tango (ts TIMESTAMP) timestamp (ts) PARTITION BY HOUR TTL 1 HOUR;
-- or:
CREATE TABLE tango (ts TIMESTAMP) timestamp (ts) PARTITION BY HOUR TTL 1H;
```

1\. Insert the first row at 8:00 AM. This is the very beginning of the "8 AM"
partition:

```sql
INSERT INTO tango VALUES ('2025-01-01T08:00:00');
```

| ts |
|----|
| 2025-01-01 08:00:00.000000 |

2\. Insert the second row one hour later, at 9:00 AM:

```sql
INSERT INTO tango VALUES ('2025-01-01T09:00:00');
```

| ts |
|----|
| 2025-01-01 08:00:00.000000 |
| 2025-01-01 09:00:00.000000 |

The 8:00 AM row remains.

3\. Insert one more row at 9:59:59 AM:

```sql
INSERT INTO tango VALUES ('2025-01-01T09:59:59');
```

| ts |
|----|
| 2025-01-01 08:00:00.000000 |
| 2025-01-01 09:00:00.000000 |
| 2025-01-01 09:59:59.000000 |

The 8:00 AM data is still there, because the "8 AM" partition ends at 9:00 AM.

4\. Insert a row at 10:00:

```sql
INSERT INTO tango VALUES ('2025-01-01T10:00:00');
```

| ts |
|----|
| 2025-01-01 09:00:00.000000 |
| 2025-01-01 09:59:59.000000 |
| 2025-01-01 10:00:00.000000 |

Now the whole "8 AM" partition is outside its TTL limit, and has been dropped.
