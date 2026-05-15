---
name: review-client
description: Review a pull request that changes QuestDB **QWP** client documentation (the WebSocket transport, `ws::` / `wss::`) from the perspective of an agent or developer building an application against the client. Validates that the docs answer the concrete questions someone writing code would hit on day one — null handling, concurrency, DDL/DML/streaming SQL, acks (sync vs async, optional vs required), failover behavior and backpressure, connection notifications, mid-stream stream restarts, connect-string clarity, and the absence of content dependencies on legacy ILP pages scheduled for removal. Legacy ILP (`http::` / `tcp::`) client pages are explicitly out of scope. Requires a PR number as input.
argument-hint: <PR-number>
---

# Review client documentation PR

**Usage:** `/review-client <PR-number>` — for example, `/review-client 451`.

The PR number is **required**. If the user invokes the skill with no
argument (e.g. just `/review-client`), do not proceed: ask them which PR to
review and stop. Do **not** infer the PR from the current branch, recent
commits, `gh pr list`, or any other source — the answer must come from the
user. Acceptable forms are a bare number (`451`), a `#`-prefixed form
(`#451`), or a full PR URL; reject anything else and ask again.

Reviews a pull request that touches **QWP** client documentation against a
fixed checklist of questions an application developer (human or agent) would
need answered before they can ship code. The output is a structured review
the docs author can act on directly.

## Scope: QWP only

There are two parallel families of client documentation in this repo:

- **QWP (in scope).** The new WebSocket transport. Pages render under
  `/docs/connect/clients/<lang>/` (slug `slug: /connect/clients/<lang>`) and
  document the `ws::` / `wss::` connect-string schemas, the QWP ingress and
  egress wire protocols, store-and-forward, durable ACK, multi-host
  failover, etc. **These are the only pages this skill reviews.**
- **Legacy ILP (out of scope).** The older HTTP/TCP transport. Pages document
  only `http::` / `https::` / `tcp::` / `tcps::` schemas and ILP-specific
  buffering. These pages may still live on disk under
  `documentation/ingestion/clients/` (and some have been given a
  `/connect/clients/...` slug as part of a routing reshuffle without their
  content being rewritten). **Skip them.** If the user wants those reviewed,
  recommend `/review` instead.

**How to tell them apart on a per-file basis:** open the file and look for
QWP signals — `ws::` / `wss::` in code blocks, references to
`QwpQueryClient` / `QwpWs*` / `qwp_ws_*` APIs, sections on store-and-forward,
durable ACK, or FSN watermarks, a link to
`/docs/connect/clients/connect-string/`. A page whose only schemas are
`http::` / `https::` / `tcp::` / `tcps::` and whose content centres on ILP
buffering is legacy — exclude it from the review even if it appears in the
PR's file list.

## When to use

Trigger when the user runs `/review-client <PR>` or asks to review a QWP
client documentation PR. Examples:

- `/review-client 451`
- "review the Java QWP client doc PR #451"
- "run review-client on PR 451"

For generic doc review use `/review` instead. For legacy ILP client pages,
also use `/review`.

## Inputs

- **PR number** (required). Resolve via `gh pr view <number>` to get the
  branch, head SHA, and changed files.
- If the user omits the PR number, ask for it. Do not guess from the current
  branch.

## Workflow

### Step 1: Fetch PR metadata and changed files

```bash
gh pr view <PR> --json number,title,headRefName,baseRefName,headRefOid,files
```

Then narrow the file list to **QWP client documentation only**. Candidate
paths to consider:

- `documentation/ingestion/clients/*.md` — **but** include only files whose
  content documents QWP (see the [Scope](#scope-qwp-only) section above for
  the QWP-vs-legacy signals). Files that still document `http::` / `tcp::`
  ILP only are out of scope, even when their slug now resolves to
  `/docs/connect/clients/...`.
- `documentation/connect/**/*.md` — the new Connect section. In scope.
- `documentation/client-configuration/connect-string.md` (and any sibling
  `connect-string*` file wherever it lives) — the shared QWP connect-string
  reference. **Always in scope** when any QWP client page is changed; read
  it even if the PR did not modify it.

To classify a candidate file fast: read its first ~80 lines. If you see
`ws::` / `wss::` in code blocks, references to `QwpQueryClient` or
`qwp_ws_*` APIs, or a link to the connect-string reference under
`/docs/connect/clients/connect-string/`, treat it as QWP. If the only
schemas it shows are `http::` / `tcp::`, treat it as legacy and skip.

Be explicit in your output about which files you considered and why each
was included or skipped — the docs author needs to know whether the absence
of a file from the review means "reviewed clean" or "skipped as legacy."

If the PR changes no QWP client docs, stop and tell the user — recommend
`/review` instead.

### Step 2: Read each changed client doc in full

Use the Read tool on each file at the PR's head SHA (check it out, or read
from the working tree if the branch is already checked out). Do not rely on
the diff alone — context outside the diff matters for "is this question
answered anywhere on the page" checks.

