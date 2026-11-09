// Hardware back (Escape) through the shared helper (src/lib/back.ts): one press closes exactly the top-most thing —
// photo editor sub/tool pages, AR filter page, stamp shop, leave dialog, share bar; video editor 2-depth pages, music
// list, leave dialog; collage leave dialog; Discover profile More sheet / report sheet / block dialog; camera panels.
import { SCRATCH } from "../lib.mjs";
import { importToGallery, nthThumb, editorMain, previewThumb, diff, openCamera, hasImg } from "../h.mjs";

const at = (p) => `location.pathname === ${JSON.stringify(p)}`;
const esc = async (s, settle = 700) => { await s.key("Escape"); await s.sleep(settle); };
const vmain = `[...document.querySelectorAll('button[aria-label=Trim]')].some(b => b.getBoundingClientRect().top > 780)`;
const LEAVE = "Are you sure you want to leave without saving?";

async function openTab(s, tab) {
  const pos = `(() => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(tab)} && b.getBoundingClientRect().top > 780); if (!b) return null; const r = b.getBoundingClientRect(); return r.left + r.width / 2; })()`;
  for (let i = 0; i < 4; i++) {
    const x = await s.ev(pos);
    if (x == null) throw new Error(`no tab ${tab}`);
    if (x > 20 && x < 370) break;
    await s.swipe(x > 370 ? [330, 818] : [60, 818], x > 370 ? [60, 818] : [330, 818], { settle: 700 });
  }
  await s.click(tab, { settle: 1200 });
}
const scrollerItem = (label) => `(() => { const sc = [...document.querySelectorAll('div')].filter(d => d.scrollWidth > d.clientWidth + 5 && d.getBoundingClientRect().top > 650 && d.getBoundingClientRect().top < 790)[0]; const b = sc && [...sc.querySelectorAll('button')].find(b => b.innerText.trim().replace(/\\s+/g, ' ') === ${JSON.stringify(label)}); if (!b) return null; sc.scrollTo({ left: Math.max(0, b.offsetLeft - 120) }); return true; })()`;
async function tapItem(s, label) {
  if (!(await s.ev(scrollerItem(label)))) throw new Error(`no item ${label}`);
  await s.sleep(450);
  await s.click(label, { settle: 1500 });
}

