import { openCamera } from "../h.mjs";
export default async function flowHome(s) {
  const home = async () => { await s.goto("/home", { wait: `document.body.innerText.includes('Effects')`, settle: 1200 }); };
  await home();
  await s.step("feed", async () => {
    for (const t of ["Camera", "Edit", "AI", "Effects", "Filters"]) await s.waitVisible(t, { timeout: 4000 });
    await s.assert(`[...document.images].filter(i => i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().top < innerHeight).length > 5`, "feed images loaded");
    const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
  });
  await s.step("shortcut-camera", async () => {
    await s.click("Camera", { settle: 1500 });
    await s.waitFor(`location.pathname === '/'`, { timeout: 6000 });
    await openCamera(s);
  });
  await s.step("shortcut-edit", async () => {
    await home(); await s.click("Edit", { settle: 1500 });
    await s.waitFor(`location.pathname === '/gallery'`, { timeout: 6000 });
  });
  await s.step("shortcut-ai", async () => {
    await home(); await s.click("AI", { settle: 1500, nth: 0 });
    await s.waitFor(`location.pathname === '/ai'`, { timeout: 6000 });
  });
  await s.step("effect-item", async () => {
    await home();
    const p = await s.locate("Glow Up"); // only the thumbnail above the title is clickable
    await s.tapAt(p.x, p.y - 80); await s.sleep(2500);
    await s.waitFor(`location.pathname === '/' && location.search.includes('sticker=')`, { timeout: 6000 });
    await openCamera(s);
    await s.waitFor(`!!document.querySelector('[aria-label=none]')`, { timeout: 6000, msg: "effects panel opened for the sticker" });
  });
  await s.step("effects-see-all", async () => {
    await home();
    const p = await s.locate("Effects");
    await s.tapAt(365, p.y); await s.sleep(1500);
    await s.waitFor(`location.pathname.startsWith('/home/group/')`, { timeout: 6000, msg: "group page" });
    await s.assert(`[...document.images].filter(i => i.complete && i.naturalWidth > 0).length > 3`, "group items");
  });
  await s.step("see-all-back", async () => {
    await s.click({ label: "back" }, { settle: 1200 }).catch(async () => { await s.click({ label: "Back" }, { settle: 1200 }); });
    await s.waitFor(`location.pathname === '/home'`, { timeout: 6000 });
  });
  await s.step("filter-item", async () => {
    await s.ev(`(() => { const sc = [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 200 && /auto|scroll/.test(getComputedStyle(e).overflowY)); sc && sc.scrollTo(0, 500); })()`);
    await s.sleep(700);
    const p = await s.locate("Filters");
    await s.tapAt(120, p.y + 120); await s.sleep(2500);
    await s.waitFor(`location.pathname === '/' && location.search.includes('filter=')`, { timeout: 6000, msg: "camera with filter" });
    await openCamera(s);
    await s.waitFor(`document.body.innerText.includes('Original')`, { timeout: 6000, msg: "filter panel open" });
  });
  await s.step("scroll-feed", async () => {
    await home();
    await s.ev(`(() => { const sc = [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 200 && /auto|scroll/.test(getComputedStyle(e).overflowY)); sc && sc.scrollTo(0, sc.scrollHeight); })()`);
    await s.sleep(1500);
    const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
  });
}
