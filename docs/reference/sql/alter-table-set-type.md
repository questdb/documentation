---
title: ALTER TABLE SET TYPE
sidebar_label: SET TYPE
description: ALTER TABLE SET TYPE SQL keyword reference documentation.
---

Converts a non-WAL table to WAL, or a WAL table to non-WAL.

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/img/docs/diagrams/alterTable.svg)

![Flow chart showing the syntax of ALTER TABLE with SET TYPE keyword](/img/docs/diagrams/setType.svg)

## Description

The command schedules the conversion of the specified table to WAL or non-WAL type.
The actual conversion takes place on the next restart of the server.

If the command issued more than once before the restart, the last command overrides all previous ones.

If the target type of the conversion is the same as the current type of the table, the conversion request is ignored.

## Examples

To convert a non-WAL table to WAL:

```
ALTER TABLE weather SET TYPE WAL;
restart instance
```

To convert a WAL table to non-WAL:

```
ALTER TABLE weather SET TYPE BYPASS WAL;
restart instance
```
