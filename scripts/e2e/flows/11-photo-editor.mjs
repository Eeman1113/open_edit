// Photo editor: every tab and every tool page once (opened, used where it is cheap, applied or cancelled), the
// layers popup, Save → the Saved page → Share. Uses the face photo (E2E_PHOTO) so the Portrait tools have faces.
import {
  TEST_PHOTO, importToGallery, openThumb, editorMain, editTab, aiDone, slide, apply, cancelTool, audit,
  previewStats, previewThumb, diff,
} from "../h.mjs";

/** Opens a tool tile of the current tab (scrolling its row like a finger) and waits for the tool page. */
async function openTool(s, label) {
  await s.tap(label, { settle: 1500 });
  await s.waitFor(`!document.querySelector('[aria-label="Editor sections"]') || [...document.querySelectorAll('p')].some(p => p.innerText.trim() === 'Runs on your device')`, { timeout: 25000, msg: `${label} page` });
  await aiDone(s);
  await s.sleep(600);
}
/** Mean absolute grey difference of the preview against `before`, after the dock is back. */
async function changedSince(s, before) { await s.sleep(800); return diff(before, await s.ev(previewThumb)); }

export default async function flowPhotoEditor(s) {
  await s.step("open-editor", async () => {
    await s.goto("/gallery", { settle: 1500 });
    await importToGallery(s, [TEST_PHOTO]);
    await openThumb(s, 0);
    await s.waitFor(editorMain, { timeout: 15000, msg: "editor dock" });
    // a face is found → the editor switches to Portrait
    await s.waitFor(`document.querySelector('[data-tab="PORTRAIT"]')?.getAttribute('aria-selected') === 'true'`, { timeout: 15000, msg: "Portrait picked for a face photo" });
    const st = await s.ev(previewStats);
    if (!st || st.std < 10) throw new Error("preview flat: " + JSON.stringify(st));
    for (const l of ["Back", "Undo", "Redo", "Save"]) await s.waitVisible({ label: l, exact: false }, { timeout: 3000 }).catch(() => s.waitVisible(l));
    await audit(s);
  });

  /* ------------------------------------------------------------ Tools */
  await s.step("tools-crop", async () => {
    await editTab(s, "TOOLS");
    const before = await s.ev(previewThumb);
    await openTool(s, "Crop");
    for (const t of ["Rotate", "Tilt", "Crop"]) await s.tap(t, { settle: 600 });
    await s.tap("1:1", { settle: 900 });
    await audit(s, "crop");
    await apply(s);
    const st = await s.ev(previewStats);
    if (Math.abs(st.w / st.h - 1) > 0.05) throw new Error(`crop 1:1 not applied (${st.w}x${st.h})`);
    if ((await changedSince(s, before)) < 1) throw new Error("crop changed nothing");
  });
  await s.step("tools-undo-redo", async () => {
    await s.click({ label: "Undo" }, { settle: 1200 });
    const st = await s.ev(previewStats);
    if (Math.abs(st.w / st.h - 1) < 0.05) throw new Error("undo kept the crop");
    await s.click({ label: "Redo" }, { settle: 1200 });
    await s.click({ label: "Undo" }, { settle: 1200 }); // keep the full photo for the face tools
  });
  for (const [tool, act] of [
    ["Enhance", "apply"], ["Erase", "stroke"], ["Expand", "open"], ["Depth blur", "tap"], ["Cutout", "open"], ["Pixelate", "stroke"],
  ]) {
    await s.step(`tools-${tool.toLowerCase().replace(/\W+/g, "-")}`, async () => {
      await editTab(s, "TOOLS");
      const before = await s.ev(previewThumb);
      await openTool(s, tool);
      if (tool === "Enhance") await s.waitVisible("After", { timeout: 120000 });
      await audit(s, tool);
      if (act === "stroke") { await s.drag([150, 380], [250, 420], { settle: 1500 }); await aiDone(s); }
      if (act === "tap") { await s.tapAt(260, 330); await s.sleep(2500); await aiDone(s); }
      await s.shot(`tool-${tool}`);
      if (act === "open") { await cancelTool(s); await s.waitFor(editorMain, { timeout: 8000, msg: "dock after cancel" }); return; }
      await apply(s);
      if (act !== "tap" && (await changedSince(s, before)) < 0.3) throw new Error(`${tool} changed nothing`);
    });
  }

  /* ------------------------------------------------------------ Filters, Effects, Adjust */
  await s.step("filters", async () => {
    await editTab(s, "FILTER");
    const before = await s.ev(previewThumb);
    for (const g of ["Film", "Mood", "Mono", "Everyday"]) await s.tap(g, { settle: 500 });
    await s.tap("Peach", { settle: 1500 });
    await slide(s, 0.9);
    if ((await changedSince(s, before)) < 1) throw new Error("filter not visible");
    await audit(s, "filters");
  });
  await s.step("effects", async () => {
    await editTab(s, "EFFECTS");
    const before = await s.ev(previewThumb);
    for (const g of ["Film", "Lens", "Weather", "Light"]) await s.tap(g, { settle: 500 });
    await s.tap("Light leak", { settle: 2500 });
    if ((await changedSince(s, before)) < 1) throw new Error("effect not visible");
    await audit(s, "effects");
  });
  await s.step("adjust-sliders", async () => {
    await editTab(s, "ADJUST");
    const before = await s.ev(previewThumb);
    for (const t of ["Brightness", "Contrast", "Warmth", "Vignette", "Grain"]) { await s.tap(t, { settle: 500 }); await slide(s, 0.8, { settle: 900 }); }
    if ((await changedSince(s, before)) < 1) throw new Error("adjustments not visible");
  });
  for (const page of ["Curves", "Split tone", "Colour mix"]) {
    await s.step(`adjust-${page.toLowerCase().replace(/\W+/g, "-")}`, async () => {
      await editTab(s, "ADJUST");
      await openTool(s, page);
      await audit(s, page);
      if (page === "Curves") await s.drag([195, 420], [195, 360], { settle: 1000 });
      else {
        const sw = await s.ev(`(() => { const b = [...document.querySelectorAll('button[aria-label^="#"]')].filter(b => b.getBoundingClientRect().width > 0)[1]; if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
        if (sw) { await s.tapAt(...sw); await s.sleep(800); }
        if (await s.ev(`!!document.querySelector('[role=slider]')`)) await slide(s, 0.8);
      }
      await s.shot(`adjust-${page}`);
      await apply(s);
    });
  }

  /* ------------------------------------------------------------ Portrait (face tools) */
  await s.step("portrait-face-shape", async () => {
    await editTab(s, "PORTRAIT");
    const before = await s.ev(previewThumb);
    await openTool(s, "Face shape");
    await s.tapAt(260, 330); await s.sleep(1500); // pick the face on the right
    await s.tap("Slim", { settle: 800 });
    await slide(s, 0.9, { settle: 2500 });
    await s.waitVisible("Both", { timeout: 3000 });
    await s.tap("Eyes", { settle: 600 });
    await s.tap("Styles", { settle: 600 });
    await audit(s, "face shape");
    await apply(s);
    if ((await changedSince(s, before)) < 0.2) throw new Error("face shape not applied");
  });
  for (const [tool, pick] of [
    ["Retouch", "Smooth"], ["Makeup", "Rose"], ["Skin detail", null], ["Skin brush", "Smooth"], ["Skin tone", "Rosy"],
    ["Proportions", "Jaw"], ["Sculpt", "Nose"], ["Liquify", null], ["Body", "Slim"], ["Colour", null], ["Eye light", "Ring"],
    ["Hair colour", "Brown"], ["Volume", null], ["AI Hair", "Brown"],
  ]) {
    await s.step(`portrait-${tool.toLowerCase().replace(/\W+/g, "-")}`, async () => {
      await editTab(s, "PORTRAIT");
      await openTool(s, tool);
      if (pick) { await s.tap(pick, { settle: 1500 }); await aiDone(s); }
      if (tool === "Skin brush" || tool === "Colour" || tool === "Liquify") await s.drag([240, 330], [280, 360], { settle: 1500 });
      if (await s.ev(`[...document.querySelectorAll('[role=slider]')].some(e => e.getBoundingClientRect().width > 20)`)) await slide(s, 0.7, { settle: 1500 });
      await aiDone(s);
      await s.shot(`portrait-${tool}`);
      await audit(s, tool);
      await apply(s);
    });
  }

  /* ------------------------------------------------------------ Face FX (AR filter) */
  await s.step("face-fx", async () => {
    await editTab(s, "STICKER");
    await s.waitFor(`document.querySelectorAll('[data-sticker]').length > 5`, { timeout: 6000, msg: "Face FX page" });
    const before = await s.ev(previewThumb);
    for (const c of ["Cute", "Face paint", "Eyes", "Featured"]) await s.tap(c, { settle: 500 });
    await s.tap({ sel: '[data-sticker]:nth-child(3)' }, { settle: 5000 });
    await audit(s, "face fx");
    await s.shot("face-fx");
    await apply(s);
    if ((await changedSince(s, before)) < 0.3) throw new Error("face effect not visible");
  });

  /* ------------------------------------------------------------ layers: stickers, text, draw */
  await s.step("stickers", async () => {
    await editTab(s, "STAMP");
    await s.click({ label: "Sticker library" }, { settle: 1500 });
    await s.waitVisible("Sticker library", { exact: false, timeout: 4000 });
    await audit(s, "sticker library");
    await s.key("Escape"); await s.sleep(900);
    const pack = await s.ev(`[...document.querySelectorAll('button[aria-pressed]')].map(b => b.innerText.trim()).find(t => t && !['Recent', 'My stickers'].includes(t))`);
    if (!pack) throw new Error("no sticker pack chip");
    await s.tap(pack, { settle: 800 });
    const p = await s.ev(`(() => { const i = [...document.querySelectorAll('button img')].find(i => i.getBoundingClientRect().width > 20 && i.getBoundingClientRect().top > 450); if (!i) return null; const r = i.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    if (!p) throw new Error("no sticker in the pack");
    await s.tapAt(...p); await s.sleep(1200);
    await apply(s);
    await s.waitVisible({ label: "Layers (1)" }, { timeout: 4000 });
  });
  await s.step("text", async () => {
    await editTab(s, "TEXT");
    await s.waitVisible("Done", { timeout: 4000 });
    await s.type("Hello Open_Edit");
    await s.click("Done", { settle: 1500 });
    for (const t of ["Outline", "Shadow", "Label", "Align", "Colour"]) await s.tap(t, { settle: 400 });
    await s.tap("Space Grotesk", { settle: 800 });
    await audit(s, "text");
    await apply(s);
    await s.waitVisible({ label: "Layers (2)" }, { timeout: 4000 });
  });
  await s.step("draw", async () => {
    await editTab(s, "BRUSH");
    await s.tap("Marker", { settle: 500 });
    await s.drag([100, 300], [300, 380], { settle: 1000 });
    await s.tap("Spray", { settle: 500 });
    await s.drag([100, 420], [300, 360], { settle: 1000 });
    await audit(s, "draw");
    await apply(s);
    await s.waitVisible({ label: "Layers (3)" }, { timeout: 4000 });
  });
  await s.step("layers-popup", async () => {
    await s.click({ label: "Layers (3)" }, { settle: 900 });
    await s.waitVisible("Merge all", { timeout: 3000 });
    const rows = await s.ev(`document.querySelectorAll('[aria-label="Delete layer"]').length`);
    if (rows !== 3) throw new Error(`layer list shows ${rows} rows`);
    await audit(s, "layers");
    await s.click({ label: "Layers (3)" }, { settle: 700 });
  });

  /* ------------------------------------------------------------ Frame */
  await s.step("frame", async () => {
    await editTab(s, "BORDER");
    await s.tap("Shape", { settle: 500 });
    await s.tap("1:1", { settle: 1200 });
    await s.tap("Fill", { settle: 500 });
    await s.click({ label: "Blurred photo" }, { settle: 1500 });
    const st = await s.ev(previewStats);
    if (Math.abs(st.w / st.h - 1) > 0.05) throw new Error(`frame 1:1 not applied (${st.w}x${st.h})`);
    await audit(s, "frame");
  });

  /* ------------------------------------------------------------ Save → Saved → Share */
  await s.step("save", async () => {
    await s.click("Save", { settle: 1000 });
    await s.waitVisible("Saved", { timeout: 30000 });
    await s.waitVisible("It's in your gallery.", { exact: false, timeout: 3000 });
    await s.waitFor(`(() => { const i = document.querySelector('img[alt="Saved result"]'); return i && i.complete && i.naturalWidth > 100; })()`, { timeout: 8000, msg: "saved image" });
    await audit(s, "saved page");
  });
  await s.step("share-sheet", async () => {
    await s.click("Share", { settle: 1000 });
    await s.waitVisible("Download a copy", { timeout: 3000 });
    await audit(s, "share sheet");
    await s.click("Download a copy", { settle: 1200 });
    await s.waitVisible("Downloaded", { timeout: 3000 });
  });
  await s.step("saved-back-to-editing", async () => {
    await s.click({ label: "Back to editing" }, { settle: 1200 });
    await s.waitFor(editorMain, { timeout: 5000, msg: "editor again" });
  });
  await s.step("saved-open-gallery", async () => {
    await s.click("Save", { settle: 1000 });
    await s.waitVisible("Saved", { timeout: 30000 });
    await s.click("Open gallery", { settle: 1500 });
    await s.waitFor(`location.pathname === '/gallery'`, { timeout: 6000, msg: "gallery" });
    const n = await s.ev(`[...document.images].filter(i => /^(blob|data):/.test(i.src) && i.getBoundingClientRect().width > 40).length`);
    if (n < 3) throw new Error(`gallery shows ${n} items after two saves`);
  });
}
