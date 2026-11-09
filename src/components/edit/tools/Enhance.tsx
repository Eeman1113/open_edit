"use client";

// Enhance: on-device Real-ESRGAN upscaling (src/lib/ai, BSD-3). Background modes run on the whole photo; portrait
// modes run on each face crop (faces from src/lib/face). Results are cached per face + background combination and
// shown in a before / after split view.
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Spinner, Tabs, cx } from "@/components/ui";
import { enhanceCanvas, photoFaces, type BgMode, type FaceBox, type FaceMode } from "@/lib/ai";
import { useEdit } from "../ctx";
import { ControlRow, TOP_H } from "../ui";
import { AiLoading, MENU, Panel, RetryView, S, useHold, usePhotoArea } from "./common";
import { aiStepText, useAiJob, useAsyncBake, useBase } from "./aiCommon";

const BG_ITEMS: { key: BgMode; label: string; about: string }[] = [
  { key: "none", label: "Off", about: "Leave it" }, { key: "natural", label: "Natural", about: "Balanced" },
  { key: "detail", label: "Detail", about: "Crisper" }, { key: "soft", label: "Soft", about: "Smoother" },
];
const FACE_ITEMS: { key: FaceMode; label: string; about: string }[] = [
  { key: "sharp", label: "Sharp", about: "Most detail" }, { key: "natural", label: "Natural", about: "Balanced" },
  { key: "clear", label: "Clear", about: "Bright skin" }, { key: "soft", label: "Soft", about: "Gentle" },
];

/** Before / after split: drag the handle to compare. */
function DiffView({ before, after, area }: { before: string; after: string; area: { x: number; y: number; w: number; h: number } }) {
  const [x, setX] = useState(0.5);
  const drag = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    if (!drag.current || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setX(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };
  const px = x * area.w;
  return (
    <div
      ref={ref} className="absolute touch-none" style={{ left: area.x, top: area.y, width: area.w, height: area.h }}
      onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; move(e); }}
      onPointerMove={move} onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={before} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={{ clipPath: `inset(0 ${area.w - px}px 0 0)` }} />
      <span className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(0,0,0,0.5)]" style={{ left: px }} />
      <span className="absolute top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-bg shadow-lg" style={{ left: px }}>
        <Icon name="skew-h" size={20} stroke={2.2} />
      </span>
      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-glass px-2.5 py-1 text-[12px] font-semibold text-white backdrop-blur-md">Before</span>
      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-accent px-2.5 py-1 text-[12px] font-semibold text-on-accent">After</span>
    </div>
  );
}

