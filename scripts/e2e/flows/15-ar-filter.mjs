// AR filter lists fed by the camera's local starter sticker set (src/data/camera/stickers.ts):
//  - photo editor AR filter tab: full grid, server category keeps the network-error page, a pick renders on the photo
//    (face engine, IMAGE mode) and is in the full-resolution SAVE;
//  - video editor AR filter tab: full list, server category error, a pick renders per frame and is in the export.
import { SCRATCH } from "../lib.mjs";
import { importToGallery, nthThumb, editorMain } from "../h.mjs";

const STARTER = 36; // 20 lenses + 6 catch-lights + 6 moles + Glam + Doll lashes + Smart scan + basic beauty
const SMART_SCAN = 9000600, GLAM = 9000400;

/** 64×64 grey thumbnail of an element (canvas / img / video), stored on window[key] (area-filtered via 256², so
 *  sources of different resolutions compare without aliasing). */
const grab = (sel, key) => `(() => { const el = ${sel}; if (!el) return null; const m = document.createElement('canvas'); m.width = 256; m.height = 256; const mg = m.getContext('2d'); mg.imageSmoothingQuality = 'high'; mg.drawImage(el, 0, 0, 256, 256); const t = document.createElement('canvas'); t.width = 64; t.height = 64; const g = t.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(m, 0, 0, 64, 64); const d = g.getImageData(0, 0, 64, 64).data; const o = []; for (let i = 0; i < d.length; i += 4) o.push((d[i] + d[i+1] + d[i+2]) / 3); window[${JSON.stringify(key)}] = o; return o.length; })()`;
/** pixels (of 4096) whose grey level differs by more than `th` between two stored thumbnails */
// (the mean grey shift between the two is removed first: encoders / colour paths may shift the whole frame slightly)
const changed = (a, b, th = 14) => `(() => { const A = window[${JSON.stringify(a)}], B = window[${JSON.stringify(b)}]; if (!A || !B) return -1; let m = 0; for (let i = 0; i < A.length; i++) m += B[i] - A[i]; m /= A.length; let n = 0; for (let i = 0; i < A.length; i++) if (Math.abs(B[i] - A[i] - m) > ${th}) n++; return n; })()`;
const means = (...keys) => `[${keys.map((k) => `(() => { const A = window[${JSON.stringify(k)}]; return A ? Math.round(A.reduce((x, y) => x + y, 0) / A.length) : -1; })()`).join(",")}]`;
const editCanvas = `[...document.querySelectorAll('[data-preview] canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]`;
const vCanvas = `document.querySelector('[data-video-edit] [data-preview] canvas')`;

