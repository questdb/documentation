#!/usr/bin/env node
/*
 * Reverse-engineer the questdb-rs public API into the body of a Docusaurus
 * markdown page (documentation/connect/clients/rust-api-reference.md).
 *
 * Workflow:
 *   1. In the c-questdb-client checkout, build the rustdoc JSON:
 *        cd questdb-rs
 *        cargo +nightly rustdoc --lib --features almost-all-features -- \
 *          -Z unstable-options --output-format json
 *      (produces questdb-rs/target/doc/questdb.json)
 *   2. Generate the body:
 *        node scripts/generate-rust-api-reference.js \
 *          /path/to/c-questdb-client/questdb-rs/target/doc/questdb.json \
 *          > /tmp/api_body.md
 *   3. Concatenate the hand-written page header (frontmatter + intro) with the
 *      generated body. The header currently lives at the top of
 *      documentation/connect/clients/rust-api-reference.md down to the first
 *      `---` horizontal rule that precedes `## Error handling`.
 *
 * The JSON path may be passed as argv[2] or via the QDB_RUSTDOC_JSON env var;
 * it defaults to ../c-questdb-client/questdb-rs/target/doc/questdb.json relative
 * to this script.
 *
 * Signatures, fields, variants, and one-line summaries are pulled straight from
 * rustdoc JSON. A coverage report (documented count + any uncovered type defs)
 * is written to stderr so new public types are easy to spot on regeneration.
 */
const fs = require("fs");
const path = require("path");

const JSON_PATH =
  process.argv[2] ||
  process.env.QDB_RUSTDOC_JSON ||
  path.join(__dirname, "../../c-questdb-client/questdb-rs/target/doc/questdb.json");
const doc = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
const I = doc.index;
const P = doc.paths;

