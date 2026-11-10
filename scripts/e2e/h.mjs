// shared helpers for flows
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCRATCH } from "./lib.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** Test photo: E2E_PHOTO, else a photo kept in the scratch folder (outside the repo), else the pack's sample poster. */
export const TEST_PHOTO = process.env.E2E_PHOTO
  ?? (existsSync(path.join(SCRATCH, "user.jpg")) ? path.join(SCRATCH, "user.jpg") : path.join(REPO, "public/packs/open/videos/clip-1.jpg"));
/** The pack's generated sample photo (no faces). */
export const SAMPLE_PHOTO = path.join(REPO, "public/packs/open/videos/clip-1.jpg");
/** Test video: E2E_VIDEO, else the pack's generated sample clip (6 s). */
export const TEST_VIDEO = process.env.E2E_VIDEO ?? path.join(REPO, "public/packs/open/videos/clip-1.mp4");
/** A short clip with a face for the face flows (E2E_FACE_VIDEO, made locally with ffmpeg; never committed), else TEST_VIDEO. */
export const FACE_VIDEO = process.env.E2E_FACE_VIDEO ?? TEST_VIDEO;
/** IndexedDB database of the gallery (src/lib/store.ts). */
export const GALLERY_DB = "openedit";
export const hasImg = (name) => `!![...document.querySelectorAll('img')].find(i => i.src.includes('/${name}.') && i.getBoundingClientRect().width > 0) || [...document.querySelectorAll('[style*="${name}."]')].some(e => e.getBoundingClientRect().width > 0)`;
export const textOn = (t) => `document.body.innerText.includes(${JSON.stringify(t)})`;
export const pathIs = (p) => `location.pathname === ${JSON.stringify(p)}`;
/** Shutter button (photo or video mode). */
export const SHUTTER = `document.querySelector('[aria-label="Take photo"], [aria-label="Record video"], [aria-label="Stop recording"], [aria-label="Resume recording"]')`;
/** Line shown on the launch screen (src/components/home/Splash.tsx) until the camera is ready. */
export const SPLASH_TEXT = "runs on your device";
export const splashUp = `document.body.innerText.includes(${JSON.stringify(SPLASH_TEXT)})`;
/** Camera is up: shutter present and the launch screen gone. */
export const camReady = `!!(${SHUTTER}) && !(${splashUp})`;
/** Bottom navigation tab by route ("/home", "/discover", "/", "/ai", "/my"); use with s.click(). */
export const navTab = (href) => ({ sel: `nav a[href="${href}"]` });
/** The bottom navigation highlights the tab for `href`. */
export const navActive = (href) => `document.querySelector('nav a[aria-current=page]')?.getAttribute('href') === ${JSON.stringify(href)}`;
/** Take a photo without a pointer (dev-only hook exposed by the camera screen). */
export const shoot = `(window.__oeShoot ? (window.__oeShoot(), true) : false)`;
/** The capture review screen is showing. */
export const reviewUp = `!!document.querySelector('[aria-label="Save to gallery"]')`;

export async function openCamera(s, { fresh = false } = {}) {
  if (fresh || (await s.ev("location.pathname")) !== "/") await s.goto("/", { wait: camReady, settle: 1200 });
  await s.waitFor(camReady, { timeout: 20000, msg: "camera ready" });
}

