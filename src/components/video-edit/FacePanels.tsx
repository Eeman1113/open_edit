"use client";

// Face-driven tabs of the video editor:
//  - AR filter (VideoEditTabType.Frame → VideoEditStickerListFragment, fragment_video_edit_sticker_list.xml)
//  - Beauty   (VideoEditTabType.Reshape → EVReshapeFragment, fragment_edit_video_portrait_reshape.xml)
//  - Reshape  (VideoEditTabType.Retouch → VideoEditRetouchFragment, fragment_video_edit_retouch.xml)
// Faces come from the web face engine (MediaPipe) running on every rendered frame (engine.ts).
import { useEffect, useRef, useState } from "react";
import { d } from "@/components/ui/legacy-drawable";
import { LOCAL_STICKER_CATEGORIES, fetchStickerCatalog, type Sticker, type StickerCategory } from "@/data/camera/stickers";
import { FACE_SHAPES, RESHAPE_CATS, type ReshapeItem } from "@/components/edit/tools/portrait/faceData";
import { EditSeekBar, FeatureButton } from "@/components/edit/ui";
import type { FaceData, WarpOp } from "@/lib/face";
import { BRUSHES, PRIMARY, STR, fmtDuration, type Reshape } from "./model";
import { NetworkError, Spinner, Tint } from "./ui";

const SERVER: StickerCategory = { id: -1, icon: "sticker_navigation_error", grayIcon: "sticker_navigation_error_off", stickers: [], server: true };
const SHADOW = "2px 2px 1px rgba(0,0,0,0.4)";

/* ------------------------------------------------------------------ AR filter */

