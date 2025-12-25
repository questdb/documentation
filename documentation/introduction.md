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

QuestDB is an open source, high-performance time-series database:

**Low-latency architecture** — sub-millisecond queries on billions of rows\
**High-throughput ingestion** — millions of rows per second\
**Fast SQL with time-series extensions** — SAMPLE BY, LATEST ON, ASOF JOIN\
**Open formats** — built on Parquet, no vendor lock-in\
**AI-ready** — query with LLMs or use BYOK AI in the Web Console

Used in capital markets, fintech, crypto, energy, heavy industry, space exploration, and robotics.

<div className="not-prose mb-16 mt-6 flex gap-3">
  <DocButton href="/quick-start" arrow="right" style={{ marginRight: '20px' }}>
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

1. **[Quick start](/docs/quick-start/)** - Install and run QuestDB
2. **[Schema design](/docs/guides/schema-design-essentials/)** - Design your tables
3. **[Ingest data](/docs/ingestion-overview/)** - Bring your data using QuestDB clients
4. **[Query data](/docs/reference/sql/overview/)** - Analyze with SQL

<div className="not-prose">
  <DocButton href="/docs/why-questdb/" variant="text" arrow="right">
    <>Why choose QuestDB?</>
  </DocButton>
</div>

## Guides

<Guides />

## Resources

<Resources />