/** Import a local file into the web gallery through its own file input (stays inside the test browser profile). */
export async function importToGallery(s, files) {
  if ((await s.ev("location.pathname")) !== "/gallery") await s.goto("/gallery", { settle: 1500 });
  await s.setFile("input[type=file]", files);
  await s.waitFor(`[...document.images].filter(i => i.src.startsWith('blob:') && i.getBoundingClientRect().width > 50).length > 0`, { timeout: 15000, msg: "imported thumbnail" });
  await s.sleep(800);
}
/** Opens the n-th gallery item (a first tap may only dismiss the gallery's tip balloon) and waits for `route`. */
export async function openThumb(s, n = 0, route = "/edit") {
  for (let i = 0; i < 3; i++) {
    const p = await s.ev(nthThumb(n));
    if (!p) throw new Error("no gallery thumbnail");
    await s.tapAt(...p);
    try { await s.waitFor(`location.pathname === ${JSON.stringify(route)}`, { timeout: 5000 }); return; } catch { /* retry */ }
  }
  throw new Error(`gallery item did not open ${route}`);
}
/** Center of the n-th gallery grid thumbnail. */
export const nthThumb = (n = 0) => `(() => { const i = [...document.images].filter(i => i.src.startsWith('blob:') && i.getBoundingClientRect().width > 50)[${n}]; if (!i) return null; const r = i.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`;
/** Photo editor main dock (tab bar) is showing, i.e. no tool page is open. */
export const editorMain = `!!document.querySelector('[aria-label="Editor sections"]') && ![...document.querySelectorAll('p')].some(p => p.innerText.trim() === 'Runs on your device')`;
/** Video editor main dock is showing. */
export const videoMain = `!!document.querySelector('[aria-label="Video tools"]')`;
/** Opens a photo editor tab by id (TOOLS FILTER EFFECTS ADJUST PORTRAIT STICKER STAMP TEXT BRUSH BORDER). */
export async function editTab(s, id) {
  await toEditorMain(s);
  await s.tap({ sel: `[aria-label="Editor sections"] [data-tab="${id}"]` }, { settle: 1200 });
}
/** Gets back to the photo editor's dock from wherever a failed step left it (AI card, tool page, dialog, sheet). */
export async function toEditorMain(s) {
  for (let i = 0; i < 5 && !(await s.ev(editorMain).catch(() => false)); i++) {
    if (await s.ev(`[...document.querySelectorAll('p')].some(p => p.innerText.trim() === 'Runs on your device')`).catch(() => false)) { await aiDone(s).catch(() => {}); continue; }
    const c = (await s.locate({ label: "Cancel" })) ?? (await s.locate("Keep editing")) ?? (await s.locate({ label: "Back to editing" }));
    if (c) { await s.tapAt(c.x, c.y); await s.sleep(900); } else { await s.key("Escape"); await s.sleep(800); }
    for (const t of ["Discard", "Leave"]) if (await s.exists(t)) { await s.click(t, { settle: 800 }); break; }
  }
}
/** Opens a video editor tab by id (VideoEdit Speed Filter Effects Frame Reshape Retouch Music). */
export async function videoTab(s, id) {
  await s.tap({ sel: `[aria-label="Video tools"] [data-tab="${id}"]` }, { settle: 1500 });
}
/** Waits for an on-device AI step (the "Runs on your device" card) to finish. */
export async function aiDone(s, { timeout = 180000, quiet = 2500 } = {}) {
  // tools often find faces first and only then start the model, so "idle" must hold for a while
  // the AI progress card (its "Runs on your device" line) or a busy spinner over the photo
  const busy = `[...document.querySelectorAll('p')].some(p => p.innerText.trim() === 'Runs on your device' && p.getBoundingClientRect().width > 0) || [...document.querySelectorAll('.oe-spin')].some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top > 52 && r.top < innerHeight - 200; })`;
  const t0 = Date.now();
  let idleSince = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await s.ev(busy).catch(() => false)) idleSince = Date.now();
    else if (Date.now() - idleSince >= quiet) return;
    await s.sleep(250);
  }
  throw new Error("on-device AI step did not finish");
}
/** Drags the n-th visible slider (role=slider) to `frac` of its track, like a finger. */
export async function slide(s, frac, { nth = 0, settle = 1200 } = {}) {
  const r = await s.ev(`(() => { const e = [...document.querySelectorAll('[role=slider]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 20 && r.top > 0 && r.bottom < innerHeight; })[${nth}]; if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
  if (!r) throw new Error("no slider on screen");
  const [x, y, w, h] = r, cy = y + h / 2, x1 = x + 10 + (w - 20) * frac;
  await s.drag([x + w / 2, cy], [x1, cy], { settle });
}
/** Taps the photo editor's Apply (or Done) in the tool bar and waits for the main dock. */
export async function apply(s) {
  const l = (await s.exists({ label: "Apply" })) ? "Apply" : "Done";
  await s.click({ label: l }, { settle: 1200 });
  await s.waitFor(editorMain, { timeout: 15000, msg: "back on the editor dock after Apply" });
}
/** Leaves a tool page with Cancel (and confirms a discard question). */
export async function cancelTool(s) {
  if (await s.exists({ label: "Cancel" })) await s.click({ label: "Cancel" }, { settle: 1000 });
  else { await s.key("Escape"); await s.sleep(900); }
  for (const t of ["Discard", "Leave"]) if (await s.exists(t)) { await s.click(t, { settle: 800 }); break; }
}
/** Fails the step on any visual audit finding. */
export async function audit(s, where = "") {
  const a = await s.visualAudit();
  if (a.length) throw new Error(`visual${where ? " (" + where + ")" : ""}: ` + a.join("; "));
}
/** Mean/std of the editor preview canvas (2D readback) — a flat colour has std ≈ 0. */
export const previewStats = `(() => { const c = (() => { const v = [...document.querySelectorAll('[data-preview] canvas')].filter(c => { const r = c.getBoundingClientRect(); return r.width > 40 && getComputedStyle(c).visibility !== 'hidden'; }); return v[0] ?? [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; })(); if (!c) return null; const t = document.createElement('canvas'); t.width = 64; t.height = 64; const g = t.getContext('2d'); g.drawImage(c, 0, 0, 64, 64); const d = g.getImageData(0, 0, 64, 64).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i+1] + d[i+2]) / 3; s += v; s2 += v * v; n++; } const m = s / n; return { w: c.width, h: c.height, mean: Math.round(m), std: Math.round(Math.sqrt(s2 / n - m * m)) }; })()`;
/** 32×32 grey thumbnail of the editor preview canvas (for before/after diffs). */
export const previewThumb = `(() => { const c = (() => { const v = [...document.querySelectorAll('[data-preview] canvas')].filter(c => { const r = c.getBoundingClientRect(); return r.width > 40 && getComputedStyle(c).visibility !== 'hidden'; }); return v[0] ?? [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; })(); const t = document.createElement('canvas'); t.width = 32; t.height = 32; const g = t.getContext('2d'); g.drawImage(c, 0, 0, 32, 32); const d = g.getImageData(0, 0, 32, 32).data; const o = []; for (let i = 0; i < d.length; i += 4) o.push(Math.round((d[i] + d[i+1] + d[i+2]) / 3)); return o; })()`;
export const diff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

/** Closes a camera drawer (Filters / Beauty / Effects), first leaving any sub-list it has open. */
export async function closeDrawer(s, label) {
  // closed = the three dock pills are back above the shutter
  const closed = `['Beauty', 'Effects'].every(t => [...document.querySelectorAll('button')].some(b => b.innerText.trim() === t && b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().top > 0))`;
  for (let i = 0; i < 5; i++) {
    if (await s.ev(closed)) return;
    const c = await s.locate({ label });
    if (c) { await s.tapAt(c.x, c.y); await s.sleep(900); } else { await s.key("Escape"); await s.sleep(800); }
  }
  if (!(await s.ev(closed))) throw new Error(`${label}: drawer still open`);
}

/** Clicks `target` until `cond` holds (a tap made while a route is still settling can be lost). */
export async function clickUntil(s, target, cond, { tries = 3, timeout = 4000, ...opts } = {}) {
  for (let i = 0; i < tries; i++) {
    await s.click(target, { settle: 300, ...opts });
    try { await s.waitFor(cond, { timeout }); return; } catch { /* tap again */ }
  }
  throw new Error(`no effect after tapping ${JSON.stringify(target)}: ${cond}`);
}
