---
name: questdb-docs-writer
description: Create, review, and improve QuestDB documentation pages. Covers SQL reference, guides, cookbook recipes, syntax blocks, examples, page structure, and quality checks. Use when writing new docs, reviewing existing pages, adding examples, or restructuring content in the questdb/documentation repo (used both standalone and as a submodule of questdb.io).
---

# QuestDB documentation writer and reviewer

Use this as an operating procedure when creating, editing, or reviewing
documentation in the `questdb/documentation` repo
(https://github.com/questdb/documentation). The repo is consumed both as a
standalone project and as a submodule of the `questdb.io` repo. All paths in
this guide are given relative to the documentation repo root, which is the
same regardless of how the repo is checked out.

## Repository structure

```
.                              # repo root (questdb/documentation)
├── documentation/             # Main content (markdown/MDX)
│   ├── concepts/              # Conceptual docs
│   ├── configuration/         # Config reference
│   │   └── configuration-utils/  # Config JSON files
│   ├── cookbook/              # Recipes and how-tos
│   ├── guides/                # User guides and tutorials
│   ├── ingestion/             # Ingestion methods
│   ├── query/
│   │   ├── datatypes/         # Data type reference
│   │   ├── functions/         # Function reference
│   │   └── sql/               # SQL keyword reference
│   │       └── acl/           # RBAC SQL reference (Enterprise)
│   ├── security/              # RBAC and auth
│   └── sidebars.js            # Sidebar navigation
├── scripts/                   # Python generators (e.g., SVG diagram scripts)
├── src/
│   ├── components/            # Custom React components
│   ├── theme/                 # MDX components, theme overrides
│   └── css/                   # Global CSS
├── static/                    # Images, diagrams, static assets
└── docusaurus.config.js
```

## Page structure and formatting

### Frontmatter

Every page must use YAML frontmatter for the title and description. NEVER use
an H1 heading in the body. The first heading should be H2 or lower.

```yaml
---
title: Page title in sentence case
sidebar_label: Short menu label
description: Brief SEO description (one sentence, ~150 chars).
---
```

**Sentence case rules:**
- First word capitalized
- After a colon, next word capitalized
- Proper nouns stay capitalized: QuestDB, SQL, Grafana, SAMPLE BY, ASOF JOIN, etc.
- Everything else lowercase

**Writing style:**
- No em-dashes or parenthetical dashes. Rephrase the sentence instead
- Do not use ` - ` as a separator in function signatures or section openers
  (e.g., `` `func()` - Does something ``). Write a normal sentence instead:
  `` `func()` does something ``
- No AI-related mentions or co-author attributions
- Direct and concise tone. Let the code speak for itself
- Avoid LLM-sounding filler: "In this article, we will explore...",
  "Let's dive in", "In conclusion", "It's worth noting that"
- Lead with the answer or the "so what", not the reasoning
- Avoid repeating the same point in multiple sections. Say it once, in the
  best place

**LLM mannerism checklist** (run before finishing any page):

- **Throat-clearing openers**: cut sentences that announce what the reader is
  about to read instead of saying it ("Let's take a closer look at...",
  "This section walks through...", "In other words, ...")
- **Filler intensifiers**: strip "genuinely", "truly", "real", "significant",
  "precisely" and see if the sentence loses meaning. If not, remove them
- **Summary pattern**: sentences of the form "this is exactly what X wants"
  restate what the reader just learned in vague, approving language. Replace
  with a concrete fact or cut
- **Three-short-declaratives rhythm**: three punchy sentences in a row is a
  signature LLM cadence. Combine into one or two
- **Dramatic setup lines**: "So the question on the table was:" and similar
  rhetorical framings feel stagey. Just ask the question or fold it in

### Intro paragraph

Every page must open with a short paragraph (before the first H2) that
explains **what** the feature does and **why** a user would use it. This
serves both human readers scanning the page and LLMs that use the docs as
context. Avoid purely mechanical descriptions like "Sets X on Y" - also
state the practical benefit (e.g., "affecting file size and read
performance", "speeding up equality queries").

When a page covers multiple related concepts (e.g., encoding, compression,
and bloom filters), briefly explain each in the intro so readers understand
the full scope before reaching the syntax.

### Headings

- Start body content at H2 (`##`)
- Use headings hierarchically (don't skip levels)
- Prefer alphabetical ordering for reference sections (e.g., list of SQL
  statements, list of functions, list of parameters)

### Admonitions

Use Docusaurus admonitions, not bold text:

```markdown
:::note
Content here.
:::

:::tip
Content here.
:::

:::warning
Content here.
:::

:::caution
Content here.
:::
```

### Links

Use current doc paths (NOT the old `/docs/reference/...` structure):

```markdown
/docs/query/sql/sample-by/
/docs/query/functions/aggregation/
/docs/query/sql/join/
/docs/concepts/designated-timestamp/
```

Always verify links exist before committing. Run `yarn build` to catch broken
links.

**Blog links MUST use absolute paths.** Blog post URLs are determined by the
`slug` frontmatter field, NOT the filename. The final URL is `/blog/{slug}`.
- Correct: `[link text](/blog/influxdb-vs-questdb-comparison/)`
- WRONG: `[link text](blog/influxdb-vs-questdb-comparison/)` (relative - will
  resolve relative to the current page, creating broken URLs)

## SQL reference pages

QuestDB documentation is consumed by both humans browsing the site and LLMs
using it as context. Every page should flow naturally for both audiences:
intro (what and why) - syntax (formal grammar) - reference material (valid
values) - examples (usage patterns). Avoid scattering explanations across
sections - state concepts once in the right place so a reader (human or LLM)
builds understanding progressively without jumping around the page.

### Syntax blocks

Every SQL reference page must have a `## Syntax` section as the **first H2**,
immediately after the intro paragraph. This gives readers the formal grammar
up front before any explanatory text or examples. If the statement has
supporting reference material (e.g., supported values, valid types), place it
right after the syntax block and before the examples so readers see the valid
inputs before the usage patterns.

Use fenced `questdb-sql` code blocks for syntax definitions. When a statement
has multiple distinct forms, use separate labeled blocks:

````markdown
```questdb-sql title="Form A"
CREATE TABLE tableName (...);
```

```questdb-sql title="Form B"
CREATE TABLE tableName AS (selectQuery);
```
````

**Syntax block conventions:**

- Use `[brackets]` for optional clauses
- Use `{ A | B | C }` for required alternatives
- Use `[A | B]` for optional alternatives
- Use `[, item ...]` for repeatable elements
- Use lowercase `camelCase` for placeholders: `tableName`, `columnName`,
  `timestampColumn`
- Use inline SQL comments (`-- comment`) sparingly and keep them short to avoid
  horizontal scrolling
- When a SQL statement accepts both `!=` and `<>`, always show both:
  `{ != | <> }`
- When singular and plural forms are both accepted (e.g., HOUR/HOURS), use
  bracket notation: `HOUR[S]`

### Syntax block linking

Since fenced code blocks can't contain clickable links, add a brief note after
the block linking to the relevant section:

````markdown
```questdb-sql
CREATE TABLE tableName (columnName columnTypeDef ...)  -- see Type definition
```

Where [`columnTypeDef`](#type-definition) is the column's data type.
````

Or use inline comments to hint at the section name.

### Page intro for multi-form statements

When a SQL statement has multiple forms (e.g., CREATE TABLE, INSERT, COPY),
list them at the top with anchor links:

```markdown
`CREATE TABLE` has three creation modes:

1. **[Providing the table schema](#syntax)** - define each column yourself.
2. **[CREATE TABLE AS SELECT](#create-table-as)** - derive schema from a query.
3. **[CREATE TABLE LIKE](#create-table-like)** - clone another table's structure.
```

## Function reference pages

### Alphabetical ordering is mandatory

Every function reference page must have its function sections (`## functionName`)
sorted alphabetically. This also applies to any index or category tables at the
top of the page.

**Bundled functions sort by their primary name:**
- "today, tomorrow, yesterday" sorts as `today`
- "variance / var_samp" sorts as `variance`
- "stddev_pop / stddev_samp / stddev" sorts as `stddev`
- "strpos / position" sorts as `strpos`

**When adding a new function:**
1. Check if the page is already sorted. If so, insert in the correct position.
   If not, flag the ordering issue to the user.
2. Add the function to any index/reference table or category list at the top of
   the page, not just the body.

**Verify sort order after reordering** using:
```
grep "^## " file.md | awk '{print $2}' | sort -c
```
If `sort -c` produces no output, the file is sorted. If it reports a disorder,
fix it.

### Reordering large files

When reordering many sections in a large file (10+ sections), do NOT use
surgical edit-move-edit. Instead:

1. Read the file and note each section's content.
2. Rewrite the full reordered file in one shot rather than editing
   surgically.
3. Verify the line count matches (no content lost) and run `sort -c`.

The surgical approach is error-prone: line numbers shift after each edit,
sections can be accidentally deleted, and it takes many more tool calls.

### Function parameters

Use bullet points for parameter lists, not tables. This is more readable and
consistent with the rest of the docs:

```markdown
- `param` (`type`): description.
- `param` (optional, `type`): description. Default: value.
```

### Examples

- Use `questdb-sql` language identifier for all QuestDB SQL
- Mark demoable queries with `demo`: `` ```questdb-sql demo title="..." ``
- Add descriptive titles to examples
- Use realistic finance examples wherever possible
- Avoid horizontal scrolling - keep lines reasonably short

### Avoiding horizontal scroll

Code blocks that force horizontal scrolling hurt readability. Keep syntax
blocks and examples under ~80 characters where practical. When a line is
long, break it with indentation:

```sql
ALTER TABLE tableName SET TTL
    n { HOUR[S] | DAY[S] | WEEK[S] | MONTH[S] | YEAR[S] };
```

For inline comments, keep them terse (`-- see Type definition` not
`-- see the Type definition section below for all available column types`).

## SQL examples - best practices

### Use demo datasets

Prefer the QuestDB demo instance tables for examples:

- **`fx_trades`** - simulated FX trades (symbol, side, price, quantity, ecn).
  Uses `quantity` column (NOT `amount`).
- **`core_price`** - FX bid/ask quotes (symbol, ecn, bid_price, ask_price)
- **`market_data`** - order book snapshots (symbol, best_bid, best_ask, bids[][],
  asks[][])
- **`trades`** - real crypto trades from OKX. Uses `amount` column (NOT
  `quantity`). Symbols are `BTC-USDT`, `ETH-USDT` style (NOT `BTC-USD`).

### Use TICK syntax

Prefer TICK syntax over date functions:

```sql
-- Preferred
WHERE timestamp IN '$today'
WHERE timestamp IN '$now-1h..$now'
WHERE timestamp IN '$now-7d..$now'

-- Avoid
WHERE timestamp IN today()
WHERE timestamp > dateadd('h', -1, now())
```

### Finance-friendly examples

- Use realistic table and column names from the finance domain
- Avoid placeholder names like Alice, Bob, tango, sensor_1
- For synthetic schemas, use finance terms: `desk` (eq, fi, cmd), `counterparty`,
  `venue`, `ecn`, `fills`, `orders`
- Never use meme coins (DOGE, SHIB, etc.) in examples
- Use symbols that exist on the demo: `BTC-USDT`, `ETH-USDT`, `SOL-USDT` for
  crypto; `EURUSD`, `GBPUSD`, `USDJPY` for FX
- Avoid hardcoded prices that will become outdated - use relative filters
  (`'$now-1h..$now'`) and `LIMIT -N` instead

### Inequality operators

When documenting inequality syntax, always show both `!=` and `<>`:

```sql
WHERE columnName { != | <> } value
```

### Result tables

- Include result tables only when the output is predictable and illustrative
- For demoable queries with dynamic output, omit result tables
- For synthetic data examples, include result tables to show expected output
- Keep result tables compact (4-6 rows typical)

## Cookbook pages

Cookbook pages follow a stricter structure:

````markdown
---
title: "Clear verb-first title"
sidebar_label: "Short label (~25 chars)"
description: "SEO description"
---

Brief intro (1-2 sentences).

## Problem

Describe the specific problem or use case.

## Solution

The actual solution.

```questdb-sql demo title="Descriptive title"
SELECT ...
```

Brief explanation (only what's needed).

:::info Related documentation
- [Link 1](/docs/path/)
- [Link 2](/docs/path/)
:::
````

Keep it minimal - think "recipe" not "comprehensive guide". No performance tips,
troubleshooting, or alternative approaches unless essential.

## Join documentation conventions

### Page organization

The main JOIN page (`join.md`) serves as a directory with two clear sections:

- **Standard SQL joins**: INNER, LEFT, RIGHT, FULL, CROSS, LATERAL
- **Time-series joins**: ASOF, LT, SPLICE, HORIZON, WINDOW

Joins with dedicated pages (ASOF, LATERAL, HORIZON, WINDOW) get a brief
description on the main JOIN page with a link. Include a one-liner that
explains what the join does - not "is a powerful extension" but what it
actually does.

### Dedicated join pages

Structure: Intro (what it does in one sentence) - Syntax - How it works
(precise mechanics) - Examples (demoable) - Limitations.

## Configuration property sync

When documenting a feature that introduces a new server configuration property
(e.g., `cairo.sql.subsample.max.rows`), add it to the configuration reference
JSON at `documentation/configuration/configuration-utils/_cairo.config.json`.
Properties are grouped by prefix and sorted alphabetically within each group.

Each entry follows this format:

```json
"cairo.sql.example.property": {
  "default": "value",
  "description": "What this property controls."
}
```

## Configuration page format

Configuration pages live under `documentation/configuration/`. Each subsystem
has its own page (e.g., `cairo-engine.md`, `shared-workers.md`, `http-server.md`).
The overview page (`overview.md`) covers general configuration methods and links
to all subsystem pages.

### Page structure

Each configuration page uses **epigraph style**: one H2 section per logical
group, one H3 heading per property. Do not use the `ConfigTable` component.

```markdown
## Section name

Optional intro paragraph for the section.

### property.name

- **Default**: `value`
- **Reloadable**: yes/no

Description of what the property does. Free-form text where you can add
notes, examples, or warnings as needed.
```

### Ordering rules

- **Sections** (H2): ordered by logical flow, not alphabetically. Group
  related properties together (e.g., all writer settings, all connection
  settings). The section order should follow the data lifecycle or user
  mental model (e.g., write path before query execution).
- **Properties** (H3) within each section: **strictly alphabetical**.
- **Sidebar entries** for configuration pages: alphabetical.

### Adding a new property

1. Add the property to the appropriate JSON file in
   `configuration/configuration-utils/`.
2. Add the property as an H3 entry on the appropriate configuration page,
   in alphabetical order within its section.
3. If no existing section fits, create a new H2 section in the logical
   position within the page.
4. If the property belongs to a new subsystem, create a new page, add it
   to `sidebars.js` in alphabetical order, and add a row to the index
   table in `overview.md`.

### Property metadata

Every property entry must include:
- **Default**: the default value (use backtick formatting for values)
- **Reloadable**: `yes` or `no`

The description follows as a paragraph after the metadata. Keep it concise
but include practical guidance (when to change it, what the trade-offs are)
when relevant.

## SVG diagrams

When documentation needs visual diagrams (algorithm comparisons, data flow,
architecture), generate them as SVG files using a Python generator script in
`scripts/`. See `scripts/gen_subsample_svgs.py` for a working example.

### Color palette

Use the QuestDB documentation palette. SVGs loaded via `<img>` tags don't
inherit page CSS, so use `@media (prefers-color-scheme: dark)` in the SVG's
`<style>` block for theme support.

| Role | Light mode | Dark mode |
|------|-----------|-----------|
| Titles | `#0cc0df` (cyan) | `#0cc0df` (cyan) |
| Legend text | `#64748b` | `#b1b5d3` (lavender-gray) |
| Data lines | `#e289a4` (pink) | `#e289a4` (pink) |
| Data dots (selected rows) | `#888` (gray) | `#888` (gray) |
| Accent dots (min/max roles) | `#0cc0df` (cyan) | `#0cc0df` (cyan) |
| Reference/raw data lines | `#bbb` | `#555` |
| Boundary verticals | `#5a9aa8` dotted | `#2a7a8a` dotted |
| Separator lines | `#ccc` | `#3a3a3a` |

Reference: the TTL page (`static/images/docs/concepts/ttl.svg`) and the
window functions page use the same palette.

### Sizing and scaling

- **ViewBox**: use ~600 units wide. This maps closely to screen pixels at
  typical content width. All font sizes, stroke widths, and dot radii are
  specified in viewBox units.
- **Intrinsic width**: set `width` and `height` attributes larger than the
  content area (e.g., `width="1400"`) so the browser's `max-width: 100%`
  constrains the image to fill the container. The viewBox maintains aspect
  ratio.
- **CSS rule**: images won't fill the content area by default. Add a scoped
  CSS rule in `src/css/_global.css`:
  ```css
  article img[src*="/your-feature/"] { width: 100%; }
  ```
- **Typical sizes** (in viewBox units, rendered ~1.3x on screen):
  - Titles: 12px, font-weight 600
  - Legend text: 11px
  - Data line stroke: 2.0
  - Reference line stroke: 1.0
  - Data dots radius: 4.5
  - Legend dots radius: 3.5
  - Boundary line stroke: 0.8

### Structure

- Each diagram should be self-contained with its own legend at the bottom.
  Do not combine multiple unrelated charts into one SVG - split them into
  separate files so each has its own legend.
- Use a Python generator script (not hand-crafted SVG) for any diagram with
  computed coordinates. Store in `scripts/` and output to
  `static/images/docs/<feature>/`.
- Reference raw data as dashed lines in the background when showing
  algorithm output on top.
- Use distinct visual styles for different element types: dashed for raw
  data, dotted for boundaries, solid for algorithm output.

### Markdown integration

For SVG diagrams, use standard markdown image syntax:

```markdown
![Alt text](/images/docs/feature/diagram.svg)
```

Do NOT use `<img>` HTML tags - they break in Docusaurus `.md` files.

### Screenshots and UI images

For screenshots (web console, UI elements), use the `<Screenshot>` component
instead of markdown image syntax. It provides spacing, a caption below the
image, and zoom-on-click:

```markdown
<Screenshot
  alt="Description for accessibility"
  title="Caption shown below the image."
  src="images/docs/feature/screenshot.webp"
  width={800}
/>
```

The component is globally available in all `.md` and `.mdx` files (registered
in `src/theme/MDXComponents.js`). Store screenshots as `.webp` in
`static/images/docs/<feature>/`. Convert from PNG with:

```
cwebp -lossless -z 9 -m 6 -mt input.png -o output.webp
```

## SQL parser sync check

When documenting new SQL features, check whether the `questdb/sql-parser`
repository (https://github.com/questdb/sql-parser) needs updating. The parser
provides syntax highlighting and autocomplete for the QuestDB web console.

**When to check:** any time documentation introduces or references:
- A new SQL keyword (e.g., `UNNEST`, `LATERAL`, `HORIZON`)
- A new function (e.g., `array_build`, `rnd_timestamp_ns`)
- A new constant (e.g., `asc`, `desc`, `pgwire`, `rest`)
- A new data type (e.g., `timestamp_ns`, `decimal`)
- A new operator (e.g., `<>`, `!~`)

**Files to check** (all in `src/grammar/` of the sql-parser repo):
- `keywords.ts` - SQL keywords (alphabetically sorted)
- `functions.ts` - function names (alphabetically sorted)
- `constants.ts` - constant values (alphabetically sorted)
- `dataTypes.ts` - data type names (alphabetically sorted)
- `operators.ts` - operators

**What to do:**

1. Check whether the token already exists on the default branch. Use whichever
   approach fits the contributor's setup:

   **If the sql-parser repo is cloned locally**, grep the file directly. Ask
   the user for the path if it isn't obvious from the environment:
   ```
   grep -w 'lateral' <path-to-sql-parser>/src/grammar/keywords.ts
   ```

   **Otherwise, query GitHub via the `gh` CLI** (no local clone needed):
   ```
   gh api repos/questdb/sql-parser/contents/src/grammar/keywords.ts \
     -H "Accept: application/vnd.github.raw" | grep -w 'lateral'
   ```

2. If not present, also check **open pull requests** - someone may have already
   submitted the addition:
   ```
   gh pr list --repo questdb/sql-parser --state open
   gh pr diff <pr_number> --repo questdb/sql-parser | grep -w 'lateral'
   ```

3. If missing from both the default branch AND all open PRs, **alert the user**
   with the specific file and the token that needs adding. Do NOT silently
   skip this.
4. The user will decide whether to add it in this session, in a separate PR
   to `questdb/sql-parser`, or defer it.

Example check (no local clone required):
```
# Check current default branch on GitHub
gh api repos/questdb/sql-parser/contents/src/grammar/keywords.ts \
  -H "Accept: application/vnd.github.raw" | grep -w 'lateral'
gh api repos/questdb/sql-parser/contents/src/grammar/functions.ts \
  -H "Accept: application/vnd.github.raw" | grep -w 'array_elem_avg'

# Check open PRs
gh pr list --repo questdb/sql-parser --state open
gh pr diff <pr_number> --repo questdb/sql-parser | grep -w 'array_elem_avg'
```

## Pull requests

Never include a "Test plan" section in documentation or questdb.io PRs. These
are docs, not code - checklists like "yarn build passes" or "page renders
correctly" are noise. PR body should only have a Summary section (and
Dependencies if applicable).

## Review checklist

When reviewing a documentation page, check:

- [ ] Frontmatter uses sentence case for title
- [ ] No H1 headings in body
- [ ] SQL syntax uses fenced `questdb-sql` blocks (no railroad SVG diagrams)
- [ ] Multi-form statements have separate labeled syntax blocks
- [ ] Examples use demo datasets where possible (`fx_trades`, `core_price`, etc.)
- [ ] Demoable queries marked with `demo` tag
- [ ] TICK syntax used for date filtering (`'$today'`, `'$now-1h..$now'`)
- [ ] Both `!=` and `<>` shown where inequality is documented
- [ ] No horizontal scrolling in code blocks
- [ ] Links use correct paths (`/docs/query/...` not `/docs/reference/...`)
- [ ] Alphabetical ordering: function reference sections, parameter lists, statement lists, category tables
- [ ] Admonitions used instead of bold notes
- [ ] Finance-friendly naming (no Alice/Bob, no meme coins)
- [ ] Result tables only where output is predictable
- [ ] `yarn build` passes (no broken links)
- [ ] Sidebar updated if new pages were added (`sidebars.js`)
- [ ] New config properties added to `configuration/configuration-utils/_cairo.config.json`
- [ ] New keywords/functions/types checked against `questdb/sql-parser` repo
      (default branch and open PRs)

## Git workflow

- Always fetch/pull main before creating new branches
- NEVER commit or push without explicit user instruction
- Stage files with explicit paths or `git add -u` (NEVER `git add -A`)
- Run `yarn build` before pushing (NOT between edit batches - it breaks the
  dev server)
- Keep commits focused - one logical change per commit
