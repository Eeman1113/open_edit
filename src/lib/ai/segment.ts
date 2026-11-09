// Cutout auto subject: MediaPipe Interactive Segmenter (magic_touch.tflite, Apache-2.0) on the shared
// tasks-vision wasm (self-hosted, shared with the face engine). A tap or an outline becomes a mask snapped to the subject.
import type { InteractiveSegmenterLegacy } from "@mediapipe/tasks-vision";
import { loadVision } from "@/lib/face";
import { canvas, ctx2d, type Src } from "./canvas";
import { MAGIC_TOUCH_URL } from "./models";

let segP: Promise<InteractiveSegmenterLegacy> | null = null;
export function loadSegmenter() {
  segP ??= (async () => {
    const { vision, fileset } = await loadVision();
    const make = (delegate: "GPU" | "CPU") => vision.InteractiveSegmenterLegacy.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MAGIC_TOUCH_URL, delegate },
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
    try { return await make("GPU"); } catch { return await make("CPU"); }
  })().catch((e) => { segP = null; throw e; });
  return segP;
}

/** Runs the segmenter on `img` (<= 1024 px) at a keypoint or along a scribble; returns an alpha mask canvas. */
async function run(img: Src, roi: { keypoint?: { x: number; y: number }; scribble?: { x: number; y: number }[] }) {
  const seg = await loadSegmenter();
  const res = seg.segment(img, roi);
  const masks = res.confidenceMasks ?? [];
  const m = masks[masks.length - 1];
  if (!m) { res.close?.(); return null; }
  const f = m.getAsFloat32Array();
  const w = m.width, h = m.height;
  const c = canvas(w, h);
  const id = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) { id.data[i * 4] = 255; id.data[i * 4 + 1] = 255; id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, (f[i] - 0.35) / 0.3)) * 255); }
  ctx2d(c).putImageData(id, 0, 0);
  res.close?.();
  return c;
}

function fit(src: Src, x: number, y: number, w: number, h: number) {
  const k = Math.min(1, 1024 / Math.max(w, h));
  const c = canvas(w * k, h * k);
  const g = ctx2d(c);
  g.imageSmoothingQuality = "high";
  g.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

/** Tap: the subject under (u, v) (photo-normalized). Returns a full-size alpha mask or null. */
export async function subjectAt(src: Src, u: number, v: number) {
  const img = fit(src, 0, 0, src.width, src.height);
  const m = await run(img, { keypoint: { x: u, y: v } });
  if (!m) return null;
  const out = canvas(src.width, src.height);
  const g = ctx2d(out);
  g.imageSmoothingQuality = "high";
  g.drawImage(m, 0, 0, out.width, out.height);
  return out;
}

/**
 * Outline: segments the subject inside the drawn loop (photo-normalized points). The segmenter runs on a crop
 * around the loop with a scribble through the loop's inner area; the result is limited to the (slightly grown)
 * loop. Falls back to the plain loop when the model finds nothing that fills it.
 */
export async function subjectInOutline(src: Src, pts: number[]) {
  const W = src.width, H = src.height;
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0, cx = 0, cy = 0;
  const n = pts.length / 2;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
    cx += pts[i] / n; cy += pts[i + 1] / n;
  }
  const mx = (x1 - x0) * 0.08, my = (y1 - y0) * 0.08;
  const px = Math.max(0, (x0 - mx) * W), py = Math.max(0, (y0 - my) * H);
  const pw = Math.min(W, (x1 + mx) * W) - px, ph = Math.min(H, (y1 + my) * H) - py;
  if (pw < 4 || ph < 4) return null;
  const crop = fit(src, px, py, pw, ph);
  // loop polygon mask (full size)
  const poly = canvas(W, H);
  const pg = ctx2d(poly);
  pg.fillStyle = "#fff";
  pg.beginPath();
  for (let i = 0; i < pts.length; i += 2) (i ? pg.lineTo : pg.moveTo).call(pg, pts[i] * W, pts[i + 1] * H);
  pg.closePath(); pg.fill();
  // scribble: the loop shrunk halfway toward its centroid, in crop-normalized coords
  const toCrop = (u: number, v: number) => ({ x: (u * W - px) / pw, y: (v * H - py) / ph });
  const scribble: { x: number; y: number }[] = [];
  const step = Math.max(2, Math.floor(pts.length / 2 / 24)) * 2;
  for (let i = 0; i < pts.length; i += step) scribble.push(toCrop(cx + (pts[i] - cx) * 0.45, cy + (pts[i + 1] - cy) * 0.45));
  scribble.push(toCrop(cx, cy));
  const inside = (p: { x: number; y: number }) => pg.getImageData(Math.round(px + p.x * pw), Math.round(py + p.y * ph), 1, 1).data[3] > 0;
  const sc = scribble.filter(inside);
  let m = sc.length ? await run(crop, sc.length > 1 ? { scribble: sc } : { keypoint: sc[0] }) : null;
  const out = canvas(W, H);
  const og = ctx2d(out);
  if (m) {
    og.imageSmoothingQuality = "high";
    og.drawImage(m, px, py, pw, ph);
    // keep only what lies inside the (slightly grown) outline
    const grown = canvas(W, H);
    const gg = ctx2d(grown);
    gg.filter = `blur(${Math.max(2, Math.max(pw, ph) * 0.02)}px)`;
    gg.drawImage(poly, 0, 0); gg.drawImage(grown, 0, 0);
    og.globalCompositeOperation = "destination-in";
    og.drawImage(grown, 0, 0);
    og.globalCompositeOperation = "source-over";
    // sanity: the subject must cover a meaningful part of the loop
    const k = Math.min(1, 256 / Math.max(W, H));
    const a = canvas(W * k, H * k), b = canvas(W * k, H * k);
    ctx2d(a).drawImage(out, 0, 0, a.width, a.height); ctx2d(b).drawImage(poly, 0, 0, b.width, b.height);
    const ad = ctx2d(a).getImageData(0, 0, a.width, a.height).data, bd = ctx2d(b).getImageData(0, 0, b.width, b.height).data;
    let sa = 0, sb = 0;
    for (let i = 3; i < ad.length; i += 4) { sa += ad[i]; sb += bd[i]; }
    if (sb === 0 || sa / sb < 0.08) m = null;
  }
  if (!m) { og.clearRect(0, 0, W, H); og.drawImage(poly, 0, 0); return { mask: out, snapped: false }; }
  return { mask: out, snapped: true };
}
