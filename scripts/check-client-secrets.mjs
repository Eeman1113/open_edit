#!/usr/bin/env node
// Fails if server-only configuration leaks into the browser bundles. Scans the client chunks of a production build
// (.next/static) or of `next dev` (.next/dev/static) for:
//   - the value of every OE_*KEY / OE_*SECRET / OE_*_URL variable set in the current environment,
//   - the names of the server-only variables,
//   - markers of the server-only modules (session signing, provider adapters).
// CI builds with dummy secrets set and runs this afterwards.  Usage: node scripts/check-client-secrets.mjs
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const DIRS = [".next/static", ".next/dev/static"].map((d) => join(ROOT, d)).filter(existsSync);
if (!DIRS.length) { console.error("no client chunks found: run `next build` (or open a page in `next dev`) first"); process.exit(2); }

const needles = [];
for (const [k, v] of Object.entries(process.env)) {
  if (/^OE_/.test(k) && /(KEY|SECRET|_URL)$/.test(k) && v && v.length >= 8) needles.push({ what: `value of ${k}`, s: v });
}
for (const name of ["OE_SESSION_SECRET", "OE_CONTENT_API_KEY", "OE_MUSIC_API_KEY", "OE_ARTSTYLE_API_KEY", "OE_LOOKS_API_KEY", "OE_STICKERS_API_KEY", "OE_TEMPLATES_API_KEY", "OE_FEED_API_KEY", "OE_CONTENT_API_URL"]) {
  needles.push({ what: `server env name ${name}`, s: name });
}
for (const m of ["Open_Edit content proxy", "[session] OE_SESSION_SECRET", "server/providers/http-json", "server/session.ts", "oe_sid="]) needles.push({ what: `server module marker "${m}"`, s: m });

const walk = (p, out = []) => {
  for (const f of readdirSync(p)) {
    const q = join(p, f);
    if (statSync(q).isDirectory()) walk(q, out);
    else if (/\.(js|mjs|css|json|html|txt)$/.test(f)) out.push(q); // source maps (.map) are not served to users by default
  }
  return out;
};

let hits = 0, files = 0;
for (const d of DIRS) for (const f of walk(d)) {
  files++;
  const text = readFileSync(f, "utf8");
  for (const n of needles) if (text.includes(n.s)) { console.error(`LEAK: ${n.what} in ${relative(ROOT, f)}`); hits++; }
}
console.log(hits ? `\nclient secret check FAILED: ${hits} issue(s)` : `client secret check passed (${files} client files, ${needles.length} patterns)`);
process.exit(hits ? 1 : 0);
