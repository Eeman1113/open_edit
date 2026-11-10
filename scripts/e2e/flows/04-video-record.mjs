import { openCamera, reviewUp, audit } from "../h.mjs";
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
  await s.step("review-music", async () => {
    // flow 02 chose a track in the camera's Music sheet: the review mixes it into the file
    const label = await s.ev(`[...document.querySelectorAll('button[aria-label^="Music: "], button[aria-label="Add music"]')].map(b => b.getAttribute('aria-label'))[0] ?? ''`);
    if (!label.startsWith("Music: ")) {
      await s.click({ label: "Add music" }, { settle: 1200 });
      await s.waitVisible("No music", { timeout: 4000 });
      await s.click("Use", { settle: 1200 });
    }
    await s.waitFor(`!!document.querySelector('button[aria-label^="Music: "]')`, { timeout: 5000, msg: "review names the track" });
    await s.click({ label: await s.ev(`document.querySelector('button[aria-label^="Music: "]').getAttribute('aria-label')`) }, { settle: 1200 });
    await s.waitVisible("Selected", { timeout: 4000 });
    await audit(s, "music sheet");
    await s.key("Escape"); await s.sleep(800);
  });
  await s.step("video-save", async () => {
    // clips are merged first; Save is disabled until the file exists
    await s.waitFor(`document.querySelector('[aria-label="Save to gallery"]') && !document.querySelector('[aria-label="Save to gallery"]').disabled`, { timeout: 20000, msg: "merged file ready" });
    await s.click({ label: "Save to gallery" }, { settle: 300 });
    await s.waitFor(`document.querySelector('[aria-label="Save to gallery"]')?.innerText.includes('Saved')`, { timeout: 20000, msg: "video saved" });
    await s.sleep(800);
    // the saved file has sound (the music track mixed in)
    const v = `[...document.querySelectorAll('video')].find(v => v.getBoundingClientRect().width > 100)`;
    await s.ev(`(() => { const v = ${v}; v.muted = true; v.currentTime = 0; return v.play().catch(() => 0); })()`);
    await s.sleep(1500);
    const bytes = await s.ev(`${v}.webkitAudioDecodedByteCount ?? -1`);
    if (bytes === 0) throw new Error("reviewed video has no sound track");
  });
  await s.step("video-edit", async () => {
    await s.click("Edit", { settle: 3000 });
    await s.waitFor(`location.pathname === '/video-edit'`, { timeout: 15000, msg: "video editor route" });
    await s.waitFor(`!!document.querySelector('[aria-label="Video tools"]')`, { timeout: 15000, msg: "video editor open" });
  });
  await s.step("back-to-camera", async () => {
    await s.goto("/"); await openCamera(s);
    await s.ev(`localStorage.removeItem('oe.camera.music')`);
    await s.click("Photo", { settle: 800 }).catch(() => {});
  });
}
