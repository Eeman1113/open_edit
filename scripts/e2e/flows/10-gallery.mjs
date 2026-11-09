import { SCRATCH } from "../lib.mjs";
import { importToGallery, nthThumb } from "../h.mjs";
export default async function flowGallery(s) {
  await s.step("seed-import", async () => {
    // deterministic library: drop what earlier flows saved, then the dev sample set (seeds only when empty) + user.jpg
    await s.goto("/home", { settle: 500 });
    await s.ev(`new Promise((r) => { const q = indexedDB.deleteDatabase('b612'); q.onsuccess = q.onerror = q.onblocked = () => r(true); })`);
    await s.goto("/gallery?__seed=1", { settle: 6000 });
    await importToGallery(s, [SCRATCH + "/user.jpg"]);
    await s.assert(`[...document.images].filter(i => i.src.startsWith('blob:')).length > 10`, "grid filled");
  });
  await s.step("albums", async () => {
    await s.click({ label: "Albums" }, { settle: 1000 });
    await s.waitVisible("Imported", { exact: false });
    await s.click("Imported", { exact: false, settle: 1200 });
    await s.assert(`document.body.innerText.includes('Imported')`, "album title");
    await s.click({ label: "Albums" }, { settle: 1000 });
    await s.click({ text: "Albums" }, { exact: false, settle: 1000, nth: 1 }).catch(() => s.tapAt(195, 111));
    await s.sleep(400);
  });
  await s.step("tabs", async () => {
    if (await s.exists("Imported", { exact: false })) await s.click({ label: "Albums" }, { settle: 800 }).catch(() => {});
    await s.click("Videos", { settle: 1200 });
    await s.assert(`document.body.innerText.includes('01:15') || [...document.images].filter(i => i.src.startsWith('blob:')).length >= 1`, "video cell");
    await s.click("All", { settle: 1200 });
  });
  await s.step("viewer", async () => {
    await s.click({ label: "Zoom" }, { settle: 1500 });
    await s.waitVisible({ label: "Back" }); await s.waitVisible("Delete"); await s.waitVisible("Share");
    const counter = `[...document.querySelectorAll('div,p')].map(e => e.textContent.trim()).find(t => /^\\d+\\/\\d+$/.test(t))`;
    await s.assert(counter, "page counter");
    await s.swipe([330, 420], [40, 420], { settle: 1200 }); // swipe to next
    await s.waitFor(`(${counter} || '').startsWith('2/')`, { timeout: 3000, msg: "swiped to 2/N" });
    await s.swipe([40, 420], [330, 420], { settle: 1200 });
  });
  await s.step("viewer-edit", async () => {
    await s.click("Edit", { settle: 3000 });
    await s.waitFor(`location.pathname === '/edit'`, { timeout: 8000 });
    await s.click({ label: "Back" }, { settle: 1500 });
    if (await s.exists("Discard", { exact: false })) await s.click("Discard", { exact: false, settle: 1000 });
    await s.waitFor(`location.pathname === '/gallery'`, { timeout: 6000, msg: "back to gallery" });
  });
  await s.step("viewer-back", async () => {
    await s.click({ label: "Zoom" }, { settle: 1200 });
    await s.click({ label: "Back" }, { settle: 1000 });
    await s.waitFor(`!document.querySelector('[aria-label=Delete]') || document.querySelector('[aria-label=Delete]').getBoundingClientRect().width === 0`, { timeout: 3000, msg: "viewer closed" }).catch(() => {});
    await s.assert(`location.pathname === '/gallery'`, "still gallery");
  });
  await s.step("layout-select", async () => {
    await s.click("Layout", { settle: 1500 });
    await s.waitVisible("Choose 2 to 9 photos.", { exact: false });
    for (const n of [0, 1, 3]) { const p = await s.ev(nthThumb(n)); await s.tapAt(p[0] - 20, p[1] - 20); await s.sleep(500); }
    await s.click("NEXT", { settle: 3000 });
    await s.waitFor(`location.pathname === '/collage'`, { timeout: 8000, msg: "collage route" });
  });
  await s.step("collage", async () => {
    await s.waitFor(`document.querySelectorAll('canvas, img').length > 2`, { timeout: 8000 });
    const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
    console.log("    collage:", (await s.clickables()).map((x) => x.split("|")[1]).filter(Boolean).join(", "));
  });
  await s.step("collage-save", async () => {
    const save = (await s.locate("Save", { exact: false })) ?? (await s.locate({ label: "Save" }, { exact: false }));
    if (!save) throw new Error("no save button");
    await s.tapAt(save.x, save.y); await s.sleep(3000);
    await s.waitFor(`/Saved|saved/.test(document.body.innerText) || location.pathname !== '/collage'`, { timeout: 10000, msg: "collage saved" });
  });
}
