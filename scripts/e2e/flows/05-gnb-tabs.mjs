import { openCamera, camReady, navTab, navActive } from "../h.mjs";
export default async function flowGnbTabs(s) {
  await openCamera(s, { fresh: true });
  for (const [tab, path, check] of [
    ["Home", "/home", `document.body.innerText.includes('Effects')`],
    ["Discover", "/discover", `document.body.innerText.includes('Trending')`],
    ["AI tools", "/ai", `document.body.innerText.includes('Enhance')`],
    ["Me", "/my", `document.body.innerText.includes('About Open_Edit')`],
    ["Camera", "/", camReady],
  ]) {
    await s.step(`tab-${tab.toLowerCase().replace(/\W+/g, "-")}`, async () => {
      await s.click(navTab(path), { settle: 1500 });
      await s.waitFor(`location.pathname === '${path}'`, { timeout: 8000, msg: `route ${path}` });
      await s.waitFor(check, { timeout: 10000, msg: `${tab} content` });
      if (tab !== "Camera") await s.assert(navActive(path), `${tab} tab highlighted`);
      const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
    });
  }
  await s.step("reselect-home-scrolltop", async () => {
    await s.click(navTab("/home"), { settle: 1500 });
    await s.ev(`(() => { const sc = [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 200 && /auto|scroll/.test(getComputedStyle(e).overflowY)); sc && sc.scrollTo(0, 800); window.__sc = sc; })()`);
    await s.sleep(400);
    await s.click(navTab("/home"), { settle: 1200 });
    await s.waitFor(`!window.__sc || window.__sc.scrollTop < 5`, { timeout: 3000, msg: "home scrolled to top on reselect" });
  });
}
