// Built-in sticker packs for the photo editor. Every sticker is a small SVG drawn here (flat shapes, outlines and
// a few words set in the system sans-serif), so the packs are original and need no downloads. Each sticker is a
// data URL usable as an <img> source and as a layer image.

export interface StampPack { id: string; name: string; about: string; stamps: string[] }

const svg = (body: string, vb = 120) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb} ${vb}">${body}</svg>`)}`;
const OUT = 'stroke="#1b1b1f" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"';

const star = (cx: number, cy: number, r: number, k = 0.45, n = 5) => {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2, rr = i % 2 ? r * k : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return pts.join(" ");
};
const heart = "M60 102 C22 76 10 56 14 38 C18 20 42 14 60 34 C78 14 102 20 106 38 C110 56 98 76 60 102Z";

const DOODLES = [
  svg(`<path d="${heart}" fill="#ff5d73" ${OUT}/><path d="M34 40 C36 32 44 28 50 32" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`),
  svg(`<polygon points="${star(60, 62, 50)}" fill="#ffc83d" ${OUT}/>`),
  svg(`<path d="M60 8 L70 50 L112 60 L70 70 L60 112 L50 70 L8 60 L50 50Z" fill="#9b8cff" ${OUT}/>`),
  svg(`<path d="M68 6 L28 66 L56 66 L48 114 L92 48 L64 48 Z" fill="#ffd23f" ${OUT}/>`),
  svg(`<path d="M18 86 L28 34 L48 62 L60 26 L72 62 L92 34 L102 86 Z" fill="#ffc83d" ${OUT}/><rect x="18" y="86" width="84" height="14" rx="4" fill="#ffb020" ${OUT}/>`),
  svg(`${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="60" cy="34" rx="16" ry="26" fill="#ff8fab" ${OUT} transform="rotate(${a} 60 60)"/>`).join("")}<circle cx="60" cy="60" r="14" fill="#ffd23f" ${OUT}/>`),
  svg(`<path d="M14 66 C30 30 70 20 96 40" fill="none" stroke="#1b1b1f" stroke-width="16" stroke-linecap="round"/><path d="M14 66 C30 30 70 20 96 40" fill="none" stroke="#4cc9f0" stroke-width="8" stroke-linecap="round"/><path d="M80 22 L104 44 L74 54Z" fill="#4cc9f0" ${OUT}/>`),
  svg(`<circle cx="60" cy="60" r="46" fill="#ffd23f" ${OUT}/><circle cx="44" cy="50" r="6" fill="#1b1b1f"/><circle cx="76" cy="50" r="6" fill="#1b1b1f"/><path d="M38 70 Q60 92 82 70" fill="none" ${OUT}/>`),
];

const bubble = (word: string, fill: string, ink = "#1b1b1f") => svg(
  `<path d="M14 26 Q14 14 26 14 H134 Q146 14 146 26 V70 Q146 82 134 82 H62 L40 102 L44 82 H26 Q14 82 14 70Z" fill="${fill}" ${OUT}/>` +
  `<text x="80" y="58" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="30" font-weight="800" fill="${ink}">${word}</text>`, 160);
const tag = (word: string, fill: string) => svg(
  `<rect x="10" y="44" width="140" height="56" rx="28" fill="${fill}" ${OUT} transform="rotate(-6 80 72)"/>` +
  `<text x="80" y="82" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="28" font-weight="800" fill="#fff" transform="rotate(-6 80 72)">${word}</text>`, 160);
const WORDS = [
  bubble("wow!", "#ffffff"), bubble("yay", "#ffd23f"), bubble("hello", "#8bd3ff"), bubble("love it", "#ff8fab"),
  tag("cool", "#5b5bd6"), tag("so good", "#ff5d73"), tag("thanks", "#2bb673"), tag("weekend", "#ff8a00"),
];

const SHAPES = [
  svg(`<circle cx="60" cy="60" r="40" fill="none" stroke="#ffb020" stroke-width="14"/>`),
  svg(`<path d="M60 14 C88 12 108 34 104 62 C100 92 76 108 50 102 C22 96 10 72 18 48 C24 28 40 16 60 14Z" fill="#7ee0c3" ${OUT}/>`),
  svg(`<path d="M10 70 Q25 40 40 70 T70 70 T100 70 T130 70" fill="none" stroke="#ff5d73" stroke-width="10" stroke-linecap="round"/>`, 140),
  svg(`${Array.from({ length: 14 }, (_, i) => { const x = 14 + ((i * 37) % 92), y = 14 + ((i * 53) % 92), c = ["#ff5d73", "#ffd23f", "#4cc9f0", "#9b8cff", "#2bb673"][i % 5]; return `<rect x="${x}" y="${y}" width="10" height="16" rx="3" fill="${c}" transform="rotate(${(i * 47) % 180} ${x + 5} ${y + 8})"/>`; }).join("")}`),
  svg(`${Array.from({ length: 16 }, (_, i) => `<circle cx="${18 + (i % 4) * 28}" cy="${18 + Math.floor(i / 4) * 28}" r="7" fill="#ffffff"/>`).join("")}`),
  svg(`<polygon points="60,12 108,100 12,100" fill="#4cc9f0" ${OUT}/>`),
  svg(`<polygon points="${star(60, 60, 54, 0.62, 12)}" fill="#ff8a00" ${OUT}/>`),
  svg(`<rect x="20" y="20" width="80" height="80" rx="22" fill="#9b8cff" ${OUT} transform="rotate(12 60 60)"/>`),
];

const WEATHER = [
  svg(`${Array.from({ length: 8 }, (_, i) => `<rect x="56" y="6" width="8" height="20" rx="4" fill="#ffb020" transform="rotate(${i * 45} 60 60)"/>`).join("")}<circle cx="60" cy="60" r="28" fill="#ffd23f" ${OUT}/>`),
  svg(`<path d="M30 92 Q10 92 12 74 Q14 58 32 60 Q34 36 58 36 Q80 36 86 56 Q108 52 110 72 Q112 92 90 92Z" fill="#ffffff" ${OUT}/>`),
  svg(`${["#ff5d73", "#ff8a00", "#ffd23f", "#2bb673", "#4cc9f0", "#9b8cff"].map((c, i) => `<path d="M${14 + i * 7} 96 A${46 - i * 7} ${46 - i * 7} 0 0 1 ${106 - i * 7} 96" fill="none" stroke="${c}" stroke-width="7"/>`).join("")}`),
  svg(`<path d="M74 14 A46 46 0 1 0 106 78 A36 36 0 1 1 74 14Z" fill="#ffe08a" ${OUT}/>`),
  svg(`${[0, 60, 120].map((a) => `<g transform="rotate(${a} 60 60)"><line x1="60" y1="12" x2="60" y2="108" stroke="#8bd3ff" stroke-width="8" stroke-linecap="round"/><path d="M48 22 L60 34 L72 22 M48 98 L60 86 L72 98" fill="none" stroke="#8bd3ff" stroke-width="6" stroke-linecap="round"/></g>`).join("")}`),
  svg(`<path d="M60 12 C60 12 26 54 26 76 A34 34 0 0 0 94 76 C94 54 60 12 60 12Z" fill="#4cc9f0" ${OUT}/><path d="M42 74 Q42 90 56 94" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`),
  svg(`<polygon points="${star(36, 40, 22)}" fill="#ffd23f" ${OUT}/><polygon points="${star(84, 56, 16)}" fill="#fff" ${OUT}/><polygon points="${star(50, 90, 12)}" fill="#ffb020" ${OUT}/>`),
  svg(`<path d="M18 62 A42 42 0 0 1 102 62 Z" fill="#ff5d73" ${OUT}/><path d="M60 62 V96 Q60 106 50 104" fill="none" ${OUT}/>`),
];

export const STAMP_PACKS: StampPack[] = [
  { id: "doodles", name: "Doodles", about: "Hearts, stars, sparks and friends", stamps: DOODLES },
  { id: "words", name: "Say it", about: "Speech bubbles and tags", stamps: WORDS },
  { id: "shapes", name: "Shapes", about: "Rings, blobs, confetti and bursts", stamps: SHAPES },
  { id: "weather", name: "Sky", about: "Sun, clouds, rain and rainbows", stamps: WEATHER },
];

const ADDED_KEY = "oe:edit:stampPacks";
/** Packs added to the sticker picker (Doodles is there from the start). */
export function addedPacks(): string[] {
  try { const v = JSON.parse(localStorage.getItem(ADDED_KEY) ?? "null") as string[] | null; return (v ?? ["doodles"]).filter((id) => STAMP_PACKS.some((p) => p.id === id)); } catch { return ["doodles"]; }
}
export function setAddedPacks(ids: string[]) {
  try { localStorage.setItem(ADDED_KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ }
}
