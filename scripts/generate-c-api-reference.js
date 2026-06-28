#!/usr/bin/env node
/*
 * Extract the QuestDB C client API surface from the cbindgen-generated headers
 * into Docusaurus markdown.
 *
 * Source of truth: the committed headers in c-questdb-client/include/questdb/**.
 * They are generated from the FFI crate (questdb-rs-ffi) via cbindgen.
 *
 * Usage:
 *   node scripts/generate-c-api-reference.js \
 *     /path/to/c-questdb-client/include/questdb/ingress/line_sender.h [more headers...]
 *
 * Emits one markdown "## <header>" section per header: enums, structs (opaque +
 * value), and functions grouped by common name prefix, each with its signature
 * and first doc line.
 */
const fs = require("fs");
const path = require("path");

function firstSentence(doc) {
  if (!doc) return "";
  // doc is the cleaned multi-line comment body
  const text = doc
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trimEnd())
    .join("\n")
    .trim();
  // stop at first @param/@return/@note block
  const cut = text.split(/\n\s*@/)[0].trim();
  const m = cut.match(/^([\s\S]*?[.!?])(\s|$)/);
  let s = (m ? m[1] : cut).replace(/\s*\n\s*/g, " ").trim();
  if (s.length > 240) s = s.slice(0, 237).trimEnd() + "\u2026";
  return s;
}