// ---------------- type rendering ----------------
function rArgs(a) {
  if (!a) return "";
  if (a.angle_bracketed) {
    const p = [];
    for (const x of a.angle_bracketed.args || []) {
      if (x.lifetime) p.push(x.lifetime);
      else if (x.type) p.push(rType(x.type));
      else if (x.const) p.push(x.const.expr || "_");
    }
    for (const c of a.angle_bracketed.constraints || [])
      p.push(c.name + " = " + (c.binding && c.binding.equality ? rType(c.binding.equality.type) : "_"));
    return p.length ? "<" + p.join(", ") + ">" : "";
  }
  if (a.parenthesized) {
    const ins = (a.parenthesized.inputs || []).map(rType).join(", ");
    const o = a.parenthesized.output ? " -> " + rType(a.parenthesized.output) : "";
    return "(" + ins + ")" + o;
  }
  return "";
}
function rType(t) {
  if (t == null) return "()";
  if (typeof t === "string") return t;
  if (t.resolved_path) return t.resolved_path.path + rArgs(t.resolved_path.args);
  if (t.primitive) return t.primitive;
  if (t.generic) return t.generic;
  if (t.borrowed_ref) {
    const m = t.borrowed_ref.is_mutable ? "mut " : "";
    const lt = t.borrowed_ref.lifetime ? t.borrowed_ref.lifetime + " " : "";
    return "&" + lt + m + rType(t.borrowed_ref.type);
  }
  if (t.tuple) return "(" + t.tuple.map(rType).join(", ") + ")";
  if (t.slice) return "[" + rType(t.slice) + "]";
  if (t.array) return "[" + rType(t.array.type) + "; " + t.array.len + "]";
  if (t.raw_pointer) return "*" + (t.raw_pointer.is_mutable ? "mut " : "const ") + rType(t.raw_pointer.type);
  if (t.impl_trait) return "impl " + t.impl_trait.map(rBound).join(" + ");
  if (t.dyn_trait) return "dyn " + t.dyn_trait.traits.map((x) => rType({ resolved_path: x.trait })).join(" + ");
  if (t.qualified_path) {
    const st = rType(t.qualified_path.self_type);
    const trObj = t.qualified_path.trait;
    const trName = trObj && trObj.path ? rType({ resolved_path: trObj }) : "";
    if (trName && trName !== "Self") return "<" + st + " as " + trName + ">::" + t.qualified_path.name;
    return st + "::" + t.qualified_path.name;
  }
  if (t.function_pointer) {
    const fp = t.function_pointer;
    const ins = (fp.sig.inputs || []).map((x) => rType(x[1])).join(", ");
    const o = fp.sig.output ? " -> " + rType(fp.sig.output) : "";
    return "fn(" + ins + ")" + o;
  }
  return "?";
}
function rBound(b) {
  if (b.trait_bound) {
    const h =
      b.trait_bound.generic_params && b.trait_bound.generic_params.length
        ? "for<" + b.trait_bound.generic_params.map((p) => p.name).join(", ") + "> "
        : "";
    return h + rType({ resolved_path: b.trait_bound.trait });
  }
  if (b.outlives) return b.outlives;
  return "?";
}
function delink(s) {
  if (!s) return s;
  // rustdoc intra-doc links: [`Foo`] / [`Foo::bar`] -> `Foo` ; [`Foo`](url) -> `Foo`
  return s
    .replace(/\[(`[^`]+`)\]\([^)]*\)/g, "$1")
    .replace(/\[(`[^`]+`)\]/g, "$1");
}
function firstPara(d) {
  if (!d) return "";
  const s = d.trim();
  const i = s.indexOf("\n\n");
  let p = i >= 0 ? s.slice(0, i) : s;
  return delink(p.replace(/\n/g, " ").trim());
}
// One-sentence summary, joining wrapped lines so we never cut mid-line.
function summary(d) {
  if (!d) return "";
  let p = firstPara(d);
  const m = p.match(/^(.*?[.!?])(\s|$)/);
  let s = m ? m[1] : p;
  if (s.length > 240) s = s.slice(0, 237).trimEnd() + "\u2026";
  return s;
}
function firstLine(d) {
  return summary(d);
}
function fnSig(it) {
  const f = it.inner.function,
    sig = f.sig,
    h = f.header;
  let pre = "";
  if (h.is_const) pre += "const ";
  if (h.is_unsafe) pre += "unsafe ";
  if (h.is_async) pre += "async ";
  const ins = (sig.inputs || []).map(([n, t]) => {
    if (n === "self") {
      if (t && t.borrowed_ref && t.borrowed_ref.type && t.borrowed_ref.type.generic === "Self")
        return t.borrowed_ref.is_mutable ? "&mut self" : "&self";
      if (t && t.generic === "Self") return "self";
      return "self: " + rType(t);
    }
    return n + ": " + rType(t);
  });
  const o = sig.output ? " -> " + rType(sig.output) : "";
  let gp = "";
  const ps = (f.generics && f.generics.params) || [];
  const names = ps
    .filter((p) => {
      if (p.kind && p.kind.lifetime !== undefined) return false;
      if (p.kind && p.kind.type && p.kind.type.is_synthetic) return false;
      return true;
    })
    .map((p) => p.name);
  if (names.length) gp = "<" + names.join(", ") + ">";
  return `${pre}fn ${it.name}${gp}(${ins.join(", ")})${o}`;
}
function getImpls(tid) {
  const it = I[tid],
    inner = it.inner;
  if (inner.trait)
    return {
      inherent: (inner.trait.items || []).map((id) => I[id]).filter((x) => x && x.inner.function),
      traits: [],
      isTrait: true,
    };
  let ids = [];
  if (inner.struct) ids = inner.struct.impls || [];
  else if (inner.enum) ids = inner.enum.impls || [];
  const inherent = [],
    traits = [];
  for (const iid of ids) {
    const im = I[iid];
    if (!im || !im.inner.impl) continue;
    const imp = im.inner.impl;
    if (imp.is_synthetic || imp.blanket_impl) continue;
    if (imp.trait === null) {
      for (const mid of imp.items || []) {
        const mi = I[mid];
        if (mi && mi.inner.function) inherent.push(mi);
      }
    } else traits.push(imp.trait.path + rArgs(imp.trait.args));
  }
  return { inherent, traits, isTrait: false };
}
function structFields(tid) {
  const inner = I[tid].inner.struct;
  if (!inner) return [];
  const out = [];
  if (inner.kind && inner.kind.plain) {
    for (const fid of inner.kind.plain.fields || []) {
      const f = I[fid];
      if (!f) continue;
      out.push({ name: f.name, type: rType(f.inner.struct_field), doc: firstLine(f.docs) });
    }
    out._stripped = inner.kind.plain.has_stripped_fields;
  } else if (inner.kind && inner.kind.tuple) {
    inner.kind.tuple.forEach((fid, i) => {
      if (fid !== null) {
        const f = I[fid];
        out.push({ name: String(i), type: rType(f.inner.struct_field), doc: "" });
      }
    });
  }
  return out;
}
function enumVariants(tid) {
  const inner = I[tid].inner.enum,
    out = [];
  for (const vid of inner.variants || []) {
    const v = I[vid];
    if (!v) continue;
    let sig = v.name;
    const vi = v.inner.variant;
    if (vi && vi.kind) {
      if (vi.kind.tuple) {
        const fs = vi.kind.tuple.filter((x) => x !== null).map((fid) => rType(I[fid].inner.struct_field));
        sig = v.name + "(" + fs.join(", ") + ")";
      } else if (vi.kind.struct) sig = v.name + " { … }";
    }
    out.push({ sig, doc: firstLine(v.docs) });
  }
  return out;
}
const NOISE =
  /^(Debug|Clone|Copy|PartialEq|Eq|Hash|PartialOrd|Ord|Default|Send|Sync|Unpin|RefUnwindSafe|UnwindSafe|Freeze|Sized|StructuralPartialEq|ToOwned|Borrow<.*>|BorrowMut<.*>|From<.*>|Into<.*>|TryFrom<.*>|TryInto<.*>|Any|CloneToUninit|ToString)/;
