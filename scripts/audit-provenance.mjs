#!/usr/bin/env node
// Provenance audit for Open_Edit.
// 1) Fails if any shipped file is byte-identical to a file from a reference set
//    (pass --ref <dir> one or more times, e.g. a vendor app extraction kept OUTSIDE this repo).
// 2) Fails if forbidden third-party brand strings appear in source, docs or public files.
// Usage: node scripts/audit-provenance.mjs [--ref <dir>]...
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN = ["src", "public", "docs", "scripts", "README.md", "package.json", "LICENSE", "NOTICE.md"];
const SKIP = /(^|\/)(node_modules|\.next|\.git)(\/|$)/;
const FORBIDDEN = [/b612/i, /linecorp/i, /snowcorp/i, /snow\.me/i, /\bkuru\b/i, /sensetime/i, /\bsnow corp/i, /line plus/i];
// Files that may legitimately contain a forbidden word (this script).
const ALLOW = new Set(["scripts/audit-provenance.mjs"]);

const walk = (p, out = []) => {
  let st;
  try { st = statSync(p); } catch { return out; }
  if (SKIP.test(p)) return out;
  if (st.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f), out);
  else out.push(p);
  return out;
};
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");

const refs = [];
process.argv.forEach((a, i) => { if (a === "--ref") refs.push(process.argv[i + 1]); });

const files = SCAN.flatMap((s) => walk(join(ROOT, s)));
let failed = 0;

if (refs.length) {
  const refHashes = new Set(refs.flatMap((r) => walk(r)).map(sha));
  for (const f of files) {
    if (refHashes.has(sha(f))) { console.error(`IDENTICAL TO REFERENCE: ${relative(ROOT, f)}`); failed++; }
  }
}

const TEXT = /\.(tsx?|jsx?|mjs|cjs|json|md|css|html|txt|svg|ya?ml|glsl)$/i;
for (const f of files) {
  const rel = relative(ROOT, f);
  if (ALLOW.has(rel) || !TEXT.test(f)) continue;
  const src = readFileSync(f, "utf8");
  for (const re of FORBIDDEN) {
    const m = src.match(re);
    if (m) { console.error(`FORBIDDEN "${m[0]}" in ${rel}`); failed++; break; }
  }
}

console.log(failed ? `\nprovenance audit FAILED: ${failed} issue(s)` : `provenance audit passed (${files.length} files${refs.length ? `, ${refs.length} reference set(s)` : ""})`);
process.exit(failed ? 1 : 0);
