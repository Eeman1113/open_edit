"use client";

// Overlay layers: Stickers (STAMP), Text, Brush item-content pages, their Add / Adjust / Eraser pages,
// the on-canvas gizmo and the top-bar layer list popup.
import { BASE } from "@/lib/base";
import { useEffect, useMemo, useRef, useState } from "react";
import { d } from "@/components/ui/legacy-drawable";
import { useEdit } from "../ctx";
import {
  BLENDS, BRUSH_COLORS, DEFAULT_TEXT_STYLE, LAYER_ADJUST_ITEMS, TEXT_COLORS, ZERO_LAYER_ADJUST,
  type Doc, type Layer, type LayerAdjust, type Stroke, type TextStyle,
} from "../model";
import { drawStrokes, FONTS, loadBrushTextures, rasterLayer, textCanvas } from "../pipeline";
import { markStampShopTooltipShown, StampShop, StampShopBalloon, stampShopTooltipPending } from "./StampShop";
import { AlertDialog, ColorChip, ControlRow, EditSeekBar, FeatureButton, FeatureList, Img, TitleBar, Tint } from "../ui";

type Kind = Layer["kind"];
const ADD_SUB = { stamp: "stamp-add", text: "text-add", brush: "brush-add" } as const;
const TAB_OF = { stamp: "STAMP", text: "TEXT", brush: "BRUSH" } as const;

const updateLayer = (doc: Doc, id: number, fn: (l: Layer) => Layer): Doc => ({ ...doc, layers: doc.layers.map((l) => (l.id === id ? fn(l) : l)) });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Selected layer of the given kind. */
function useSelected(kind?: Kind) {
  const { doc, selected } = useEdit();
  const l = doc.layers.find((x) => x.id === selected);
  return l && (!kind || l.kind === kind) ? l : undefined;
}

/** Kind of the Add page that was just closed (consumed by the LayerPanel that remounts right after). */
let addPageClosed: Kind | null = null;
/** Mark the Add page of `kind` as closed when it unmounts (set in cleanup, cleared on (re)mount for StrictMode). */
function useAddPageExit(kind: Kind) {
  useEffect(() => {
    addPageClosed = null;
    return () => { addPageClosed = kind; };
  }, [kind]);
}

/* ================================================================== item-content page */

export function LayerPanel({ kind }: { kind: Kind }) {
  const ctx = useEdit();
  const { doc, setLive, commit, undo, redo, setOriginal, openSub, select, nextId } = ctx;
  const layer = useSelected(kind);
  const [option, setOption] = useState<"opacity" | "blend" | null>(null);

  // EPContent.*_ADD: with nothing to edit the tab opens straight into its Add page — only on entering the tab, not when
  // that Add page was just closed (the panel remounts then; re-opening would trap the user in the Add page)
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (addPageClosed === kind) { addPageClosed = null; return; }
    addPageClosed = null;
    if (layer) return;
    const last = [...doc.layers].reverse().find((l) => l.kind === kind);
    if (last) select(last.id);
    else openSub(ADD_SUB[kind]);
  }, [doc.layers, kind, layer, openSub, select]);

  const items = [
    { id: "add", label: "add", icon: kind === "stamp" ? "icon_edit_tab_stamp" : kind === "text" ? "icon_edit_tab_text" : "icon_edit_tab_brush" },
    ...(kind === "text" ? [{ id: "edit", label: "Edit", icon: "icon_edit_tab_text_edit" }] : []),
    { id: "opacity", label: "Opacity", icon: "icon_edit_tab_opacity" },
    { id: "blend", label: "Blend", icon: "icon_edit_tab_blend" },
    { id: "eraser", label: "Eraser", icon: "icon_edit_tab_eraser" },
    { id: "reset", label: "Reset", icon: "icon_edit_tab_reset" },
    { id: "duplicate", label: "Duplicate", icon: "icon_edit_tab_copy" },
    { id: "adjust", label: "Adjust", icon: "icon_edit_tab_adjust" },
    { id: "mirror", label: "Mirror", icon: "icon_edit_tab_horizontal" },
    { id: "delete", label: "Delete", icon: "icon_edit_tab_delete" },
  ];

  const act = (id: string) => {
    if (id === "add") { setOption(null); openSub(ADD_SUB[kind]); return; }
    if (!layer) return;
    switch (id) {
      case "edit": openSub("text-edit"); break;
      case "opacity": case "blend": setOption((o) => (o === id ? null : id)); break;
      case "eraser": setOption(null); openSub("layer-eraser"); break;
      case "adjust": setOption(null); openSub("layer-adjust"); break;
      case "reset":
        commit(updateLayer(doc, layer.id, (l) => ({ ...l, x: 0.5, y: 0.5, rot: 0, flip: false, opacity: 1, blend: "normal", adjust: ZERO_LAYER_ADJUST, erase: [], s: l.kind === "brush" ? 1 : l.s })));
        break;
      case "duplicate": {
        const id2 = nextId();
        commit({ ...doc, layers: [...doc.layers, { ...layer, id: id2, x: Math.min(0.95, layer.x + 0.04), y: Math.min(0.95, layer.y + 0.04) }] });
        select(id2);
        break;
      }
      case "mirror": commit(updateLayer(doc, layer.id, (l) => ({ ...l, flip: !l.flip }))); break;
      case "delete": commit({ ...doc, layers: doc.layers.filter((l) => l.id !== layer.id) }); select(null); setOption(null); break;
    }
  };

  const optH = option && layer ? 52 : 0;
  return (
    <>
      <ControlRow bottom={186 + optH} undo={undo} redo={redo} onOriginal={setOriginal} />
      {option === "opacity" && layer && (
        <div className="absolute inset-x-0 flex items-center" style={{ bottom: 186, height: 52, background: "rgba(0,0,0,0.4)" }}>
          <span className="truncate text-white" style={{ marginLeft: 20, maxWidth: 80, fontSize: 13 }}>Opacity</span>
          <EditSeekBar
            style={{ marginLeft: 24, marginRight: 52 }} value={layer.opacity} min={0} max={1} def={1}
            onChange={(v) => setLive(updateLayer(doc, layer.id, (l) => ({ ...l, opacity: v })))}
            onRelease={(v) => commit(updateLayer(doc, layer.id, (l) => ({ ...l, opacity: v })))}
          />
        </div>
      )}
      {option === "blend" && layer && (
        <div className="no-scrollbar absolute inset-x-0 flex overflow-x-auto" style={{ bottom: 186, height: 52, background: "rgba(0,0,0,0.4)", padding: "0 6px" }}>
          {BLENDS.map((b) => (
            <button key={b.id} type="button" onClick={() => commit(updateLayer(doc, layer.id, (l) => ({ ...l, blend: b.id })))} className="h-full flex-none whitespace-nowrap" style={{ margin: "0 14px", fontSize: 13, color: layer.blend === b.id ? "#ffffff" : "rgba(255,255,255,0.6)" }}>
              {b.label}
            </button>
          ))}
        </div>
      )}
      <div className="absolute inset-x-0 bg-black" style={{ bottom: 52, height: 134 }}>
        <FeatureList count={items.length}>
          {items.map((it) => (
            <FeatureButton
              key={it.id} icon={it.icon} label={it.label}
              disabled={it.id !== "add" && !layer}
              selected={option === it.id}
              onClick={() => act(it.id)}
            />
          ))}
        </FeatureList>
      </div>
    </>
  );
}

