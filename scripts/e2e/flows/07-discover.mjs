const at = (p) => `location.pathname.startsWith(${JSON.stringify(p)})`;
const firstPost = `(() => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Open_Edit Team'); const card = b?.closest('[data-post], article, li, div'); const img = card?.querySelector('img'); const r = (img ?? b).getBoundingClientRect(); return [r.x + r.width / 2, img ? r.y + r.height / 2 : r.y - 100]; })()`;
export default async function flowDiscover(s) {
  const disc = async () => s.goto("/discover", { wait: `document.body.innerText.includes('Trending')`, settle: 1500 });
  await disc();
  await s.step("grid", async () => {
    await s.assert(`[...document.images].filter(i => i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().top < innerHeight).length > 4`, "grid images");
    for (const t of ["New", "Colour", "Creators", "Trending"]) await s.click(t, { settle: 900 });
    const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
  });
  await s.step("post-detail", async () => {
    await s.tapAt(...(await s.ev(firstPost))); await s.sleep(1500);
    await s.waitFor(at("/discover/post/"), { timeout: 6000, msg: "post route" });
    await s.waitVisible("Try", { exact: false, timeout: 4000 });
    await s.waitVisible({ label: "Share" });
  });
  await s.step("post-profile", async () => {
    await s.click("Open_Edit Team", { settle: 1500, exact: false });
    await s.waitFor(at("/discover/profile/"), { timeout: 6000, msg: "profile route" });
  });
  await s.step("profile-back", async () => {
    await s.click({ label: "Back" }, { settle: 1200 });
    await s.waitFor(at("/discover/post/"), { timeout: 6000, msg: "back to post" });
  });
  await s.step("post-try", async () => {
    await s.click("Try", { exact: false, settle: 2500 });
    await s.waitFor(`location.pathname === '/'`, { timeout: 6000, msg: "camera" });
  });
  await s.step("search", async () => {
    await disc();
    await s.click("Search looks, creators and tags", { exact: false, settle: 1200 });
    await s.waitFor(at("/discover/search"), { timeout: 6000 });
    await s.waitVisible("Trending", { exact: false, timeout: 4000 });
    await s.click({ sel: "input" }); await s.type("peach"); await s.key("Enter"); await s.sleep(1200);
    await s.assert(`document.body.innerText.toLowerCase().includes('peach')`, "results");
  });
  await s.step("search-clear", async () => {
    await s.click({ label: "Clear" }, { settle: 600 });
    await s.assert(`document.querySelector('input').value === ''`, "cleared");
  });
  await s.step("trending-keyword-and-tags", async () => {
    await s.goto("/discover/search", { settle: 1000 });
    await s.click("mint", { settle: 1200 });
    await s.assert(`document.querySelector('input').value === 'mint'`, "keyword filled");
    await s.click("Tags", { settle: 1000 });
    const tag = await s.ev(`(() => { const e = [...document.querySelectorAll('a,button,div,span')].filter(e => /^#\\S+/.test(e.innerText?.trim() ?? '') && !e.children.length && e.getBoundingClientRect().width > 0)[0]; if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    if (!tag) throw new Error("no tag result for 'mint'");
    await s.tapAt(...tag); await s.sleep(1500);
    await s.waitFor(at("/discover/tag/"), { timeout: 6000, msg: "tag page" });
  });
  await s.step("tag-back", async () => {
    await s.click({ label: "Back" }, { settle: 1200 });
    await s.waitFor(at("/discover/search"), { timeout: 6000, msg: "back to search" });
  });
  await s.step("profile-sheet", async () => {
    await s.goto("/discover/profile/openedit", { settle: 1500 });
    await s.click({ label: "More" }, { settle: 700 });
    await s.waitVisible("Share profile");
    await s.key("Escape"); await s.sleep(700);
    await s.waitFor(`!document.body.innerText.includes('Share profile')`, { timeout: 3000, msg: "sheet closed" });
  });
  await s.step("qr", async () => {
    await disc();
    await s.click({ label: "Scan a QR code" }, { settle: 2000 });
    await s.waitFor(at("/discover/qr"), { timeout: 6000 });
    await s.waitVisible({ label: "Scan from a photo" });
    await s.click({ label: "Close" }, { settle: 1200 });
    await s.waitFor(at("/discover"), { timeout: 6000 });
  });
  await s.step("create-look", async () => {
    await disc();
    await s.click("Create a look", { settle: 2500 });
    await s.waitFor(at("/lens"), { timeout: 6000 });
    await s.click("Stickers", { settle: 1500 });
    await s.waitFor(`document.querySelectorAll('a[href^="/?sticker="]').length > 0`, { timeout: 6000, msg: "built-in sticker catalogue" });
  });
  await s.step("lens-close", async () => {
    await s.key("Escape"); await s.sleep(600);
    await s.click({ label: "Close" }, { settle: 1500 });
    if (await s.exists("Discard")) await s.click("Discard", { settle: 1200 });
    await s.waitFor(`!location.pathname.startsWith('/lens')`, { timeout: 6000, msg: "left the look creator" });
  });
}
