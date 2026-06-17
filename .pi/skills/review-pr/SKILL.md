---
name: review-pr
description: Review QuestDB documentation pull requests for placement, discoverability, dual-audience (human + LLM) quality, example coverage, and SQL syntax diagrams. Use when reviewing a docs PR, a new or changed page, or assessing whether documentation is findable, correct, and usable by both engineers and LLMs that build systems against QuestDB.
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

1. **Get the diff and the scope.** Identify every file the PR adds or changes.
   ```bash
   git fetch origin
   git diff --stat origin/main...HEAD -- documentation/
   git diff origin/main...HEAD -- documentation/sidebars.js
   ```
   List new pages, changed pages, and any `sidebars.js` change separately. A
   new page with no `sidebars.js` change is an immediate red flag (see
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

## Producing the review

Structure the review so the author can act on it immediately:

1. **Verdict** — one line: approve, approve-with-nits, or request-changes.
2. **Blocking issues** — every Critical and Major finding, each with the file
   path, what is wrong, and the concrete fix. Group by file.
3. **Non-blocking** — Minor and Nit findings, briefly.
4. **What works** — call out what the PR does well, so good patterns get
   reinforced.

Reference exact paths (`documentation/query/sql/foo.md`) and, where useful,
line numbers. Propose the fix, don't just name the problem. Be direct and
concise; this is a technical review for a technical author.