/* ================================================================== gizmo */

export function LayerGizmo() {
  const { doc, setLive, commit, rect, frame, selected, select, tab, setTool, sub, openSub } = useEdit();
  const kind: Kind | null = tab === "STAMP" ? "stamp" : tab === "TEXT" ? "text" : tab === "BRUSH" ? "brush" : null;
  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; });
  const layer = doc.layers.find((l) => l.id === selected && l.kind === kind && !l.hidden);
  const editing = sub === "brush-add" || sub === "layer-eraser" || sub === "stamp-add";

  // tap to select / drag to move (preview tool)
  useEffect(() => {
    if (!kind || (sub && sub !== "text-edit" && sub !== "text-add" && sub !== "layer-adjust")) return;
    let drag: { id: number; x0: number; y0: number; lx: number; ly: number; moved: boolean } | null = null;
    const hit = (x: number, y: number) => {
      const fw = frame.fw, fh = frame.fh;
      const ls = docRef.current.layers;
      for (let i = ls.length - 1; i >= 0; i--) {
        const l = ls[i];
        if (l.kind !== kind || l.hidden) continue;
        const w = l.s * fw, h = w / l.aspect;
        const p = { x: x * fw - l.x * fw, y: y * fh - l.y * fh };
        const c = Math.cos(-l.rot), s = Math.sin(-l.rot);
        const qx = p.x * c - p.y * s, qy = p.x * s + p.y * c;
        if (Math.abs(qx) <= w / 2 && Math.abs(qy) <= h / 2) return l;
      }
      return null;
    };
    setTool({
      down: (x, y) => {
        const l = hit(x, y);
        if (!l) { select(null); drag = null; return; }
        select(l.id);
        drag = { id: l.id, x0: x, y0: y, lx: l.x, ly: l.y, moved: false };
      },
      move: (x, y) => {
        if (!drag) return;
        const dd = drag;
        dd.moved = true;
        setLive(updateLayer(docRef.current, dd.id, (l) => ({ ...l, x: dd.lx + x - dd.x0, y: dd.ly + y - dd.y0 })));
      },
      up: () => {
        if (drag?.moved) commit(docRef.current);
        drag = null;
      },
    });
    return () => setTool(null);
  }, [kind, sub, frame, setTool, select, setLive, commit]);

  const handle = useRef<{ cx: number; cy: number; v0: { x: number; y: number }; s0: number; r0: number; rotate: boolean } | null>(null);
  if (!layer || editing) return null;

  const cx = rect.x + layer.x * rect.w, cy = rect.y + layer.y * rect.h;
  const w = layer.s * rect.w, h = w / layer.aspect;

  const startHandle = (e: React.PointerEvent, rotate: boolean) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const root = (e.currentTarget as HTMLElement).offsetParent!.getBoundingClientRect();
    const ccx = root.left + cx, ccy = root.top + cy;
    handle.current = { cx: ccx, cy: ccy, v0: { x: e.clientX - ccx, y: e.clientY - ccy }, s0: layer.s, r0: layer.rot, rotate };
  };
  const moveHandle = (e: React.PointerEvent) => {
    const hd = handle.current;
    if (!hd) return;
    const v = { x: e.clientX - hd.cx, y: e.clientY - hd.cy };
    const k = Math.hypot(v.x, v.y) / Math.max(1, Math.hypot(hd.v0.x, hd.v0.y));
    const da = Math.atan2(v.y, v.x) - Math.atan2(hd.v0.y, hd.v0.x);
    let r = hd.rotate ? hd.r0 + da : hd.r0;
    // gizmo.snapped: snap to 0/90/180/270 degrees
    const snap = Math.round(r / (Math.PI / 2)) * (Math.PI / 2);
    if (hd.rotate && Math.abs(r - snap) < 0.05) r = snap;
    setLive(updateLayer(docRef.current, layer.id, (l) => ({ ...l, s: Math.max(0.03, Math.min(4, hd.s0 * k)), rot: r })));
  };
  const endHandle = () => { if (handle.current) { handle.current = null; commit(docRef.current); } };

  const corner = (sx: number, sy: number) => ({ left: w / 2 + sx * w / 2 - 8, top: h / 2 + sy * h / 2 - 8 });
  return (
    <div className="pointer-events-none absolute z-10" style={{ left: cx - w / 2, top: cy - h / 2, width: w, height: h, transform: `rotate(${layer.rot}rad)` }}>
      <div className="absolute inset-0" style={{ border: "1px solid #0bd4d2" }} />
      {([[-1, -1], [1, -1], [-1, 1]] as const).map(([sx, sy]) => (
        <img
          key={`${sx}${sy}`} src={`${BASE}/edit/gizmo_corner_default.png`} alt="" draggable={false}
          className="pointer-events-auto absolute" style={{ ...corner(sx, sy), width: 16, height: 16, touchAction: "none" }}
          onPointerDown={(e) => startHandle(e, false)} onPointerMove={moveHandle} onPointerUp={endHandle} onPointerCancel={endHandle}
        />
      ))}
      <img
        src={`${BASE}/edit/gizmo_btn_rotation.png`} alt="" draggable={false}
        className="pointer-events-auto absolute" style={{ left: w - 19.5, top: h - 19.5, width: 39, height: 39, touchAction: "none" }}
        onPointerDown={(e) => startHandle(e, true)} onPointerMove={moveHandle} onPointerUp={endHandle} onPointerCancel={endHandle}
      />
      {layer.kind === "text" && sub !== "text-edit" && sub !== "text-add" && (
        <button
          type="button"
          onClick={() => openSub("text-edit")}
          className="pointer-events-auto absolute flex items-center justify-center"
          style={{ left: w / 2 - 30, top: h + 10, width: 60, height: 30, backgroundImage: `url(${d("icon_stamp_btn_modify")})`, backgroundSize: "100% 100%", fontSize: 12, color: "#000000" }}
        >
          Type
        </button>
      )}
    </div>
  );
}

/* ================================================================== layer list popup */

function LayerThumb({ l }: { l: Layer }) {
  const url = useMemo(() => {
    const c = rasterLayer({ ...l, opacity: 1 }, 64);
    return c ? c.toDataURL() : "";
  }, [l]);
  return url ? <img src={url} alt="" className="object-contain" style={{ width: 32, height: 32 }} /> : null;
}

