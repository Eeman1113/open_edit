import { BASE_URL } from "../lib.mjs";
import { camReady, splashUp, SHUTTER, navTab } from "../h.mjs";
export default async function flowLaunch(s) {
  await s.step("splash", async () => {
    await s.send("Page.navigate", { url: BASE_URL + "/" });
    // the launch screen covers the camera until it reports ready
    await s.waitFor(`(${splashUp}) || (${camReady})`, { timeout: 20000, msg: "launch screen or camera" });
  });
  await s.step("camera-ready", async () => {
    await s.waitFor(camReady, { timeout: 25000, msg: "camera ready" });
    await s.assert(`!!(${SHUTTER})`, "shutter");
    await s.assert(`[...document.querySelectorAll('video')].some(v => v.videoWidth > 0) || [...document.querySelectorAll('canvas')].some(c => c.width > 0)`, "preview has frames");
    for (const t of ["Filters", "Beauty", "Effects", "Photo", "Video"]) await s.waitVisible(t, { timeout: 3000 });
    for (const l of ["Open gallery", "Switch camera", "More options"]) await s.waitVisible({ label: l }, { timeout: 3000 });
    for (const h of ["/home", "/discover", "/ai", "/my"]) await s.waitVisible(navTab(h), { timeout: 3000 });
    const a = await s.visualAudit(); if (a.length) throw new Error("visual: " + a.join("; "));
  });
}
