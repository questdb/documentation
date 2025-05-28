---
title: Replication Layer
slug: replication-layer
description: QuestDB Enterprise supports horizontal scalability for reads with read replicas, and for writes with multi-primary.
---


## Replication

QuestDB Enterprise offers primary-replica replication with eventual consistency. Replication in QuestDB operates by
designating a single "primary" database that uploads Write Ahead Log (WAL) files to a remote object store. These files
can be downloaded and applied by any number of "replica" instances, either continuously or at a later time.

Full details of replication can be found at the [replication concepts](/docs/concept/replication/)
page.

### Type of instances on a replicated QuestDB cluster

#### Primary instances

Primary instances offer the same features as stand-alone instances, supporting both reads and writes. To keep the
overhead of replication to a minimum, primary instances only ship WAL segments to the designated object store. There
is no communication between the primary and the replicas. Metadata is also replicated to the object store to avoid any
inconsistencies between different instances in the cluster.

A typical replicated deployment will have at least one primary and one replica, but it is also possible to set up a
primary to replicate changes to the object store, even if there are no read replicas configured. The replicated data
could be used for point-in-time recovery.

For demanding scenarios, QuestDB Enterprise allows [multi-primary ingestion](/docs/operations/multi-primary-ingestion/),
which allows both increasing the write throughput, and enabling high availabilty. In order to enable multi-primary ingestion,
a `Distributed Sequencer` instance will need to be created.


#### Read Replicas

Read Replicas are designed to distribute data and load across multiple locations and instances. Each replica can have
different hardware configuration, to allow for optimizations depending on the usage.

Replicas can be local, cross-zonal, or cross-regional. As long as the replicas can read metadata and WAL segments from
the object store, they will catch up with the data ingested by the primaries.

At the moment of writing this guide, read replicas will replicate from all tables and partitions from the primaries.

#### Distributed Sequencer

When multi-primary ingestion is configured, it is necessary to coordinate writes, to ensure transactions are consistent
and conflict-free.

The sequencer coordinates transactions by assigning monotonic transaction numbers to writes. The distributed sequencer
uses [FoundationDB](https://www.foundationdb.org/) as the backend for storing transaction metadata and enabling synchronization
across primaries.


## Next Steps

- Back to the [QuestDB Architecture](/docs/guides/architecture/questdb-architecture) overview
- [QuestDB GitHub Repository](https://github.com/questdb/questdb)
- [QuestDB Documentation](/docs)

