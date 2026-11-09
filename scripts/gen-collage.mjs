#!/usr/bin/env node
// Generates the collage layout sets of the "open" asset pack (kind "collage", id "grid-<n>" for 2..9 photos).
// Each layout is a list of cell rects [x, y, w, h] in canvas-normalized units (top-left origin). Layouts are built
// from a few rules:
//   rows      split the canvas into rows, each row into equal cells (every composition of n into 1..4 rows)
//   columns   the same, transposed
//   feature   one large cell plus the rest in a strip (right / bottom / left / top)
//   uneven    one-third / two-thirds pairs and a centred band (2 and 3 photos)
//   mosaic    two large cells plus a strip of small ones (n >= 5)
// Duplicates are removed and every set is capped at 12 layouts. Run: node scripts/gen-collage.mjs
import { runAsMain, updateManifest, writePack } from "./gen-lib/pack.mjs";

const r4 = (v) => Math.round(v * 10000) / 10000;
const rect = (x, y, w, h) => [r4(x), r4(y), r4(w), r4(h)];

/** All ways to write n as an ordered sum of k parts, each 1..maxPart. */
function compositions(n, k, maxPart) {
  if (k === 1) return n >= 1 && n <= maxPart ? [[n]] : [];
  const out = [];
  for (let first = 1; first <= Math.min(maxPart, n - k + 1); first++) for (const rest of compositions(n - first, k - 1, maxPart)) out.push([first, ...rest]);
  return out;
}

/** Rows of equal cells (counts per row, top to bottom). */
const rows = (counts) => counts.flatMap((c, r) => Array.from({ length: c }, (_, i) => rect(i / c, r / counts.length, 1 / c, 1 / counts.length)));
const transpose = (cells) => cells.map(([x, y, w, h]) => rect(y, x, h, w));
/** Strip of `n` equal cells inside a rect, along x (horizontal) or y. */
const strip = (n, [x, y, w, h], horizontal) => Array.from({ length: n }, (_, i) => (horizontal ? rect(x + (w * i) / n, y, w / n, h) : rect(x, y + (h * i) / n, w, h / n)));

function layoutsFor(n) {
  const out = [];
  // balanced layouts first: the closest-to-square grid and its variations
  const byBalance = [];
  for (let k = 1; k <= Math.min(4, n); k++) for (const c of compositions(n, k, 4)) byBalance.push(c);
  byBalance.sort((a, b) => {
    const score = (c) => Math.abs(c.length - Math.sqrt(n)) + (Math.max(...c) - Math.min(...c)) * 0.6;
    return score(a) - score(b);
  });
  for (const c of byBalance.slice(0, 4)) { out.push(rows(c)); out.push(transpose(rows(c))); }
  // feature layouts
  const big = n <= 3 ? 0.5 : 2 / 3;
  if (n >= 2) {
    out.push([rect(0, 0, big, 1), ...strip(n - 1, [big, 0, 1 - big, 1], false)]);
    out.push([rect(0, 0, 1, big), ...strip(n - 1, [0, big, 1, 1 - big], true)]);
    out.push([...strip(n - 1, [0, 0, 1 - big, 1], false), rect(1 - big, 0, big, 1)]);
    out.push([...strip(n - 1, [0, 0, 1, 1 - big], true), rect(0, 1 - big, 1, big)]);
  }
  // uneven pairs (one third / two thirds), and a centred band for three photos
  if (n === 2) for (const t of [1 / 3, 2 / 3]) { out.push([rect(0, 0, t, 1), rect(t, 0, 1 - t, 1)]); out.push([rect(0, 0, 1, t), rect(0, t, 1, 1 - t)]); }
  if (n === 3) { out.push([rect(0, 0, 1, 0.25), rect(0, 0.25, 1, 0.5), rect(0, 0.75, 1, 0.25)]); out.push(transpose([rect(0, 0, 1, 0.25), rect(0, 0.25, 1, 0.5), rect(0, 0.75, 1, 0.25)])); }
  // mosaic: two large cells side by side on top, the rest in one or two rows below
  if (n >= 5) {
    const rest = n - 2;
    const below = rest <= 4 ? [strip(rest, [0, 0.6, 1, 0.4], true)] : [strip(Math.ceil(rest / 2), [0, 0.6, 1, 0.2], true), strip(Math.floor(rest / 2), [0, 0.8, 1, 0.2], true)];
    out.push([rect(0, 0, 0.5, 0.6), rect(0.5, 0, 0.5, 0.6), ...below.flat()]);
    out.push(transpose([rect(0, 0, 0.5, 0.6), rect(0.5, 0, 0.5, 0.6), ...below.flat()]));
  }
  const seen = new Set();
  return out.filter((l) => {
    if (l.length !== n) return false;
    const key = JSON.stringify([...l].sort());
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

export function generate() {
  const collage = {};
  for (let n = 2; n <= 9; n++) {
    const layouts = layoutsFor(n);
    const path = writePack(`collage/grid-${n}.json`, JSON.stringify({ photos: n, layouts }) + "\n");
    collage[`grid-${n}`] = { path, meta: { photos: n, layouts } };
  }
  updateManifest({ collage });
  return Object.fromEntries(Object.entries(collage).map(([k, v]) => [k, v.meta.layouts.length]));
}

if (runAsMain(import.meta.url)) console.log("gen-collage:", generate());
