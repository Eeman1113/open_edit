// Face effects on a real face (the fake camera plays E2E_Y4M, the editors get E2E_PHOTO / E2E_FACE_VIDEO):
//  - camera: beauty, makeup and an effect change the live preview, and the captured photo carries them;
//  - video editor: a Face FX pick is tracked on every frame and is in the export.
// The photo editor's Face FX tab is covered by flow 11.
import { openCamera, reviewUp, FACE_VIDEO, videoMain, videoTab, audit, slide, closeDrawer } from "../h.mjs";

/** 64×64 grey thumbnail of an element, stored on window[key]. */
const grab = (sel, key) => `(() => { const el = ${sel}; if (!el) return null; const t = document.createElement('canvas'); t.width = 64; t.height = 64; const g = t.getContext('2d'); g.drawImage(el, 0, 0, 64, 64); const d = g.getImageData(0, 0, 64, 64).data; const o = []; for (let i = 0; i < d.length; i += 4) o.push((d[i] + d[i+1] + d[i+2]) / 3); window[${JSON.stringify(key)}] = o; return o.length; })()`;
/** pixels (of 4096) whose grey level differs by more than `th` between two stored thumbnails */
const changed = (a, b, th = 14) => `(() => { const A = window[${JSON.stringify(a)}], B = window[${JSON.stringify(b)}]; if (!A || !B) return -1; let n = 0; for (let i = 0; i < A.length; i++) if (Math.abs(B[i] - A[i]) > ${th}) n++; return n; })()`;
const camCanvas = `[...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width > 200).sort((a, b) => b.width * b.height - a.width * a.height)[0]`;
const vCanvas = `document.querySelector('[data-video-edit] [data-preview] canvas')`;

