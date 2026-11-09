import { openCamera, hasImg } from "../h.mjs";
const confirmUp = `!!document.querySelector('[aria-label=save]')`;
export default async function flowVideoRecord(s) {
  await openCamera(s, { fresh: true });
  await s.step("video-mode", async () => {
    await s.click("VIDEO", { settle: 1000 });
    await s.waitVisible("Duration", { timeout: 3000 });
  });
  await s.step("record-clip", async () => {
    await s.click({ label: "shutter" }, { settle: 2600 });
    await s.waitFor(`/\\d\\d:\\d\\d/.test(document.body.innerText)`, { timeout: 4000, msg: "recording time" });
    // recording time must be readable: black over the white top bar (9:16 on a long screen)
    await s.assert(`(() => { const el = [...document.querySelectorAll('span')].find(e => /^\\d\\d:\\d\\d$/.test(e.innerText)); return el && getComputedStyle(el).color === 'rgb(0, 0, 0)'; })()`, "recording time is black on the white top bar");
    await s.click({ label: "shutter" }, { settle: 900 }); // pause
  });
  await s.step("second-clip-undo", async () => {
    await s.click({ label: "shutter" }, { settle: 1500 });
    await s.click({ label: "shutter" }, { settle: 900 });
  });
  await s.step("next-confirm", async () => {
    await s.waitVisible({ label: "undo" }, { timeout: 3000 });
    await s.click({ label: "next" }, { settle: 300 });
    await s.waitFor(confirmUp, { timeout: 15000, msg: "video confirm" });
    await s.waitFor(`[...document.querySelectorAll('video')].some(v => v.readyState >= 2 && v.duration > 0.5)`, { timeout: 10000, msg: "confirm video playable" });
  });
  await s.step("video-save", async () => {
    // the two clips are merged in real time first; the save button is disabled until the file exists
    await s.waitFor(`document.querySelector('[aria-label=save]') && !document.querySelector('[aria-label=save]').disabled`, { timeout: 20000, msg: "merged file ready" });
    await s.click({ label: "save" }, { settle: 300 });
    await s.waitFor(`${hasImg("end_story_save_confirm")}`, { timeout: 20000, msg: "video saved" });
    await s.sleep(800);
  });
  await s.step("video-edit-pill", async () => {
    await s.click("Edit", { settle: 3000 });
    await s.waitFor(`location.pathname === '/video-edit' || location.pathname === '/edit'`, { timeout: 15000, msg: "video editor route" });
  });
  await s.step("back-to-camera", async () => {
    await s.goto("/"); await openCamera(s);
    await s.click("NORMAL", { settle: 800 }).catch(() => {});
  });
}
