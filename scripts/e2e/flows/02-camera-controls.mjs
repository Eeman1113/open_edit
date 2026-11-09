import { openCamera, textOn, camReady } from "../h.mjs";

const label = (prefix) => `[...document.querySelectorAll('button[aria-label]')].map(b => b.getAttribute('aria-label')).find(l => l.startsWith(${JSON.stringify(prefix)})) ?? ''`;
const checked = (name) => `document.querySelector('[role=switch][aria-label=${JSON.stringify(name)}]')?.getAttribute('aria-checked') ?? ''`;
const PREVIEW = [195, 330]; // empty preview area (tap closes panels)

export default async function flowCameraControls(s) {
  await openCamera(s, { fresh: true });

  await s.step("more-panel", async () => {
    await s.click({ label: "More options" });
    for (const t of ["Tap to shoot", "Makeup", "Night light", "Auto-save", "Camera settings"]) await s.waitVisible(t, { timeout: 3000 });
    const before = await s.ev(checked("Auto-save"));
    await s.click("Auto-save", { settle: 500 });
    const after = await s.ev(checked("Auto-save"));
    if (before === after) throw new Error(`Auto-save did not toggle (${before})`);
    await s.click("Auto-save", { settle: 500 });
    await s.tapAt(...PREVIEW); await s.sleep(700);
    await s.waitFor(`!${textOn("Camera settings")}`, { timeout: 3000, msg: "more closed" });
  });

  await s.step("flash-cycle", async () => {
    const seen = new Set([await s.ev(label("Flash"))]);
    for (let i = 0; i < 3; i++) { await s.click({ label: await s.ev(label("Flash")) }, { settle: 400 }); seen.add(await s.ev(label("Flash"))); }
    if (seen.size < 2) throw new Error("flash never changed: " + [...seen]);
    for (let i = 0; i < 4 && (await s.ev(label("Flash"))) !== "Flash: off"; i++) await s.click({ label: await s.ev(label("Flash")) }, { settle: 400 });
  });

  await s.step("timer-cycle", async () => {
    const seen = [];
    for (let i = 0; i < 4; i++) {
      seen.push(await s.ev(label("Timer")));
      if (i && seen[i] === "Timer off") break;
      await s.click({ label: seen[i] }, { settle: 400 });
    }
    if (new Set(seen).size < 2) throw new Error("timer never changed: " + seen);
    for (let i = 0; i < 4 && (await s.ev(label("Timer"))) !== "Timer off"; i++) await s.click({ label: await s.ev(label("Timer")) }, { settle: 400 });
  });

  await s.step("frame-1-1", async () => {
    await s.click({ label: await s.ev(label("Frame")) });
    await s.click("1:1", { settle: 1200 });
    await s.waitFor(`${label("Frame")} === 'Frame: 1:1'`, { timeout: 3000, msg: "frame 1:1" });
  });
  await s.step("frame-back-9-16", async () => {
    await s.click({ label: "Frame: 1:1" });
    await s.click("9:16", { settle: 1200 });
    await s.waitFor(`${label("Frame")} === 'Frame: 9:16'`, { timeout: 3000, msg: "frame 9:16" });
  });

  await s.step("bounce", async () => {
    await s.click({ label: "Bounce off" }, { settle: 600 });
    await s.waitFor(`!!document.querySelector('[aria-label^="Bounce on"], [aria-label="Bounce"][aria-pressed=true]')`, { timeout: 2000, msg: "bounce on" });
    await s.click({ label: await s.ev(label("Bounce")) }, { settle: 600 });
    await s.waitFor(`!!document.querySelector('[aria-label="Bounce off"]')`, { timeout: 2000, msg: "bounce off" });
  });

  await s.step("collage-mode", async () => {
    await s.click({ label: "Collage" }, { settle: 800 });
    await s.waitVisible({ label: "Leave collage" }, { timeout: 3000 });
    await s.click({ label: "Side by side" }, { settle: 800 });
    await s.waitFor(`${label("Layout")} === 'Layout: Side by side'`, { timeout: 3000, msg: "layout chosen" });
    await s.click({ label: "Leave collage" }, { settle: 800 });
    await s.waitVisible({ label: "Collage" }, { timeout: 3000 });
  });

  await s.step("music", async () => {
    await s.click({ label: "Music" });
    await s.waitVisible("No music", { timeout: 4000 });
    await s.waitFor(`document.querySelectorAll('[aria-label="Play preview"]').length > 0`, { timeout: 6000, msg: "built-in tracks listed" });
    await s.click({ label: "Close" });
    await s.waitFor(`!${textOn("No music")}`, { timeout: 3000, msg: "music closed" });
  });

  await s.step("filter-panel", async () => {
    await s.click("Filters");
    await s.waitVisible("Original", { timeout: 4000 });
    await s.click("Peach", { settle: 1200 });
    await s.click("Mint", { settle: 900 });
  });
  await s.step("filter-manage", async () => {
    await s.click({ label: "Manage filters" }, { settle: 900 });
    await s.waitVisible("Manage filters", { timeout: 4000 });
    await s.waitVisible("All filters", { exact: false, timeout: 4000 });
    await s.click("Done", { settle: 800 });
  });
  await s.step("filter-original-close", async () => {
    if (!(await s.exists("Original"))) await s.click("Filters");
    await s.click("Original", { settle: 800 });
    await s.click({ label: "Close filters" }, { settle: 800 });
    await s.waitVisible("Beauty", { timeout: 3000 });
  });

  await s.step("beauty-tabs", async () => {
    await s.click("Beauty", { settle: 900 });
    for (const t of ["Fine-tune", "Makeup", "Beauty"]) await s.click(t, { settle: 700, nth: 0 });
    await s.click({ label: "Close beauty" }, { settle: 800 });
    await s.waitVisible("Effects", { timeout: 3000 });
  });

  await s.step("effects", async () => {
    await s.click("Effects", { settle: 1500 });
    await s.waitVisible("None", { timeout: 4000 });
    for (const t of ["Featured", "Cute", "Face paint"]) await s.click(t, { settle: 500 });
    const n = await s.ev(`document.querySelectorAll('[data-sticker]').length`);
    if (!n) throw new Error("no effect tiles");
    await s.click({ label: "Close effects" }, { settle: 800 });
    await s.waitVisible("Effects", { timeout: 3000 });
  });

  await s.step("mode-video", async () => {
    await s.click("Video", { settle: 900 });
    await s.waitFor(`!!document.querySelector('[aria-label="Record video"]')`, { timeout: 3000, msg: "video shutter" });
    await s.click({ label: await s.ev(label("Max length")) }, { settle: 600 });
    await s.click("Photo", { settle: 900 });
    await s.waitFor(`!!document.querySelector('[aria-label="Take photo"]')`, { timeout: 3000, msg: "photo shutter" });
  });

  await s.step("switch-camera", async () => {
    await s.click({ label: "Switch camera" }, { settle: 1500 });
    await s.waitFor(camReady, { timeout: 8000, msg: "still on camera" });
  });
}