export function LayerListPopup({ onClose }: { onClose: () => void }) {
  const { doc, commit, setTab, select, originalUrl, bases, frame } = useEdit();
  const [confirm, setConfirm] = useState(false);
  const front = [...doc.layers].reverse();
  const drag = useRef<{ id: number; y0: number; idx: number } | null>(null);
  const [dragDy, setDragDy] = useState<{ id: number; dy: number } | null>(null);
  const rows = Math.min(front.length, 5.5);

  const merge = () => {
    const base = bases.current[doc.base];
    const out = document.createElement("canvas");
    out.width = base.width; out.height = base.height;
    const g = out.getContext("2d")!;
    g.drawImage(base, 0, 0);
    // layers are positioned in frame space; map the frame onto the base (ignoring the border padding)
    const k = base.width / frame.fw;
    g.save(); g.translate(-(frame.fw - base.width / k) / 2 * k, -(frame.fh - base.height / k) / 2 * k);
    for (const l of doc.layers) {
      if (l.hidden) continue;
      const c = rasterLayer(l, l.s * frame.fw * k);
      if (!c) continue;
      const w = l.s * frame.fw * k, h = w / l.aspect;
      g.save();
      g.globalAlpha = l.opacity; g.globalCompositeOperation = l.blend === "normal" ? "source-over" : l.blend;
      g.translate(l.x * frame.fw * k, l.y * frame.fh * k); g.rotate(l.rot); g.scale(l.flip ? -1 : 1, 1);
      g.drawImage(c, -w / 2, -h / 2, w, h);
      g.restore();
    }
    g.restore();
    bases.current.push(out);
    commit({ ...doc, base: bases.current.length - 1, layers: [] });
    select(null);
    onClose();
  };

  return (
    <>
      <img src={d("icon_common_tooltip_arrow")} alt="" className="absolute z-30" style={{ right: 8 + 74 + 4 + 21 - 7, top: 52, width: 14, height: 8 }} />
      <div className="absolute z-30 overflow-hidden" style={{ right: 10, top: 59, width: 146, borderRadius: 3, background: "rgba(0,0,0,0.6)" }}>
        <button type="button" onClick={() => setConfirm(true)} className="flex items-center justify-center" style={{ margin: "12px 12px 0", width: 122, height: 32, borderRadius: 15, background: "rgba(255,255,255,0.2)" }}>
          <Img name="icon_common_mergelayer" size={20} />
          <span className="text-white" style={{ fontSize: 12, marginLeft: 6 }}>Merge All</span>
        </button>
        <div className="no-scrollbar overflow-y-auto" style={{ marginTop: 8, paddingBottom: 10, maxHeight: 56 * rows + 10 }}>
          {front.map((l, i) => (
            <div
              key={l.id}
              className="relative flex items-center"
              style={{ height: 56, transform: dragDy?.id === l.id ? `translateY(${dragDy.dy}px)` : undefined, zIndex: dragDy?.id === l.id ? 1 : 0 }}
              onClick={() => { select(l.id); setTab(TAB_OF[l.kind]); select(l.id); onClose(); }}
            >
              <div className="relative flex flex-none items-center justify-center" style={{ width: 48, height: 48, marginLeft: 12, borderRadius: 2, background: "rgba(255,255,255,0.25)", opacity: l.hidden ? 0.4 : 1 }}>
                <LayerThumb l={l} />
              </div>
              <button type="button" className="absolute" style={{ left: 6, top: 2, width: 14, height: 14 }} onClick={(e) => { e.stopPropagation(); commit({ ...doc, layers: doc.layers.filter((x) => x.id !== l.id) }); }}>
                <Img name="icon_common_layer_delete" size={14} />
              </button>
              <span className="flex-1" />
              <button type="button" className="flex items-center justify-center" style={{ width: 36, paddingRight: 12, boxSizing: "content-box", height: 56 }} onClick={(e) => { e.stopPropagation(); commit(updateLayer(doc, l.id, (x) => ({ ...x, hidden: !x.hidden }))); }}>
                <Img name={l.hidden ? "icon_edit_layer_hide" : "icon_edit_layer_show"} size={24} />
              </button>
              <div
                className="flex h-full items-center justify-center"
                style={{ width: 35, paddingRight: 11, touchAction: "none" }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: l.id, y0: e.clientY, idx: i }; setDragDy({ id: l.id, dy: 0 }); }}
                onPointerMove={(e) => { if (drag.current) setDragDy({ id: l.id, dy: e.clientY - drag.current.y0 }); }}
                onPointerUp={(e) => {
                  const dg = drag.current; drag.current = null; setDragDy(null);
                  if (!dg) return;
                  const to = Math.max(0, Math.min(front.length - 1, dg.idx + Math.round((e.clientY - dg.y0) / 56)));
                  if (to === dg.idx) return;
                  const f = [...front]; const [m] = f.splice(dg.idx, 1); f.splice(to, 0, m);
                  commit({ ...doc, layers: f.reverse() });
                }}
              >
                <Img name="icon_edit_layer_holder" size={24} />
              </div>
            </div>
          ))}
          {/* layer_original_item_layout */}
          <div className="flex items-center" style={{ height: 56 }}>
            <div className="flex-none overflow-hidden" style={{ width: 48, height: 48, marginLeft: 12, borderRadius: 2, background: "rgba(255,255,255,0.25)" }}>
              {originalUrl && <img src={originalUrl} alt="" className="h-full w-full object-cover" />}
            </div>
            <span className="flex-1 text-center text-white" style={{ fontSize: 12 }}>Background</span>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 z-20" onClick={onClose} />
      {confirm && <AlertDialog message="Merge All cannot be undone." cancel="Cancel" ok="OK" onCancel={() => setConfirm(false)} onOk={() => { setConfirm(false); merge(); }} />}
    </>
  );
}

/* ================================================================== Stickers: Add page */

const MY_KEY = "b612:edit:myStamps";
const RECENT_KEY = "b612:edit:recentStamps";
const readList = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) ?? "[]") as string[]; } catch { return []; } };
const writeList = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };

async function fileToStamp(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL("image/png");
}