export default async function flowBackKey(s) {
  /* ------------------------------------------------------------------ photo editor */
  await s.step("editor-open", async () => {
    await s.goto("/gallery", { settle: 1500 });
    await importToGallery(s, [SCRATCH + "/user.jpg"]);
    await s.tapAt(...(await s.ev(nthThumb(0)))); await s.sleep(3000);
    await s.waitFor(at("/edit"), { timeout: 8000 });
    await s.waitFor(editorMain, { timeout: 15000, msg: "editor tabs" });
    await s.sleep(2000);
  });
  await s.step("editor-esc-closes-crop-subpage", async () => {
    await openTab(s, "Tools"); await tapItem(s, "Crop");
    await s.assert(`!(${editorMain})`, "crop page open");
    await s.shot("crop-open");
    await esc(s, 1000);
    await s.waitFor(editorMain, { timeout: 3000, msg: "crop closed by back" });
    await s.assert(at("/edit"), "still in the editor");
  });
  await s.step("editor-esc-closes-tool-page", async () => {
    await openTab(s, "Portrait"); await tapItem(s, "Face"); await s.sleep(2500);
    await s.assert(`!(${editorMain})`, "Face tool page open");
    await esc(s, 1000);
    await s.waitFor(editorMain, { timeout: 3000, msg: "tool page closed by back" });
    await s.assert(at("/edit"), "still in the editor");
  });
  await s.step("editor-esc-closes-ar-filter-and-drops-pick", async () => {
    const before = await s.ev(previewThumb);
    await openTab(s, "AR filter");
    await s.waitFor(`!!document.querySelector('[data-ar-panel]')`, { timeout: 4000 });
    await s.ev(`(() => { const b = document.querySelector('[data-sticker="9000600"]'); const sc = b.closest('.overflow-y-auto'); sc.scrollTo({ top: b.offsetTop - 10 }); })()`); await s.sleep(300);
    await s.click({ sel: '[data-sticker="9000600"]' }, { settle: 4000 });
    await s.shot("ar-picked");
    await esc(s, 1500);
    await s.waitFor(`!document.querySelector('[data-ar-panel]') && ${editorMain}`, { timeout: 3000, msg: "AR filter page closed by back" });
    const after = await s.ev(previewThumb);
    const d = diff(before, after);
    if (d > 0.5) throw new Error(`back kept the AR filter pick (diff ${d.toFixed(2)})`);
  });
  await s.step("editor-esc-closes-text-keyboard-then-page", async () => {
    await openTab(s, "Text");
    await s.waitVisible("Done", { timeout: 4000 });
    await s.assert(`document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)`, "text field focused");
    await esc(s, 600);
    await s.assert(`!(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))`, "first back closes the keyboard");
    for (let i = 0; i < 3 && !(await s.ev(editorMain)); i++) await esc(s, 900);
    await s.waitFor(editorMain, { timeout: 3000, msg: "text page closed by back" });
  });
  await s.step("editor-esc-closes-stamp-shop", async () => {
    await openTab(s, "Stickers"); await s.sleep(800);
    await s.click({ label: "Sticker shop" }, { settle: 1500 });
    await s.waitFor(`document.body.innerText.includes('Sticker')`, { timeout: 4000 });
    await s.shot("shop-open");
    const shopUp = `[...document.querySelectorAll('div')].some(d => d.className.includes('z-[96]') && d.getBoundingClientRect().top < 100)`;
    await s.assert(shopUp, "stamp shop open");
    await esc(s, 900);
    await s.assert(`!(${shopUp})`, "stamp shop closed by back");
    for (let i = 0; i < 3 && !(await s.ev(editorMain)); i++) await esc(s, 900);
    await s.waitFor(editorMain, { timeout: 3000, msg: "back on the editor main menu" });
  });
  await s.step("editor-esc-leave-dialog", async () => {
    await openTab(s, "Filters"); await s.click("Daily", { settle: 1200 });
    await esc(s, 800);
    await s.waitVisible(LEAVE, { timeout: 3000 });
    await s.shot("leave-dialog");
    await esc(s, 800);
    await s.assert(`!document.body.innerText.includes(${JSON.stringify(LEAVE)})`, "back cancels the leave dialog");
    await s.assert(at("/edit"), "still in the editor");
  });
  await s.step("editor-esc-share-bar-then-saved-page", async () => {
    await s.click("SAVE", { settle: 3000 });
    await s.waitVisible("Saved!", { timeout: 15000 });
    await s.click({ label: "Share" }, { settle: 900 });
    await s.waitVisible("More", { timeout: 3000 });
    await s.shot("share-bar");
    await esc(s, 900);
    await s.assert(`document.body.innerText.includes('Saved!') && ![...document.querySelectorAll('span')].some(e => e.innerText === 'More' && e.getBoundingClientRect().top < 844 && e.getBoundingClientRect().top > 600)`, "share bar closed, Saved! page kept");
    await esc(s, 1500);
    await s.waitFor(at("/gallery"), { timeout: 5000, msg: "back on Saved! → gallery" });
  });

  /* ------------------------------------------------------------------ video editor */
  await s.step("video-open", async () => {
    // 3 s clip made from the user's photo in the scratchpad (never copied into the repo), imported via the gallery
    if ((await s.ev("location.pathname")) !== "/gallery") await s.goto("/gallery", { settle: 1500 });
    await s.setFile("input[type=file]", [SCRATCH + "/e2e/user-face.mp4"]);
    await s.sleep(2500);
    await s.click("Videos", { settle: 1200 });
    const cell = await s.locate("00:03", { exact: false });
    if (!cell) throw new Error("no video cell");
    await s.tapAt(cell.x, cell.y - 30);
    await s.waitFor(at("/video-edit"), { timeout: 5000 }).catch(async () => { await s.tapAt(cell.x, cell.y - 30); });
    await s.waitFor(at("/video-edit"), { timeout: 8000 });
    await s.waitFor(vmain, { timeout: 10000 });
  });
  await s.step("video-esc-closes-two-depth", async () => {
    await s.click({ label: "Beauty" }, { settle: 1500 });
    await s.assert(`!(${vmain})`, "Beauty page open");
    await esc(s, 900);
    await s.waitFor(vmain, { timeout: 3000, msg: "Beauty page closed by back" });
    await s.assert(at("/video-edit"), "still in the video editor");
  });
  await s.step("video-esc-closes-music-list", async () => {
    await s.click({ label: "Music" }, { settle: 1200 });
    await s.click("Choose music", { settle: 1200 });
    await s.waitVisible("Add Music", { timeout: 3000 });
    await esc(s, 900);
    await s.assert(`!document.body.innerText.includes('Add Music')`, "music list closed by back");
    await s.assert(at("/video-edit"), "still in the video editor");
  });
  await s.step("video-esc-leave-dialog", async () => {
    await s.click({ label: "Rotate" }, { settle: 900 });
    await esc(s, 800);
    await s.waitVisible(LEAVE, { timeout: 3000 });
    await esc(s, 800);
    await s.assert(`!document.body.innerText.includes(${JSON.stringify(LEAVE)})`, "back cancels the leave dialog");
    await esc(s, 800);
    await s.click("Leave", { settle: 1500 });
    await s.waitFor(at("/gallery"), { timeout: 5000, msg: "left the video editor" });
  });

  /* ------------------------------------------------------------------ collage */
  await s.step("collage-esc-leave-dialog", async () => {
    await s.goto("/gallery", { settle: 1500 });
    await s.click("All", { settle: 800 }).catch(() => {});
    await s.click("Layout", { settle: 1200 });
    for (const n of [0, 1]) { const p = await s.ev(nthThumb(n)); await s.tapAt(p[0] - 20, p[1] - 20); await s.sleep(400); }
    await s.click("NEXT", { settle: 2500 });
    await s.waitFor(at("/collage"), { timeout: 6000 });
    await esc(s, 800);
    await s.waitVisible(LEAVE, { timeout: 3000 });
    await esc(s, 800);
    await s.assert(`!document.body.innerText.includes(${JSON.stringify(LEAVE)}) && ${at("/collage")}`, "back cancels the collage leave dialog");
    await esc(s, 800);
    await s.click("Leave", { settle: 1200 });
    await s.waitFor(at("/gallery"), { timeout: 5000, msg: "collage → gallery" });
  });

  /* ------------------------------------------------------------------ Discover sheets */
  await s.step("profile-more-sheet-esc", async () => {
    await s.goto("/discover/profile/peachy", { settle: 1500 });
    await s.click({ label: "More" }, { settle: 700 });
    await s.waitVisible("Share profile");
    await s.shot("more-sheet");
    await esc(s, 700);
    await s.waitFor(`!document.body.innerText.includes('Share profile')`, { timeout: 3000, msg: "More sheet closed by back" });
    await s.assert(`location.pathname.startsWith('/discover/profile/')`, "still on the profile");
  });
  await s.step("profile-report-sheet-esc", async () => {
    await s.click({ label: "More" }, { settle: 700 });
    await s.click("Report", { settle: 900 });
    await s.waitVisible("Why are you reporting this user?", { timeout: 3000 });
    await s.shot("report-sheet");
    await esc(s, 900);
    await s.waitFor(`!document.body.innerText.includes('Why are you reporting this user?')`, { timeout: 3000, msg: "report sheet closed by back" });
    await s.assert(`!document.body.innerText.includes('Share profile') && location.pathname.startsWith('/discover/profile/')`, "nothing else closed");
  });
  await s.step("profile-block-dialog-esc", async () => {
    await s.click({ label: "More" }, { settle: 700 });
    if (!(await s.exists("Block"))) throw new Error("no Block row for a non-creator account");
    await s.click("Block", { settle: 700 });
    await s.waitVisible("User Block Confirm", { timeout: 3000 });
    await s.shot("block-dialog");
    await esc(s, 700);
    await s.assert(`!document.body.innerText.includes('User Block Confirm') && location.pathname.startsWith('/discover/profile/')`, "block dialog closed by back");
  });

  /* ------------------------------------------------------------------ camera panels */
  await s.step("camera-esc-closes-panels", async () => {
    await openCamera(s, { fresh: true });
    await s.click("Filter");
    await s.waitVisible("Original", { timeout: 4000 });
    await esc(s, 800);
    await s.waitFor(`![...document.querySelectorAll('button,span,div')].some(e => e.innerText === 'Original' && e.getBoundingClientRect().width > 0)`, { timeout: 3000, msg: "filter panel closed by back" });
    await s.click("More");
    await s.waitVisible("Night mode");
    await esc(s, 800);
    await s.waitFor(`!(${hasImg("menu_more_setting")})`, { timeout: 3000, msg: "More panel closed by back" });
    await s.assert(at("/"), "still on the camera");
  });
}
