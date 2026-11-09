import { openCamera, camReady, nthThumb } from "../h.mjs";
const at = (p) => `location.pathname === ${JSON.stringify(p)}`;
export default async function flowBackNav(s) {
  await openCamera(s, { fresh: true });
  await s.step("tabs-history-back", async () => {
    await s.click({ label: "home" }, { settle: 1200 }); await s.waitFor(at("/home"), { timeout: 5000, msg: "home tab" });
    await s.click({ label: "discover" }, { settle: 1200 }); await s.waitFor(at("/discover"), { timeout: 5000, msg: "discover tab" });
    await s.back(1200); await s.waitFor(at("/home"), { timeout: 5000, msg: "back → home" });
    await s.back(1500); await s.waitFor(at("/"), { timeout: 5000, msg: "back → camera" });
    await s.waitFor(camReady, { timeout: 15000, msg: "camera ready again" });
  });
  await s.step("bell-back", async () => {
    await s.click({ label: "notifications" }, { settle: 1500 });
    await s.waitFor(at("/settings/notification"), { timeout: 5000 });
    await s.click({ label: "Back" }, { settle: 1500 });
    await s.waitFor(at("/"), { timeout: 5000 });
    await s.waitFor(camReady, { timeout: 15000, msg: "camera ready again" });
  });
  await s.step("settings-close", async () => {
    await s.click("More", { settle: 800 }); await s.click("Settings", { settle: 1500 });
    await s.waitFor(at("/settings"), { timeout: 5000 });
    await s.click({ label: "Close" }, { settle: 1500 });
    await s.waitFor(at("/"), { timeout: 5000 });
    await s.waitFor(camReady, { timeout: 15000, msg: "camera ready again" });
  });
  await s.step("confirm-escape", async () => {
    await s.click({ label: "shutter" }, { settle: 300 });
    await s.waitFor(`!!document.querySelector('[aria-label=save]')`, { timeout: 10000 });
    await s.sleep(500);
    await s.key("Escape");
    await s.waitFor(`!document.querySelector('[aria-label=save]')`, { timeout: 4000, msg: "confirm closed by back" });
  });
  await s.step("gallery-close", async () => {
    await s.click("Edit", { settle: 1500 });
    await s.waitFor(at("/gallery"), { timeout: 5000 });
    await s.click({ label: "Close" }, { settle: 1500 });
    await s.waitFor(at("/"), { timeout: 5000 });
  });
  await s.step("gallery-escape", async () => {
    await s.goto("/gallery?__seed=1", { settle: 5000 });
    await s.goto("/home", { settle: 800 }); await s.goto("/gallery", { settle: 1500 });
    await s.key("Escape"); await s.sleep(1200);
    await s.assert(`location.pathname !== '/gallery'`, "escape leaves the gallery");
  });
  await s.step("editor-back", async () => {
    await s.goto("/gallery", { settle: 1500 });
    await s.tapAt(...(await s.ev(nthThumb(2)))); await s.sleep(3000);
    await s.waitFor(at("/edit"), { timeout: 6000 });
    await s.click({ label: "Back" }, { settle: 1500 });
    await s.waitFor(at("/gallery"), { timeout: 5000 });
  });
  await s.step("editor-back-with-changes", async () => {
    await s.tapAt(...(await s.ev(nthThumb(2)))); await s.sleep(3000);
    await s.waitFor(at("/edit"), { timeout: 6000 });
    await s.ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Filters' && b.getBoundingClientRect().top > 780); b.click(); })()`); await s.sleep(1200);
    await s.click("Daily", { settle: 1200 });
    await s.click({ label: "Back" }, { settle: 1200 });
    const t = (await s.locate("Leave")) ?? (await s.locate("Discard", { exact: false })) ?? (await s.locate("OK")) ?? (await s.locate("Yes"));
    if (t) { await s.tapAt(t.x, t.y); await s.sleep(1200); }
    await s.waitFor(at("/gallery"), { timeout: 5000, msg: "left the editor" });
  });
  await s.step("video-editor-back", async () => {
    if ((await s.ev("location.pathname")) !== "/gallery") await s.goto("/gallery", { settle: 1500 });
    await s.click("Videos", { settle: 1200 });
    const cell = await s.locate("01:15", { exact: false });
    await s.tapAt(cell.x, cell.y - 30); await s.sleep(4000);
    await s.waitFor(at("/video-edit"), { timeout: 6000 });
    await s.click({ label: "Back" }, { settle: 1500 });
    await s.waitFor(at("/gallery"), { timeout: 5000, msg: "video editor back → gallery" });
  });
  await s.step("collage-back", async () => {
    await s.goto("/gallery", { settle: 1200 });
    await s.click("Layout", { settle: 1200 });
    for (const n of [0, 2]) { const p = await s.ev(nthThumb(n)); await s.tapAt(p[0] - 20, p[1] - 20); await s.sleep(400); }
    await s.click("NEXT", { settle: 2500 });
    await s.waitFor(at("/collage"), { timeout: 6000 });
    await s.click({ label: "Back" }, { settle: 1500 });
    await s.waitVisible("Are you sure you want to leave without saving?", { timeout: 3000 });
    await s.click("Leave", { settle: 1200 });
    await s.waitFor(`location.pathname === '/gallery'`, { timeout: 5000, msg: "collage back → gallery" });
  });
  await s.step("post-close", async () => {
    await s.goto("/discover", { settle: 1500 });
    const p = await s.locate("Peach glow"); await s.tapAt(p.x, p.y - 100); await s.sleep(1500);
    await s.click({ label: "Close" }, { settle: 1200 });
    await s.waitFor(at("/discover"), { timeout: 5000 });
  });
  await s.step("search-cancel", async () => {
    await s.click("Search Filters, Creators", { settle: 1200 });
    await s.click("Cancel", { settle: 1200 });
    await s.waitFor(at("/discover"), { timeout: 5000 });
  });
  await s.step("home-group-back", async () => {
    await s.goto("/home", { settle: 1500 });
    const p = await s.locate("Effects"); await s.tapAt(365, p.y); await s.sleep(1500);
    await s.waitFor(`location.pathname.startsWith('/home/group/')`, { timeout: 5000 });
    await s.back(1200);
    await s.waitFor(at("/home"), { timeout: 5000, msg: "browser back → home" });
  });
  await s.step("about-back-chain", async () => {
    await s.goto("/my", { settle: 1200 });
    await s.click("About B612", { settle: 1200 });
    await s.click("Open Source License", { settle: 1500 });
    await s.click({ label: "Back" }, { settle: 1200 });
    await s.waitFor(at("/settings/about"), { timeout: 5000 });
    await s.click({ label: "Back" }, { settle: 1200 });
    await s.waitFor(at("/my"), { timeout: 5000 });
  });
}
