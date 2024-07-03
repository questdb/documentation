---
title: Log
description: Details about QuestDB log
---

QuestDB log provides database information. This page presents log level, their
details, and where to configure and find the log.

## Log location

### QuestDB open source

QuestDB creates the following file structure in its
[root_directory](/docs/concept/root-directory-structure/):

```filestructure
questdb
├── conf
├── db
├── log
├── public
└── snapshot (optional)
```

Log files are stored in the `log` folder:

```filestructure
├── log
│   ├── stdout-2020-04-15T11-59-59.txt
│   └── stdout-2020-04-12T13-31-22.txt
```

## Log levels

QuestDB log provides the following types of log information:

| Type     | Marker | Details                                                                                                                                                                                                           | Default  |
| -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Advisory | A      | Startup information such as hosts, listening ports, etc. Rarely used after startup                                                                                                                                | Enabled  |
| Critical | C      | Internal database errors. Serious issues. Things that should not happen in general operation.                                                                                                                     | Enabled  |
| Error    | E      | An error, usually (but not always) caused by a user action such as inserting a `symbol` into a `timestamp` column. For context on how this error happened, check for Info-level messages logged before the error. | Enabled  |
| Info     | I      | Logs for activities. Info-level messages often provide context for an error if one is logged later.                                                                                                               | Enabled  |
| Debug    | D      | Finer details on what is happening. Useful to debug issues.                                                                                                                                                       | Disabled |

For more information, see the
[source code](https://github.com/questdb/questdb/blob/master/core/src/main/java/io/questdb/log/LogLevel.java)
on GH.

### Log examples

The below is some examples of log messages by type.

Advisory:

```
2023-02-24T14:59:45.076113Z A server-main Config:
2023-02-24T14:59:45.076130Z A server-main  - http.enabled : true
2023-02-24T14:59:45.076144Z A server-main  - tcp.enabled  : true
2023-02-24T14:59:45.076159Z A server-main  - pg.enabled   : true
```

Critical:

```

2022-08-08T11:15:13.040767Z C i.q.c.p.WriterPool could not open [table=`sys.text_import_log`, thread=1, ex=could not open read-write [file=/opt/homebrew/var/questdb/db/sys.text_import_log/_todo_], errno=13]
...
2022-08-23T07:55:15.490045Z C i.q.c.h.p.JsonQueryProcessorState [77] internal error [q=`REINDEX TABLE 'weather' COLUMN timestamp LOCK EXCLUSIVE;`, ex=
...
2022-11-17T10:28:00.464140Z C i.q.c.h.p.JsonQueryProcessorState [7] Uh-oh. Error!
```

Error:

```
2023-02-24T14:59:45.059012Z I i.q.c.t.t.InputFormatConfiguration loading input format config [resource=/text_loader.json]
...
2023-03-20T08:38:17.076744Z E i.q.c.l.u.AbstractLineProtoUdpReceiver could not set receive buffer size [fd=140, size=8388608, errno=55]
...
2022-08-03T11:13:41.947760Z E server-main [errno=48] could not bind socket [who=http-server, bindTo=0.0.0.0:9000]
```

Info:

```
2020-04-15T16:42:32.879970Z I i.q.c.TableReader new transaction [txn=2, transientRowCount=1, fixedRowCount=1, maxTimestamp=1585755801000000, attempts=0]
2020-04-15T16:42:32.880051Z I i.q.g.FunctionParser call to_timestamp('2020-05-01:15:43:21','yyyy-MM-dd:HH:mm:ss') -> to_timestamp(Ss)
2020-04-15T16:42:32.880657Z I i.q.c.p.WriterPool >> [table=`table_1`, thread=12]
2020-04-15T16:42:32.881330Z I i.q.c.AppendMemory truncated and closed [fd=32]
2020-04-15T16:42:32.881448Z I i.q.c.AppendMemory open /usr/local/var/questdb/db/table_1/2020-05/timestamp.d [fd=32, pageSize=16777216]
2020-04-15T16:42:32.881708Z I i.q.c.AppendMemory truncated and closed [fd=33]
```

Debug:

```
2023-03-31T11:47:05.723715Z D i.q.g.FunctionParser call cast(investmentMill,INT) -> cast(Li)
2023-03-31T11:47:05.723729Z D i.q.g.FunctionParser call rnd_symbol(4,4,4,2) -> rnd_symbol(iiii)
2023-03-31T11:47:05.723749Z D i.q.g.FunctionParser call investmentMill * 950399 -> *(LL)
2023-03-31T11:47:05.723794Z D i.q.g.FunctionParser call cast(1672531200000000L,TIMESTAMP) -> cast(Ln)
2023-03-31T11:47:05.723803Z D i.q.g.FunctionParser call cast(1672531200000000L,TIMESTAMP) + investmentMill * 950399 -> +(NL)
```

## Log configuration

QuestDB logging can be configured globally to `DEBUG` via either providing the
java option `-Debug` or setting the environment variable `QDB_DEBUG=true`. See
[reference manual](/docs/operations/logging-metrics/#logging) for details on
logging configuration.
