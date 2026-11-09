const scrollList = (y) => `(() => { const sc = [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY)).pop(); sc && sc.scrollTo(0, ${y}); })()`;
const switchState = (name) => `(() => { const b = [...document.querySelectorAll('button,[role=switch]')].find(b => b.getAttribute('aria-label') === ${JSON.stringify(name)} || b.innerText.trim() === ${JSON.stringify(name)}); return b ? (b.getAttribute('aria-checked') ?? b.getAttribute('aria-pressed') ?? '') : null; })()`;

export default async function flowMySettings(s) {
  const my = async () => s.goto("/my", { wait: `document.body.innerText.includes('About Open_Edit')`, settle: 1000 });
  await my();
  await s.step("me-tab", async () => {
    for (const t of ["Guest session", "Gallery", "Make a collage", "Settings", "Inbox", "About Open_Edit"]) await s.waitVisible(t, { exact: false });
    await s.assert(`!/log ?in|sign ?up|account settings|premium|vip/i.test(document.body.innerText)`, "no account or premium language");
    const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
  });
  await s.step("about", async () => {
    await s.click("About Open_Edit", { settle: 1200 });
    await s.waitFor(`location.pathname === '/settings/about'`, { timeout: 5000 });
    await s.waitVisible("Version", { exact: false });
    await s.click("Open-source licences", { settle: 1500 });
    await s.waitFor(`location.pathname === '/settings/about/opensource'`, { timeout: 5000 });
    await s.click({ label: "Back" }, { settle: 1200 }).catch(() => s.back());
    await s.waitFor(`location.pathname === '/settings/about'`, { timeout: 5000 });
    await s.click("Privacy", { settle: 1200 });
    await s.back(1200);
  });
  await s.step("inbox", async () => {
    await s.goto("/settings/notification", { settle: 1500 });
    for (const t of ["All", "News", "Activity"]) await s.click(t, { settle: 600 });
    await s.click({ label: "Notification settings" }, { settle: 1200 });
    await s.waitFor(`location.pathname === '/settings/notification/setting'`, { timeout: 5000 });
    // topic switches stay disabled until the browser grants notification permission (not granted headless)
    await s.waitVisible({ label: "New features and content" }, { timeout: 3000 });
    await s.assert(`Notification.permission === 'granted' || document.querySelector('[aria-label="New features and content"]').disabled`, "switch disabled without permission");
    await s.back(1200);
  });
  await s.step("camera-settings-from-more", async () => {
    await s.goto("/", { wait: `!!document.querySelector('[aria-label="Take photo"]')`, settle: 1500 });
    await s.click({ label: "More options" }, { settle: 800 }); await s.click("Camera settings", { settle: 1500 });
    await s.waitFor(`location.pathname === '/settings'`, { timeout: 5000 });
  });
  await s.step("camera-settings-rows", async () => {
    for (const t of ["Mirror front camera", "Smooth blemishes", "Grid lines", "Watermark", "Lighter makeup on male faces", "Tidy unused effects"]) {
      const b = await s.ev(switchState(t)); await s.click({ label: t }, { settle: 400 }); const a = await s.ev(switchState(t));
      if (a === b) throw new Error(`${t} did not toggle: ${b}`);
      await s.click({ label: t }, { settle: 400 });
    }
    await s.click("High resolution", { settle: 500 }); await s.click("Fast", { settle: 500 });
    // preferences are stored under the namespaced oe.* keys
    await s.assert(`Object.keys(localStorage).some(k => k.startsWith('oe.camera.')) && !Object.keys(localStorage).some(k => /^(isMirrorMode|gridPreviewMode|highResolutionMode)$/.test(k))`, "namespaced setting keys");
  });
  await s.step("clear-local-data-dialog", async () => {
    await s.ev(scrollList(2000)); await s.sleep(500);
    await s.click("Clear local data", { settle: 800 });
    await s.waitVisible("Cancel", { timeout: 3000 });
    await s.click("Cancel", { settle: 600 });
  });
  await s.step("camera-settings-close", async () => {
    await s.ev(scrollList(0)); await s.sleep(300);
    await s.click({ label: "Back" }, { settle: 1500 });
    await s.waitFor(`location.pathname === '/'`, { timeout: 5000 });
  });
}
