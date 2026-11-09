import { navActive } from "../h.mjs";
// AI tools tab and the server-backed catalogues it links to (art styles), which work offline from the built-in pack.
export default async function flowAi(s) {
  await s.step("ai-tab", async () => {
    await s.goto("/ai", { settle: 1000 });
    for (const t of ["Enhance", "Remove", "Expand", "Depth blur", "Cutout", "Hair colour"]) await s.waitVisible(t, { exact: false, timeout: 4000 });
    await s.assert(navActive("/ai"), "AI tab selected");
    const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
  });
  await s.step("ai-tool-opens-picker", async () => {
    await s.click("Enhance", { exact: false, settle: 1500 });
    await s.waitFor(`location.pathname !== '/ai' || document.body.innerText.includes('Choose')`, { timeout: 6000, msg: "tool flow started" });
  });
  await s.step("aimode-route", async () => {
    await s.goto("/aimode", { settle: 2500 });
    const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
  });
  await s.step("art-styles-catalogue", async () => {
    await s.goto("/aistyle", { settle: 2000 });
    await s.waitFor(`document.querySelectorAll('[data-style]').length >= 5`, { timeout: 8000, msg: "built-in art styles listed" });
  });
  await s.step("content-api", async () => {
    const r = await s.ev(`Promise.all(['/api/music', '/api/aistyle', '/api/looks/sticker', '/api/stickers', '/api/templates'].map((u) => fetch(u).then((r) => r.status))).then((a) => a.join())`);
    if (r !== "200,200,200,200,200") throw new Error("content API statuses: " + r);
  });
}
