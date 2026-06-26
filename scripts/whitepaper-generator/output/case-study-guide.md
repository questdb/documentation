---
title: "QuestDB Case Study"
subtitle: "Customer Collaboration Guide"
abstract: "A guide to collaborating with QuestDB on a customer case study: the information that makes for a compelling story, with guiding questions and examples drawn from published QuestDB case studies."
date: 2026-06-26
toclevel: 1
---

```{=latex}
% Doc-scoped: tighten inter-section spacing so the full reference list fits on
% the final content page (no near-empty trailing page). Other whitepapers keep
% the template default.
\titlespacing*{\section}{0pt}{14pt}{8pt}
```

Thank you for agreeing to collaborate on a case study with QuestDB! This document outlines the kind of information that makes for a compelling story. We have found that the most engaging case studies combine concrete numbers with a clear narrative arc, so readers can see both the scale and the journey.

Below you will find the key areas we would love to cover. For each section, we have included guiding questions and examples drawn from published QuestDB case studies. Please share as much or as little as you are comfortable with. We can always refine together.

## 1. Numbers and metrics

Readers engage far more with concrete data than with general statements. Specific numbers turn a good case study into a great one.

For example, "Airtel XStream Play ingests over 1 billion records per day at a sustained rate of 16,000 per second" works much better than "XStream Play handles a lot of real-time data."

### What we are looking for

- Daily or peak ingestion rates (rows per second, events per day, data volume)
- Total dataset size (row counts, storage footprint)
- Query performance numbers that matter to your workflow
- Infrastructure details: number of nodes, instance types, replication setup
- Any cost or resource savings compared to previous solutions

> **Published examples**
>
> **Reflexivity:** "Queries are on average 30x faster utilizing 1/4 of the hardware, after migrating from InfluxDB. Average query response dropped from 5 seconds to 15 ms."
>
> **XRP Ledger:** "Real-time market data for over 46,000 unique trading pairs, reducing TCO by more than 90% vs a legacy cloud-based data platform."
>
> **OKX:** "Sustained millions of records/sec ingestion across around 30 QuestDB instances, with sub-second query latency for real-time dashboards."

## 2. The story: before and after

A strong narrative shows how things improved over time. We are looking for the journey: what the previous setup looked like, what drove the decision to evaluate alternatives, and what changed after adopting QuestDB.

### Questions to consider

- What database or architecture were you using before QuestDB?
- What were the main pain points or limitations that prompted you to look for alternatives?
- Which other solutions did you evaluate, and what made you rule them out?
- What were the key requirements you needed to meet (write throughput, query language, cost, availability)?
- What measurable improvements did you see after switching to QuestDB (faster queries, lower costs, reduced hardware, new capabilities)?

> **Published examples**
>
> **Reflexivity:** Started with MongoDB and Cassandra, then standardized on InfluxDB. Their InfluxDB cluster ran on four m4.2xlarge instances with memory regularly spiking to 100%. They evaluated multiple options and QuestDB was the only one that met every criterion while reducing infrastructure costs. They now run on a single machine.
>
> **OKX:** Previously used InfluxDB, where ingestion performance degraded as data volumes grew, requiring frequent re-tuning. After switching to QuestDB, they achieved stable ingestion with predictable query latency and minimal maintenance.
>
> **Airtel XStream Play:** Initially used a different analytical database that failed to properly aggregate data once the service exceeded 100 million users. Also benchmarked TimescaleDB but found major latency issues before choosing QuestDB.

## 3. Illustrative queries

If there is a representative SQL query (or a few) that shows what you do with QuestDB in practice, that adds tremendous value. Technical readers love seeing real-world query patterns.

### What works well here

- A query that demonstrates a core part of your workflow
- Time-series aggregations, SAMPLE BY usage, LATEST ON patterns, or window functions
- Before/after query comparisons showing performance gains

Published example from Copenhagen Atomics (reactor sensor monitoring):

```sql
SELECT timestamp, AVG(aircon), AVG(ac01_temperature), AVG(dc01_temperature)
FROM 'loop'
WHERE timestamp BETWEEN '2022-08-26T07:16:15Z' AND '2022-08-26T08:01:15Z'
SAMPLE BY 1s FILL(LINEAR);
```

This lets operators adjust granularity by zooming in and out, with the chart updating in milliseconds.

Example from XRP Ledger:

