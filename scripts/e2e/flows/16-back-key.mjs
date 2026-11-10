// Back (Escape / the browser back key, src/lib/back.ts): one press closes exactly the top-most thing.
// Camera panels and sheets, the capture review, the gallery viewer, photo editor tool pages / text typing /
// sticker library / the discard dialog / the Saved page and its share sheet, video editor tool pages / the music
// sheet / the discard dialog, the collage leave dialog, Discover sheets and dialogs, the settings dialog.
import {
  TEST_PHOTO, TEST_VIDEO, importToGallery, openThumb, nthThumb, editorMain, videoMain, editTab, videoTab, openCamera, reviewUp, textOn,
} from "../h.mjs";

const at = (p) => `location.pathname === ${JSON.stringify(p)}`;
const esc = async (s, settle = 800) => { await s.key("Escape"); await s.sleep(settle); };
const gone = (t) => `!document.body.innerText.includes(${JSON.stringify(t)})`;

export default async function flowBackKey(s) {
  /* ------------------------------------------------------------------ camera */
  await s.step("camera-panels", async () => {
    await openCamera(s, { fresh: true });
    for (const [open, closeLabel] of [["Filters", "Close filters"], ["Beauty", "Close beauty"], ["Effects", "Close effects"]]) {
      await s.click(open, { settle: 1000 });
      await s.waitVisible({ label: closeLabel }, { timeout: 4000 });
      await esc(s);
      await s.waitFor(`!document.querySelector('[aria-label=${JSON.stringify(closeLabel)}]')`, { timeout: 3000, msg: `${open} closed by back` });
    }
    await s.click({ label: "More options" }, { settle: 800 });
    await s.waitVisible("Camera settings", { timeout: 3000 });
    await esc(s);
    await s.waitFor(gone("Camera settings"), { timeout: 3000, msg: "More closed by back" });
    await s.click({ label: "Music" }, { settle: 1000 });
    await s.waitVisible("No music", { timeout: 4000 });
    await esc(s, 1000);
    await s.waitFor(gone("No music"), { timeout: 3000, msg: "music sheet closed by back" });
    await s.assert(at("/"), "still on the camera");
  });
  await s.step("review", async () => {
    await s.click({ label: "Take photo" }, { settle: 300 });
    await s.waitFor(reviewUp, { timeout: 10000 });
    await s.click("Border", { settle: 900 });
    await s.waitVisible("White border", { timeout: 3000 });
    await esc(s);
    await s.waitFor(`${gone("White border")} && (${reviewUp})`, { timeout: 3000, msg: "border sheet closed, review kept" });
    await esc(s);
    if (await s.exists("Discard")) await s.click("Discard", { settle: 800 });
    await s.waitFor(`!(${reviewUp})`, { timeout: 4000, msg: "review closed by back" });
  });

  /* ------------------------------------------------------------------ gallery */
  await s.step("gallery-viewer", async () => {
    await s.goto("/gallery", { settle: 1200 });
    await importToGallery(s, [TEST_PHOTO]);
    await s.click({ label: "View full screen" }, { settle: 1200 });
    await s.waitVisible("Delete", { timeout: 3000 });
    await esc(s);
    await s.waitFor(`${gone("Delete")} && ${at("/gallery")}`, { timeout: 3000, msg: "viewer closed, gallery kept" });
  });

  /* ------------------------------------------------------------------ photo editor */
  await s.step("editor-tool-page", async () => {
    await openThumb(s, 0);
    await s.waitFor(editorMain, { timeout: 15000 });
    // a face photo switches to Portrait once the face is found: wait for that before picking a tab
    await s.waitFor(`document.querySelector('[data-tab="PORTRAIT"]')?.getAttribute('aria-selected') === 'true'`, { timeout: 15000 }).catch(() => {});
    await editTab(s, "TOOLS");
    await s.tap("Crop", { settle: 1200 });
    await s.waitFor(`!(${editorMain})`, { timeout: 3000, msg: "crop open" });
    await esc(s, 1000);
    await s.waitFor(editorMain, { timeout: 3000, msg: "crop closed by back" });
    await s.assert(at("/edit"), "still in the editor");
  });
  await s.step("editor-text-typing", async () => {
    await editTab(s, "TEXT");
    await s.waitVisible("Done", { timeout: 4000 });
    for (let i = 0; i < 3 && !(await s.ev(editorMain)); i++) await esc(s, 900);
    await s.waitFor(editorMain, { timeout: 3000, msg: "text page closed by back" });
  });
  await s.step("editor-sticker-library", async () => {
    await editTab(s, "STAMP");
    await s.click({ label: "Sticker library" }, { settle: 1200 });
    await s.waitFor(`document.querySelectorAll('[aria-label="Sticker library"]').length > 0 && document.body.innerText.includes('Sticker library')`, { timeout: 4000 });
    const before = await s.ev(`document.body.innerText.length`);
    await esc(s, 900);
    await s.assert(`!(${editorMain})`, "only the library closed (still on the sticker page)");
    if ((await s.ev(`document.body.innerText.length`)) === before) throw new Error("library did not close");
    await esc(s, 900);
    await s.waitFor(editorMain, { timeout: 3000, msg: "sticker page closed by back" });
  });
  await s.step("editor-discard-dialog", async () => {
    await editTab(s, "FILTER");
    await s.tap("Peach", { settle: 1200 });
    await esc(s);
    await s.waitVisible("Discard your edits?", { timeout: 3000 });
    await esc(s);
    await s.waitFor(gone("Discard your edits?"), { timeout: 3000, msg: "dialog cancelled by back" });
    await s.assert(at("/edit"), "still in the editor");
  });
  await s.step("editor-saved-share", async () => {
    await s.click("Save", { settle: 1000 });
    await s.waitVisible("It's in your gallery.", { exact: false, timeout: 30000 });
    await s.click("Share", { settle: 900 });
    await s.waitVisible("Download a copy", { timeout: 3000 });
    await esc(s, 900);
    await s.waitFor(`${gone("Download a copy")} && document.body.innerText.includes("It's in your gallery.")`, { timeout: 3000, msg: "share sheet closed, Saved kept" });
    await esc(s, 1500);
    await s.waitFor(at("/gallery"), { timeout: 5000, msg: "back on Saved → gallery" });
  });

  /* ------------------------------------------------------------------ video editor */
  await s.step("video-tool-page-and-music", async () => {
    await s.setFile("input[type=file]", [TEST_VIDEO]);
    await s.sleep(2500);
    await s.tap("Videos", { settle: 1200 });
    const cell = await s.locate("0:06", { exact: false });
    if (!cell) throw new Error("no video cell");
    for (let i = 0; i < 3 && (await s.ev("location.pathname")) !== "/video-edit"; i++) { await s.tapAt(cell.x, cell.y - 30); await s.sleep(2500); }
    await s.waitFor(videoMain, { timeout: 10000 });
    await videoTab(s, "Reshape");
    await s.waitFor(`!(${videoMain})`, { timeout: 4000, msg: "face shape page" });
    await esc(s, 900);
    await s.waitFor(videoMain, { timeout: 3000, msg: "face shape closed by back" });
    await videoTab(s, "Music");
    await s.tap("All tracks", { settle: 1200 });
    await s.waitVisible("No music", { timeout: 4000 });
    await esc(s, 900);
    await s.waitFor(gone("No music"), { timeout: 3000, msg: "music sheet closed by back" });
    await s.assert(at("/video-edit"), "still in the video editor");
  });
  await s.step("video-discard-dialog", async () => {
    await s.click({ label: "Rotate" }, { settle: 900 });
    await esc(s);
    await s.waitVisible("Discard your edits?", { timeout: 3000 });
    await esc(s);
    await s.waitFor(gone("Discard your edits?"), { timeout: 3000, msg: "dialog cancelled by back" });
    await esc(s);
    await s.click("Discard", { settle: 1500 });
    await s.waitFor(at("/gallery"), { timeout: 5000, msg: "left the video editor" });
  });

  /* ------------------------------------------------------------------ collage */
  await s.step("collage-leave-dialog", async () => {
    await s.goto("/gallery?mode=collage", { settle: 1500 });
    for (const n of [0, 1]) { const p = await s.ev(nthThumb(n)); if (!p) throw new Error("need two photos"); await s.tapAt(p[0] - 20, p[1] - 20); await s.sleep(400); }
    await s.click("Next", { settle: 2500 });
    await s.waitFor(at("/collage"), { timeout: 6000 });
    await s.sleep(1500);
    await esc(s);
    await s.waitFor(`document.body.innerText.includes('Leave the collage?') || document.body.innerText.includes('Discard this collage?')`, { timeout: 3000, msg: "leave dialog" });
    await esc(s);
    await s.waitFor(`!document.body.innerText.includes('collage?') && ${at("/collage")}`, { timeout: 3000, msg: "dialog cancelled by back" });
    await esc(s);
    await s.click((await s.exists("Leave")) ? "Leave" : "Discard", { settle: 1200 });
    await s.waitFor(at("/gallery"), { timeout: 5000, msg: "collage → gallery" });
  });

  /* ------------------------------------------------------------------ Discover */
  await s.step("discover-sheets", async () => {
    await s.goto("/discover/profile/lumen.lab", { settle: 1500 });
    await s.click({ label: "More" }, { settle: 800 });
    await s.waitVisible("Share profile", { timeout: 3000 });
    await esc(s);
    await s.waitFor(gone("Share profile"), { timeout: 3000, msg: "More sheet closed by back" });
    await s.click({ label: "More" }, { settle: 800 });
    await s.click("Report", { settle: 900 });
    await s.waitVisible("Reports are anonymous", { exact: false, timeout: 3000 });
    await esc(s);
    await s.waitFor(gone("Reports are anonymous"), { timeout: 3000, msg: "report sheet closed by back" });
    await s.click({ label: "More" }, { settle: 800 });
    await s.click("Hide this creator", { settle: 800 });
    await s.waitVisible("Hide this creator?", { timeout: 3000 });
    await esc(s);
    await s.waitFor(gone("Hide this creator?"), { timeout: 3000, msg: "hide dialog closed by back" });
    await s.assert(`location.pathname.startsWith('/discover/profile/')`, "still on the profile");
  });

  /* ------------------------------------------------------------------ settings */
  await s.step("settings-dialog-and-page", async () => {
    await s.goto("/my", { settle: 1000 });
    await s.click("Settings", { settle: 1200 });
    await s.waitFor(at("/settings"), { timeout: 5000 });
    await s.tap("Clear local data", { settle: 800, exact: false });
    await s.waitVisible("Clear all local data?", { timeout: 3000 });
    await esc(s);
    await s.waitFor(`${gone("Clear all local data?")} && ${at("/settings")}`, { timeout: 3000, msg: "dialog closed by back" });
    await esc(s, 1200);
    await s.waitFor(at("/my"), { timeout: 5000, msg: "settings → Me by back" });
    await s.assert(textOn("Guest session"), "Me page");
  });

  /* ------------------------------------------------------------------ pages: the back key = the back button */
  await s.step("pages-back-key", async () => {
    await s.goto("/home", { settle: 1500 });
    const group = await s.ev(`document.querySelector('a[href^="/home/group/"]')?.getAttribute('href') ?? ''`);
    if (!group) throw new Error("no feed group link on Home");
    for (const [from, to] of [
      ["/discover", "/discover/post/p0_0"], ["/discover", "/discover/search"], ["/discover", "/discover/qr"], ["/discover", "/discover/tag/mint"],
      ["/discover", "/discover/profile/openedit"], ["/home", group], ["/my", "/settings/about"], ["/my", "/studio"], ["/ai", "/aistyle"],
      ["/my", "/lens"], ["/my", "/settings/saveroute"],
    ]) {
      await s.goto(from, { settle: 800 });
      await s.goto(to, { settle: 1500 });
      await esc(s, 1500);
      // a focused search field takes the first press (it only closes the keyboard)
      if ((await s.ev("location.pathname")) === to && to.endsWith("/search")) await esc(s, 1500);
      if ((await s.ev("location.pathname")) === to) throw new Error(`back key did nothing on ${to}`);
    }
  });
}