export function EnhanceTool() {
  const { openSub, toast } = useEdit();
  const area = usePhotoArea();
  const getBase = useBase();
  const asyncBake = useAsyncBake();
  const [held, hold] = useHold();
  const [faces, setFaces] = useState<FaceBox[] | null>(null);
  const [tab, setTab] = useState<"portrait" | "background">("background");
  const [bg, setBg] = useState<BgMode>("natural");
  const [face, setFace] = useState<FaceMode>("sharp");
  const [cache, setCache] = useState<Record<string, { c: HTMLCanvasElement; url: string }>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const job = useAiJob((e) => { console.warn("[ai] enhance failed", e); });
  const inflight = useRef<string | null>(null);
  const hasFace = !!faces?.length;
  const key = hasFace ? `${face}_${bg}` : `none_${bg}`;
  const result = cache[key] ?? null;

  const beforeUrl = useMemo(() => {
    const b = getBase();
    if (!b) return "";
    const k = Math.min(1, 1280 / Math.max(b.width, b.height));
    const c = document.createElement("canvas");
    c.width = Math.round(b.width * k); c.height = Math.round(b.height * k);
    c.getContext("2d")!.drawImage(b, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.92);
  }, [getBase]);

  /** Requests one face + background combination (cached). */
  const request = (f: FaceBox[], g: BgMode, m: FaceMode | null) => {
    const b = getBase();
    const k = f.length ? `${m}_${g}` : `none_${g}`;
    if (!b || cache[k] || inflight.current) return;
    setFailed(null);
    setLoadingKey(k);
    inflight.current = k;
    void job.run((signal, onProgress) => enhanceCanvas(b, g, f, f.length ? m : null, { signal, onProgress })).then((r) => {
      inflight.current = null;
      setLoadingKey(null);
      if (!r) { setFailed(k); return; }
      const c = r.canvas;
      const s = Math.min(1, 1280 / Math.max(c.width, c.height));
      const p = document.createElement("canvas");
      p.width = Math.round(c.width * s); p.height = Math.round(c.height * s);
      p.getContext("2d")!.drawImage(c, 0, 0, p.width, p.height);
      console.info(`[ai] enhance ${k}: ${Math.round(r.ms)} ms (${r.ep}) -> ${c.width}x${c.height}`);
      setCache((o) => ({ ...o, [k]: { c, url: p.toDataURL("image/jpeg", 0.92) } }));
    });
  };

  // find faces first, then run the default combination
  useEffect(() => {
    const b = getBase();
    if (!b) return;
    let alive = true;
    photoFaces(b).then((r) => r.faces, () => [] as FaceBox[]).then((f) => {
      if (!alive) return;
      setFaces(f);
      if (f.length) { setTab("portrait"); setBg("none"); setFace("sharp"); request(f, "none", "sharp"); } else {
        toast("No face found, so only the background will be enhanced.");
        request(f, "natural", null);
      }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (g: BgMode, m: FaceMode) => {
    if (job.busy) { toast("Still working on the last one…"); return; }
    setBg(g); setFace(m);
    if (faces) request(faces, g, m);
  };

  const items = tab === "portrait" && hasFace
    ? FACE_ITEMS.map((i) => ({ id: `${i.key}_${bg}`, label: i.label, about: i.about, none: false, sel: face === i.key, on: () => pick(bg, i.key) }))
    : (hasFace ? BG_ITEMS : BG_ITEMS.slice(1)).map((i) => ({ id: hasFace ? `${face}_${i.key}` : `none_${i.key}`, label: i.label, about: i.about, none: i.key === "none", sel: bg === i.key, on: () => pick(i.key, face) }));

  const confirm = () => {
    if (!result) { openSub(null); return; }
    void asyncBake(async () => result.c);
  };

  return (
    <>
      <div className="absolute inset-x-0 z-[5] overflow-hidden bg-bg" style={{ top: TOP_H, bottom: MENU, visibility: held ? "hidden" : "visible" }}>
        <div className="absolute" style={{ left: 0, top: -TOP_H, right: 0, bottom: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {result ? <DiffView before={beforeUrl} after={result.url} area={area} /> : beforeUrl && <img src={beforeUrl} alt="" draggable={false} className="absolute" style={{ left: area.x, top: area.y, width: area.w, height: area.h }} />}
        </div>
      </div>
      <ControlRow onOriginal={result ? hold : undefined} />
      {failed && !job.busy && <RetryView text={S.networkTry} onRetry={() => faces && request(faces, bg, face)} />}
      <Panel title="Enhance" onClose={() => openSub(null)} onConfirm={confirm}>
        <div className="flex h-full flex-col justify-center gap-4">
          {hasFace && (
            <div className="flex justify-center">
              <Tabs look="segment" className="w-[240px]" items={[{ id: "portrait", label: "Faces" }, { id: "background", label: "Background" }]} value={tab} onChange={setTab} />
            </div>
          )}
          <div className="flex justify-center gap-2.5 px-4">
            {items.map((it) => (
              <button
                key={it.id + it.label} type="button" onClick={it.on} aria-pressed={it.sel}
                className={cx("oe-press relative flex h-[76px] w-[76px] flex-none flex-col items-center justify-center gap-0.5 rounded-md transition-colors", it.sel ? "bg-accent-soft ring-2 ring-accent" : "bg-raised")}
              >
                {it.none ? <Icon name="block" size={20} className="text-fg-2" /> : <span className={cx("text-[14px] font-semibold", it.sel ? "text-accent" : "text-fg")}>{it.label}</span>}
                <span className="text-[11px] text-fg-3">{it.none ? "Off" : it.about}</span>
                {loadingKey === it.id && <span className="absolute right-1.5 top-1.5"><Spinner size={14} className="text-accent" /></span>}
                {failed === it.id && <span className="absolute right-1.5 top-1.5 text-danger"><Icon name="alert" size={14} /></span>}
              </button>
            ))}
          </div>
        </div>
      </Panel>
      {job.pct !== null && <AiLoading text={aiStepText(job.pct)} onCancel={() => { job.cancel(); setLoadingKey(null); openSub(null); }} />}
    </>
  );
}
