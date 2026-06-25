---
name: questdb-whitepaper-technical
description: Refresh the QuestDB technical whitepaper by detecting changes in source documentation pages since the last generation. Reads only changed pages, suggests targeted updates to the existing whitepaper markdown, and regenerates the PDF.
---

# QuestDB Technical Whitepaper Refresh

The technical whitepaper is a hand-tuned markdown file at
`scripts/whitepaper-generator/output/technical-whitepaper.md` (relative to
the documentation repo root). It was generated from QuestDB documentation
pages and then manually refined for structure, tone, and editorial quality.

**This skill does NOT regenerate the whitepaper from scratch.** It detects
what changed in the source documentation since the last generation and
suggests targeted updates to the existing markdown.

## When to use

Invoke with `/whitepaper-technical` when you want to check if the
technical whitepaper needs updating based on recent documentation changes.

## How it works

### Step 1: Detect changes

Read the last commit hash from
`scripts/whitepaper-generator/output/.last-commit`.

Fetch the latest main branch and compare against it:
```
git fetch origin
git log --oneline <last-commit>..origin/main -- documentation/
```

This shows all documentation commits on main since the whitepaper was
last updated. Always compare against `origin/main`, not HEAD, because
the whitepaper tracks the state of the main branch regardless of which
branch you're currently on.

### Step 2: Filter relevant changes

The whitepaper draws content from these source pages. Only changes to
these files are relevant:

**Architecture (mapped to "Architecture overview" section):**
- `documentation/architecture/overview.mdx`
- `documentation/architecture/storage-engine.md`
- `documentation/architecture/query-engine.md`
- `documentation/architecture/time-series-optimizations.md`

**Data model (mapped to "Data model" section):**
- `documentation/query/datatypes/overview.md`
- `documentation/query/datatypes/array.md`
- `documentation/concepts/symbol.md`
- `documentation/concepts/designated-timestamp.md`
- `documentation/concepts/deduplication.md`

**Storage and lifecycle (mapped to "Architecture overview" subsections):**
- `documentation/concepts/partitions.md`
- `documentation/concepts/write-ahead-log.md`
- `documentation/concepts/ttl.md`
- `documentation/concepts/storage-policy.md`

**SQL extensions (mapped to "SQL extensions" section):**
- `documentation/concepts/views.md`
- `documentation/concepts/materialized-views.md`
- `documentation/cookbook/sql/finance/ohlc.md`
- `documentation/cookbook/sql/finance/liquidity-comparison.md`
- `documentation/cookbook/sql/finance/markout.md`
- `documentation/query/sql/create-mat-view.md`
- `documentation/query/sql/create-table.md`
- `documentation/query/operators/tick.md`
- `documentation/query/operators/exchange-calendars.md`

**Enterprise (mapped to "Enterprise capabilities" section):**
- `documentation/high-availability/overview.md`
- `documentation/getting-started/migrate-to-enterprise.md`

**AI (mapped to "AI and agent integration" section):**
- `documentation/getting-started/ai-coding-agents.mdx`

For each changed file, read the diff:
```
git diff <last-commit>..origin/main -- <filepath>
```

### Step 3: Suggest updates

For each relevant change, read the current whitepaper markdown and the
changed source page. Suggest specific edits to the whitepaper:

- If a technical claim changed (e.g., new data type, new join type, new
  feature), propose the exact text to add or modify.
- If a SQL example changed, check if the whitepaper uses a verbatim copy
  and propose the updated query.
- If a section was significantly rewritten, read both versions and propose
  how the whitepaper text should change.

**Present changes to the user for approval before editing.** Do not modify
the whitepaper without explicit confirmation.

### Step 4: Apply and regenerate

After the user approves changes:

1. Edit `scripts/whitepaper-generator/output/technical-whitepaper.md`
2. Update `scripts/whitepaper-generator/output/.last-commit` with the
   `origin/main` commit hash (run `git rev-parse origin/main`)
3. Regenerate diagrams if any source SVGs changed (see Diagram preparation)
4. Run:
   ```
   ./scripts/whitepaper-generator/generate-pdf.sh \
     scripts/whitepaper-generator/output/technical-whitepaper.md
   ```
5. Open the PDF for user review

## Whitepaper structure reference

The current whitepaper follows this structure. Do not reorganize sections
during a refresh. Only modify content within existing sections.

```
Introduction
  - What QuestDB is, design philosophy, AI mention
Architecture overview
  - Three-tier storage model (WAL, binary, Parquet)
    - WAL sequencer diagram
  - Column-oriented storage
  - Partitions
    - Partition model diagram
  - Data lifecycle (TTL, storage policies)
  - Query engine (JIT, SIMD, multi-threaded)
Data model
  - Data types (all types overview)
  - N-dimensional arrays (order book use case)
  - The SYMBOL type (dictionary encoding)
  - Designated timestamp (physical sorting, interval scan)
  - Deduplication (UPSERT KEYS, dedup diagram, CREATE TABLE query)
SQL extensions
  - SAMPLE BY (OHLC query)
  - LATEST ON (+ liquidity comparison query with L2PRICE)
  - Time-series joins (ASOF, LT, SPLICE, WINDOW, HORIZON + markout query)
  - TICK interval syntax (quick start examples + exchange calendars)
  - Views (parameterized, optimizer transparency)
  - Materialized views (mat-view diagram, TTL + storage policy queries)
AI and agent integration
  - Standard protocols, agent skill, auditable SQL
Enterprise capabilities
  - Replication (primary-replica via object store)
  - Security (TLS, RBAC, SSO)
  - Deployment options (binary swap, BYOC)
Further reading
  - Docs, OSS install, Enterprise contact, QR code
```

