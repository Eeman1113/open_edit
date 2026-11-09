// E2E harness: ONE headless Chrome driven over the DevTools protocol (no deps; Node 24 has fetch + WebSocket).
// 390×844 @2x mobile viewport, fake camera from a y4m. Every step clicks/drags like a user, asserts on the DOM,
// collects console errors / page exceptions / failed requests, and screenshots. Chrome is always killed on exit.
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

export const BASE_URL = process.env.E2E_BASE ?? "http://localhost:3612";
export const SCRATCH = process.env.E2E_SCRATCH ?? "/private/tmp/claude-501/-Users-eemanmajumder-code-shit-b612/e9a81868-6760-4d59-9d00-16c14b2b3398/scratchpad";
export const OUT = process.env.E2E_OUT ?? path.join(SCRATCH, "proof/e2e");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// noise that is not an app bug (dev overlay / HMR chatter, the fake camera's lack of audio, etc.)
const IGNORE = [
  /Download the React DevTools/i, /\[HMR\]/, /\[Fast Refresh\]/, /webpack-hmr|turbopack-hmr|_next\/webpack-hmr/,
  /favicon\.ico/, /Requested device not found|NotFoundError: Requested device/i,
];

export async function launch({ y4m } = {}) {
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
    ws.addEventListener("message", (e) => this.onMsg(JSON.parse(e.data)));
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
  err(kind, text) {
    text = String(text).slice(0, 600);
    if (IGNORE.some((r) => r.test(text))) return;
    this.errors.push({ flow: this.flow, kind, text });
  }
  send(method, params = {}) {
    return new Promise((res, rej) => { const i = ++this.id; this.pending.set(i, { res, rej, method }); this.ws.send(JSON.stringify({ id: i, method, params })); });
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
  async waitVisible(target, { timeout = 10000, ...opts } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { const p = await this.locate(target, opts).catch(() => null); if (p) return p; await sleep(150); }
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
  // flags raw Android #AARRGGBB leaking into inline styles, text overflowing its box, and broken images
  async visualAudit() {
    return this.ev(`(() => {
      const out = [];
      // un-converted Android #AARRGGBB shows up as (nearly) transparent text: flag visible text with alpha ≈ 0
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
    let ok = true, error;
    try { await fn(); } catch (e) { ok = false; error = e.message; }
    await sleep(150);
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
