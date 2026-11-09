// Body slim (camera Beauty "Body", editor Body "Slim"): a horizontal squeeze of the body silhouette toward its
// midline, driven by MediaPipe pose (shoulders / hips / knees / ankles) and, when available, the person segmentation
// mask (actual silhouette width per row). The head is not touched here; callers that also want a smaller head pass
// warp.headSize.
// Output is a LiquifyField (view space) rendered by FaceWarp.applyLiquify, so it costs one mesh pass.

import { unmapPoint, type ViewMapping } from "./landmarks";
import type { PoseData, SegmentationMasks } from "./tracker";
import { LiquifyField } from "./warp";

export interface BodySlimParams {
  /** 0..1 slider. 1 narrows the body by ~12 % about its midline. Negative widens. */
  slim: number;
  /** FaceTracker.latestPose (source space). The biggest visible person is used. */
  pose?: PoseData[] | PoseData | null;
}

const vis = (p: PoseData, i: number) => p.points[i * 4 + 3];
const px = (p: PoseData, i: number) => p.points[i * 4];
const py = (p: PoseData, i: number) => p.points[i * 4 + 1];
const sst = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Midline and half-width profile of the body, by source y (normalized). */
interface Profile { ys: number[]; mid: number[]; half: number[]; top: number }

function profile(p: PoseData, aspect: number, masks?: SegmentationMasks | null): Profile | null {
  const ok = (a: number, b: number) => vis(p, a) > 0.35 && vis(p, b) > 0.35;
  if (!ok(11, 12)) return null;
  const rows: [number, number, number][] = []; // y, mid, half (x units)
  const pair = (a: number, b: number, k: number) => {
    const y = (py(p, a) + py(p, b)) / 2, m = (px(p, a) + px(p, b)) / 2;
    rows.push([y, m, Math.abs(px(p, a) - px(p, b)) * 0.5 * k]);
  };
  pair(11, 12, 1.12);
  const sh = rows[0][2];
  if (ok(23, 24)) pair(23, 24, 1.7); else rows.push([rows[0][0] + sh * 2.6 * aspect, rows[0][1], sh * 0.9]);
  const hip = rows[rows.length - 1];
  if (ok(25, 26)) pair(25, 26, 1.25);
  if (ok(27, 28)) pair(27, 28, 1.1);
  // y units: source y; keep the profile monotonic in y
  rows.sort((a, b) => a[0] - b[0]);
  const prof: Profile = { ys: rows.map((r) => r[0]), mid: rows.map((r) => r[1]), half: rows.map((r) => Math.max(r[2], hip[2] * 0.35)), top: rows[0][0] };
  if (masks) refineWithMask(prof, masks);
  return prof;
}

/** Measure the silhouette half-width around the midline in the person mask (R channel). */
function refineWithMask(pr: Profile, m: SegmentationMasks) {
  for (let k = 0; k < pr.ys.length; k++) {
    const y = Math.round(pr.ys[k] * (m.height - 1));
    if (y < 0 || y >= m.height) continue;
    const cx = Math.round(pr.mid[k] * (m.width - 1));
    const on = (x: number) => x >= 0 && x < m.width && m.data[(y * m.width + x) * 4] > 127;
    if (!on(cx)) continue;
    let l = cx, r = cx;
    while (on(l - 1)) l--;
    while (on(r + 1)) r++;
    const half = Math.max(cx - l, r - cx) / (m.width - 1);
    pr.half[k] = Math.max(pr.half[k] * 0.6, Math.min(pr.half[k] * 1.6, half));
  }
}

function at(pr: Profile, y: number): [number, number] {
  const { ys, mid, half } = pr;
  if (y <= ys[0]) return [mid[0], half[0]];
  for (let i = 1; i < ys.length; i++) if (y <= ys[i]) {
    const t = (y - ys[i - 1]) / ((ys[i] - ys[i - 1]) || 1);
    return [mid[i - 1] + (mid[i] - mid[i - 1]) * t, half[i - 1] + (half[i] - half[i - 1]) * t];
  }
  return [mid[mid.length - 1], half[half.length - 1]];
}

export function pickPose(pose?: PoseData[] | PoseData | null): PoseData | null {
  if (!pose) return null;
  const list = Array.isArray(pose) ? pose : [pose];
  let best: PoseData | null = null, bw = 0;
  for (const p of list) { const w = Math.abs(px(p, 11) - px(p, 12)) * Math.min(vis(p, 11), vis(p, 12)); if (w > bw) { bw = w; best = p; } }
  return best;
}

export function bodySlimActive(b?: BodySlimParams | null): boolean {
  return !!b && Math.abs(b.slim) > 1e-3 && !!pickPose(b.pose);
}

/**
 * Fills (or creates) a LiquifyField with the body-slim displacement for the view (w x h, mapping = the renderer's
 * cover crop + mirror). Returns null when there is no usable pose.
 */
export function bodySlimField(field: LiquifyField | null | undefined, w: number, h: number, b: BodySlimParams, mapping: ViewMapping, masks?: SegmentationMasks | null): LiquifyField | null {
  const p = pickPose(b.pose);
  if (!p || !b.slim) return null;
  const srcAspect = (w / mapping.sx) / (h / mapping.sy);
  const pr = profile(p, srcAspect, masks);
  if (!pr) return null;
  const aspect = w / h;
  let f = field;
  if (!f || Math.abs(f.cols / f.rows - aspect) > 0.05) f = new LiquifyField(aspect, 48);
  const s = Math.max(-0.6, Math.min(1, b.slim)) * 0.12;
  const sign = mapping.mirror ? -1 : 1;
  const W = f.cols + 1;
  // fade in below the shoulders' top (the neck / head stay put)
  const neck0 = pr.top - pr.half[0] * 0.35 * srcAspect, neck1 = pr.top + pr.half[0] * 0.25 * srcAspect;
  for (let j = 0; j <= f.rows; j++) for (let i = 0; i <= f.cols; i++) {
    const [sx, sy] = unmapPoint(i / f.cols, j / f.rows, mapping);
    const vw = sst(neck0, neck1, sy);
    let d = 0;
    if (vw > 0) {
      const [mid, half] = at(pr, sy);
      const t = Math.abs(sx - mid) / Math.max(half, 1e-4);
      const g = t < 1 ? 1 : t < 2 ? 2 - t : 0;
      // backward offset: the pixel at x shows the source at mid + (x - mid)(1 + s g)
      d = -(sx - mid) * s * g * vw;
    }
    // pin the frame border (no clamp-to-edge smear where the body is cut by the frame)
    const u = i / f.cols, edge = sst(0, 0.06, u) * sst(0, 0.06, 1 - u);
    f.d[(j * W + i) * 2] = d * mapping.sx * sign * edge;
    f.d[(j * W + i) * 2 + 1] = 0;
  }
  return f;
}