const byPath = {};
for (const id in I) {
  const it = I[id];
  if (it.crate_id !== 0 || !it.name || !P[id]) continue;
  byPath[P[id].path.join("::")] = id;
}

const seen = new Set();
function renderType(pth) {
  const tid = byPath[pth];
  if (!tid) return `<!-- MISSING ${pth} -->\n`;
  seen.add(pth);
  const it = I[tid];
  const kind = Object.keys(it.inner)[0];
  let md = `#### \`${it.name}\`\n\n`;
  md += `<small><code>${pth}</code> · _${kind}_</small>\n\n`;
  if (it.deprecation) md += `> **Deprecated**${it.deprecation.note ? ": " + it.deprecation.note : ""}\n\n`;
  if (kind === "type_alias") {
    const ta = it.inner.type_alias;
    md += firstPara(it.docs) ? firstPara(it.docs) + "\n\n" : "";
    md += "```rust\ntype " + it.name + " = " + rType(ta.type) + ";\n```\n\n";
    return md;
  }
  const para = firstPara(it.docs);
  if (para) md += para + "\n\n";
  if (kind === "struct") {
    const fields = structFields(tid);
    if (fields.length) {
      md += "**Fields**\n\n";
      for (const f of fields) md += `- \`${f.name}: ${f.type}\`${f.doc ? " — " + f.doc : ""}\n`;
      if (fields._stripped) md += `- _(plus private fields)_\n`;
      md += "\n";
    }
  }
  if (kind === "enum") {
    const vs = enumVariants(tid);
    if (vs.length) {
      md += "**Variants**\n\n";
      for (const v of vs) md += `- \`${v.sig}\`${v.doc ? " — " + v.doc : ""}\n`;
      md += "\n";
    }
  }
  const { inherent, traits, isTrait } = getImpls(tid);
  if (inherent.length) {
    md += isTrait ? "**Required / provided methods**\n\n" : "**Methods**\n\n";
    md += "```rust\n";
    for (const m of inherent) md += fnSig(m) + "\n";
    md += "```\n\n";
    const wd = inherent.filter((m) => firstLine(m.docs));
    for (const m of wd) md += `- \`${m.name}\` — ${firstLine(m.docs)}\n`;
    if (wd.length) md += "\n";
  }
  if (!isTrait && traits.length) {
    const n = [...new Set(traits)].filter((t) => !NOISE.test(t));
    if (n.length) md += `**Notable trait impls:** ${n.map((t) => "`" + t + "`").join(", ")}\n\n`;
  }
  return md;
}
function renderConst(pth) {
  const tid = byPath[pth];
  if (!tid) return `<!-- MISSING ${pth} -->\n`;
  seen.add(pth);
  const it = I[tid];
  const c = it.inner.constant;
  const fl = firstLine(it.docs);
  return `- \`${it.name}: ${rType(c.type)} = ${c.const.expr}\`${fl ? " — " + fl : ""}\n`;
}
function renderFnCompact(pth) {
  const tid = byPath[pth];
  if (!tid) return `<!-- MISSING ${pth} -->\n`;
  seen.add(pth);
  const it = I[tid];
  const fl = firstLine(it.docs);
  return `- \`${fnSig(it)}\`${fl ? " — " + fl : ""}\n`;
}
function renderCompact(pth) {
  // one-line entry for the low-level catalog
  const tid = byPath[pth];
  if (!tid) return `- <!-- MISSING ${pth} -->\n`;
  seen.add(pth);
  const it = I[tid];
  const kind = Object.keys(it.inner)[0];
  const fl = firstLine(it.docs);
  return `- \`${it.name}\` (_${kind}_)${fl ? " — " + fl : ""}\n`;
}