```sql
SELECT *
FROM (
  SELECT
    ts AS timestamp,
    first(rate) AS open,
    last(rate) AS close,
    min(rate) AS low,
    max(rate) AS high,
    sum(volume_a) AS base_volume,
    sum(volume_b) AS counter_volume,
    count(*) AS exchanges
  FROM
    offer_exchanges
  WHERE
    pair = 'rhub8VRN6jmDy1pUykJzF3wq+EUR|XRP'
    AND ts >= '2022-12-19T02:35:42.000Z'
    AND ts <= '2024-06-19T13:35:11.169Z'
  SAMPLE BY 1d
  FILL (0,PREV,0,0,0,0,0)
  ALIGN TO CALENDAR
  ORDER BY timestamp DESC
)
WHERE
  timestamp >= '2022-12-19T00:00:00.000Z'
  AND timestamp <= '2024-06-19T00:00:00.000Z'
```

## 4. Challenges and workarounds

No integration is perfectly smooth from day one. Being transparent about challenges and how they were addressed makes the story more credible and more useful to other engineers.

### We would love to hear about

- Any features that were not yet available when you started and how QuestDB addressed them
- Workarounds you implemented while waiting for improvements
- How the partnership with QuestDB helped resolve issues along the way
- Anything you are still waiting on or would like to see improved

> **Published examples**
>
> **Airtel XStream Play:** "We faced some challenges, but developers on the QuestDB Slack channel were very helpful, which enabled us to finish our proof of concept."
>
> **Reflexivity:** "The QuestDB team assisted us in all steps along the way. They were proactive in supporting our changeover, helping to debug issues as they arose, and optimize our deployment as we moved things into production."

## 5. Future plans

Sharing what comes next signals confidence in the technology and gives readers a sense of where the partnership is headed.

### For example

- New use cases you plan to build on QuestDB
- Upcoming QuestDB features you are looking forward to
- How you see QuestDB fitting into your architecture over the next year or two

> **Published example from Copenhagen Atomics**
>
> Their next steps include cold storage for older data using QuestDB Enterprise tiered storage (Parquet to object storage), with the number of reactor sensor values expected to grow by a factor of 10 in the near future.

## 6. Optional extras

These are not required, but they can make the published piece much more visually appealing and quotable.

- A short quote we can attribute to someone at your company (two to three sentences is perfect)
- A screenshot of a dashboard or monitoring tool that shows QuestDB in action (we can anonymize data if needed)
- Your company logo in SVG or high-resolution PNG format for the published page

> **Published quotes from other customers**
>
> **Aquis Exchange:** "QuestDB is a time series database truly built by developers for developers. We found that QuestDB provides a unicorn solution to handle extreme transactions per second while also offering a simplified SQL programming interface."
> *Paul Roberts, Head of Infrastructure*
>
> **Copenhagen Atomics:** "QuestDB was our choice for real time data due to high performance, open source, high flexibility and great support."
> *Lasse Tarp, Software Group Manager*

## What happens next

Once you share your inputs, here is how we typically work through the process:

- We draft the case study based on your notes and send you a preview link for review.
- You and your team review the draft and suggest any edits, corrections, or additions.
- We finalize the piece together and agree on a publication date.
- The case study goes live on the QuestDB website, and we coordinate any social promotion.

If you have any questions, or if you would prefer to do this as a conversation instead of filling in a document, we are happy to set up a call. Whatever works best for you.

Looking forward to building this together!

## Published case studies for reference

Here are links to published QuestDB case studies. They can give you a sense of the format and level of detail we aim for:

- [**One Trading**](https://questdb.com/blog/one-trading-runs-a-regulated-24-7-futures-exchange-on-questdb/): A regulated 24/7 futures exchange running on QuestDB.
- [**Airtel XStream Play**](https://questdb.com/blog/airtel-xstream-play-case-study): Real-time engagement and device insights for 100M+ users.
- [**Aquis Exchange (SIX Group)**](https://questdb.com/blog/aquis-case-study): Exchange-wide surveillance on QuestDB.
- [**Copenhagen Atomics**](https://questdb.com/blog/copenhagen-atomics-case-study): Real-time monitoring of thorium reactors with 100,000+ sensors.
- [**OKX**](https://questdb.com/blog/okx-case-study): Exchange-wide analytics for one of the largest crypto exchanges.
- [**XRP Ledger**](https://questdb.com/blog/xrp-ledger-case-study): Blockchain analytics at scale with 46,000+ trading pairs.
- [**Reflexivity**](https://questdb.com/blog/reflexivity-case-study): AI-powered investment analytics, migrated from InfluxDB.
