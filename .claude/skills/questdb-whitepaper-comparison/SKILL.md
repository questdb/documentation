---
name: questdb-whitepaper-comparison
description: Generate a competitive comparison whitepaper covering QuestDB vs kdb+, InfluxDB, TimescaleDB, and ClickHouse. Includes all benchmark tables, charts, SQL examples, and feature comparison matrices from the source pages. Produces a single markdown file ready for PDF conversion.
---

# QuestDB Competitive Comparison Whitepaper

Generate a data-rich whitepaper comparing QuestDB against four competing
time-series databases. Unlike the executive whitepaper, this document is
benchmark-heavy: it includes ALL benchmark tables, SQL examples, feature
matrices, and architectural diagrams from the source pages, condensing
only the SEO/blog prose while keeping every data point.

## When to use

Invoke with `/whitepaper-comparison` when you need to generate or refresh
the competitive comparison whitepaper.

## Source pages

All source content lives in the questdb.io repository at
`/Users/j/prj/questdb/questdb.io/`.

| Competitor | Source file | Type |
|------------|-----------|------|
| kdb+ | `content/compare/questdb-vs-kdb.mdx` | Dedicated compare page |
| InfluxDB | `content/blog/2025-12-02-questdb-versus-influxdb.mdx` | Blog post |
| TimescaleDB | `content/blog/2025-12-02-timescaledb-vs-questdb.mdx` | Blog post |
| ClickHouse | `content/blog/2025-12-22-clickhouse-vs-questdb.mdx` | Blog post |

## Output

Write to: `scripts/whitepaper-generator/output/comparison-whitepaper.md`

Target: **20-30 pages** when rendered as PDF. This is a data-heavy document.
Each comparison section should be 4-6 pages, not 1-2.

## Page breaks and layout

Insert `\newpage` before each comparison top-level `##` section (kdb+,
InfluxDB, TimescaleDB, ClickHouse). Do **not** insert `\newpage` before
`## Further reading` — it is short closing content and a forced break
leaves a near-empty page when the preceding paragraph splits across pages.

### Summary table placement

Place the summary comparison table (all 5 databases, 12 dimensions)
right after the intro, as a "Comparison at a glance" subsection. This
is the TL;DR. Do NOT put it at the end of the document.

The 6-column table is too wide for normal markdown. Render it as raw
LaTeX using `\scriptsize` font:

````markdown
```{=latex}
\begingroup
\scriptsize
\setlength{\tabcolsep}{2.5pt}
\begin{longtable}[]{@{}lllllll@{}}
\toprule\noalign{}
& \textbf{QuestDB} & \textbf{kdb+} & ... \\
\midrule\noalign{}
\endhead
License & Apache 2.0 & Proprietary & ... \\
...
\bottomrule\noalign{}
\end{longtable}
\endgroup
```
````

Use abbreviated values: "Prop." for Proprietary, "PG ext" for PostgreSQL
extension, "CH dialect" for ClickHouse dialect, "I/O" for import/export.
Do NOT use landscape orientation.

### Table formatting

The LaTeX template applies these styles automatically to all longtable
environments:
- `\small` font, `\tabcolsep{3pt}`, `\arraystretch{1.35}`
- `\rowcolors{2}{gray!8}{white}` for alternating zebra stripes

This means rows are visually separated by alternating gray/white shading.
No manual `\hline` or `\midrule` needed between rows.

**Shorten first-column values to prevent multi-line wrapping:**
- "100 hosts" not "100 hosts (1.7M rows)"
- "1K hosts" not "1,000 hosts"
- "3.3x" not "3.3x faster"

**Keep tables under 6 columns.** The InfluxDB ingestion table (Scale,
InfluxDB v1, InfluxDB v2, QuestDB, vs v1, vs v2) is the widest that
fits.

### Heading orphan prevention

The template uses `\needspace` to prevent headings from appearing at
the bottom of a page with no content after them. This is automatic.
No action needed in the markdown.

## Images to prepare

Before writing the whitepaper, convert these images to
`scripts/whitepaper-generator/diagrams/`:

