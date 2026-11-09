#!/usr/bin/env node
// Generates the built-in sticker set of the "open" asset pack: original, code-drawn SVG art plus the sticker
// definitions (STICKER_FORMAT.md) stored as manifest metadata.
//   stickers/<slug>/*.svg    art (sprites, animation frames, canonical face-UV textures)
//   stickers/<slug>/thumb.svg preview
// Face-UV textures are drawn on the MediaPipe canonical face UV layout (src/lib/face/meshdata.ts, Apache-2.0).
// Run: node scripts/gen-stickers.mjs
import { CANONICAL_UV, FACE_TRIS } from "../src/lib/face/meshdata.ts";
import { rng, runAsMain, updateManifest, writePack } from "./gen-lib/pack.mjs";

const f2 = (n) => Math.round(n * 100) / 100;
const svg = (w, h, body, defs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>\n`;

/** 4-point sparkle star centred at (x, y). */
const star = (x, y, r, fill, op = 1) => {
  const k = r * 0.18;
  return `<path d="M${f2(x)} ${f2(y - r)} Q${f2(x + k)} ${f2(y - k)} ${f2(x + r)} ${f2(y)} Q${f2(x + k)} ${f2(y + k)} ${f2(x)} ${f2(y + r)} Q${f2(x - k)} ${f2(y + k)} ${f2(x - r)} ${f2(y)} Q${f2(x - k)} ${f2(y - k)} ${f2(x)} ${f2(y - r)}Z" fill="${fill}" opacity="${f2(op)}"/>`;
};
/** Heart centred at (x, y), size s. */
const heart = (x, y, s, fill, op = 1, rot = 0) =>
  `<path transform="translate(${f2(x)} ${f2(y)}) rotate(${f2(rot)}) scale(${f2(s)})" d="M0 0.38 C-0.62 0 -0.62 -0.5 -0.28 -0.58 C-0.1 -0.62 0 -0.48 0 -0.36 C0 -0.48 0.1 -0.62 0.28 -0.58 C0.62 -0.5 0.62 0 0 0.38Z" fill="${fill}" opacity="${f2(op)}"/>`;

const uv = (i) => [CANONICAL_UV[i * 2], CANONICAL_UV[i * 2 + 1]];

// ---------- art ----------

function sparkleFrames(n = 8) {
  const W = 512, H = 360, r = rng(7);
  const pts = Array.from({ length: 16 }, (_, i) => {
    const a = Math.PI * (1.05 + (i / 15) * 0.9) + (r() - 0.5) * 0.15;
    const d = 0.75 + r() * 0.25;
    return { x: W / 2 + Math.cos(a) * W * 0.46 * d, y: H * 0.95 + Math.sin(a) * H * 0.85 * d, s: 8 + r() * 16, ph: r() * Math.PI * 2, c: ["#fff8d6", "#ffe27a", "#ffffff", "#ffd1ec"][i % 4] };
  });
  return Array.from({ length: n }, (_, f) => svg(W, H, pts.map((p) => {
    const k = 0.5 + 0.5 * Math.sin(p.ph + (f / n) * Math.PI * 2);
    return star(p.x, p.y, p.s * (0.4 + 0.8 * k), p.c, 0.35 + 0.65 * k) + `<circle cx="${f2(p.x)}" cy="${f2(p.y)}" r="${f2(p.s * 0.18 * k + 1)}" fill="#fff" opacity="${f2(k)}"/>`;
  }).join("")));
}

function heartFrames(n = 12) {
  const W = 512, H = 512, r = rng(11);
  const hs = Array.from({ length: 9 }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    return { x: W / 2 + side * (W * (0.24 + r() * 0.18)), y0: H * (0.6 + r() * 0.35), s: 26 + r() * 26, ph: r(), c: ["#ff5c8a", "#ff8fb1", "#ff3d6e", "#ffc2d4"][i % 4], rot: (r() - 0.5) * 40 };
  });
  return Array.from({ length: n }, (_, f) => svg(W, H, hs.map((h) => {
    const t = (f / n + h.ph) % 1;
    const y = h.y0 - t * H * 0.55;
    const op = Math.min(1, t * 4) * (1 - Math.max(0, (t - 0.7) / 0.3));
    return heart(h.x + Math.sin(t * 6.28) * 10, y, h.s * (0.8 + 0.4 * t), h.c, op, h.rot);
  }).join("")));
}

const catEars = () => svg(512, 256, [-1, 1].map((s) => {
  const cx = 256 + s * 150;
  const outer = `M${cx - s * 95} 250 Q${cx - s * 40} 30 ${cx + s * 10} 18 Q${cx + s * 40} 30 ${cx + s * 95} 250 Z`;
  const inner = `M${cx - s * 55} 236 Q${cx - s * 25} 70 ${cx + s * 8} 62 Q${cx + s * 28} 75 ${cx + s * 58} 236 Z`;
  return `<path d="${outer}" fill="#4a4040"/><path d="${inner}" fill="#f6a5b8"/><path d="${outer}" fill="none" stroke="#2e2626" stroke-width="6"/>`;
}).join(""));

const catNose = () => svg(320, 160,
  `<path d="M160 64 L136 44 Q160 30 184 44 Z" fill="#f08aa4" stroke="#7a3a4a" stroke-width="3" stroke-linejoin="round"/>` +
  [-1, 1].map((s) => [0, 1, 2].map((k) => `<path d="M${160 + s * 44} ${70 + k * 14} Q${160 + s * 100} ${60 + k * 22} ${160 + s * 150} ${56 + k * 34}" stroke="#2e2626" stroke-width="4" fill="none" stroke-linecap="round"/>`).join("")).join(""));

const shades = () => svg(512, 200,
  `<path d="M40 70 Q40 40 80 40 L214 40 Q236 40 232 70 L222 130 Q214 170 168 170 L104 170 Q58 170 48 130 Z" fill="url(#lens)" stroke="#121212" stroke-width="10"/>` +
  `<path d="M472 70 Q472 40 432 40 L298 40 Q276 40 280 70 L290 130 Q298 170 344 170 L408 170 Q454 170 464 130 Z" fill="url(#lens)" stroke="#121212" stroke-width="10"/>` +
  `<path d="M232 66 Q256 52 280 66" stroke="#121212" stroke-width="10" fill="none"/>` +
  `<path d="M70 58 L120 58" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity="0.5"/><path d="M318 58 L368 58" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity="0.5"/>`,
  `<linearGradient id="lens" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3a55" stop-opacity="0.92"/><stop offset="1" stop-color="#7a4a8a" stop-opacity="0.85"/></linearGradient>`);

/** Canonical face-UV texture helpers (512x512, uv v down). */
const S = 512;
const uvPt = (i) => uv(i).map((v) => v * S);

function glitterMask() {
  const r = rng(23), out = [];
  const zones = [[205, 0.11], [425, 0.11], [159, 0.06], [386, 0.06], [6, 0.05]];
  for (const [lm, rad] of zones) {
    const c = uvPt(lm);
    for (let k = 0; k < (rad > 0.08 ? 120 : 45); k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad * S;
      const x = c[0] + Math.cos(a) * d, y = c[1] + Math.sin(a) * d * 0.8;
      const col = ["#fff6c8", "#ffd56a", "#ffc0e0", "#ffffff", "#c8e8ff"][k % 5];
      out.push(k % 9 === 0 ? star(x, y, 5 + r() * 5, col, 0.95) : `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(0.8 + r() * 1.6)}" fill="${col}" opacity="${f2(0.5 + r() * 0.5)}"/>`);
    }
  }
  return svg(S, S, out.join(""));
}

function frecklesMask() {
  const r = rng(31), out = [];
  // a band across the nose bridge and upper cheeks, denser in the middle
  const zones = [[195, 0.05, 0.03, 16], [5, 0.04, 0.025, 10], [50, 0.09, 0.06, 34], [280, 0.09, 0.06, 34], [118, 0.06, 0.035, 12], [347, 0.06, 0.035, 12]];
  for (const [lm, rx, ry, n] of zones) {
    const c = uvPt(lm);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 1.3);
      const x = c[0] + Math.cos(a) * d * rx * S, y = c[1] + Math.sin(a) * d * ry * S;
      out.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(1.6 + r() * 2.4)}" fill="url(#fr)" opacity="${f2(0.3 + r() * 0.35)}"/>`);
    }
  }
  return svg(S, S, out.join(""), `<radialGradient id="fr"><stop offset="0" stop-color="#7a4228"/><stop offset="0.6" stop-color="#8a5236"/><stop offset="1" stop-color="#8a5236" stop-opacity="0"/></radialGradient>`);
}

