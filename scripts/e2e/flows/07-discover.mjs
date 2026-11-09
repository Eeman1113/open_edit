const at = (p) => `location.pathname.startsWith(${JSON.stringify(p)})`;
export default async function flowDiscover(s) {
  const disc = async () => s.goto("/discover", { wait: `document.body.innerText.includes('Trending')`, settle: 1500 });
  await disc();
  await s.step("grid", async () => {
    await s.assert(`[...document.images].filter(i => i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().top < innerHeight).length > 4`, "grid images");
    for (const t of ["New", "Portrait", "Creators", "Trending"]) await s.click(t, { settle: 900 });
    const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
  });
  await s.step("post-detail", async () => {
    const p = await s.locate("Peach glow");
    await s.tapAt(p.x, p.y - 100); await s.sleep(1500);
    await s.waitFor(at("/discover/post/"), { timeout: 6000, msg: "post route" });
    await s.waitVisible("Try", { timeout: 4000 });
    await s.waitVisible({ label: "Share" });
  });
  await s.step("post-profile", async () => {
    await s.click("b612_official", { settle: 1500, exact: false });
    await s.waitFor(at("/discover/profile/"), { timeout: 6000, msg: "profile route" });
  });
  await s.step("profile-back", async () => {
    // close a sheet if still open, then back
    if (await s.exists("Cancel")) await s.click("Cancel");
    await s.click({ label: "Back" }, { settle: 1200 });
    await s.waitFor(at("/discover/post/"), { timeout: 6000, msg: "back to post" });
  });
  await s.step("post-try", async () => {
    await s.click("Try", { settle: 2500 });
    await s.waitFor(`location.pathname === '/'`, { timeout: 6000, msg: "camera" });
  });
  await s.step("search", async () => {
    await disc();
    await s.click("Search Filters, Creators", { settle: 1200 });
    await s.waitFor(at("/discover/search"), { timeout: 6000 });
    await s.waitVisible("Trending searches", { timeout: 4000 });
    await s.click({ sel: "input" }); await s.type("glow"); await s.sleep(1200);
    await s.assert(`document.body.innerText.toLowerCase().includes('glow')`, "results");
  });
  await s.step("search-clear-cancel", async () => {
    await s.click({ label: "Clear" }, { settle: 600 });
    await s.waitVisible("Trending searches", { timeout: 4000 });
  });
  await s.step("tag", async () => {
    await s.goto("/discover/search", { wait: `document.body.innerText.includes('Trending searches')`, settle: 1000 });
    // trending keyword → fills the search box → "Tag" results tab → tag page
    await s.click("cotton", { settle: 1200 });
    await s.assert(`document.querySelector('input').value === 'cotton'`, "keyword filled");
    await s.click("Tag", { settle: 1000 });
    const tag = await s.ev(`(() => { const e = [...document.querySelectorAll('div,span,button')].filter(e => /^#\\S+/.test(e.innerText?.trim() ?? '') && !e.children.length && e.getBoundingClientRect().left >= 0 && e.getBoundingClientRect().left < innerWidth)[0]; if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    if (!tag) throw new Error("no tag result for 'cotton'");
    await s.tapAt(...tag); await s.sleep(1500);
    await s.waitFor(at("/discover/tag/"), { timeout: 6000, msg: "tag page" });
    await s.assert(`[...document.images].filter(i => i.complete && i.naturalWidth > 0).length > 1`, "tag posts");
  });
  await s.step("tag-back", async () => {
    await s.click({ label: "Back" }, { settle: 1200 });
    await s.waitFor(at("/discover/search"), { timeout: 6000, msg: "back to search" });
  });
  await s.step("profile-sheet-cancel", async () => {
    await s.goto("/discover/profile/b612_official", { settle: 1500 });
    await s.click({ label: "More" }, { settle: 700 });
    await s.waitVisible("Share profile");
    await s.click("Cancel", { settle: 700 });
    await s.waitFor(`!document.body.innerText.includes('Share profile')`, { timeout: 3000, msg: "sheet closed" });
  });
  await s.step("qr", async () => {
    await disc();
    await s.click({ label: "QR" }, { settle: 2000 });
    await s.waitFor(at("/discover/qr"), { timeout: 6000 });
    await s.waitVisible({ label: "Gallery" });
    await s.click({ label: "Close" }, { settle: 1200 });
    await s.waitFor(at("/discover"), { timeout: 6000 });
  });
  await s.step("profile-btn", async () => {
    await disc();
    await s.click({ label: "Profile" }, { settle: 1500 });
    await s.waitFor(`location.pathname === '/my'`, { timeout: 6000 });
  });
  await s.step("create-lens", async () => {
    await disc();
    await s.click("Create", { settle: 2500 });
    await s.waitFor(at("/lens"), { timeout: 6000 });
    await s.waitVisible({ label: "Close" }, { timeout: 6000 });
  });
  await s.step("lens-close", async () => {
    await s.click({ label: "Close" }, { settle: 1500 });
    if (await s.exists("Exit", { exact: false })) await s.click("Exit", { exact: false, settle: 1200 });
    await s.waitFor(`!location.pathname.startsWith('/lens')`, { timeout: 6000, msg: "left lens" });
  });
}
