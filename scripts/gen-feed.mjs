#!/usr/bin/env node
// Generates the demo feed of the "open" asset pack and the fixture data that references it:
//   feed/*.svg                 abstract generative artwork (gradients, waves, orbs, rings, blocks...)
//   videos/clip-*.mp4 + .jpg   sample clips rendered by ffmpeg from synthetic sources (no footage of people)
//   src/data/home.json         home feed (banners, shortcuts, effects, filters, chart, face styles)
//   src/data/discover.json     discover feed (posts, creators, keywords, tags), authored by fictional accounts
// Asset kinds: "feed" (artwork, plus aliases to filter swatches / sticker previews / clip posters) and "video".
// Run: node scripts/gen-feed.mjs   (skips the clips when ffmpeg is missing)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FILTER_DEFS } from "../src/data/filters.ts";
import { PACK_DIR, ROOT, readManifest, rng, runAsMain, updateManifest, writePack } from "./gen-lib/pack.mjs";

const f1 = (n) => Math.round(n * 10) / 10;
const PALETTES = [
  ["#ff9a8b", "#ff6a88", "#ffd3a5", "#5b2a86"], ["#a1c4fd", "#c2e9fb", "#5b8def", "#16213e"], ["#f6d365", "#fda085", "#f76b1c", "#3d1e6d"],
  ["#84fab0", "#8fd3f4", "#2f9c95", "#0b2027"], ["#e0c3fc", "#8ec5fc", "#7b5ea7", "#1b1b3a"], ["#fddb92", "#d1fdff", "#f8a978", "#264653"],
  ["#ffecd2", "#fcb69f", "#e76f51", "#2a1a1f"], ["#c1dfc4", "#deecdd", "#6a994e", "#1d3124"], ["#fbc2eb", "#a6c1ee", "#f06292", "#311b45"],
  ["#d4fc79", "#96e6a1", "#43aa8b", "#18332f"], ["#f5f7fa", "#c3cfe2", "#7d8ca3", "#1f2533"], ["#ffe29f", "#ffa99f", "#ff719a", "#3a0f2e"],
];
const KINDS = ["waves", "orbs", "rings", "blocks", "stripes", "dunes", "grid"];

