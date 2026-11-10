// E2E harness: ONE headless Chrome driven over the DevTools protocol (no deps; Node 24 has fetch + WebSocket).
// 390×844 @2x mobile viewport, fake camera from a y4m. Every step clicks/drags like a user, asserts on the DOM,
// collects console errors / page exceptions / failed requests, and screenshots. Chrome is always killed on exit.
import { spawn, execSync } from "node:child_process";
import os from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

export const BASE_URL = process.env.E2E_BASE ?? "http://localhost:3000"; // `npm run dev`
export const SCRATCH = process.env.E2E_SCRATCH ?? path.join(os.tmpdir(), "open_edit-e2e");
export const OUT = process.env.E2E_OUT ?? path.join(SCRATCH, "proof/e2e");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// noise that is not an app bug (dev overlay / HMR chatter, the fake camera's lack of audio, etc.)
const IGNORE = [
  /Download the React DevTools/i, /\[HMR\]/, /\[Fast Refresh\]/, /webpack-hmr|turbopack-hmr|_next\/webpack-hmr/,
  /favicon\.ico/, /Requested device not found|NotFoundError: Requested device/i,
];

export async function launch({ y4m } = {}) {
  mkdirSync(SCRATCH, { recursive: true });
  const prof = mkdtempSync(path.join(SCRATCH, "e2e-prof-"));
  const port = 9400 + Math.floor(Math.random() * 400);
  const args = [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--hide-scrollbars",
    "--no-first-run", "--disable-extensions", "--disable-background-networking", "--mute-audio",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required",
    "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
    "--js-flags=--max-old-space-size=1024", "--window-size=390,844",
  ];
  if (y4m && existsSync(y4m)) args.push(`--use-file-for-fake-video-capture=${y4m}`);
  args.push("about:blank");
  const chrome = spawn(CHROME, args, { stdio: "ignore" });
  const kill = () => {
    try { chrome.kill("SIGKILL"); } catch {}
    try { execSync(`pkill -9 -f "${prof}"`, { stdio: "ignore" }); } catch {}
    try { rmSync(prof, { recursive: true, force: true }); } catch {}
  };
  process.on("exit", kill);
  process.on("SIGINT", () => { kill(); process.exit(130); });
  let ws;
  for (let i = 0; i < 100 && !ws; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
    } catch { /* not up yet */ }
    if (!ws) await sleep(200);
  }
  if (!ws) { kill(); throw new Error("chrome did not start"); }
  await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
  const s = new Session(ws, kill);
  await s.init();
  return s;
}