export function StampAddPage() {
  const { doc, commit, openSub, select, nextId, toast, rect } = useEdit();
  useAddPageExit("stamp");
  const [cat, setCat] = useState<"recent" | "my" | "manage">("recent");
  const [recent, setRecent] = useState<string[]>(() => readList(RECENT_KEY));
  const [mine, setMine] = useState<string[]>(() => readList(MY_KEY));
  const fileRef = useRef<HTMLInputElement>(null);
  const [shop, setShop] = useState(false);
  const [balloon, setBalloon] = useState(stampShopTooltipPending);
  const shopBtn = useRef<HTMLButtonElement>(null);
  const layerRoot = useRef<HTMLDivElement>(null);
  // btn_stamp_shop -> StampShopActivity (requestCode 10026); the first visit retires the balloon
  const openShop = () => { markStampShopTooltipShown(); setBalloon(false); setShop(true); };

  const add = (src: string) => {
    const img = new Image();
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight || 1;
      const id = nextId();
      // ~ a third of the shorter displayed side, centred
      const s = Math.min(0.4, (Math.min(rect.w, rect.h) * 0.4) / rect.w);
      commit({ ...doc, layers: [...doc.layers, { id, kind: "stamp", src, aspect, x: 0.5, y: 0.5, s, rot: 0, flip: false, opacity: 1, blend: "normal", hidden: false, adjust: ZERO_LAYER_ADJUST, erase: [] }] });
      select(id);
      const r = [src, ...recent.filter((x) => x !== src)].slice(0, 20);
      setRecent(r); writeList(RECENT_KEY, r);
    };
    img.src = src;
  };

  const grid = (list: string[], manage = false) => (
    <div className="grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", padding: "4.5px 0" }}>
      {list.map((src) => (
        <button
          key={src.slice(-64)} type="button"
          onClick={() => {
            if (!manage) return add(src);
            const m = mine.filter((x) => x !== src); setMine(m); writeList(MY_KEY, m);
            const r = recent.filter((x) => x !== src); setRecent(r); writeList(RECENT_KEY, r);
          }}
          className="relative mx-auto flex items-center justify-center" style={{ width: 63, height: 63, marginBottom: 10 }}
        >
          <span className="absolute" style={{ width: 54, height: 54, borderRadius: 5, background: "rgba(255,255,255,0.06)" }} />
          <img src={src} alt="" className="relative object-contain" style={{ width: 54, height: 54 }} />
          {manage && <Img name="edit_stamp_delete" size={20} style={{ position: "absolute", top: 0, right: 0 }} />}
        </button>
      ))}
    </div>
  );

  const catBtn = (id: typeof cat, icon: string, size = 31, tint = false) => (
    <button key={id} type="button" onClick={() => setCat(id)} className="relative flex flex-none items-center justify-center" style={{ width: 56, height: 43 }}>
      {tint ? <Tint name={icon} size={size} color="#ffffff" /> : <Img name={icon} size={size} />}
      {cat === id && <span className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 1, width: 24, height: 2, borderRadius: 1, background: "#0bd4d2" }} />}
    </button>
  );

  return (
    <>
      <input
        ref={fileRef} type="file" accept="image/*" hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const src = await fileToStamp(f);
            const m = [src, ...mine].slice(0, 30); setMine(m); writeList(MY_KEY, m);
          } catch { toast("This feature is not supported on your device."); }
        }}
      />
      <div className="absolute inset-x-0 bottom-0" style={{ height: 302, background: "rgba(17,17,17,0.9)" }}>
        <div className="absolute inset-x-0 top-0 flex items-center" style={{ height: 42 }}>
          <button ref={shopBtn} type="button" onClick={openShop} className="flex-none" style={{ marginLeft: 7 }} aria-label="Sticker shop">
            <Img name="edit_stamp_search" size={35} />
          </button>
          <div className="no-scrollbar flex overflow-x-auto" style={{ marginLeft: 10 }}>
            {catBtn("recent", "edit_stamp_recent")}
            {catBtn("my", "edit_stamp_my")}
            {catBtn("manage", "edit_stamp_setting", 35, true)}
          </div>
        </div>
        <div className="absolute inset-x-0" style={{ top: 42, height: 1, background: "#303030" }} />
        <div className="no-scrollbar absolute inset-x-0 overflow-y-auto" style={{ top: 43, bottom: 52 }}>
          {cat === "recent" && (recent.length ? grid(recent) : (
            <p className="absolute inset-0 flex items-center justify-center whitespace-pre-line text-center text-white" style={{ fontSize: 13 }}>{"Add Stickers to\ndecorate your photo!"}</p>
          ))}
          {cat === "my" && (
            <>
              <div className="flex justify-center" style={{ paddingTop: 14 }}>
                <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center text-white" style={{ height: 40, paddingLeft: 15, paddingRight: 20, borderRadius: 20, border: "1px solid rgba(255,255,255,0.2)", fontSize: 14 }}>
                  <Img name="edit_stamp_add" size={24} style={{ marginRight: 4 }} />
                  Create stickers
                </button>
              </div>
              {grid(mine)}
            </>
          )}
          {cat === "manage" && grid(mine, true)}
        </div>
        <TitleBar title="Stickers" onConfirm={() => openSub(null)} />
      </div>
      <div ref={layerRoot} className="pointer-events-none absolute inset-0 z-30">
        {balloon && !shop && <div className="pointer-events-auto"><StampShopBalloon anchor={shopBtn} onClick={openShop} /></div>}
      </div>
      {shop && <StampShop onClose={() => setShop(false)} />}
    </>
  );
}

/* ================================================================== Text: input + Add/Edit page */

function TextInput({ initial, onCancel, onDone }: { initial: string; onCancel: () => void; onDone: (t: string) => void }) {
  const { toast } = useEdit();
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="absolute inset-0 z-50" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between" style={{ height: 52 }}>
        <button type="button" onClick={onCancel} className="text-white" style={{ marginLeft: 19, fontSize: 17, height: 52 }}>Cancel</button>
        <button type="button" onClick={() => (text.trim() ? onDone(text) : toast("Please enter text."))} style={{ marginRight: 19, fontSize: 17, height: 52, color: "#0bd4d2" }}>Done</button>
      </div>
      <div className="absolute inset-x-0 flex items-center justify-center" style={{ top: 52, bottom: 192 }}>
        <textarea
          ref={ref} value={text} onChange={(e) => setText(e.target.value)} placeholder="Please enter text." rows={Math.min(6, text.split("\n").length)}
          className="resize-none bg-transparent text-center text-white outline-none placeholder:text-[rgba(255,255,255,0.3)]"
          style={{ width: 350, maxWidth: "100%", fontSize: 25, minHeight: 45, paddingTop: 8.5, paddingBottom: 3, caretColor: "#ffffff" }}
        />
      </div>
    </div>
  );
}

type StyleCat = "text" | "stroke" | "shadow" | "bg" | "align" | "spacing";
const STYLE_CATS: { id: StyleCat; label: string }[] = [
  { id: "text", label: "Text" }, { id: "stroke", label: "Stroke" }, { id: "shadow", label: "Shadow" },
  { id: "bg", label: "Background" }, { id: "align", label: "Align" }, { id: "spacing", label: "Spacing" },
];

function ColorCells({ colors, value, none, onPick }: { colors: string[]; value: string | null; none: boolean; onPick: (c: string | null) => void }) {
  const list: (string | null)[] = none ? [null, ...colors] : colors;
  return (
    <div className="no-scrollbar flex overflow-x-auto" style={{ height: 37, marginLeft: 5.5, padding: "0 4px", alignItems: "center" }}>
      {list.map((c, i) => {
        const sel = c === value;
        return (
          <button
            key={c ?? "none"} type="button" onClick={() => onPick(c)} className="relative flex-none"
            style={{
              width: 34, height: 34, background: c ?? "#222222",
              borderTopLeftRadius: i === 0 ? 2 : 0, borderBottomLeftRadius: i === 0 ? 2 : 0,
              borderTopRightRadius: i === list.length - 1 ? 2 : 0, borderBottomRightRadius: i === list.length - 1 ? 2 : 0,
              boxShadow: c === "#000000" ? "inset 0 1px 0 #2F2F2F, inset 0 -1px 0 #2F2F2F" : undefined,
            }}
          >
            {c === null && <span className="absolute left-1/2 top-1/2" style={{ width: 17, height: 1.5, background: "#ffffff", transform: "translate(-50%,-50%) rotate(-45deg)" }} />}
            {sel && <span className="absolute" style={{ inset: -2, border: "2px solid #ffffff", borderRadius: 3, zIndex: 1 }} />}
          </button>
        );
      })}
    </div>
  );
}

