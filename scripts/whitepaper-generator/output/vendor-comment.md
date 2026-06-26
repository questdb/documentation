---
title: "Vendor Comment"
covertitle: 'Vendor`\\`{=latex}Comment'
abstract: "QuestDB's response to Data Intellect's independent Phase 2 Technology Review, an evaluation of QuestDB for capital markets covering ingestion, query performance, and post-trade analysis."
date: 2026-06-25
notoc: true
compact: true
---

```{=latex}
\fontsize{12}{16}\selectfont
```

## Benchmark findings

We welcome the findings of Data Intellect's Phase 2 Technology Review, which demonstrates QuestDB's strong applicability in the finance industry, and specifically in capital markets. The database met or exceeded the ingestion and query performance targets, whilst also providing an accessible and convenient syntax for post-trade analysis. The benchmark included a wide variety of queries, with comprehensive coverage of Barclays' requirements. In particular, we think the ability to calculate markouts in near real-time through simple HORIZON JOIN syntax is a clear demonstration of our commitment to drive the industry forward.

## Methodology and scalability

This Phase 2 benchmark targeted like-for-like comparisons between databases, in order to obtain a comparable performance baseline. There were some points for review; for example, the scalability of full-table scans and cold reads. We are pleased to see that the report highlighted Materialized Views and Covering Indexes as solutions to this issue, which would be leveraged in a real-life production deployment. These features were developed specifically for customers with the same concern, and we hope to demonstrate their value in future.

## Open source and Enterprise

The benchmark also identified gaps between the Open Source and Enterprise offerings, for example, around security. We believe that the Enterprise feature set fully addresses these concerns, with granular RBAC, SSO integration and TLS support. Furthermore, the ongoing rollout of Storage Policy and Cold Storage handles the parquet and tiering concerns, and read-replicas handle horizontal scalability and mitigate read/write contention that may be encountered on a single-server deployment.

## Transparency and reproducibility

We value transparency and fairness above all when benchmarking our database. We provide publicly reproducible benchmarks, using QuestDB OSS and easily-accessible hardware, allowing any individual or company to independently verify our claims. An independent peer review, like this one, helps to ensure we are held accountable, and also provides valuable real-world feedback to identify any non-obvious friction issues (e.g. Q17). We appreciate the thoroughness and attention to detail, and will leverage these results to identify and deliver improvements in our upcoming releases.

## Looking ahead

We thank the Data Intellect team for their consideration during this process, and look forward to collaborating in future, especially for designing and building production QuestDB Enterprise deployments.
