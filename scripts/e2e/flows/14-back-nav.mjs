import { openCamera, camReady, nthThumb, reviewUp, TEST_PHOTO, importToGallery, navTab } from "../h.mjs";
const at = (p) => `location.pathname === ${JSON.stringify(p)}`;
export default async function flowBackNav(s) {
  await openCamera(s, { fresh: true });
  await s.step("tabs-history-back", async () => {
    await s.click(navTab("/home"), { settle: 1200 }); await s.waitFor(at("/home"), { timeout: 5000, msg: "home tab" });
    await s.click(navTab("/discover"), { settle: 1200 }); await s.waitFor(at("/discover"), { timeout: 5000, msg: "discover tab" });
    await s.back(1200); await s.waitFor(at("/home"), { timeout: 5000, msg: "back → home" });
    await s.back(1500); await s.waitFor(at("/"), { timeout: 5000, msg: "back → camera" });
    await s.waitFor(camReady, { timeout: 15000, msg: "camera ready again" });
  });
  await s.step("settings-back", async () => {
    await s.click({ label: "More options" }, { settle: 800 }); await s.click("Camera settings", { settle: 1500 });
    await s.waitFor(at("/settings"), { timeout: 5000 });
    await s.click({ label: "Back" }, { settle: 1500 });
    await s.waitFor(at("/"), { timeout: 5000 });
    await s.waitFor(camReady, { timeout: 15000, msg: "camera ready again" });
  });
  await s.step("review-escape", async () => {
    await s.click({ label: "Take photo" }, { settle: 300 });
    await s.waitFor(reviewUp, { timeout: 10000 });
    await s.sleep(500);
    await s.key("Escape"); await s.sleep(600);
    if (await s.exists("Discard")) await s.click("Discard", { settle: 800 });
    await s.waitFor(`!(${reviewUp})`, { timeout: 4000, msg: "review closed by back" });
  });
  await s.step("gallery-close", async () => {
    await s.click({ label: "Open gallery" }, { settle: 1500 });
    await s.waitFor(at("/gallery"), { timeout: 5000 });
    await s.click({ label: "Close" }, { settle: 1500 });
    await s.waitFor(at("/"), { timeout: 5000 });
  });
  await s.step("gallery-escape", async () => {
    await s.goto("/home", { settle: 800 }); await s.goto("/gallery", { settle: 1500 });
    await s.key("Escape"); await s.sleep(1200);
    await s.assert(`location.pathname !== '/gallery'`, "escape leaves the gallery");
  });
  await s.step("editor-back", async () => {
    await importToGallery(s, [TEST_PHOTO]);
    await s.tapAt(...(await s.ev(nthThumb(0)))); await s.sleep(3000);
    await s.waitFor(at("/edit"), { timeout: 6000 });
    await s.click({ label: "Back" }, { settle: 1500 });
    if (await s.exists("Discard", { exact: false })) await s.click("Discard", { exact: false, settle: 1000 });
    await s.waitFor(at("/gallery"), { timeout: 5000 });
  });
  await s.step("collage-back", async () => {
    await s.goto("/gallery?mode=collage", { settle: 1500 });
    for (const n of [0, 1]) { const p = await s.ev(nthThumb(n)); if (p) { await s.tapAt(p[0] - 20, p[1] - 20); await s.sleep(400); } }
    await s.click("Next", { settle: 2500 });
    await s.waitFor(at("/collage"), { timeout: 6000 });
    await s.click({ label: "Back" }, { settle: 1500 });
    for (const t of ["Leave", "Discard"]) if (await s.exists(t)) { await s.click(t, { settle: 1200 }); break; }
    await s.waitFor(`location.pathname === '/gallery'`, { timeout: 5000, msg: "collage back → gallery" });
  });
  await s.step("post-close", async () => {
    await s.goto("/discover/post/p0_0", { settle: 1500 });
    await s.click({ label: "Close" }, { settle: 1200 }).catch(() => s.click({ label: "Back" }, { settle: 1200 }));
    await s.waitFor(`!location.pathname.startsWith('/discover/post/')`, { timeout: 5000 });
  });
  await s.step("search-back", async () => {
    await s.goto("/discover", { settle: 1200 });
    await s.click("Search looks, creators and tags", { exact: false, settle: 1200 });
    await s.click({ label: "Back" }, { settle: 1200 });
    await s.waitFor(at("/discover"), { timeout: 5000 });
  });
  await s.step("home-group-back", async () => {
    await s.goto("/home", { settle: 1500 });
    await s.click("See all", { settle: 1500, nth: 0 });
    await s.waitFor(`location.pathname.startsWith('/home/group/')`, { timeout: 5000 });
    await s.back(1200);
    await s.waitFor(at("/home"), { timeout: 5000, msg: "browser back → home" });
  });
  await s.step("about-back-chain", async () => {
    await s.goto("/my", { settle: 1200 });
    await s.click("About Open_Edit", { settle: 1200 });
    await s.click("Open-source licences", { settle: 1500 });
    await s.click({ label: "Back" }, { settle: 1200 });
    await s.waitFor(at("/settings/about"), { timeout: 5000 });
    await s.click({ label: "Back" }, { settle: 1200 });
    await s.waitFor(at("/my"), { timeout: 5000 });
  });
}