/** Abstract artwork as SVG. */
function art(seed, w, h, kind = KINDS[seed % KINDS.length], pal = PALETTES[seed % PALETTES.length]) {
  const r = rng(seed * 7919 + 13), [a, b, c, d] = pal, id = `g${seed}`;
  const defs = `<linearGradient id="${id}" x1="0" y1="0" x2="${f1(r())}" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>` +
    `<radialGradient id="${id}r"><stop offset="0" stop-color="${c}" stop-opacity="0.95"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
  let body = `<rect width="${w}" height="${h}" fill="url(#${id})"/>`;
  const S = Math.min(w, h);
  if (kind === "waves") for (let k = 0; k < 5; k++) {
    const y0 = h * (0.35 + k * 0.14), amp = S * (0.04 + r() * 0.06), ph = r() * 6.28, fq = 1.5 + r() * 2;
    let p = `M0 ${f1(y0)}`;
    for (let x = 0; x <= w; x += w / 24) p += ` L${f1(x)} ${f1(y0 + Math.sin((x / w) * fq * 6.28 + ph) * amp)}`;
    body += `<path d="${p} L${w} ${h} L0 ${h}Z" fill="${k % 2 ? c : d}" opacity="${f1(0.18 + k * 0.12)}"/>`;
  }
  if (kind === "orbs") for (let k = 0; k < 7; k++) body += `<circle cx="${f1(r() * w)}" cy="${f1(r() * h)}" r="${f1(S * (0.15 + r() * 0.3))}" fill="url(#${id}r)" opacity="${f1(0.5 + r() * 0.5)}"/>`;
  if (kind === "rings") {
    const cx = w * (0.3 + r() * 0.4), cy = h * (0.3 + r() * 0.4);
    for (let k = 9; k > 0; k--) body += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(S * 0.08 * k)}" fill="none" stroke="${k % 2 ? c : d}" stroke-width="${f1(S * 0.025)}" opacity="${f1(0.15 + k * 0.06)}"/>`;
  }
  if (kind === "blocks") for (let k = 0; k < 6; k++) {
    const x = r() * w * 0.8, y = r() * h * 0.8, s = S * (0.15 + r() * 0.3), col = [c, d, a][k % 3];
    body += r() < 0.5 ? `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(s)}" height="${f1(s * (0.6 + r()))}" fill="${col}" opacity="0.85"/>` : `<path d="M${f1(x)} ${f1(y + s / 2)} A${f1(s / 2)} ${f1(s / 2)} 0 0 1 ${f1(x + s)} ${f1(y + s / 2)}Z" fill="${col}" opacity="0.9"/>`;
  }
  if (kind === "stripes") {
    const n = 9, rot = -30 + r() * 60;
    body += `<g transform="rotate(${f1(rot)} ${w / 2} ${h / 2})" opacity="0.55">${Array.from({ length: n }, (_, k) => `<rect x="${f1(-w + (k * 3 * w) / n)}" y="${-h}" width="${f1(w / n * 0.9)}" height="${h * 3}" fill="${k % 2 ? c : d}"/>`).join("")}</g>`;
  }
  if (kind === "dunes") for (let k = 0; k < 4; k++) {
    const y0 = h * (0.45 + k * 0.15);
    body += `<path d="M0 ${f1(y0)} Q${f1(w * (0.2 + r() * 0.3))} ${f1(y0 - S * (0.1 + r() * 0.15))} ${f1(w * 0.6)} ${f1(y0)} T${w} ${f1(y0 - S * 0.05)} L${w} ${h} L0 ${h}Z" fill="${k % 2 ? d : c}" opacity="${f1(0.35 + k * 0.15)}"/>`;
  }
  if (kind === "grid") {
    const n = 8, gap = S / n;
    for (let y = gap / 2; y < h; y += gap) for (let x = gap / 2; x < w; x += gap) body += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(gap * (0.12 + 0.25 * Math.abs(Math.sin(x * 0.013 + y * 0.009 + seed))))}" fill="${d}" opacity="0.55"/>`;
  }
  // soft sun / highlight on top of everything
  body += `<circle cx="${f1(w * (0.2 + r() * 0.6))}" cy="${f1(h * (0.15 + r() * 0.3))}" r="${f1(S * 0.18)}" fill="url(#${id}r)" opacity="0.6"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>\n`;
}

/** Simple glyph tiles for the home shortcut buttons. */
const glyph = (paths, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${bg}"/><g fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>\n`;

// ---------- sample clips ----------

function clips(feed, video) {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch { console.warn("gen-feed: ffmpeg not found, keeping existing clips"); return false; }
  const dir = join(PACK_DIR, "videos");
  mkdirSync(dir, { recursive: true });
  const specs = [
    { id: "clip-1", src: "gradients=size=720x1280:rate=30:duration=6:speed=0.012:nb_colors=4:c0=0x5b2a86:c1=0xff6a88:c2=0xffd3a5:c3=0x5b8def:type=radial", post: "hue=s=1.1" },
    { id: "clip-2", src: "gradients=size=720x1280:rate=30:duration=6:speed=0.018:nb_colors=3:c0=0x0b2027:c1=0x2f9c95:c2=0x84fab0:type=spiral", post: "boxblur=2:1" },
  ];
  for (const s of specs) {
    const mp4 = join(dir, `${s.id}.mp4`), jpg = join(dir, `${s.id}.jpg`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", s.src, "-vf", `${s.post},format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-movflags", "+faststart", "-an", "-metadata", "title=Open_Edit sample clip", mp4]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "2", "-i", mp4, "-frames:v", "1", "-q:v", "4", jpg]);
    video[s.id] = { path: `videos/${s.id}.mp4`, meta: { width: 720, height: 1280, duration: 6, poster: `${s.id}-poster` } };
    feed[s.id] = { path: `videos/${s.id}.mp4` };
    feed[`${s.id}-poster`] = { path: `videos/${s.id}.jpg` };
  }
  return true;
}

