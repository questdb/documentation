---
title: Replication Layer
slug: replication-layer
description: QuestDB Enterprise supports horizontal scalability for reads with read replicas, and for writes with multi-primary.
---



## Replication

- **Read replicas:** QuestDB uses object storage (via NFS, S3, Azure Blob Storage, or GCS)
and read replicas. Both local, cross-zonal, and cross-regional replication patterns are
supported. The architecture is described at the [replication concepts](/docs/concept/replication/)
page.

- **Write replicas:** QuestDB allows [multi-primary ingestion](/docs/operations/multi-primary-ingestion/), which allows both increasing the write throughput, and enabling
high availabilty. A [distributed sequencer](/docs/operations/multi-primary-ingestion/#distributed-sequencer-with-foundationdb) makes sure transactions are conflict-free, and
tracks status of the cluster to enable instance discovery and automatic failover.

## Next Steps

- Back to the [QuestDB Architecture](/docs/guides/architecture/questdb-architecture) overview
- [QuestDB GitHub Repository](https://github.com/questdb/questdb)
- [QuestDB Documentation](/docs)

