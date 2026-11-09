import { openCamera, hasImg } from "../h.mjs";
const confirmUp = `!!document.querySelector('[aria-label=save]')`;
export default async function flowCameraCapture(s) {
  await openCamera(s, { fresh: true });
  // auto-save off so the explicit save button is exercised
  await s.ev(`localStorage.setItem('b612.camera.autoSave','false')`);
  await s.goto("/", { settle: 500 }); await openCamera(s);

  await s.step("shutter-tap", async () => {
    await s.click({ label: "shutter" }, { settle: 300 });
    await s.waitFor(confirmUp, { timeout: 10000, msg: "confirm screen" });
    await s.waitVisible("Back"); await s.waitVisible("Share"); await s.waitVisible("Edit");
    await s.waitFor(`[...document.images].some(i => i.src.startsWith('blob:') && i.naturalWidth > 100)`, { timeout: 5000, msg: "captured image rendered" });
  });
  await s.step("confirm-whitespace", async () => {
    await s.click({ label: "Ratio" }, { settle: 900 });
    await s.waitVisible({ label: "close" }, { timeout: 3000 });
    await s.click({ label: "close" }, { settle: 900 });
  });
  await s.step("confirm-save", async () => {
    await s.click({ label: "save" }, { settle: 300 });
    await s.waitFor(`${hasImg("end_story_save_confirm")} || document.body.innerText.includes('Saved') || [...document.querySelectorAll('[aria-label=save]')].some(b => b.disabled)`, { timeout: 8000, msg: "saved state" });
    await s.sleep(800);
  });
  await s.step("back-to-camera-thumb", async () => {
    await s.click("Back", { settle: 1200 });
    await s.waitFor(`!${confirmUp}`, { timeout: 4000, msg: "confirm closed" });
    await s.waitFor(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Edit'); return b && [...b.querySelectorAll('img')].some(i => i.src.startsWith('blob:') || i.src.startsWith('data:')); })()`, { timeout: 6000, msg: "gallery thumbnail on the Edit button" });
  });
  await s.step("gallery-has-photo", async () => {
    await s.click("Edit", { settle: 2000 });
    await s.waitFor(`location.pathname === '/gallery'`, { timeout: 8000 });
    await s.waitFor(`[...document.images].filter(i => (i.src.startsWith('blob:') || i.src.startsWith('data:')) && i.getBoundingClientRect().width > 40).length > 0`, { timeout: 8000, msg: "gallery thumbnail" });
  });
  await s.step("shoot-then-edit-pill", async () => {
    await s.goto("/"); await openCamera(s);
    await s.click({ label: "shutter" }, { settle: 300 });
    await s.waitFor(confirmUp, { timeout: 10000, msg: "confirm screen" });
    await s.sleep(600);
    await s.click("Edit", { settle: 2500 });
    await s.waitFor(`location.pathname === '/edit'`, { timeout: 10000, msg: "editor route" });
    await s.waitFor(`document.querySelector('canvas') || [...document.images].some(i => i.src.startsWith('blob:'))`, { timeout: 10000, msg: "editor image" });
  });
  await s.step("timer-shot", async () => {
    await s.goto("/"); await openCamera(s);
    await s.click("Timer"); // 3 s
    await s.click({ label: "shutter" }, { settle: 1200 });
    await s.waitFor(`/^[0-9]$/.test(document.body.innerText.match(/\\n([0-9])\\n/)?.[1] ?? '') || [...document.querySelectorAll('div')].some(d => /^[123]$/.test(d.innerText) && parseFloat(getComputedStyle(d).fontSize) >= 50)`, { timeout: 3000, msg: "countdown digits" }).catch(() => {});
    await s.waitFor(confirmUp, { timeout: 9000, msg: "confirm after timer" });
    await s.click("Back", { settle: 800 });
    await s.click("Timer"); await s.click("Timer"); // back to off
  });
  await s.ev(`localStorage.removeItem('b612.camera.autoSave')`);
}