// ---------------- document assembly ----------------
const out = [];
const w = (s) => out.push(s);

function section(title, paths) {
  w(`### ${title}\n`);
  for (const p of paths) w(renderType(p) + "\n");
}

// ===== ERROR HANDLING =====
w("## Error handling\n");
w(
  "Every fallible call returns `questdb::Result<T>` (an alias for `std::result::Result<T, questdb::Error>`). `Error` and `ErrorCode` are re-exported at the crate root, so `use questdb::{Error, ErrorCode, Result};` is the canonical import. The `egress` module defines its own parallel `Error` / `ErrorCode` / `Result` for the query path \u2014 see [Egress error types](#egress-error-types).\n"
);
section("Crate-level error types", [
  "questdb::error::Error",
  "questdb::error::ErrorCode",
  "questdb::error::Result",
]);

// ===== INGRESS =====
w("---\n");
w("## Ingress: write API\n");
w(
  "The `ingress` module is the data-loading surface. Build a [`Sender`](#sender) (or [`SenderBuilder`](#senderbuilder)), accumulate rows in a [`Buffer`](#buffer), then `flush()` the buffer through the sender. The same buffer API serves every transport (ILP/HTTP, ILP/TCP, QWP/UDP, QWP/WebSocket); the transport is chosen by the connect-string scheme or [`Protocol`](#protocol).\n"
);
section("Sender and builder", [
  "questdb::ingress::sender::Sender",
  "questdb::ingress::SenderBuilder",
  "questdb::ingress::Protocol",
  "questdb::ingress::ProtocolVersion",
  "questdb::ingress::Port",
  "questdb::ingress::CertificateAuthority",
]);
w("**Ingress constants**\n");
[
  "questdb::ingress::MAX_ARRAY_DIMS",
  "questdb::ingress::MAX_ARRAY_DIM_LEN",
  "questdb::ingress::MAX_ARRAY_BUFFER_SIZE",
  "questdb::ingress::MAX_NDARRAY_LEAF_ELEMS",
  "questdb::ingress::DECIMAL_BINARY_FORMAT_TYPE",
].forEach((p) => w(renderConst(p)));
w("");

section("Row buffer", [
  "questdb::ingress::buffer::Buffer",
  "questdb::ingress::buffer::TableName",
  "questdb::ingress::buffer::ColumnName",
  "questdb::ingress::buffer::Bookmark",
]);

section("Timestamps", [
  "questdb::ingress::timestamp::Timestamp",
  "questdb::ingress::timestamp::TimestampMicros",
  "questdb::ingress::timestamp::TimestampNanos",
]);