// ---------- fixtures ----------

const STICKERS = [
  ["sparkles", 101, "Sparkles"], ["hearts", 102, "Hearts"], ["cat", 103, "Kitty"], ["shades", 104, "Shades"], ["glitter", 105, "Glitter"],
  ["scan", 106, "Mesh scan"], ["freckles", 107, "Freckles"], ["sky-lens", 108, "Sky lens"], ["amber-lens", 109, "Amber lens"],
  ["starlight", 110, "Starlight eyes"], ["glam", 111, "Glam"], ["doll-lashes", 112, "Doll lashes"], ["big-eyes", 113, "Big eyes"],
  ["dreamy", 114, "Dreamy sky"], ["pop", 115, "Mouth pop"],
];
const STYLES = [["natural", "Natural"], ["soft", "Soft"], ["slim", "Slim"], ["bright-eyes", "Bright Eyes"], ["vline", "V-line"]];

const item = (id, type, title, thumbnail, actionUrl, o = {}) => ({
  cdnPrefix: "", id, badgeColor: null, title, subTitle: "", type, textColor: null, backgroundColor: null, iconImage: null, thumbnail,
  beforeThumbnail: null, thumbnailRatio: null, tag: null, series: null, hasItemEnd: false, categoryText: null, purchaseSubType: null,
  itemProperty: { actionUrl, shareUrl: null, vip: false, paid: false, newBadge: false, showVipType: null, useCount: null, ...(o.prop ?? {}) },
  itemBridges: o.bridges ?? [], itemEnd: null, ...(o.extra ?? {}),
});
const group = (id, type, title, items, o = {}) => ({
  id, title, subTitle: "", subImage: null, type, purchaseSubType: null, row: 1, scroll: true, chartSize: 0, rank: false,
  thumbnailRatioType: null, showVipType: null, showUseCount: false, experimentDetail: null, ...o, items,
});

function homeJson(r) {
  const count = (base) => Math.round(base * (0.6 + r() * 0.8));
  return {
    result: {
      cdnPrefix: "",
      items: [{
        id: 1, positionType: "STORE_MODE", experimentDetail: null,
        groups: [
          group(1001, "HOME_BANNER", "Highlights", [
            item(2001, "HOME_BANNER", "22 new colour looks", "banner-filters", "/?filter=7"),
            item(2002, "HOME_BANNER", "Make a collage", "banner-collage", "/collage"),
            item(2003, "HOME_BANNER", "AI tools that stay on your device", "banner-ai", "/ai"),
          ]),
          group(1002, "BUTTON", "", [
            item(2101, "BUTTON", "Camera", null, "/", { extra: { iconImage: "icon-camera", textColor: "#222222", backgroundColor: "#F5F6F7" } }),
            item(2102, "BUTTON", "Edit", null, "/gallery", { extra: { iconImage: "icon-edit", textColor: "#222222", backgroundColor: "#F5F6F7" } }),
            item(2103, "BUTTON", "AI", null, "/ai", { extra: { iconImage: "icon-ai", textColor: "#222222", backgroundColor: "#F5F6F7" } }),
          ]),
          group(1003, "EFFECT", "Effects", STICKERS.slice(0, 8).map(([slug, id, name], i) =>
            item(3000 + i, "EFFECT", name, `effect-${slug}`, `/?sticker=${id}`, { prop: { useCount: count(90000), newBadge: i < 2 }, bridges: [{ contentId: id, thumbnail: `sticker-${slug}` }] })), { showUseCount: true }),
          group(1004, "FILTER", "Filters", FILTER_DEFS.slice(0, 10).map((f) =>
            item(f.id, "FILTER", f.name, `filter-${f.key}`, `/?filter=${f.id}`, { prop: { useCount: count(150000) } })), { showUseCount: true }),
          group(1005, "TOP_CHART", "Most used", STICKERS.slice(5, 14).map(([slug, id, name], i) =>
            item(4000 + i, "TOP_CHART", name, `effect-${slug}`, `/?sticker=${id}`, { prop: { useCount: 300000 - i * 21000 }, bridges: [{ contentId: id, thumbnail: `sticker-${slug}` }] })), { showUseCount: true, chartSize: 3, rank: true }),
          group(1006, "MAKEUP", "Face styles", STYLES.map(([key, label], i) => item(5000 + i, "MAKEUP", label, `style-${key}`, `/?beauty=${key}`))),
        ],
      }],
    },
  };
}

