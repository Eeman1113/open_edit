#!/usr/bin/env node
// Collects the OFL-1.1 fonts of the "open" asset pack (kind "font"):
//   - Inter and Space Grotesk from the @fontsource-variable npm packages (latin, variable weight)
//   - a few display / handwriting families for the text tool, fetched from Google Fonts (latin subset) together with
//     their OFL.txt from the google/fonts repository
// Writes fonts/<id>.woff2 plus fonts/<id>-OFL.txt. Network failures skip the Google families (the pack keeps
// whatever was fetched before). Run: node scripts/gen-fonts.mjs
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PACK_DIR, ROOT, readManifest, runAsMain, updateManifest, writePack } from "./gen-lib/pack.mjs";

const LOCAL = [
  { id: "inter", family: "Inter", pkg: "@fontsource-variable/inter", file: "inter-latin-wght-normal.woff2", weight: "100 900" },
  { id: "space-grotesk", family: "Space Grotesk", pkg: "@fontsource-variable/space-grotesk", file: "space-grotesk-latin-wght-normal.woff2", weight: "300 700" },
];
/** Google Fonts families (all SIL OFL 1.1): id, CSS family, weight, google/fonts repo folder. */
const REMOTE = [
  { id: "playfair", family: "Playfair Display", weight: "700", dir: "playfairdisplay" },
  { id: "caveat", family: "Caveat", weight: "600", dir: "caveat" },
  { id: "pacifico", family: "Pacifico", weight: "400", dir: "pacifico" },
  { id: "bebas-neue", family: "Bebas Neue", weight: "400", dir: "bebasneue" },
  { id: "dm-mono", family: "DM Mono", weight: "500", dir: "dmmono" },
];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function fetchRemote(f) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family)}:wght@${f.weight}&display=swap`, { headers: { "user-agent": UA } })).text();
  const block = css.split("/* latin */")[1];
  const url = block && /url\((https:[^)]+\.woff2)\)/.exec(block)?.[1];
  if (!url) throw new Error(`no latin woff2 for ${f.family}`);
  const font = Buffer.from(await (await fetch(url)).arrayBuffer());
  const lic = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${f.dir}/OFL.txt`);
  if (!lic.ok) throw new Error(`no OFL.txt for ${f.family}`);
  return { font, license: await lic.text() };
}

export async function generate() {
  const font = {};
  for (const f of LOCAL) {
    const dir = join(ROOT, "node_modules", f.pkg);
    font[f.id] = { path: writePack(`fonts/${f.id}.woff2`, readFileSync(join(dir, "files", f.file))), license: "OFL-1.1", meta: { family: f.family, weight: f.weight, licenseFile: `fonts/${f.id}-OFL.txt` } };
    writePack(`fonts/${f.id}-OFL.txt`, readFileSync(join(dir, "LICENSE")));
  }
  const prev = readManifest().kinds?.font ?? {};
  for (const f of REMOTE) {
    try {
      const { font: data, license } = await fetchRemote(f);
      font[f.id] = { path: writePack(`fonts/${f.id}.woff2`, data), license: "OFL-1.1", meta: { family: f.family, weight: f.weight, licenseFile: `fonts/${f.id}-OFL.txt` } };
      writePack(`fonts/${f.id}-OFL.txt`, license);
    } catch (e) {
      if (prev[f.id] && existsSync(join(PACK_DIR, prev[f.id].path))) font[f.id] = prev[f.id];
      console.warn(`gen-fonts: skipped ${f.family}: ${e.message}`);
    }
  }
  updateManifest({ font });
  return { fonts: Object.keys(font).length };
}

if (runAsMain(import.meta.url)) generate().then((r) => console.log("gen-fonts:", r));
