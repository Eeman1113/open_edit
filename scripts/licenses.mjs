#!/usr/bin/env node
// Lists the licences of the npm packages Open_Edit ships, read from each installed package's package.json.
// Used to keep NOTICE.md up to date:
//   node scripts/licenses.mjs            # markdown table of runtime dependencies (direct + transitive)
//   node scripts/licenses.mjs --dev      # development / build-only dependencies
//   node scripts/licenses.mjs --check    # exit 1 if a runtime dependency has a licence outside the allow-list
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const dev = process.argv.includes("--dev");
const ALLOWED = /^(MIT|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|OFL-1\.1|BlueOak-1\.0\.0|CC0-1\.0|Unlicense|Python-2\.0)( OR .*| AND .*)?$/;
/** Copyleft / attribution licences that were reviewed; their obligations are documented in NOTICE.md. */
const REVIEWED = new Map([
  ["heic-to", "LGPL-3.0: loaded as a separate replaceable chunk, source linked in NOTICE.md"],
  ["@img/sharp-libvips-darwin-arm64", "LGPL-3.0-or-later: separate native library (optional, Next.js image optimisation)"],
  ["@img/sharp-libvips-linux-x64", "LGPL-3.0-or-later: as above"],
  ["@img/sharp-libvips-linux-arm64", "LGPL-3.0-or-later: as above"],
  ["@img/sharp-libvips-linuxmusl-x64", "LGPL-3.0-or-later: as above"],
  ["@img/sharp-libvips-linuxmusl-arm64", "LGPL-3.0-or-later: as above"],
  ["caniuse-lite", "CC-BY-4.0: build-time browser data, attributed in NOTICE.md"],
]);

const lsArgs = ["ls", "--all", "--parseable", ...(dev ? ["--include=dev"] : ["--omit=dev"])];
let out = "";
try { out = execFileSync("npm", lsArgs, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
catch (e) { out = e.stdout ?? ""; } // npm ls exits non-zero on extraneous / optional packages but still prints the tree

const prodSet = new Set();
if (dev) {
  try {
    execFileSync("npm", ["ls", "--all", "--parseable", "--omit=dev"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n").forEach((l) => prodSet.add(l.trim()));
  } catch (e) { (e.stdout ?? "").split("\n").forEach((l) => prodSet.add(l.trim())); }
}

const rows = new Map();
for (const dir of out.split("\n").map((l) => l.trim()).filter((l) => l.includes("node_modules"))) {
  if (dev && prodSet.has(dir)) continue;
  let pkg;
  try { pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); } catch { continue; }
  const lic = typeof pkg.license === "string" ? pkg.license : pkg.license?.type ?? (pkg.licenses ?? []).map((l) => l.type).join(" OR ") ?? "";
  const repo = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url ?? pkg.homepage ?? "";
  rows.set(`${pkg.name}@${pkg.version}`, { name: pkg.name, version: pkg.version, license: lic || "UNKNOWN", repo: repo.replace(/^git\+/, "").replace(/\.git$/, "") });
}
const list = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));

if (process.argv.includes("--check")) {
  const bad = list.filter((r) => !ALLOWED.test(r.license) && !REVIEWED.has(r.name));
  for (const r of bad) console.error(`licence needs review: ${r.name}@${r.version} (${r.license})`);
  console.log(bad.length ? `${bad.length} package(s) need review` : `${list.length} runtime packages, all licences on the allow-list`);
  process.exit(bad.length ? 1 : 0);
}

console.log("| Package | Version | Licence |\n| --- | --- | --- |");
for (const r of list) console.log(`| ${r.name} | ${r.version} | ${r.license} |`);