const AUTHORS = [
  { id: "openedit", name: "Open_Edit Team", creator: true, bio: "Looks, effects and tips from the people who make Open_Edit.", followers: 52000 },
  { id: "palette.studio", name: "Palette Studio", creator: true, bio: "Colour first. Experiments with every filter.", followers: 18400 },
  { id: "lumen.lab", name: "Lumen Lab", creator: false, bio: "Light, shadow and long exposures.", followers: 9200 },
  { id: "grain.and.glow", name: "Grain & Glow", creator: false, bio: "Film moods, made on a phone.", followers: 30500 },
  { id: "mono.weekend", name: "Mono Weekend", creator: true, bio: "Black and white, every Saturday.", followers: 12100 },
  { id: "pastel.club", name: "Pastel Club", creator: false, bio: "", followers: 6400 },
];
const TITLES = ["Soft morning", "Neon tide", "Paper sun", "Quiet orbit", "Citrus haze", "Blue hour", "Velvet dunes", "Static bloom", "Glass garden", "Low tide",
  "Cloud study", "Warm static", "Night swim", "Petal noise", "Copper wave", "Mint radio", "Slow orbit", "Coral grid", "Fog lines", "Sunday shapes"];
const SHAPES = [[360, 502], [1, 1], [720, 960], [1005, 750], [360, 502], [1, 1], [894, 1344], [180, 240]];
const TAGS = ["colour", "film", "abstract", "pastel", "mono", "gradient", "mood"];

function discoverJson(r, hasClips) {
  const author = (i) => { const a = AUTHORS[i % AUTHORS.length]; return { id: a.id, name: a.name, profileImage: `avatar-${a.id}`, creator: a.creator }; };
  let n = 0;
  const post = (cat, i) => {
    const f = FILTER_DEFS[(cat * 7 + i * 3) % FILTER_DEFS.length], [w, h] = SHAPES[(i + cat) % SHAPES.length];
    const k = n++;
    return {
      id: `p${cat}_${i}`, title: TITLES[k % TITLES.length], thumbnail: `post-${k % 24}`, width: w, height: h,
      filterId: f.id, filterName: f.name, effectIcon: `filter-${f.key}`, buttonText: null, author: author(k), likeCount: Math.round(500 + r() * 20000),
      detailPage: true, type: "POSTING", like: false, tags: [TAGS[k % TAGS.length], f.key],
    };
  };
  const trending = Array.from({ length: 14 }, (_, i) => post(0, i));
  if (hasClips) {
    trending.splice(1, 0, { ...post(0, 20), id: "v_0", title: "Gradient drift", thumbnail: "clip-1-poster", video: "clip-1", width: 720, height: 1280 });
    trending.splice(4, 0, { ...post(0, 21), id: "v_1", title: "Spiral tide", thumbnail: "clip-2-poster", video: "clip-2", width: 720, height: 1280 });
  }
  const kw = (key) => { const f = FILTER_DEFS.find((x) => x.key === key); return { keyword: f.name.toLowerCase(), thumbnail: `filter-${key}` }; };
  const KEYS = ["warm-film", "peach", "mint", "cinema", "mono", "dusk", "fade", "golden"];
  return {
    categories: [
      { id: 1, name: "Trending", type: "CONTENTS", posts: trending },
      { id: 2, name: "New", type: "CONTENTS", posts: Array.from({ length: 12 }, (_, i) => post(1, i)) },
      { id: 3, name: "Colour", type: "CONTENTS", posts: Array.from({ length: 10 }, (_, i) => post(2, i)) },
      { id: 4, name: "Creators", type: "CREATOR", creators: AUTHORS.map((a, i) => ({ ...author(i), followerCount: a.followers, posts: [0, 1, 2].map((j) => `post-${(i * 3 + j) % 24}`) })) },
    ],
    trendKeywords: KEYS.map(kw),
    tags: TAGS.map((t, i) => ({ name: t, count: Math.round(12000 / (i + 1)) })),
    profiles: Object.fromEntries(AUTHORS.map((a) => [a.id, { biography: a.bio, sns: null, following: Math.round(r() * 120) }])),
    relatedKeywords: Object.fromEntries(KEYS.map((k, i) => [kw(k).keyword, [1, 2, 3].map((j) => kw(KEYS[(i + j) % KEYS.length]))])),
  };
}