function StyleRow({ title, value, def, disabled, onChange, onRelease }: { title: string; value: number; def: number; disabled?: boolean; onChange: (v: number) => void; onRelease?: (v: number) => void }) {
  return (
    <div className="relative flex items-center" style={{ height: 52 }}>
      <span className="absolute text-center text-white" style={{ left: 0, width: "25%", fontSize: 13 }}>{title}</span>
      <div className="absolute flex" style={{ left: "25%", width: "58%" }}>
        <EditSeekBar value={value} min={0} max={1} def={def} level={false} disabled={disabled} onChange={onChange} onRelease={onRelease} />
      </div>
      <span className="absolute text-center text-white" style={{ left: "83%", width: "10%", fontSize: 12, opacity: disabled ? 0.3 : 1 }}>{Math.round(value * 100)}</span>
    </div>
  );
}

export function TextAddPage({ mode }: { mode: "add" | "edit" }) {
  const { doc, setLive, commit, openSub, select, nextId, rect, selected, setTool, photoCanvas, toast } = useEdit();
  useAddPageExit("text");
  const existing = doc.layers.find((l) => l.id === selected && l.kind === "text") as Extract<Layer, { kind: "text" }> | undefined;
  const [input, setInput] = useState(mode === "add" || !existing);
  const [layerId, setLayerId] = useState<number | null>(mode === "edit" && existing ? existing.id : null);
  const [page, setPage] = useState<"edit" | "style">("edit");
  const [cat, setCat] = useState<StyleCat>("text");
  const [picking, setPicking] = useState(false);
  const [entry] = useState(doc);
  const layer = doc.layers.find((l) => l.id === layerId) as Extract<Layer, { kind: "text" }> | undefined;
  const st: TextStyle = layer?.style ?? { ...DEFAULT_TEXT_STYLE, text: "" };
  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; });

  const setStyle = (patch: Partial<TextStyle>) => {
    if (!layer) return;
    const style = { ...layer.style, ...patch };
    const c = textCanvas(style);
    const aspect = c.width / c.height;
    // keep the on-screen font size when the text box changes
    const s = layer.s * (c.width / textCanvas(layer.style).width);
    setLive(updateLayer(doc, layer.id, (l) => ({ ...l, style, aspect, s })));
  };

  // tap the text on the preview to retype; eyedropper samples the photo
  useEffect(() => {
    if (input) return;
    setTool({
      down: (x, y) => {
        if (picking) {
          const src = photoCanvas();
          if (!src) return;
          const c = document.createElement("canvas"); c.width = 1; c.height = 1;
          const g = c.getContext("2d")!;
          g.drawImage(src, Math.max(0, Math.min(src.width - 1, x * src.width)), Math.max(0, Math.min(src.height - 1, y * src.height)), 1, 1, 0, 0, 1, 1);
          const p = g.getImageData(0, 0, 1, 1).data;
          const hex = `#${[p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
          const key = cat === "text" ? "color" : cat === "stroke" ? "stroke" : cat === "shadow" ? "shadow" : "bg";
          const l = docRef.current.layers.find((q) => q.id === layerId);
          if (l && l.kind === "text") {
            const style = { ...l.style, [key]: hex };
            const cv = textCanvas(style);
            setLive(updateLayer(docRef.current, l.id, (q) => ({ ...q, style, aspect: cv.width / cv.height })));
          }
          setPicking(false);
          return;
        }
        const l = docRef.current.layers.find((q) => q.id === layerId);
        if (!l) return;
        const w = l.s, h = (l.s * 1) / l.aspect * (rect.w / rect.h);
        if (Math.abs(x - l.x) <= w / 2 && Math.abs(y - l.y) <= h / 2) setInput(true);
      },
    });
    return () => setTool(null);
  }, [input, picking, cat, layerId, rect, setTool, setLive, photoCanvas]);

  const onDone = (text: string) => {
    setInput(false);
    if (layer) { setStyle({ text }); return; }
    const style = { ...DEFAULT_TEXT_STYLE, text };
    const c = textCanvas(style);
    const id = nextId();
    const s = Math.min(0.9, (c.width * 24 / 160) / rect.w);
    setLive({ ...doc, layers: [...doc.layers, { id, kind: "text", style, aspect: c.width / c.height, x: 0.5, y: 0.5, s, rot: 0, flip: false, opacity: 1, blend: "normal", hidden: false, adjust: ZERO_LAYER_ADJUST, erase: [] }] });
    setLayerId(id);
    select(id);
  };

  const confirm = () => {
    if (doc !== entry) commit(doc);
    openSub(null);
  };

  const colorKey = cat === "text" ? "color" : cat === "stroke" ? "stroke" : cat === "shadow" ? "shadow" : "bg";
  const valueKey = cat === "text" ? "colorAlpha" : cat === "stroke" ? "strokeV" : cat === "shadow" ? "shadowV" : "bgV";
  const defV = cat === "text" ? 1 : cat === "stroke" ? 0.05 : cat === "shadow" ? 0.5 : 1;

  return (
    <>
      <div className="absolute inset-x-0 bottom-0" style={{ height: 192 + 52 }}>
        <div className="absolute inset-x-0 top-0" style={{ height: 192, background: "rgba(17,17,17,0.9)" }}>
          {page === "edit" ? (
            <>
              {/* font_recycler_view */}
              <div className="no-scrollbar flex overflow-x-auto" style={{ height: 50, paddingTop: 10, paddingLeft: 14.5, paddingRight: 14.5, gap: 10 }}>
                {FONTS.map((f) => (
                  <button key={f.id} type="button" onClick={() => setStyle({ font: f.id })} className="relative flex flex-none items-center justify-center whitespace-nowrap text-white" style={{ width: 76, height: 40, borderRadius: 7, background: "#3C3C3C", fontFamily: f.css, fontSize: 14 }}>
                    {f.label}
                    {st.font === f.id && <span className="absolute inset-0" style={{ borderRadius: 7, border: "2px solid #0bd4d2" }} />}
                  </button>
                ))}
              </div>
              {/* category tabs */}
              <div className="no-scrollbar flex items-start overflow-x-auto" style={{ height: 52, paddingTop: 11, paddingLeft: 21.5, paddingRight: 27.5, gap: 10 }}>
                {STYLE_CATS.map((c) => (
                  <button key={c.id} type="button" onClick={() => setCat(c.id)} className="flex-none" style={{ height: 32, padding: "0 12px", fontSize: 13, borderRadius: 50, background: cat === c.id ? "#ffffff" : "transparent", color: cat === c.id ? "#000000" : "#ffffff" }}>
                    {c.label}
                  </button>
                ))}
              </div>
              {/* view_pager_font_style (88dp) */}
              <div style={{ height: 88 }}>
                {(cat === "text" || cat === "stroke" || cat === "shadow" || cat === "bg") && (
                  <>
                    <div className="flex items-center" style={{ paddingTop: 5 }}>
                      <button type="button" onClick={() => setPicking((v) => !v)} className="flex-none" style={{ width: 34, height: 34.5, marginLeft: 12, marginRight: 4.5, opacity: picking ? 0.5 : 1 }}>
                        <Img name="icon_text_picker" size={34} />
                      </button>
                      <ColorCells
                        colors={TEXT_COLORS} none={cat !== "text"} value={st[colorKey] as string | null}
                        onPick={(c) => setStyle({ [colorKey]: c } as Partial<TextStyle>)}
                      />
                    </div>
                    <div style={{ marginTop: 3.5 }}>
                      <StyleRow
                        title={cat === "stroke" ? "Thickness" : "Opacity"} value={st[valueKey] as number} def={defV}
                        disabled={st[colorKey] === null}
                        onChange={(v) => setStyle({ [valueKey]: v } as Partial<TextStyle>)}
                      />
                    </div>
                  </>
                )}
                {cat === "align" && (
                  <div className="flex items-center justify-center" style={{ height: 71.5, paddingBottom: 7 }}>
                    {(["left", "center", "right"] as const).map((a) => (
                      <button key={a} type="button" onClick={() => setStyle({ align: a })} className="flex items-center justify-center" style={{ width: 58.5, height: 58.5, margin: "0 10px", borderRadius: 6, background: "#222222", boxShadow: st.align === a ? "inset 0 0 0 2px #0bd4d2" : undefined }}>
                        <Img name={`icon_text_align_${a}`} size={46} />
                      </button>
                    ))}
                  </div>
                )}
                {cat === "spacing" && (
                  <div style={{ height: 88 }}>
                    <div style={{ height: 44 }} className="relative"><div className="absolute inset-x-0" style={{ top: -4 }}><StyleRow title="Character" value={st.letter} def={0} onChange={(v) => setStyle({ letter: v })} /></div></div>
                    <div style={{ height: 44 }} className="relative"><div className="absolute inset-x-0" style={{ top: -4 }}><StyleRow title="Line" value={st.line} def={0} onChange={(v) => setStyle({ line: v })} /></div></div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Img name="gallery_edit_frame_error" size={40} />
              <button type="button" onClick={() => toast("Not connected to network.")} className="text-white" style={{ marginTop: 10, height: 31, padding: "0 14px", borderRadius: 16, fontSize: 13, background: "rgba(255,255,255,0.15)" }}>Retry</button>
            </div>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black" style={{ height: 52 }}>
          <button type="button" onClick={() => setPage("edit")} style={{ fontSize: 15, marginRight: 60, color: page === "edit" ? "#ffffff" : "rgba(255,255,255,0.49)" }}>Edit</button>
          <button type="button" onClick={() => setPage("style")} style={{ fontSize: 15, marginLeft: 60, color: page === "style" ? "#ffffff" : "rgba(255,255,255,0.49)" }}>Style</button>
          <button type="button" aria-label="Confirm" onClick={confirm} className="absolute right-0 top-0" style={{ width: 52, height: 52 }}>
            <Tint name="icon_edit_title_confirm" size={52} color="#0bd4d2" />
          </button>
        </div>
      </div>
      {input && (
        <TextInput
          initial={layer?.style.text ?? ""}
          onCancel={() => { setInput(false); if (!layer) { setLive(null); openSub(null); } }}
          onDone={onDone}
        />
      )}
    </>
  );
}

/* ================================================================== Brush: Add page */

/**
 * DownloadedBrush fields used by the add page (type, colorPickerUse, defaultStrength, resourceName ->
 * BrushConfig.brushPath, outlineResourceName -> outlinePath, stampInterval, supportRotation -> useDirection).
 */
interface LocalBrush {
  id: string; name: string; type: "COLOR" | "HIGHLIGHTER" | "OUTLINE" | "STAMP"; min: number; max: number;
  colorPickerUse: boolean; defaultStrength: number; tex: string; outline?: string; interval: number; rot: boolean; inner?: string;
}
/**
 * The brush list itself is server content (/v1/brush/overview); offline the catalogue is built from the brush masks
 * bundled in the APK (assets/kuru/masks): mask_brush (BrushConfig's default brushPath / outlinePath), marker_brush,
 * blurred_marker_brush, touch_brush, blur_brush and cutout_dash_brush. Ranges are KuruRenderChainWrapper.BrushType.
 */
const COLOR_RANGE = { min: 0.0015, max: 0.15 };
const BRUSHES: LocalBrush[] = [
  { id: "pen", name: "Pen", type: "COLOR", ...COLOR_RANGE, colorPickerUse: true, defaultStrength: 20, tex: "round", interval: 0.05, rot: false },
  { id: "marker", name: "Marker", type: "COLOR", ...COLOR_RANGE, colorPickerUse: true, defaultStrength: 30, tex: "marker", interval: 0.04, rot: true },
  { id: "softmarker", name: "Soft marker", type: "COLOR", ...COLOR_RANGE, colorPickerUse: true, defaultStrength: 30, tex: "marker-soft", interval: 0.04, rot: true },
  { id: "highlighter", name: "Highlighter", type: "HIGHLIGHTER", ...COLOR_RANGE, colorPickerUse: true, defaultStrength: 40, tex: "marker", interval: 0.04, rot: true },
  { id: "airbrush", name: "Airbrush", type: "COLOR", ...COLOR_RANGE, colorPickerUse: true, defaultStrength: 40, tex: "spray", interval: 0.06, rot: false },
  { id: "soft", name: "Soft", type: "COLOR", ...COLOR_RANGE, colorPickerUse: true, defaultStrength: 30, tex: "soft", interval: 0.06, rot: false },
  { id: "neon", name: "Neon", type: "OUTLINE", min: 0.01635, max: 0.3, colorPickerUse: true, defaultStrength: 20, tex: "round", outline: "neon", inner: "#FFFFFF", interval: 0.05, rot: false },
  { id: "dash", name: "Dash", type: "STAMP", min: 0.0025, max: 0.5, colorPickerUse: true, defaultStrength: 12, tex: "dashed", interval: 0.55, rot: true },
];
const THUMB_COLOR: Partial<Record<LocalBrush["type"], string>> = { HIGHLIGHTER: "#FFC300", OUTLINE: "#32C5FF" };
const strokeOf = (b: LocalBrush, pts: number[], size: number, color: string): Stroke => ({
  pts, size, color, kind: b.type === "HIGHLIGHTER" ? "highlighter" : b.type === "OUTLINE" ? "outline" : "pen",
  tex: b.tex, outline: b.outline, inner: b.inner, interval: b.interval, rot: b.rot,
});

/** Brush thumbnails (server images offline): a sample stroke drawn with the brush itself. */
function useBrushThumbs() {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void loadBrushTextures().then(() => {
      if (!alive) return;
      const out: Record<string, string> = {};
      const pts: number[] = [];
      for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push(0.18 + 0.64 * t, 0.55 - 0.22 * Math.sin(t * Math.PI * 1.6)); }
      for (const b of BRUSHES) {
        const c = document.createElement("canvas"); c.width = c.height = 138;
        const g = c.getContext("2d")!;
        g.fillStyle = "#1c1c1c"; g.fillRect(0, 0, 138, 138);
        const size = b.type === "OUTLINE" ? 0.07 : b.type === "STAMP" ? 0.4 : 0.1;
        drawStrokes(g, [strokeOf(b, pts, size, THUMB_COLOR[b.type] ?? "#FFFFFF")], 138, 138);
        out[b.id] = c.toDataURL();
      }
      setThumbs(out);
    });
    return () => { alive = false; };
  }, []);
  return thumbs;
}

export function BrushAddPage() {
  const { doc, setLive, commit, openSub, select, nextId, frame, rect, setTool, setOriginal, photoCanvas } = useEdit();
  useAddPageExit("brush");
  const [entry] = useState(doc);
  const [brush, setBrush] = useState(BRUSHES[0]);
  const [mode, setMode] = useState<"brush" | "eraser">("brush");
  const [sizes, setSizes] = useState({ brush: BRUSHES[0].defaultStrength / 100, eraser: 0.3 });
  const [color, setColor] = useState("#FFFFFF");
  const [custom, setCustom] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [strokes, setStrokes] = useState<{ list: Stroke[]; i: number }>({ list: [], i: 0 });
  const [layerId] = useState(() => nextId());
  const paletteRef = useRef<HTMLInputElement>(null);
  const cur = useRef<Stroke | null>(null);
  const thumbs = useBrushThumbs();

  const visible = strokes.list.slice(0, strokes.i);
  const build = (list: Stroke[]): Doc => {
    const others = entry.layers.filter((l) => l.id !== layerId);
    if (!list.length) return { ...entry, layers: others };
    return { ...entry, layers: [...others, { id: layerId, kind: "brush", strokes: list, aspect: frame.fw / frame.fh, x: 0.5, y: 0.5, s: 1, rot: 0, flip: false, opacity: 1, blend: "normal", hidden: false, adjust: ZERO_LAYER_ADJUST, erase: [] }] };
  };
  const stateRef = useRef({ visible, brush, mode, sizes, color, picking });
  useEffect(() => { stateRef.current = { visible, brush, mode, sizes, color, picking }; });

  useEffect(() => {
    const viewW = rect.w + rect.x * 2;
    setTool({
      down: (x, y) => {
        const s = stateRef.current;
        if (s.picking) {
          const src = photoCanvas();
          if (src) {
            const c = document.createElement("canvas"); c.width = 1; c.height = 1;
            const g = c.getContext("2d")!;
            g.drawImage(src, Math.max(0, Math.min(src.width - 1, x * src.width)), Math.max(0, Math.min(src.height - 1, y * src.height)), 1, 1, 0, 0, 1, 1);
            const p = g.getImageData(0, 0, 1, 1).data;
            const hex = `#${[p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
            setCustom(hex); setColor(hex);
          }
          setPicking(false);
          return;
        }
        const er = s.mode === "eraser";
        const [mn, mx] = er ? [0.0015, 0.15] : [s.brush.min, s.brush.max];
        const size = lerp(mn, mx, er ? s.sizes.eraser : s.sizes.brush) * (viewW / 2) / rect.w * (s.brush.type === "OUTLINE" && !er ? 0.5 : 1);
        cur.current = er ? { pts: [x, y], size, color: s.color, kind: "eraser" } : strokeOf(s.brush, [x, y], size, s.color);
        setLive(build([...s.visible, cur.current]));
      },
      move: (x, y) => {
        const c = cur.current;
        if (!c) return;
        c.pts.push(x, y);
        setLive(build([...stateRef.current.visible, { ...c, pts: [...c.pts] }]));
      },
      up: () => {
        const c = cur.current;
        if (!c) return;
        cur.current = null;
        const list = [...stateRef.current.visible, c];
        setStrokes({ list, i: list.length });
        setLive(build(list));
      },
    });
    return () => setTool(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect, frame, setTool]);

  const stepStroke = (dir: -1 | 1) => {
    const i = Math.max(0, Math.min(strokes.list.length, strokes.i + dir));
    setStrokes({ ...strokes, i });
    setLive(build(strokes.list.slice(0, i)));
  };

  return (
    <>
      <input ref={paletteRef} type="color" hidden defaultValue="#ffffff" onChange={(e) => { const c = e.currentTarget.value.toUpperCase(); setCustom(c); setColor(c); }} />
      <ControlRow bottom={186 + (brush.colorPickerUse ? 54 : 0)} undo={{ can: strokes.i > 0, on: () => stepStroke(-1) }} redo={{ can: strokes.i < strokes.list.length, on: () => stepStroke(1) }} onOriginal={setOriginal} />
      {brush.colorPickerUse && (
        <div className="no-scrollbar absolute inset-x-0 flex items-center overflow-x-auto" style={{ bottom: 186, height: 54, padding: "0 9.5px", background: "rgba(0,0,0,0.4)" }}>
          <button type="button" onClick={() => setPicking((v) => !v)} className="relative flex flex-none items-center justify-center rounded-full" style={{ width: 32, height: 32, margin: "11px 8.5px", background: "#333333", opacity: picking ? 0.5 : 1 }}>
            <Img name="icon_edit_color_picker" size={32} />
          </button>
          <button type="button" onClick={() => paletteRef.current?.click()} className="flex-none" style={{ width: 32, height: 32, margin: "11px 8.5px" }}>
            <Img name="icon_edit_color_wheel" size={32} />
          </button>
          {custom && <ColorChip color={custom} selected={color === custom} onClick={() => setColor(custom)} style={{ margin: "11px 8.5px" }} />}
          {BRUSH_COLORS.map((c) => <ColorChip key={c} color={c} selected={color === c && c !== custom} onClick={() => setColor(c)} darkOutline={c === "#000000"} style={{ margin: "11px 8.5px" }} />)}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: 186 }}>
        <div className="absolute inset-x-0 top-0 flex items-center" style={{ height: 54 }}>
          <button type="button" onClick={() => setMode("brush")} style={{ marginLeft: 24, padding: "10px 0", fontSize: 13, color: mode === "brush" ? "#ffffff" : "rgba(255,255,255,0.6)" }}>Brush</button>
          <button type="button" onClick={() => setMode("eraser")} style={{ marginLeft: 20, padding: "10px 0", fontSize: 13, color: mode === "eraser" ? "#ffffff" : "rgba(255,255,255,0.6)" }}>Eraser</button>
          <EditSeekBar
            style={{ marginLeft: 24, marginRight: 48 }} value={sizes[mode]} min={0.01} max={1} def={mode === "eraser" ? 0.3 : brush.defaultStrength / 100}
            onChange={(v) => setSizes((s) => ({ ...s, [mode]: v }))}
          />
        </div>
        <div className="no-scrollbar absolute inset-x-0 flex overflow-x-auto" style={{ top: 54, height: 69, padding: "0 8px", gap: 2 }}>
          {BRUSHES.map((b) => (
            <button key={b.id} type="button" onClick={() => { setBrush(b); setMode("brush"); setSizes((s) => ({ ...s, brush: b.defaultStrength / 100 })); }} className="relative flex-none overflow-hidden" style={{ width: 69, height: 69 }}>
              {thumbs[b.id] ? <img src={thumbs[b.id]} alt="" draggable={false} className="h-full w-full" /> : <img src={d("sticker_default")} alt="" className="h-full w-full" />}
              {brush.id === b.id && <img src={d("edit_sticker_select")} alt="" className="absolute inset-0 h-full w-full" />}
            </button>
          ))}
        </div>
        <TitleBar
          title="Brush"
          onClose={() => { setLive(null); openSub(null); }}
          onConfirm={() => { if (visible.length) { commit(build(visible)); select(layerId); } else setLive(null); openSub(null); }}
        />
      </div>
    </>
  );
}

