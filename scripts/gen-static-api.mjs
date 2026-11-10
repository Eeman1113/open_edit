#!/usr/bin/env node
// Renders every built-in content catalogue to static JSON for hosts without a server (GitHub Pages static export).
// Output: public/api-static/<endpoint>.json, exactly the body `/api/<endpoint>` returns with no provider configured
// and no query (q = "", limit 100, offset 0). The client helper (src/lib/content/api.ts) reads these files when
// /api/* is unreachable.
//
// The catalogue code is the server's own local provider (src/server/providers/local.ts), imported directly: a small
// in-process module hook transpiles TypeScript with the project's `typescript`, maps the `@/` alias to src/, loads
// JSON as modules and stubs `server-only`. Nothing is duplicated, so the files can't drift from the API.
//
// NEXT_PUBLIC_BASE_PATH is baked into the URLs (pack thumbnails, music), so run it with the same value as the build.
// Run: node scripts/gen-static-api.mjs
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "public", "api-static");
const STUB = "oe-stub:server-only";
const EXTS = [".ts", ".tsx", ".js", ".mjs", ".json"];

function probe(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of EXTS) if (existsSync(base + e)) return base + e;
  for (const e of EXTS) if (existsSync(join(base, "index" + e))) return join(base, "index" + e);
  return null;
}

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: STUB, shortCircuit: true };
    let file = null;
    if (specifier.startsWith("@/")) file = probe(join(SRC, specifier.slice(2)));
    else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      file = probe(join(dirname(fileURLToPath(context.parentURL)), specifier));
    }
    return file ? { url: pathToFileURL(file).href, shortCircuit: true } : next(specifier, context);
  },
  load(url, context, next) {
    if (url === STUB) return { format: "module", source: "export {};", shortCircuit: true };
    if (url.startsWith("file:") && /\.(json|tsx?)$/.test(url)) {
      const file = fileURLToPath(url);
      const text = readFileSync(file, "utf8");
      if (file.endsWith(".json")) return { format: "module", source: `export default ${text};`, shortCircuit: true };
      const { outputText } = ts.transpileModule(text, {
        fileName: file,
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false, isolatedModules: true },
      });
      return { format: "module", source: outputText, shortCircuit: true };
    }
    return next(url, context);
  },
});

const { localProvider: p } = await import(pathToFileURL(join(SRC, "server", "providers", "local.ts")).href);
const { LOOK_KINDS, FEED_NAMES } = await import(pathToFileURL(join(SRC, "lib", "content", "types.ts")).href);

// The query the API applies when none is given (see parseQuery in src/server/http.ts).
const Q = { q: "", limit: 100, offset: 0 };

/** endpoint (relative to /api/) → response body */
const files = {
  music: { tracks: await p.music(Q) },
  aistyle: { styles: await p.artStyles(Q) },
  stickers: await p.stickers(Q),
  templates: { items: await p.templates(Q) },
  "ai/hair": { available: false, styles: [] },
};
for (const kind of LOOK_KINDS) files[`looks/${kind}`] = { items: await p.looks(kind, Q) };
for (const name of FEED_NAMES) files[`feed/${name}`] = await p.feed(name, Q);
// Not an API endpoint: every look-creator item, so the static client can search what /api/looks/store?q= would.
// The empty query is not a search, so this lists everything (each id once).
{
  const seen = new Set();
  const all = [];
  for (const kind of LOOK_KINDS) {
    if (kind === "store") continue;
    for (const it of await p.looks(kind, { q: "", limit: 10000, offset: 0 })) if (!seen.has(it.id)) { seen.add(it.id); all.push(it); }
  }
  files["looks/_search"] = { items: all };
}

rmSync(OUT, { recursive: true, force: true });
let bytes = 0;
for (const [name, body] of Object.entries(files)) {
  const file = join(OUT, `${name}.json`);
  mkdirSync(dirname(file), { recursive: true });
  const text = JSON.stringify(body);
  writeFileSync(file, text);
  bytes += text.length;
}
console.log(`gen-static-api: ${Object.keys(files).length} files, ${(bytes / 1024).toFixed(0)} KB → public/api-static (base "${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}")`);