export function generate() {
  const r = rng(2024);
  const feed = {}, video = {};
  const put = (id, svg) => { feed[id] = { path: writePack(`feed/${id}.svg`, svg) }; };
  put("banner-filters", art(1, 960, 540, "waves", PALETTES[2]));
  put("banner-collage", art(2, 960, 540, "blocks", PALETTES[5]));
  put("banner-ai", art(3, 960, 540, "orbs", PALETTES[4]));
  put("icon-camera", glyph(`<rect x="22" y="32" width="52" height="38" rx="8"/><circle cx="48" cy="51" r="10"/><path d="M38 32 l4 -7 h12 l4 7"/>`, "#ff6a88"));
  put("icon-edit", glyph(`<path d="M30 66 L30 56 L58 28 L68 38 L40 66 Z"/><path d="M52 34 L62 44"/>`, "#5b8def"));
  put("icon-ai", glyph(`<path d="M48 24 l6 18 18 6 -18 6 -6 18 -6 -18 -18 -6 18 -6 z"/>`, "#7b5ea7"));
  STICKERS.forEach(([slug], i) => put(`effect-${slug}`, art(100 + i, 360, 480)));
  STYLES.forEach(([key], i) => put(`style-${key}`, art(200 + i, 240, 240, "rings")));
  for (let k = 0; k < 24; k++) { const [w, h] = SHAPES[k % SHAPES.length]; put(`post-${k}`, art(300 + k, w < 10 ? 720 : w, w < 10 ? 720 : h)); }
  AUTHORS.forEach((a, i) => put(`avatar-${a.id}`, art(400 + i, 160, 160, KINDS[(i + 2) % KINDS.length])));
  // aliases: filter swatches and sticker previews used as feed icons
  const m = readManifest();
  for (const [id, e] of Object.entries(m.kinds["filter-thumb"] ?? {})) feed[`filter-${id}`] = { path: e.path };
  for (const [id, e] of Object.entries(m.kinds["sticker-thumb"] ?? {})) feed[`sticker-${id}`] = { path: e.path };
  let hasClips = clips(feed, video);
  if (!hasClips) {
    for (const [id, e] of Object.entries(m.kinds.video ?? {})) { if (existsSync(join(PACK_DIR, e.path))) { video[id] = e; feed[id] = { path: e.path }; feed[`${id}-poster`] = { path: e.path.replace(/\.mp4$/, ".jpg") }; hasClips = true; } }
  }
  updateManifest({ feed, video });
  writeFileSync(join(ROOT, "src", "data", "home.json"), JSON.stringify(homeJson(r), null, 1) + "\n");
  writeFileSync(join(ROOT, "src", "data", "discover.json"), JSON.stringify(discoverJson(r, hasClips), null, 1) + "\n");
  return { feed: Object.keys(feed).length, videos: Object.keys(video).length };
}

if (runAsMain(import.meta.url)) console.log("gen-feed:", generate());
