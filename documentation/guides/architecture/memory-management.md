---
title: Memory Management
slug: memory-management
description: The system leverages both memory mapping and explicit memory management techniques, and integrates native code for performance-critical tasks.
---

QuestDB offers high-speed ingestion and low-latency analytics on time-series data.


## Memory management and native integration

### Memory-mapped files

- **Direct OS integration:**
  Memory-mapped files let QuestDB use the operating system's page cache. This reduces explicit
  I/O calls and speeds up sequential reads.

- **Sequential access:**
  When data partitions by incremental timestamp, memory mapping ensures that reads are
  sequential and efficient.

### Direct memory management and native integration

- **Off-heap memory usage:**
  QuestDB allocates direct memory via memory mapping and low-level APIs (such as Unsafe) to
  bypass the JVM garbage collector. This reduces latency spikes and garbage collection delays.

- **Hotpath efficiency:**
  The system pre-allocates and reuses memory in critical code paths, avoiding dynamic allocation
  on the hotpath.

- **Native code integration:**
  QuestDB uses native libraries written in C++ and Rust for performance-critical tasks. These
  native components share off-heap buffers with Java via JNI.
  - **Zero-copy interoperability:**
    Sharing memory between Java and native code minimizes data copying and reduces latency.
  - **Hybrid architecture:**
    This integration lets QuestDB use Java for rapid development and C++/Rust for low-level,
    high-performance routines.

## Next Steps

- Back to the [QuestDB Architecture](/docs/guides/architecture/questdb-architecture) overview
- [QuestDB GitHub Repository](https://github.com/questdb/questdb)
- [QuestDB Documentation](/docs)