/* ================================================================== layer Adjust page */

export function LayerAdjustPage() {
  const { doc, setLive, commit, openSub, setOriginal } = useEdit();
  const layer = useSelected();
  const [adj, setAdj] = useState<LayerAdjust>(layer?.adjust ?? ZERO_LAYER_ADJUST);
  const [sel, setSel] = useState<keyof LayerAdjust | null>(null);
  const [flash, setFlash] = useState(0);
  if (!layer) return null;
  const it = LAYER_ADJUST_ITEMS.find((i) => i.key === sel);
  const apply = (a: LayerAdjust) => { setAdj(a); setLive(updateLayer(doc, layer.id, (l) => ({ ...l, adjust: a }))); };
  return (
    <>
      <ControlRow onOriginal={setOriginal}>
        {it && <EditSeekBar style={{ marginLeft: 112, marginRight: 24 }} value={adj[it.key]} min={it.min} max={1} def={0} flashKey={flash} onChange={(v) => apply({ ...adj, [it.key]: v })} />}
      </ControlRow>
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: 186 }}>
        <FeatureList count={LAYER_ADJUST_ITEMS.length}>
          {LAYER_ADJUST_ITEMS.map((i) => (
            <FeatureButton key={i.key} icon={i.icon} label={i.label} selected={sel === i.key} modified={Math.abs(adj[i.key]) > 0.001} onClick={() => { setSel(i.key); setFlash((n) => n + 1); }} />
          ))}
        </FeatureList>
        <TitleBar title="Adjust" onClose={() => { setLive(null); openSub(null); }} onConfirm={() => { commit(updateLayer(doc, layer.id, (l) => ({ ...l, adjust: adj }))); openSub(null); }} />
      </div>
    </>
  );
}

