"use client";

// AI Hair (Portrait). Everything except new hairstyles runs on the device, on the MediaPipe hair mask:
//   Colour      whole-hair recolour presets (src/lib/ai recolorHair)
//   Highlights  colour streaks that follow the hair (tools/hairFx streakAlpha + recolour)
//   Ombre       colour fading in toward the ends (tools/hairFx ombreAlpha + recolour)
//   Volume      the face engine's hair volume warp (stored per face in the document, like the Volume page)
//   Smooth      frizz smoothing for the fringe and the lengths (tools/hairFx smoothHair)
//   Styles      new hairstyles from an online provider through /api/ai/hair (tools/hairService); when the server has
//               none configured the tab says so and nothing is sent anywhere.
// Colour, highlights, ombre and smoothing are baked into a new base on Apply; volume stays a live face edit.
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, Spinner, cx, toast } from "@/components/ui";
import { HAIR_COLORS, photoFaces, recolorHair, refineMask } from "@/lib/ai";
import { useEdit } from "../ctx";
import type { FaceEdit } from "../model";
import { ChipRow, ControlRow, EditSeekBar, SliderRow, ThumbItem, ToolChip } from "../ui";
import { copyCanvas, EditLoading, MENU, newCanvas, OPTION_H, OptionRow, Panel, PhotoOverlay, S, TextTooltip, useHold, usePhotoArea, useTimedTooltip } from "./common";
import { useBase } from "./aiCommon";
import { detectFaces, faceStageSource } from "./portrait/faceEngine";
import { ombreAlpha, smoothHair, streakAlpha, type FaceBoxN } from "./hairFx";
import { generateHairstyle, hairService, NO_SERVICE, type HairServiceInfo } from "./hairService";

type Page = "colour" | "highlights" | "ombre" | "volume" | "smooth" | "styles";
const PAGES: { id: Page; label: string; online?: boolean }[] = [
  { id: "colour", label: "Colour" },
  { id: "highlights", label: "Highlights" },
  { id: "ombre", label: "Ombre" },
  { id: "volume", label: "Volume" },
  { id: "smooth", label: "Smooth" },
  { id: "styles", label: "Styles", online: true },
];

interface Tint { color: string | null; v: number }
interface HairState { colour: Tint; highlights: Tint; ombre: Tint; fringe: number; lengths: number }
const NONE: HairState = { colour: { color: null, v: 0.7 }, highlights: { color: null, v: 0.75 }, ombre: { color: null, v: 0.8 }, fringe: 0, lengths: 0 };
const bitmapActive = (s: HairState) => !!s.colour.color || !!s.highlights.color || !!s.ombre.color || s.fringe > 0.001 || s.lengths > 0.001;

/** Hair colour swatch: the colour with a soft sheen. */
const hairBg = (color: string) => `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.5), rgba(255,255,255,0) 42%), linear-gradient(160deg, ${color}, ${color} 55%, rgba(0,0,0,0.55))`;
/** Ombre swatch: the photo's dark roots fading into the colour. */
const ombreBg = (color: string) => `linear-gradient(180deg, #2a211c 0%, #2a211c 30%, ${color} 92%)`;
/** Highlights swatch: dark hair with streaks of the colour. */
const streakBg = (color: string) => `repeating-linear-gradient(100deg, #2a211c 0 5px, ${color} 5px 8px, #2a211c 8px 13px)`;

const shrink = (c: HTMLCanvasElement, max: number) => {
  const k = Math.min(1, max / Math.max(c.width, c.height));
  return k < 1 ? copyCanvas(c, Math.round(c.width * k), Math.round(c.height * k)) : c;
};

/** Every on-device bitmap step, in order: smoothing, then colour, highlights and ombre. */
function renderHair(src: HTMLCanvasElement, alpha: Float32Array, faces: FaceBoxN[], s: HairState): HTMLCanvasElement {
  const W = src.width, H = src.height;
  let out = src;
  if (s.fringe > 0.001 || s.lengths > 0.001) out = smoothHair(out, alpha, faces, s.fringe, s.lengths);
  if (s.colour.color) out = recolorHair(out, alpha, s.colour.color, s.colour.v, 0);
  if (s.highlights.color) out = recolorHair(out, streakAlpha(alpha, W, H), s.highlights.color, s.highlights.v, 0);
  if (s.ombre.color) out = recolorHair(out, ombreAlpha(alpha, W, H), s.ombre.color, s.ombre.v, 0);
  return out;
}