async function openEditTab(s, tab) {
  const pos = `(() => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(tab)} && b.getBoundingClientRect().top > 780); if (!b) return null; const r = b.getBoundingClientRect(); return r.left + r.width / 2; })()`;
  for (let i = 0; i < 4; i++) {
    const x = await s.ev(pos);
    if (x == null) throw new Error(`no tab ${tab}`);
    if (x > 20 && x < 370) break;
    await s.swipe(x > 370 ? [330, 818] : [60, 818], x > 370 ? [60, 818] : [330, 818], { settle: 700 });
  }
  await s.click(tab, { settle: 1200 });
}
/** scrolls the sticker's list so it is fully visible, then taps it like a finger */
async function tapSticker(s, id) {
  const p = await s.ev(`(() => { const b = document.querySelector('[data-sticker="${id}"]'); if (!b) return null; let sc = b.parentElement; while (sc && !(sc.scrollHeight > sc.clientHeight + 2 || sc.scrollWidth > sc.clientWidth + 2)) sc = sc.parentElement; if (sc) { const r = b.getBoundingClientRect(), q = sc.getBoundingClientRect(); sc.scrollTo({ top: sc.scrollTop + r.top - q.top - 10, left: sc.scrollLeft + r.left - q.left - 40 }); } const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  if (!p) throw new Error(`no sticker ${id}`);
  await s.sleep(300);
  const q = await s.ev(`(() => { const r = document.querySelector('[data-sticker="${id}"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await s.tapAt(...q);
}

export default async function flowArFilter(s) {
  /* ------------------------------------------------------------------ photo editor */
  await s.step("photo-open-editor", async () => {
    await s.goto("/gallery", { settle: 1500 });
    await importToGallery(s, [SCRATCH + "/user.jpg"]);
    await s.tapAt(...(await s.ev(nthThumb(0)))); await s.sleep(3000);
    await s.waitFor(`location.pathname === '/edit'`, { timeout: 8000 });
    await s.waitFor(editorMain, { timeout: 15000, msg: "editor tabs" });
    await s.sleep(2500); // face detection (switches to Portrait)
    if (!(await s.ev(grab(editCanvas, "__p0")))) throw new Error("no preview canvas");
  });
  await s.step("photo-ar-full-list", async () => {
    await openEditTab(s, "AR filter");
    await s.waitFor(`!!document.querySelector('[data-ar-panel]')`, { timeout: 5000, msg: "AR filter page" });
    const n = await s.ev(`document.querySelectorAll('[data-ar-panel] [data-sticker]').length`);
    if (n !== STARTER) throw new Error(`grid shows ${n} stickers, expected ${STARTER}`);
    await s.assert(`!document.querySelector('[data-ar-panel]').innerText.includes('not connected')`, "local category shows no network error");
    await s.waitFor(`[...document.querySelectorAll('[data-ar-panel] [data-sticker] img')].every(i => i.complete && i.naturalWidth > 0)`, { timeout: 8000, msg: "thumbnails loaded" });
    const audit = await s.visualAudit();
    if (audit.length) throw new Error("visual audit: " + audit.join("; "));
  });
  await s.step("photo-ar-server-category-error", async () => {
    await s.click({ sel: '[data-ar-panel] [data-cat="-1"]' }, { settle: 400 });
    await s.waitFor(`document.querySelector('[data-ar-panel]').innerText.includes('You are not connected to a network')`, { timeout: 5000, msg: "server category network error" });
    await s.assert(`!!document.querySelector('[data-ar-panel]') && [...document.querySelectorAll('[data-ar-panel] button')].some(b => b.innerText.trim() === 'Retry')`, "Retry button");
    await s.shot("photo-server-error");
    await s.click({ sel: '[data-ar-panel] [data-cat="-100"]' }, { settle: 600 });
    await s.waitFor(`document.querySelectorAll('[data-ar-panel] [data-sticker]').length === ${STARTER}`, { timeout: 3000, msg: "back to the starter grid" });
  });
  await s.step("photo-ar-apply", async () => {
    await tapSticker(s, SMART_SCAN);
    await s.waitFor(`!!document.querySelector('[data-sticker="${SMART_SCAN}"] img[src*="icon_edit_sticker_select"]')`, { timeout: 3000, msg: "selected ring" });
    await s.sleep(4000); // resources + render
    await s.ev(grab(editCanvas, "__p1"));
    const n = await s.ev(changed("__p0", "__p1"));
    if (n < 40) throw new Error(`photo unchanged by the AR filter (${n} px changed)`);
    await s.shot("photo-smart-scan");
    await tapSticker(s, GLAM);
    await s.sleep(4000);
    await s.ev(grab(editCanvas, "__p2"));
    const g = await s.ev(changed("__p0", "__p2", 6));
    if (g < 20) throw new Error(`Glam not visible (${g} px changed)`);
    await s.shot("photo-glam");
    await tapSticker(s, SMART_SCAN);
    await s.sleep(3500);
    await s.ev(grab(editCanvas, "__p1"));
  });
  await s.step("photo-ar-confirm", async () => {
    await s.click({ label: "Confirm" }, { settle: 2500 });
    await s.waitFor(editorMain, { timeout: 5000, msg: "editor main after ✓" });
    await s.ev(grab(editCanvas, "__p3"));
    const n = await s.ev(changed("__p0", "__p3"));
    if (n < 40) throw new Error(`AR filter dropped after ✓ (${n} px changed)`);
  });
  await s.step("photo-ar-save-full-res", async () => {
    await s.click("SAVE", { settle: 3000 });
    await s.waitVisible("Saved!", { timeout: 20000 });
    await s.waitFor(`(() => { const i = [...document.images].find(i => i.src.startsWith('blob:') && i.getBoundingClientRect().width > 200); return i && i.complete && i.naturalWidth > 0; })()`, { timeout: 8000, msg: "saved image" });
    await s.sleep(400);
    const dim = await s.ev(`(() => { const i = [...document.images].find(i => i.src.startsWith('blob:') && i.getBoundingClientRect().width > 200); return [i.naturalWidth, i.naturalHeight]; })()`);
    await s.ev(grab(`[...document.images].find(i => i.src.startsWith('blob:') && i.getBoundingClientRect().width > 200)`, "__s"));
    const vsOrig = await s.ev(changed("__p0", "__s"));
    const vsEdit = await s.ev(changed("__p3", "__s"));
    if (!(vsOrig >= 40 && vsEdit < vsOrig / 2)) throw new Error(`saved photo does not carry the AR filter (vs original ${vsOrig}, vs edited preview ${vsEdit}, ${dim}, means ${await s.ev(means("__p0", "__p3", "__s"))})`);
    await s.shot("photo-saved");
    await s.click({ label: "Close" }, { settle: 1200 });
    await s.waitFor(editorMain, { timeout: 5000 });
  });

  /* ------------------------------------------------------------------ video editor */
  await s.step("video-open-face-clip", async () => {
    // a 3 s clip of the user's photo (scratchpad/e2e/user-face.mp4, made by ffmpeg; never copied into the repo),
    // imported through the gallery's own file input and opened from the Videos tab
    await s.goto("/gallery", { settle: 1500 });
    await s.setFile("input[type=file]", [SCRATCH + "/e2e/user-face.mp4"]);
    await s.sleep(2500);
    await s.click("Videos", { settle: 1500 });
    const at = await s.locate("00:03", { exact: false });
    const cell = at && [at.x, at.y - 30];
    if (!cell) throw new Error("face clip not in the gallery");
    await s.tapAt(...cell);
    // the first tap may only close the layout tooltip
    await s.waitFor(`location.pathname === '/video-edit'`, { timeout: 5000 }).catch(async () => { await s.tapAt(...cell); });
    await s.waitFor(`location.pathname === '/video-edit'`, { timeout: 15000, msg: "video editor" });
    await s.waitFor(`[...document.querySelectorAll('button[aria-label=Trim]')].some(b => b.getBoundingClientRect().top > 780)`, { timeout: 10000 });
    await s.sleep(1500);
  });
  await s.step("video-ar-full-list", async () => {
    const x = await s.ev(`(() => { const b = [...document.querySelectorAll('button[aria-label="AR filter"]')].find(b => b.getBoundingClientRect().top > 780); return b ? b.getBoundingClientRect().left + 29 : null; })()`);
    if (x > 370) await s.swipe([330, 818], [60, 818], { settle: 700 }); // finger-scroll the tab bar
    await s.click({ label: "AR filter" }, { settle: 2000 });
    const n = await s.ev(`document.querySelectorAll('[data-sticker]').length`);
    if (n !== STARTER) throw new Error(`list shows ${n} stickers, expected ${STARTER}`);
    await s.waitFor(`[...document.querySelectorAll('[data-sticker] img')].every(i => i.complete && i.naturalWidth > 0)`, { timeout: 8000, msg: "thumbnails loaded" });
    // pause playback and keep a clean frame for comparisons (the clip is a still face, looping)
    await s.sleep(600);
    if (!(await s.ev(grab(vCanvas, "__v0")))) throw new Error("no preview canvas");
    const audit = await s.visualAudit();
    if (audit.length) throw new Error("visual audit: " + audit.join("; "));
  });
  await s.step("video-ar-server-category-error", async () => {
    await s.click({ sel: '[data-cat="-1"]' }, { settle: 300 });
    await s.waitFor(`/not connected to (a )?network/i.test(document.body.innerText)`, { timeout: 5000, msg: "server category network error" });
    await s.shot("video-server-error");
    await s.click({ sel: '[data-cat="-100"]' }, { settle: 600 });
    await s.waitFor(`document.querySelectorAll('[data-sticker]').length === ${STARTER}`, { timeout: 3000 });
  });
  await s.step("video-ar-apply-per-frame", async () => {
    await tapSticker(s, SMART_SCAN);
    await s.waitFor(`window.__ve && window.__ve.sticker === ${SMART_SCAN}`, { timeout: 3000, msg: "sticker in the doc" });
    await s.waitFor(`window.__ve.faces > 0`, { timeout: 15000, msg: "faces tracked per frame" });
    await s.sleep(2500);
    // two frames ~400 ms apart: both carry the sticker (and the scan line moves between them)
    await s.ev(grab(vCanvas, "__v1")); await s.sleep(400); await s.ev(grab(vCanvas, "__v2"));
    const a = await s.ev(changed("__v0", "__v1")), b = await s.ev(changed("__v0", "__v2"));
    if (a < 30 || b < 30) throw new Error(`frames without the AR filter (${a}, ${b} px changed)`);
    await s.shot("video-smart-scan");
  });
  await s.step("video-ar-export", async () => {
    await s.click("SAVE", { settle: 1500 });
    await s.waitFor(`/Saved!/.test(document.body.innerText)`, { timeout: 60000, msg: "Saved! screen" });
    await s.waitFor(`(() => { const v = [...document.querySelectorAll('video')].find(v => v.getBoundingClientRect().width > 200); return v && v.readyState >= 2 && v.duration > 0.5; })()`, { timeout: 10000, msg: "exported video plays" });
    const v = `[...document.querySelectorAll('video')].find(v => v.getBoundingClientRect().width > 200)`;
    let best = 0;
    for (const t of [0.6, 1.2, 1.8]) {
      await s.ev(`(() => { const v = ${v}; v.pause(); return new Promise(r => { v.onseeked = () => r(1); v.currentTime = Math.min(${t}, v.duration - 0.1); setTimeout(() => r(0), 2000); }); })()`);
      await s.ev(grab(v, "__ve"));
      best = Math.max(best, await s.ev(changed("__v0", "__ve")));
    }
    if (best < 30) throw new Error(`exported frames carry no AR filter (${best} px changed)`);
    await s.sleep(800); // let the Saved! page finish sliding in
    await s.shot("video-saved");
  });
}