```bash
# Homepage benchmark (intro)
sips -s format png --setProperty formatOptions 8 \
  /Users/j/prj/questdb/questdb.io/public/images/benchmark/benchmark_all_q1_2026.webp \
  --out scripts/whitepaper-generator/diagrams/benchmark_all_q1_2026.png

# ClickBench results (TimescaleDB section)
sips -s format png --setProperty formatOptions 8 \
  /Users/j/prj/questdb/questdb.io/public/images/blog/2025-12-02/clickbench-queries-hot-chart.webp \
  --out scripts/whitepaper-generator/diagrams/clickbench-timescale.png

# ClickBench results (ClickHouse section)
# This file is JPEG mislabeled as .png, copy directly
cp /Users/j/prj/questdb/questdb.io/public/images/blog/2025-12-22/clickhouse-questdb-bench.png \
  scripts/whitepaper-generator/diagrams/clickbench-clickhouse.png

# QuestDB interoperability diagram (kdb+ section)
cp /Users/j/prj/questdb/questdb.io/public/images/pages/compare/questdb-interop.png \
  scripts/whitepaper-generator/diagrams/questdb-interop.png
```

Include images in markdown using:
```
![Caption](diagrams/filename.png){width=14cm}
```

## Whitepaper structure with content inventory

Below is the exact structure. For each section, the skill lists every
table, image, and SQL example that MUST be included. Tables and SQL
must be copied **verbatim** from the `<div className="sr-only">` blocks
in the blog posts (these contain the accessible text versions of the
interactive charts).

### Frontmatter

```yaml
---
title: "QuestDB: Competitive Comparison"
subtitle: "vs. kdb+, InfluxDB, TimescaleDB, and ClickHouse"
abstract: "A 2-3 sentence summary of the whitepaper for the cover page. Describe what the reader will get from this document."
date: YYYY-MM-DD
---
```

### Introduction (2-3 paragraphs + image)

Brief positioning of QuestDB. Use **"over 8 million rows per second"**
as the headline claim (matching the homepage benchmark chart), NOT the
11.36M peak number.

Mention BOTH benchmark suites used in this document:
- **TSBS** (Time Series Benchmark Suite) for ingestion and time-series queries
- **ClickBench** for OLAP-style analytical queries

State the benchmark environment once here (AWS EC2 r8a.8xlarge, 32 vCPU,
256 GB RAM, GP3 EBS 20K IOPS, default configurations) so it doesn't need
repeating in each section.

**Include image:**
```
![QuestDB benchmark results, Q1 2026](diagrams/benchmark_all_q1_2026.png){width=14cm}
```

### QuestDB vs. kdb+ (4-6 pages)

**Source:** `content/compare/questdb-vs-kdb.mdx`

