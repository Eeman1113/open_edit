// AI tools tab: the launcher opens each tool's photo picker; picking a photo opens the editor straight on that tool,
// which runs on the device. Also the /aimode app link and the "Choose from device" import in the picker.
import { navActive, importToGallery, TEST_PHOTO, SAMPLE_PHOTO, aiDone, audit } from "../h.mjs";

const TOOLS = [
  ["enhance", "Enhance"], ["remove", "Remove"], ["generativefill", "Expand"], ["dslr", "Depth blur"], ["cutout", "Cutout"], ["HAIRCOLOR", "Hair colour"],
];
// the editor's page title for each tool
const PAGE = { enhance: "Enhance", remove: "Erase", generativefill: "Expand", dslr: "Depth blur", cutout: "Cutout", HAIRCOLOR: "Hair colour" };
const pickerThumb = `(() => { const i = [...document.querySelectorAll('[role=dialog] img, img')].find(i => i.closest('button') && i.src.startsWith('blob:') && i.getBoundingClientRect().width > 60 && i.getBoundingClientRect().top > 200); if (!i) return null; const r = i.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`;

export default async function flowAi(s) {
  await s.step("ai-tab", async () => {
    await s.goto("/gallery", { settle: 1000 });
    await importToGallery(s, [TEST_PHOTO]);
    await s.goto("/ai", { settle: 1000 });
    for (const [, name] of TOOLS) await s.waitVisible(name, { timeout: 4000 });
    await s.assert(navActive("/ai"), "AI tab selected");
    await s.assert(`document.querySelectorAll('[data-tool]').length === ${TOOLS.length}`, "one card per tool");
    await audit(s);
  });
  for (const [tool, name] of TOOLS) {
    await s.step(`tool-${tool.toLowerCase()}`, async () => {
      if ((await s.ev("location.pathname")) !== "/ai") await s.goto("/ai", { settle: 1000 });
      await s.tap({ sel: `[data-tool="${tool}"]` }, { settle: 1200 });
      await s.waitVisible(`${name}: choose a photo`, { timeout: 4000 });
      await s.waitFor(`!!(${pickerThumb})`, { timeout: 8000, msg: "gallery photos in the picker" });
      await audit(s, "picker");
      await s.tapAt(...(await s.ev(pickerThumb))); await s.sleep(2500);
      await s.waitFor(`location.pathname === '/edit' && location.search.includes('tool=${tool}')`, { timeout: 8000, msg: "editor with the tool" });
      await s.waitVisible(PAGE[tool], { timeout: 15000 });
      await s.waitFor(`!!document.querySelector('[aria-label=Apply]')`, { timeout: 15000, msg: "tool page open" });
      await aiDone(s);
      await s.shot(`${tool}-open`);
      await audit(s, PAGE[tool]);
      await s.click({ label: "Cancel" }, { settle: 1000 });
      await s.waitFor(`!!document.querySelector('[aria-label="Editor sections"]')`, { timeout: 6000, msg: "editor dock after Cancel" });
    });
  }
  await s.step("picker-choose-from-device", async () => {
    await s.goto("/ai", { settle: 1000 });
    await s.tap({ sel: '[data-tool="dslr"]' }, { settle: 1200 });
    await s.waitVisible("Choose from device", { timeout: 4000 });
    await s.setFile('input[type=file][accept*="image"]', [SAMPLE_PHOTO]);
    await s.waitFor(`location.pathname === '/edit' && location.search.includes('tool=dslr')`, { timeout: 15000, msg: "imported photo opens in the tool" });
    await s.waitVisible("Depth blur", { timeout: 15000 });
    await aiDone(s);
  });
  await s.step("aimode-link", async () => {
    await s.goto("/aimode?tool=cutout", { settle: 2000 });
    await s.waitVisible("Cutout: choose a photo", { timeout: 5000 });
    await s.key("Escape"); await s.sleep(800);
    await s.waitFor(`!document.body.innerText.includes('Cutout: choose a photo')`, { timeout: 3000, msg: "picker closed by back" });
    await audit(s);
  });
}
