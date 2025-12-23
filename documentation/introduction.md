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

QuestDB is a high-performance time-series database optimized for fast ingestion
and SQL analytics.

It handles millions of rows per second with sub-millisecond queries, making it
ideal for financial data, IoT, and real-time analytics.

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
around. Enterprise adds features like high availability, advanced security, and
RBAC.

Sections specific to QuestDB Enterprise are marked with an **Enterprise** label.

## Get started

1. **[Quick start](/docs/quick-start/)** - Install and run QuestDB
2. **[Ingest data](/docs/ingestion-overview/)** - Bring your data using ILP clients or SQL
3. **[Query data](/docs/reference/sql/select/)** - Analyze with SQL

<div className="not-prose">
  <DocButton href="/docs/why-questdb/" variant="text" arrow="right">
    <>Why choose QuestDB?</>
  </DocButton>
</div>

## Guides

<Guides />

## Resources

<Resources />
