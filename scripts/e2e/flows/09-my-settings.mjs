const stubOpen = `(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; navigator.share = undefined; })()`;
const scrollList = (y) => `(() => { const sc = [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY)).pop(); sc && sc.scrollTo(0, ${y}); })()`;
const switches = `JSON.stringify([...document.querySelectorAll('img')].filter(i => /switch|radio|toggle|btn_check|btn_float/i.test(i.src)).map(i => i.src.split('/').pop()))`;

export default async function flowMySettings(s) {
  const my = async () => s.goto("/my", { wait: `document.body.innerText.includes('About B612')`, settle: 1000 });
  await my();
  await s.step("my-tab", async () => {
    for (const t of ["Login", "Account settings", "About B612", "FAQ", "Inquiry"]) await s.waitVisible(t);
    const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
  });
  await s.step("login", async () => {
    await s.click("Login", { settle: 1200 });
    await s.waitFor(`location.pathname === '/my/login'`, { timeout: 5000 });
    await s.click("Other login methods", { settle: 1100 }); // taps are throttled to one per second (yvl.c(1000))
    await s.click("Login with Google", { settle: 900 });
    await s.waitFor(`/error|network|try again|unknown/i.test(document.body.innerText)`, { timeout: 4000, msg: "login error dialog" });
    if (await s.exists("OK")) await s.click("OK", { settle: 600 });
  });
  await s.step("login-terms", async () => {
    await s.click("Terms of use", { exact: false, settle: 1500 });
    await s.waitFor(`location.pathname.startsWith('/settings/web')`, { timeout: 5000, msg: "in-app web view" });
    await s.back(1200);
    await s.waitFor(`location.pathname === '/my/login'`, { timeout: 5000 });
  });
  await s.step("login-back", async () => {
    await s.click({ label: "Back" }, { settle: 1200 });
    await s.waitFor(`location.pathname === '/my'`, { timeout: 5000 });
  });
  await s.step("account-settings-guest", async () => {
    await s.click("Account settings", { settle: 1200 });
    await s.waitFor(`location.pathname === '/my/login'`, { timeout: 5000, msg: "guest → login" });
    await s.click({ label: "Back" }, { settle: 1200 });
  });
  await s.step("about", async () => {
    await my(); await s.click("About B612", { settle: 1200 });
    await s.waitFor(`location.pathname === '/settings/about'`, { timeout: 5000 });
    await s.waitVisible("Version", { exact: false });
    await s.click("Open Source License", { settle: 1500 });
    await s.waitFor(`location.pathname === '/settings/about/opensource'`, { timeout: 5000 });
    await s.click({ label: "Back" }, { settle: 1200 }).catch(() => s.back());
    await s.waitFor(`location.pathname === '/settings/about'`, { timeout: 5000 });
    await s.click("Special Thanks", { settle: 1200 });
    await s.back(1200);
    await s.click("Privacy policy", { settle: 1200 });
    await s.waitFor(`location.pathname.startsWith('/settings/web')`, { timeout: 5000 });
    await s.back(1200);
  });
  await s.step("faq-inquiry", async () => {
    await my(); await s.click("FAQ", { settle: 1500 });
    await s.waitFor(`location.pathname.startsWith('/settings/web')`, { timeout: 5000 });
    await s.click({ label: "Back" }, { settle: 1200 }).catch(() => s.back());
    await s.waitFor(`location.pathname === '/my'`, { timeout: 5000 });
    await s.click("Inquiry", { settle: 1500 });
    await s.waitFor(`location.pathname.startsWith('/settings/web')`, { timeout: 5000 });
    await s.back(1200);
  });
  await s.step("account-page", async () => {
    await s.goto("/settings/account", { settle: 1200 });
    for (const t of ["Username", "Nickname", "Log out", "Delete account", "Facebook", "Google", "Apple", "LINE", "NAVER"]) await s.waitVisible(t, { timeout: 3000 });
  });
  await s.step("name-edit", async () => {
    await s.click("Nickname", { settle: 1200 });
    await s.waitFor(`location.pathname === '/my/name'`, { timeout: 5000 });
    await s.click({ sel: "input" }); await s.type("Eeman QA");
    await s.assert(`document.querySelector('input').value === 'Eeman QA'`, "typed");
    await s.click("OK", { settle: 1200, nth: 0 });
    // guest: the profile API is unavailable → the original "Unknown Error" dialog, screen stays
    await s.waitVisible("OK", { timeout: 4000 });
    await s.waitFor(`/Unknown Error|saved/i.test(document.body.innerText) || location.pathname !== '/my/name'`, { timeout: 5000, msg: "name save result" });
    if (await s.exists("Unknown Error.", { exact: false })) await s.click("OK", { settle: 600 });
    await s.click({ label: "Back" }, { settle: 1000 });
  });
  await s.step("bio-edit", async () => {
    await s.goto("/my/biography", { settle: 1200 });
    await s.click("Please enter your bio.", { exact: false }).catch(() => s.click({ sel: "textarea" }));
    await s.type("hello from e2e");
    await s.waitFor(`/14\\/100/.test(document.body.innerText)`, { timeout: 3000, msg: "counter 14/100" });
    await s.click("OK", { settle: 1200 });
    await s.waitFor(`/Unknown Error/i.test(document.body.innerText) || location.pathname !== '/my/biography'`, { timeout: 5000, msg: "bio save result" });
    if (await s.exists("Unknown Error.", { exact: false })) await s.click("OK", { settle: 600, nth: 0 });
    await s.click("Cancel", { settle: 1000 });
    await s.waitFor(`location.pathname !== '/my/biography'`, { timeout: 5000, msg: "bio closed" });
  });
  await s.step("notification", async () => {
    await s.goto("/settings/notification", { settle: 1500 });
    for (const t of ["All", "Purchase", "Activity"]) await s.click(t, { settle: 600 });
    await s.click({ label: "Notification settings" }, { settle: 1200 });
    await s.waitFor(`location.pathname === '/settings/notification/setting'`, { timeout: 5000 });
    const row = `[...document.querySelectorAll('svg rect[rx="14"]')].map(r => r.getAttribute('fill')).join()`;
    const before = await s.ev(row);
    await s.click({ sel: 'li svg' }, { settle: 900 });
    if (await s.exists("OK")) await s.click("OK", { settle: 600 });
    const after = await s.ev(row);
    if (before === after) throw new Error("product updates switch did not change: " + before);
    await s.click({ sel: 'li svg' }, { settle: 700 });
    await s.back(1200);
  });
  await s.step("camera-settings-from-more", async () => {
    await s.goto("/", { wait: `!!document.querySelector('[aria-label=shutter]')`, settle: 1500 });
    await s.click("More", { settle: 800 }); await s.click("Settings", { settle: 1500 });
    await s.waitFor(`location.pathname === '/settings'`, { timeout: 5000 });
  });
  await s.step("camera-settings-rows", async () => {
    await s.ev(stubOpen);
    for (const t of ["Mirror mode", "Blemish removal", "Grid", "B612 mark", "Makeup for male faces", "Sticker storage optimization"]) {
      const b = await s.ev(switches); await s.click(t, { settle: 500 }); const a = await s.ev(switches);
      if (a === b) throw new Error(`${t} did not toggle: ${b}`);
      await s.click(t, { settle: 500 });
    }
    await s.click("High resolution", { settle: 500 }); await s.click("High-speed shooting", { settle: 500 });
    await s.ev(scrollList(2000)); await s.sleep(600);
    for (const t of ["Write a Review", "Share with friends", "B612@Instagram", "SODA", "Foodie", "EPIK"]) {
      if (!(await s.exists(t))) { await s.ev(scrollList(4000)); await s.sleep(400); }
      await s.click(t, { settle: 700 });
      if (await s.exists("Cancel")) await s.click("Cancel", { settle: 500 });
    }
    const opened = await s.ev(`window.__opened.length`);
    if (opened < 4) throw new Error(`external rows opened only ${opened} links`);
  });
  await s.step("camera-settings-close", async () => {
    await s.ev(scrollList(0)); await s.sleep(300);
    await s.click({ label: "Close" }, { settle: 1500 });
    await s.waitFor(`location.pathname === '/'`, { timeout: 5000 });
  });
}
