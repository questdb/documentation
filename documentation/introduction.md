---
title: Introduction
slug: /
description:
  The official QuestDB documentation. Learn how to accelerate your time-series, capital markets, and heavy industry use cases.
custom_edit_url: null
---

import { Guides } from '../src/components/Guides'
import { Resources } from '../src/components/Resources'
import { HeroPattern } from '../src/components/HeroPattern'
import { DocButton } from '../src/components/DocButton'

<HeroPattern />

QuestDB is a top performance database that specializes in time-series.

It offers **category-leading ingestion throughput** and **fast SQL queries**
with operational simplicity.

Given its effiency, QuestDB **reduces operational costs**, all while overcoming
ingestion bottlenecks.

As a result, QuestDB offers amplifies intensive **time-series**, **capital market**, and **heavy industry** use cases.

<div className="not-prose mb-16 mt-6 flex gap-3">
  <DocButton href="/quick-start" arrow="right" style={{ marginRight: '20px' }}>
    <>Quickstart</>
  </DocButton>

  <DocButton href="/docs/ingestion-overview/#first-party-clients" variant="outline" style={{ marginRight: '20px' }}>
    <>Explore clients</>
  </DocButton>

  <DocButton href="/docs/why-questdb/" variant="outline" style={{ marginRight: '20px' }}>
    <>Why QuestDB?</>
  </DocButton>

  <DocButton href="https://demo.questdb.io" variant="outline" style={{ marginRight: '20px' }}>
    <>Try live demo</>
  </DocButton>
</div>

## Ingest your data

The first step is to get your data into QuestDB. 

We've got a range of first-party clients, protols and methods for ingestion. 

Whether you're using first-party or interfacing with a third-party tool or library, we've got you covered.

<div className="not-prose">
  <DocButton href="/docs/ingestion-overview/" variant="text" arrow="right">
    <>Read the ingestion overview</>
  </DocButton>
</div>

## QuestDB Enterprise

QuestDB Enterprise offers everything from open source, plus additional features
for running QuestDB at greater scale or significance.

<div className="not-prose">
  <DocButton href="/enterprise/" variant="text" arrow="right">
    <>Learn more</>
  </DocButton>
</div>

## Guides

<Guides />

## Resources

<Resources />
