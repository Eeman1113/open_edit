// Creation screens beyond the editors: the look creator (/lens: pick an effect, a filter and a face shape, name it,
// search, save → the camera opens with the look), Templates (/studio) and Art styles (/aistyle: a style rendered on
// the device, saved to the gallery).
import { importToGallery, TEST_PHOTO, SAMPLE_PHOTO, camReady, audit, textOn, clickUntil } from "../h.mjs";

const at = (p) => `location.pathname === ${JSON.stringify(p)}`;
const firstTile = (n = 0) => `(() => { const b = [...document.querySelectorAll('[role=dialog] button[data-item], button[data-item]')].filter(b => b.getBoundingClientRect().width > 20)[${n}]; if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`;

async function pickFrom(s, menu, n = 0) {
  await s.tap(menu, { settle: 1200 });
  await s.waitFor(`!!(${firstTile(n)})`, { timeout: 8000, msg: `${menu} list` });
  await audit(s, `${menu} list`);
  await s.tapAt(...(await s.ev(firstTile(n)))); await s.sleep(600);
  await s.key("Escape"); await s.sleep(700);
}

export default async function flowCreators(s) {
  /* ------------------------------------------------------------------ look creator */
  await s.step("lens-open", async () => {
    await s.goto("/home", { settle: 500 });
    await s.ev(`sessionStorage.clear(); localStorage.removeItem('oe.looks')`);
    await s.goto("/my", { settle: 1000 });
    await s.click("Create a look", { settle: 2000 });
    await s.waitFor(at("/lens"), { timeout: 6000 });
    for (const t of ["Stickers", "Face paint", "Face shape", "Filters", "Layers"]) await s.waitVisible(t, { timeout: 4000 }).catch(async () => { await s.reveal(t); await s.waitVisible(t, { timeout: 2000 }); });
    await s.assert(`document.querySelector('button[disabled]')?.innerText.trim() === 'Save'`, "Save waits for a piece");
    await audit(s);
  });
  await s.step("lens-pick-pieces", async () => {
    await pickFrom(s, "Stickers", 0);
    await pickFrom(s, "Filters", 3);
    await pickFrom(s, "Face shape", 1);
    await s.waitFor(`document.querySelectorAll('[data-look-parts] > span').length === 3`, { timeout: 3000, msg: "three pieces over the preview" });
    await audit(s, "look parts");
    await s.shot("pieces");
  });
  await s.step("lens-layers-remove", async () => {
    await s.tap({ label: "Layers" }, { settle: 900 });
    await s.waitVisible("Face style", { timeout: 3000 });
    const rm = await s.ev(`[...document.querySelectorAll('[aria-label^="Remove "]')].length`);
    if (rm !== 3) throw new Error(`layers list shows ${rm} pieces`);
    await s.click({ label: await s.ev(`[...document.querySelectorAll('[aria-label^="Remove "]')].pop().getAttribute('aria-label')`) }, { settle: 700 });
    await s.key("Escape"); await s.sleep(700);
    await s.waitFor(`document.querySelectorAll('[data-look-parts] > span').length === 2`, { timeout: 3000, msg: "piece removed" });
    await pickFrom(s, "Face shape", 0);
  });
  await s.step("lens-search", async () => {
    await s.tap("Stickers", { settle: 1200 });
    await s.click("Search", { settle: 1500 });
    await s.waitFor(at("/lens/store"), { timeout: 5000 });
    await s.click({ sel: "input" }); await s.type("kitty"); await s.key("Enter"); await s.sleep(1500);
    await s.waitFor(`document.querySelectorAll('button[data-item]').length > 0`, { timeout: 6000, msg: "search results" });
    await audit(s, "search");
    await s.tapAt(...(await s.ev(firstTile(0)))); await s.sleep(500);
    await s.click("Cancel", { settle: 1500 });
    await s.waitFor(at("/lens"), { timeout: 5000, msg: "back on the creator" });
    await s.waitFor(`[...document.querySelectorAll('[data-look-parts] span')].some(e => /Kitty/i.test(e.innerText))`, { timeout: 4000, msg: "searched effect is in the look" });
  });
  await s.step("lens-name-and-tags", async () => {
    await clickUntil(s, "New look", at("/lens/title"));
    await s.sleep(800);
    await s.type("Warm kitty");
    await s.click("Done", { settle: 1500 });
    await s.waitFor(at("/lens"), { timeout: 5000 });
    await s.waitVisible("Warm kitty", { timeout: 3000 });
    await s.goto("/lens/hashtag", { settle: 1200 });
    await s.type("#warm #cute");
    await s.click("Done", { settle: 1500 });
    await s.waitVisible("Warm kitty", { timeout: 4000 });
  });
  await s.step("lens-guide-and-photo-preview", async () => {
    await s.click("How it works", { settle: 800 });
    await s.waitVisible("How looks work", { timeout: 3000 });
    await s.key("Escape"); await s.sleep(600);
    await s.goto("/gallery", { settle: 800 });
    await importToGallery(s, [SAMPLE_PHOTO]);
    await s.goto("/lens", { settle: 1500 });
    await s.click({ label: "Photo" }, { settle: 1200 });
    await s.waitVisible("Preview photo", { timeout: 4000 });
    const p = await s.ev(`(() => { const i = [...document.images].find(i => i.src.startsWith('blob:') && i.closest('button') && i.getBoundingClientRect().width > 60); if (!i) return null; const r = i.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    if (!p) throw new Error("no photo in the picker");
    await s.tapAt(...p); await s.sleep(1200);
    await s.waitFor(`(() => { const i = document.querySelector('img[alt="Preview photo"]'); return i && i.complete && i.naturalWidth > 0; })()`, { timeout: 5000, msg: "preview photo" });
    await s.waitFor(`document.querySelectorAll('[data-look-parts] > span').length === 3`, { timeout: 3000, msg: "draft kept" });
  });
  await s.step("lens-save-opens-camera", async () => {
    await s.click("Save", { settle: 2500 });
    await s.waitFor(`location.pathname === '/' && /filter=/.test(location.search) && /sticker=/.test(location.search) && /beauty=/.test(location.search)`, { timeout: 8000, msg: "camera with the look" });
    await s.waitFor(camReady, { timeout: 20000, msg: "camera ready" });
    await s.assert(`JSON.parse(localStorage.getItem('oe.looks') || '[]')[0]?.title === 'Warm kitty'`, "look stored");
    await s.goto("/lens", { settle: 1500 });
    await s.tap({ label: "Layers" }, { settle: 900 });
    await s.waitVisible("Warm kitty", { timeout: 3000 });
    await s.assert(`document.querySelector('button[disabled]')?.innerText.trim() === 'Save'`, "fresh draft after saving");
    await s.key("Escape"); await s.sleep(600);
  });
  await s.step("lens-discard", async () => {
    await pickFrom(s, "Filters", 1);
    await s.click({ label: "Close" }, { settle: 900 });
    await s.waitVisible("Discard this look?", { timeout: 3000 });
    await s.click("Discard", { settle: 1500 });
    await s.waitFor(`!location.pathname.startsWith('/lens')`, { timeout: 5000, msg: "left the creator" });
  });

  /* ------------------------------------------------------------------ templates */
  await s.step("templates", async () => {
    await s.goto("/my", { settle: 1000 });
    await s.tap("Templates", { settle: 1500, exact: false });
    await s.waitFor(at("/studio"), { timeout: 5000 });
    await s.waitFor(`[...document.querySelectorAll('a[href="/gallery?mode=collage"]')].length > 2`, { timeout: 8000, msg: "built-in templates listed" });
    await s.assert(`[...document.images].filter(i => i.getBoundingClientRect().top < innerHeight && i.getBoundingClientRect().width > 30).every(i => i.complete && i.naturalWidth > 0)`, "template previews load");
    await audit(s);
    // the first online template (index 0 is the built-in "Collage layouts" row)
    const p = await s.ev(`(() => { const a = [...document.querySelectorAll('a[href="/gallery?mode=collage"]')][1]; const r = a.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await s.sleep(500);
    for (let i = 0; i < 3 && (await s.ev("location.pathname")) !== "/gallery"; i++) { await s.tapAt(...p); await s.sleep(2000); }
    await s.waitFor(`location.pathname === '/gallery' && location.search.includes('collage')`, { timeout: 5000, msg: "template → collage picker" });
  });
  await s.step("templates-video-row", async () => {
    await s.goto("/studio", { settle: 1500 });
    await s.click("Video editor", { settle: 1500 });
    await s.waitFor(`location.pathname === '/gallery'`, { timeout: 5000 });
  });
  await s.step("template-detail-unavailable", async () => {
    await s.goto("/studio/detail?id=nope", { settle: 1200 });
    await s.waitVisible("This template isn’t available right now.", { timeout: 5000 });
    await audit(s);
    await s.click("Built-in templates", { settle: 1500 });
    await s.waitFor(`location.pathname === '/studio'`, { timeout: 5000, msg: "back to the templates" });
  });

  /* ------------------------------------------------------------------ art styles */
  await s.step("art-styles-open", async () => {
    await s.goto("/gallery", { settle: 800 });
    await importToGallery(s, [TEST_PHOTO]);
    await s.goto("/ai", { settle: 1000 });
    await s.tap("Art styles", { settle: 1500, exact: false });
    await s.waitFor(at("/aistyle"), { timeout: 5000 });
    await s.waitFor(`document.querySelectorAll('[data-style]').length >= 5`, { timeout: 8000, msg: "styles listed" });
    await audit(s);
  });
  await s.step("art-styles-apply-save", async () => {
    await s.click("Choose a photo", { settle: 1200 });
    const p = await s.ev(`(() => { const i = [...document.images].find(i => i.src.startsWith('blob:') && i.closest('button') && i.getBoundingClientRect().width > 60); if (!i) return null; const r = i.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    if (!p) throw new Error("no photo in the picker");
    await s.tapAt(...p); await s.sleep(2000);
    await s.waitFor(`location.search.includes('id=')`, { timeout: 5000 });
    await s.tap({ sel: "[data-style]:nth-child(3)" }, { settle: 1000 });
    await s.waitFor(`!!document.querySelector('img[alt="Photo with the art style applied"]')`, { timeout: 30000, msg: "styled photo" });
    await s.shot("styled");
    await audit(s, "styled");
    await s.click("Save", { settle: 1500 });
    await s.waitVisible("Saved to your gallery", { timeout: 5000 });
    await s.assert(textOn("Saved"), "Saved state");
  });
  await s.step("art-styles-close", async () => {
    await s.click({ label: "Close" }, { settle: 1200 });
    await s.waitFor(`location.pathname !== '/aistyle'`, { timeout: 5000 });
  });
}
