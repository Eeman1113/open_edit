// Video editor: every tab (Trim, Speed, Filters, Effects, Face FX, Face shape, Liquify, Music), the top controls,
// then Save → the exported file (shorter after the trim, with a sound track from the music) → the Saved page → Share.
import { TEST_VIDEO, videoMain, videoTab, slide, audit, previewThumb, diff } from "../h.mjs";

const vframe = `[...document.querySelectorAll('[data-video-edit] [data-preview] canvas')].some(c => c.width > 50)`;
const savedVideo = `[...document.querySelectorAll('video')].find(v => v.getBoundingClientRect().width > 150)`;

export default async function flowVideoEditor(s) {
  await s.step("open-video-editor", async () => {
    await s.goto("/gallery", { settle: 1500 });
    await s.setFile("input[type=file]", [TEST_VIDEO]);
    await s.sleep(2500);
    await s.tap("Videos", { settle: 1200 });
    const cell = await s.locate("0:06", { exact: false });
    if (!cell) throw new Error("imported clip not in the Videos tab");
    await s.tapAt(cell.x, cell.y - 30);
    await s.waitFor(`location.pathname === '/video-edit'`, { timeout: 8000 });
    await s.waitFor(videoMain, { timeout: 10000, msg: "video editor dock" });
    await s.waitFor(vframe, { timeout: 10000, msg: "video frame" });
    await s.sleep(1500);
    const tabs = await s.ev(`[...document.querySelectorAll('[aria-label="Video tools"] [role=tab]')].map(b => b.innerText.trim()).join()`);
    if (tabs !== "Trim,Speed,Filters,Effects,Face FX,Face shape,Liquify,Music") throw new Error("tabs: " + tabs);
    await audit(s);
  });
  await s.step("top-controls", async () => {
    await s.click({ label: "Sound on" }, { settle: 600 });
    await s.waitVisible({ label: "Sound off" }, { timeout: 2000 });
    await s.click({ label: "Sound off" }, { settle: 600 });
    const w0 = await s.ev(`document.querySelector('[data-video-edit] [data-preview]').getBoundingClientRect().width`);
    await s.click({ label: "Rotate" }, { settle: 1000 });
    const w1 = await s.ev(`document.querySelector('[data-video-edit] [data-preview]').getBoundingClientRect().width`);
    if (Math.abs(w0 - w1) < 5) throw new Error("rotate did not change the frame");
    for (let i = 0; i < 3; i++) await s.click({ label: "Rotate" }, { settle: 700 });
  });
  await s.step("trim", async () => {
    await videoTab(s, "VideoEdit");
    const h = await s.ev(`(() => { const hs = [...document.querySelectorAll('[data-video-edit] span.bg-accent')].filter(e => e.getBoundingClientRect().height > 40); const r = hs[1]?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; })()`);
    if (!h) throw new Error("no trim handles");
    await s.drag(h, [h[0] - 130, h[1]], { steps: 16, ms: 500, settle: 1500 });
    await audit(s, "trim");
  });
  await s.step("speed-and-reverse", async () => {
    await videoTab(s, "Speed");
    await slide(s, 0.75);
    await s.waitVisible("2x", { exact: false, timeout: 3000 }).catch(() => {});
    await s.click({ label: "Play backwards" }, { settle: 600 });
    await s.waitFor(`!document.body.innerText.includes('%')`, { timeout: 180000, msg: "reverse prepared" });
    await s.waitFor(`document.querySelector('[aria-label="Play backwards"]')?.getAttribute('aria-checked') === 'true'`, { timeout: 5000, msg: "reverse on" });
    await s.click({ label: "Play backwards" }, { settle: 800 });
    await slide(s, 0.5);
    await audit(s, "speed");
  });
  await s.step("filters", async () => {
    await videoTab(s, "Filter");
    await s.tap("Rose", { settle: 400 }).catch(() => {});
    await s.tap("Mono", { settle: 600 });
    const before = await s.ev(previewThumb);
    await s.tap("Noir", { settle: 1500 }).catch(() => s.tap("Silver", { settle: 1500 }));
    await s.tap("Everyday", { settle: 500 });
    await s.tap("Peach", { settle: 1500 });
    if (diff(before, await s.ev(previewThumb)) < 1) throw new Error("filter not visible on the preview");
    await audit(s, "filters");
  });
  await s.step("effects", async () => {
    await videoTab(s, "Effects");
    const before = await s.ev(previewThumb);
    for (const g of ["Film", "Lens", "Weather", "Light"]) await s.tap(g, { settle: 400 });
    await s.tap("Light leak", { settle: 2500 });
    if (diff(before, await s.ev(previewThumb)) < 1) throw new Error("effect not visible on the preview");
    await audit(s, "effects");
  });
  await s.step("face-fx", async () => {
    await videoTab(s, "Frame");
    for (const c of ["Cute", "Face paint", "Eyes", "Featured"]) await s.tap(c, { settle: 400 });
    await s.tap({ sel: '[data-sticker]:nth-child(2)' }, { settle: 2500 });
    await s.tap("No filter", { settle: 800 }).catch(() => s.click({ label: "No filter" }, { settle: 800 }));
    await audit(s, "face fx");
  });
  await s.step("face-shape", async () => {
    await videoTab(s, "Reshape");
    await s.waitFor(`!(${videoMain})`, { timeout: 4000, msg: "face shape page" });
    await s.tap("Slim", { settle: 800 });
    await audit(s, "face shape");
    await s.click({ label: "Apply" }, { settle: 1200 });
    await s.waitFor(videoMain, { timeout: 5000, msg: "dock after Apply" });
  });
  await s.step("liquify", async () => {
    await videoTab(s, "Retouch");
    await s.waitFor(`!(${videoMain})`, { timeout: 4000, msg: "liquify page" });
    await s.click({ label: "Brush size 4" }, { settle: 500 });
    await audit(s, "liquify");
    await s.click({ label: "Cancel" }, { settle: 1200 });
    await s.waitFor(videoMain, { timeout: 5000, msg: "dock after Cancel" });
  });
  await s.step("music", async () => {
    await videoTab(s, "Music");
    await s.waitFor(`document.querySelectorAll('[data-track]').length >= 4`, { timeout: 8000, msg: "built-in tracks" });
    await s.tap({ sel: "[data-track]" }, { settle: 1000 });
    await s.waitVisible("Music:", { exact: false, timeout: 3000 });
    await slide(s, 0.6);
    await s.tap("All tracks", { settle: 1200 });
    await s.waitVisible("No music", { timeout: 4000 });
    await audit(s, "music sheet");
    // pick the second track in the full list
    await s.click("Use", { nth: 1, settle: 1200 });
    await s.waitFor(`!document.body.innerText.includes('No music')`, { timeout: 4000, msg: "sheet closed" });
    const title = await s.ev(`document.querySelector('[data-track][aria-pressed=true]')?.innerText.split('\\n')[0] ?? ''`);
    if (!title) throw new Error("no track selected after Use");
    await s.assert(`document.body.innerText.includes(${JSON.stringify("Music: " + title)})`, "panel names the chosen track");
  });
  await s.step("share-export", async () => {
    await s.click({ label: "Share" }, { settle: 1500 });
    await s.waitVisible("Download a copy", { timeout: 90000 });
    await audit(s, "share sheet");
    await s.key("Escape"); await s.sleep(900);
    await s.waitFor(`!document.body.innerText.includes('Download a copy')`, { timeout: 3000, msg: "share sheet closed" });
  });
  await s.step("save-export", async () => {
    await s.click("Save", { settle: 1500 });
    await s.waitVisible("Saved", { timeout: 90000 });
    await s.waitFor(`(() => { const v = ${savedVideo}; return v && v.readyState >= 2 && v.duration > 0.5; })()`, { timeout: 15000, msg: "exported video plays" });
    const dur = await s.ev(`${savedVideo}.duration`);
    if (!(dur < 5.5)) throw new Error(`export not trimmed (${dur} s)`);
    // the music is in the file: audio gets decoded while it plays
    await s.ev(`(() => { const v = ${savedVideo}; v.muted = true; v.currentTime = 0; return v.play().catch(() => 0); })()`);
    await s.sleep(2000);
    const audio = await s.ev(`${savedVideo}.webkitAudioDecodedByteCount ?? -1`);
    if (audio === 0) throw new Error("exported video has no sound track");
    await audit(s, "saved");
  });
  await s.step("saved-share-done", async () => {
    await s.click("Share", { settle: 1000 });
    await s.waitVisible("Download a copy", { timeout: 3000 });
    await s.key("Escape"); await s.sleep(900);
    await s.click("Done", { settle: 1500 });
    await s.waitFor(`location.pathname === '/gallery'`, { timeout: 6000, msg: "Done → gallery" });
  });
}