export class Session {
  constructor(ws, kill) {
    this.ws = ws; this.kill = kill; this.id = 0; this.pending = new Map();
    this.errors = []; this.results = []; this.flow = "init"; this.flowNo = 0; this.shotNo = 0;
    this.reqs = new Map();
    this.dead = false;
    ws.addEventListener("message", (e) => this.onMsg(JSON.parse(e.data)));
    // Chrome gone (crash, out of memory): fail everything waiting instead of hanging
    ws.addEventListener("close", () => {
      this.dead = true;
      for (const p of this.pending.values()) p.rej(new Error("chrome closed"));
      this.pending.clear();
    });
  }
  onMsg(m) {
    if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); if (m.error) p.rej(new Error(`${p.method}: ${m.error.message}`)); else p.res(m.result); return; }
    const P = m.params;
    if (m.method === "Runtime.consoleAPICalled" && (P.type === "error" || P.type === "assert")) {
      this.err("console", P.args.map((a) => a.value ?? a.description ?? a.type).join(" "));
    } else if (m.method === "Runtime.exceptionThrown") {
      const d = P.exceptionDetails;
      this.err("exception", (d.exception?.description ?? d.text ?? "") + (d.url ? ` @${d.url}:${d.lineNumber}` : ""));
    } else if (m.method === "Log.entryAdded" && P.entry.level === "error") {
      if (!/Failed to load resource/.test(P.entry.text)) this.err("log", `${P.entry.text} ${P.entry.url ?? ""}`);
    } else if (m.method === "Network.requestWillBeSent") {
      this.reqs.set(P.requestId, P.request.url);
    } else if (m.method === "Network.responseReceived") {
      if (P.response.status >= 400) this.err("http", `${P.response.status} ${P.response.url}`);
    } else if (m.method === "Network.loadingFailed") {
      if (!P.canceled && P.errorText !== "net::ERR_ABORTED") this.err("net", `${P.errorText} ${this.reqs.get(P.requestId) ?? ""}`);
    }
  }
  /** Marks errors matching `re` as expected for the rest of the current step (e.g. a deliberate 400). */
  allow(re) { (this.allowed ??= []).push(re); }
  err(kind, text) {
    text = String(text).slice(0, 600);
    if (IGNORE.some((r) => r.test(text))) return;
    if (this.allowed?.some((r) => r.test(text))) return;
    this.errors.push({ flow: this.flow, kind, text });
  }
  send(method, params = {}, timeout = 60000) {
    if (this.dead) return Promise.reject(new Error("chrome closed"));
    return new Promise((res, rej) => {
      const i = ++this.id;
      const t = setTimeout(() => { if (this.pending.delete(i)) rej(new Error(`${method}: no answer in ${timeout} ms`)); }, timeout);
      this.pending.set(i, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); }, method });
      this.ws.send(JSON.stringify({ id: i, method, params }));
    });
  }
  async init() {
    await this.send("Runtime.enable"); await this.send("Log.enable"); await this.send("Page.enable"); await this.send("Network.enable");
    await this.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    // hide the Next.js dev-tools badge: it sits over the HOME tab and would swallow taps (not part of the app)
    await this.send("Page.addScriptToEvaluateOnNewDocument", { source: `addEventListener('DOMContentLoaded',()=>{const st=document.createElement('style');st.textContent='nextjs-portal{display:none!important}';document.head.appendChild(st);});` });
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await this.send("Browser.grantPermissions", { origin: BASE_URL, permissions: ["videoCapture", "audioCapture", "clipboardReadWrite", "clipboardSanitizedWrite"] }).catch(() => {});
    await this.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: path.join(SCRATCH, "e2e/downloads") }).catch(() => {});
  }

  // ---------- evaluation ----------
  async ev(expr, timeout = 15000) {
    const r = await Promise.race([
      this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }),
      sleep(timeout).then(() => ({ timeout: true })),
    ]);
    if (r.timeout) throw new Error(`eval timeout: ${expr.slice(0, 80)}`);
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result?.value;
  }
  async waitFor(expr, { timeout = 10000, msg } = {}) {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < timeout) {
      if (this.dead) throw new Error("chrome closed");
      try { last = await this.ev(`(()=>{try{const v = (${expr}); return v && typeof v === 'object' ? true : v}catch(e){return false}})()`); if (last) return last; } catch { /* nav in progress */ }
      await sleep(150);
    }
    throw new Error(`timeout waiting: ${msg ?? expr}`);
  }
  async assert(expr, msg) {
    const v = await this.ev(`(()=>{try{const v = (${expr}); return v && typeof v === 'object' ? true : v}catch(e){return 'ERR '+e.message}})()`);
    if (!v || (typeof v === "string" && v.startsWith("ERR "))) throw new Error(`assert failed: ${msg ?? expr}${typeof v === "string" ? " → " + v : ""}`);
    return v;
  }
  path() { return this.ev("location.pathname + location.search"); }
  async goto(p, { wait, settle = 800 } = {}) {
    await this.send("Page.navigate", { url: BASE_URL + p });
    await this.waitFor("document.readyState === 'complete'", { timeout: 30000 });
    if (wait) await this.waitFor(wait, { timeout: 30000 });
    await sleep(settle);
  }
  async back(settle = 700) { await this.ev("history.back()"); await sleep(settle); }
  sleep(ms) { return sleep(ms); }

  // ---------- locating ----------
  // target: "text" | {text} | {label} | {sel} | {xy:[x,y]} ; returns center in CSS px of the topmost visible match
  async locate(target, { exact = true, nth = 0, within } = {}) {
    if (Array.isArray(target)) return { x: target[0], y: target[1] };
    if (typeof target === "string") target = { text: target };
    if (target.xy) return { x: target.xy[0], y: target.xy[1] };
    const js = `(() => {
      const T = ${JSON.stringify(target)}, exact = ${exact}, nth = ${nth}, within = ${JSON.stringify(within ?? null)};
      const root = within ? document.querySelector(within) : document;
      if (!root) return null;
      const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null;
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return null;
        let o = el; while (o) { const c = getComputedStyle(o); if (parseFloat(c.opacity) < 0.05) return null; o = o.parentElement; }
        const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null;
        return { x, y, w: r.width, h: r.height }; };
      let els = [];
      if (T.sel) els = [...root.querySelectorAll(T.sel)];
      else if (T.label) els = [...root.querySelectorAll('[aria-label],[title],img[alt]')].filter(e => { const l = e.getAttribute('aria-label') ?? e.getAttribute('title') ?? e.getAttribute('alt'); return exact ? l === T.label : (l||'').toLowerCase().includes(T.label.toLowerCase()); });
      else if (T.text) {
        const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
        const all = [...root.querySelectorAll('body *')].filter(e => !['SCRIPT','STYLE','NOSCRIPT'].includes(e.tagName));
        els = all.filter(e => { const t = norm(e.innerText ?? e.textContent); return exact ? t === T.text : t.toLowerCase().includes(T.text.toLowerCase()); });
        // deepest matches only
        els = els.filter(e => !els.some(o => o !== e && e.contains(o)));
      }
      const hits = [];
      for (const e of els) { const v = vis(e); if (!v) continue;
        const top = document.elementFromPoint(v.x, v.y); const onTop = !!top && (top === e || e.contains(top) || top.contains(e));
        hits.push({ ...v, onTop, tag: e.tagName }); }
      hits.sort((a, b) => (b.onTop - a.onTop));
      return hits[nth] ?? null;
    })()`;
    return this.ev(js);
  }
  async exists(target, opts) { return !!(await this.locate(target, opts)); }
  /** Scrolls the first element matching `target` (text / label / sel, buttons preferred) into the middle of its
   *  scroll containers, like a finger would before tapping it. Returns false when nothing matches. */
  async reveal(target, { exact = true } = {}) {
    if (typeof target === "string") target = { text: target };
    return this.ev(`(() => {
      const T = ${JSON.stringify(target)}, exact = ${exact};
      const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      let els = [];
      if (T.sel) els = [...document.querySelectorAll(T.sel)];
      else if (T.label) els = [...document.querySelectorAll('[aria-label],[title]')].filter(e => { const l = e.getAttribute('aria-label') ?? e.getAttribute('title'); return exact ? l === T.label : (l || '').toLowerCase().includes(T.label.toLowerCase()); });
      else els = [...document.querySelectorAll('button,a,[role=button],[role=tab],label')].filter(e => { const t = norm(e.innerText ?? e.textContent); return exact ? t === T.text : t.toLowerCase().includes(T.text.toLowerCase()); });
      els = els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      const e = els[0]; if (!e) return false;
      // only real scrollers move (overflow: hidden screens are never scrolled, unlike scrollIntoView)
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p), r = e.getBoundingClientRect(), q = p.getBoundingClientRect();
        if (/auto|scroll/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 1) p.scrollLeft += (r.left + r.width / 2) - (q.left + q.width / 2);
        if (/auto|scroll/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) p.scrollTop += (r.top + r.height / 2) - (q.top + q.height / 2);
      }
      return true;
    })()`);
  }
  /** reveal + click */
  async tap(target, opts = {}) {
    for (let i = 0; ; i++) {
      await this.reveal(target, opts).catch(() => false);
      await sleep(350);
      try { return await this.click(target, { timeout: i < 2 ? 2500 : 8000, ...opts }); }
      catch (e) { if (i >= 2) throw e; } // a smooth scroll may still have been running: reveal again
    }
  }
  async waitVisible(target, { timeout = 10000, ...opts } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { if (this.dead) throw new Error("chrome closed"); const p = await this.locate(target, opts).catch(() => null); if (p) return p; await sleep(150); }
    throw new Error(`not visible: ${JSON.stringify(target)}`);
  }

  // ---------- input ----------
  async mouse(type, x, y, extra = {}) { await this.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, pointerType: "mouse", ...extra }); }
  async tapAt(x, y, { hold = 60 } = {}) {
    await this.mouse("mouseMoved", x, y, { buttons: 0 });
    await this.mouse("mousePressed", x, y, { buttons: 1 }); await sleep(hold); await this.mouse("mouseReleased", x, y, { buttons: 0 });
  }
  async click(target, { settle = 600, timeout = 8000, hold, ...opts } = {}) {
    const p = await this.waitVisible(target, { timeout, ...opts });
    await this.tapAt(p.x, p.y, { hold });
    await sleep(settle);
    return p;
  }
  async longPress(target, ms = 1500, opts = {}) {
    const p = await this.waitVisible(target, opts);
    await this.mouse("mouseMoved", p.x, p.y); await this.mouse("mousePressed", p.x, p.y, { buttons: 1 });
    await sleep(ms); await this.mouse("mouseReleased", p.x, p.y);
    await sleep(500);
  }
  async drag([x1, y1], [x2, y2], { steps = 12, ms = 300, settle = 600 } = {}) {
    await this.mouse("mouseMoved", x1, y1); await this.mouse("mousePressed", x1, y1, { buttons: 1 });
    for (let k = 1; k <= steps; k++) { await this.mouse("mouseMoved", x1 + ((x2 - x1) * k) / steps, y1 + ((y2 - y1) * k) / steps, { buttons: 1 }); await sleep(ms / steps); }
    await this.mouse("mouseReleased", x2, y2); await sleep(settle);
  }
  /** finger swipe (touch events: native scrolling / scroll-snap pagers react to these, not to mouse drags) */
  async swipe([x1, y1], [x2, y2], { steps = 10, ms = 250, settle = 800 } = {}) {
    await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y: y1 }] });
    for (let k = 1; k <= steps; k++) { await this.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x1 + ((x2 - x1) * k) / steps, y: y1 + ((y2 - y1) * k) / steps }] }); await sleep(ms / steps); }
    await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(settle);
  }
  async type(text) { await this.send("Input.insertText", { text }); await sleep(200); }
  async key(key) {
    const codes = { Enter: 13, Backspace: 8, Escape: 27 };
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: codes[key] ?? 0, text: key === "Enter" ? "\r" : undefined });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: codes[key] ?? 0 });
    await sleep(200);
  }
  async setFile(selector, files) {
    const doc = await this.send("DOM.getDocument", { depth: -1 });
    const { nodeId } = await this.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector });
    if (!nodeId) throw new Error(`no file input ${selector}`);
    await this.send("DOM.setFileInputFiles", { nodeId, files });
  }

  // ---------- visual checks ----------
  // flags invisible (fully transparent) text, text overflowing the screen, and broken images
  async visualAudit() {
    return this.ev(`(() => {
      const out = [];
      // visible text with alpha ≈ 0 (a bad colour value) is flagged
      for (const el of document.querySelectorAll('body *')) {
        if ([...el.childNodes].every(n => n.nodeType !== 3 || !n.textContent.trim())) continue;
        const r = el.getBoundingClientRect(); if (r.width < 1 || r.bottom < 0 || r.top > innerHeight) continue;
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
        const m = cs.color.match(/rgba?\\(([^)]+)\\)/); if (!m) continue;
        const p = m[1].split(/[ ,/]+/).filter(Boolean); const a = p.length > 3 ? parseFloat(p[3]) : 1;
        if (a < 0.08) out.push('transparent text: ' + el.textContent.trim().slice(0, 40) + ' (' + cs.color + ')');
      }
      for (const img of document.images) {
        const r = img.getBoundingClientRect();
        if (img.complete && img.naturalWidth === 0 && img.src && r.width > 0 && r.bottom > 0 && r.top < innerHeight) out.push('broken img ' + img.src.slice(-80));
      }
      for (const el of document.querySelectorAll('body *')) {
        if (el.children.length) continue;
        const t = (el.textContent || '').trim(); if (!t) continue;
        const r = el.getBoundingClientRect(); if (r.width < 1 || r.bottom < 0 || r.top > innerHeight) continue;
        const cs = getComputedStyle(el);
        if (cs.overflow === 'visible' && el.scrollWidth > el.clientWidth + 2 && cs.whiteSpace === 'nowrap' && el.clientWidth > 0 && cs.textOverflow !== 'ellipsis' && r.right > innerWidth + 1)
          out.push('text off-screen: ' + t.slice(0, 40));
      }
      // text drawn in (almost) the colour of the solid surface behind it
      const rgba = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const leaves = [];
      for (const el of document.querySelectorAll('body *')) {
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'OPTION'].includes(el.tagName)) continue;
        const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(); if (!own) continue;
        const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        let hidden = false; for (let o = el; o; o = o.parentElement) { const c = getComputedStyle(o); if (c.visibility === 'hidden' || c.display === 'none' || parseFloat(c.opacity) < 0.05 || o.getAttribute('aria-hidden') === 'true') { hidden = true; break; } }
        if (hidden) continue;
        const fg = rgba(getComputedStyle(el).color); if (!fg) continue;
        // visible = topmost at one of a few points of its box (text under a dialog's scrim is not)
        const pts = [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5], [0.5, 0.2], [0.5, 0.8]];
        const vis = pts.some(([fx, fy]) => { const t = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy); return !!t && (t === el || el.contains(t) || t.contains(el)); });
        if (!vis) continue;
        leaves.push({ el, r, own });
        // the surface right behind the text's centre (siblings such as a sliding tab thumb count too)
        let bg = null;
        for (const o of document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)) {
          if (o !== el && el.contains(o)) continue;
          const c = getComputedStyle(o);
          if (o !== el && (c.backgroundImage !== 'none' || ['IMG', 'VIDEO', 'CANVAS', 'svg'].includes(o.tagName) || c.backdropFilter !== 'none')) break;
          if (c.backgroundImage !== 'none') break;
          const b = rgba(c.backgroundColor); if (b && b[3] > 0.9) { bg = b; break; }
        }
        if (bg && fg[3] > 0.5) { const L1 = lum(fg), L2 = lum(bg); const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); if (cr < 1.35) out.push('unreadable text: ' + own.slice(0, 40) + ' (' + getComputedStyle(el).color + ' on rgb(' + bg.slice(0, 3).join(',') + '))'); }

      }
      // two different texts drawn on top of each other
      for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i], b = leaves[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w <= 0 || h <= 0) continue;
        const small = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
        if (w * h <= 0.3 * small) continue;
        // content that scrolls under an opaque floating control (a FAB, a sticky button) is hidden, not overlapping
        const cx = Math.max(a.r.left, b.r.left) + w / 2, cy = Math.max(a.r.top, b.r.top) + h / 2;
        const list = document.elementsFromPoint(cx, cy);
        const ia = list.findIndex(e => e === a.el || a.el.contains(e)), ib = list.findIndex(e => e === b.el || b.el.contains(e));
        if (ia < 0 || ib < 0) continue;
        const between = list.slice(Math.min(ia, ib), Math.max(ia, ib));
        const occluded = between.some(e => { const c = getComputedStyle(e); const bg = rgba(c.backgroundColor); return c.backgroundImage !== 'none' || (bg && bg[3] > 0.9); });
        if (!occluded) out.push('overlapping text: "' + a.own.slice(0, 30) + '" / "' + b.own.slice(0, 30) + '"');
      }
      return out;
    })()`);
  }

  // list interactive things on screen (exploration / debugging)
  async clickables() {
    return this.ev(`(() => [...document.querySelectorAll('button,a,[role=button],[role=tab],input,[onclick],img[alt]:not([alt=""])')].map(e => {
      const r = e.getBoundingClientRect(); if (r.width < 1 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null;
      return [e.tagName.toLowerCase(), (e.getAttribute('aria-label') || e.innerText || e.getAttribute('href') || e.value || e.alt || '').replace(/\\s+/g,' ').trim().slice(0,30), Math.round(r.left + r.width/2), Math.round(r.top + r.height/2)].join('|');
    }).filter(Boolean))()`);
  }

  async shot(name) {
    mkdirSync(OUT, { recursive: true });
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    const file = path.join(OUT, `${String(this.flowNo).padStart(2, "0")}-${this.flow}${name ? "-" + name : ""}.png`);
    writeFileSync(file, Buffer.from(r.data, "base64"));
    return file;
  }

  // ---------- steps ----------
  async step(name, fn, { shot = true } = {}) {
    const e0 = this.errors.length;
    const t0 = Date.now();
    this.allowed = [];
    let ok = true, error;
    if (this.dead) { const rec = { flow: this.flow, step: name, ok: false, error: "chrome closed", errs: [], ms: 0 }; this.results.push(rec); console.log(`  FAIL ${name}  — chrome closed`); return false; }
    try { await fn(); } catch (e) { ok = false; error = e.message; }
    await sleep(150);
    this.allowed = [];
    const errs = this.errors.slice(e0).filter((e) => e.kind !== "http" || !/\/_next\/|__nextjs/.test(e.text));
    let file;
    if (shot) { try { file = await this.shot(name); } catch { /* page gone */ } }
    const rec = { flow: this.flow, step: name, ok: ok && errs.length === 0, error, errs: errs.map((e) => `${e.kind}: ${e.text}`), ms: Date.now() - t0, file };
    this.results.push(rec);
    const mark = rec.ok ? "PASS" : "FAIL";
    console.log(`  ${mark} ${name}${error ? "  — " + error : ""}${errs.length ? "\n      " + rec.errs.join("\n      ") : ""}`);
    return rec.ok;
  }
}
