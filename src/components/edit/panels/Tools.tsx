"use client";

// EPToolsFragment + EPCropFragment (crop / rotate / perspective).
import { useEffect, useMemo, useRef, useState } from "react";
import { useEdit } from "../ctx";
import { CROP_RATIOS, TOOLS } from "../model";
import { ControlRow, FeatureButton, FeatureList, Img, TitleBar, TitleTab } from "../ui";

export function ToolsPanel() {
  const { undo, redo, setOriginal, openSub } = useEdit();
  return (
    <>
      <ControlRow undo={undo} redo={redo} onOriginal={setOriginal} />
      <div className="absolute inset-x-0" style={{ bottom: 52, height: 134 }}>
        <FeatureList count={TOOLS.length}>
          {TOOLS.map((t) => (
            <FeatureButton
              key={t.key} icon={t.icon} label={t.label}
              onClick={() => openSub(t.key === "crop" ? "crop" : `x:${t.key}`)}
            />
          ))}
        </FeatureList>
      </div>
    </>
  );
}

/* ================================================================== geometry helpers */

type V = { x: number; y: number };
const rot = (p: V, a: number): V => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });

/** 3x3 homography (h8 = 1) mapping 4 source points to 4 destination points. */
function homography(src: V[], dst: V[]): number[] {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: X, y: Y } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return [...b.map((v, i) => v / A[i][i]), 1];
}
const applyH = (h: number[], x: number, y: number): V => {
  const w = h[6] * x + h[7] * y + 1;
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
};

/** Skewed corner quad (TL, TR, BR, BL) in centred image-local coords (EPCropViewModel skew rules). */
function skewQuad(w: number, h: number, sh: number, sv: number): V[] {
  const q: V[] = [{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }];
  if (sh) {
    const t = Math.tan(Math.abs(sh) * Math.PI / 180) * w / 2;
    if (sh > 0) { q[1].x += t; q[2].x += t; q[1].y -= t; q[2].y += t; }
    else { q[0].x -= t; q[3].x -= t; q[0].y -= t; q[3].y += t; }
  }
  if (sv) {
    const t = Math.tan(Math.abs(sv) * Math.PI / 180) * h / 2;
    if (sv > 0) { q[0].x -= t; q[1].x += t; q[0].y -= t; q[1].y -= t; }
    else { q[3].x -= t; q[2].x += t; q[3].y += t; q[2].y += t; }
  }
  return q;
}

/** Draw `img` (w x h) warped onto a quad with a triangle mesh (2D canvas has no projective transform). */
function drawWarped(ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number, quad: V[], n = 16) {
  const H = homography([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], quad);
  const tri = (s: V[], d: V[]) => {
    const [s0, s1, s2] = s, [d0, d1, d2] = d;
    const den = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
    if (!den) return;
    const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / den;
    const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / den;
    const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / den;
    const dd = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / den;
    const e = d0.x - a * s0.x - c * s0.y, f = d0.y - b * s0.x - dd * s0.y;
    ctx.save();
    ctx.beginPath();
    // expand the clip slightly to hide seams
    const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
    const ex = (p: V) => ({ x: p.x + Math.sign(p.x - cx) * 0.6, y: p.y + Math.sign(p.y - cy) * 0.6 });
    const [e0, e1, e2] = [ex(d0), ex(d1), ex(d2)];
    ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, dd, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x0 = (w * i) / n, x1 = (w * (i + 1)) / n, y0 = (h * j) / n, y1 = (h * (j + 1)) / n;
    const s = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    const dq = s.map((p) => applyH(H, p.x, p.y));
    tri([s[0], s[1], s[2]], [dq[0], dq[1], dq[2]]);
    tri([s[0], s[2], s[3]], [dq[0], dq[2], dq[3]]);
  }
}

/* ================================================================== EditAngleBar */

