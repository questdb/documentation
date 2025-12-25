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

QuestDB is a time-series database optimized for fast ingestion and SQL queries.
It uses a column-oriented storage model, memory-mapped files, and SIMD
instructions to run analytical queries with low latency. QuestDB extends SQL
with time-series operations like `SAMPLE BY`, `LATEST ON`, `ASOF JOIN`, and
`WINDOW JOIN`. See [Architecture](/docs/guides/architecture/questdb-architecture/)
for details on how QuestDB works.

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

## Guides

<Guides />

## Resources

<Resources />