section("QWP/WebSocket asynchronous errors", [
  "questdb::ingress::sender::qwp_ws_ownership::QwpWsSenderError",
  "questdb::ingress::sender::qwp_ws_ownership::QwpWsErrorCategory",
  "questdb::ingress::sender::qwp_ws_ownership::QwpWsErrorPolicy",
  "questdb::ingress::sender::qwp_ws_ownership::QwpWsProgress",
  "questdb::ingress::sender::qwp_ws_ownership::QwpWsErrorHandler",
  "questdb::ingress::sender::qwp_ws_ownership::QwpWsTotals",
]);

section("Arrays and decimals", [
  "questdb::ingress::ndarr::NdArrayView",
  "questdb::ingress::ndarr::ArrayElement",
  "questdb::ingress::decimal::DecimalView",
]);

section("Column-major sender (advanced / FFI core)", [
  "questdb::ingress::column_sender::sender::ColumnSender",
  "questdb::ingress::column_sender::sender::AckLevel",
  "questdb::ingress::column_sender::chunk::Chunk",
  "questdb::ingress::column_sender::db::QuestDb",
  "questdb::ingress::column_sender::db::BorrowedSender",
  "questdb::ingress::column_sender::validity::Validity",
  "questdb::ingress::column_sender::numpy_wire::NumpyDtype",
]);
w("**Column-sender constants**\n");
["questdb::ingress::column_sender::MAX_CHUNK_ROWS"].forEach((p) => w(renderConst(p)));
w("");

// ===== EGRESS =====
w("---\n");
w("## Egress: query reader API\n");
w(
  "The `egress` module is gated behind the `sync-reader-ws` feature (also pulled in by `arrow` / `polars` / `live-server-tests`). It implements the streaming QWP/WebSocket query path: open a `Reader`, run SQL, and pull typed columnar batches from a `Cursor`.\n"
);

section("Reader and configuration", [
  "questdb::egress::reader::Reader",
  "questdb::egress::config::ReaderConfig",
  "questdb::egress::config::Endpoint",
  "questdb::egress::config::Target",
  "questdb::egress::config::Compression",
  "questdb::egress::config::TlsVerify",
]);
w("**Reader configuration constants**\n");
[
  "questdb::egress::config::DEFAULT_PATH",
  "questdb::egress::config::HIGHEST_KNOWN_VERSION",
  "questdb::egress::config::MAX_ADDRS",
  "questdb::egress::config::DEFAULT_AUTH_TIMEOUT_MS",
  "questdb::egress::config::MAX_AUTH_TIMEOUT_MS",
  "questdb::egress::config::DEFAULT_SERVER_INFO_TIMEOUT_MS",
  "questdb::egress::config::MAX_SERVER_INFO_TIMEOUT_MS",
  "questdb::egress::config::DEFAULT_FAILOVER_ENABLED",
  "questdb::egress::config::DEFAULT_FAILOVER_MAX_ATTEMPTS",
  "questdb::egress::config::MAX_FAILOVER_MAX_ATTEMPTS",
  "questdb::egress::config::DEFAULT_FAILOVER_BACKOFF_INITIAL_MS",
  "questdb::egress::config::DEFAULT_FAILOVER_BACKOFF_MAX_MS",
  "questdb::egress::config::MAX_FAILOVER_BACKOFF_MAX_MS",
  "questdb::egress::config::DEFAULT_FAILOVER_MAX_DURATION_MS",
  "questdb::egress::config::MAX_FAILOVER_MAX_DURATION_MS",
  "questdb::egress::config::DEFAULT_COMPRESSION_LEVEL",
  "questdb::egress::config::MIN_COMPRESSION_LEVEL",
  "questdb::egress::config::MAX_COMPRESSION_LEVEL",
].forEach((p) => w(renderConst(p)));
w("");

section("Queries and parameter binds", [
  "questdb::egress::reader::ReaderQuery",
  "questdb::egress::binds::Bind",
  "questdb::egress::binds::SimpleNullKind",
]);

