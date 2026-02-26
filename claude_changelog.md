## Changelog Generation

When asked to generate or update the documentation changelog:

### Step 1: Determine the date range

1. Check if `documentation/changelog.mdx` exists
2. If it exists, parse the most recent date header (format: `## YYYY-MM-DD` or `## Month YYYY`)
3. If no changelog exists or no date found, use 1 month ago from today. No exceptions
4. If existing changelog: use the last entry date
5. NEVER go further back than the calculated date, even if you see interesting commits
6. If asked to go further back, confirm with the user first
7. Store this as `SINCE_DATE`

### Step 2: Get commits since that date

Run:
```bash
git log --since="$SINCE_DATE" --pretty=format:"%H|%ad|%s" --date=short --no-merges -- documentation/
```

### Step 2b: Get QuestDB releases for the period

Fetch releases from the QuestDB GitHub repository:
```bash
gh api repos/questdb/questdb/releases --jq '.[] | "\(.tag_name)|\(.published_at)"'
```

Filter releases that fall within the changelog period. Group by month.

**Format for releases:**
```markdown
### Releases

- [9.3.2](https://questdb.com/release-notes/) - Released January 28, 2026
- [9.3.1](https://questdb.com/release-notes/) - Released January 14, 2026
```

**Rules:**
- Include ALL releases in the period, one line per release
- Link text is the version number (e.g., `9.3.2`)
- All links point to `https://questdb.com/release-notes/`
- Include the release date in format "Released Month DD, YYYY"
- List releases in descending order (newest first)
- Place the "Releases" section FIRST in each month's entry (before "New", "Updated", etc.)
- If no releases in a month, omit the "Releases" section entirely

### Step 3: Analyze each commit

For each commit hash, get the diff:
```bash
git show <hash> --stat --no-color -- '*.md' '*.mdx'
git diff <hash>^..<hash> -- '*.md' '*.mdx'
```

Classify changes into:

**SKIP (cosmetic/internal):**
- Typo fixes (< 5 words changed)
- Whitespace/formatting only
- Navigation/sidebar changes only
- Internal link updates
- CI/build config changes
- README updates (unless user-facing)

**INCLUDE (user-facing):**
- New documentation pages
- New sections in existing pages
- Updated code examples
- API reference changes
- New SQL function docs
- Configuration option docs
- Tutorial additions/updates
- Corrected technical instructions

### Step 4: Categorize included changes

Group by:
- **Releases** — QuestDB releases in this period (from Step 2b)
- **New** — Brand new pages or major new sections
- **Updated** — Significant updates to existing content
- **Reference** — SQL functions, configuration, API docs
- **Guides** — Tutorials, how-tos, walkthroughs

### Step 5: Generate changelog entry

Format for Docusaurus:
```mdx
## February 2026

### Releases

- [9.4.0](https://questdb.com/release-notes/) - Released February 15, 2026

### New

- [TICK Syntax](/docs/query/operators/tick/) - New DSL for expressing complex time intervals
- [Database Views](/docs/concepts/views/) - Virtual tables for query composition

### Updated

- [Materialized Views](/docs/concepts/materialized-views/) - Added `REFRESH PERIOD` compact syntax
- [Window Functions](/docs/query/functions/window-functions/overview/) - Now support arithmetic expressions

### Reference

- Added `weighted_avg()`, `weighted_stddev_rel()`, `weighted_stddev_freq()` functions
- Documented `tables()` system view columns: `minTimestamp`, `maxTimestamp`
```

### Link Validation (BEFORE writing)

1. Before generating any internal link, verify the target file exists:
```bash
# Check if the page exists
ls documentation/reference/sql/tick.mdx 2>/dev/null || echo "NOT FOUND"
```

2. If the file doesn't exist, use ONE of these strategies:
   - Option A: Describe without linking (preferred for speed)
     "Added TICK syntax documentation for time intervals"
   - Option B: Use a search-friendly description
     "TICK Syntax (see SQL Reference > TICK)"

3. NEVER generate a markdown link unless you've confirmed the path exists

4. For sidebar links, check sidebars.js or the actual file structure first

### Validation Strategy (FAST)

1. DO NOT run `yarn build` to validate links during iteration
2. Instead, validate links by checking the filesystem directly:
```bash
# Get all .md and .mdx files and their paths
find documentation -name "*.mdx" -o -name "*.md" | sed 's|documentation/||; s|\.mdx$||; s|\.md$||'
```

3. Cross-reference your generated links against this list BEFORE writing
4. Only run a build check ONCE at the very end, after all content is finalized
5. If build fails, fix ALL broken links in one pass, not iteratively

### Step 6: Update the changelog file

Prepend the new entry after the frontmatter but before existing entries.

The changelog file location is `documentation/changelog.mdx` (NOT `documentation/docs/changelog.mdx`).

---

## One-Shot Prompt for Claude Code

Here's a prompt you can paste directly into Claude Code:
```
Generate a documentation changelog for the QuestDB docs.

1. First, check if documentation/changelog.mdx exists. If so, find the date of the most recent entry. If not, we'll create it and use 1 month ago as the start date.

2. Get all commits to .md and .mdx files since that date:
   git log --since="<date>" --pretty=format:"%H|%ad|%s" --date=short --no-merges -- 'documentation/**/*.md' 'documentation/**/*.mdx'

3. Get QuestDB releases for the period:
   gh api repos/questdb/questdb/releases --jq '.[] | "\(.tag_name)|\(.published_at)"'

4. For each commit, examine the diff to determine if it's user-facing:
   - SKIP: typos, formatting, nav changes, link fixes, build/CI changes
   - INCLUDE: new pages, new sections, updated examples, API docs, config docs, corrected instructions

5. For included changes, write a one-line summary describing what users will find different. Focus on the benefit, not the file path.

6. Group changes into: Releases (from GitHub), New, Updated, Reference, Guides

7. Format as a Docusaurus-compatible MDX entry with the month/year as header.

8. Either create documentation/changelog.mdx with proper frontmatter, or prepend the new entry to the existing file.

Be concise in summaries. Users want to know "what can I learn that I couldn't before" not "file X was modified."
```