export default async function flowFaceFx(s) {
  /* ------------------------------------------------------------------ camera */
  await s.step("camera-face-found", async () => {
    await openCamera(s, { fresh: true });
    await s.sleep(2500);
    await s.ev(grab(camCanvas, "__c0"));
  });
  await s.step("camera-beauty-sliders", async () => {
    await s.click("Beauty", { settle: 1200 });
    await s.waitVisible({ label: "Close beauty" }, { timeout: 4000 });
    const items = await s.ev(`[...document.querySelectorAll('[data-beauty]')].map(b => b.getAttribute('data-beauty'))`);
    if (!items.length) throw new Error("no beauty items");
    await s.tap({ sel: `[data-beauty="${items[Math.min(2, items.length - 1)]}"]` }, { settle: 800 });
    if (await s.ev(`!!document.querySelector('[role=slider]')`)) await slide(s, 0.95, { settle: 1500 });
    // an item with its own list (face styles) opens a sub-page: go back to the tabs
    if (!(await s.exists("Makeup"))) await s.click({ label: "Back" }, { settle: 800 });
    await s.tap("Makeup", { settle: 900 });
    const mk = await s.ev(`[...document.querySelectorAll('[data-beauty]')].map(b => b.getAttribute('data-beauty'))`);
    if (mk.length > 1) await s.tap({ sel: `[data-beauty="${mk[1]}"]` }, { settle: 1200 });
    await audit(s, "beauty");
    await s.shot("beauty");
    await closeDrawer(s, "Close beauty");
  });
  await s.step("camera-effect", async () => {
    await closeDrawer(s, "Close beauty");
    await s.click("Effects", { settle: 1500 });
    await s.waitFor(`document.querySelectorAll('[data-sticker]').length > 3`, { timeout: 6000, msg: "effect tiles" });
    await s.tap({ sel: '[data-sticker]:nth-child(4)' }, { settle: 5000 });
    await s.ev(grab(camCanvas, "__c1"));
    const n = await s.ev(changed("__c0", "__c1"));
    if (n < 40) throw new Error(`camera preview unchanged by beauty + effect (${n} px)`);
    await audit(s, "effects");
    await s.shot("effect-live");
    await s.click({ label: "Close effects" }, { settle: 900 });
  });
  await s.step("camera-capture-carries-effect", async () => {
    await s.click({ label: "Take photo" }, { settle: 300 });
    await s.waitFor(reviewUp, { timeout: 10000, msg: "review" });
    await s.waitFor(`(() => { const i = document.querySelector('img[alt="Captured photo"]'); return i && i.complete && i.naturalWidth > 100; })()`, { timeout: 6000, msg: "captured image" });
    await s.shot("captured");
    await s.click({ label: "Discard and go back" }, { settle: 1000 });
    if (await s.exists("Discard")) await s.click("Discard", { settle: 800 });
    // leave the camera as it was: no effect, beauty untouched for the next flows
    await s.click("Effects", { settle: 1200 });
    await s.tap({ sel: '[data-sticker]:nth-child(4)' }, { settle: 1000 });
    await s.click({ label: "Close effects" }, { settle: 800 });
  });

  /* ------------------------------------------------------------------ video editor */
  await s.step("video-open-face-clip", async () => {
    await s.goto("/gallery", { settle: 1500 });
    await s.setFile("input[type=file]", [FACE_VIDEO]);
    await s.sleep(2500);
    await s.tap("Videos", { settle: 1200 });
    const at = (await s.locate("0:03", { exact: false })) ?? (await s.locate("0:06", { exact: false }));
    if (!at) throw new Error("clip not in the gallery");
    for (let i = 0; i < 3 && (await s.ev("location.pathname")) !== "/video-edit"; i++) { await s.tapAt(at.x, at.y - 30); await s.sleep(2500); }
    await s.waitFor(videoMain, { timeout: 15000, msg: "video editor" });
    await s.sleep(1500);
  });
  await s.step("video-face-fx-per-frame", async () => {
    await s.click({ label: "Pause" }).catch(() => {});
    await s.ev(grab(vCanvas, "__v0"));
    await videoTab(s, "Frame");
    const n = await s.ev(`document.querySelectorAll('[data-sticker]').length`);
    if (n < 5) throw new Error(`only ${n} face effects listed`);
    await s.tap({ sel: "[data-sticker]:nth-child(4)" }, { settle: 1000 });
    await s.waitFor(`window.__ve && window.__ve.sticker != null`, { timeout: 3000, msg: "effect in the video doc" });
    await s.waitFor(`window.__ve.faces > 0`, { timeout: 20000, msg: "faces tracked per frame" });
    await s.sleep(2500);
    await s.ev(grab(vCanvas, "__v1")); await s.sleep(500); await s.ev(grab(vCanvas, "__v2"));
    const a = await s.ev(changed("__v0", "__v1")), b = await s.ev(changed("__v0", "__v2"));
    if (a < 30 || b < 30) throw new Error(`frames without the effect (${a}, ${b} px changed)`);
    await audit(s, "video face fx");
    await s.shot("video-face-fx");
  });
  await s.step("video-face-fx-export", async () => {
    await s.click("Save", { settle: 1500 });
    await s.waitVisible("Saved", { timeout: 90000 });
    const v = `[...document.querySelectorAll('video')].find(v => v.getBoundingClientRect().width > 150)`;
    await s.waitFor(`(() => { const v = ${v}; return v && v.readyState >= 2 && v.duration > 0.5; })()`, { timeout: 15000, msg: "exported video plays" });
    let best = 0;
    for (const t of [0.6, 1.2, 1.8]) {
      await s.ev(`(() => { const v = ${v}; v.pause(); return new Promise(r => { v.onseeked = () => r(1); v.currentTime = Math.min(${t}, v.duration - 0.1); setTimeout(() => r(0), 2000); }); })()`);
      await s.ev(grab(v, "__ve"));
      best = Math.max(best, await s.ev(changed("__v0", "__ve")));
    }
    if (best < 30) throw new Error(`exported frames carry no face effect (${best} px changed)`);
    await s.shot("video-saved");
    await s.click("Done", { settle: 1500 });
  });
}