/** Full-size hair alpha: refined at ≤ 1600 px, then scaled up. */
function fullAlpha(base: HTMLCanvasElement, hair: HTMLCanvasElement): Float32Array {
  const work = shrink(base, 1600);
  const a = refineMask(work, hair, null);
  const ac = newCanvas(work.width, work.height);
  const id = new ImageData(work.width, work.height);
  for (let i = 0; i < a.length; i++) { id.data[i * 4] = 255; id.data[i * 4 + 1] = 255; id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = a[i] * 255; }
  ac.getContext("2d")!.putImageData(id, 0, 0);
  const big = copyCanvas(ac, base.width, base.height).getContext("2d")!.getImageData(0, 0, base.width, base.height).data;
  const full = new Float32Array(base.width * base.height);
  for (let i = 0; i < full.length; i++) full[i] = big[i * 4 + 3] / 255;
  return full;
}

export function AiHairPage() {
  const { doc, bases, commit, openSub } = useEdit();
  const area = usePhotoArea();
  const getBase = useBase();
  const [held, hold] = useHold();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState<Page>("colour");
  const [st, setSt] = useState<HairState>(NONE);
  const [state, setState] = useState<"loading" | "ready" | "noface" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [mask, setMask] = useState<{ hair: HTMLCanvasElement; pv: HTMLCanvasElement; alpha: Float32Array; faces: FaceBoxN[]; count: number } | null>(null);
  const [tip, setTip] = useTimedTooltip(null, 2500);
  const [busy, setBusy] = useState<string | null>(null);
  const [service, setService] = useState<HairServiceInfo | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const genCtl = useRef<AbortController | null>(null);
  // hair volume: one value applied to every face (kept as the face engine's per-face `hv`)
  const fe0: FaceEdit = useMemo(() => doc.beauty.face ?? { f: {} }, [doc.beauty.face]);
  const [volume, setVolume] = useState(() => Object.values(fe0.f)[0]?.hv ?? 0);

  /* ---------------------------------------------------------------- hair mask + faces */
  useEffect(() => {
    const base = getBase();
    if (!base) return;
    let alive = true;
    Promise.all([photoFaces(base), detectFaces(base).catch(() => ({ faces: [] }))]).then(([r, det]) => {
      if (!alive) return;
      if (!r.faces.length) { setState("noface"); setTip(S.noFace); return; }
      if (!r.hair) { setState("error"); return; }
      const pv = shrink(base, 900);
      setMask({ hair: r.hair, pv, alpha: refineMask(pv, r.hair, null), faces: r.faces, count: det.faces.length });
      setState("ready");
    }, () => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [getBase, attempt, setTip]);

  // the online service is asked once, in the background (nothing is sent until the person taps Generate)
  useEffect(() => {
    const ac = new AbortController();
    void hairService(ac.signal).then((s) => { if (!ac.signal.aborted) setService(s); });
    return () => ac.abort();
  }, []);
  useEffect(() => () => genCtl.current?.abort(), []);

  const feWith = (v: number): FaceEdit => {
    const n = Math.max(mask?.count ?? 0, Object.keys(fe0.f).length);
    const f = { ...fe0.f };
    for (let i = 0; i < n; i++) f[i] = { ...f[i], hv: v };
    return { ...fe0, f };
  };

  /* ---------------------------------------------------------------- preview */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !mask) return;
    const raf = requestAnimationFrame(() => {
      // the document's face edits (with this page's volume) on top, like the main preview
      const out = faceStageSource(getBase(), renderHair(mask.pv, mask.alpha, mask.faces, st), feWith(volume));
      c.width = mask.pv.width; c.height = mask.pv.height;
      c.getContext("2d")!.drawImage(out, 0, 0, c.width, c.height);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mask, st, volume]);

  /* ---------------------------------------------------------------- apply */
  const confirm = async () => {
    const base = getBase();
    if (!base) { openSub(null); return; }
    const volChanged = Math.abs(volume - (Object.values(fe0.f)[0]?.hv ?? 0)) > 0.001;
    if (!mask || !bitmapActive(st)) {
      if (volChanged) commit({ ...doc, beauty: { ...doc.beauty, face: feWith(volume) } });
      openSub(null);
      return;
    }
    setBusy("Rendering full size…");
    await new Promise((r) => setTimeout(r, 50));
    try {
      const out = renderHair(copyCanvas(base), fullAlpha(base, mask.hair), mask.faces, st);
      bases.current.push(out);
      commit({ ...doc, base: bases.current.length - 1, beauty: volChanged ? { ...doc.beauty, face: feWith(volume) } : doc.beauty });
      openSub(null);
    } catch {
      toast("Couldn't apply the hair edits. Please try again.", { icon: "alert", tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  /* ---------------------------------------------------------------- online styles */
  const generate = async () => {
    const base = getBase();
    if (!base || !style || !service?.available) return;
    genCtl.current?.abort();
    const ac = new AbortController();
    genCtl.current = ac;
    setBusy("Creating the hairstyle…");
    try {
      const blob = await generateHairstyle(base, style, ac.signal);
      const bmp = await createImageBitmap(blob);
      const out = newCanvas(base.width, base.height);
      out.getContext("2d")!.drawImage(bmp, 0, 0, out.width, out.height);
      bmp.close();
      bases.current.push(out);
      commit({ ...doc, base: bases.current.length - 1 });
      toast("New hairstyle applied", { icon: "check-circle" });
      openSub(null);
    } catch {
      if (!ac.signal.aborted) toast("The hairstyle service didn't answer. Please try again.", { icon: "alert", tone: "danger" });
    } finally {
      if (genCtl.current === ac) genCtl.current = null;
      setBusy(null);
    }
  };

  const ready = state === "ready";
  const needReady = () => { if (state === "noface") setTip(S.noFace); return ready; };
  const tint = page === "colour" || page === "highlights" || page === "ombre" ? st[page] : null;
  const sliderShown = !!tint?.color;
  const setTint = (p: "colour" | "highlights" | "ombre", t: Tint) => setSt((s) => ({ ...s, [p]: t }));
  const swatchBg = page === "ombre" ? ombreBg : page === "highlights" ? streakBg : hairBg;
  const edited: Record<Page, boolean> = {
    colour: !!st.colour.color, highlights: !!st.highlights.color, ombre: !!st.ombre.color,
    volume: volume > 0.001, smooth: st.fringe > 0.001 || st.lengths > 0.001, styles: false,
  };

  return (
    <>
      {ready && <PhotoOverlay area={area} canvasRef={canvasRef} hidden={held} />}
      <TextTooltip text={tip} />
      {(state === "loading" || busy) && <EditLoading text={busy ?? "Finding hair…"} />}
      <ControlRow bottom={MENU + (sliderShown ? OPTION_H : 0)} onOriginal={hold} originalEnabled={ready && (bitmapActive(st) || volume > 0.001)} />
      {sliderShown && tint && (
        <OptionRow bottom={MENU} label="Strength">
          <EditSeekBar value={tint.v} min={0} max={1} def={NONE[page as "colour"].v} onChange={(v) => setTint(page as "colour", { ...tint, v })} />
        </OptionRow>
      )}
      <Panel title="AI Hair" onClose={() => openSub(null)} onConfirm={() => void confirm()}>
        <div className="flex h-full flex-col pt-2.5">
          <ChipRow className="h-10 flex-none">
            {PAGES.map((p) => (
              <ToolChip key={p.id} label={p.online ? `${p.label} · online` : p.label} selected={page === p.id} modified={edited[p.id]} onClick={() => setPage(p.id)} />
            ))}
          </ChipRow>
          <div className="relative min-h-0 flex-1">
            {page !== "styles" && state === "error" && (
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <p className="text-[13px] text-fg-2">Couldn&apos;t find the hair.</p>
                <Button size="sm" variant="secondary" icon="reset" onClick={() => { setState("loading"); setAttempt((n) => n + 1); }}>{S.retry}</Button>
              </div>
            )}
            {(page === "colour" || page === "highlights" || page === "ombre") && state !== "error" && (
              <div className="no-scrollbar flex h-full items-center gap-2.5 overflow-x-auto px-4">
                <ThumbItem size={52} label="None" none selected={!st[page].color} onClick={() => setTint(page, { ...st[page], color: null })} />
                {HAIR_COLORS.map((h) => (
                  <ThumbItem
                    key={h.id} size={52} label={h.label} bg={swatchBg(h.color)} selected={st[page].color === h.color}
                    onClick={() => { if (needReady()) setTint(page, { ...st[page], color: h.color }); }}
                  />
                ))}
              </div>
            )}
            {page === "volume" && state !== "error" && (
              <div className="flex h-full flex-col justify-center gap-1" onPointerDown={() => needReady()}>
                <SliderRow label="Volume" value={Math.round(volume * 100)}>
                  <EditSeekBar value={volume} min={0} max={1} def={0} level={false} disabled={!ready} onChange={setVolume} />
                </SliderRow>
                <p className="px-6 text-center text-[12px] text-fg-3">Lifts the hair around the top of the head.</p>
              </div>
            )}
            {page === "smooth" && state !== "error" && (
              <div className="flex h-full flex-col justify-center gap-0.5" onPointerDown={() => needReady()}>
                <SliderRow label="Fringe" value={Math.round(st.fringe * 100)}>
                  <EditSeekBar value={st.fringe} min={0} max={1} def={0} level={false} disabled={!ready} onChange={(v) => setSt((s) => ({ ...s, fringe: v }))} />
                </SliderRow>
                <SliderRow label="Lengths" value={Math.round(st.lengths * 100)}>
                  <EditSeekBar value={st.lengths} min={0} max={1} def={0} level={false} disabled={!ready} onChange={(v) => setSt((s) => ({ ...s, lengths: v }))} />
                </SliderRow>
              </div>
            )}
            {page === "styles" && <StylesPane service={service} style={style} onStyle={setStyle} onGenerate={() => void generate()} busy={!!busy} />}
          </div>
          <Availability online={page === "styles"} available={!!service?.available} />
        </div>
      </Panel>
    </>
  );
}

/** One line under the controls that says where the selected tool runs. */
function Availability({ online, available }: { online: boolean; available: boolean }) {
  return (
    <p className={cx("flex h-7 flex-none items-center justify-center gap-1.5 pb-1 text-[11px] font-medium", online && !available ? "text-fg-3" : "text-fg-2")}>
      <Icon name={online ? "globe" : "privacy"} size={13} className={online && !available ? "text-fg-3" : "text-ok"} />
      {online
        ? available ? "Online: your photo is sent to the hairstyle service" : "Online only · not set up on this server"
        : "Runs on your device · your photo stays here"}
    </p>
  );
}

function StylesPane({ service, style, onStyle, onGenerate, busy }: {
  service: HairServiceInfo | null; style: string | null; onStyle: (id: string) => void; onGenerate: () => void; busy: boolean;
}) {
  if (!service) return <div className="flex h-full items-center justify-center"><Spinner size={18} /></div>;
  const s = service ?? NO_SERVICE;
  if (!s.available) {
    return (
      <div className="flex h-full items-center gap-3 px-4">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-raised text-fg-3"><Icon name="offline" size={20} /></span>
        <p className="text-[12.5px] leading-snug text-fg-2">
          New hairstyles need an online AI service, and this server doesn&apos;t have one set up. Colour, highlights, ombre,
          volume and smoothing all work on your device.
        </p>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center gap-2.5">
      <div className="no-scrollbar flex min-w-0 flex-1 gap-2.5 overflow-x-auto pl-4">
        {s.styles.map((x) => (
          <ThumbItem key={x.id} size={52} label={x.name} src={x.thumb} bg={x.thumb ? undefined : "linear-gradient(135deg, var(--oe-raised), var(--oe-muted))"} selected={style === x.id} onClick={() => onStyle(x.id)} />
        ))}
      </div>
      <Button size="sm" icon="sparkles" className="mr-4 h-10 flex-none rounded-full px-4" disabled={!style || busy} onClick={onGenerate}>Generate</Button>
    </div>
  );
}
