import { camReady, hasImg } from "../h.mjs";
export default async function flowLaunch(s) {
  await s.step("splash", async () => {
    await s.send("Page.navigate", { url: (process.env.E2E_BASE ?? "http://localhost:3612") + "/" });
    // the white splash (splash_kaji) must cover the screen until the camera reports ready
    await s.waitFor(`${hasImg("splash_kaji")} || (${camReady})`, { timeout: 20000, msg: "splash or camera" });
  });
  await s.step("camera-ready", async () => {
    await s.waitFor(camReady, { timeout: 25000, msg: "camera ready" });
    await s.assert(`!document.querySelector('img[src*="splash_kaji"]')`, "splash gone");
    await s.assert(`[...document.querySelectorAll('video')].some(v => v.videoWidth > 0) || [...document.querySelectorAll('canvas')].some(c => c.width > 0)`, "preview has frames");
    for (const t of ["Edit", "Effects", "Beauty", "Filter", "NORMAL", "VIDEO"]) await s.waitVisible(t, { timeout: 3000 });
    await s.waitVisible({ label: "home" }); await s.waitVisible({ label: "my" });
    const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
  });
}
