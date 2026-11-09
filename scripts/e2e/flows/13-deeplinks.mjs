const enc = (u) => "/s?url=" + encodeURIComponent(u);
const CASES = [
  ["gnb-home", "b612://gnb?gnb=home", `location.pathname === '/home'`],
  ["gnb-discover", "b612://gnb?gnb=discover", `location.pathname === '/discover'`],
  ["gnb-ai", "b612://gnb?gnb=ai", `location.pathname === '/ai'`],
  ["gnb-my", "b612://gnb?gnb=my", `location.pathname === '/my'`],
  ["camera-filter", "b612://go?filterid=254", `location.pathname === '/' && location.search.includes('filter=254')`],
  ["camera-sticker", "b612://previewcamera?stickerid=9000101", `location.pathname === '/' && location.search.includes('sticker=9000101')`],
  ["discover-post", "b612://discover?postid=p0_0", `location.pathname === "/discover/post/p0_0" && document.body.innerText.includes("Try")`],
  ["discover-search", "b612://discover?search", `location.pathname === '/discover/search'`],
  ["album", "b612://album", `location.pathname === '/gallery'`],
  ["qrcode", "b612://qrCode", `location.pathname === '/discover/qr'`],
  ["lens", "b612://lens", `location.pathname === '/lens'`],
  ["studio", "b612://studio", `location.pathname === '/studio'`],
  ["shop", "b612://shop", `location.pathname === '/stamp-shop'`],
  ["home", "b612://home", `location.pathname === '/home'`],
  ["aicontent", "b612://aicontent", `location.pathname === '/ai'`],
  ["aistyle", "b612://aistyle", `location.pathname === '/aistyle'`],
  ["open-notification", "b612://open?page=notification", `location.pathname === '/settings/notification'`],
  ["open-my", "b612://open?page=my", `location.pathname === '/my'`],
  ["terms", "b612://termsofuse", `location.pathname.startsWith('/settings/web')`],
  ["signup", "b612://signup", `location.pathname === '/my/login'`],
  ["purchase-no-vip", "b612://purchase", `location.pathname === '/'`],
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
  await s.step("unknown-scheme", async () => {
    await s.goto(enc("b612://nonexistent_host_xyz"), { settle: 2500 });
    await s.assert(`location.pathname !== '/s' || document.body.innerText.length > 0`, "unknown scheme handled");
  });
}
