# Documentation changelog

Trigger this skill when documentation changes are significant enough to be
user-facing. This means: new pages, new sections, new functions or SQL
keywords, restructured content, updated examples, or corrected technical
instructions.

Do NOT trigger for: typo fixes, whitespace/formatting, alphabetical
reordering, sidebar-only changes, internal link updates, CI/build config,
or README updates.

## When to update the changelog

After completing a documentation task, evaluate whether the changes are
changelog-worthy. If yes, update `documentation/changelog.mdx` as part of the
same work, before reporting the task as done.

## How to generate a changelog entry

### Step 1: Determine the date range

1. Locate the changelog by globbing for `**/changelog.mdx` under the repo
   root. Use the resolved absolute path for all subsequent reads and writes.
2. Read the file and find the most recent month header
   (format: `## Month YYYY`).
3. If the changelog does not exist or has no date, use 1 month ago. No
   exceptions.
4. Store this as `SINCE_DATE`.
5. Never go further back than the calculated date without user confirmation.

### Step 2: Get commits since that date

```bash
git log --since="$SINCE_DATE" --pretty=format:"%H|%ad|%s" --date=short --no-merges -- documentation/
```

### Step 3: Get QuestDB releases for the period

```bash
gh api repos/questdb/questdb/releases --jq '.[] | "\(.tag_name)|\(.published_at)"'
```

Filter to releases within the period. Format:

```markdown
### Releases

- [9.3.2](https://questdb.com/release-notes/) - Released January 28, 2026
- [9.3.1](https://questdb.com/release-notes/) - Released January 14, 2026
```

Rules:
- One line per release, descending order (newest first)
- Link text is the version number
- All links point to `https://questdb.com/release-notes/`
- Date format: "Released Month DD, YYYY"
- Place "Releases" FIRST in each month (before New, Updated, etc.)
- Omit if no releases that month

### Step 4: Analyze each commit

For each commit hash, check the diff:

```bash
git show <hash> --stat --no-color -- '*.md' '*.mdx'
```

Read the full diff when the stat is ambiguous:

```bash
git diff <hash>^..<hash> -- '*.md' '*.mdx'
```

**SKIP (cosmetic/internal):**
- Typo fixes (fewer than 5 words changed)
- Whitespace/formatting only
- Navigation/sidebar changes only
- Internal link updates
- CI/build config changes
- README updates (unless user-facing)
- Alphabetical reordering of existing content

**INCLUDE (user-facing):**
- New documentation pages
- New sections in existing pages
- Updated code examples
- API reference changes
- New SQL function docs
- Configuration option docs
- Tutorial additions/updates
- Corrected technical instructions

### Step 5: Categorize changes

Group into these categories, always in this exact order. Skip a category if
there are no entries for it, but never reorder:

1. **Releases** - QuestDB releases in the period (from Step 3)
2. **New** - Brand new pages or major new sections (content that did not exist before)
3. **Reference** - Individual functions, parameters, config properties, or syntax additions to existing reference pages
4. **Guides** - Tutorials, how-tos, walkthroughs
5. **Updated** - Significant updates to existing content (restructured pages, rewritten sections, new examples)

### Step 6: Generate the entry

Format as Docusaurus-compatible MDX, one `## Month YYYY` header per month:

```mdx
## February 2026

### Releases

- [9.4.0](https://questdb.com/release-notes/) - Released February 15, 2026

### New

- [TICK Syntax](/docs/query/operators/tick/) - New DSL for expressing complex time intervals
- [Database Views](/docs/concepts/views/) - Virtual tables for query composition

### Reference

- Added `weighted_avg()`, `weighted_stddev_rel()`, `weighted_stddev_freq()` functions

### Updated

- [Materialized Views](/docs/concepts/materialized-views/) - Added `REFRESH PERIOD` compact syntax
```

### Step 7: Soft-validate links during generation

While drafting the entry, use Glob or `ls` to check that target files exist
before adding a `/docs/...` link. The mapping is: `/docs/X/Y/` maps to
`documentation/X/Y.md` or `documentation/X/Y.mdx` or
`documentation/X/Y/index.md`. Check all three variants.

If a file does not exist, describe the change without a link:
- "Added TICK syntax documentation for time intervals"

**Common mapping pitfalls:**
- `/docs/configuration/` needs an `overview.md` or `index.md`, not just the
  directory
- Pages with hyphens in the URL may have different filenames
- Some pages use `.mdx` extension, not `.md`

### Step 8: Update the changelog file

Prepend the new entry after the frontmatter and intro paragraph but before
existing month entries.

The changelog file is `documentation/changelog.mdx` relative to the
repository root. Locate it by globbing for `**/changelog.mdx` under the
content directory if needed. Read the file before writing to confirm the
resolved path is correct.

### Step 9: Build to validate links (mandatory)

After writing the changelog, run `yarn build`. This is the only reliable way
to confirm all links resolve. Glob and `ls` checks in Step 7 catch obvious
mistakes early, but the build is the hard gate.

If the build reports broken links, fix ALL of them in one pass, then build
again. Do not report the changelog as ready until the build passes.

## Writing style

- Focus on what users can now learn or do, not which file was modified.
- One line per change, concise.
- Link to the page when the link is verified; otherwise describe without linking.
- Use sentence case for descriptions.
