---
name: questdb-whitepaper-executive
description: Generate an executive whitepaper from QuestDB marketing pages and introductory docs. Reads TSX components and markdown sources, transforms into polished whitepaper prose, and writes a single markdown file ready for PDF conversion.
---

# QuestDB Executive Whitepaper Generator

Generate a concise, benefit-driven whitepaper aimed at CTOs, VPs of Engineering,
and technical decision-makers evaluating QuestDB. The output is a single markdown
file that can be converted to PDF using the shared Pandoc pipeline.

## When to use

Invoke with `/whitepaper-executive` when you need to generate or refresh the
executive whitepaper.

## Source pages

Read ALL of these files to extract content. Marketing pages are TSX with content
embedded in component props, string literals, and data objects. Extract the text,
do not copy JSX markup.

### questdb.io repository (Next.js TSX pages)

Base path: `/Users/j/prj/questdb/questdb.io/src/app/`

| Page | Files to read |
|------|---------------|
| Home | `page.tsx` + check imports for content objects (e.g., `imageWithCTA` config, `multiCaseItems.ts`) |
| Agents | `agents/page.tsx` + all components in `src/components/agents/` (AgentsHero, AgentsWhyQuestDB, AgentsSQLFeatures, AgentsArchitecture, AgentsGetStarted, AgentsMidPageCTA) |
| Customers | `customers/page.tsx` + `customers/content.tsx` |
| Enterprise | `enterprise/page.tsx` (content is inline in props) |
| BYOC | `byoc/page.tsx` + `byoc/content.tsx` |
| Use Cases | `use-cases/page.tsx` + `use-cases/content.tsx` |

### Documentation repository

Base path: `/Users/j/prj/questdb/questdb.io/documentation/documentation/`

| Page | File |
|------|------|
| Docs index | `index.md` or `index.mdx` |
| Migrate to Enterprise | `getting-started/migrate-to-enterprise.md` (or .mdx) |
| AI Coding Agents | `getting-started/ai-coding-agents.md` (or .mdx) |

## Output

Write to: `scripts/whitepaper-generator/output/executive-whitepaper.md`
(relative to the documentation repo root)

Create the output directory if it does not exist.

## Whitepaper structure

The output markdown should follow this structure. Each section should be
concise. Target 8-12 pages when rendered as PDF.

```markdown
---
title: "QuestDB: The Fastest Time-Series Database"
subtitle: "Executive Overview"
abstract: "A 2-3 sentence summary of the whitepaper for the cover page. Describe what the reader will get from this document."
date: YYYY-MM-DD
---

## Executive summary

3-4 paragraphs. What QuestDB is, who it is for, why it matters. End with
the key differentiators (performance, SQL, open formats).

## The time-series data challenge

Why time-series workloads are different. What breaks with general-purpose
databases. Frame the problem that QuestDB solves. Draw from the home page
and use-cases page messaging.

## QuestDB at a glance

Core capabilities in brief: ingestion speed, query performance, SQL
compatibility, storage tiers, open formats (Parquet/Arrow). Use concrete
numbers from the marketing pages (e.g., "8M rows/sec ingest").

## Use cases

Subsections for each use case from the use-cases page. For each: 1-2
paragraph description, key capabilities, and a customer proof point if
available from the customers page.

### Capital markets
### Industrial and IoT
### Observability and monitoring
### (other use cases as found on the page)

## AI and agentic workflows

Content from the agents page. How QuestDB fits into the agentic stack.
SQL as a natural interface for AI. Real-time data as ground truth.

## Enterprise features

From the enterprise page: security (SSO, RBAC, audit), high availability,
replication, cold storage, support. Brief and scannable.

## Deployment options

### Open source
### Enterprise (self-managed)
### BYOC (Bring Your Own Cloud)

Draw from the enterprise, BYOC, and migrate-to-enterprise pages.

## Customer proof points

Select 3-5 compelling customer stories from the customers page. For each:
company name, industry, use case, key quote, and quantified outcome if
available.

## Getting started

Three clear paths, each as a bold-lead paragraph:

1. **Try it now.** The live demo instance at demo.questdb.com for immediate
   evaluation with no installation or signup.
2. **Install QuestDB Open Source.** Available on Linux, macOS, Windows,
   Docker, and Kubernetes for hands-on testing and proof of concept with
   the user's own data. Mention client libraries for building ingestion
   pipelines.
3. **Evaluate Enterprise.** Contact QuestDB for architecture review and
   guided deployment with Enterprise features.

CRITICAL: Do NOT omit the Open Source installation path. QuestDB OSS is
a fully functional database that teams can download and run locally for
real evaluation. This is a key differentiator and must always be mentioned
between the demo and the Enterprise contact paths.

The Enterprise contact link is https://questdb.com/enterprise/contact/.
Use this exact URL in the markdown output.
```

