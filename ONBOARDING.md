# QWP Documentation Project — Onboarding

A coordinated three-person effort to document QuestDB's new wire protocols (QWP ingress + egress), client failover, and store-and-forward. This is your starting point.

## The project in one paragraph

We're shipping documentation for: a new public ingress wire protocol (QWP, with a WebSocket and a UDP variant), a new public egress wire protocol (QWP query result streaming), a comprehensive client failover system, and a store-and-forward client substrate. The specs in `questdb-enterprise/questdb/docs/qwp/` are the source of truth. The reference client is `java-questdb-client`. We document **Java-only on day one** — other languages follow later.

## Setup

Clone these three repos as siblings (parent directory doesn't matter, but they share one):

```
parent/
├── documentation/         ← this repo, where docs land
├── questdb-enterprise/    ← spec source: docs/qwp/*.md
└── java-questdb-client/   ← reference implementation
```

You need access to the enterprise repo — ping in your team channel if you don't have it.

Local dev server (from `documentation/`):

```
yarn install
yarn start    # http://localhost:3001
```

See `CLAUDE.md` in this repo for Docusaurus conventions, admonition syntax, custom components, and the railroad-diagram workflow.

## Bundle assignments (proposed — swap if needed)

| Bundle | Person | Scope | Files (exclusive ownership) |
|---|---|---|---|
| **A — Wire Protocols** | **Javier** | 4 new pages: Overview, QWP Ingress (WS), QWP Ingress (UDP), QWP Egress (WS). Audience is third-party client implementers. | `documentation/protocols/**` (all new) |
| **B — Client Configuration + central wiring** | **Vlad** | New top-level connect-string reference, 3 patches to existing pages, sole owner of `sidebars.js`. | `documentation/client-configuration/**`, the 3 patch files below, `documentation/sidebars.js` |
| **C — Client Reliability** | **Imre** | 6 new pages: 2 client failover, 4 store-and-forward. Lives under the Connect section (cross-linked from the existing High Availability section for server-side context). | `documentation/ingestion/clients/failover/**`, `documentation/ingestion/clients/store-and-forward/**` |

Bundle B's three patch files:
- `documentation/ingestion/ilp/overview.md` — shorten "Multiple URLs for HA" → link to Bundle C
- `documentation/ingestion/clients/java.md` — shorten "Configuring multiple URLs" → link to Bundle C
- `documentation/ingestion/clients/configuration-string.md` — redirect to new location

## Don't-trip-over-each-other rules

1. **`sidebars.js` is single-writer.** Only Bundle B edits it. A and C: send your entries in PR descriptions; B commits them in one go.
2. **The connect-string page is single-writer.** Only B edits `documentation/client-configuration/connect-string.md`. C delivers SF / failover / reconnect key documentation as draft markdown snippets to B for inclusion.
3. **Day 1 — B lands the skeleton first.** Empty connect-string page with stable anchor IDs (`#auth`, `#tls`, `#failover-keys`, `#sf-keys`, `#reconnect-keys`, `#egress-flow`) + 4 Protocols stub pages + `sidebars.js` entries. Until this lands, A and C should not commit new pages — internal links would 404.
4. **File scopes are hard.** No bundle edits files outside its scope. Disputed patches belong to B.
5. **B's patches land last.** They replace shallow content with links into C's new pages, so they wait until C's pages are live.

## Source specs

Located in `questdb-enterprise/questdb/docs/qwp/`. These are normative — if a doc page contradicts the spec, the spec wins.

| Spec file | Used by |
|---|---|
| `wire-ingress.md` | A (Ingress WS page) |
| `wire-egress.md` | A (Egress WS page) |
| `wire-udp.md` | A (Ingress UDP page) |
| `failover.md` | C (failover pages), B (failover keys section) |
| `sf-client.md` | C (SF pages), B (SF + reconnect keys sections) |
| `README.md` | A (Overview page), all (audience matrix) |

Reference implementation paths in `java-questdb-client/`:
- `core/src/main/java/io/questdb/client/cutlass/qwp/` — QWP client
- `core/src/main/java/io/questdb/client/cutlass/qwp/client/sf/` — store-and-forward
- `core/src/main/java/io/questdb/client/impl/ConfStringParser.java` — canonical list of connect-string options
- `core/src/main/java/io/questdb/client/Sender.java` — public builder API

## Using Claude Code on this project

### Start a session

From the `documentation/` clone:

```
claude
```

`CLAUDE.md` is loaded automatically — Claude already knows about Docusaurus conventions and dev commands.

### High-value patterns for this work

**Hand the spec to Claude — don't paraphrase.**
```
Read ../questdb-enterprise/questdb/docs/qwp/wire-ingress.md.
We'll write documentation/protocols/qwp-ingress-websocket.md from it.
Audience: third-party client implementers.
```

**Use plan mode for any new page.** Press the plan-mode shortcut (or type `/plan`) before drafting so you can review structure and approach before content is written.

**Delegate broad searches to subagents.** "Where is the existing failover documentation in this repo?" — Claude will spawn an Explore subagent instead of grepping in the foreground.

**Cross-check against the reference impl.** When documenting an option:
```
Before I write up reconnect_max_duration_millis, check 
ConfStringParser.java in ../java-questdb-client for the actual default 
and behavior.
```

**Run `/review` on your branch** before opening a PR.

### Project-specific tips

- Spec paths are relative to `documentation/`. Tell Claude they're sibling clones: `../questdb-enterprise/questdb/docs/qwp/...`.
- Docusaurus admonitions (`:::note`, `:::tip`, `:::warning`), code fences with `questdb-sql` for syntax highlighting, custom `<Tabs>` / `<TabItem>` — all covered in `CLAUDE.md`.
- For grammar railroad diagrams in protocol pages, see the `scripts/railroad.py` workflow in `CLAUDE.md`.
- **Java-only callout** belongs at the top of every failover and SF page:
  > Client-side support is currently available in the Java client. Additional language clients are on the roadmap.
- Always run `yarn build` locally before opening a PR — it catches broken internal links.

### First-prompt templates

**Javier — Bundle A (Wire Protocols):**
```
I'm documenting the QWP wire protocols for third-party client implementers.

Read ../questdb-enterprise/questdb/docs/qwp/README.md for the audience matrix,
then ../questdb-enterprise/questdb/docs/qwp/wire-ingress.md.

Help me draft documentation/protocols/qwp-ingress-websocket.md.
Audience: someone writing a non-Java client from scratch. They need framing,
type codes, schema/null encoding, close/error codes, versioning, and a
pointer to the reference impl (java-questdb-client at a pinned commit).

Use plan mode first.
```

**Vlad — Bundle B (Client Configuration + central wiring):**
```
I'm promoting documentation/ingestion/clients/configuration-string.md to a
new top-level "Client Configuration" section. The same connect-string now
drives ILP, QWP ingress, QWP egress, failover, and store-and-forward.

Read the existing page, then ../java-questdb-client/core/src/main/java/io/
questdb/client/impl/ConfStringParser.java for the canonical option list.

Today's goal is a skeleton with stable anchor IDs (#auth, #tls,
#failover-keys, #sf-keys, #reconnect-keys, #egress-flow) so my
collaborators can deep-link while I flesh out the body. Also add the new
top-level entry in sidebars.js and 4 stub pages under documentation/
protocols/ (Overview, Ingress WS, Ingress UDP, Egress WS).

Use plan mode first.
```

**Imre — Bundle C (Client Reliability):**
```
I'm writing client-side reliability documentation under the Connect
section. The files live under documentation/ingestion/clients/ in two
sub-folders: failover/ and store-and-forward/.

Read ../questdb-enterprise/questdb/docs/qwp/failover.md and
../questdb-enterprise/questdb/docs/qwp/sf-client.md.

Six pages to write:
- ingestion/clients/failover/concepts.md
- ingestion/clients/failover/configuration.md
- ingestion/clients/store-and-forward/concepts.md
- ingestion/clients/store-and-forward/when-to-use.md
- ingestion/clients/store-and-forward/operating.md
- ingestion/clients/store-and-forward/configuration.md

Start with the failover concepts page. Audience is end users on QuestDB
Enterprise. Java-only callout at the top of every page. Cross-link to
the existing High Availability section for server-side HA context.

Use plan mode first.
```

## When you're stuck

- **Spec ambiguity** — ask the spec author before improvising. Specs are normative.
- **Cross-bundle question** — post in the project channel. Don't solve it by editing someone else's files.
- **Claude Code question** — type `/help` in a session.

---

Good luck. The structure is designed so each bundle can drive to PR independently after Day 1.