export function ArFilterPanel({ selectedId, loadingId, onSelect }: { selectedId: number | null; loadingId: number | null; onSelect: (s: Sticker | null) => void }) {
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [server, setServer] = useState<StickerCategory[]>([]);
  const [sel, setSel] = useState(0);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchStickerCatalog().then((c) => { if (alive) { setServer(c); setPhase("ready"); } }).catch(() => alive && setPhase("error"));
    return () => { alive = false; };
  }, [attempt]);
  const cats = [...LOCAL_STICKER_CATEGORIES, ...(server.length ? server : [SERVER])];
  const cat = cats[Math.min(sel, cats.length - 1)];
  const pagePhase = cat.server ? phase : "ready";
  return (
    <div className="absolute inset-x-0 bg-black" style={{ bottom: 14, height: 50 + 69 }}>
      {/* sticker_category_recycler_view (50dp): edit_sticker_image_category_item 40dp / 35dp icon */}
      <div className="no-scrollbar flex items-center overflow-x-auto" style={{ height: 50 }}>
        <button type="button" onClick={() => onSelect(null)} className="flex h-full shrink-0 items-center justify-center" style={{ width: 51 }} aria-label="none">
          <img src={d("icon_sticker_none")} alt="" style={{ width: 35, height: 35 }} draggable={false} />
        </button>
        {cats.map((c, i) => (
          <button key={c.id} type="button" data-cat={c.id} onClick={() => setSel(i)} className="flex h-full shrink-0 items-center justify-center" style={{ width: 40, marginLeft: 6 }}>
            <img src={d((c === cat ? c.icon : c.grayIcon ?? c.icon) ?? "sticker_default_category")} alt="" style={{ width: 35, height: 35, opacity: c === cat || c.grayIcon !== c.icon ? 1 : 0.4 }} draggable={false} />
          </button>
        ))}
      </div>
      {/* sticker_recycler_view (69dp cells) */}
      <div className="relative" style={{ height: 69 }}>
        {pagePhase === "ready" && (
          <div className="no-scrollbar flex h-full items-center overflow-x-auto">
            {cat.stickers.map((s) => {
              const on = s.id === selectedId;
              return (
                <button key={s.id} data-sticker={s.id} type="button" onClick={() => onSelect(on ? null : s)} className="relative flex-none" style={{ width: 69, height: 69 }}>
                  <img src={s.thumbnail.includes("/") ? s.thumbnail : d(s.thumbnail)} alt="" className="absolute" style={{ left: 7.5, top: 7.5, width: 54, height: 54, borderRadius: 3, objectFit: "contain" }} draggable={false} />
                  {on && <img src={d("sticker_select")} alt="" className="absolute" style={{ left: 3, top: 3, width: 63, height: 63 }} draggable={false} />}
                  {loadingId === s.id && <span className="absolute" style={{ right: 8, bottom: 8 }}><Spinner size={16} /></span>}
                </button>
              );
            })}
          </div>
        )}
        {pagePhase === "loading" && <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>}
        {pagePhase === "error" && <NetworkError style={{ top: "50%", transform: "translateY(-50%)" }} onRetry={() => { setPhase("loading"); setAttempt((a) => a + 1); }} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shared: play control row */

/** container_play_control / area_bottom_feature top row: video_retouch_player_icon 22dp, seek bar (thumb 7), time 11dp. */
function PlayRow({ playing, pos, start, end, onToggle, onSeek, style }: {
  playing: boolean; pos: number; start: number; end: number; onToggle: () => void; onSeek: (ms: number) => void; style?: React.CSSProperties;
}) {
  return (
    <div className="absolute inset-x-0 flex items-center" style={{ height: 47, ...style }}>
      <button type="button" onClick={onToggle} style={{ marginLeft: 15, width: 22, height: 22 }} aria-label="play">
        <img src={d(playing ? "edit_video_player_pause" : "edit_video_player_play")} alt="" style={{ width: 22, height: 22 }} draggable={false} />
      </button>
      <EditSeekBar style={{ marginLeft: 16 }} value={pos} min={start} max={end} def={start} level={false} onChange={onSeek} />
      <span className="text-white" style={{ margin: "0 20px", fontSize: 11 }}>{fmtDuration(pos - start)}</span>
    </div>
  );
}

function FaceGuide({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="pointer-events-none absolute inset-x-0 flex justify-center text-center text-white" style={{ top: "40%", padding: "0 20px", fontSize: 17, textShadow: SHADOW }}>{text}</div>;
}

/* ------------------------------------------------------------------ Beauty (EVReshapeFragment) */

type Item = { kind: "shape"; key: string } | { kind: "re"; it: ReshapeItem };

export function BeautyPanel({ value, faces, faceReady, playing, pos, start, end, onToggle, onSeek, onChange, onOriginal, onClose, onConfirm }: {
  value: Reshape; faces: FaceData[]; faceReady: boolean; playing: boolean; pos: number; start: number; end: number;
  onToggle: () => void; onSeek: (ms: number) => void; onChange: (r: Reshape) => void; onOriginal: (down: boolean) => void;
  onClose: () => void; onConfirm: () => void;
}) {
  const [cat, setCat] = useState(0);
  const [item, setItem] = useState<Item | null>(null);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [partial, setPartial] = useState<"" | "_left" | "_right">("");
  const [flash, setFlash] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const reKey = item?.kind === "re" ? item.it.key + (item.it.p ? partial : "") : "";
  const v = item?.kind === "shape" ? (value.shape?.key === item.key ? value.shape.v : 0) : item ? value.re[reKey] ?? 0 : 0;
  const duplex = item?.kind === "re" && !!item.it.d;
  const set = (x: number) => {
    if (!item) return;
    onChange(item.kind === "shape" ? { ...value, shape: { key: item.key, v: x } } : { ...value, re: { ...value.re, [reKey]: x } });
  };
  const mod = (k: string) => [k, `${k}_left`, `${k}_right`].some((x) => Math.abs(value.re[x] ?? 0) > 0.001);
  const goCat = (i: number) => {
    setCat(i);
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cat="${i}"]`);
    if (el && listRef.current) listRef.current.scrollTo({ left: el.offsetLeft - 4, behavior: "smooth" });
  };
  const noFace = faceReady && faces.length === 0;
  return (
    <div className="absolute inset-0 z-[40]" style={{ pointerEvents: "none" }}>
      <FaceGuide text={!faceReady ? null : noFace ? STR.noFace : null} />
      {!faceReady && <div className="absolute inset-x-0 flex justify-center" style={{ bottom: 153 + 47 + 54 + 20 }}><Spinner /></div>}
      {/* toggle_partial (PartialOptionToggleView): Left / Both / Right */}
      {item?.kind === "re" && item.it.p && (
        <div className="absolute inset-x-0 flex justify-center" style={{ bottom: 153 + 47 + 54 + 6, pointerEvents: "auto" }}>
          <div className="flex" style={{ height: 28, borderRadius: 14, background: "rgba(0,0,0,0.4)" }}>
            {([["_left", "Left"], ["", "Both"], ["_right", "Right"]] as const).map(([k, l]) => (
              <button key={l} type="button" onClick={() => setPartial(k)} className="flex items-center" style={{ padding: "0 12px", borderRadius: 14, fontSize: 12, color: partial === k ? "#222222" : "#ffffff", background: partial === k ? "#ffffff" : "transparent" }}>{l}</button>
            ))}
          </div>
        </div>
      )}
      {/* container_control (54dp): seek_bar (left 68 / right 24) + btn_original 34dp */}
      <div className="absolute inset-x-0 flex items-center" style={{ bottom: 153 + 47, height: 54, pointerEvents: "auto" }}>
        <div className="flex flex-1" style={{ marginLeft: 68, marginRight: 24 }}>
          {item && <EditSeekBar key={`${reKey}|${item.kind}`} value={v} min={duplex ? -1 : 0} max={1} def={0} duplex={duplex} flashKey={flash} onChange={set} />}
        </div>
        <button type="button" aria-label="original" style={{ width: 34, height: 34, marginRight: 10 }}
          onPointerDown={() => onOriginal(true)} onPointerUp={() => onOriginal(false)} onPointerLeave={() => onOriginal(false)}>
          <img src={d("icon_edit_common_original")} alt="" style={{ width: 34, height: 34 }} draggable={false} />
        </button>
      </div>
      <PlayRow playing={playing} pos={pos} start={start} end={end} onToggle={onToggle} onSeek={onSeek} style={{ bottom: 153, pointerEvents: "auto" }} />
      {/* container_feature (153dp, black): list_menu (marginTop 10, paddingH 4) + 52dp bottom bar (close / EditTabLayout / confirm) */}
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: 153, pointerEvents: "auto" }}>
        <div
          ref={listRef} className="no-scrollbar absolute inset-x-0 flex overflow-x-auto" style={{ top: 10, padding: "0 4px", gap: 6 }}
          onScroll={(e) => {
            const x = e.currentTarget.scrollLeft + 40;
            let c = 0;
            e.currentTarget.querySelectorAll<HTMLElement>("[data-cat]").forEach((el) => { if (el.offsetLeft <= x) c = Number(el.dataset.cat); });
            if (c !== cat) setCat(c);
          }}
        >
          <FeatureButton icon="beauty_icon_face" label="Face" selected={shapesOpen} modified={!!value.shape && value.shape.v > 0.001} onClick={() => setShapesOpen((o) => !o)} />
          {shapesOpen && FACE_SHAPES.map(([k, l]) => (
            <FeatureButton key={k} icon={`faceshape_icon_${k}`} label={l} tint={false} selected={item?.kind === "shape" && item.key === k} onClick={() => { setItem({ kind: "shape", key: k }); setFlash((n) => n + 1); }} />
          ))}
          {RESHAPE_CATS.map((c, ci) => c.items.map((it, ii) => (
            <div key={`${ci}${it.key}`} data-cat={ii === 0 ? ci : undefined} className="flex-none">
              <FeatureButton icon={`beauty_icon_${it.key}`} label={it.label} selected={item?.kind === "re" && item.it === it} modified={mod(it.key)} onClick={() => { setItem({ kind: "re", it }); if (!it.p) setPartial(""); setFlash((n) => n + 1); }} />
            </div>
          )))}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-center" style={{ height: 52 }}>
          <button type="button" onClick={onClose} style={{ width: 52, height: 52 }} aria-label="close"><img src={d("icon_edit_title_close")} alt="" style={{ width: 52, height: 52 }} draggable={false} /></button>
          <div className="no-scrollbar flex flex-1 items-center justify-between overflow-x-auto">
            {RESHAPE_CATS.map((c, i) => (
              <button key={c.label} type="button" onClick={() => goCat(i)} className="shrink-0 whitespace-nowrap" style={{ padding: "0 8px", fontSize: 13, fontWeight: cat === i ? 700 : 400, color: cat === i ? "#ffffff" : "rgba(255,255,255,0.4)" }}>{c.label}</button>
            ))}
          </div>
          <button type="button" onClick={onConfirm} style={{ width: 52, height: 52 }} aria-label="confirm"><Tint name="icon_edit_title_confirm" size={52} color={PRIMARY} /></button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Reshape (VideoEditRetouchFragment) */

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
  const H = 192; // video_edit_retouch_feature_height
  const noFace = faceReady && faces.length === 0;
  return (
    <div className="pointer-events-none absolute inset-0 z-[40]">
      {/* guide_tooltip_layout: tooltip_drag_trigger 74dp + gallery_manual_tooltip 17dp */}
      {tip && (
        <div className="absolute inset-x-0 top-0 flex flex-col items-center justify-center" style={{ bottom: H }}>
          <img src={d("tooltip_drag_trigger")} alt="" style={{ width: 74, height: 74 }} draggable={false} />
          <span className="text-center text-white" style={{ fontSize: 17, textShadow: "0 0 4px rgba(0,0,0,0.3)" }}>{tip}</span>
        </div>
      )}
      {noFace && <div className="absolute inset-x-0 top-0 flex items-center justify-center text-center text-white" style={{ bottom: H, padding: "0 20px", fontSize: 17, textShadow: SHADOW }}>{STR.noFace}</div>}
      {/* undo / redo (34dp, start 10 / +12) and compare (beauty_original) above the area */}
      <div className="absolute flex" style={{ left: 10, bottom: H + 10, pointerEvents: "auto" }}>
        <button type="button" disabled={!canUndo} onClick={onUndo} style={{ width: 34, height: 34 }}><img src={d("icon_edit_common_undo")} alt="" style={{ width: 34, height: 34, opacity: canUndo ? 1 : 0.4 }} draggable={false} /></button>
        <button type="button" disabled={!canRedo} onClick={onRedo} style={{ width: 34, height: 34, marginLeft: 12 }}><img src={d("icon_edit_common_redo")} alt="" style={{ width: 34, height: 34, opacity: canRedo ? 1 : 0.4 }} draggable={false} /></button>
      </div>
      <button type="button" className="absolute" style={{ right: 10, bottom: H + 10, width: 34, height: 34, pointerEvents: "auto" }}
        onPointerDown={() => onOriginal(true)} onPointerUp={() => onOriginal(false)} onPointerLeave={() => onOriginal(false)} aria-label="compare">
        <img src={d("beauty_original")} alt="" style={{ width: 34, height: 34 }} draggable={false} />
      </button>
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: H, pointerEvents: "auto" }}>
        <PlayRow playing={playing} pos={pos} start={start} end={end} onToggle={onToggle} onSeek={onSeek} style={{ top: 0 }} />
        {/* face_recycler_view / loading / retry (below guide_line_top 47dp) */}
        <div className="absolute inset-x-0 flex justify-center" style={{ top: 47, height: 48 }}>
          {!faceReady && (
            <div className="flex items-center" style={{ marginTop: 11, height: 16 }}>
              <Spinner size={16} />
              <span className="text-white" style={{ marginLeft: 8, fontSize: 12 }}>{STR.faceCheck}</span>
            </div>
          )}
          {noFace && (
            <button type="button" onClick={onRetry} className="flex items-center" style={{ marginTop: 2, height: 32, borderRadius: 16, background: "rgba(255,255,255,0.15)", padding: "0 15px 0 13px" }}>
              <img src={d("sticker_network_error")} alt="" style={{ width: 15, height: 15 }} draggable={false} />
              <span className="text-white" style={{ marginLeft: 5, fontSize: 12 }}>{STR.faceRetry}</span>
            </button>
          )}
          {faceReady && faces.length > 0 && (
            <div className="flex" style={{ padding: "0 10px" }}>
              {faces.map((_, i) => (
                <button key={i} type="button" onClick={() => onSelFace(i)} className="relative" style={{ padding: "0 6px", height: 36 }}>
                  <span className="block overflow-hidden rounded-full bg-[#333]" style={{ width: 36, height: 36 }}>
                    {thumbs[i] && <img src={thumbs[i]} alt="" style={{ width: 36, height: 36, objectFit: "cover" }} draggable={false} />}
                  </span>
                  {i === selFace && <span className="absolute rounded-full" style={{ left: 6, top: 0, width: 36, height: 36, border: `1.5px solid ${PRIMARY}`, boxShadow: "inset 0 0 0 1.5px #000" }} />}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* area_brush_size: marginTop 56 below the guide, "Size" 13dp + 26dp brush cells (marginStart 27) */}
        <div className="absolute inset-x-0 flex items-center justify-center" style={{ top: 47 + 56, height: 26 }}>
          <span className="text-white" style={{ fontSize: 13 }}>{STR.size}</span>
          <div className="flex" style={{ marginLeft: 27, gap: 10 }}>
            {BRUSHES.map((b, i) => (
              <button key={i} type="button" onClick={() => onBrush(i)} className="flex items-center justify-center" style={{ width: 26, height: 26 }} aria-label={`size ${i + 1}`}>
                <span className="rounded-full" style={{ width: b.size, height: b.size, background: i === brush ? PRIMARY : "#ffffff" }} />
              </button>
            ))}
          </div>
        </div>
        {/* area_confirm_cancel (44dp): icon_common_cancel 28 / "Reshape" 13dp / icon_check tinted primary */}
        <div className="absolute inset-x-0 bottom-0 flex items-end" style={{ height: 44 }}>
          <button type="button" onClick={onClose} style={{ marginLeft: 10, marginBottom: 8, width: 28, height: 28 }} aria-label="cancel"><img src={d("icon_common_cancel")} alt="" style={{ width: 28, height: 28 }} draggable={false} /></button>
          <span className="flex-1 text-center" style={{ marginBottom: 8, fontSize: 13, lineHeight: "28px", color: "#fefefe" }}>Reshape</span>
          <button type="button" onClick={onConfirm} style={{ marginRight: 10, marginBottom: 8, width: 28, height: 28 }} aria-label="confirm"><Tint name="icon_check" size={28} color={PRIMARY} /></button>
        </div>
      </div>
    </div>
  );
}
