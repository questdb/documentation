---
name: review-client
description: Review a pull request that changes QuestDB **QWP** client documentation (the WebSocket transport, `ws::` / `wss::`) from the perspective of an agent or developer building an application against the client. The load-bearing goal is **agent one-shot suitability**: an agent retrieving one section of the page must be able to generate working code without hallucinating, without requiring earlier-section context, and without an indirection chain. Validates that the docs answer the concrete questions someone writing code would hit on day one — null handling, concurrency, DDL/DML/streaming SQL, acks (sync vs async, optional vs required), failover behavior and backpressure, connection notifications, mid-stream stream restarts, connect-string clarity, Enterprise connection patterns (TLS + auth + multi-host worked examples, OIDC token acquisition and refresh, explicit "not supported" statements when applicable), exhaustive type coverage on bind-parameter and column-setter surfaces (no "and more" handwaves), the absence of content dependencies on legacy ILP pages scheduled for removal, a consistent capital-markets data model across every QWP client page (no `foo`/`bar` placeholders, no schema drift between languages), and field-level documentation of the diagnostic payload on every error object (status, message stability, affected scope, correlation ID, PII safety). Also enforces agent-retrieval properties: section self-containedness, refutation of plausible-but-nonexistent API calls (`setNull`, `bind_array`, etc.), simple→complex example flow, intra-page vocabulary consistency, working-code minimums (no `// ...` ellipses in first examples), bounded indirection chains, error handling baked into the first example of each section rather than bolted on later, and **capability discoverability above the fold** — when a client documents more than one capability class (e.g. ingestion AND querying after the QWP read path was added), every capability must surface in the frontmatter `description:`, the opening paragraph, AND a first-level `##` heading, never only midway down the page. Legacy ILP (`http::` / `tcp::`) client pages are explicitly out of scope. Requires a PR number as input.
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

For multi-file PRs, the parent does **not** need to read each in-scope file
end-to-end — the deep reads are delegated to per-file subagents in Step 3.
The parent only needs the first ~80 lines of each candidate to classify it
as QWP vs legacy (Step 1). The shared connect-string reference is the one
exception: the parent should read it once, because every per-file subagent
will need to cite it.

### Step 3: Run the checklist

#### Parallelization

The per-file checklist work is independent across files. **For any PR
touching more than one in-scope QWP file, fan out using the Agent tool**:
spawn one subagent per in-scope file, each running the full checklist
against its assigned file, and have the parent consolidate the per-file
reports into the final review.

Send the subagents in a single message with multiple Agent tool uses so
they run concurrently. Each subagent's prompt must be self-contained — it
will not see this skill's text or the conversation history. Include:

- The exact file path to review (absolute path).
- The PR number and head SHA, for citation context.
- The full checklist (items 1–30 from this section, including the
  Agent one-shot suitability block) inlined into the prompt. Do **not**
  just reference "the skill's checklist" — the subagent cannot resolve
  that. Items 23–30 are the agent-fit bar and must be applied with
  equal weight to the original 22; do not let the subagent silently
  treat them as "nice to have."
- The expected output format: one finding per checklist item, severity
  ordered (❌ → ⚠️ → ✅), with the section tag and exact line citations
  (per Step 4). The subagent returns the file's section of the review,
  ready to drop into the consolidated output.
