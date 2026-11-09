// App links (openedit://…) resolved by /s?url=… (src/components/scheme/dispatch.ts).
const enc = (u) => "/s?url=" + encodeURIComponent(u);
const CASES = [
  ["tab-home", "openedit://home", `location.pathname === '/home'`],
  ["tab-discover", "openedit://discover", `location.pathname === '/discover'`],
  ["tab-ai", "openedit://ai", `location.pathname === '/ai'`],
  ["tab-me", "openedit://me", `location.pathname === '/my'`],
  ["camera-filter", "openedit://camera?filter=4", `location.pathname === '/' && location.search.includes('filter=4')`],
  ["camera-sticker", "openedit://camera?sticker=103", `location.pathname === '/' && location.search.includes('sticker=103')`],
  ["discover-post", "openedit://discover?post=p0_0", `location.pathname === "/discover/post/p0_0" && document.body.innerText.includes("Try")`],
  ["discover-search", "openedit://discover?search", `location.pathname === '/discover/search'`],
  ["gallery", "openedit://gallery", `location.pathname === '/gallery'`],
  ["collage", "openedit://collage", `location.pathname === '/gallery' && location.search.includes('collage')`],
  ["qr", "openedit://qr", `location.pathname === '/discover/qr'`],
  ["lens", "openedit://lens", `location.pathname === '/lens'`],
  ["studio", "openedit://studio", `location.pathname === '/studio'`],
  ["shop", "openedit://shop", `location.pathname === '/stamp-shop'`],
  ["ai-tool", "openedit://ai?tool=enhance", `location.pathname === '/aimode'`],
  ["aistyle", "openedit://aistyle", `location.pathname === '/aistyle'`],
  ["notifications", "openedit://notifications", `location.pathname === '/settings/notification'`],
  ["settings", "openedit://settings", `location.pathname === '/settings'`],
  ["web", "openedit://web?url=https%3A%2F%2Fexample.com", `location.pathname.startsWith('/settings/web')`],
  ["plain-path", "/discover", `location.pathname === '/discover'`],
];
export default async function flowDeeplinks(s) {
  for (const [name, url, check] of CASES) {
    await s.step(name, async () => {
      await s.goto(enc(url), { settle: 300 });
      await s.waitFor(check, { timeout: 12000, msg: `${url} → ${check}` });
      await s.sleep(1200);
      const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
    });
  }
  await s.step("unknown-page", async () => {
    await s.goto(enc("openedit://nonexistent_page_xyz"), { settle: 2500 });
    await s.assert(`location.pathname === '/'`, "unknown page falls back to the camera");
  });
  await s.step("foreign-scheme", async () => {
    await s.goto(enc("javascript:alert(1)"), { settle: 2000 });
    await s.assert(`location.pathname === '/' || location.pathname === '/s'`, "non-app scheme ignored");
  });
}
