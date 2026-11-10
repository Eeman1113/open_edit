import { openCamera, reviewUp, shoot, audit, GALLERY_DB } from "../h.mjs";
const AUTO_SAVE = "oe.camera.isAutoSave"; // src/components/camera/prefs.ts namespace + key
export default async function flowCameraCapture(s) {
  await openCamera(s, { fresh: true });
  // auto-save off so the explicit Save button is exercised
  await s.ev(`localStorage.setItem('${AUTO_SAVE}','false')`);
  await s.goto("/", { settle: 500 }); await openCamera(s);

  await s.step("shutter-tap", async () => {
    await s.click({ label: "Take photo" }, { settle: 300 });
    await s.waitFor(reviewUp, { timeout: 10000, msg: "review screen" });
    for (const t of ["Share", "Save", "Edit"]) await s.waitVisible(t);
    await s.waitFor(`[...document.images].some(i => i.src.startsWith('blob:') && i.naturalWidth > 100)`, { timeout: 5000, msg: "captured image rendered" });
  });
  await s.step("review-border", async () => {
    await s.click("Border", { settle: 900 });
    await s.waitVisible("White border", { timeout: 3000 });
    for (const t of ["9:16", "3:4", "4:3", "16:9", "None"]) await s.tap(t, { settle: 500 });
    await s.tap("1:1", { settle: 1500 });
    await audit(s, "border sheet");
    await s.shot("border-1-1");
    await s.click("Done", { settle: 800 });
    await s.assert(reviewUp, "still reviewing");
  });
  await s.step("review-save", async () => {
    await s.waitFor(`!document.querySelector('[aria-label="Save to gallery"]').disabled`, { timeout: 8000, msg: "bordered file ready" });
    await s.click({ label: "Save to gallery" }, { settle: 300 });
    await s.waitFor(`document.querySelector('[aria-label="Save to gallery"]')?.innerText.includes('Saved')`, { timeout: 8000, msg: "Saved" });
    await s.sleep(800);
    // the stored file is the 1:1 white-border composite
    const dims = await s.ev(`new Promise((res) => { const q = indexedDB.open('${GALLERY_DB}'); q.onsuccess = () => { const db = q.result; const names = [...db.objectStoreNames]; const tx = db.transaction(names[0]); const all = tx.objectStore(names[0]).getAll(); all.onsuccess = () => { const p = all.result.sort((a, b) => (b.createdAt ?? b.date ?? 0) - (a.createdAt ?? a.date ?? 0))[0]; res(p ? [p.width, p.height] : null); }; all.onerror = () => res(null); }; q.onerror = () => res(null); })`);
    if (!dims || Math.abs(dims[0] / dims[1] - 1) > 0.02) throw new Error("saved photo is not the 1:1 border composite: " + JSON.stringify(dims));
  });
  await s.step("back-to-camera-thumb", async () => {
    await s.click({ label: "Discard and go back" }, { settle: 1200 });
    if (await s.exists("Discard")) await s.click("Discard", { settle: 800 });
    await s.waitFor(`!(${reviewUp})`, { timeout: 4000, msg: "review closed" });
    await s.waitFor(`[...(document.querySelector('[aria-label="Open gallery"]')?.querySelectorAll('img') ?? [])].some(i => /^(blob|data):/.test(i.src))`, { timeout: 6000, msg: "last shot on the gallery button" });
  });
  await s.step("gallery-has-photo", async () => {
    await s.click({ label: "Open gallery" }, { settle: 2000 });
    await s.waitFor(`location.pathname === '/gallery'`, { timeout: 8000 });
    await s.waitFor(`[...document.images].filter(i => /^(blob|data):/.test(i.src) && i.getBoundingClientRect().width > 40).length > 0`, { timeout: 8000, msg: "gallery thumbnail" });
  });
  await s.step("shoot-hook-then-edit", async () => {
    await s.goto("/"); await openCamera(s);
    if (!(await s.ev(shoot))) throw new Error("window.__oeShoot missing (dev builds only)");
    await s.waitFor(reviewUp, { timeout: 10000, msg: "review screen" });
    await s.sleep(600);
    await s.click("Edit", { settle: 2500 });
    await s.waitFor(`location.pathname === '/edit'`, { timeout: 10000, msg: "editor route" });
    await s.waitFor(`document.querySelector('canvas') || [...document.images].some(i => i.src.startsWith('blob:'))`, { timeout: 10000, msg: "editor image" });
  });
  await s.step("timer-shot", async () => {
    await s.goto("/"); await openCamera(s);
    await s.click({ label: "Timer off" }); // 3 s
    await s.click({ label: "Take photo" }, { settle: 1200 });
    await s.waitFor(`[...document.querySelectorAll('div,span')].some(d => /^[123]$/.test(d.innerText?.trim()) && parseFloat(getComputedStyle(d).fontSize) >= 40)`, { timeout: 3000, msg: "countdown digits" }).catch(() => {});
    await s.waitFor(reviewUp, { timeout: 9000, msg: "review after timer" });
    await s.click({ label: "Discard and go back" }, { settle: 800 });
    if (await s.exists("Discard")) await s.click("Discard", { settle: 800 });
    for (let i = 0; i < 4 && !(await s.exists({ label: "Timer off" })); i++) {
      const t = await s.ev(`[...document.querySelectorAll('button[aria-label^="Timer"]')][0]?.getAttribute('aria-label')`);
      await s.click({ label: t }, { settle: 400 });
    }
  });
  await s.step("bounce-shot", async () => {
    await s.goto("/"); await openCamera(s);
    await s.click({ label: "Bounce off" }, { settle: 600 });
    await s.click({ label: "Take photo" }, { settle: 300 }).catch(() => s.click({ sel: '[aria-label="Record video"]' }));
    await s.waitFor(reviewUp, { timeout: 15000, msg: "bounce review" });
    await s.waitFor(`[...document.querySelectorAll('video')].some(v => v.readyState >= 2 && v.duration > 0.3)`, { timeout: 10000, msg: "bounce loop plays" });
    await audit(s, "bounce review");
    await s.click({ label: "Discard and go back" }, { settle: 1000 });
    if (await s.exists("Discard")) await s.click("Discard", { settle: 800 });
    await s.click({ label: "Bounce on" }, { settle: 600 });
  });
  await s.step("collage-capture", async () => {
    await s.click({ label: "Collage" }, { settle: 900 });
    // one shot per cell of the chosen layout, then the review opens
    for (let i = 0; i < 6 && !(await s.ev(reviewUp)); i++) {
      await s.click({ label: "Take photo" }, { settle: 300, timeout: 3000 }).catch(() => {});
      await s.waitFor(reviewUp, { timeout: 1800 }).catch(() => {});
    }
    await s.waitFor(reviewUp, { timeout: 10000, msg: "collage review" });
    await s.waitFor(`(() => { const i = document.querySelector('img[alt="Captured photo"]'); return i && i.naturalWidth > 100; })()`, { timeout: 6000, msg: "collage image" });
    await s.click({ label: "Discard and go back" }, { settle: 1000 });
    if (await s.exists("Discard")) await s.click("Discard", { settle: 800 });
    await s.click({ label: "Leave collage" }, { settle: 900 });
  });
  await s.ev(`localStorage.removeItem('${AUTO_SAVE}')`);
}
