---
title: Introduction
slug: /
description:
  Official QuestDB documentation covering installation, data ingestion, SQL
  reference, and operations for both open source and Enterprise editions.
custom_edit_url: null
---

import { Guides } from "../src/components/Guides"
import { Resources } from "../src/components/Resources"
import { HeroPattern } from "../src/components/HeroPattern"
import { DocButton } from "../src/components/DocButton"

QuestDB is an open source time-series database engineered for low latency. It uses a column-oriented, time-partitioned storage engine with memory-mapped files and vectorized (SIMD) execution to support high-throughput ingestion and millisecond-level analytical queries. The system is built from scratch with a zero-GC Java core and focused C++/Rust components, in a compact codebase optimized for cache locality and predictable tail latency. SQL is extended with time-series operators such as `SAMPLE BY`, `LATEST ON`, `ASOF JOIN`, and `WINDOW JOIN`. See [Architecture](https://questdb.com/docs/architecture/questdb-architecture/) for details.

<div className="not-prose mb-16 mt-6 flex gap-3">
  <DocButton href="/docs/getting-started/quick-start/" arrow="right" style={{ marginRight: '20px' }}>
    <>Quick start</>
  </DocButton>

  <DocButton href="https://demo.questdb.io" variant="outline" style={{ marginRight: '20px' }}>
    <>Live demo</>
  </DocButton>
</div>

## About this documentation

This documentation covers both **QuestDB Open Source** and **QuestDB Enterprise**.

QuestDB Enterprise builds on top of QuestDB Open Source, using it as its core
library. Everything in open source works in Enterprise, but not the other way
around. Enterprise adds features like high availability, advanced security, RBAC,
automated backups, and multi-tier storage with seamless object storage integration.

## Get started

1. **[Quick start](/docs/getting-started/quick-start/)** - Install and run QuestDB
2. **[Schema design](/docs/schema-design-essentials/)** - Design your tables
3. **[Ingest data](/docs/ingestion/overview/)** - Bring your data using QuestDB clients
4. **[Query data](/docs/query/overview/)** - Analyze with SQL

## Guides

<Guides />

## Resources

<Resources />
