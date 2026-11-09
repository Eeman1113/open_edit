import { openCamera, reviewUp } from "../h.mjs";
export default async function flowVideoRecord(s) {
  await openCamera(s, { fresh: true });
  await s.step("video-mode", async () => {
    await s.click("Video", { settle: 1000 });
    await s.waitVisible({ label: "Record video" }, { timeout: 3000 });
  });
  await s.step("record-clip", async () => {
    await s.click({ label: "Record video" }, { settle: 2600 });
    await s.waitFor(`/\\d\\d:\\d\\d/.test(document.body.innerText)`, { timeout: 4000, msg: "recording time" });
    await s.click({ label: "Stop recording" }, { settle: 900 });
  });
  await s.step("second-clip", async () => {
    if (await s.exists({ label: "Record video" })) {
      await s.click({ label: "Record video" }, { settle: 1500 });
      await s.click({ label: "Stop recording" }, { settle: 900 });
    }
  });
  await s.step("next-review", async () => {
    await s.waitVisible({ label: "Undo last clip" }, { timeout: 3000 });
    await s.click({ label: "Finish video" }, { settle: 300 });
    await s.waitFor(reviewUp, { timeout: 15000, msg: "video review" });
    await s.waitFor(`[...document.querySelectorAll('video')].some(v => v.readyState >= 2 && v.duration > 0.5)`, { timeout: 10000, msg: "review video playable" });
  });
  await s.step("video-save", async () => {
    // clips are merged first; Save is disabled until the file exists
    await s.waitFor(`document.querySelector('[aria-label="Save to gallery"]') && !document.querySelector('[aria-label="Save to gallery"]').disabled`, { timeout: 20000, msg: "merged file ready" });
    await s.click({ label: "Save to gallery" }, { settle: 300 });
    await s.waitFor(`document.body.innerText.includes('Saved') || document.querySelector('[aria-label="Save to gallery"]')?.disabled`, { timeout: 20000, msg: "video saved" });
    await s.sleep(800);
  });
  await s.step("video-edit", async () => {
    await s.click("Edit", { settle: 3000 });
    await s.waitFor(`location.pathname === '/video-edit' || location.pathname === '/edit'`, { timeout: 15000, msg: "video editor route" });
  });
  await s.step("back-to-camera", async () => {
    await s.goto("/"); await openCamera(s);
    await s.click("Photo", { settle: 800 }).catch(() => {});
  });
}
