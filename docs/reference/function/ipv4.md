---
title: IPv4 Supported SQL Functions
sidebar_label: IPv4
description: A list of SQL functions supported by the IPv4 data type.
---

The IPv4 datatype supports many functions.

For the full list of IPv4 Operators and more detailed syntax, see the [IPv4 Operators page](/docs/reference/operators/ipv4/).

## Supported SQL Functions

| Command | Example SQL Statement |
|---------|---------------|
| **CASE** | `SELECT ip, bytes, CASE WHEN ip << '2.65.32.1/2' THEN 1 ELSE 0 END FROM example` |
| **COUNT** | `SELECT COUNT(ip), bytes FROM example` |
| **FIRST** | `SELECT FIRST(ip) FROM example` |
| **LAST** | `SELECT LAST(ip) FROM example` |
| **FULL JOIN** | `SELECT a.count, a.ip, b.ip2, b.count2 FROM '*!*example' a JOIN '*!*example2' b ON b.ip2 = a.ip` |
| **GROUP BY** | `SELECT COUNT(count), ip FROM example GROUP BY ip` |
| **COUNT_DISTINCT** | `SELECT COUNT_DISTINCT(ip) FROM example` |
| **DISTINCT** | `SELECT DISTINCT ip FROM example ORDER BY ip` |
| **SELECT** | `SELECT ip FROM x EXCEPT SELECT ip2 FROM y` |
| **INTERSECT** | `SELECT ip FROM x INTERSECT SELECT ip2 FROM y` |
| **ISORDERED** | `SELECT ISORDERED(ip) FROM example` |
| **NULLIF** | `SELECT k, NULLIF(ip, '0.0.0.5') FROM example` |
| **RANK** | `SELECT ip, bytes, RANK() OVER (ORDER BY ip ASC) rank FROM example ORDER BY rank` |
| **UNION** | `SELECT ip FROM x UNION SELECT ip2 FROM y` |
| **UNION ALL** | `SELECT ip FROM x UNION ALL SELECT ip2 FROM y` |
| **INNER JOIN** | `SELECT example.count, example2.count2 FROM example INNER JOIN example2 ON example2.ip2 = example.ip` |
| **LATEST BY** | `SELECT * FROM example LATEST BY ip` |
| **LEFT JOIN** | `SELECT example.ip, example2.ip2, example.count, example2.count2 FROM example LEFT JOIN example2 ON example2.ip2 = example.ip` |
| **MAX** | `SELECT MAX(ip) FROM example` |
| **MIN** | `SELECT MIN(ip) FROM example` |
| **ORDER BY** | `SELECT * FROM example ORDER BY ip, bytes, ts` |
| **SAMPLE BY** | `SELECT ip, ts, SUM(bytes) FROM example SAMPLE BY 1y ORDER BY 2,1` |
| **WHERE** | `SELECT * FROM example WHERE ip = '0.0.0.1'` |