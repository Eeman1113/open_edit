import { openCamera, camReady } from "../h.mjs";
const active = (id) => `document.querySelector('nav a[aria-current=page]')?.getAttribute('aria-label') === '${id}'`;
export default async function flowGnbTabs(s) {
  await openCamera(s, { fresh: true });
  for (const [tab, path, check] of [
    ["home", "/home", `document.body.innerText.includes('Effects')`],
    ["discover", "/discover", `document.body.innerText.includes('Trending')`],
    ["ai", "/ai", `!!document.querySelector('iframe[data-aimode]')`],
    ["my", "/my", `document.body.innerText.includes('About B612')`],
    ["camera", "/", camReady],
  ]) {
    await s.step(`tab-${tab}`, async () => {
      await s.click({ label: tab }, { settle: 1500 });
      await s.waitFor(`location.pathname === '${path}'`, { timeout: 8000, msg: `route ${path}` });
      await s.waitFor(check, { timeout: 10000, msg: `${tab} content` });
      if (tab !== "camera") await s.assert(active(tab), `${tab} tab highlighted`);
      const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
    });
  }
  await s.step("reselect-home-scrolltop", async () => {
    await s.click({ label: "home" }, { settle: 1500 });
    await s.ev(`(() => { const sc = [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 200 && /auto|scroll/.test(getComputedStyle(e).overflowY)); sc && sc.scrollTo(0, 800); window.__sc = sc; })()`);
    await s.sleep(400);
    await s.click({ label: "home" }, { settle: 1200 });
    await s.waitFor(`!window.__sc || window.__sc.scrollTop < 5`, { timeout: 3000, msg: "home scrolled to top on reselect" });
  });
}
