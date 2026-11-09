"use client";

// Shared face-tool plumbing: detection on open (EditLoading), FaceGuideLayout / FaceGuideView (multi-face brackets,
// tap to select, blink), the multi-face banner, the no-face tooltip, and the per-face FaceEdit draft that is previewed
// live through the editor pipeline and committed on confirm.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceData } from "@/lib/face";
import { useEdit } from "../../ctx";
import type { FaceEdit, FaceVals } from "../../model";
import { EditLoading, MENU, S, TextTooltip, usePhotoArea, type PhotoArea } from "../common";
import { detectFaces, ensureFaceAssets } from "./faceEngine";

/* ------------------------------------------------------------------ geometry (FaceGuideView) */

// FaceGuideView uses the ulsee 68-point shape: brackets through 15/13/11 and 1/3/5 around 28, touch rect from 1/15.
// dlib -> MediaPipe: 1 -> 93, 3 -> 58, 5 -> 136, 11 -> 365, 13 -> 288, 15 -> 323, 28 -> 6.
const G = { c: 6, p1: 93, p3: 58, p5: 136, p11: 365, p13: 288, p15: 323 };

type XY = [number, number];
const toView = (f: FaceData, i: number, a: PhotoArea): XY => [a.x + f.points[i * 3] * a.w, a.y + f.points[i * 3 + 1] * a.h];

/** Touch rect: square centred on point 28, half size = |p15 - p1| (FaceGuideView.m62546m). */
function touchRect(f: FaceData, a: PhotoArea) {
  const c = toView(f, G.c, a), p1 = toView(f, G.p1, a), p15 = toView(f, G.p15, a);
  const r = Math.hypot(p15[0] - p1[0], p15[1] - p1[1]);
  return { x0: c[0] - r, y0: c[1] - r, x1: c[0] + r, y1: c[1] + r, w: 2 * r };
}

/** Two cubic brackets pushed out from the centre by 0.1 face width (1.15x for the middle point). */
function bracketPath(f: FaceData, a: PhotoArea) {
  const c = toView(f, G.c, a), p1 = toView(f, G.p1, a), p15 = toView(f, G.p15, a);
  const off = Math.hypot(p15[0] - p1[0], p15[1] - p1[1]) * 0.1;
  const ext = (i: number, k: number): XY => {
    const p = toView(f, i, a);
    const dx = p[0] - c[0], dy = p[1] - c[1], l = Math.hypot(dx, dy) || 1;
    return [p[0] + (dx / l) * off * k, p[1] + (dy / l) * off * k];
  };
  const seg = (ids: [number, number, number]) => {
    const [q0, q1, q2] = [ext(ids[0], 1), ext(ids[1], 1.15), ext(ids[2], 1)];
    return `M${q0[0]},${q0[1]} C${q0[0]},${q0[1]} ${q1[0]},${q1[1]} ${q2[0]},${q2[1]}`;
  };
  return `${seg([G.p15, G.p13, G.p11])} ${seg([G.p1, G.p3, G.p5])}`;
}

/* ------------------------------------------------------------------ selection memory (setUseCachedIndex) */

let cachedSel: { base: HTMLCanvasElement | null; i: number } = { base: null, i: -1 };
const largest = (faces: FaceData[], a: PhotoArea) => {
  let best = 0, bw = 0;
  faces.forEach((f, i) => { const w = touchRect(f, a).w; if (w > bw) { bw = w; best = i; } });
  return best;
};

/* ------------------------------------------------------------------ hooks */

export function useBase(): HTMLCanvasElement | null {
  const { bases, doc } = useEdit();
  return bases.current[doc.base] ?? null;
}

/**
 * FaceEdit draft for a two-depth page: values change live (setLive with the new beauty.face), confirm commits one
 * undo entry, close drops the draft.
 */
export function useFaceDraft() {
  const { doc, setLive, commit, openSub } = useEdit();
  // `doc` is `live ?? committed`: once apply() has pushed a live preview it already holds the draft, so ✓ must
  // compare against (and commit onto) the doc as it was when the tool opened, i.e. the saved history entry.
  const [saved] = useState(doc);
  const [fe, setFe] = useState<FaceEdit>(() => doc.beauty.face ?? { f: {} });
  const seq = useRef(0);
  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; });
  const apply = useCallback((next: FaceEdit) => {
    setFe(next);
    const n = ++seq.current;
    void ensureFaceAssets(next).then(() => {
      if (n !== seq.current) return;
      const d = docRef.current;
      setLive({ ...d, beauty: { ...d.beauty, face: next } });
    });
  }, [setLive]);
  const setVals = useCallback((i: number, fn: (v: FaceVals) => FaceVals) => {
    setFe((cur) => {
      const next = { ...cur, f: { ...cur.f, [i]: fn(cur.f[i] ?? {}) } };
      queueMicrotask(() => apply(next));
      return next;
    });
  }, [apply]);
  const close = () => { seq.current++; setLive(null); openSub(null); };
  const confirm = (override?: FaceEdit) => {
    seq.current++;
    const fe2 = override ?? fe;
    const prev = JSON.stringify(saved.beauty.face ?? { f: {} });
    if (JSON.stringify(fe2) !== prev) commit({ ...saved, beauty: { ...saved.beauty, face: fe2 } });
    else setLive(null);
    openSub(null);
  };
  return { fe, apply, setVals, close, confirm };
}

/**
 * FaceGuideLayout: brackets around every face when there are >= 2 (selected #00ECD4, others white 70%), tap a face to
 * select it, blink on open, multi-face banner (max 3 times per content type), no-face tooltip, EditLoading while
 * detecting. Returns the selected face index (-100 = no face, -1 = still detecting).
 */