- The doublecheck requirement from the [Doublecheck](#doublecheck-before-reporting-a-finding)
  subsection at the end of Step 3.
- The list of *other* in-scope QWP client files in the PR, so cross-file
  checks (item 21 schema drift, item 18 sibling-link verification) can
  reference them. The subagent should read those siblings as needed for
  comparison, but not produce findings on them — the agent reviewing each
  sibling will cover its own.

The shared `connect-string.md` reference (always in scope when any QWP
client page changes) gets its own subagent, evaluated only against the
checklist items that apply to a reference page (typically 12–14, 18, 19,
the parts of 22 that surface in the error-handling section, and the
agent-fit items 23, 24, 26, 28 — section self-containedness and
inference-trap refutations matter for a reference doc that agents grep
for individual keys, possibly more than for a client doc).

If the PR only touches one QWP file, run the checklist inline in the
parent — fan-out has no benefit and adds latency.

After the subagents return, the parent's job is to (a) consolidate
findings into the final output structure per Step 4, (b) write the
end-of-review summary that compares across files (top-three gaps,
cross-cutting themes, actively misleading items), and (c) doublecheck any
cross-file claim it added that no single subagent could have verified
alone.

#### Verdict definitions

For each changed client page, evaluate every item below against **two
bars**, and take the lower verdict:

- **Human-skim bar.** Can a developer reading the page top-down answer
  the question?
- **Agent one-shot bar.** If an agent retrieves only the most relevant
  section (a single `##`/`###` chunk) into its context, can it generate
  working code without hallucinating, without requiring earlier-section
  context, and without chasing more than one link hop? This bar is
  strictly harder than the human-skim bar.

Each item gets one of three verdicts (the lower of the two bars
dominates):

- ✅ **Covered** — passes both bars. Cite the section/line.
- ⚠️ **Partial** — passes one bar but not the other; or touched on but
  unclear, buried, or missing an example. Quote the relevant text and
  say which bar fails and how — "right answer, wrong section" (agent),
  "buried under unrelated heading" (human), "indirection chain" (agent),
  "phrasing requires earlier prose to disambiguate" (agent).
- ❌ **Missing** — fails both bars / not addressed. Say so plainly.

Be specific. "Section X doesn't mention Y" beats "could be clearer."
Reference exact line numbers and quote short snippets when calling out a
gap. When the failure is agent-specific (e.g. an explanation is correct
but lives one section away from where an agent retrieves the code
example), say so explicitly — that is the signal the docs author needs
to choose between moving the explanation or duplicating it.

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
    footgun — it must be impossible to miss. **Repetition required**: the
    warning (at least a one-line note + link to the dedicated subsection)
    must also appear in every other section that mentions failover,
    mid-stream behaviour, or query restart — the per-query failover knob
    table, the failover event-fields table, the connection-state
    observability section. An agent retrieving the knob table alone
    without the warning attached will generate buggy code.
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

15. **Thread safety statement.** Stated in **every section whose first
    example creates a handle** (sender, reader, query, cursor) — at
    minimum a one-line restatement linking to the dedicated Concurrency
    section. The naive "stated once" policy works for a human scanning
    top-down but fails agent retrieval, which loads one section at a
    time: an agent that fetches "DDL execution" but not "Concurrency"
    will generate code that shares a single handle across threads. The
    placement test ("a reader looking for *can I share this instance?*
    would find it") still applies to the dedicated section.
16. **Error-handling story is end-to-end.** For each error class (auth,
    schema, parse, transport, mid-stream), the page should answer: how is
    the error surfaced (throw vs callback), what state is the client in
    afterward (usable vs must-reset vs must-close), and what should the
    app do.
17. **Migration / "what changed from before" notes** if applicable. If this
    PR introduces a new transport (e.g., QWP) alongside legacy (e.g., ILP),
    is there a side-by-side that a maintainer of existing code can scan?
18. **No content dependencies on legacy ILP pages.** Legacy ILP client
    documentation (`documentation/ingestion/clients/{c-and-cpp,dotnet,nodejs,python}.md`,
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
19. **Enterprise connection patterns and OIDC.** The page shows at least
    one worked example combining TLS (`wss::`), credentials, and
    multi-host `addr=...` — the realistic production shape — not just
    three separate one-liners. For each Enterprise auth path the client
    supports (HTTP basic, bearer token, OIDC, mTLS), there is either
    (a) a concrete example showing how an application obtains and
    passes the credential, or (b) an explicit one-line statement that
    the path is not supported by this client, with a pointer to the
    closest alternative. **Silence is not acceptable** — a reader must
    not have to grep the page to discover that OIDC token refresh, mTLS
    client certificates, or token rotation is unsupported. Special
    attention to OIDC: the [OpenID Connect](/docs/security/oidc/) page
    documents the server-side flow; the client page must answer "how
    does the application acquire a token to pass to the client" and
    "what happens when the token expires mid-session — does the client
    refresh, does it fail, does it expect the app to register a
    callback?" A bare "for OIDC, see the security page" is **not**
    coverage — flag as Partial at best.
20. **Bind-parameter type coverage and limitations.** Where the page
    documents bind parameters (or the per-language equivalent), it
    enumerates **all** supported bind types — not a sample ending in
    "and more" or "…". For every QuestDB column type a reader might
    expect to bind (BOOLEAN, BYTE, SHORT, CHAR, INT, IPv4, LONG, FLOAT,
    DOUBLE, TIMESTAMP, timestamp_ns, DATE, SYMBOL, VARCHAR, BINARY,
    UUID, LONG256, DECIMAL64/128/256, GEOHASH, DOUBLE[]/ARRAY), the
    page either (a) shows the setter / API and the type code, or
    (b) lists the type explicitly under "unsupported as bind parameter"
    with a one-line rationale (e.g., "ARRAY: bind ARGS frames don't
    carry array shape; use SQL array literals instead"). Verdict
    ladder: complete enumeration → Covered; sample-and-handwave ("and
    more", "…", "see source") → ⚠️ Partial; no list at all → ❌
    Missing. The same principle — enumerate or call out as unsupported
    — applies wherever the page documents a type-keyed surface
    (ingestion column setters, result-batch accessors). The
    bind-parameter table is the most common place coverage drifts
    because the API is younger than the type system.
21. **Consistent capital-markets data model across clients.** Every code
    example uses a capital-markets domain (trades, quotes, order books,
    FX, market data). **Reject** generic placeholders — `foo`, `bar`,
    `baz`, `my_table`, `t1`, `Example`, `Test`. The placeholder pattern
    is a tell that the example was written in isolation and was never
    cross-read against sibling client pages. Beyond the per-page check,
    examples must be **consistent across the full set of QWP client
    pages**: same table names, same column names, same column types,
    same symbol values. When the PR ships one client page and the other
    QWP client pages already exist, compare schemas — flag every
    inconsistency the reader would hit when porting between languages:

    | Class of drift | Examples |
    |---|---|
    | Table name | `trades` vs `Trades` vs `market_trades` |
    | Column name | `qty` vs `quantity` vs `amount`; `symbol` vs `sym` vs `instrument` |
    | Column type | `LONG` vs `DOUBLE` for size; `SYMBOL` vs `VARCHAR` for ticker |
    | Symbol value | `EURUSD` vs `EUR/USD` vs `EUR-USD`; `ETH-USD` vs `ETHUSD` |
    | Timestamp precision | microseconds vs nanoseconds for the same notional event |

    Verdict ladder: domain-correct, placeholder-free, schema matches
    every other QWP client page → ✅ Covered; domain-correct but
    schema drifts from siblings → ⚠️ Partial (cite the specific
    drift); generic placeholders or non-capital-markets domain
    (sensors, IoT, logs) → ❌ Missing. Fix shape: pick the schema
    used by the page with the most polished example and align the
    others, or call out one canonical schema in this skill / a README
    under `documentation/ingestion/clients/` so future client docs land
    on it without negotiation.
22. **Diagnostic information on the error object/event.** Item 16
    enumerates the error categories and the surfacing / recovery
    model. This item demands the next level of detail: **what
    structured information is on the error and how user code reads
    it**, so a real production handler can log, alert, debug, and
    correlate with server-side state.

    For every error path the client exposes, the page documents:
    - **Server message text** — which field or parameter carries it
      (`SenderError.getServerMessage()`, the `message` parameter on
      `onError`, `QwpWsSenderError.message`, etc.), whether it is
      stable enough to pattern-match on, localized vs English, and
      whether it is capped in length.
    - **Status code** — both numeric (e.g. `0x05`) and named (e.g.
      `PARSE_ERROR`), and how user code reads each.
    - **Affected scope** — table name on ingest errors, FSN range
      (`from_fsn`/`to_fsn`) or batch identifier on async ingest
      rejections, failing SQL / bind index on query parse errors,
      query ID on mid-stream query failures.
    - **Server correlation / request ID** for support tickets, if the
      protocol carries one; otherwise an explicit statement that no
      such ID is surfaced.
    - **PII / secret safety** — whether the message text is safe to
      forward to end-user UIs or third-party error trackers, or
      whether the application must sanitise first.

    Verdict ladder: every bullet covered on every error path → ✅
    Covered; primary fields named but stability / PII / correlation
    silent → ⚠️ Partial; only "the message is human-readable text"
    with no field-by-field guidance → ❌ Missing. The fix shape is
    almost always a small table next to the error-handling code
    example listing the fields, their types, and one-line guidance per
    field — much more readable than burying these properties in
    prose.

    **Co-location requirement (agent one-shot bar).** Every error path's
    diagnostic table must live in the **same** `##`/`###` section as
    that error path's code example. A correct table located one section
    away from its example fails this item under the agent bar: an agent
    retrieving the code-example section gets no field-level guidance
    and will fabricate field names; an agent retrieving the table
    section gets no concrete invocation and will fabricate the
    surrounding code. Duplicate the table (or the example) into both
    sections when one error surface is referenced from multiple places.

#### Agent one-shot suitability checklist

The previous 22 items test what the page *says*. The next seven items
test whether the page is *retrievable in one shot* — whether an agent
that loads a single section into context can ship working code from it.
The bar is strictly harder than the human-skim bar: a page where every
fact is true but every fact requires three hops to assemble is human-
adequate and agent-broken.

23. **Section self-containedness.** Each `##` and `###` section must
    name (or link to a single ≤ 1-hop reference for) the concrete API
    call, the connect string used in its example, the language-specific
    import / `#include`, and the next step the reader takes. An agent
    that retrieves only that section into context must be able to
    compile the example without inheriting setup from an earlier
    paragraph. Test: read each section in isolation — if the first code
    block references a `reader` variable that was constructed three
    sections earlier and nowhere referenced in the current section, the
    section fails the bar. Verdict ladder: every section closes its own
    setup → ✅; one or two sections borrow setup from a labelled "Quick
    start" but link to it explicitly → ⚠️ Partial; most sections assume
    inherited state → ❌ Missing. Fix shape: prepend a one-line "you
    have a `reader` constructed as in [Quick start](#quick-start)"
    pointer, or duplicate a 2-line setup snippet.

24. **Inference-trap explicitness.** The high-confidence wrong guesses
    an LLM makes about *this* API must be explicitly refuted somewhere
    on the page — ideally in the section where the wrong guess would be
    written. Enumerate the plausible non-existent API calls and check
    each:
    - `setNull(name)` / `set_null(col)` when nulls are actually written
      by omitting the setter.
    - `bind_array(...)` / `setArray(...)` when arrays are not supported
      as bind parameters.
    - `setInterval(...)` when `INTERVAL` has no bind setter.
    - `request_durable_ack` on the reader when it is sender-only.
    - `connectionListener` / `onConnect` / `onDisconnect` callbacks
      when no structured connection-state callback exists.
    - `setUuid(string)` when only the 16-byte form exists.
    - `auto_flush_rows` / `auto_flush_bytes` for the WebSocket sender
      when auto-flush is rejected.
    - Any sibling-language API name that doesn't exist in this
      language's client (`flushAndKeep` vs `flush_and_keep`,
      `await_acked_fsn` vs `awaitAckedFsn`, etc.).

    Verdict ladder: every plausible wrong guess refuted in-section (or
    in a dedicated "Unsupported" table that the in-section text links
    to) → ✅; some refuted → ⚠️ Partial; only positive knowledge with
    no negative knowledge → ❌ Missing. Fix shape: an "Unsupported"
    row in the relevant setter / column-getter / config-key table, or
    a one-line refutation in the section that mentions the closest
    supported alternative.

25. **Information flow simple → complex.** Walk the code examples in
    document order. The first runnable example uses the simplest
    connect string (`ws::addr=localhost:9000;`), no auth, no TLS, no
    failover, and the smallest possible payload. Each subsequent
    example introduces at most one new concept (auth, then TLS, then
    multi-host, then failover, then SF, etc.) — never two at once.
    Production-shape examples (multi-host + token + TLS + failover +
    durable ACK) appear at the **end**, not the beginning. Verdict
    ladder: monotonic complexity from top to bottom → ✅; one
    section inverts the order (e.g. the first example shows TLS but
    a later section shows the bare connect string) → ⚠️ Partial;
    the page opens with the production example → ❌ Missing. Fix
    shape: reorder examples, or split a too-complex first example
    into a minimal version followed by a "production shape" version.

26. **Vocabulary consistency within the page.** The same operation must
    be referred to by the same name everywhere. The same identifier
    must be spelled identically in code and prose. If the page says
    "the cursor" in section X, "the result handle" in section Y, and
    "the row stream" in a table caption, an agent will treat them as
    three distinct objects. Extends item 21 (cross-page schema
    consistency) inward: this is the intra-page equivalent. Verdict
    ladder: identifiers and operation names match across the page → ✅;
    one or two drifts the agent could plausibly disambiguate from
    context (e.g. "callback" vs "handler" used interchangeably) → ⚠️
    Partial; multiple drifts at the same surface (different setter
    names referenced in code vs prose, different connect-string-key
    capitalisation) → ❌ Missing. Fix shape: pick one name per concept
    and grep-replace across the page.

27. **Working-code minimum (no ellipses in the first example).** The
    first code example in each section must be complete: explicit
    setup, explicit error handling (see item 29), explicit cleanup. No
    `// ...` placeholders, no `// process row...`, no `// handle
    error...`. Subsequent examples in the same section may abbreviate
    once the pattern is established. The bar is "an agent pasting this
    snippet verbatim gets a compiling program" — not "an agent
    paraphrasing this snippet gets the gist." Verdict ladder: every
    first-in-section example is complete → ✅; some have ellipses but
    the missing pieces are trivially inferable (`// imports omitted`)
    → ⚠️ Partial; load-bearing logic is replaced by `// ...` → ❌
    Missing. Fix shape: inline the omitted lines.

28. **Indirection-chain cap (≤ 1 hop).** From the section where a
    question is naturally asked, the answer must be reachable in at
    most one link click. A "see X" pointer to a section that itself
    says "see Y" is a two-hop chain and fails. Item 12 requires *a*
    link to the connect-string reference; this item caps how often the
    page resolves a question by indirection at all. Note that the
    "links to a sibling page count as Covered" allowance in Style
    guidance applies only to the human-skim bar; under the agent bar,
    every indirection is consumed against this cap, and a section
    answering a question by sending the agent on a two-hop chase fails.
    Verdict ladder: every concept reachable in ≤ 1 hop → ✅; one or
    two two-hop chains for non-load-bearing detail → ⚠️ Partial;
    load-bearing concepts (null handling, thread safety, failover
    callback) require two or more hops → ❌ Missing. Fix shape: inline
    the destination content, or restructure so the question is asked
    in the section that already contains the answer.

29. **Failure mode in the golden path, not bolted on later.** The first
    runnable example in each section must include the error path — not
    a happy-path `try { ... } catch { print }` placeholder, but the
    real shape of error handling the section's API requires (the C
    `err_out` parameter check + `goto on_error` cleanup; the C++
    `catch (const line_reader_error&)` with `e.code()` dispatch; the
    sender error-handler callback registration; the async error poll).
    Agents prompted "write the function" overwhelmingly copy the
    *first* example's shape — if the first example skips error
    handling, the generated app will skip it too. Item 16 covers
    whether error handling is *documented*; this item covers whether
    it is *demonstrated in the example agents will copy*. Verdict
    ladder: every first-in-section example demonstrates the real
    error path → ✅; some examples bolt error handling on as a later
    snippet → ⚠️ Partial; the page's error-handling section is the
    only place error handling appears → ❌ Missing. Fix shape: rewrite
    the first example to include the error path, or move the
    error-handling section ahead of the API examples and reference it
    from each.

30. **Capability surface visible above the fold.** Pages that document a
    client with more than one capability class — ingestion **and**
    querying, read **and** write, sync **and** async, blocking **and**
    streaming — must surface every capability in all three of these
    places:

    - the frontmatter `description:` field (this is what search,
      sidebar tooltips, and AI retrieval index for landing decisions);
    - the page's opening paragraph (the first text a reader sees after
      the title);
    - a first-level `##` heading on the page (not buried under `###`).

    A reader landing on the page from a "how do I query QuestDB from
    `<language>`" query must learn within the first screen of the page
    — without scrolling past hundreds of lines of ingestion content —
    that the client does queries at all. An agent that retrieves only
    the page's opening chunk into context must learn what the client
    can do from that chunk alone; if the second capability surfaces
    only midway down the page, the retrieval misses it and the agent
    will either fabricate a non-existent separate client or send the
    user to the wrong page entirely (PGWire / REST). The most common
    failure pattern is a page that was originally ingestion-only and
    gained query support in a later PR — frontmatter, opening
    paragraph, and any top-of-page `:::info` / `:::tip` admonition all
    need to be rewritten when the new capability lands, not just a new
    `##` section appended at the bottom.

    Verdict ladder: every capability mentioned in frontmatter
    description AND opening paragraph AND a first-level heading → ✅
    Covered; one of those three surfaces omits a capability → ⚠️
    Partial (cite which surface and which capability); a capability
    appears only deep in the page → ❌ Missing. Fix shape: rewrite the
    frontmatter description to enumerate every capability class
    explicitly (e.g. "client for high-throughput **ingestion** and SQL
    **query execution**"), rewrite the opening paragraph as "two
    complementary APIs live in the same library: ... and ...", promote
    the new capability to its own `##` heading at the same depth as
    the existing ones, and update any top-of-page admonitions that
    redirect readers elsewhere ("for querying see PGWire") to reflect
    the new capability.

#### Doublecheck before reporting a finding

Every ❌ Missing and ⚠️ Partial verdict must be verified by re-reading
the cited lines before it goes into the output. **False findings damage
the review more than missed ones** — they make the docs author waste
time chasing a non-issue and erode trust in the rest of the report. The
checklist is long and the same words ("flush", "error", "thread") recur
across sections; it is easy to write a finding from memory and miss the
paragraph two sections down that already covers it.

Before finalizing each ❌ / ⚠️ finding, do the following — and only then
write it into the output:

- **Re-read the cited line range.** Read the exact range you plan to
  cite, plus enough surrounding lines (5–10 above and below) to confirm
  the gap is real and the cited text is what you think it is.
- **Search the whole page for the missing concept.** A finding of the
  form "the page never mentions X" is invalid if X appears under a
  different heading. Grep / scan for the relevant identifier (`setNull`,
  `onFailoverReset`, `sender_id`, `OIDC`, `backpressure`, etc.) across
  the file before claiming absence.
- **Confirm section / header attributions.** A finding like "the
  thread-safety statement is buried under 'Parallel queries'" is wrong
  if the statement is actually under "Concurrency"; verify the section
  heading that contains the cited line.
- **Verify both sides of cross-file claims.** For findings comparing
  across files (schema drift in item 21, link-target validity in item
  18, "the Rust page does this correctly" comparisons), re-read both
  files at the cited locations before reporting. A misattributed
  comparison undermines the whole cross-file argument.
- **Confirm exact quotes.** If the finding quotes the page (e.g., "ends
  literally with 'and more'"), re-confirm the quote is verbatim and
  appears at the cited line — paraphrased "quotes" are a common
  failure mode.
- **Simulate one-section retrieval for agent-fit findings (items 23-29
  and the agent-bar half of any other item).** Before flagging an
  agent-fit gap, mentally load just the cited `##`/`###` section into a
  fresh context window and ask: "Can I generate the code from this
  alone?" If the answer is yes, the section is self-contained; the
  finding is invalid. If the answer requires earlier-section state, an
  identifier introduced elsewhere, or a two-hop link chase, the gap is
  real — and the finding should name which of those three causes it.

✅ Covered findings can be lighter-touch: a citation that points to the
right region is sufficient verification. The skew toward verifying
negative findings is intentional — a false ❌ wastes more author
attention than a false ✅.

When the per-file work is fanned out to subagents (see
[Parallelization](#parallelization)), each subagent is responsible for
doublechecking its own findings before returning. The parent must
additionally doublecheck any cross-file claim it adds to the end-of-review
summary — those claims didn't exist in any single subagent's output and
therefore weren't verified upstream.

### Step 4: Produce the review

Format the output as one section per changed file. **Within each file,
order findings by severity, worst first** — ❌ Missing, then ⚠️ Partial,
then ✅ Covered at the bottom. This is the load-bearing rule of the output
format: human readers scan top-down looking for action items, and a doc
author should be able to stop reading as soon as the ❌/⚠️ blocks end.

Do **not** group by checklist section (Ingestion / Failover / Connect
string / Cross-cutting / Agent one-shot). Instead, tag each finding
with its section in parentheses after the title — `(Ingestion)`,
`(Failover)`, `(Connect string)`, `(Cross-cutting)`, `(Agent one-shot)`
— so the author still knows which category an item belongs to without
losing the severity ordering. For items where the verdict is the lower
of two bars (e.g. human-Covered but agent-Partial), tag the failing
bar in the finding body: *"Partial under the agent bar: the table at
lines X-Y answers the question but lives in a separate section from
the code example at lines A-B that an agent would retrieve first."*

Within a severity bucket, order by impact (the gap a reader would hit
first or hardest comes first). When in doubt, follow the checklist's own
ordering as a tiebreaker.

The ✅ Covered block at the bottom may be terser than the ❌/⚠️ blocks
above it — one-line confirmations with citation are fine. The point of
keeping Covered findings in the output at all is to let the author see
that the item *was* checked and reassure them no follow-up is needed; it
is not to re-justify the verdict.

Use this structure:

```markdown
## documentation/ingestion/clients/<lang>.md

- ❌ **Missing — inserting NULL values (Ingestion).** The column-method
  list (lines 245-256) shows typed setters but never says how to write
  null. No example. Recommend adding either an explicit `setNull(name)`
  example or a one-liner stating that omitted columns are stored as null.
- ❌ **Missing — duplicate-data hazard on mid-stream failover (Failover).**
  The `onFailoverReset` callback is mentioned (lines 784-790) but the page
  does not say *what happens if you don't wire it*. Add an explicit
  warning: "Without an onFailoverReset handler that clears accumulated
  results, the application will observe duplicate rows after a mid-stream
  reconnect."
- ⚠️ **Partial — multiple publishers (Ingestion).** Line 845 states
  `Sender` is not thread-safe, but the statement is under "Parallel
  queries" where a reader looking for ingestion guidance would not look.
  Move or duplicate under "Data ingestion."
- ⚠️ **Partial — OIDC (Cross-cutting).** Line 172 is a bare "see the
  security page" pointer; the client page must answer how the app
  acquires the token and what happens on expiry.
- ⚠️ **Partial under agent bar — thread safety in DDL section
  (Cross-cutting, item 15).** The CREATE TABLE example at lines
  559-582 never restates the thread-safety contract. An agent
  retrieving only the DDL section will not learn that `Sender` is
  single-threaded. Add a one-line note linking to the Concurrency
  section at the top of the DDL section.
- ⚠️ **Partial under agent bar — inference trap (Agent one-shot,
  item 24).** The Null values section at lines 441-477 shows the
  omit-the-setter pattern but never refutes `setNull(name)` /
  `set_null(col)`. An agent porting from PG / JDBC will fabricate
  the call. Add one row to the "unsupported" table or a one-line
  refutation in the Null values section.
- ✅ **Covered — DDL (Ingestion).** Lines 559-582 show CREATE TABLE with
  `onExecDone`.
- ✅ **Covered — thread safety statement (Cross-cutting).** Stated at
  l.236-244 next to the ingestion code.
- ✅ **Covered — connect-string reference link (Connect string).** l.198.
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
  Covered **on the human-skim bar** with the link as the citation. Do
  not require every page to be self-contained on the human bar.
  **Exception:** links into legacy ILP material do not count as
  coverage on either bar — see checklist item 18. A QWP page that
  "covers" null handling by linking to the ILP overview is not
  covered; it has a content dependency on a page scheduled for
  removal.
- **Indirection charged against the agent bar.** A one-hop link to a
  sibling page that answers the question still passes the agent bar
  (item 28 allows ≤ 1 hop), but a two-hop chain ("see the
  connect-string reference, which says: see the failover concepts
  page") fails the agent bar even if the human-skim verdict is
  Covered. In those cases mark the item ⚠️ Partial and call out the
  agent-bar failure explicitly.

## What this skill is not

- Not a generic doc reviewer (`/review` for that).
- Not a copy-editor (no typo / wording polish).
- Not a security review (`/security-review` for that).
- Not a build/link checker — assume `yarn build` is run separately.
