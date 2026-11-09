// shared helpers for flows
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCRATCH } from "./lib.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** Test photo: E2E_PHOTO, else a photo kept in the scratch folder (outside the repo), else the pack's sample poster. */
export const TEST_PHOTO = process.env.E2E_PHOTO
  ?? (existsSync(path.join(SCRATCH, "user.jpg")) ? path.join(SCRATCH, "user.jpg") : path.join(REPO, "public/packs/open/videos/clip-1.jpg"));
/** Test video: E2E_VIDEO, else the pack's generated sample clip. */
export const TEST_VIDEO = process.env.E2E_VIDEO ?? path.join(REPO, "public/packs/open/videos/clip-1.mp4");
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
/** Center of the n-th gallery grid thumbnail. */
export const nthThumb = (n = 0) => `(() => { const i = [...document.images].filter(i => i.src.startsWith('blob:') && i.getBoundingClientRect().width > 50)[${n}]; if (!i) return null; const r = i.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`;
/** Editor main tab bar is showing. */
export const editorMain = `[...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Portrait' && b.getBoundingClientRect().top > 780)`;
/** Mean/std of the editor preview canvas (2D readback) — a flat colour has std ≈ 0. */
export const previewStats = `(() => { const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; if (!c) return null; const t = document.createElement('canvas'); t.width = 64; t.height = 64; const g = t.getContext('2d'); g.drawImage(c, 0, 0, 64, 64); const d = g.getImageData(0, 0, 64, 64).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i+1] + d[i+2]) / 3; s += v; s2 += v * v; n++; } const m = s / n; return { w: c.width, h: c.height, mean: Math.round(m), std: Math.round(Math.sqrt(s2 / n - m * m)) }; })()`;
/** 32×32 grey thumbnail of the editor preview canvas (for before/after diffs). */
export const previewThumb = `(() => { const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; const t = document.createElement('canvas'); t.width = 32; t.height = 32; const g = t.getContext('2d'); g.drawImage(c, 0, 0, 32, 32); const d = g.getImageData(0, 0, 32, 32).data; const o = []; for (let i = 0; i < d.length; i += 4) o.push(Math.round((d[i] + d[i+1] + d[i+2]) / 3)); return o; })()`;
export const diff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