/** Mesh scan: wireframe of the face tessellation with a sweeping highlight band. */
function scanFrames(n = 10) {
  const edges = new Set();
  for (let i = 0; i < FACE_TRIS.length; i += 3) {
    const t = [FACE_TRIS[i], FACE_TRIS[i + 1], FACE_TRIS[i + 2]];
    for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3]; edges.add(a < b ? `${a}-${b}` : `${b}-${a}`); }
  }
  const list = [...edges].map((e) => e.split("-").map(Number));
  return Array.from({ length: n }, (_, f) => {
    const band = 0.08 + (f / (n - 1)) * 0.9;
    const dim = [], hot = [], dots = [];
    for (const [a, b] of list) {
      const pa = uvPt(a), pb = uvPt(b), v = (pa[1] + pb[1]) / 2 / S;
      const seg = `M${f2(pa[0])} ${f2(pa[1])}L${f2(pb[0])} ${f2(pb[1])}`;
      (Math.abs(v - band) < 0.05 ? hot : dim).push(seg);
    }
    for (let i = 0; i < 468; i++) { const p = uvPt(i); if (Math.abs(p[1] / S - band) < 0.03) dots.push(`<circle cx="${f2(p[0])}" cy="${f2(p[1])}" r="2.2" fill="#e8ffff"/>`); }
    const by = band * S;
    return svg(S, S,
      `<path d="${dim.join("")}" stroke="#4fe3ff" stroke-width="1" opacity="0.32" fill="none"/>` +
      `<rect x="0" y="${f2(by - 18)}" width="${S}" height="36" fill="url(#g)"/>` +
      `<path d="${hot.join("")}" stroke="#b8fbff" stroke-width="1.6" fill="none"/>` + dots.join(""),
      `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fe3ff" stop-opacity="0"/><stop offset="0.5" stop-color="#4fe3ff" stop-opacity="0.35"/><stop offset="1" stop-color="#4fe3ff" stop-opacity="0"/></linearGradient>`);
  });
}

