// Video editor (VideoEditFragment): every tab once, then save.
const vmain = `[...document.querySelectorAll('button[aria-label=Trim]')].some(b => b.getBoundingClientRect().top > 780)`;
async function backToMain(s) {
  for (let i = 0; i < 5 && !(await s.ev(vmain)); i++) {
    const c = (await s.locate({ label: "close" })) ?? (await s.locate({ label: "Close" })) ?? (await s.locate({ label: "cancel" })) ?? (await s.locate({ label: "confirm" }));
    if (c) { await s.tapAt(c.x, c.y); await s.sleep(900); } else { await s.key("Escape"); await s.sleep(600); }
    for (const t of ["Discard", "OK", "Yes"]) if (await s.exists(t)) { await s.click(t, { settle: 600 }); break; }
  }
  if (!(await s.ev(vmain))) throw new Error("could not return to the video editor main menu");
}
export default async function flowVideoEditor(s) {
  await s.step("open-video-editor", async () => {
    await s.goto("/gallery?__seed=1", { settle: 5000 });
    await s.click("Videos", { settle: 1200 });
    const cell = await s.locate("01:15", { exact: false });
    if (!cell) throw new Error("no video cell");
    await s.tapAt(cell.x, cell.y - 30); await s.sleep(4000);
    await s.waitFor(`location.pathname === '/video-edit'`, { timeout: 8000 });
    await s.waitFor(vmain, { timeout: 10000, msg: "video editor tabs" });
    await s.waitFor(`[...document.querySelectorAll('video')].some(v => v.readyState >= 2) || [...document.querySelectorAll('canvas')].some(c => c.width > 50)`, { timeout: 10000, msg: "video frame" });
  });
  await s.step("top-controls", async () => {
    await s.click({ label: "Sound" }, { settle: 600 });
    await s.click({ label: "Rotate" }, { settle: 900 });
    await s.click({ label: "Rotate" }, { settle: 900 }); await s.click({ label: "Rotate" }, { settle: 900 }); await s.click({ label: "Rotate" }, { settle: 900 });
    await s.click({ label: "Sound" }, { settle: 600 });
  });
  const tabs = await s.ev(`[...document.querySelectorAll('button[aria-label]')].filter(b => b.getBoundingClientRect().top > 780).map(b => b.getAttribute('aria-label'))`);
  for (const tab of tabs) {
    await s.step(`tab-${tab}`, async () => {
      await backToMain(s);
      const x = await s.ev(`(() => { const b = [...document.querySelectorAll('button[aria-label]')].find(b => b.getAttribute('aria-label') === ${JSON.stringify(tab)} && b.getBoundingClientRect().top > 780); const r = b.getBoundingClientRect(); return r.left + r.width / 2; })()`);
      if (x > 370) await s.swipe([330, 818], [60, 818], { settle: 700 });
      await s.click({ label: tab }, { settle: 2000 });
      await s.shot(`tab-${tab}-open`);
      // touch the first option of the panel, if any (e.g. a speed, a filter, a beauty item)
      const opt = await s.ev(`(() => { const b = [...document.querySelectorAll('button')].filter(b => { const r = b.getBoundingClientRect(); return r.top > 620 && r.top < 780 && r.width > 20 && r.left > 30; })[1]; if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
      if (opt) { await s.tapAt(...opt); await s.sleep(1200); }
      await backToMain(s);
    });
  }
  await s.step("trim-shorter", async () => {
    if (!(await s.exists({ label: "Trim" }))) await s.swipe([60, 818], [330, 818], { settle: 700 });
    await s.click({ label: "Trim" }, { settle: 1200 });
    // drag the right trim handle well to the left so the real-time export stays short
    await s.drag([343, 723], [110, 723], { steps: 20, ms: 600, settle: 1500 });
    const t = await s.ev(`[...document.querySelectorAll('div,span')].map(e => e.textContent.trim()).find(t => /^\\d\\d:\\d\\d$/.test(t))`);
    if (t === "01:15") throw new Error("trim did not change the duration");
  });
  await s.step("play", async () => {
    const p = await s.locate({ label: "play" });
    if (p) { await s.tapAt(p.x, p.y); await s.sleep(1500); }
  });
  await s.step("save", async () => {
    await s.click("SAVE", { settle: 1500 });
    await s.waitFor(`/Saving video|Saved/.test(document.body.innerText)`, { timeout: 8000, msg: "save progress dialog" });
    await s.shot("saving");
    await s.waitFor(`/Saved!/.test(document.body.innerText)`, { timeout: 90000, msg: "Saved! screen" });
  });
}
