---
name: review-pr
description: Review QuestDB documentation pull requests for placement, discoverability, dual-audience (human + LLM) quality, example coverage, and SQL syntax diagrams. Use when reviewing a docs PR, a new or changed page, or assessing whether documentation is findable, correct, and usable by both engineers and LLMs that build systems against QuestDB.
allowed-tools: bash read subagent
metadata:
  argument-hint: "[PR number, URL, or branch] [--level=0..2]"
---

# QuestDB documentation PR reviewer

Use this as the operating procedure when reviewing a pull request against the
`questdb/documentation` repo. The goal is not to rewrite the contribution but
to judge whether it meets the bar for technical documentation that both
engineers and LLMs rely on to build systems against QuestDB.

**Guiding principle:** users judge the product by the quality of its docs. The
audience is technical, and a large share of "readers" are LLMs assembling
systems, writing SQL, and one-shotting integration problems from these pages.
A page that is correct but unfindable, or findable but vague, fails the bar.

This skill covers the review-specific judgment calls. For mechanical style and
formatting rules (frontmatter, sentence case, admonitions, link paths, demo
datasets, alphabetical ordering), defer to the `questdb-docs-writer` skill's
review checklist rather than restating it here.

## How to run a review

1. **Resolve the target and get the diff.** The skill reviews either a named
   PR or the current branch.

   - **If invoked with a PR number or URL** (after stripping any `--level=N`,
     `-lN`, or bare-digit level token), check it out so full-file reads and
     `yarn build` run against the PR branch, and capture its metadata and
     existing review comments:
     ```bash
     PR='<PR number or URL from the invocation, with the level token removed>'
     gh pr view "$PR" --json number,title,body,labels,state,headRefName
     gh pr checkout "$PR"
     gh pr view "$PR" --comments
     ```
   - **If no PR is given**, review the current branch as-is.

   Either way, identify the scope — list new pages, changed pages, and any
   `sidebars.js` change separately:
   ```bash
   git fetch origin
   git diff --stat origin/main...HEAD -- documentation/
   git diff origin/main...HEAD -- documentation/sidebars.js
   ```
   A new page with no `sidebars.js` change is an immediate red flag (see
   Pillar 1).

2. **Read each new or changed page in full**, not just the diff hunk. Placement
   and information-flow problems are invisible at the hunk level.

3. **Build to catch broken links and render errors.**
   ```bash
   yarn build
   ```
   A failing build is a blocking issue. Never approve over a broken build.

4. **Score against the pillars below**, assign a severity to each finding, and
   produce the review using the output format at the end.

