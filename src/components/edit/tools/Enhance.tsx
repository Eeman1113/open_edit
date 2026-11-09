"use client";

// EPEnhanceFragment (fragment_edit_photo_tools_enhance.xml). The server enhancer (h5-api.snow.me trust/enhance)
// is replaced by on-device Real-ESRGAN realesr-general-x4v3 (src/lib/ai, BSD-3): background models v1/v2/v3 on the
// whole photo, portrait models Sharp/Natural/Clear/Soft on each face crop (faces from src/lib/face).
// Results are cached per face_bg key like the original; the EPEnhanceDiffView compares before/after.
import { useEffect, useMemo, useRef, useState } from "react";
import { d } from "@/components/ui/legacy-drawable";
import { enhanceCanvas, photoFaces, type BgMode, type FaceBox, type FaceMode } from "@/lib/ai";
import { useEdit } from "../ctx";
import { CtrlIcon, Img, PRIMARY, WHITE60 } from "../ui";
import { AiLoading, MENU, Panel, RetryView, S, useHold, usePhotoArea } from "./common";
import { aiStepText, useAiJob, useAsyncBake, useBase } from "./aiCommon";

const BG_ITEMS: { key: BgMode; label: string }[] = [{ key: "none", label: "" }, { key: "natural", label: "v1" }, { key: "detail", label: "v2" }, { key: "soft", label: "v3" }];
const FACE_ITEMS: { key: FaceMode; label: string }[] = [{ key: "sharp", label: "Sharp" }, { key: "natural", label: "Natural" }, { key: "clear", label: "Clear" }, { key: "soft", label: "Soft" }];

/** EPEnhanceDiffView: after image with the before image left of a draggable 1dp #80ffffff bar + 38dp control icon at 82% height. */
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
  const cy = area.h * 0.82;
  return (
    <div
      ref={ref} className="absolute" style={{ left: area.x, top: area.y, width: area.w, height: area.h, touchAction: "none" }}
      onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; move(e); }}
      onPointerMove={move} onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}
    >
      <img src={after} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
      <img src={before} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={{ clipPath: `inset(0 ${area.w - px}px 0 0)` }} />
      <span className="absolute inset-y-0" style={{ left: px - 0.5, width: 1, background: "rgba(255,255,255,0.5)" }} />
      <img src={d("icon_edit_enhance_control")} alt="" draggable={false} className="absolute" style={{ left: px - 19, top: cy, width: 38, height: 38 }} />
      <span className="pointer-events-none absolute text-white" style={{ right: area.w - px + 19 + 4, top: cy, lineHeight: "38px", fontSize: 14, textShadow: "0 0 4px rgba(0,0,0,0.25)", clipPath: "inset(0 0 0 0)" }}>Before</span>
      <span className="pointer-events-none absolute text-white" style={{ left: px + 19 + 4, top: cy, lineHeight: "38px", fontSize: 14, textShadow: "0 0 4px rgba(0,0,0,0.25)" }}>After</span>
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

  /** Requests one face_bg combination (cached like EPEnhanceViewModel.handleCache). */
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

  // face detection first (EPEnhanceViewModel: getCroppedFaces), then the default request
  useEffect(() => {
    const b = getBase();
    if (!b) return;
    let alive = true;
    photoFaces(b).then((r) => r.faces, () => [] as FaceBox[]).then((f) => {
      if (!alive) return;
      setFaces(f);
      if (f.length) { setTab("portrait"); setBg("none"); setFace("sharp"); request(f, "none", "sharp"); } else {
        toast("No face was deteced.\nOnly the background will be improved.");
        request(f, "natural", null);
      }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (g: BgMode, m: FaceMode) => {
    if (job.busy) { toast("Processing,\nplease wait."); return; }
    setBg(g); setFace(m);
    if (faces) request(faces, g, m);
  };

  const items = tab === "portrait" && hasFace
    ? FACE_ITEMS.map((i) => ({ id: `${i.key}_${bg}`, label: i.label, none: false, sel: face === i.key, on: () => pick(bg, i.key) }))
    : (hasFace ? BG_ITEMS : BG_ITEMS.slice(1)).map((i) => ({ id: hasFace ? `${face}_${i.key}` : `none_${i.key}`, label: i.label, none: i.key === "none", sel: bg === i.key, on: () => pick(i.key, face) }));

  const confirm = () => {
    if (!result) { openSub(null); return; }
    void asyncBake(async () => result.c);
  };

  return (
    <>
      <div className="absolute inset-x-0 top-0 z-[5] overflow-hidden" style={{ bottom: MENU, background: "#171717", visibility: held ? "hidden" : "visible" }}>
        {result ? <DiffView before={beforeUrl} after={result.url} area={area} /> : beforeUrl && <img src={beforeUrl} alt="" draggable={false} className="absolute" style={{ left: area.x, top: area.y, width: area.w, height: area.h }} />}
      </div>
      <div className="absolute inset-x-0 z-20 flex items-center" style={{ bottom: MENU, height: 54 }} onPointerDown={(e) => e.stopPropagation()}>
        <span className="flex-1" />
        {result && <CtrlIcon name="original" enabled onHold={hold} style={{ marginRight: 10 }} />}
      </div>
      {failed && !job.busy && <RetryView text={S.networkTry} onRetry={() => faces && request(faces, bg, face)} />}
      <Panel title="Enhance" guide onClose={() => openSub(null)} onConfirm={confirm}>
        {hasFace && (
          <div className="absolute inset-x-0 top-0 flex items-center justify-center" style={{ height: 52 }}>
            <button type="button" onClick={() => setTab("portrait")} style={{ position: "absolute", right: "calc(50% + 20px)", fontSize: 15, color: tab === "portrait" ? "#ffffff" : WHITE60 }}>Portrait</button>
            <button type="button" onClick={() => setTab("background")} style={{ position: "absolute", left: "calc(50% + 20px)", fontSize: 15, color: tab === "background" ? "#ffffff" : WHITE60 }}>Background</button>
          </div>
        )}
        <div className="absolute inset-x-0 flex justify-center" style={{ top: 52, padding: "0 16px", gap: 10 }}>
          {items.map((it) => (
            <button key={it.id + it.label} type="button" onClick={it.on} className="relative flex flex-none items-center justify-center" style={{ width: 78, height: 78, borderRadius: 8, background: "#242424" }}>
              {it.none ? <Img name="icon_thumbnail_none" size={30} /> : <span className="truncate text-white" style={{ fontSize: 13, margin: "0 5px" }}>{it.label}</span>}
              {it.sel && <span className="absolute inset-0" style={{ borderRadius: 6, border: `2px solid ${PRIMARY}` }} />}
              {loadingKey === it.id && <img src={d("icon_common_loading")} alt="" className="spin-save absolute" style={{ right: 4, bottom: 4, width: 20, height: 20 }} />}
              {failed === it.id && <Img name="icon_common_retry" size={20} style={{ position: "absolute", right: 4, bottom: 4 }} />}
            </button>
          ))}
        </div>
      </Panel>
      {job.pct !== null && <AiLoading text={aiStepText(job.pct)} onCancel={() => { job.cancel(); setLoadingKey(null); openSub(null); }} />}
    </>
  );
}