/* ================================================================== layer Eraser page */

export function LayerEraserPage() {
  const { doc, setLive, commit, openSub, setOriginal, setTool, frame, rect } = useEdit();
  const layer = useSelected();
  const [entry] = useState(layer?.erase ?? []);
  const [tool, setEraseTool] = useState<"eraser" | "restore">("eraser");
  const [size, setSize] = useState(0.5);
  const [hist, setHist] = useState<{ list: Stroke[]; i: number }>({ list: entry, i: entry.length });
  const stateRef = useRef({ tool, size, hist });
  useEffect(() => { stateRef.current = { tool, size, hist }; });
  const cur = useRef<Stroke | null>(null);
  const layerRef = useRef(layer);
  useEffect(() => { layerRef.current = layer; });

  const withErase = (list: Stroke[]) => (layer ? updateLayer(doc, layer.id, (l) => ({ ...l, erase: list })) : doc);

  useEffect(() => {
    const toLocal = (x: number, y: number) => {
      const l = layerRef.current!;
      const fw = frame.fw, fh = frame.fh, w = l.s * fw, h = w / l.aspect;
      const dx = x * fw - l.x * fw, dy = y * fh - l.y * fh;
      const c = Math.cos(-l.rot), s = Math.sin(-l.rot);
      let u = dx * c - dy * s;
      const v = dx * s + dy * c;
      if (l.flip) u = -u;
      return [u / w + 0.5, v / h + 0.5];
    };
    setTool({
      down: (x, y) => {
        const l = layerRef.current;
        if (!l) return;
        const st = stateRef.current;
        const [u, v] = toLocal(x, y);
        const viewW = rect.w + rect.x * 2;
        cur.current = { pts: [u, v], size: lerp(0.0015, 0.15, st.size) * (viewW / 2) / (l.s * rect.w) * 2, color: "#000", kind: st.tool };
        setLive(updateLayer(doc, l.id, (q) => ({ ...q, erase: [...st.hist.list.slice(0, st.hist.i), cur.current!] })));
      },
      move: (x, y) => {
        const c = cur.current, l = layerRef.current;
        if (!c || !l) return;
        const [u, v] = toLocal(x, y);
        c.pts.push(u, v);
        const st = stateRef.current;
        setLive(updateLayer(doc, l.id, (q) => ({ ...q, erase: [...st.hist.list.slice(0, st.hist.i), { ...c, pts: [...c.pts] }] })));
      },
      up: () => {
        const c = cur.current;
        if (!c) return;
        cur.current = null;
        const st = stateRef.current;
        const list = [...st.hist.list.slice(0, st.hist.i), c];
        setHist({ list, i: list.length });
      },
    });
    return () => setTool(null);
  }, [doc, frame, rect, setLive, setTool]);

  if (!layer) return null;
  const step = (dir: -1 | 1) => {
    const i = Math.max(0, Math.min(hist.list.length, hist.i + dir));
    setHist({ ...hist, i });
    setLive(withErase(hist.list.slice(0, i)));
  };
  const touched = hist.list.length > entry.length || hist.i !== entry.length;
  return (
    <>
      <ControlRow bottom={186 + 54} undo={touched ? { can: hist.i > 0, on: () => step(-1) } : undefined} redo={touched ? { can: hist.i < hist.list.length, on: () => step(1) } : undefined} onOriginal={setOriginal} hideOriginal={!touched} />
      <div className="absolute inset-x-0 flex items-center" style={{ bottom: 186, height: 54, background: "rgba(0,0,0,0.37)" }}>
        <span className="text-white" style={{ marginLeft: 20, fontSize: 13 }}>Size</span>
        <EditSeekBar style={{ marginLeft: 24, marginRight: 52 }} value={size} min={0.01} max={1} def={0.5} onChange={setSize} />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: 186 }}>
        <div className="absolute inset-x-0 flex justify-center" style={{ top: 36, gap: 52 }}>
          <FeatureButton icon="icon_edit_tab_eraser" label="Eraser" selected={tool === "eraser"} onClick={() => setEraseTool("eraser")} />
          <FeatureButton icon="icon_edit_tab_brush" label="Restore" selected={tool === "restore"} onClick={() => setEraseTool("restore")} />
          <FeatureButton icon="icon_edit_tab_reset" label="Reset" onClick={() => { setHist({ list: [], i: 0 }); setLive(withErase([])); }} />
        </div>
        <TitleBar
          title="Eraser"
          onClose={() => { setLive(null); openSub(null); }}
          onConfirm={() => { commit(withErase(hist.list.slice(0, hist.i))); openSub(null); }}
        />
      </div>
    </>
  );
}