## Verbatim SQL queries

These queries are copied verbatim from source pages (with line breaks
added for PDF width). If the source query changes, update the whitepaper
copy to match:

| Query | Source file | Whitepaper section |
|-------|-----------|-------------------|
| OHLC bars | `cookbook/sql/finance/ohlc.md` | SQL extensions > SAMPLE BY |
| Liquidity comparison | `cookbook/sql/finance/liquidity-comparison.md` | SQL extensions > LATEST ON |
| Markout curve | `cookbook/sql/finance/markout.md` | SQL extensions > Time-series joins |
| TICK quick start | `query/operators/tick.md` | SQL extensions > TICK |
| Exchange calendar | `query/operators/exchange-calendars.md` | SQL extensions > TICK |
| Mat view with TTL | `query/sql/create-mat-view.md` | SQL extensions > Materialized views |
| Mat view with storage policy | `query/sql/create-mat-view.md` | SQL extensions > Materialized views |
| CREATE TABLE with dedup | `query/sql/create-table.md` | Data model > Deduplication |

**Line-breaking rule:** If a verbatim query has lines that would overflow
in PDF (roughly 75 chars), add line breaks with indentation to fit. This
is the ONE allowed modification to verbatim SQL.

## Diagram preparation

Diagrams are stored in `scripts/whitepaper-generator/diagrams/`. If source
SVGs change, re-convert them:

| Diagram | Source | Conversion |
|---------|--------|-----------|
| partitionModel.pdf | `static/images/docs/concepts/partitionModel.svg` | Copy, add dark bg rect `fill="#1b1c26"`, `rsvg-convert -f pdf` |
| wal_sequencer.png | `static/images/docs/concepts/wal_sequencer.webp` | `sips -s format png --setProperty formatOptions 8` |
| deduplication.pdf | `static/images/docs/concepts/deduplication.svg` | Copy, add dark bg rect `fill="#1b1c26"`, `rsvg-convert -f pdf` |
| mat-view-agg.pdf | `static/images/docs/concepts/mat-view-agg.svg` | Copy, add dark bg rect `fill="#21222C"`, `rsvg-convert -f pdf` |

**Dark background fix:** The mat-view-agg, deduplication, and partition
model SVGs have transparent backgrounds. Add a `<rect>` as the first
child of `<svg>` (after `<defs>`) with the appropriate fill color and
viewBox-matching dimensions before converting.

## Editorial rules

These rules were established during the initial whitepaper creation. Apply
them when suggesting updates:

- **AI before Enterprise.** AI and agent integration is its own top-level
  section positioned before Enterprise, with a mention in the intro.
- **BYOC inside Enterprise.** Deployment options (including BYOC) is a
  subsection of Enterprise, not standalone.
- **No standalone timezone section.** UTC storage is mentioned in the
  designated timestamp subsection. TICK handles timezone queries and
  belongs in the SQL extensions section.
- **No "Capital markets showcase".** SQL examples are embedded in the
  feature they demonstrate (OHLC in SAMPLE BY, liquidity in LATEST ON,
  markout in HORIZON JOIN).
- **Section order within Architecture:** Three-tier model, column storage,
  partitions, data lifecycle, query engine (query engine comes last).
- **Parquet is not just for old data.** Any partition can be converted,
  and in Enterprise, Parquet partitions can live on object storage/NFS
  while remaining queryable.
- **Standard SQL with extensions, not "extended with operators."** The
  extensions cover keywords, join types, aggregate functions, data types,
  and interval syntax.
- **Arrays get their own subsection** in Data model, explaining the 2D
  order book storage pattern.
- **Mat view queries go in the mat view section**, not in TTL/storage
  policy. The TTL and storage policy variants are shown together there
  as "In Open Source..." / "In Enterprise..." alternatives.

## PDF generation

```
./scripts/whitepaper-generator/generate-pdf.sh \
  scripts/whitepaper-generator/output/technical-whitepaper.md
```

The script auto-selects `qr-docs.png` for the title page QR when the
input filename contains "technical".

**Assets in `scripts/whitepaper-generator/`:**
- `questdb-logo.pdf` - vector logo (icon + wordmark, black on white)
- `qr-docs.png` - QR encoding https://questdb.com/docs/
- `template.tex` - shared LaTeX template with QuestDB branding
- `diagrams/` - converted diagram files

## Quality checklist

When suggesting updates, verify:

- [ ] Only changed source pages were read (not full regeneration)
- [ ] Proposed changes preserve the existing structure and tone
- [ ] Frontmatter includes an `abstract:` (2-3 sentence cover-page summary); add one if missing
- [ ] SQL queries match source verbatim (with line-break adjustments only)
- [ ] No Docusaurus syntax introduced (admonitions, links, components)
- [ ] No internal doc links (e.g., `/docs/concepts/...`)
- [ ] Diagrams re-converted if source SVGs changed
- [ ] `.last-commit` updated to current HEAD after applying changes
- [ ] PDF regenerated and opened for user review