function AngleBar({ value, onChange, onDrag }: { value: number; onChange: (v: number) => void; onDrag: (d: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const [bubble, setBubble] = useState(false);
  const t = useRef<number | undefined>(undefined);
  const p = (value + 45) / 90;
  const at = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    let q = Math.min(1, Math.max(0, (x - r.left) / r.width));
    if (Math.abs(q - 0.5) < 0.005) q = 0.5;
    return -45 + q * 90;
  };
  return (
    <div className="absolute inset-x-0" style={{ bottom: 186, height: 54, padding: "19px 52px", background: "rgba(0,0,0,0.4)" }}>
      <div
        ref={ref}
        className="relative h-full"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); setBubble(true); window.clearTimeout(t.current); onDrag(true); onChange(at(e.clientX)); }}
        onPointerMove={(e) => { if (drag) onChange(at(e.clientX)); }}
        onPointerUp={() => { setDrag(false); onDrag(false); t.current = window.setTimeout(() => setBubble(false), 500); }}
      >
        <div className="absolute inset-x-0" style={{ top: 8, height: 2, background: "rgba(255,255,255,0.3)" }} />
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="absolute" style={{ left: `calc(${(i / 8) * 100}% - 1px)`, top: 2, width: 2, height: 12, borderRadius: 1, background: "rgba(255,255,255,0.3)" }} />
        ))}
        <div className="absolute bg-white" style={{ left: `calc(${p * 100}% - 1px)`, top: -2, width: 2, height: 20 }} />
        <div
          className="pointer-events-none absolute flex items-center justify-center rounded-full bg-white font-bold"
          style={{ width: 42, height: 42, left: `calc(${p * 100}% - 21px)`, bottom: 16 + 10 + 2, fontSize: 11, color: "#222222", boxShadow: "0 0 2px rgba(0,0,0,0.3)", opacity: bubble ? 1 : 0, transition: bubble ? "none" : "opacity 300ms" }}
        >
          {`${Math.round(value * 10) / 10}˚`}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== Crop */

interface Xf { s: number; t: V }
type Page = "crop" | "rotate" | "skew";