**Prose sections to cover** (rewrite as whitepaper, don't copy blog style):
- Programming model: SQL vs q (cover the operational weight of DIY q scripts)
- AI and LLM readiness (include the 57%/26% LLM failure stat)
- Architecture: open data vs proprietary (three-tier vs RDB/HDB)
- Concurrency and crash recovery
- The talent question

**kx caveat**: Be respectful and factual. Acknowledge kdb+'s strengths
(raw vector processing, mature financial ecosystem). Do NOT dismiss kdb+
or make unsupported performance claims.

**MUST include - SQL example** (verbatim from source):
```sql
CREATE MATERIALIZED VIEW trades_ohlcv_1s AS
  SELECT
      timestamp, symbol,
      first(price) AS open,
      max(price)   AS high,
      min(price)   AS low,
      last(price)  AS close,
      sum(amount)  AS volume
  FROM trades
  SAMPLE BY 1s;
```

**MUST include - Interoperability diagram:**
```
![QuestDB data lake interoperability](diagrams/questdb-interop.png){width=12cm}
```

**MUST include - Benchmark note:** kdb+'s license (DeWitt clause) prohibits
publishing benchmark results without KX's approval. Include QuestDB's
standalone TSBS query results instead.

**MUST include - TSBS query results table** (full 16 rows, verbatim):

| Query Type | Rate (q/s) | Median | Mean | Min | Max |
|---|---|---|---|---|---|
| single-groupby-5-1-1 | 1,314 | 0.77 ms | 0.75 ms | 0.23 ms | 6.14 ms |
| single-groupby-1-1-1 | 1,254 | 0.68 ms | 0.78 ms | 0.20 ms | 112.15 ms |
| single-groupby-1-8-1 | 858 | 1.10 ms | 1.15 ms | 0.85 ms | 15.81 ms |
| single-groupby-5-8-1 | 667 | 1.31 ms | 1.49 ms | 1.06 ms | 134.90 ms |
| single-groupby-1-1-12 | 625 | 1.42 ms | 1.59 ms | 0.98 ms | 8.77 ms |
| single-groupby-5-1-12 | 574 | 1.58 ms | 1.73 ms | 1.15 ms | 8.66 ms |
| lastpoint | 507 | 2.38 ms | 1.97 ms | 1.38 ms | 2.66 ms |
| cpu-max-all-1 | 486 | 1.86 ms | 2.04 ms | 0.95 ms | 68.94 ms |
| high-cpu-1 | 213 | 4.02 ms | 4.68 ms | 2.26 ms | 13.53 ms |
| cpu-max-all-8 | 154 | 5.96 ms | 6.46 ms | 4.39 ms | 40.05 ms |
| groupby-orderby-limit | 123 | 7.63 ms | 8.12 ms | 1.22 ms | 24.38 ms |
| double-groupby-1 | 33 | 30.00 ms | 30.37 ms | 27.82 ms | 145.05 ms |
| double-groupby-5 | 23 | 42.98 ms | 43.36 ms | 39.90 ms | 339.10 ms |
| cpu-max-all-32-24 | 20 | 49.87 ms | 48.97 ms | 20.48 ms | 264.10 ms |
| double-groupby-all | 17 | 57.62 ms | 57.62 ms | 53.33 ms | 143.94 ms |
| high-cpu-all | 1 | 722.30 ms | 711.85 ms | 592.99 ms | 839.36 ms |

**MUST include - Feature comparison matrix** (render the ComparisonMatrix
component data as 4 markdown tables, one per category):
- Ecosystem & Openness (5 features)
- Infrastructure & Operations (6 features)
- Development & Language (4 features)
- AI & LLM Readiness (2 features)

### QuestDB vs. InfluxDB (4-6 pages)

**Source:** `content/blog/2025-12-02-questdb-versus-influxdb.mdx`

**Prose sections to cover:**
- Architecture: columnar vs measurement-based/TSM
- Data model: relational tables vs measurements + series
- Why cardinality affects InfluxDB (separate TSM tree per series)
- Query language: SQL vs InfluxQL/Flux (multiple language changes)

**MUST include - Aspect comparison table** (verbatim, 6 rows)

**MUST include - Ingestion benchmark table** (verbatim from sr-only div):

| Scale | InfluxDB v1.11 | InfluxDB v2 | QuestDB | vs v1 | vs v2 |
|---|---|---|---|---|---|
| 100 hosts (1.7M rows) | 1.23M rows/sec | 727K rows/sec | 4.02M rows/sec | 3.3x | 5.5x |
| 1,000 hosts (17M rows) | 1.17M rows/sec | 667K rows/sec | 7.48M rows/sec | 6.4x | 11.2x |
| 4,000 hosts (69M rows) | 787K rows/sec | 514K rows/sec | 8.39M rows/sec | 10.7x | 16.3x |
| 100,000 hosts (86M rows) | 491K rows/sec | 402K rows/sec | 11.36M rows/sec | 23x | 28x |
| 1,000,000 hosts (432M rows) | ~203K rows/sec | 241K rows/sec | 7.33M rows/sec | 36x | 30x |

**MUST include - Single-groupby query table** (verbatim, 6 rows)

**MUST include - Double-groupby query table** (verbatim, 3 rows)

**MUST include - Heavy queries table** (verbatim, 1 row)

**MUST include - Performance summary table** (verbatim, 4 rows)

**MUST include - Key model differences table** (verbatim, 6 rows)

**MUST include - SQL comparison** (Flux vs SQL, verbatim examples):
- InfluxDB Flux query
- QuestDB SQL equivalent

**MUST include - QuestDB time-series extensions table** (4 rows:
SAMPLE BY, LATEST ON, ASOF JOIN, WHERE IN)

**MUST include - Ecosystem/integrations table** (6 rows)

### QuestDB vs. TimescaleDB (4-6 pages)

**Source:** `content/blog/2025-12-02-timescaledb-vs-questdb.mdx`

**Prose sections to cover:**
- Architecture: purpose-built vs PostgreSQL extension (hypertables)
- PostgreSQL row-based architecture and its impact on time-series
- SQL: time-series extensions vs PostgreSQL functions
- Operational complexity: single binary vs PG + extension management

**MUST include - Feature comparison table** (verbatim, 4 rows)

**MUST include - Ingestion benchmark table** (verbatim, 5 rows with
exact rows/sec for both databases and advantage multiplier)

**MUST include - Single-groupby query table** (verbatim, 6 rows)

**MUST include - Double-groupby query table** (verbatim, 3 rows)

**MUST include - Heavy queries table** (verbatim, 1 row)

**MUST include - ClickBench results image:**
```
![ClickBench benchmark results: QuestDB vs TimescaleDB](diagrams/clickbench-timescale.png){width=12cm}
```
Add prose: "QuestDB outperforms TimescaleDB by 10x to 650x across most
ClickBench queries on the same hardware."

**MUST include - ASOF JOIN SQL comparison** (verbatim, 3 variants):
- QuestDB ASOF JOIN (3 lines)
- PostgreSQL/TimescaleDB LEFT JOIN LATERAL workaround (10 lines)
- Brief note that DuckDB also supports ASOF JOIN

### QuestDB vs. ClickHouse (4-6 pages)

**Source:** `content/blog/2025-12-22-clickhouse-vs-questdb.mdx`

**Prose sections to cover:**
- Different strengths: streaming time-series vs batch OLAP
- Architecture: WAL + columnar + Parquet vs MergeTree engine family
- Openness: native Parquet/Iceberg vs proprietary storage with Parquet I/O
- When each is the better choice

**MUST include - Aspect comparison table** (verbatim, 6 rows)

**MUST include - Ingestion benchmark table** (verbatim, 5 rows)

**MUST include - Single-groupby query table** (verbatim, 6 rows)

**MUST include - Double-groupby query table** (verbatim, 3 rows)

**MUST include - Heavy queries table** (verbatim, 2 rows)

**MUST include - Lastpoint/additional queries table** (verbatim, 2 rows)

**MUST include - ClickBench comparison image:**
```
![ClickBench benchmark results: QuestDB vs ClickHouse](diagrams/clickbench-clickhouse.png){width=12cm}
```

**MUST include - CREATE TABLE comparison** (verbatim SQL, both):
- ClickHouse MergeTree CREATE TABLE
- QuestDB CREATE TABLE equivalent

**MUST include - QuestDB extensions table** (verbatim, 6 rows:
SAMPLE BY, LATEST ON, ASOF JOIN, WINDOW JOIN, HORIZON JOIN, TICK syntax)

**MUST include - QuestDB time-series query examples** (verbatim):
- Hourly OHLCV bars with SAMPLE BY
- Markout analysis with HORIZON JOIN

### Summary (1-2 pages)

**MUST include - Comparison table** across all five databases with rows for:
license, query language, implementation, architecture, time-series focus,
ingestion protocol, storage format, open formats (Parquet/Arrow/Iceberg),
materialized views, replication, benchmark transparency, TSBS ingestion
(4K hosts).

This table synthesizes data from the individual comparison tables above.
Fill every cell from the source pages.

### Further reading

Three paths:
1. **Read the full comparisons** - questdb.com/compare/ and blog posts
2. **Try QuestDB** - OSS install + live demo
3. **Evaluate Enterprise** - questdb.com/enterprise/contact/

End with:
```
![](qr-enterprise-contact.png){width=2.5cm}\
*Scan to get in touch*
```

## Transformation rules

1. **Include ALL benchmark tables verbatim.** The `<div className="sr-only">`
   blocks in blog posts contain exact numbers for the interactive charts.
   Copy these tables character-for-character into the whitepaper markdown.

2. **Include ALL feature comparison tables.** The aspect tables, model
   differences tables, ecosystem tables, and extension tables are already
   well-formatted markdown. Include them verbatim.

3. **Include SQL examples verbatim** where they illustrate a comparison
   point. The key ones are: Flux vs SQL, ASOF JOIN (QuestDB vs
   PostgreSQL/TimescaleDB), CREATE TABLE (QuestDB vs ClickHouse),
   QuestDB time-series queries (OHLCV, markout), materialized view.

4. **Rewrite prose, do not copy blog text.** The blog posts contain SEO
   filler, section intros, reader hand-holding, and promotional language.
   Strip all of that. Write concise whitepaper prose between the tables
   that explains what the numbers mean.

5. **Keep benchmark methodology context.** Each comparison should note
   the software versions tested (e.g., "InfluxDB v1.11, v2.7.12, QuestDB
   9.2.2") and hardware (reference the intro where it's stated once).

6. **Be factual and respectful.** Acknowledge competitor strengths.
   The kdb+ section must be balanced (see kx caveat). Where ClickHouse
   or InfluxDB wins on specific queries, say so.

7. **No invented benchmarks.** Only include numbers from the source pages.

8. **Use "over 8 million rows per second"** as the headline claim in the
   intro. Individual comparison sections use the exact per-cardinality
   numbers from their respective TSBS tables.

9. **Sentence case for all headings.**

10. **No Docusaurus/blog syntax.** Strip imports, component tags,
    admonitions, LeadIn, Screenshot components, internal links.

11. **Date the document.** Use today's date.

## PDF generation

```
./scripts/whitepaper-generator/generate-pdf.sh \
  scripts/whitepaper-generator/output/comparison-whitepaper.md
```

The script uses `qr-enterprise-contact.png` for the title page QR
(default for non-technical whitepapers).

## Quality checklist

- [ ] All 4 source pages read completely
- [ ] Homepage benchmark image included in intro
- [ ] ClickBench mentioned alongside TSBS in intro
- [ ] "Over 8 million rows/sec" used as headline (not 11.36M)
- [ ] Summary table placed after intro as "Comparison at a glance" (raw LaTeX, \scriptsize)
- [ ] `\newpage` before every top-level `##` section
- [ ] **kdb+**: TSBS table (16 rows), feature matrix (4 categories),
      interop diagram, materialized view SQL, DeWitt clause mentioned
- [ ] **InfluxDB**: ingestion table (5 rows), single-groupby (6 rows),
      double-groupby (3 rows), heavy (1 row), performance summary,
      model differences, Flux vs SQL, extensions table, ecosystem table
- [ ] **TimescaleDB**: ingestion table (5 rows), single-groupby (6 rows),
      double-groupby (3 rows), heavy (1 row), ClickBench image,
      ASOF JOIN SQL comparison
- [ ] **ClickHouse**: ingestion table (5 rows), single-groupby (6 rows),
      double-groupby (3 rows), heavy (2 rows), lastpoint (2 rows),
      ClickBench image, CREATE TABLE comparison, extensions table,
      OHLCV + markout SQL examples
- [ ] Summary table covers all 5 databases across 12+ dimensions
- [ ] All benchmark numbers match source exactly
- [ ] kdb+ section is balanced and respectful
- [ ] No blog/Docusaurus syntax leaked
- [ ] QR code at end of Further reading
- [ ] Enterprise contact URL is https://questdb.com/enterprise/contact/
- [ ] Table first-column values abbreviated (1K/100K/1M hosts, not full text)
- [ ] No landscape orientation used
- [ ] PDF renders at 20-30 pages