## Transformation rules

1. **Extract, do not copy.** Read the TSX/markdown sources and rewrite the
   content as flowing whitepaper prose. Do not reproduce component markup,
   bullet-list-heavy marketing copy, or documentation-style instructions.

2. **Merge and deduplicate.** The same messaging appears across multiple pages
   (e.g., performance claims on home, enterprise, and use-cases). State each
   point once in the most appropriate section.

3. **Keep concrete numbers.** Performance benchmarks, customer metrics, and
   quantified claims should be preserved exactly as stated in the sources.

4. **No invented content.** Every claim in the whitepaper must trace back to
   one of the source pages. Do not add features, benchmarks, or customer
   stories that are not in the sources.

5. **Professional tone.** Write for a senior technical audience. Avoid
   superlatives without backing data. No "revolutionary", "game-changing",
   or "cutting-edge" unless quoting a customer.

6. **No QuestDB SQL examples.** This is an executive document, not a tutorial.
   Mention SQL capabilities in prose but do not include code blocks.

7. **Customer quotes.** Include direct quotes with attribution (name, role,
   company) exactly as they appear in the source.

8. **Date the document.** Use today's date in the frontmatter.

9. **No images or diagrams, except the QR code.** The markdown output is
   text-only, with one exception: include the enterprise contact QR code
   at the end of the Getting started section using exactly:
   ```
   ![](qr-enterprise-contact.png){width=2.5cm}\
   *Scan to get in touch*
   ```
   Note: no space before `{`, no alt text, backslash for line break, then
   italic caption. The QR code PNG lives in `scripts/whitepaper-generator/`
   (not output/). The generate-pdf.sh script sets `--resource-path` so
   Pandoc finds it by filename alone. The PDF template also places this
   QR code on the title page automatically (without caption text).
   The QR encodes https://questdb.com/enterprise/contact/.

   **Logo:** The title page uses `questdb-logo.pdf`, a vector PDF converted
   from the themed SVG (`questdb-logo-themed.svg` in the questdb.io repo).
   This shows the full QuestDB logo (icon + wordmark) with black text,
   suitable for white backgrounds. If the logo needs regenerating:
   `rsvg-convert -f pdf questdb-logo-themed.svg -o questdb-logo.pdf`

10. **Sentence case for all headings.**

## Quality checklist

Before writing the output file, verify:

- [ ] All source files were read (no section is missing)
- [ ] No JSX/TSX markup leaked into the output
- [ ] No content was invented (all claims traceable to sources)
- [ ] Performance numbers match the source exactly
- [ ] Customer quotes are verbatim with correct attribution
- [ ] No duplicate messaging across sections
- [ ] Headings use sentence case
- [ ] No code blocks or SQL examples
- [ ] QR code image included at the end of Getting started section
- [ ] Enterprise contact URL is https://questdb.com/enterprise/contact/
- [ ] Frontmatter includes title, subtitle, date (version is optional)
- [ ] Document flows as a cohesive narrative, not a page-by-page summary
