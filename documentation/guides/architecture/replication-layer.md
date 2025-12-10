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

<Screenshot
  alt="Architecture of a Multi-Primary Cluster with Multiple Read-Replicas"
  title="Architecture of a Multi-Primary Cluster with Multiple Read-Replicas"
  src="/images/guides/architecture/replication.svg"
  width={1000}
  forceTheme="dark"
/>

### Type of instances on a replicated QuestDB cluster

#### Primary Instances

Primary instances offer the same features as stand-alone instances, supporting both reads and writes. To keep the
overhead of replication to a minimum, primary instances only ship WAL segments to the designated object store. There
is no communication between the primary and the replicas. Metadata is also replicated to the object store to avoid any
inconsistencies between different instances in the cluster.

A typical replicated deployment will have at least one primary and one replica, but it is also possible to set up a
primary to replicate changes to the object store, even if there are no read replicas configured. The replicated data
could be used for point-in-time recovery.

For demanding scenarios, QuestDB Enterprise allows [multi-primary ingestion](/docs/operations/multi-primary-ingestion/),
which allows both increasing the write throughput, and enabling high availability. In order to enable multi-primary ingestion,
a `Distributed Sequencer` instance will need to be created.


#### Read Replicas

Read Replicas are designed to distribute data and load across multiple locations and instances. Each replica can have
different hardware configuration, to allow for optimizations depending on the usage.

Replicas can be local, cross-zonal, or cross-regional. As long as the replicas can read metadata and WAL segments from
the object store, they will catch up with the data ingested by the primaries.

At the moment of writing this guide, read replicas will replicate from all tables and partitions from the primaries.

In the event of a Primary instance failing, any Read Replica can be
promoted as a new Primary. See our [Disaster Recovery](/docs/operations/replication/#disaster-recovery) documentation for details of the
different failover modes.

#### Distributed Sequencer

When multi-primary ingestion is configured, it is necessary to coordinate writes, to ensure transactions are consistent
and conflict-free.

The sequencer coordinates transactions by assigning monotonic transaction numbers to writes. The distributed sequencer
uses [FoundationDB](https://www.foundationdb.org/) as the backend for storing transaction metadata and enabling synchronization
across primaries.

#### Highly-Available Writes Using a Single Primary

You can get highly available writes without the need for a multi primary cluster.

QuestDB ILP clients allow you to configure multiple URLs in the connection string. When you have a cluster composed of a single primary and one or more replicas, the clients will initially connect to the primary instance at startup. If the primary becomes unavailable and a read replica is promoted to the new primary, the clients will automatically resume sending data to this new primary.

During the failover, which can take about 30 seconds, writes are paused on the client side, and reads remain available from the other read replicas in the cluster.

Refer to the [ILP overview](/docs/reference/api/ilp/overview/#multiple-urls-for-high-availability) for more details.

#### Bring Your Own Cloud (BYOC)

QuestDB Enterprise can be fully managed by the end user, or it can be managed in collaboration with QuestDB's team under the [BYOC model](/byoc).

<Screenshot
  alt="Diagram of the Bring Your Own Cloud Architecture"
  title="Diagram of the Bring Your Own Cloud Architecture"
  src="/images/guides/architecture/bring-your-own-cloud.png"
  width={1000}
  forceTheme="dark"
/>

With BYOC, the QuestDB team handles operations of all primary and replica instances directly on the user’s infrastructure. QuestDB manages infrastructure in a standard way depending on the cloud provider chosen by the customer. For example, when deploying BYOC on AWS, the QuestDB team uses CloudFormation, and when using Azure, it uses Lighthouse. BYOC managed infrastructure is fully owned and auditable by the customer.

## Next Steps

- Back to the [QuestDB Architecture](/docs/guides/architecture/questdb-architecture) overview
- [QuestDB GitHub Repository](https://github.com/questdb/questdb)
- [QuestDB Documentation](/docs)