export function CropTool() {
  const { doc, commit, openSub, bases, photoCanvas } = useEdit();
  const base = bases.current[doc.base];
  const bw = base.width, bh = base.height;
  const [img] = useState(() => photoCanvas()?.toDataURL("image/jpeg", 0.92) ?? "");
  const boxRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [page, setPage] = useState<Page>("crop");
  const [ratioIdx, setRatioIdx] = useState(1); // "Free" is highlighted by default
  const [lockRatio, setLockRatio] = useState<number | null>(null);
  const [rotCount, setRotCount] = useState(0);
  const [angle, setAngle] = useState(0);
  const [fx, setFx] = useState(1);
  const [fy, setFy] = useState(1);
  const [skewAxis, setSkewAxis] = useState<"h" | "v">("h");
  const [skewH, setSkewH] = useState(0);
  const [skewV, setSkewV] = useState(0);
  const [frame, setFrameRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [xf, setXf] = useState<Xf>({ s: 1, t: { x: 0, y: 0 } });
  const [grid, setGrid] = useState<0 | 3 | 6>(0);
  const [anim, setAnim] = useState(false);
  const recenterT = useRef<number | undefined>(undefined);
  const theta = ((rotCount * 90 + angle) * Math.PI) / 180;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const C = useMemo(() => ({ x: view.w / 2, y: view.h / 2 }), [view]);
  const maxW = Math.max(1, view.w - 30), maxH = Math.max(1, view.h - 30);
  const fitFrame = (ratio: number) => {
    let w = maxW, h = maxW / ratio;
    if (h > maxH) { h = maxH; w = maxH * ratio; }
    return { x: C.x - w / 2, y: C.y - h / 2, w, h };
  };

  /** Keep the (rotated) image covering the frame: min scale + translation clamp in image-local space. */
  const cover = (x: Xf, fr: { x: number; y: number; w: number; h: number }, th: number): Xf => {
    const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
    const ex = (fr.w * c + fr.h * s) / 2, ey = (fr.w * s + fr.h * c) / 2;
    const sMin = Math.max((2 * ex) / bw, (2 * ey) / bh);
    const sc = Math.max(x.s, sMin);
    const rc = { x: fr.x + fr.w / 2, y: fr.y + fr.h / 2 };
    const ql = rot({ x: (rc.x - C.x - x.t.x) / sc, y: (rc.y - C.y - x.t.y) / sc }, -th);
    const lx = bw / 2 - ex / sc, ly = bh / 2 - ey / sc;
    const q = { x: Math.max(-lx, Math.min(lx, ql.x)), y: Math.max(-ly, Math.min(ly, ql.y)) };
    const back = rot(q, th);
    return { s: sc, t: { x: rc.x - C.x - back.x * sc, y: rc.y - C.y - back.y * sc } };
  };

  // initial frame: the image's own aspect ratio
  const fr = frame ?? (view.w ? fitFrame(bw / bh) : null);
  const curX = fr ? cover(frame ? xf : { s: 0, t: { x: 0, y: 0 } }, fr, theta) : xf;

  const reset = (ratio: number, th: number) => {
    const f = fitFrame(ratio);
    setFrameRect(f);
    setXf(cover({ s: 0, t: { x: 0, y: 0 } }, f, th));
  };

  const pickRatio = (i: number) => {
    if (!fr) return;
    setRatioIdx(i);
    const item = CROP_RATIOS[i];
    const odd = rotCount % 2 === 1;
    if (item.ratio === null) { setLockRatio(null); return; }
    let r = item.ratio === 0 ? bw / bh : item.ratio;
    if (odd) r = 1 / r;
    setLockRatio(r);
    const f = fitFrame(r);
    setFrameRect(f);
    setXf(cover(curX, f, theta));
  };

  const rotate = (dir: 1 | 3) => {
    const n = (rotCount + dir) % 4;
    setRotCount(n);
    const th = ((n * 90 + angle) * Math.PI) / 180;
    const r = lockRatio ? 1 / lockRatio : fr ? fr.h / fr.w : bh / bw;
    if (lockRatio) setLockRatio(r);
    const it = CROP_RATIOS[ratioIdx];
    if (it.rev !== undefined) setRatioIdx(it.rev);
    reset(r, th);
  };

  const setStraighten = (v: number) => {
    setAngle(v);
    if (fr) setXf(cover(curX, fr, ((rotCount * 90 + v) * Math.PI) / 180));
  };

  const scheduleRecenter = (f: { x: number; y: number; w: number; h: number }, x: Xf) => {
    window.clearTimeout(recenterT.current);
    recenterT.current = window.setTimeout(() => {
      const r = f.w / f.h;
      const nf = fitFrame(r);
      const k = nf.w / f.w;
      const rc = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
      const t = { x: k * (C.x + x.t.x - rc.x), y: k * (C.y + x.t.y - rc.y) };
      setAnim(true);
      setFrameRect(nf);
      setXf(cover({ s: x.s * k, t }, nf, theta));
      window.setTimeout(() => setAnim(false), 220);
    }, 1000);
  };

  /* ---- gestures: pan / pinch on the image, corners resize the frame */
  const pointers = useRef(new Map<number, V>());
  const gesture = useRef<{ kind: "pan" | "corner"; corner?: number; start: V; x0: Xf; f0: { x: number; y: number; w: number; h: number }; dist?: number; mid?: V } | null>(null);
  const local = (e: React.PointerEvent): V => { const r = boxRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const onDown = (e: React.PointerEvent, corner?: number) => {
    if (!fr) return;
    e.stopPropagation();
    if (!frame) { setFrameRect(fr); setXf(curX); }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    window.clearTimeout(recenterT.current);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (corner !== undefined && page === "crop") {
      gesture.current = { kind: "corner", corner, start: p, x0: curX, f0: fr };
      setGrid(3);
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pan", start: p, x0: curX, f0: fr, dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    } else {
      gesture.current = { kind: "pan", start: p, x0: curX, f0: fr };
    }
  };
  const onCornerDown = (e: React.PointerEvent<HTMLDivElement>) => onDown(e, Number(e.currentTarget.dataset.corner));
  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !fr) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (g.kind === "corner") {
      const f0 = g.f0;
      const dx = p.x - g.start.x, dy = p.y - g.start.y;
      const c = g.corner!;
      // opposite corner stays fixed
      const ax = c === 0 || c === 3 ? f0.x + f0.w : f0.x, ay = c === 0 || c === 1 ? f0.y + f0.h : f0.y;
      let w = Math.abs((c === 0 || c === 3 ? f0.x + dx : f0.x + f0.w + dx) - ax);
      let h = Math.abs((c === 0 || c === 1 ? f0.y + dy : f0.y + f0.h + dy) - ay);
      const minW = maxW / 5, minH = maxH / 5;
      if (lockRatio) { h = w / lockRatio; if (h < minH) { h = minH; w = h * lockRatio; } }
      w = Math.max(minW, w); h = Math.max(minH, h);
      const lim = { l: 15, t: 15, r: view.w - 15, b: view.h - 15 };
      const availW = c === 0 || c === 3 ? ax - lim.l : lim.r - ax, availH = c === 0 || c === 1 ? ay - lim.t : lim.b - ay;
      if (w > availW) { w = availW; if (lockRatio) h = w / lockRatio; }
      if (h > availH) { h = availH; if (lockRatio) w = h * lockRatio; }
      const nf = { x: c === 0 || c === 3 ? ax - w : ax, y: c === 0 || c === 1 ? ay - h : ay, w, h };
      setFrameRect(nf);
      setXf(cover(g.x0, nf, theta));
    } else if (pointers.current.size >= 2 && g.dist) {
      const [a, b] = [...pointers.current.values()];
      const k = Math.hypot(a.x - b.x, a.y - b.y) / g.dist;
      const m = g.mid!;
      const s = Math.min(g.x0.s * k, cover({ s: 0, t: { x: 0, y: 0 } }, fr, theta).s * 32);
      const kk = s / g.x0.s;
      setXf(cover({ s, t: { x: m.x - C.x - kk * (m.x - C.x - g.x0.t.x), y: m.y - C.y - kk * (m.y - C.y - g.x0.t.y) } }, fr, theta));
    } else {
      setXf(cover({ s: g.x0.s, t: { x: g.x0.t.x + p.x - g.start.x, y: g.x0.t.y + p.y - g.start.y } }, fr, theta));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (pointers.current.size === 0) {
      gesture.current = null;
      if (g.kind === "corner" && fr) { setGrid(0); scheduleRecenter(fr, curX); }
    } else {
      const [rest] = [...pointers.current.values()];
      gesture.current = { kind: "pan", start: rest, x0: curX, f0: fr! };
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!fr) return;
    const k = Math.exp(-e.deltaY * 0.002);
    const m = local(e as unknown as React.PointerEvent);
    const s = Math.min(curX.s * k, cover({ s: 0, t: { x: 0, y: 0 } }, fr, theta).s * 32);
    const kk = s / curX.s;
    setXf(cover({ s, t: { x: m.x - C.x - kk * (m.x - C.x - curX.t.x), y: m.y - C.y - kk * (m.y - C.y - curX.t.y) } }, fr, theta));
  };

  /* ---- confirm: render the crop at full resolution as a new base */
  const confirm = () => {
    if (!fr) return;
    const s = curX.s;
    let ow = Math.max(1, Math.round(fr.w / s)), oh = Math.max(1, Math.round(fr.h / s));
    let up = 1;
    if (Math.min(ow, oh) < 100) { up = 100 / Math.min(ow, oh); ow = Math.round(ow * up); oh = Math.round(oh * up); }
    const out = document.createElement("canvas");
    out.width = ow; out.height = oh;
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    const rc = { x: fr.x + fr.w / 2, y: fr.y + fr.h / 2 };
    ctx.translate(ow / 2, oh / 2);
    ctx.scale(up, up);
    ctx.translate((C.x + curX.t.x - rc.x) / s, (C.y + curX.t.y - rc.y) / s);
    ctx.rotate(theta);
    ctx.scale(fx, fy);
    if (skewH || skewV) drawWarped(ctx, base, bw, bh, skewQuad(bw, bh, skewH * fx, skewV * fy));
    else ctx.drawImage(base, -bw / 2, -bh / 2);
    bases.current.push(out);
    commit({ ...doc, base: bases.current.length - 1 });
    openSub(null);
  };

  const H = useMemo(() => homography([{ x: 0, y: 0 }, { x: bw, y: 0 }, { x: bw, y: bh }, { x: 0, y: bh }], skewQuad(bw, bh, skewH * fx, skewV * fy)), [bw, bh, skewH, skewV, fx, fy]);
  const m3d = `matrix3d(${H[0]},${H[3]},0,${H[6]},${H[1]},${H[4]},0,${H[7]},0,0,1,0,${H[2]},${H[5]},0,1)`;
  const imgTransform = `translate(${C.x + curX.t.x}px, ${C.y + curX.t.y}px) rotate(${theta}rad) scale(${curX.s * fx}, ${curX.s * fy}) ${m3d}`;
  const transition = anim ? "transform 200ms, left 200ms, top 200ms, width 200ms, height 200ms" : "none";

  return (
    <>
      <div
        ref={boxRef}
        className="absolute inset-x-0 top-0 overflow-hidden"
        style={{ bottom: 186, background: "#171717", touchAction: "none" }}
        onPointerDown={(e) => onDown(e)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
      >
        {img && fr && (
          <img
            src={img} alt="" draggable={false}
            className="pointer-events-none absolute left-0 top-0 max-w-none"
            style={{ width: bw, height: bh, transformOrigin: "0 0", transform: imgTransform, transition }}
          />
        )}
        {fr && (
          <>
            {/* dim outside: #99171717 */}
            <div className="pointer-events-none absolute" style={{ left: fr.x, top: fr.y, width: fr.w, height: fr.h, boxShadow: "0 0 0 9999px rgba(23,23,23,0.6)", border: "2px solid #ffffff", transition }}>
              {grid > 0 && Array.from({ length: grid - 1 }, (_, i) => (
                <div key={i}>
                  <div className="absolute inset-y-0" style={{ left: `${((i + 1) / grid) * 100}%`, width: 1, background: "rgba(255,255,255,0.4)" }} />
                  <div className="absolute inset-x-0" style={{ top: `${((i + 1) / grid) * 100}%`, height: 1, background: "rgba(255,255,255,0.4)" }} />
                </div>
              ))}
            </div>
            {page === "crop" && [0, 1, 2, 3].map((c) => {
              const x = c === 0 || c === 3 ? fr.x : fr.x + fr.w, y = c === 0 || c === 1 ? fr.y : fr.y + fr.h;
              return (
                <div
                  key={c}
                  className="absolute"
                  style={{ left: x - 18, top: y - 18, width: 36, height: 36, touchAction: "none", transition }}
                  data-corner={c}
                  onPointerDown={onCornerDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                >
                  <Img name="icon_edit_crop_corner" size={36} style={{ transform: `rotate(${c * 90}deg)` }} />
                </div>
              );
            })}
          </>
        )}
      </div>

      {page === "rotate" && <AngleBar value={angle} onChange={setStraighten} onDrag={(dd) => setGrid(dd ? 6 : 0)} />}
      {page === "skew" && (
        <AngleBar
          value={skewAxis === "h" ? skewH : skewV}
          onChange={(v) => (skewAxis === "h" ? setSkewH(v) : setSkewV(v))}
          onDrag={(dd) => setGrid(dd ? 6 : 0)}
        />
      )}

      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: 186 }}>
        <div className="absolute inset-x-0 top-0" style={{ height: 134 }}>
          {page === "crop" && (
            <FeatureList count={CROP_RATIOS.length}>
              {CROP_RATIOS.map((r, i) => <FeatureButton key={r.label} icon={r.icon} label={r.label} selected={ratioIdx === i} onClick={() => pickRatio(i)} />)}
            </FeatureList>
          )}
          {page === "rotate" && (
            <div className="absolute inset-x-0 flex justify-center" style={{ top: 36, gap: 24 }}>
              <FeatureButton icon="icon_edit_crop_rotate_left" label="Left 90°" onClick={() => rotate(3)} />
              <FeatureButton icon="icon_edit_crop_rotate_right" label="Right 90°" onClick={() => rotate(1)} />
              <FeatureButton icon="icon_edit_crop_vertical" label="Mirror" onClick={() => { setFx((v) => -v); }} />
              <FeatureButton icon="icon_edit_crop_horizon" label="Flip" onClick={() => { setFy((v) => -v); }} />
            </div>
          )}
          {page === "skew" && (
            <div className="absolute inset-x-0 flex justify-center" style={{ top: 36, gap: 52 }}>
              <FeatureButton icon="icon_edit_crop_bend_horizon" label="Horizontal" selected={skewAxis === "h"} onClick={() => setSkewAxis("h")} />
              <FeatureButton icon="icon_edit_crop_bend_vertical" label="Vertical" selected={skewAxis === "v"} onClick={() => setSkewAxis("v")} />
            </div>
          )}
        </div>
        <TitleBar onClose={() => openSub(null)} onConfirm={confirm}>
          {(["crop", "rotate", "skew"] as Page[]).map((pg) => (
            <TitleTab key={pg} label={pg === "crop" ? "Crop" : pg === "rotate" ? "Rotate" : "Perspective"} selected={page === pg} onClick={() => setPage(pg)} style={{ padding: "10px 20px" }} />
          ))}
        </TitleBar>
      </div>
    </>
  );
}
