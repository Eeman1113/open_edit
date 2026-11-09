// Shared helpers for the asset generators: output folder of the built-in "open" pack and manifest merging.
// Each generator owns some manifest kinds; it replaces only those kinds and keeps everything else (so generators,
// and hand-made entries such as icons and brand marks, can run independently).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PACK_DIR = join(ROOT, "public", "packs", "open");
const MANIFEST = join(PACK_DIR, "manifest.json");

/** Write a file inside the pack (creating folders). Returns the pack-relative path. */
export function writePack(rel, data) {
  const abs = join(PACK_DIR, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, data);
  return rel;
}

export function readManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    return { name: "open", title: "Open_Edit built-in asset pack", version: 1, license: "MIT", kinds: {} };
  }
}

/**
 * Replace the given kinds in manifest.json. `kinds` = { kind: { id: entry } }. With `merge`, ids are merged into
 * the existing kind instead of replacing it.
 */
export function updateManifest(kinds, { merge = false } = {}) {
  const m = readManifest();
  m.kinds ??= {};
  for (const [k, v] of Object.entries(kinds)) m.kinds[k] = merge ? { ...(m.kinds[k] ?? {}), ...v } : v;
  writeFileSync(MANIFEST, JSON.stringify(m, null, 1) + "\n");
}

/** Deterministic PRNG (mulberry32) so regenerated assets are byte-identical. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const runAsMain = (url) => process.argv[1] && fileURLToPath(url) === process.argv[1];
