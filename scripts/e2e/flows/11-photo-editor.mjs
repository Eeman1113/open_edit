import { TEST_PHOTO, importToGallery, nthThumb, editorMain, previewStats, previewThumb, diff } from "../h.mjs";

async function backToMain(s) {
  for (let i = 0; i < 5 && !(await s.ev(editorMain)); i++) {
    // AI tools show a blocking loading popup (AiLoading) while the model prepares: let it finish, else cancel it
    if (await s.exists({ label: "Cancel" })) {
      await s.waitFor(`!document.querySelector('[aria-label=Cancel]')`, { timeout: 20000 }).catch(() => {});
      const x = await s.locate({ label: "Cancel" });
      if (x) { await s.tapAt(x.x, x.y); await s.sleep(900); continue; }
    }
    const c = (await s.locate({ label: "Close" })) ?? (await s.locate("Cancel")) ?? (await s.locate({ label: "close" })) ?? (await s.locate({ label: "Confirm" }));
    if (c) { await s.tapAt(c.x, c.y); await s.sleep(900); } else { await s.key("Escape"); await s.sleep(600); }
    // "discard changes?" style dialogs
    for (const t of ["Discard", "OK", "Yes", "Leave"]) if (await s.exists(t)) { await s.click(t, { settle: 600 }); break; }
  }
  if (!(await s.ev(editorMain))) throw new Error("could not return to the editor main menu");
}
async function openTab(s, tab) {
  const pos = `(() => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(tab)} && b.getBoundingClientRect().top > 780); if (!b) return null; const r = b.getBoundingClientRect(); return r.left + r.width / 2; })()`;
  for (let i = 0; i < 4; i++) {
    const x = await s.ev(pos);
    if (x == null) throw new Error(`no tab ${tab}`);
    if (x > 20 && x < 370) break;
    await s.swipe(x > 370 ? [330, 818] : [60, 818], x > 370 ? [60, 818] : [330, 818], { settle: 700 }); // finger-scroll the tab bar
  }
  await s.click(tab, { settle: 1200 });
}
const listItems = `(() => { const sc = [...document.querySelectorAll('div')].filter(d => d.scrollWidth > d.clientWidth + 5 && d.getBoundingClientRect().top > 650 && d.getBoundingClientRect().top < 790)[0]; return sc ? [...sc.querySelectorAll('button')].map(b => b.innerText.trim().replace(/\\s+/g, ' ')).filter(Boolean) : []; })()`;
async function tapItem(s, label) {
  const ok = await s.ev(`(() => { const sc = [...document.querySelectorAll('div')].filter(d => d.scrollWidth > d.clientWidth + 5 && d.getBoundingClientRect().top > 650 && d.getBoundingClientRect().top < 790)[0]; const b = sc && [...sc.querySelectorAll('button')].find(b => b.innerText.trim().replace(/\\s+/g, ' ') === ${JSON.stringify(label)}); if (!b) return false; sc.scrollTo({ left: Math.max(0, b.offsetLeft - 120) }); return true; })()`);
  if (!ok) throw new Error(`no item ${label}`);
  await s.sleep(450);
  const p = await s.ev(`(() => { const sc = [...document.querySelectorAll('div')].filter(d => d.scrollWidth > d.clientWidth + 5 && d.getBoundingClientRect().top > 650 && d.getBoundingClientRect().top < 790)[0]; const b = [...sc.querySelectorAll('button')].find(b => b.innerText.trim().replace(/\\s+/g, ' ') === ${JSON.stringify(label)}); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await s.tapAt(...p);
}

export default async function flowPhotoEditor(s) {
  await s.step("open-editor", async () => {
    await s.goto("/gallery", { settle: 1500 });
    await importToGallery(s, [TEST_PHOTO]);
    await s.tapAt(...(await s.ev(nthThumb(0)))); await s.sleep(3000);
    await s.waitFor(`location.pathname === '/edit'`, { timeout: 8000 });
    await s.waitFor(editorMain, { timeout: 10000, msg: "editor tabs" });
    const st = await s.ev(previewStats);
    if (!st || st.std < 10) throw new Error("preview flat: " + JSON.stringify(st));
  });

  // ---- face bugs reported by face-integration (each has its own proof shot) ----
  let before;
  await s.step("face-right-daily-035", async () => {
    before = await s.ev(previewThumb);
    await openTab(s, "Portrait"); await tapItem(s, "Face"); await s.sleep(5000); // face detection
    await s.tapAt(235, 330); await s.sleep(1800); // select the right face (zooms onto it)
    await s.tapAt(33, 728); await s.sleep(800); // "Face" shapes
    await s.click("Daily", { settle: 1200 });
    await s.drag([79, 631], [145, 631], { settle: 3500 }); // ≈ 0.35
    const st = await s.ev(previewStats);
    if (!st || st.w < 100 || st.std < 10) throw new Error("preview turned flat: " + JSON.stringify(st));
  });
  await s.step("face-right-slim", async () => {
    await s.click("Slim", { settle: 1200 });
    await s.drag([79, 631], [145, 631], { settle: 3500 });
    const st = await s.ev(previewStats);
    if (!st || st.w < 100 || st.std < 10) throw new Error("preview turned flat: " + JSON.stringify(st));
  });
  await s.step("face-hold-original-zoomed", async () => {
    const o = await s.locate({ xy: [363, 631] });
    await s.mouse("mouseMoved", o.x, o.y); await s.mouse("mousePressed", o.x, o.y, { buttons: 1 }); await s.sleep(700);
    const r = await s.ev(`(() => { const img = [...document.querySelectorAll('[data-preview] img')].find(i => i.getBoundingClientRect().width > 0); const c = document.querySelector('[data-preview] canvas'); if (!img || !c) return null; const a = img.getBoundingClientRect(), b = c.getBoundingClientRect(); return [a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height].map(Math.round); })()`);
    await s.shot("held");
    await s.mouse("mouseReleased", o.x, o.y); await s.sleep(500);
    if (!r) throw new Error("no original image while holding");
    const [ax, ay, aw, ah, bx, by, bw, bh] = r;
    if (Math.abs(ax - bx) > 2 || Math.abs(ay - by) > 2 || Math.abs(aw - bw) > 2 || Math.abs(ah - bh) > 2) throw new Error(`original misplaced: img ${r.slice(0, 4)} vs preview ${r.slice(4)}`);
  });
  await s.step("face-confirm-keeps-edit", async () => {
    await s.click({ label: "Confirm" }, { settle: 2500 });
    await s.waitFor(editorMain, { timeout: 5000 });
    const after = await s.ev(previewThumb);
    const d = diff(before, after);
    if (d < 0.3) throw new Error(`main preview identical to the unedited photo after ✓ (diff ${d.toFixed(2)})`);
    await s.assert(`!!document.querySelector('[aria-label=Undo], [aria-label=undo]') || [...document.querySelectorAll('button')].some(b => b.getBoundingClientRect().top > 600 && b.getBoundingClientRect().top < 660)`, "undo row");
  });

  // ---- every tab and tool once ----
  const tabs = await s.ev(`[...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().top > 780).map(b => b.innerText.trim()).filter(Boolean)`);
  for (const tab of tabs) {
    let items = [];
    await s.step(`tab-${tab}`, async () => {
      await backToMain(s);
      await openTab(s, tab);
      items = await s.ev(listItems);
    });
    if (!(await s.ev(editorMain))) { await s.step(`tab-${tab}-close`, async () => backToMain(s)); continue; }
    for (const it of items) {
      if (/^(Original)$/.test(it)) continue;
      await s.step(`${tab}-${it}`.replace(/\W+/g, "_"), async () => {
        await backToMain(s);
        await openTab(s, tab);
        await tapItem(s, it);
        await s.sleep(tab === "Portrait" ? 2500 : 1500);
        await s.shot(`${tab}-${it}`.replace(/\W+/g, "_") + "-open");
        await backToMain(s);
      }, { shot: false });
    }
  }

  await s.step("text-add", async () => {
    await backToMain(s); await openTab(s, "Text");
    await s.waitVisible("Done", { timeout: 4000 });
    await s.type("Hello Open_Edit");
    await s.click("Done", { settle: 1500 });
    await s.click({ label: "Confirm" }, { settle: 1200 }).catch(() => {});
    await backToMain(s);
  });
  await s.step("brush-draw", async () => {
    await openTab(s, "Brush"); await s.sleep(2500);
    await s.drag([100, 300], [300, 380], { settle: 1000 });
    await s.click({ label: "Confirm" }, { settle: 1200 });
    await backToMain(s);
  });
  await s.step("sticker-shop", async () => {
    await openTab(s, "Stickers");
    await s.click({ label: "Sticker shop" }, { settle: 2500 });
    await s.waitFor(`location.pathname === '/stamp-shop' || document.body.innerText.includes('Sticker')`, { timeout: 6000 });
    await s.shot("shop");
    if ((await s.ev("location.pathname")) === "/stamp-shop") { await s.back(2000); }
    else { const c = (await s.locate({ label: "Close" })) ?? (await s.locate({ label: "Back" })); if (c) { await s.tapAt(c.x, c.y); await s.sleep(1200); } }
    await backToMain(s);
  });
  await s.step("border", async () => {
    await openTab(s, "Border");
    await s.click("Format", { settle: 900 });
    const items = await s.ev(`[...document.querySelectorAll('button')].filter(b => { const r = b.getBoundingClientRect(); return r.top > 700 && r.top < 790 && r.width > 20; }).length`);
    if (!items) throw new Error("no border formats");
    const p = await s.ev(`(() => { const b = [...document.querySelectorAll('button')].filter(b => { const r = b.getBoundingClientRect(); return r.top > 700 && r.top < 790 && r.width > 20; })[2]; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await s.tapAt(...p); await s.sleep(1500);
    await s.click("Color", { settle: 900 });
  });

  await s.step("save", async () => {
    await backToMain(s);
    await s.click("SAVE", { settle: 3000 });
    await s.waitVisible("Saved!", { timeout: 15000 });
  });
  await s.step("saved-close", async () => {
    await s.click({ label: "Close" }, { settle: 1200 });
    await s.waitFor(editorMain, { timeout: 5000 });
  });
}
