import { openCamera, hasImg, textOn } from "../h.mjs";

const vmenuIcon = (prefix) => `[...document.querySelectorAll('img')].filter(i => i.src.includes('/${prefix}') && i.getBoundingClientRect().width > 0).map(i => i.src.split('/').pop()).join(',')`;
const PREVIEW = [195, 330]; // empty preview area (tap closes panels)

export default async function flowCameraControls(s) {
  await openCamera(s, { fresh: true });

  await s.step("more-panel", async () => {
    await s.click("More");
    await s.waitVisible("Night mode"); await s.waitVisible("Auto save"); await s.waitVisible("Makeup");
    await s.waitVisible("Touch"); await s.waitVisible("Settings");
    // toggle Auto save switch and back
    const before = await s.ev(`[...document.querySelectorAll('[role=switch]')].map(x => x.getAttribute('aria-checked')).join()`);
    await s.click("Auto save");
    const after = await s.ev(`[...document.querySelectorAll('[role=switch]')].map(x => x.getAttribute('aria-checked')).join()`);
    if (before === after) throw new Error("Auto save switch did not toggle");
    await s.click("Auto save");
  });
  await s.step("more-panel-timer-touch", async () => {
    const t0 = await s.ev(vmenuIcon("menu_more_timer"));
    await s.click("Timer", { within: null, nth: 0 });
    const t1 = await s.ev(vmenuIcon("menu_more_timer"));
    if (t0 === t1) throw new Error(`More>Timer icon did not change (${t0})`);
    await s.click("Touch"); await s.waitVisible("Touch the screen to start shooting.", { timeout: 3000 });
    await s.click("Touch");
    // back to timer off
    while (!(await s.ev(vmenuIcon("menu_more_timer_off")))) await s.click("Timer");
    await s.tapAt(195, 520); // tapping the preview closes the More panel
    await s.sleep(700);
    await s.waitFor(`!(${hasImg("menu_more_setting")})`, { timeout: 3000, msg: "more closed" });
  });

  await s.step("flash-cycle", async () => {
    const seen = new Set([await s.ev(vmenuIcon("icon_vertical_flash")) + await s.ev(vmenuIcon("icon_vertical_torch"))]);
    for (let i = 0; i < 3; i++) { await s.click("Flash"); seen.add(await s.ev(vmenuIcon("icon_vertical_flash")) + await s.ev(vmenuIcon("icon_vertical_torch"))); }
    if (seen.size < 2) throw new Error("flash icon never changed: " + [...seen]);
    // return to off
    for (let i = 0; i < 4 && !(await s.ev(vmenuIcon("icon_vertical_flash_off"))); i++) await s.click("Flash");
  });

  await s.step("timer-cycle", async () => {
    await s.click("Timer");
    await s.waitFor(hasImg("icon_vertical_timer_3"), { timeout: 2000, msg: "timer 3s icon" });
    await s.click("Timer");
    await s.waitFor(hasImg("icon_vertical_timer_7"), { timeout: 2000, msg: "timer 7s icon" });
    await s.click("Timer");
    await s.waitFor(`!(${hasImg("icon_vertical_timer_7")}) && !(${hasImg("icon_vertical_timer_3")})`, { timeout: 2000, msg: "timer off" });
  });

  await s.step("ratio-pill", async () => {
    await s.click("Ratio");
    await s.waitVisible({ label: "1:1" }, { timeout: 3000 });
    await s.click({ label: "1:1" }, { settle: 1200 });
    await s.waitFor(`localStorage.getItem('b612.camera.ratio')?.includes('1:1') || ${hasImg("icon_vertical_ratio_1_1")} || [...document.querySelectorAll('img')].some(i=>/ratio.*1.?1/.test(i.src))`, { timeout: 3000, msg: "ratio 1:1 selected" });
  });
  await s.step("ratio-back-full", async () => {
    await s.click("Ratio");
    await s.click({ label: "9:16" }, { settle: 1200 });
  });

  await s.step("bounce", async () => {
    await s.ev(`(document.querySelector('[aria-label=collapse]')?.parentElement?.querySelector('.no-scrollbar, [class*=overflow-y]') ?? null)?.scrollTo?.(0, 999)`);
    await s.click("Bounce");
    await s.waitFor(hasImg("icon_vertical_bounce_on"), { timeout: 2000, msg: "bounce on" });
    await s.click("Bounce");
    await s.waitFor(hasImg("icon_vertical_bounce_off"), { timeout: 2000, msg: "bounce off" });
  });

  await s.step("layout-grid", async () => {
    await s.click("Layout");
    await s.waitVisible({ label: "ONE_BY_TWO" }, { timeout: 3000 });
    await s.click({ label: "ONE_BY_TWO" });
    await s.waitVisible("Change", { timeout: 3000 });
    await s.click("Layout"); // LAYOUT_ON (closeMark) turns it off
    await s.waitVisible("Bounce", { timeout: 3000 });
  });

  await s.step("music", async () => {
    await s.click("Music");
    await s.waitVisible("Add Music", { timeout: 4000 });
    await s.click({ label: "close" });
    await s.waitFor(`!${textOn("Add Music")}`, { timeout: 3000, msg: "music closed" });
  });

  await s.step("vertical-collapse-expand", async () => {
    await s.click({ label: "collapse" }, { settle: 700 });
    await s.waitVisible({ label: "expand" }, { timeout: 2000 });
    await s.click({ label: "expand" }, { settle: 700 });
    await s.waitVisible("More", { timeout: 2000 });
  });

  await s.step("filter-panel", async () => {
    await s.click("Filter");
    await s.waitVisible("Original", { timeout: 4000 });
    await s.click("Milk", { settle: 1200 });
    await s.waitVisible("Milk", { timeout: 2500 }); // filter-name toast or the item
    await s.click("Jelly", { settle: 900 });
    await s.click("BASIC").catch(() => {});
  });
  await s.step("filter-inventory", async () => {
    await s.click({ label: "more" }, { settle: 900 });
    await s.waitVisible("Filters", { timeout: 4000 });
    await s.click({ label: "favorite" });
    await s.click({ label: "favorite" });
    await s.key("Escape");
    await s.waitFor(`!${textOn("Filters\n")} && ![...document.querySelectorAll('div')].some(d => d.innerText === 'Filters' && d.getBoundingClientRect().width > 0)`, { timeout: 3000, msg: "inventory closed" });
  });
  await s.step("filter-original-close", async () => {
    await s.click("Original", { settle: 800 });
    await s.click({ label: "close" }, { settle: 800 });
    await s.waitVisible("Beauty", { timeout: 3000 });
  });

  await s.step("beauty-tabs", async () => {
    await s.click("Beauty", { settle: 900 });
    for (const t of ["Advanced", "Makeup", "Beauty"]) { await s.click(t, { settle: 700, nth: 0 }); }
    await s.click({ label: "close" }, { settle: 800 });
    await s.waitVisible("Effects", { timeout: 3000 });
  });

  await s.step("effects", async () => {
    await s.click("Effects", { settle: 1500 });
    await s.waitVisible({ label: "none" }, { timeout: 4000 });
    const n = await s.ev(`document.querySelectorAll('img[src*="sticker"], img[src*="thumb"]').length`);
    if (!n) throw new Error("no effect thumbnails");
    await s.tapAt(...PREVIEW); await s.sleep(800);
    await s.waitVisible("Effects", { timeout: 3000 });
  });

  await s.step("mode-video", async () => {
    await s.click("VIDEO", { settle: 900 });
    await s.waitVisible("Duration", { timeout: 3000 });
    await s.click("Duration");
    await s.waitVisible("15m", { timeout: 2000 });
    await s.click("30m", { settle: 600 });
    await s.click("NORMAL", { settle: 900 });
    await s.waitVisible("Bounce", { timeout: 3000 }).catch(async () => s.waitVisible("Ratio"));
  });

  await s.step("switch-camera", async () => {
    await s.click({ label: "switch camera" }, { settle: 1500 });
    await s.assert(`!!document.querySelector('[aria-label="shutter"]')`, "still on camera");
  });
}
