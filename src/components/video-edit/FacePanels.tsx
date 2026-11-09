"use client";

// Face-driven tabs of the video editor, tracked on every rendered frame by the web face engine (engine.ts):
//  - Face FX: AR stickers.
//  - Face shape: the photo editor's face-shape controls, applied to every frame.
//  - Liquify: drag on a face to push it; the warp is anchored to the face so it follows it.
import { useEffect, useState } from "react";
import { Icon, Spinner, Tabs, cx } from "@/components/ui";
import { LOCAL_STICKER_CATEGORIES, fetchStickerCatalog, type Sticker, type StickerCategory } from "@/data/camera/stickers";
import { FACE_SHAPES, RESHAPE_CATS, type ReshapeItem } from "@/components/edit/tools/portrait/faceData";
import { ChipRow, CtrlIcon, EditBar, EditSeekBar, HintPill, ToolChip } from "@/components/edit/ui";
import type { FaceData, WarpOp } from "@/lib/face";
import { BRUSHES, STR, type Reshape } from "./model";
import { PlayRow } from "./ui";

/* ------------------------------------------------------------------ Face FX */

export function ArFilterPanel({ selectedId, loadingId, onSelect }: { selectedId: number | null; loadingId: number | null; onSelect: (s: Sticker | null) => void }) {
  const [remote, setRemote] = useState<StickerCategory[]>([]);
  const [sel, setSel] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchStickerCatalog().then((c) => { if (alive) setRemote(c); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const cats = [...LOCAL_STICKER_CATEGORIES, ...remote];
  const cat = cats[Math.min(sel, cats.length - 1)];
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-center gap-2 pl-3">
        <button
          type="button" aria-label="No filter" aria-pressed={selectedId == null} onClick={() => onSelect(null)}
          className={cx("oe-press flex h-9 w-9 flex-none items-center justify-center rounded-full", selectedId == null ? "bg-fg text-bg" : "bg-raised text-fg-2")}
        >
          <Icon name="block" size={18} />
        </button>
        <ChipRow className="pl-1 pr-3">
          {cats.map((c, i) => <ToolChip key={c.id} label={c.text ?? `Set ${i + 1}`} selected={c === cat} onClick={() => setSel(i)} />)}
        </ChipRow>
      </div>
      <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4">
        {cat.stickers.map((s) => {
          const on = s.id === selectedId;
          return (
            <button key={s.id} data-sticker={s.id} type="button" onClick={() => onSelect(on ? null : s)} aria-pressed={on} className="oe-press flex w-16 flex-none flex-col items-center gap-1">
              <span className={cx("relative flex h-16 w-16 items-center justify-center rounded-md bg-raised", on && "ring-2 ring-accent ring-offset-2 ring-offset-panel")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.thumbnail} alt="" className="h-[78%] w-[78%] object-contain" draggable={false} />
                {loadingId === s.id && <span className="absolute inset-0 flex items-center justify-center rounded-md bg-bg/50"><Spinner size={18} className="text-accent" /></span>}
              </span>
              {s.name && <span className={cx("w-full truncate text-center text-[11px] font-medium", on ? "text-fg" : "text-fg-2")}>{s.name}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shared */

const PAGE_H = 236;

/** Face status over the preview: still looking, or none found. */
function FaceStatus({ faceReady, noFace }: { faceReady: boolean; noFace: boolean }) {
  if (faceReady && !noFace) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-10 flex justify-center" style={{ top: 64 }}>
      {!faceReady
        ? <span className="flex items-center gap-2 rounded-full bg-glass px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur-md"><Spinner size={14} className="text-accent" />{STR.faceCheck}</span>
        : <HintPill text={STR.noFace} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Face shape */

type Item = { kind: "shape"; key: string } | { kind: "re"; it: ReshapeItem };
const STYLES = -1;

export function BeautyPanel({ value, faces, faceReady, playing, pos, start, end, onToggle, onSeek, onChange, onOriginal, onClose, onConfirm }: {
  value: Reshape; faces: FaceData[]; faceReady: boolean; playing: boolean; pos: number; start: number; end: number;
  onToggle: () => void; onSeek: (ms: number) => void; onChange: (r: Reshape) => void; onOriginal: (down: boolean) => void;
  onClose: () => void; onConfirm: () => void;
}) {
  const [cat, setCat] = useState(0);
  const [item, setItem] = useState<Item | null>(null);
  const [partial, setPartial] = useState<"" | "_left" | "_right">("");
  const [flash, setFlash] = useState(0);
  const reKey = item?.kind === "re" ? item.it.key + (item.it.p ? partial : "") : "";
  const v = item?.kind === "shape" ? (value.shape?.key === item.key ? value.shape.v : 0) : item ? value.re[reKey] ?? 0 : 0;
  const duplex = item?.kind === "re" && !!item.it.d;
  const set = (x: number) => {
    if (!item) return;
    onChange(item.kind === "shape" ? { ...value, shape: { key: item.key, v: x } } : { ...value, re: { ...value.re, [reKey]: x } });
  };
  const mod = (k: string) => [k, `${k}_left`, `${k}_right`].some((x) => Math.abs(value.re[x] ?? 0) > 0.001);
  const catMod = (i: number) => (i === STYLES ? !!value.shape && value.shape.v > 0.001 : RESHAPE_CATS[i].items.some((it) => mod(it.key)));
  const noFace = faceReady && faces.length === 0;
  return (
    <div className="pointer-events-none absolute inset-0 z-[40]">
      <FaceStatus faceReady={faceReady} noFace={noFace} />
      {item?.kind === "re" && item.it.p && (
        <div className="pointer-events-auto absolute inset-x-0 flex justify-center" style={{ bottom: PAGE_H + 60 }}>
          <Tabs look="segment" tone="overlay" className="w-[210px]" items={[{ id: "_left", label: "Left" }, { id: "both", label: "Both" }, { id: "_right", label: "Right" }]} value={partial || "both"} onChange={(k) => setPartial(k === "both" ? "" : k as "_left" | "_right")} />
        </div>
      )}
      <div className="pointer-events-auto absolute inset-x-0 flex items-center gap-2 px-3" style={{ bottom: PAGE_H + 6, height: 48 }}>
        <div className="flex min-w-0 flex-1">
          {item && <EditSeekBar key={`${reKey}|${item.kind}`} value={v} min={duplex ? -1 : 0} max={1} def={0} duplex={duplex} flashKey={flash} onChange={set} />}
        </div>
        <CtrlIcon name="original" enabled onHold={onOriginal} />
      </div>
      <div className="pointer-events-auto">
        <EditBar title="Face shape" onClose={onClose} onConfirm={onConfirm} />
      </div>
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col justify-center gap-3 rounded-t-xl bg-panel shadow-[0_-8px_24px_rgba(0,0,0,0.35)]" style={{ height: PAGE_H }}>
        <PlayRow playing={playing} pos={pos} start={start} end={end} onToggle={onToggle} onSeek={onSeek} />
        <ChipRow>
          <ToolChip label="Styles" selected={cat === STYLES} modified={catMod(STYLES)} onClick={() => setCat(STYLES)} />
          {RESHAPE_CATS.map((c, i) => <ToolChip key={c.label} label={c.label} selected={cat === i} modified={catMod(i)} onClick={() => setCat(i)} />)}
        </ChipRow>
        <div className="mx-4 h-px bg-line" />
        <ChipRow>
          {cat === STYLES
            ? FACE_SHAPES.map(([k, l]) => <ToolChip key={k} label={l} selected={item?.kind === "shape" && item.key === k} modified={value.shape?.key === k && value.shape.v > 0.001} onClick={() => { setItem({ kind: "shape", key: k }); setFlash((n) => n + 1); }} />)
            : RESHAPE_CATS[cat].items.map((it) => <ToolChip key={it.key} label={it.label} selected={item?.kind === "re" && item.it === it} modified={mod(it.key)} onClick={() => { setItem({ kind: "re", it }); if (!it.p) setPartial(""); setFlash((n) => n + 1); }} />)}
        </ChipRow>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Liquify */

type V2 = [number, number];
/** warp.ts subjectFrame (pixel space): eye-centre origin, X along the eyes, Y toward the chin, iod = interocular distance. */
function subjectFrame(f: FaceData, w: number, h: number) {
  const p = f.points;
  const c = (a: number, b: number): [number, number, number] => [((p[a * 3] + p[b * 3]) / 2) * w, ((p[a * 3 + 1] + p[b * 3 + 1]) / 2) * h, ((p[a * 3 + 2] + p[b * 3 + 2]) / 2) * w];
  const R = c(33, 133), L = c(263, 362);
  const O: V2 = [(R[0] + L[0]) / 2, (R[1] + L[1]) / 2];
  const iod = Math.hypot(L[0] - R[0], L[1] - R[1], L[2] - R[2]) || 1;
  const l2 = Math.hypot(L[0] - R[0], L[1] - R[1]) || 1;
  const X: V2 = [(L[0] - R[0]) / l2, (L[1] - R[1]) / l2];
  let Y: V2 = [-X[1], X[0]];
  const chin: V2 = [p[152 * 3] * w - O[0], p[152 * 3 + 1] * h - O[1]];
  if (Y[0] * chin[0] + Y[1] * chin[1] < 0) Y = [-Y[0], -Y[1]];
  return { X, Y, iod, nose: [p[3] * w, p[4] * h] as V2 };
}

/** Converts a drag (preview px, preview size w x h) into a face-anchored "move" op so it follows the face. */
export function dragToOp(face: FaceData, w: number, h: number, from: V2, to: V2, brush: number): WarpOp {
  const sf = subjectFrame(face, w, h);
  const rel: V2 = [from[0] - sf.nose[0], from[1] - sf.nose[1]];
  const dd: V2 = [to[0] - from[0], to[1] - from[1]];
  const loc = (v: V2): V2 => [(v[0] * sf.X[0] + v[1] * sf.X[1]) / sf.iod, (v[0] * sf.Y[0] + v[1] * sf.Y[1]) / sf.iod];
  return { type: "move", anchor: 1, offset: loc(rel), rx: 0.35 + BRUSHES[brush].strength * 0.9, amount: loc(dd) };
}

export function RetouchPanel({ faces, faceReady, thumbs, selFace, onSelFace, brush, onBrush, canUndo, canRedo, onUndo, onRedo, onOriginal, playing, pos, start, end, onToggle, onSeek, onClose, onConfirm, onRetry, tip }: {
  faces: FaceData[]; faceReady: boolean; thumbs: string[]; selFace: number; onSelFace: (i: number) => void;
  brush: number; onBrush: (i: number) => void; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  onOriginal: (down: boolean) => void; playing: boolean; pos: number; start: number; end: number;
  onToggle: () => void; onSeek: (ms: number) => void; onClose: () => void; onConfirm: () => void; onRetry: () => void; tip: string | null;
}) {
  const noFace = faceReady && faces.length === 0;
  return (
    <div className="pointer-events-none absolute inset-0 z-[40]">
      {tip && (
        <div className="absolute inset-x-0 flex items-center justify-center px-10" style={{ top: 52, bottom: PAGE_H + 60 }}>
          <HintPill text={tip} />
        </div>
      )}
      <FaceStatus faceReady={faceReady} noFace={noFace} />
      <div className="pointer-events-auto absolute inset-x-0 flex items-center gap-1.5 px-3" style={{ bottom: PAGE_H + 6, height: 48 }}>
        <CtrlIcon name="undo" enabled={canUndo} onClick={onUndo} />
        <CtrlIcon name="redo" enabled={canRedo} onClick={onRedo} />
        <span className="flex-1" />
        <CtrlIcon name="original" enabled onHold={onOriginal} />
      </div>
      <div className="pointer-events-auto">
        <EditBar title="Liquify" onClose={onClose} onConfirm={onConfirm} />
      </div>
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col justify-center gap-4 rounded-t-xl bg-panel shadow-[0_-8px_24px_rgba(0,0,0,0.35)]" style={{ height: PAGE_H }}>
        <PlayRow playing={playing} pos={pos} start={start} end={end} onToggle={onToggle} onSeek={onSeek} />
        <div className="flex min-h-[44px] items-center justify-center gap-2 px-4">
          {!faceReady && <span className="flex items-center gap-2 text-[13px] text-fg-3"><Spinner size={16} className="text-accent" />{STR.faceCheck}</span>}
          {noFace && (
            <button type="button" onClick={onRetry} className="oe-press flex h-9 items-center gap-1.5 rounded-full bg-raised px-4 text-[13px] font-semibold">
              <Icon name="reset" size={15} />{STR.faceRetry}
            </button>
          )}
          {faceReady && faces.length > 0 && (
            <>
              <span className="mr-1 text-[12px] font-medium text-fg-3">Face</span>
              {faces.map((_, i) => (
                <button key={i} type="button" aria-label={`Face ${i + 1}`} aria-pressed={i === selFace} onClick={() => onSelFace(i)} className="oe-press rounded-full p-0.5">
                  <span className={cx("block h-10 w-10 overflow-hidden rounded-full bg-raised", i === selFace && "ring-2 ring-accent ring-offset-2 ring-offset-panel")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {thumbs[i] && <img src={thumbs[i]} alt="" className="h-full w-full object-cover" draggable={false} />}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
        <div className="flex items-center justify-center gap-4">
          <span className="text-[12px] font-medium text-fg-3">{STR.size}</span>
          {BRUSHES.map((b, i) => (
            <button key={i} type="button" onClick={() => onBrush(i)} aria-pressed={i === brush} className="flex h-8 w-8 items-center justify-center" aria-label={`Brush size ${i + 1}`}>
              <span className={cx("rounded-full transition-colors", i === brush ? "bg-accent" : "bg-fg-3")} style={{ width: b.size, height: b.size }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
