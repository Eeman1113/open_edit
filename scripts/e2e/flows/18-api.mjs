// Content API (src/app/api/**) with no provider configured: every catalogue answers from the built-in pack, with
// validation, caching headers, the anonymous session cookie and rate-limit headers; /api/health and /api/ai/hair.
// Then the static fallback: with /api/* unreachable (static hosting), the music, art style and effect lists still
// load from /api-static/*.json.
import { openCamera, audit } from "../h.mjs";

const KINDS = ["sticker", "accessory", "transform", "makeup", "filter", "effect", "cutout", "facepaint", "brush", "text", "beauty", "template", "templates", "music", "background", "adjust", "store"];

/** fetch in the page: status, a few headers and the JSON body (or text) */
const get = (url, init = {}) => `fetch(${JSON.stringify(url)}, ${JSON.stringify(init)}).then(async (r) => { const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, etag: r.headers.get('etag'), cache: r.headers.get('cache-control'), source: r.headers.get('x-oe-source'), limit: r.headers.get('ratelimit-limit'), type: r.headers.get('content-type'), body: j, len: t.length }; })`;

export default async function flowApi(s) {
  await s.goto("/home", { settle: 800 });

  await s.step("health", async () => {
    const r = await s.ev(get("/api/health"));
    if (r.status !== 200 || r.body?.ok !== true || !r.body.version) throw new Error("health: " + JSON.stringify(r));
    if (!/no-store/.test(r.cache ?? "")) throw new Error("health must not be cached: " + r.cache);
    if (JSON.stringify(r.body).match(/https?:|key/i)) throw new Error("health leaks configuration");
    if (Object.values(r.body.catalogs).some((v) => v !== "local")) throw new Error("expected local catalogues: " + JSON.stringify(r.body.catalogs));
  });
  await s.step("music", async () => {
    const r = await s.ev(get("/api/music"));
    if (r.status !== 200 || !(r.body?.tracks?.length >= 8)) throw new Error("music: " + r.status + " " + r.body?.tracks?.length);
    if (r.source !== "local" || !r.etag || !/max-age/.test(r.cache ?? "") || !r.limit) throw new Error("headers: " + JSON.stringify({ ...r, body: undefined }));
    const t = r.body.tracks[0];
    const a = await s.ev(`fetch(${JSON.stringify(t.url)}).then(r => r.status + ' ' + r.headers.get('content-type'))`);
    if (!/^200 audio\//.test(a)) throw new Error("track audio: " + a);
  });
  await s.step("music-search-and-paging", async () => {
    const all = await s.ev(get("/api/music"));
    const q = all.body.tracks[0].title.split(" ")[0];
    const r = await s.ev(get(`/api/music?q=${encodeURIComponent(q)}`));
    if (!(r.body.tracks.length >= 1 && r.body.tracks.length < all.body.tracks.length)) throw new Error(`search "${q}" returned ${r.body.tracks.length}`);
    const p = await s.ev(get("/api/music?limit=2&offset=1"));
    if (p.body.tracks.length !== 2 || p.body.tracks[0].id !== all.body.tracks[1].id) throw new Error("paging");
  });
  await s.step("validation-errors", async () => {
    s.allow(/^(400|404) .*\/api\/(music|looks\/nope)/);
    for (const u of ["/api/music?limit=0", "/api/music?limit=999", "/api/music?offset=-1", `/api/music?q=${"x".repeat(80)}`, "/api/looks/nope"]) {
      const r = await s.ev(get(u));
      if (!(r.status === 400 || r.status === 404) || !r.body?.error) throw new Error(`${u} → ${r.status} ${JSON.stringify(r.body)}`);
      if (!/no-store/.test(r.cache ?? "")) throw new Error(`${u} error cached: ${r.cache}`);
    }
  });
  await s.step("etag-304", async () => {
    const r = await s.ev(get("/api/aistyle"));
    const r2 = await s.ev(`fetch('/api/aistyle', { headers: { 'if-none-match': ${JSON.stringify("__ETAG__")}.replace('__ETAG__', ${JSON.stringify(r.etag)}) }, cache: 'no-store' }).then(r => r.status)`);
    if (r2 !== 304) throw new Error("conditional request → " + r2);
  });
  await s.step("aistyle", async () => {
    const r = await s.ev(get("/api/aistyle"));
    if (r.status !== 200 || !(r.body?.styles?.length >= 5)) throw new Error("aistyle: " + JSON.stringify(r).slice(0, 200));
    if (!r.body.styles.every((x) => x.id && x.name && Array.isArray(x.ops))) throw new Error("style shape");
  });
  await s.step("looks-every-kind", async () => {
    const bad = [];
    for (const k of KINDS) {
      const r = await s.ev(get(`/api/looks/${k}`));
      if (r.status !== 200 || !Array.isArray(r.body?.items) || !r.body.items.length) bad.push(`${k}:${r.status}:${r.body?.items?.length}`);
    }
    if (bad.length) throw new Error("looks: " + bad.join(" "));
    const q = await s.ev(get("/api/looks/store?q=kitty"));
    if (!q.body.items.some((i) => /kitty/i.test(i.name))) throw new Error("store search");
  });
  await s.step("stickers-templates-feeds", async () => {
    const st = await s.ev(get("/api/stickers"));
    if (st.status !== 200 || !Array.isArray(st.body) || !st.body.length || !st.body.every((c) => c.stickers?.length)) throw new Error("stickers: " + JSON.stringify(st).slice(0, 200));
    const tp = await s.ev(get("/api/templates"));
    if (tp.status !== 200 || !(tp.body?.items?.length > 3)) throw new Error("templates");
    for (const f of ["home", "discover"]) {
      const r = await s.ev(get(`/api/feed/${f}`));
      if (r.status !== 200 || r.len < 200) throw new Error(`feed ${f}: ${r.status}`);
    }
    s.allow(/\/api\/feed\/other/);
    const bad = await s.ev(get("/api/feed/other"));
    if (bad.status < 400) throw new Error("unknown feed accepted");
  });
  await s.step("ai-hair", async () => {
    const r = await s.ev(get("/api/ai/hair"));
    if (r.status !== 200 || r.body?.available !== false || !Array.isArray(r.body.styles)) throw new Error("hair GET: " + JSON.stringify(r.body));
    s.allow(/^503 .*\/api\/ai\/hair/);
    const p = await s.ev(`fetch('/api/ai/hair', { method: 'POST', body: new FormData() }).then(r => r.status)`);
    if (p !== 503) throw new Error("hair POST without a provider → " + p);
  });
  await s.step("session-cookie-and-no-secrets", async () => {
    // the session cookie is HttpOnly (not readable here) and scoped to /api
    await s.assert(`!document.cookie.includes('oe_sid')`, "session cookie is HttpOnly");
    const c = await s.send("Network.getCookies", { urls: [new URL("/api/music", (await s.ev("location.origin"))).href] });
    const sid = c.cookies.find((x) => x.name === "oe_sid");
    if (!sid || !sid.httpOnly || sid.path !== "/api" || sid.sameSite !== "Lax") throw new Error("oe_sid cookie: " + JSON.stringify(sid));
    const html = await s.ev(`fetch('/').then(r => r.text())`);
    if (/OE_[A-Z_]*(KEY|SECRET)/.test(html)) throw new Error("server variable names in the page");
  });

  /* ------------------------------------------------------------------ static fallback (no route handlers) */
  await s.step("static-fallback-lists", async () => {
    s.allow(/https?:\/\/[^ ]+\/api\//); // the blocked /api requests are the point of this step
    await s.send("Network.setBlockedURLs", { urls: ["*/api/*"] });
    try {
      // camera music sheet and effects panel
      await openCamera(s, { fresh: true });
      await s.click({ label: "Music" }, { settle: 1200 });
      await s.waitFor(`document.querySelectorAll('[aria-label="Play preview"]').length >= 8`, { timeout: 8000, msg: "music from /api-static" });
      await s.key("Escape"); await s.sleep(800);
      await s.click("Effects", { settle: 1500 });
      await s.waitFor(`document.querySelectorAll('[data-sticker]').length > 5`, { timeout: 8000, msg: "effects listed" });
      for (const c of ["Cute", "Face paint", "Eyes"]) await s.tap(c, { settle: 600 });
      await s.waitFor(`document.querySelectorAll('[data-sticker]').length > 0`, { timeout: 5000, msg: "server categories from /api-static" });
      await audit(s, "effects offline");
      await s.click({ label: "Close effects" }, { settle: 800 });
      // art styles
      await s.goto("/aistyle", { settle: 1500 });
      await s.waitFor(`document.querySelectorAll('[data-style]').length >= 5`, { timeout: 8000, msg: "art styles from /api-static" });
      const used = await s.ev(`performance.getEntriesByType('resource').filter(e => /\\/api-static\\//.test(e.name)).map(e => e.name.split('/api-static/')[1])`);
      if (!used.some((u) => /aistyle/.test(u))) throw new Error("art styles did not come from the static snapshot: " + used.join());
    } finally {
      await s.send("Network.setBlockedURLs", { urls: [] });
    }
  });
}
