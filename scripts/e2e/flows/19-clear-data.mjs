// Settings → Privacy → Clear local data: deletes the gallery (IndexedDB), preferences, Discover state and caches,
// then reloads into a fresh anonymous session. Runs last because it wipes everything the other flows stored.
import { importToGallery, SAMPLE_PHOTO, GALLERY_DB, audit, textOn } from "../h.mjs";

export default async function flowClearData(s) {
  await s.step("data-present", async () => {
    await s.goto("/gallery", { settle: 1000 });
    await importToGallery(s, [SAMPLE_PHOTO]);
    await s.ev(`localStorage.setItem('oe.e2e.marker', '1'); localStorage.setItem('oe.camera.gridLines', 'true'); sessionStorage.setItem('oe.look.title', 'x'); caches.open('oe-test').then(c => c.put('/e2e-probe', new Response('x')))`);
    await s.goto("/my", { settle: 1500 });
    await s.waitFor(`!document.body.innerText.includes('…') && /[1-9]\\d*\\s*photos and videos/.test(document.body.innerText.replace(/\\n/g, ' '))`, { timeout: 6000, msg: "Me counts the stored items" });
  });
  await s.step("clear", async () => {
    await s.click("Settings", { settle: 1200 });
    await s.tap("Clear local data", { settle: 800, exact: false });
    await s.waitVisible("Clear all local data?", { timeout: 3000 });
    await audit(s, "dialog");
    await s.click("Clear everything", { settle: 500 });
    await s.waitFor(`document.readyState === 'complete' && !document.body.innerText.includes('Clear all local data?')`, { timeout: 15000, msg: "reloaded" });
    await s.sleep(2500);
  });
  await s.step("fresh-session", async () => {
    const left = await s.ev(`(async () => ({
      // the camera that opens after the reload writes its defaults again; what was set before must be gone
      ls: ['oe.e2e.marker', 'oe.look.draft', 'oe.looks'].filter(k => localStorage.getItem(k) !== null).concat(localStorage.getItem('oe.camera.gridLines') === 'true' ? ['oe.camera.gridLines'] : []),
      ss: Object.keys(sessionStorage).filter(k => k.startsWith('oe.')),
      caches: (await caches.keys()).filter(k => k === 'oe-test'),
      dbs: (await indexedDB.databases?.() ?? []).map(d => d.name).filter(n => n === ${JSON.stringify(GALLERY_DB)}),
    }))()`);
    // the gallery database may be re-created empty by the page that loads after the reload
    if (left.ls.length || left.ss.length || left.caches.length) throw new Error("left behind: " + JSON.stringify(left));
    await s.goto("/gallery", { settle: 2000 });
    const n = await s.ev(`[...document.images].filter(i => i.src.startsWith('blob:')).length`);
    if (n) throw new Error(`gallery still shows ${n} items`);
    await s.goto("/my", { settle: 1500 });
    await s.waitFor(textOn("Guest session"), { timeout: 4000 });
    await s.waitFor(`/\\b0\\s*photos and videos/.test(document.body.innerText.replace(/\\n/g, ' '))`, { timeout: 6000, msg: "0 photos" });
    await audit(s);
  });
}