5. **For non-trivial PRs, escalate to the agent passes.** The pillar review is
   a single-pass, checklist-anchored read — the right default for small edits,
   but checklists have a blind spot (a reviewer scoring fixed pillars tends to
   confirm them and miss failure modes the pillars don't name). For new pages,
   flagship/SQL-reference pages, or any change an LLM will build against, run
   the **Adversarial review agents** pass below (levels 1-2).

## Severity levels

Tag every finding with one of these. The PR author needs to know what blocks
merge versus what is a suggestion.

- **Critical** — blocks merge. The page is technically wrong, an example does
  not run, a top-tier feature is buried or unfindable, or the build is broken.
- **Major** — should be fixed before merge. Poor information flow, missing
  syntax diagram on a SQL page, no usage examples, inconsistent schema, weak
  or missing description that hurts SEO/LLM retrieval.
- **Minor** — fix if convenient. Suboptimal wording, a missing cross-link, an
  example that works but uses an off-convention schema.
- **Nit** — optional polish. Phrasing, ordering preferences.

A "top-tier feature documented 10 levels deep in the sidebar" is **Critical**,
not a nit. Placement is a first-class quality dimension.

## Pillar 0: Technical correctness

For a technical audience, a wrong example is worse than no example. Verify
before anything else.

- Every SQL example must be runnable. Mark demoable queries with `demo` and
  confirm they execute against the demo instance or a local build.
- Function signatures, parameter names, types, and defaults must match the
  actual product behavior, not an aspirational design.
- Behavior claims (ordering, nullability, error conditions, edge cases) must
  be accurate. If you cannot verify a claim, flag it as **Major** with a
  request for confirmation rather than letting it pass.
- New config properties, keywords, functions, types, and operators must be
  cross-checked against the product and the `questdb/sql-parser` repo (see the
  `questdb-docs-writer` skill's parser-sync section).

## Pillar 1: Sidebar placement and findability

New documentation must land in the sidebar where a user would look for it,
without cluttering or confusing navigation.

Check:

- **Depth matches importance.** A top-tier or flagship feature must be
  reachable near the top of its section, not buried several levels deep. Map
  the path a user clicks to reach the page. If a marquee feature is 6+ clicks
  deep, that is **Critical**. Minor features can sit deeper.
- **Correct section.** The page belongs in the category that matches its type:
  concept vs. guide vs. SQL reference vs. function reference vs. configuration.
  A SQL keyword page under Guides is misfiled.
- **Findable label.** The `sidebar_label` is what a scanning user (or an LLM
  building a table of contents) sees. It must name the feature in the words a
  user would search for, not an internal codename. Avoid labels that collide
  with or are easily confused with a sibling entry.
- **No clutter.** Adding a page should not bloat a category past the point of
  scannability. If a category is growing unwieldy, flag whether the new page
  warrants a sub-category or whether an existing grouping should absorb it.
- **Ordering.** Respect the section's ordering rule (alphabetical for
  reference and config lists; logical/lifecycle order for conceptual flows).
- **Sidebar entry exists at all.** A new page absent from `sidebars.js` is
  only reachable by direct URL. Unless it is an intentional partial or
  redirect target, this is **Critical** — the page is effectively invisible.

## Pillar 2: Written for humans and LLMs in equal measure

Pages serve two audiences at once: engineers scanning for an answer, and LLMs
using the page as context to one-shot a problem (for example, writing the
correct SQL for a specific task). Both need the same thing: a clean
information flow from intent to answer.

Check:

- **Intro states what and why.** The opening paragraph (before the first H2)
  must say what the feature does and why someone would use it, in concrete
  terms. An LLM should be able to decide from the intro alone whether this
  page answers the user's problem.
- **Progressive information flow.** intro (what/why) → syntax (formal grammar)
  → reference material (valid values, types, parameters) → examples (usage).
  Concepts stated once, in the right place. An LLM should not have to stitch
  an answer together from fragments scattered across the page.
- **Self-contained sections.** Each section should make sense without requiring
  the reader to have read three other pages. Link out for depth, but state the
  immediate context inline.
- **One-shot test.** Ask: "If an LLM had only this page as context, could it
  produce a correct, runnable solution to the problem this page addresses?"
  If the answer is no — because a parameter is undocumented, an example is
  missing, or an edge case is hand-waved — that is at least **Major**.
- **No filler.** Throat-clearing intros, vague summaries, and approving
  restatements ("this is exactly what you want") add tokens without adding
  information and degrade both human and LLM use. Flag them.

## Pillar 3: SQL documentation needs plentiful, consistent examples

SQL-related pages live or die on their examples. An engineer or LLM copies an
example and adapts it; sparse or inconsistent examples force guesswork.

Check:

- **Coverage.** Every documented form, clause, and important parameter has at
  least one example. The common case is shown first; edge cases and advanced
  forms follow.
- **Consistent schema.** Examples must use the same tables and columns as the
  rest of the docs. Prefer the demo datasets (`fx_trades`, `core_price`,
  `market_data`, `trades`) and match their exact column names (for example,
  `trades` uses `amount`, `fx_trades` uses `quantity`). A page that invents a
  one-off schema when an existing one fits is **Minor** to **Major** depending
  on how much it confuses cross-page learning.
- **Realistic, finance-friendly naming.** No `Alice`/`Bob`/`sensor_1`, no meme
  coins. Use the conventions in the `questdb-docs-writer` skill.
- **Demoable where possible.** Queries that can run on the demo instance carry
  the `demo` tag and use TICK time filters (`'$now-1h..$now'`) instead of
  hardcoded dates or prices that rot.
- **Predictable output only.** Result tables appear only where output is
  stable and illustrative; omit them for dynamic demo queries.

## Pillar 4: SEO friendly and LLM friendly

The page must be discoverable by search engines and easy for an LLM to surface
and recommend to a user.

Check:

- **Description frontmatter.** A single, specific sentence (~150 chars) that
  names the feature and what it does. This is the snippet both Google and an
  LLM retrieval layer key on. Generic descriptions ("Learn about this
  feature") are a **Major** SEO/LLM miss.
- **Title and label use search terms.** The title should contain the words a
  user actually types. Match real terminology over clever phrasing.
- **Headings are descriptive and keyword-bearing.** Section headings double as
  anchors an LLM can deep-link to. "Examples" is fine; "How ASOF JOIN matches
  rows" is better when it captures a real query intent.
- **Inbound links.** A new page should be linked from related pages (sibling
  reference pages, the relevant concept or overview page), not only reachable
  via the sidebar. Internal links drive SEO and give an LLM multiple retrieval
  paths to the page. A page with zero inbound links is **Minor** to **Major**.
- **Recommendability.** Ask: "Would an LLM, given a user's problem, be able to
  confidently point to this page by name and URL?" That requires a clear
  title, a precise description, and a scope the page actually delivers on.

## Pillar 5: Text-based syntax diagrams for SQL

Every SQL reference page must carry a text-based syntax diagram that an LLM can
parse directly. QuestDB uses fenced `questdb-sql` syntax blocks, not railroad
SVGs, precisely because text grammar is machine-readable.

Check:

- **Syntax section exists and is first.** The `## Syntax` section is the first
  H2, immediately after the intro. Missing syntax block on a SQL reference
  page is **Major**.
- **Text grammar, not an image.** The diagram is a fenced `questdb-sql` block
  using the convention notation: `[optional]`, `{ A | B }` for required
  alternatives, `[A | B]` for optional alternatives, `[, item ...]` for
  repeatable elements, `camelCase` placeholders. An SVG railroad diagram in
  place of a text block is a regression — flag it.
- **Multiple forms get multiple labeled blocks.** When a statement has distinct
  forms (for example CREATE TABLE vs. CREATE TABLE AS SELECT), each gets its
  own labeled block.
- **Completeness.** The grammar covers every clause the page documents. An
  example that uses a clause absent from the syntax block is a defect in one
  of the two.
- **Both operator spellings.** Where inequality is shown, both `!=` and `<>`
  appear (`{ != | <> }`).
- **No horizontal scroll.** Break long grammar lines with indentation so the
  block stays readable and fully visible to both humans and LLMs.

## Cross-cutting checks

- **Build passes** with no broken links (`yarn build`).
- **Defer to `questdb-docs-writer`** for the full style/formatting checklist:
  frontmatter, sentence case, no H1 in body, admonitions over bold, current
  `/docs/...` link paths, alphabetical ordering of reference sections, no
  em-dashes, no LLM mannerisms.
- **Scope discipline.** Review the impact on neighbors too: a new sidebar
  entry shifts its siblings; a renamed page may orphan inbound links. Check
  that the PR did not silently break adjacent pages.
- **Changelog.** If the change is user-facing, confirm the `docs-changelog`
  skill's criteria are met (or flag that a changelog entry is owed).

## Adversarial review agents (deeper pass)

For marquee pages, large PRs, or any change an LLM will build against, add a
deeper pass that spawns **fresh-context adversarial agents** — agents whose
only job is to attack the page, with no checklist to anchor them. This mirrors
the multi-agent review in the `questdb/questdb` repo, adapted to documentation.
Because docs are a graph that humans and LLMs traverse, the deeper pass also
maps the change surface and walks the reader's cross-page journey, not just
each page in isolation.

### Review depth (levels)

Parse the invocation for a level token (`--level=N`, `-lN`, or a bare `0`-`2`).
Default to **0**. State the chosen level in one line at the start of the review
(e.g. "Reviewing at level 1"); if defaulted, mention that level 2 exists.

| Level | What runs |
|-------|-----------|
| **0 (default)** | Single-pass inline pillar review (the procedure above). No agents. Use for typo fixes, small edits, single-page tweaks. |
| **1** | Build the change surface map, then spawn structured agents 1-4 (Agent 4 = cross-page navigation) and the fresh-context adversarial agent (5) in parallel; verify findings. Use for new pages, multi-page changes, and link/sidebar changes. |
| **2** | Full change surface map and all six agents (adds the LLM one-shot consumer, 6) with per-finding verification. Use for flagship/SQL-reference pages and large PRs. |

### Map the change surface (levels 1-2)

Before spawning agents, build a change surface map — the docs analog of a code
reviewer's blast-radius analysis. A page change ripples to its neighbors;
produce this inventory, don't guess it:

- **Inbound links.** For every changed, renamed, or moved page, search the repo
  for links pointing at it (old path *and* new path). A renamed or moved page
  whose old path still has inbound links is an orphan-link defect.
  ```bash
  rg -n "query/sql/foo" documentation/   # repeat per changed page path
  ```
- **Outbound links & indirection chains.** Where each changed page sends the
  reader ("see X"). Flag chains longer than two hops, circular "see X → see Y
  → see X" loops, and links that dead-end on a page that doesn't answer the
  question.
- **Sidebar neighbors.** The siblings immediately before/after each changed
  entry in `sidebars.js`. Note label collisions and whether an insertion
  shifted or duplicated a neighbor.
- **Shared schema & vocabulary.** The demo datasets, column names, and key
  terms the changed pages use, versus what their neighbors and linked pages use
  — the raw material for spotting terminology and schema drift across pages.
- **Reading path(s).** The realistic journeys a reader takes through the
  changed set (concept → guide → SQL reference). These are the scripts Agent 4
  walks.

This map is required input for Agent 4 and sharpens agents 1-3. Skip it only at
level 0.

### Spawning review agents in pi

> Harness note: this skill runs inside **pi**. Launch parallel agents with the
> `subagent(...)` tool using fresh-context `reviewer` agents — there is no
> Claude `Agent` tool. Search the repo with `bash` (`rg`, `grep`, `find`) plus
> `read`; pi has no separate `Grep`/`Glob` tools.

Each agent task must be self-contained — the child does not inherit this
conversation. Give every task: the diff (or have the child re-run the `git
diff` from step 1), the change surface map (for the structured agents), the
list of new/changed pages with their `sidebars.js` context, its role
instructions below, and an explicit "review only — do not edit any files"
constraint.

```typescript
subagent({
  tasks: [
    { agent: "reviewer", task: "Agent 1 — Technical correctness. <diff + changed pages + Agent 1 instructions>. Review only; do not edit." },
    { agent: "reviewer", task: "Agent 2 — Placement & retrieval. <...>. Review only; do not edit." },
    { agent: "reviewer", task: "Agent 3 — Information flow, examples & syntax. <...>. Review only; do not edit." },
    { agent: "reviewer", task: "Agent 4 — Cross-page navigation & coherence. <change surface map + reading paths + linked pages>. Review only; do not edit." },
    { agent: "reviewer", task: "Agent 5 — Fresh-context adversarial. <ONLY the changed page text + file paths; NO pillars>. Review only; do not edit." }
  ],
  context: "fresh"
})
```

The adversarial agents (5 and 6) must NOT receive the pillars, the severity
table, or any checklist — give them only the page content (and, for Agent 6,
the user task). The parent session owns synthesis, deduplication, verification,
and the final report; children only return findings.

### Structured agents (pillars and change surface)

**Agent 1 — Technical correctness & runnable examples (Pillar 0).** Build the
site (`yarn build`). Run every `demo`-tagged and runnable SQL example against
the demo instance or a local build. Cross-check every function signature,
parameter name, type, default, and behavior claim against the product and the
`questdb/sql-parser` repo. A broken build, an example that does not run, or a
signature that does not match the product is **Critical**.

**Agent 2 — Placement, findability & retrieval (Pillars 1, 4).** Map the click
path to the page. Verify section, depth-vs-importance, `sidebar_label`,
ordering, and that the page exists in `sidebars.js` at all. Check the
`description` frontmatter is a specific ~150-char sentence, that the title and
headings carry real search terms, and that the page has inbound links from
sibling/concept pages. A buried marquee feature or a page missing from the
sidebar is **Critical**.

**Agent 3 — Information flow, examples & syntax grammar (Pillars 2, 3, 5).**
Check the intro states what/why, the flow is intro → syntax → reference →
examples, and sections are self-contained. Verify example coverage per
documented form/clause, consistent demo schema and finance-friendly naming,
and that SQL reference pages carry a text-based `questdb-sql` syntax block (not
a railroad SVG) as the first H2, with both `!=`/`<>` spellings and no
horizontal scroll.

**Agent 4 — Cross-page navigation & coherence (human + LLM).** Consumes the
change surface map. Walk each reading path and judge every page-to-page
transition twice:

- **As a human reader:** does each transition flow? Are prerequisites
  established before the page that needs them? Is each concept explained once,
  in one canonical place — not duplicated or, worse, contradicted across pages?
  Do "see X" links land on a page that actually answers the question instead of
  bouncing the reader around?
- **As an LLM doing retrieval:** if these pages are retrieved independently and
  out of order, does each still stand on its own? Do terminology and schema
  stay consistent so an LLM stitching two pages together doesn't hit
  contradictory column names or definitions? Do cross-links give a path to the
  missing context, or dead-end? Is there one canonical page an LLM would cite
  for this topic, or is the answer smeared across several with no clear home?

Output a verdict per transition — COHERENT / BROKEN / DRIFT — each BROKEN or
DRIFT naming the exact link, orphaned inbound link, terminology/schema
mismatch, or circular chain. Orphaned inbound links and cross-page
contradictions are at least **Major**. Skip this agent only when the PR touches
a single page and changes no links or sidebar entries.

### Adversarial agents (no checklist — escape pillar anchoring)

**Agent 5 — Fresh-context adversarial reader.** Give this agent ONLY the raw
text of the changed pages and their file paths. Do NOT give it the pillars, the
severity levels, or any checklist. Its sole instruction:

> You are a skeptical staff engineer who was told this page answers your
> problem. Find every way it misleads you, omits something you need, states
> something that is wrong or unverifiable, buries the answer, or wastes your
> time. Quote the exact passage for each problem.

It may use `read` and `bash` (`rg`/`grep`/`find`) to explore the repo and the
product to confirm a claim is wrong. Findings are not pre-classified — each
states what's wrong, where, and why. A finding here that none of agents 1-4
produced is high signal: the structured review's frame missed it.

**Agent 6 — LLM one-shot consumer (the docs-specific adversarial test).** This
agent operationalizes Pillar 2's one-shot test. Give it ONLY the changed page
as if it were the single retrieved context, plus one realistic user task the
page claims to solve (for example, "write the SQL to X using this feature").
Instruct it to actually produce the runnable solution from the page alone:

> Wherever you must guess a parameter, invent a column or table, assume a
> default, or reach for knowledge not on this page, stop and record it as a
> gap. Every guess is a documentation defect.

The output is the attempted solution plus a list of every point the page forced
a guess. Each gap is at least **Major** — it is concrete proof of a one-shot
failure that the prose-level pillar check only asserts in the abstract.

### Verify before reporting

Adversarial agents over-fire. Before any finding reaches the report, verify it:

- **"Example doesn't run" / "claim is wrong":** re-run the example or re-check
  the signature against the product yourself. Never relay an agent's claim
  unverified.
- **"Buried / missing from sidebar":** open `sidebars.js` and confirm the path.
- **"Orphaned inbound link" / "broken or circular chain" (Agent 4):** resolve
  the link target yourself; a valid relative path the build accepts is not a
  defect.
- **"Forced a guess" (Agent 6):** confirm the needed fact is genuinely absent
  from the page, not merely one section away behind a clear inline link.

Classify each finding as CONFIRMED, FALSE POSITIVE, or CONFIRMED-with-nuance.
Move false positives to the **Downgraded** section of the output with a
one-line dismissal each, so the author can audit the reasoning.

## Producing the review

Structure the review so the author can act on it immediately:

1. **Verdict** — one line: approve, approve-with-nits, or request-changes.
2. **Blocking issues** — every Critical and Major finding, each with the file
   path, what is wrong, and the concrete fix. Group by file.
3. **Non-blocking** — Minor and Nit findings, briefly.
4. **What works** — call out what the PR does well, so good patterns get
   reinforced.
5. **Downgraded (false positives)** — only when agent passes ran (levels 1-2):
   findings raised by an agent but dismissed on verification, one line each
   stating the original claim and why it was dropped. Also state the verified
   vs dropped count (e.g. "6 findings verified, 3 false positives removed").

Reference exact paths (`documentation/query/sql/foo.md`) and, where useful,
line numbers. Propose the fix, don't just name the problem. Be direct and
concise; this is a technical review for a technical author.
