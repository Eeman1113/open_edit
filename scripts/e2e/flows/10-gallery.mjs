import { importToGallery, nthThumb, TEST_PHOTO, GALLERY_DB, audit } from "../h.mjs";
export default async function flowGallery(s) {
  await s.step("seed-import", async () => {
    // deterministic library: drop what earlier flows saved, then the dev sample set (seeds only when empty) + the test photo
    await s.goto("/home", { settle: 500 });
    await s.ev(`new Promise((r) => { const q = indexedDB.deleteDatabase('${GALLERY_DB}'); q.onsuccess = q.onerror = q.onblocked = () => r(true); })`);
    await s.goto("/gallery?__seed=1", { settle: 6000 });
    await importToGallery(s, [TEST_PHOTO]);
    await s.assert(`[...document.images].filter(i => i.src.startsWith('blob:')).length >= 1`, "grid filled");
  });
  await s.step("albums", async () => {
    await s.click("All photos", { settle: 1000 });
    await s.waitVisible("Imported", { exact: false });
    await s.click("Imported", { exact: false, settle: 1200 });
    await s.assert(`document.body.innerText.includes('Imported')`, "album title");
  });
  await s.step("tabs", async () => {
    await s.click("Videos", { settle: 1200 });
    await s.click("All", { settle: 1200 });
  });
  await s.step("viewer", async () => {
    await s.click({ label: "View full screen" }, { settle: 1500 });
    for (const t of ["Share", "Edit", "Delete"]) await s.waitVisible(t);
    await s.assert(`[...document.querySelectorAll('div,p,span')].some(e => /^\\d+ \\/ \\d+$/.test(e.textContent.trim()))`, "page counter");
  });
  await s.step("viewer-edit", async () => {
    await s.click("Edit", { settle: 3000 });
    await s.waitFor(`location.pathname === '/edit'`, { timeout: 8000 });
    await s.click({ label: "Back" }, { settle: 1500 });
    if (await s.exists("Discard", { exact: false })) await s.click("Discard", { exact: false, settle: 1000 });
    await s.waitFor(`location.pathname === '/gallery'`, { timeout: 6000, msg: "back to gallery" });
  });
  await s.step("viewer-back", async () => {
    await s.click({ label: "View full screen" }, { settle: 1200 });
    await s.click({ label: "Back" }, { settle: 1000 });
    await s.assert(`location.pathname === '/gallery'`, "still gallery");
  });
  await s.step("collage-select", async () => {
    await s.click("Collage", { settle: 1500 });
    await s.waitVisible("2–9 photos", { exact: false });
    const n = await s.ev(`[...document.images].filter(i => i.src.startsWith('blob:') && i.getBoundingClientRect().width > 50).length`);
    if (n < 2) await importToGallery(s, [TEST_PHOTO]);
    for (const i of [0, 1]) { const p = await s.ev(nthThumb(i)); await s.tapAt(p[0] - 20, p[1] - 20); await s.sleep(500); }
    await s.click("Next", { settle: 3000 });
    await s.waitFor(`location.pathname === '/collage'`, { timeout: 8000, msg: "collage route" });
  });
  await s.step("collage", async () => {
    await s.waitFor(`document.querySelectorAll('canvas, img').length > 0`, { timeout: 8000 });
    await s.sleep(1500);
    for (const t of ["Stack", "Border", "Layout"]) await s.tap(t, { settle: 900 });
    await audit(s);
  });
  await s.step("collage-save", async () => {
    await s.click("Save", { settle: 2000 });
    await s.waitVisible("Your collage is in the gallery.", { timeout: 20000 });
    await s.waitFor(`(() => { const i = document.querySelector('img[alt="Saved result"]'); return i && i.complete && i.naturalWidth > 100; })()`, { timeout: 8000, msg: "collage image" });
    await audit(s, "saved");
    await s.click("Open gallery", { settle: 1500 });
    await s.waitFor(`location.pathname === '/gallery'`, { timeout: 6000, msg: "gallery" });
  });
  await s.step("viewer-delete", async () => {
    const before = await s.ev(`[...document.images].filter(i => i.src.startsWith('blob:') && i.getBoundingClientRect().width > 50).length`);
    await s.click({ label: "View full screen" }, { settle: 1200 });
    await s.click("Delete", { settle: 800 });
    await s.waitFor(`[...document.querySelectorAll('[role=dialog], [role=alertdialog]')].length > 0`, { timeout: 3000, msg: "delete confirmation" });
    await audit(s, "delete dialog");
    const ok = await s.ev(`[...document.querySelectorAll('[role=dialog] button, [role=alertdialog] button')].map(b => b.innerText.trim()).find(t => /^Delete/.test(t))`);
    await s.click(ok, { settle: 1500 });
    if (await s.exists({ label: "Back" })) await s.click({ label: "Back" }, { settle: 1000 });
    await s.waitFor(`[...document.images].filter(i => i.src.startsWith('blob:') && i.getBoundingClientRect().width > 50).length === ${before} - 1`, { timeout: 5000, msg: "one item fewer" });
  });
}