export function useFaceGuide(opts: { banner?: "BEAUTY" | "MAKEUP"; hidden?: boolean } = {}) {
  const { setTool, zoomTo } = useEdit();
  const area = usePhotoArea();
  const base = useBase();
  const [faces, setFaces] = useState<FaceData[] | null>(null);
  const [sel, setSelState] = useState(-1);
  const [tip, setTip] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; fading: boolean } | null>(null);
  const [blink, setBlink] = useState(true);
  const tipT = useRef<number | undefined>(undefined);

  const showTip = useCallback((t: string) => {
    setTip(null);
    window.clearTimeout(tipT.current);
    window.setTimeout(() => setTip(t), 0);
    tipT.current = window.setTimeout(() => setTip(null), 2500);
  }, []);
  useEffect(() => () => window.clearTimeout(tipT.current), []);

  // detection on open, then the initial selection: cached index for the same photo, else the largest face
  // (FaceGuideView.m62548q); multi-face banner; no-face tooltip
  const areaRef = useRef(area);
  useEffect(() => { areaRef.current = area; });
  useEffect(() => {
    if (!base) return;
    let alive = true;
    void detectFaces(base).then(({ faces: fs }) => {
      if (!alive) return;
      setFaces(fs);
      if (!fs.length) { setSelState(-100); showTip(S.noFace); return; }
      const i = cachedSel.base === base && cachedSel.i >= 0 && cachedSel.i < fs.length ? cachedSel.i : largest(fs, areaRef.current);
      setSelState(i);
      cachedSel = { base, i };
      if (fs.length > 1 && opts.banner) {
        const key = opts.banner === "MAKEUP" ? "keyMakeupSelectFaceTooptipCount" : "keyBeautySelectFaceTooptipCount";
        let n = 0;
        try { n = Number(localStorage.getItem(key) ?? 0); } catch { /* ignore */ }
        if (n < 3) {
          try { localStorage.setItem(key, String(n + 1)); } catch { /* ignore */ }
          setBanner({ text: opts.banner === "MAKEUP" ? "Choose a face to apply makeup." : "Choose a face to apply beauty effects.", fading: false });
        }
      }
    });
    return () => { alive = false; };
  }, [base, opts.banner, showTip]);
  // banner: 5 s, then fades out over 200 ms
  useEffect(() => {
    if (!banner || banner.fading) return;
    const t1 = window.setTimeout(() => setBanner((b) => (b ? { ...b, fading: true } : b)), 5000);
    return () => window.clearTimeout(t1);
  }, [banner]);
  useEffect(() => {
    if (!banner?.fading) return;
    const t = window.setTimeout(() => setBanner(null), 200);
    return () => window.clearTimeout(t);
  }, [banner]);
  useEffect(() => { const t = window.setTimeout(() => setBlink(false), 800 * 3); return () => window.clearTimeout(t); }, []);

  // preview taps: select a non-selected face whose touch rect contains the tap
  const st = useRef({ faces, area, sel, zoomTo });
  useEffect(() => { st.current = { faces, area, sel, zoomTo }; });
  useEffect(() => {
    let downAt: XY | null = null;
    const view = (fx: number, fy: number): XY => {
      const a = st.current.area;
      const [u, v] = a.toPhoto(fx, fy);
      return [a.x + u * a.w, a.y + v * a.h];
    };
    setTool({
      down: (fx, fy) => { downAt = view(fx, fy); setTip(null); setBanner(null); setBlink(false); },
      up: (fx, fy) => {
        const p = view(fx, fy);
        if (!downAt || Math.hypot(p[0] - downAt[0], p[1] - downAt[1]) > 12) return;
        const { faces: fs, area: a, sel: cur, zoomTo: zt } = st.current;
        fs?.forEach((f, i) => {
          if (i === cur) return;
          const r = touchRect(f, a);
          if (p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1) {
            setSelState(i);
            cachedSel = { base: cachedSel.base, i };
            // baa.C3828a.mo3310c(i, true): zoom the preview onto the newly selected face (rect-to-rect, CENTER, 300 ms)
            zt?.({ x: r.x0, y: r.y0, w: r.w, h: r.y1 - r.y0 }, 300);
          }
        });
      },
    });
    return () => setTool(null);
  }, [setTool]);

  const loading = faces === null;
  const node = (
    <>
      {!opts.hidden && faces && faces.length >= 2 && (
        <svg className="pointer-events-none absolute inset-x-0 top-0 z-[6]" width="100%" style={{ bottom: MENU, height: `calc(100% - ${MENU}px)`, animation: blink ? "faceGuideBlink 800ms ease-in-out 3 alternate" : undefined }}>
          <style>{"@keyframes faceGuideBlink { from { opacity: 0.3 } to { opacity: 1 } }"}</style>
          {faces.map((f, i) => (i === sel ? null : <path key={i} d={bracketPath(f, area)} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />))}
          {sel >= 0 && faces[sel] && <path d={bracketPath(faces[sel], area)} fill="none" stroke="#00ECD4" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      )}
      <TextTooltip text={tip} />
      {loading && <EditLoading />}
    </>
  );
  const bannerNode = banner ? (
    <div className="absolute inset-x-0 z-20 flex items-center justify-center truncate text-white" style={{ bottom: MENU, height: 45, fontSize: 14, background: "#0bd4d2", opacity: banner.fading ? 0 : 1, transition: "opacity 200ms" }}>
      {banner.text}
    </div>
  ) : null;
  return { faces, sel, node, bannerNode, bannerH: banner ? 45 : 0, noFace: () => showTip(S.noFace), showTip, loading };
}

/** -100 trackId: nothing can be edited. */
export const usable = (sel: number) => sel >= 0;
