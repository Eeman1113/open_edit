export default async function flowAi(s) {
  await s.step("ai-tab", async () => {
    await s.goto("/ai", { settle: 1000 });
    await s.assert(`!!document.querySelector('iframe[data-aimode]')`, "AI webview");
    await s.assert(`document.querySelector('nav a[aria-current=page]')?.getAttribute('aria-label') === 'ai'`, "AI tab selected");
    // the page either finishes (iframe visible) or shows the original NetworkErrorDialog
    await s.waitFor(`getComputedStyle(document.querySelector('iframe[data-aimode]')).visibility === 'visible' || document.body.innerText.includes('Retry')`, { timeout: 25000, msg: "AI page loaded or error state" });
  });
  await s.step("ai-error-retry", async () => {
    await s.goto("/ai?__state=error", { settle: 1000 });
    await s.waitVisible("Retry", { timeout: 4000, exact: false });
    await s.click("Retry", { exact: false, settle: 1500 });
  });
  await s.step("aimode-route", async () => {
    await s.goto("/aimode", { settle: 2500 });
    const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
  });
}