function parseHeader(text) {
  const lines = text.split("\n");
  const enums = [];
  const opaque = [];
  const structs = [];
  const funcs = [];
  const helpers = [];
  let i = 0;
  let pendingDoc = null;

  const isDocStart = (l) => /^\s*\/\*\*(\s|$)/.test(l); // /** but not /**** banner
  while (i < lines.length) {
    let line = lines[i];
    const trimmed = line.trim();

    // license / figlet banner: /***...  (4+ stars)
    if (/^\s*\/\*\*\*/.test(line)) {
      while (i < lines.length && !/\*\//.test(lines[i])) i++;
      i++;
      pendingDoc = null;
      continue;
    }
    // doc comment block
    if (isDocStart(line)) {
      const buf = [];
      // single-line /** ... */
      if (/\*\//.test(line)) {
        buf.push(line.replace(/^\s*\/\*\*/, "").replace(/\*\/.*$/, ""));
        pendingDoc = buf.join("\n");
        i++;
        continue;
      }
      buf.push(line.replace(/^\s*\/\*\*/, ""));
      i++;
      while (i < lines.length && !/\*\//.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) buf.push(lines[i].replace(/\*\/.*$/, ""));
      i++;
      pendingDoc = buf.join("\n");
      continue;
    }
    // typedef enum NAME {
    let m = trimmed.match(/^typedef enum (\w+)\s*$/) || trimmed.match(/^typedef enum (\w+)\s*\{/);
    if (m) {
      const name = m[1];
      const variants = [];
      let vdoc = null;
      let autoIdx = 0;
      // advance to '{'
      while (i < lines.length && !/\{/.test(lines[i])) i++;
      i++;
      while (i < lines.length && !/^\s*\}/.test(lines[i])) {
        const ln = lines[i];
        if (isDocStart(ln)) {
          if (/\*\//.test(ln)) vdoc = ln.replace(/^\s*\/\*\*/, "").replace(/\*\/.*$/, "").trim();
          else {
            const b = [ln.replace(/^\s*\/\*\*/, "")];
            i++;
            while (i < lines.length && !/\*\//.test(lines[i])) { b.push(lines[i]); i++; }
            if (i < lines.length) b.push(lines[i].replace(/\*\/.*$/, ""));
            vdoc = b.join("\n");
          }
          i++;
          continue;
        }
        const vm = ln.trim().match(/^(\w+)\s*(?:=\s*([^,]+?))?\s*,?\s*$/);
        if (vm) {
          let val;
          if (vm[2] !== undefined) {
            val = vm[2].trim();
            if (/^\d+$/.test(val)) autoIdx = Number(val) + 1;
            else autoIdx++;
          } else {
            val = String(autoIdx);
            autoIdx++;
          }
          variants.push({ name: vm[1], value: val, doc: firstSentence(vdoc) });
          vdoc = null;
        }
        i++;
      }
      // skip to '} NAME;'
      while (i < lines.length && !/^\s*\}/.test(lines[i])) i++;
      i++;
      enums.push({ name, doc: firstSentence(pendingDoc), variants });
      pendingDoc = null;
      continue;
    }
    // opaque: typedef struct NAME NAME;
    m = trimmed.match(/^typedef struct (\w+) (\w+);$/);
    if (m) {
      opaque.push({ name: m[2], doc: firstSentence(pendingDoc) });
      pendingDoc = null;
      i++;
      continue;
    }
    // value struct: typedef struct NAME {  ... } NAME;
    m = trimmed.match(/^typedef struct (\w+)\s*$/) || trimmed.match(/^typedef struct (\w+)\s*\{/);
    if (m) {
      const name = m[1];
      const fields = [];
      while (i < lines.length && !/\{/.test(lines[i])) i++;
      i++;
      let fdoc = null;
      while (i < lines.length && !/^\s*\}/.test(lines[i])) {
        const ln = lines[i];
        if (isDocStart(ln)) {
          if (/\*\//.test(ln)) fdoc = ln.replace(/^\s*\/\*\*/, "").replace(/\*\/.*$/, "").trim();
          i++;
          continue;
        }
        const fm = ln.trim().match(/^(.+?)\s*;\s*$/);
        if (fm) { fields.push({ decl: fm[1].replace(/\s+/g, " "), doc: firstSentence(fdoc) }); fdoc = null; }
        i++;
      }
      while (i < lines.length && !/^\s*\}/.test(lines[i])) i++;
      i++;
      structs.push({ name, doc: firstSentence(pendingDoc), fields });
      pendingDoc = null;
      continue;
    }
    // Exported function: QUESTDB_CLIENT_API linkage macro, either alone on its
    // own line or inline before the return type. The prototype ends in ';'.
    if (/^QUESTDB_CLIENT_API\b/.test(trimmed)) {
      const head = line.replace(/^\s*QUESTDB_CLIENT_API\s*/, "");
      const buf = [];
      if (head.trim() !== "") buf.push(head);
      while ((buf.length === 0 || !/;\s*$/.test(buf[buf.length - 1])) && i + 1 < lines.length) {
        i++;
        buf.push(lines[i]);
      }
      i++;
      const decl = buf.join("\n").replace(/;\s*$/, "").trim();
      const nameM = decl.match(/([A-Za-z_]\w*)\s*\(/);
      funcs.push({ name: nameM ? nameM[1] : "?", decl, doc: firstSentence(pendingDoc) });
      pendingDoc = null;
      continue;
    }
    // static inline helper: capture the prototype, skip the { ... } body.
    if (/^static\s+inline\b/.test(trimmed)) {
      const buf = [];
      while (i < lines.length && !/\{/.test(lines[i])) { buf.push(lines[i]); i++; }
      // buf now holds up to (but not including) the line with '{'
      let protoLine = i < lines.length ? lines[i].replace(/\{.*$/, "") : "";
      const proto = (buf.join("\n") + "\n" + protoLine).replace(/\s+/g, " ").trim();
      const nameM = proto.match(/([A-Za-z_]\w*)\s*\(/);
      helpers.push({ name: nameM ? nameM[1] : "?", decl: proto, doc: firstSentence(pendingDoc) });
      pendingDoc = null;
      // skip the body by brace counting
      let depth = 0, started = false;
      while (i < lines.length) {
        for (const ch of lines[i]) { if (ch === "{") { depth++; started = true; } else if (ch === "}") depth--; }
        i++;
        if (started && depth <= 0) break;
      }
      continue;
    }
    i++;
  }
  return { enums, opaque, structs, funcs, helpers };
}

function fmtSig(decl) {
  // collapse whitespace, keep params on one logical line, then pretty-wrap
  const collapsed = decl.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
  return collapsed;
}

function groupByPrefix(funcs) {
  // group on the 3rd underscore-delimited segment depth heuristically:
  // line_sender_buffer_*  -> "line_sender_buffer"; line_sender_opts_* -> "line_sender_opts"; etc.
  const groups = new Map();
  for (const f of funcs) {
    const parts = f.name.split("_");
    let key;
    if (f.name.startsWith("questdb_db")) key = "questdb_db";
    else if (parts.length >= 3) key = parts.slice(0, 3).join("_");
    else key = parts.slice(0, 2).join("_");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  return groups;
}

function renderHeader(title, parsed) {
  const out = [];
  const w = (s) => out.push(s);
  w(`## ${title}\n`);

  if (parsed.enums.length) {
    w("### Enums\n");
    for (const e of parsed.enums) {
      w(`#### \`${e.name}\``);
      if (e.doc) w(`\n${e.doc}`);
      w("");
      for (const v of e.variants) w(`- \`${v.name} = ${v.value}\`${v.doc ? " — " + v.doc : ""}`);
      w("");
    }
  }
  if (parsed.opaque.length || parsed.structs.length) {
    w("### Types\n");
    if (parsed.opaque.length) {
      w("Opaque handles (created/freed through the API):\n");
      for (const o of parsed.opaque) w(`- \`${o.name}\`${o.doc ? " — " + o.doc : ""}`);
      w("");
    }
    for (const s of parsed.structs) {
      w(`#### \`${s.name}\``);
      if (s.doc) w(`\n${s.doc}`);
      w("");
      if (s.fields.length) {
        w("```c");
        w(`typedef struct ${s.name} {`);
        for (const f of s.fields) w(`    ${f.decl};${f.doc ? "  // " + f.doc : ""}`);
        w(`} ${s.name};`);
        w("```\n");
      }
    }
  }
  if (parsed.funcs.length) {
    w(`### Functions (${parsed.funcs.length})\n`);
    const groups = groupByPrefix(parsed.funcs);
    for (const [key, fns] of groups) {
      w(`#### \`${key}_*\`\n`);
      w("```c");
      for (const f of fns) w(fmtSig(f.decl) + ";");
      w("```\n");
      const withDoc = fns.filter((f) => f.doc);
      for (const f of withDoc) w(`- \`${f.name}\` — ${f.doc}`);
      if (withDoc.length) w("");
    }
  }
  if (parsed.helpers && parsed.helpers.length) {
    w(`### Inline helpers (${parsed.helpers.length})\n`);
    w("`static inline` convenience accessors (no exported symbol; defined in the header):\n");
    w("```c");
    for (const h of parsed.helpers) w(fmtSig(h.decl) + ";");
    w("```\n");
    const withDoc = parsed.helpers.filter((h) => h.doc);
    for (const h of withDoc) w(`- \`${h.name}\` — ${h.doc}`);
    if (withDoc.length) w("");
  }
  return out.join("\n");
}

// ---- main ----
const headerFiles = process.argv.slice(2);
if (!headerFiles.length) {
  console.error("usage: generate-c-api-reference.js <header.h> [header.h ...]");
  process.exit(1);
}
const titleFor = (p) => {
  const b = path.basename(p);
  if (b.includes("column_sender")) return "Ingress: column-major sender + connection pool (`column_sender.h`)";
  if (b.includes("line_sender")) return "Ingress: row-major ILP sender (`line_sender.h`)";
  if (b.includes("line_reader")) return "Egress: query reader (`line_reader.h`)";
  return b;
};
const blocks = [];
let totals = { enums: 0, structs: 0, opaque: 0, funcs: 0, helpers: 0 };
for (const hf of headerFiles) {
  const parsed = parseHeader(fs.readFileSync(hf, "utf8"));
  totals.enums += parsed.enums.length;
  totals.structs += parsed.structs.length;
  totals.opaque += parsed.opaque.length;
  totals.funcs += parsed.funcs.length;
  totals.helpers += parsed.helpers.length;
  process.stderr.write(
    `  ${path.basename(hf)}: enums=${parsed.enums.length} structs=${parsed.structs.length} opaque=${parsed.opaque.length} funcs=${parsed.funcs.length} helpers=${parsed.helpers.length}\n`
  );
  blocks.push(renderHeader(titleFor(hf), parsed));
}
process.stderr.write(
  `[coverage] enums=${totals.enums} value-structs=${totals.structs} opaque=${totals.opaque} functions=${totals.funcs} helpers=${totals.helpers}\n`
);
process.stdout.write(blocks.join("\n---\n\n"));