If a page links to a sibling reference (e.g., `connect-string.md`), read
that too. The connect-string page is shared across all client docs; treat it
as in-scope whenever any client page is changed.

### Step 3: Run the checklist

For each changed client page, evaluate every item below. Each item gets one
of three verdicts:

- **Covered** — a developer can answer the question from the page alone (or
  from a clearly linked sibling page). Cite the section/line.
- **Partial** — touched on but unclear, buried, or missing an example.
  Quote the relevant text and say what's missing.
- **Missing** — not addressed. Say so plainly.

Be specific. "Section X doesn't mention Y" beats "could be clearer."
Reference exact line numbers and quote short snippets when calling out a gap.

#### Ingestion checklist

1. **Inserting NULL values during ingestion.** Can the reader figure out how
   to write a null for a given column without trial and error? Is there an
   example? Does it explain whether "omit the column" is equivalent to
   "explicit null," and whether that interacts with schema inference?
2. **Multiple concurrent publishers.** Is it clear whether `Sender` (or its
   per-language equivalent) is thread-safe? If not, what is the
   recommended pattern — one sender per thread, pool, queue+single-writer?
   Is there guidance on whether parallel senders writing to the same table
   need distinct identities (`sender_id`, store-and-forward slots)?
3. **Easy to execute DDL.** Is there a concrete copy-paste example for
   `CREATE TABLE`, `ALTER`, `DROP`, `TRUNCATE` via the query client? Does
   the page distinguish DDL response (`onExecDone`, `EXEC_DONE`,
   `rowsAffected = 0`) from SELECT response?
4. **Easy to execute DML and stream rows.** Is `SELECT` with a row-by-row
   callback shown? Is bind-parameter usage shown with the syntax
   (`$1`/`?`/named) the client actually accepts? Is the
   "columnar batch vs row view" tradeoff explained, with an example?
5. **Sync vs async acks — are acks optional?** Does the page say plainly
   whether the application **must** await acknowledgements before
   considering data durable, or whether `flush()` / `close()` is enough?
   For async clients (WebSocket), is the error-handler callback shown?
   Does it explain what happens to in-flight data if the app exits without
   awaiting the ack?
6. **Durable ack vs WAL ack.** Is the distinction between "committed to
   local WAL" and "uploaded to object storage" (Enterprise) clear? When
   would an app care about `request_durable_ack`?

#### Failover and resilience checklist

7. **Ingress failover is bounded.** Does the page say that ingress reconnect
   has a budget (`reconnect_max_duration_millis`) and will eventually give
   up? Is it clear what the application sees when the budget is exhausted
   (terminal exception, callback, etc.)?
8. **Backpressure on the application side.** If the server is unreachable
   for a long time, where does buffered data go? Is store-and-forward
   explained as the durability story, and the RAM buffer cap explained for
   the non-SF case? Does the page tell the app how to detect "I am being
   backpressured" so it can stop producing?
9. **Connection-state notifications.** Can the app wire a callback that
   fires on `CONNECTED`, `DISCONNECTED`, `RECONNECTED`, `FAILED_OVER`,
   `AUTH_FAILED`, `RECONNECT_BUDGET_EXHAUSTED`? Is there a code example?
   Does the example show what an app would actually do (log, alert,
   redirect traffic)?
10. **Mid-stream query failover — duplicate-data hazard.** Does the page
    explain that if a query fails over mid-result, the server replays from
    the start of the result set? Does it show the `onFailoverReset`
    callback and **warn explicitly** that without wiring this callback the
    application will see duplicate rows? This is the single most common
    footgun — it must be impossible to miss.
11. **Per-query failover bounds.** Are the failover knobs
    (`failover_max_attempts`, `failover_backoff_*`, `failover_max_duration_ms`)
    listed with defaults? What does the app see if all attempts are
    exhausted?

#### Connect string and config checklist

12. **Reference to connect-string docs.** Is there at least one link from
    the client page to the connect-string reference? Is the link placed
    where a reader needing it would actually look (near the first connect
    string example, not just in a footer)?
13. **Connect string is easy to assemble.** Can a reader build a working
    QWP connect string from scratch? Schema (`ws::` / `wss::`), address
    syntax, where to put auth, where to put TLS, separator/terminator
    rules. Are common pitfalls called out (trailing `;`, escaping `;` or
    `=` in values, multi-address syntax)? Legacy `http::` / `tcp::` need
    only a "for legacy ILP transports, see [link]" pointer — do not
    require coverage on the QWP page itself.
14. **Environment variable path.** Is `QDB_CLIENT_CONF` (or per-language
    equivalent) documented as the credentials-out-of-code path?

