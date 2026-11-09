// Synthetic test photos for the editors' dev-only proof hooks (?__sample=1). Everything is drawn here: a sky
// gradient, a sun, layered hills, a lake with reflections and a few trees. No faces, no real photos.

const PALETTES: [string, string, string, string, string][] = [
  ["#1d3b6e", "#f6a35b", "#2f5d50", "#4f8a5b", "#9fd3c7"],
  ["#2a1e5c", "#ff7a7a", "#3b3f6b", "#6b5b95", "#ffd6a5"],
  ["#0f4c5c", "#fcd34d", "#386641", "#6a994e", "#a7c957"],
  ["#3d405b", "#f2cc8f", "#81b29a", "#e07a5f", "#f4f1de"],
  ["#14213d", "#fca311", "#264653", "#2a9d8f", "#e9c46a"],
  ["#5f0f40", "#fb8b24", "#9a031e", "#e36414", "#0f4c5c"],
  ["#22223b", "#c9ada7", "#4a4e69", "#9a8c98", "#f2e9e4"],
  ["#003049", "#fcbf49", "#d62828", "#f77f00", "#eae2b7"],
  ["#283618", "#dda15e", "#606c38", "#bc6c25", "#fefae0"],
];

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Draws one synthetic landscape. */
export function sampleCanvas(w = 1200, h = 1600, seed = 1): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  const [sky, sun, far, near, water] = PALETTES[(seed - 1 + PALETTES.length) % PALETTES.length];
  const r = rng(seed);
  const horizon = h * (0.5 + r() * 0.1);
  const sg = g.createLinearGradient(0, 0, 0, horizon);
  sg.addColorStop(0, sky); sg.addColorStop(1, sun);
  g.fillStyle = sg; g.fillRect(0, 0, w, horizon);
  // sun with a soft halo
  const sx = w * (0.25 + r() * 0.5), sy = horizon * (0.45 + r() * 0.25), sr = w * 0.09;
  const halo = g.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 4);
  halo.addColorStop(0, "rgba(255,240,200,0.55)"); halo.addColorStop(1, "rgba(255,240,200,0)");
  g.fillStyle = halo; g.fillRect(0, 0, w, horizon);
  g.fillStyle = "#fff4d6"; g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
  // hills
  const hill = (base: number, amp: number, color: string, k: number) => {
    g.fillStyle = color; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, base - amp * (0.5 + 0.5 * Math.sin((x / w) * Math.PI * k + seed)) - amp * 0.3 * Math.sin((x / w) * 13 + seed * 2));
    g.lineTo(w, h); g.closePath(); g.fill();
  };
  hill(horizon, h * 0.12, far, 2.2);
  hill(horizon + h * 0.04, h * 0.07, near, 3.4);
  // lake with a reflected sun
  const lg = g.createLinearGradient(0, horizon + h * 0.08, 0, h);
  lg.addColorStop(0, water); lg.addColorStop(1, sky);
  g.fillStyle = lg; g.fillRect(0, horizon + h * 0.08, w, h);
  g.globalAlpha = 0.35; g.fillStyle = "#fff4d6";
  for (let i = 0; i < 14; i++) { const y = horizon + h * 0.1 + i * h * 0.022; g.fillRect(sx - sr * (1 - i / 16), y, sr * 2 * (1 - i / 16), h * 0.006); }
  g.globalAlpha = 1;
  // trees on the near shore
  for (let i = 0; i < 9; i++) {
    const tx = w * r(), ty = horizon + h * 0.08 - h * 0.01 * r(), th = h * (0.06 + r() * 0.08);
    g.fillStyle = "#1b2a24";
    g.beginPath(); g.moveTo(tx, ty - th); g.lineTo(tx - th * 0.28, ty); g.lineTo(tx + th * 0.28, ty); g.closePath(); g.fill();
  }
  // fine grain so tools that look for texture have something to work with
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 10; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  return c;
}

/** The synthetic landscape as a JPEG blob. */
export function sampleBlob(w = 1200, h = 1600, seed = 1): Promise<Blob> {
  return new Promise((res, rej) => sampleCanvas(w, h, seed).toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.92));
}