const dreamyBackground = () => {
  const r = rng(41);
  const blobs = Array.from({ length: 14 }, () => `<circle cx="${f2(r() * 720)}" cy="${f2(r() * 1280)}" r="${f2(40 + r() * 140)}" fill="#ffffff" opacity="${f2(0.08 + r() * 0.18)}"/>`).join("");
  const stars = Array.from({ length: 26 }, () => star(r() * 720, r() * 1280, 6 + r() * 12, "#ffffff", 0.5 + r() * 0.5)).join("");
  return svg(720, 1280, `<rect width="720" height="1280" fill="url(#bg)"/>${blobs}${stars}`,
    `<linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#a9c8ff"/><stop offset="0.5" stop-color="#f3c4ff"/><stop offset="1" stop-color="#ffd9b8"/></linearGradient>`);
};

// ---------- thumbnails (128x128) ----------
const thumb = (bg, body, defs = "") => svg(128, 128, `<rect width="128" height="128" rx="28" fill="${bg}"/>${body}`, defs);
const eyeThumb = (iris, extra = "") => `<path d="M18 64 Q64 22 110 64 Q64 106 18 64Z" fill="#fff" stroke="#3a2e2e" stroke-width="4"/><circle cx="64" cy="64" r="22" fill="${iris}"/><circle cx="64" cy="64" r="9" fill="#1a1414"/><circle cx="56" cy="56" r="5" fill="#fff"/>${extra}`;