#### Cross-cutting

15. **Thread safety statement.** Stated once, in a place a reader looking
    for "can I share this instance?" would find it — not buried under
    "Parallel queries" or similar.
16. **Error-handling story is end-to-end.** For each error class (auth,
    schema, parse, transport, mid-stream), the page should answer: how is
    the error surfaced (throw vs callback), what state is the client in
    afterward (usable vs must-reset vs must-close), and what should the
    app do.
17. **Migration / "what changed from before" notes** if applicable. If this
    PR introduces a new transport (e.g., QWP) alongside legacy (e.g., ILP),
    is there a side-by-side that a maintainer of existing code can scan?
18. **No content dependencies on legacy ILP pages.** Legacy ILP client
    documentation (`documentation/ingestion/clients/{go,c-and-cpp,dotnet,nodejs,python}.md`,
    `documentation/connect/compatibility/ilp/**`, `documentation/ingestion/clients/date-to-timestamp-conversion.md`,
    and similar ILP-era support material) is on a deprecation path and
    will be removed. Outbound links from a QWP client page to legacy ILP
    content are acceptable **only** when framed as a "for legacy ILP,
    see X" escape hatch — typically inside a `:::tip Legacy transports`
    admonition near the top of the page. Flag as **Missing** any link
    that *depends* on a legacy page to explain a concept the QWP reader
    needs (e.g., "see the ILP overview for exactly-once delivery
    semantics"). The concept must live somewhere that survives ILP
    deprecation: the QWP page itself, the connect-string reference, a
    transport-agnostic concepts page, or a new QWP-native page. Look
    especially for sneaky cases: anchor links into legacy pages
    (`/docs/connect/compatibility/ilp/overview/#some-section`) and
    references to timestamp-conversion / date-handling support pages
    that were authored for ILP. Fix shape suggestion: "move this
    explanation onto the QWP page, or root it in a shared concepts page
    under `/docs/concepts/`."

### Step 4: Produce the review

Format the output as one section per changed file. Within each file group
findings by checklist section (Ingestion / Failover / Connect string /
Cross-cutting). Use this structure:

```markdown
## documentation/ingestion/clients/<lang>.md

### Ingestion
- ❌ **Missing — inserting NULL values.** The column-method list (lines
  245-256) shows typed setters but never says how to write null. No
  example. Recommend adding either an explicit `setNull(name)` example or
  a one-liner stating that omitted columns are stored as null.
- ⚠️ **Partial — multiple publishers.** Line 845 states `Sender` is not
  thread-safe, but the statement is under "Parallel queries" where a
  reader looking for ingestion guidance would not look. Move or duplicate
  under "Data ingestion."
- ✅ **Covered — DDL.** Lines 559-582 show CREATE TABLE with
  `onExecDone`.

### Failover
- ❌ **Missing — duplicate-data hazard on mid-stream failover.** The
  `onFailoverReset` callback is mentioned (lines 784-790) but the page
  does not say *what happens if you don't wire it*. Add an explicit
  warning: "Without an onFailoverReset handler that clears accumulated
  results, the application will observe duplicate rows after a mid-stream
  reconnect."
- ...

### Connect string
- ...

### Cross-cutting
- ...
```

End with a short summary: total counts (Covered / Partial / Missing), the
top three highest-impact gaps, and any items where the doc actively
misleads the reader (call these out separately — they are worse than gaps).

### Step 5: Offer to file the gaps

After printing the review, ask whether to:

- Post the review as a PR comment (`gh pr comment <PR> --body-file <tmp>`).
- Draft inline edits for the highest-impact gaps.
- Stop here.

Do not post the review without confirmation.

## Style guidance for the review itself

- Quote short snippets and cite line numbers (`file.md:245-256`). Vague
  reviews are unactionable.
- For each gap, suggest the **shape** of the fix (one example, one warning
  block, one paragraph move) — not the full prose. The doc author will
  write the prose.
- Use ✅ / ⚠️ / ❌ markers so the author can scan. (Skill output is the
  only place in this repo where emojis are appropriate, since the user
  asked for a review tool.)
- Do not flag items that are correctly out of scope for the page (e.g.,
  don't ask the Java page to document the Python client's null handling).
- If the page links to a sibling page that fully answers an item, mark it
  Covered with the link as the citation. Do not require every page to be
  self-contained. **Exception:** links into legacy ILP material do not
  count as coverage — see checklist item 18. A QWP page that "covers"
  null handling by linking to the ILP overview is not covered; it has a
  content dependency on a page scheduled for removal.

## What this skill is not

- Not a generic doc reviewer (`/review` for that).
- Not a copy-editor (no typo / wording polish).
- Not a security review (`/security-review` for that).
- Not a build/link checker — assume `yarn build` is run separately.