section("Result cursor and batches", [
  "questdb::egress::reader::Cursor",
  "questdb::egress::reader::BatchView",
  "questdb::egress::column_kind::ColumnKind",
  "questdb::egress::column::ColumnView",
  "questdb::egress::column::Validity",
  "questdb::egress::column::FixedWidth",
  "questdb::egress::column::FixedColumn",
  "questdb::egress::column::FixedIter",
  "questdb::egress::column::FixedBytesColumn",
  "questdb::egress::column::UuidColumn",
  "questdb::egress::column::Long256Column",
  "questdb::egress::column::SymbolColumn",
  "questdb::egress::column::VarcharColumn",
  "questdb::egress::column::BinaryColumn",
  "questdb::egress::column::GeohashColumn",
  "questdb::egress::column::Decimal64Column",
  "questdb::egress::column::Decimal128Column",
  "questdb::egress::column::Decimal256Column",
  "questdb::egress::column::DoubleArrayColumn",
  "questdb::egress::column::LongArrayColumn",
]);

section("Server metadata", [
  "questdb::egress::server_event::ServerInfo",
  "questdb::egress::server_event::ServerRole",
  "questdb::egress::symbol_dict::SymbolDict",
  "questdb::egress::symbol_dict::SymbolEntry",
]);

section("Failover and statistics", [
  "questdb::egress::reader::FailoverEvent",
  "questdb::egress::reader::FailoverProgressEvent",
  "questdb::egress::reader::FailoverPhase",
  "questdb::egress::reader::Terminal",
  "questdb::egress::reader::ReaderStats",
]);

section("Egress error types", [
  "questdb::egress::error::Error",
  "questdb::egress::error::ErrorCode",
  "questdb::egress::error::UpgradeReject",
  "questdb::egress::error::Result",
]);

// ===== LOW LEVEL =====
w("---\n");
w("## Low-level / wire protocol (advanced)\n");
w(
  "These items are public so protocol tooling and the FFI layer can reuse them, but they are not part of the everyday ingestion / query surface. Expect them to track the QWP wire format rather than offer a stable ergonomic contract.\n"
);
w("\n**Schema & auth**\n");
[
  "questdb::egress::schema::Schema",
  "questdb::egress::schema::SchemaColumn",
  "questdb::egress::auth::AuthMode",
].forEach((p) => w(renderCompact(p)));
w("\n**Batch decoder** (`egress::decoder`)\n");
[
  "questdb::egress::decoder::decode_result_batch",
  "questdb::egress::decoder::DecodedBatch",
  "questdb::egress::decoder::DecodedColumn",
  "questdb::egress::decoder::ColumnBuffer",
  "questdb::egress::decoder::ArrayBuffers",
  "questdb::egress::decoder::ZstdScratch",
].forEach((p) => w(renderCompact(p)));
w("\n**Wire framing** (`egress::wire`)\n");
[
  "questdb::egress::wire::header::FrameHeader",
  "questdb::egress::wire::msg_kind::MsgKind",
  "questdb::egress::wire::msg_kind::StatusCode",
  "questdb::egress::wire::bit_reader::BitReader",
].forEach((p) => w(renderCompact(p)));
w("\nWire varint helpers, role constants, capability flags, and frame-header");
w("constants (`MAGIC`, `PROTOCOL_VERSION`, `HEADER_LEN`, `flags::*`) round out");
w("the `egress::wire` module; see the crate source for the full list.\n");

// ---------------- coverage report on stderr ----------------
const allCrateTypes = Object.keys(byPath).filter((p) => {
  const k = Object.keys(I[byPath[p]].inner)[0];
  return ["struct", "enum", "trait", "type_alias"].includes(k);
})
  .filter((p) => !p.includes("::tests"));
const missed = allCrateTypes.filter((p) => !seen.has(p));
process.stderr.write(`\n[coverage] documented ${seen.size} items; ${missed.length} type defs not in any section:\n`);
for (const m of missed) process.stderr.write("  - " + m + "\n");

process.stdout.write(out.join("\n"));