// ---------- definitions ----------

/** Sticker definitions (STICKER_FORMAT.md). Resource names are relative to the stickers root. */
function stickers() {
  const files = {};
  const add = (slug, name, file, data) => { files[`${slug}/${file}`] = data; return `${slug}/${file}`; };
  const seq = (slug, prefix, frames) => frames.map((d, i) => add(slug, "", `${prefix}_${String(i).padStart(2, "0")}.svg`, d));
  const defs = [];
  const def = (id, slug, name, th, body) => defs.push({ id, slug, name, thumb: add(slug, name, "thumb.svg", th), def: { stickerId: id, name, ...body } });

  def(101, "sparkles", "Sparkles", thumb("#2d2a5a", star(64, 60, 34, "#ffe27a") + star(96, 32, 12, "#fff") + star(30, 96, 10, "#ffd1ec")), {
    items: [{ id: "halo", drawType: "FACE", triggerType: "FACE_DETECT", faceLocationType: "HEAD_TOP", anchorType: "CENTER", translateY: 0.35, scale: 3.6, resourceType: "SEQUENCE", frames: seq("sparkles", "f", sparkleFrames()), fps: 10 }],
  });
  def(102, "hearts", "Hearts", thumb("#ffe1ea", heart(64, 70, 70, "#ff5c8a") + heart(100, 34, 26, "#ff8fb1")), {
    items: [{ id: "float", drawType: "FACE", triggerType: "FACE_DETECT", faceLocationType: "FACE_CENTER", anchorType: "CENTER", scale: 3.6, rotationMode: "INVARIANT", resourceType: "SEQUENCE", frames: seq("hearts", "f", heartFrames()), fps: 12 }],
    makeup: { layers: [{ region: "blush", color: "#ff8fa8", blend: "multiply", opacity: 0.35 }] },
  });
  def(103, "cat", "Kitty", thumb("#f6efe6", `<g transform="translate(0 18) scale(0.25)">${catEars().replace(/<\/?svg[^>]*>/g, "")}</g><circle cx="64" cy="80" r="30" fill="#4a4040"/><path d="M64 84 L57 78 Q64 74 71 78Z" fill="#f08aa4"/>`), {
    items: [
      { id: "head", drawType: "OCCLUDER" },
      { id: "ears", drawType: "FACE_3D", triggerType: "FACE_DETECT", faceLocationType: "HEAD_TOP", anchorType: "BOTTOM", translateY: 0.6, translateZ: -0.25, scale: 2.7, resourceType: "IMAGE", resourceName: add("cat", "", "ears.svg", catEars()) },
      { id: "nose", drawType: "FACE", triggerType: "FACE_DETECT", faceLocationType: "NOSE", anchorType: "CENTER", translateY: 0.12, scale: 1.9, resourceType: "IMAGE", resourceName: add("cat", "", "nose.svg", catNose()) },
    ],
  });
  def(104, "shades", "Shades", thumb("#ffd36e", `<g transform="translate(4 42) scale(0.234)">${shades().replace(/<\/?svg[^>]*>/g, "")}</g>`), {
    items: [{ id: "glasses", drawType: "FACE_3D", triggerType: "FACE_DETECT", faceLocationType: "EYES_CENTER", anchorType: "CENTER", translateY: 0.03, translateZ: 0.15, scale: 2.5, resourceType: "IMAGE", resourceName: add("shades", "", "glasses.svg", shades()) }],
  });
  def(105, "glitter", "Glitter", thumb("#3a2a4a", star(44, 50, 18, "#ffd56a") + star(84, 78, 14, "#ffc0e0") + star(78, 36, 8, "#fff") + `<circle cx="40" cy="88" r="4" fill="#c8e8ff"/>`), {
    items: [{ id: "glitter", drawType: "FACE_MASK", triggerType: "FACE_DETECT", blendType: "SCREEN", resourceType: "IMAGE", resourceName: add("glitter", "", "face.svg", glitterMask()) }],
    makeup: { layers: [{ region: "lips", color: "#d46a7e", blend: "multiply", opacity: 0.25 }, { region: "lips", lipGloss: "glitter", color: "#ffe9f0", opacity: 0.8 }] },
  });
  def(106, "scan", "Mesh scan", thumb("#0d1b2a", `<path d="M30 40 L64 24 L98 40 L98 86 L64 106 L30 86Z M64 24 L64 106 M30 40 L98 86 M98 40 L30 86" stroke="#4fe3ff" stroke-width="3" fill="none" opacity="0.8"/><rect x="20" y="58" width="88" height="8" fill="#b8fbff" opacity="0.7"/>`), {
    items: [{ id: "mesh", drawType: "FACE_MASK", triggerType: "FACE_DETECT", blendType: "SCREEN", resourceType: "SEQUENCE", frames: seq("scan", "f", scanFrames()), fps: 12 }],
  });
  def(107, "freckles", "Freckles", thumb("#f3d2bd", Array.from({ length: 16 }, (_, i) => `<circle cx="${30 + ((i * 37) % 70)}" cy="${44 + ((i * 23) % 44)}" r="${2 + (i % 3)}" fill="#8a5236" opacity="0.7"/>`).join("")), {
    items: [{ id: "freckles", drawType: "FACE_MASK", triggerType: "FACE_DETECT", blendType: "MULTIPLY", resourceType: "IMAGE", resourceName: add("freckles", "", "face.svg", frecklesMask()) }],
  });
  def(108, "sky-lens", "Sky lens", thumb("#e6f2ff", eyeThumb("#4a9ae0")), {
    items: [{ id: "lens", drawType: "COLOR_LENS", triggerType: "FACE_DETECT", color: "#4a9ae0", pattern: "starburst", blendType: "COLOR", alpha: 0.75 }],
  });
  def(109, "amber-lens", "Amber lens", thumb("#fff1dc", eyeThumb("#c8862e")), {
    items: [{ id: "lens", drawType: "COLOR_LENS", triggerType: "FACE_DETECT", color: "#c8862e", pattern: "ring", blendType: "SOFTLIGHT", alpha: 0.9 }],
  });
  def(110, "starlight", "Starlight eyes", thumb("#e9e4ff", eyeThumb("#6a5a8a", star(54, 54, 9, "#fff"))), {
    items: [],
    makeup: { layers: [{ region: "lens", style: "catch-star", color: "#ffffff", blend: "screen", opacity: 0.95 }, { region: "lens", style: "ring", color: "#8a7ab8", blend: "softlight", opacity: 0.5 }] },
  });
  def(111, "glam", "Glam", thumb("#f7d9d0", `<path d="M30 70 Q64 40 98 70 Q64 104 30 70Z" fill="#c21e2c"/><path d="M30 70 Q64 66 98 70" stroke="#7a1018" stroke-width="3" fill="none"/>`), {
    items: [],
    makeup: {
      layers: [
        { region: "lips", color: "#b4202e", blend: "multiply", opacity: 0.55, gloss: 0.2 },
        { region: "eyeshadow", color: "#9a6233", blend: "multiply", opacity: 0.5 },
        { region: "eyeshadow", color: "#ffd9a0", blend: "screen", opacity: 0.2 },
        { region: "eyeliner", color: "#141010", blend: "multiply", opacity: 0.8, style: "wing" },
        { region: "lashes", color: "#120c0a", opacity: 0.85, lash3d: { length: 1.1, density: 42, curl: 0.75 } },
        { region: "blush", color: "#e8806e", blend: "multiply", opacity: 0.3, style: "lifted" },
        { region: "contour", color: "#7a4c3a", blend: "multiply", opacity: 0.25, style: "sculpt" },
        { region: "highlight", color: "#fff1e0", blend: "screen", opacity: 0.25 },
      ],
      teethWhiten: 0.3,
    },
  });
  def(112, "doll-lashes", "Doll lashes", thumb("#fde8ef", `<path d="M22 70 Q64 40 106 70" stroke="#1a1210" stroke-width="5" fill="none"/>` + Array.from({ length: 11 }, (_, i) => { const t = i / 10, x = 26 + t * 76, y = 70 - Math.sin(t * Math.PI) * 26; return `<path d="M${f2(x)} ${f2(y)} Q${f2(x - 6 + t * 12)} ${f2(y - 20)} ${f2(x - 10 + t * 20)} ${f2(y - 30)}" stroke="#1a1210" stroke-width="3" fill="none" stroke-linecap="round"/>`; }).join("")), {
    items: [],
    makeup: { layers: [{ region: "lashes", color: "#120c0a", opacity: 0.95, lash3d: { length: 1.35, density: 46, curl: 0.9, flare: 0.2 } }, { region: "eyeliner", color: "#1a1414", blend: "multiply", opacity: 0.5, style: "thin" }] },
  });
  def(113, "big-eyes", "Big eyes", thumb("#e3f6ee", `<circle cx="42" cy="58" r="22" fill="#fff" stroke="#2e2626" stroke-width="4"/><circle cx="86" cy="58" r="22" fill="#fff" stroke="#2e2626" stroke-width="4"/><circle cx="46" cy="60" r="11" fill="#2e2626"/><circle cx="82" cy="60" r="11" fill="#2e2626"/><path d="M52 92 Q64 100 76 92" stroke="#2e2626" stroke-width="4" fill="none" stroke-linecap="round"/>`), {
    items: [{ id: "reshape", drawType: "BUILT_IN", triggerType: "FACE_DETECT" }],
    shape: { eyeSize: 0.5, pupil: 0.25, faceSlim: 0.3, noseWidth: -0.2, chinLength: 0.1, mouthSize: -0.1 },
  });
  def(114, "dreamy", "Dreamy sky", thumb("#cdb8ff", `<circle cx="64" cy="64" r="44" fill="url(#t)"/>` + star(80, 44, 10, "#fff"), `<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9c8ff"/><stop offset="1" stop-color="#ffd9b8"/></linearGradient>`), {
    items: [{ id: "sky", drawType: "BACKGROUND", triggerType: "ALWAYS", segmentation: { target: "background" }, resourceType: "IMAGE", resourceName: add("dreamy", "", "sky.svg", dreamyBackground()) }],
  });
  def(115, "pop", "Mouth pop", thumb("#fff4c2", star(64, 60, 30, "#ff9a3c") + heart(40, 92, 20, "#ff5c8a") + heart(92, 90, 18, "#ff8fb1")), {
    items: [{ id: "burst", drawType: "FACE", triggerType: "MOUTH_OPEN_BEGIN", faceLocationType: "MOUTH", anchorType: "CENTER", scale: 4.2, rotationMode: "INVARIANT", repeatCount: 1, resourceType: "SEQUENCE", frames: seq("pop", "f", heartFrames(12)), fps: 18 }],
  });
  return { defs, files };
}

export function generate() {
  const { defs, files } = stickers();
  for (const [rel, data] of Object.entries(files)) writePack(`stickers/${rel}`, data);
  const sticker = {}, thumbs = {};
  for (const d of defs) {
    sticker[d.slug] = { path: `stickers/${d.slug}/`, meta: { id: d.id, name: d.name, def: d.def } };
    thumbs[d.slug] = { path: `stickers/${d.thumb}` };
  }
  updateManifest({ sticker, "sticker-thumb": thumbs });
  updateManifest({ root: { stickers: { path: "stickers/" } } }, { merge: true });
  return { stickers: defs.length, files: Object.keys(files).length };
}

if (runAsMain(import.meta.url)) console.log("gen-stickers:", generate());
