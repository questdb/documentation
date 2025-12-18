---
title: LIMIT keyword
sidebar_label: LIMIT
description: LIMIT SQL keyword reference documentation.
---

Specify the number and position of records returned by a
[SELECT statement](/docs/reference/sql/select/).

Other implementations of SQL, sometimes use clauses such as `OFFSET` or `ROWNUM`
Our implementation uses `LIMIT` for both the offset from start and limit.

## Syntax

![Flow chart showing the syntax of the LIMIT keyword](/images/docs/diagrams/limit.svg)

- `numberOfRecords` is the number of records to return.
- `upperBound` and `lowerBound` is the range of records to return.

Here's the exhaustive list of supported combinations of arguments. `m` and `n`
are positive numbers, and negative numbers are explicitly labeled `-m` and `-n`.

- `LIMIT n` = `LIMIT n, 0` = `LIMIT 0, n` = `LIMIT n,` = `LIMIT , n`: take the
  first `n` records
- `LIMIT -n` = `LIMIT -n, 0` = `LIMIT -n,`: take the last `n` records
- `LIMIT m, n`: take the first `n` records, then drop the first `m` records from
  that. The result is the range of records `(m, n]` (number 1 denotes the first
  record). If `m > n`, implicitly swap the arguments.
- `LIMIT -m, -n`: take the last `m` records, then drop the last `n` records from
  that. The result is the range of records `[-m, -n)` (number -1 denotes the
  last record). If `m < n`, implicitly swap them.
- `LIMIT m, -n`: drop the first `m` and the last `n` records. This gives you the
  range `(m, -n)`. These arguments will not be swapped.

## Examples

Examples use this schema and dataset:

```questdb-sql
CREATE TABLE tango (id LONG);
INSERT INTO tango VALUES (1), (2), (3), (4), (5), (6), (7), (8), (9), (10);
```

```questdb-sql title="First 5 records"
SELECT * FROM tango LIMIT 5;

 id
----
 1
 2
 3
 4
 5
```

```questdb-sql title="Last 5 records"
SELECT * FROM tango LIMIT -5;


 id
----
 6
 7
 8
 9
 10
```

```questdb-sql title="Records 3, 4, 5"
SELECT * FROM tango LIMIT 2, 5;

 id
----
 3
 4
 5
```

```questdb-sql title="Records -5, -4"
SELECT * FROM tango LIMIT -5, -3;

 id
----
 6
 7
```

```questdb-sql title="Records 3, 4, ..., -3, -2"
SELECT * FROM tango LIMIT 2, -1;

 id
----
 3
 4
 5
 6
 7
 8
 9
```

```questdb-sql title="Implicit argument swap, records 3, 4, 5"
SELECT * FROM tango LIMIT 5, 2;

 id
----
 3
 4
 5
```

```questdb-sql title="Implicit argument swap, records -5, -4"
SELECT * FROM tango LIMIT -3, -5;

 id
----
 6
 7
```
