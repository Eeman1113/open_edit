import { openCamera } from "../h.mjs";
const scrollTo = (y) => `(() => { const sc = [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 200 && /auto|scroll/.test(getComputedStyle(e).overflowY)); sc && sc.scrollTo(0, ${y}); })()`;
export default async function flowHome(s) {
  const home = async () => { await s.goto("/home", { wait: `document.body.innerText.includes('Effects')`, settle: 1200 }); };
  await home();
  await s.step("feed", async () => {
    for (const t of ["Camera", "Edit photo", "Collage", "Effects", "Filters"]) await s.waitVisible(t, { timeout: 4000 });
    await s.assert(`[...document.images].filter(i => i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().top < innerHeight).length > 5`, "feed images loaded");
    const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
  });
  await s.step("shortcut-camera", async () => {
    const p = await s.ev(`(() => { const a = [...document.querySelectorAll('a')].find(a => !a.closest('nav[aria-label="Main"]') && (a.getAttribute('aria-label') ?? a.innerText.trim()) === 'Camera'); if (!a) return null; const r = a.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    if (!p) throw new Error("no camera shortcut");
    await s.tapAt(...p); await s.sleep(1500);
    await s.waitFor(`location.pathname === '/'`, { timeout: 6000 });
    await openCamera(s);
  });
  await s.step("shortcut-edit", async () => {
    await home(); await s.click("Edit photo", { settle: 1500 });
    await s.waitFor(`location.pathname === '/gallery'`, { timeout: 6000 });
  });
  await s.step("shortcut-collage", async () => {
    await home(); await s.click("Collage", { settle: 1500, nth: 0 });
    await s.waitFor(`location.pathname === '/gallery' && location.search.includes('collage')`, { timeout: 6000 });
  });
  await s.step("effect-item", async () => {
    await home();
    await s.click({ label: "Kitty", exact: false }, { settle: 2500 }).catch(async () => s.click("Kitty", { exact: false, settle: 2500 }));
    await s.waitFor(`location.pathname === '/' && location.search.includes('sticker=')`, { timeout: 6000 });
    await openCamera(s);
    await s.waitFor(`document.body.innerText.includes('None')`, { timeout: 6000, msg: "effects panel opened for the effect" });
  });
  await s.step("effects-see-all", async () => {
    await home();
    await s.click("See all", { settle: 1500, nth: 0 });
    await s.waitFor(`location.pathname.startsWith('/home/group/')`, { timeout: 6000, msg: "group page" });
    await s.assert(`[...document.images].filter(i => i.complete && i.naturalWidth > 0).length > 3`, "group items");
  });
  await s.step("see-all-back", async () => {
    await s.click({ label: "Back" }, { settle: 1200 });
    await s.waitFor(`location.pathname === '/home'`, { timeout: 6000 });
  });
  await s.step("filter-item", async () => {
    await s.ev(scrollTo(500)); await s.sleep(700);
    await s.click("Natural", { exact: false, settle: 2500 });
    await s.waitFor(`location.pathname === '/' && location.search.includes('filter=')`, { timeout: 6000, msg: "camera with filter" });
    await openCamera(s);
    await s.waitFor(`document.body.innerText.includes('Original')`, { timeout: 6000, msg: "filter panel open" });
  });
  await s.step("scroll-feed", async () => {
    await home();
    await s.ev(scrollTo("sc.scrollHeight")); await s.sleep(1500);
    await s.waitVisible("Your photos never leave this device.", { exact: false, timeout: 3000 });
    const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
  });
}
