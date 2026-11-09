"use client";

// Overlay layers: the Stickers, Text and Draw tabs, their add pages, the per-layer Adjust and Erase pages, the
// on-photo handles (move, scale, rotate) and the layer list that opens from the top bar.
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, Tabs, cx } from "@/components/ui";
import { useEdit } from "../ctx";
import {
  BLENDS, BRUSH_COLORS, DEFAULT_TEXT_STYLE, LAYER_ADJUST_ITEMS, TEXT_COLORS, ZERO_LAYER_ADJUST,
  type Doc, type Layer, type LayerAdjust, type Stroke, type TextStyle,
} from "../model";
import { drawStrokes, FONTS, loadBrushTextures, rasterLayer, textCanvas } from "../pipeline";
import { markStampShopTooltipShown, StampShop, StampShopBalloon, stampShopTooltipPending } from "./StampShop";
import { addedPacks, STAMP_PACKS } from "../stamps";
import {
  AlertDialog, ChipRow, ColorChip, ControlRow, Dock, EditBar, EditSeekBar, FeatureButton, FeatureList, MENU, PanelArea,
  SliderRow, SwatchTool, ToolChip, TOP_H,
} from "../ui";

type Kind = Layer["kind"];
const ADD_SUB = { stamp: "stamp-add", text: "text-add", brush: "brush-add" } as const;
const TAB_OF = { stamp: "STAMP", text: "TEXT", brush: "BRUSH" } as const;
const KIND_LABEL = { stamp: "Sticker", text: "Text", brush: "Drawing" } as const;

const updateLayer = (doc: Doc, id: number, fn: (l: Layer) => Layer): Doc => ({ ...doc, layers: doc.layers.map((l) => (l.id === id ? fn(l) : l)) });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sampleHex = (src: HTMLCanvasElement, x: number, y: number) => {
  const c = document.createElement("canvas"); c.width = 1; c.height = 1;
  const g = c.getContext("2d")!;
  g.drawImage(src, Math.max(0, Math.min(src.width - 1, x * src.width)), Math.max(0, Math.min(src.height - 1, y * src.height)), 1, 1, 0, 0, 1, 1);
  const p = g.getImageData(0, 0, 1, 1).data;
  return `#${[p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
};

/** Selected layer of the given kind. */
function useSelected(kind?: Kind) {
  const { doc, selected } = useEdit();
  const l = doc.layers.find((x) => x.id === selected);
  return l && (!kind || l.kind === kind) ? l : undefined;
}

/** Kind of the add page that was just closed (read by the tab panel that remounts right after it). */
let addPageClosed: Kind | null = null;
/** Marks the add page of `kind` as closed when it unmounts (set in cleanup, cleared on (re)mount for StrictMode). */
function useAddPageExit(kind: Kind) {
  useEffect(() => {
    addPageClosed = null;
    return () => { addPageClosed = kind; };
  }, [kind]);
}

/* ================================================================== tab panel */

export function LayerPanel({ kind }: { kind: Kind }) {
  const ctx = useEdit();
  const { doc, setLive, commit, undo, setOriginal, openSub, select, nextId } = ctx;
  const layer = useSelected(kind);
  const [option, setOption] = useState<"opacity" | "blend" | null>(null);

  // With nothing to edit, entering the tab goes straight to its add page; not when that page was just closed
  // (the panel remounts then, and reopening it would trap the user).
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

  const items: { id: string; label: string; icon: Parameters<typeof FeatureButton>[0]["icon"] }[] = [
    { id: "add", label: kind === "stamp" ? "Add" : kind === "text" ? "New text" : "New drawing", icon: "plus" },
    ...(kind === "text" ? [{ id: "edit", label: "Edit", icon: "pencil" as const }] : []),
    { id: "opacity", label: "Opacity", icon: "droplet" },
    { id: "blend", label: "Blend", icon: "filter" },
    { id: "eraser", label: "Erase", icon: "remove" },
    { id: "adjust", label: "Adjust", icon: "edit" },
    { id: "mirror", label: "Mirror", icon: "flip-h" },
    { id: "duplicate", label: "Duplicate", icon: "copy" },
    { id: "reset", label: "Reset", icon: "reset" },
    { id: "delete", label: "Delete", icon: "trash" },
  ];

  const act = (id: string) => {
    if (id === "add") { setOption(null); openSub(ADD_SUB[kind]); return; }
    if (!layer) { ctx.toast(`Tap a ${KIND_LABEL[kind].toLowerCase()} on the photo first`); return; }
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

  const optH = option && layer ? 60 : 0;
  return (
    <>
      <ControlRow bottom={MENU + optH} undo={undo} onOriginal={setOriginal} />
      {option === "opacity" && layer && (
        <div className="absolute inset-x-3 z-20 flex h-[52px] items-center rounded-lg bg-panel/90 shadow-lg ring-1 ring-line backdrop-blur-md" style={{ bottom: MENU + 8 }}>
          <SliderRow label="Opacity" value={Math.round(layer.opacity * 100)} className="flex-1 px-3">
            <EditSeekBar
              value={layer.opacity} min={0} max={1} def={1} level={false}
              onChange={(v) => setLive(updateLayer(doc, layer.id, (l) => ({ ...l, opacity: v })))}
              onRelease={(v) => commit(updateLayer(doc, layer.id, (l) => ({ ...l, opacity: v })))}
            />
          </SliderRow>
        </div>
      )}
      {option === "blend" && layer && (
        <div className="absolute inset-x-3 z-20 flex h-[52px] items-center rounded-lg bg-panel/90 shadow-lg ring-1 ring-line backdrop-blur-md" style={{ bottom: MENU + 8 }}>
          <ChipRow className="px-2">
            {BLENDS.map((b) => <ToolChip key={b.id} label={b.label} selected={layer.blend === b.id} onClick={() => commit(updateLayer(doc, layer.id, (l) => ({ ...l, blend: b.id })))} />)}
          </ChipRow>
        </div>
      )}
      <PanelArea>
        <FeatureList>
          {items.map((it) => (
            <FeatureButton
              key={it.id} icon={it.icon} label={it.label}
              disabled={it.id !== "add" && !layer}
              selected={option === it.id}
              onClick={() => act(it.id)}
            />
          ))}
        </FeatureList>
      </PanelArea>
    </>
  );
}

/* ================================================================== on-photo handles */

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

  const cx0 = rect.x + layer.x * rect.w, cy0 = rect.y + layer.y * rect.h;
  const w = layer.s * rect.w, h = w / layer.aspect;

  const startHandle = (e: React.PointerEvent, rotate: boolean) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const root = (e.currentTarget as HTMLElement).closest("[data-editor]")!.getBoundingClientRect();
    const ccx = root.left + cx0, ccy = root.top + cy0;
    handle.current = { cx: ccx, cy: ccy, v0: { x: e.clientX - ccx, y: e.clientY - ccy }, s0: layer.s, r0: layer.rot, rotate };
  };
  const moveHandle = (e: React.PointerEvent) => {
    const hd = handle.current;
    if (!hd) return;
    const v = { x: e.clientX - hd.cx, y: e.clientY - hd.cy };
    const k = Math.hypot(v.x, v.y) / Math.max(1, Math.hypot(hd.v0.x, hd.v0.y));
    const da = Math.atan2(v.y, v.x) - Math.atan2(hd.v0.y, hd.v0.x);
    let r = hd.rotate ? hd.r0 + da : hd.r0;
    // snap to 0 / 90 / 180 / 270 degrees
    const snap = Math.round(r / (Math.PI / 2)) * (Math.PI / 2);
    if (hd.rotate && Math.abs(r - snap) < 0.05) r = snap;
    setLive(updateLayer(docRef.current, layer.id, (l) => ({ ...l, s: Math.max(0.03, Math.min(4, hd.s0 * k)), rot: r })));
  };
  const endHandle = () => { if (handle.current) { handle.current = null; commit(docRef.current); } };
  const hp = { onPointerMove: moveHandle, onPointerUp: endHandle, onPointerCancel: endHandle };

  return (
    <div className="pointer-events-none absolute z-10" style={{ left: cx0 - w / 2, top: cy0 - h / 2, width: w, height: h, transform: `rotate(${layer.rot}rad)` }}>
      <div className="absolute inset-0 rounded-[2px] ring-[1.5px] ring-accent" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.25)" }} />
      {([[-1, -1], [1, -1], [-1, 1]] as const).map(([sx, sy]) => (
        <span
          key={`${sx}${sy}`} aria-label="Resize"
          className="pointer-events-auto absolute flex h-7 w-7 items-center justify-center"
          style={{ left: w / 2 + (sx * w) / 2 - 14, top: h / 2 + (sy * h) / 2 - 14, touchAction: "none" }}
          onPointerDown={(e) => startHandle(e, false)} {...hp}
        >
          <span className="h-3.5 w-3.5 rounded-full bg-white shadow ring-2 ring-accent" />
        </span>
      ))}
      <span
        aria-label="Rotate and resize"
        className="pointer-events-auto absolute flex h-9 w-9 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg"
        style={{ left: w - 18, top: h - 18, touchAction: "none" }}
        onPointerDown={(e) => startHandle(e, true)} {...hp}
      >
        <Icon name="rotate-right" size={18} stroke={2.2} />
      </span>
      {layer.kind === "text" && sub !== "text-edit" && sub !== "text-add" && (
        <button
          type="button"
          onClick={() => openSub("text-edit")}
          className="oe-press pointer-events-auto absolute flex h-8 items-center gap-1 rounded-full bg-fg px-3 text-[12px] font-semibold text-bg shadow-lg"
          style={{ left: w / 2, top: h + 12, transform: "translateX(-50%)" }}
        >
          <Icon name="pencil" size={13} /> Edit
        </button>
      )}
    </div>
  );
}

/* ================================================================== layer list */

function LayerThumb({ l }: { l: Layer }) {
  const url = useMemo(() => {
    const c = rasterLayer({ ...l, opacity: 1 }, 96);
    return c ? c.toDataURL() : "";
  }, [l]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="h-9 w-9 object-contain" /> : null;
}

const ROW = 56;

export function LayerListPopup({ onClose }: { onClose: () => void }) {
  const { doc, commit, setTab, select, originalUrl, bases, frame } = useEdit();
  const [confirm, setConfirm] = useState(false);
  const front = [...doc.layers].reverse();
  const drag = useRef<{ id: number; y0: number; idx: number } | null>(null);
  const [dragDy, setDragDy] = useState<{ id: number; dy: number } | null>(null);

  const merge = () => {
    const base = bases.current[doc.base];
    const out = document.createElement("canvas");
    out.width = base.width; out.height = base.height;
    const g = out.getContext("2d")!;
    g.drawImage(base, 0, 0);
    // layers are positioned in frame space; map the frame onto the base (ignoring the frame padding)
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
      <div className="absolute inset-0 z-[45]" onClick={onClose} />
      <div className="absolute right-2 z-[46] w-[248px] overflow-hidden rounded-lg bg-panel shadow-2xl ring-1 ring-line" style={{ top: TOP_H + 4, animation: "oe-pop 160ms var(--oe-ease)", transformOrigin: "top right" }}>
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <span className="flex-1 font-display text-[15px] font-semibold">Layers</span>
          <Button size="sm" variant="secondary" icon="merge" onClick={() => setConfirm(true)}>Merge all</Button>
        </div>
        <div className="no-scrollbar overflow-y-auto pb-2" style={{ maxHeight: ROW * 5.5 }}>
          {front.map((l, i) => (
            <div
              key={l.id}
              className="relative flex cursor-pointer items-center gap-3 bg-panel px-3 active:bg-raised"
              style={{ height: ROW, transform: dragDy?.id === l.id ? `translateY(${dragDy.dy}px)` : undefined, zIndex: dragDy?.id === l.id ? 1 : 0 }}
              onClick={() => { select(l.id); setTab(TAB_OF[l.kind]); select(l.id); onClose(); }}
            >
              <span className={cx("flex h-11 w-11 flex-none items-center justify-center rounded-sm bg-raised", l.hidden && "opacity-40")}><LayerThumb l={l} /></span>
              <span className={cx("min-w-0 flex-1 truncate text-[13px]", l.hidden ? "text-fg-3" : "text-fg")}>
                {l.kind === "text" ? l.style.text.split("\n")[0] || "Text" : KIND_LABEL[l.kind]}
              </span>
              <button type="button" aria-label={l.hidden ? "Show" : "Hide"} className="flex h-8 w-8 items-center justify-center text-fg-2" onClick={(e) => { e.stopPropagation(); commit(updateLayer(doc, l.id, (x) => ({ ...x, hidden: !x.hidden }))); }}>
                <Icon name={l.hidden ? "eye-off" : "eye"} size={18} />
              </button>
              <button type="button" aria-label="Delete layer" className="flex h-8 w-8 items-center justify-center text-fg-2" onClick={(e) => { e.stopPropagation(); commit({ ...doc, layers: doc.layers.filter((x) => x.id !== l.id) }); }}>
                <Icon name="trash" size={17} />
              </button>
              <div
                aria-label="Drag to reorder"
                className="flex h-full w-6 items-center justify-center text-fg-3"
                style={{ touchAction: "none" }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: l.id, y0: e.clientY, idx: i }; setDragDy({ id: l.id, dy: 0 }); }}
                onPointerMove={(e) => { if (drag.current) setDragDy({ id: l.id, dy: e.clientY - drag.current.y0 }); }}
                onPointerUp={(e) => {
                  const dg = drag.current; drag.current = null; setDragDy(null);
                  if (!dg) return;
                  const to = Math.max(0, Math.min(front.length - 1, dg.idx + Math.round((e.clientY - dg.y0) / ROW)));
                  if (to === dg.idx) return;
                  const f = [...front]; const [m] = f.splice(dg.idx, 1); f.splice(to, 0, m);
                  commit({ ...doc, layers: f.reverse() });
                }}
              >
                <Icon name="grip" size={18} />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 border-t border-line px-3" style={{ height: ROW }}>
            <span className="h-11 w-11 flex-none overflow-hidden rounded-sm bg-raised">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {originalUrl && <img src={originalUrl} alt="" className="h-full w-full object-cover" />}
            </span>
            <span className="flex-1 text-[13px] text-fg-3">Photo</span>
            <Icon name="lock" size={16} className="mr-1 text-fg-3" />
          </div>
        </div>
      </div>
      {confirm && (
        <AlertDialog
          icon="merge" title="Merge all layers?"
          message="Stickers, text and drawings become part of the photo. This can be undone, but the layers can't be edited separately again."
          ok="Merge" onCancel={() => setConfirm(false)} onOk={() => { setConfirm(false); merge(); }}
        />
      )}
    </>
  );
}

/* ================================================================== Stickers: picker */

const MY_KEY = "oe:edit:myStickers";
const RECENT_KEY = "oe:edit:recentStickers";
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

const STAMP_SHEET_H = 340;

export function StampAddPage() {
  const { doc, commit, openSub, select, nextId, toast, rect } = useEdit();
  useAddPageExit("stamp");
  const [packs, setPacks] = useState<string[]>(addedPacks);
  const [cat, setCat] = useState<string>(() => (readList(RECENT_KEY).length ? "recent" : addedPacks()[0] ?? "mine"));
  const [recent, setRecent] = useState<string[]>(() => readList(RECENT_KEY));
  const [mine, setMine] = useState<string[]>(() => readList(MY_KEY));
  const [manage, setManage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shop, setShop] = useState(false);
  const [balloon, setBalloon] = useState(stampShopTooltipPending);
  const shopBtn = useRef<HTMLButtonElement>(null);
  const openShop = () => { markStampShopTooltipShown(); setBalloon(false); setShop(true); };

  const add = (src: string) => {
    const img = new Image();
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight || 1;
      const id = nextId();
      // about 40% of the shorter displayed side, centred
      const s = Math.min(0.4, (Math.min(rect.w, rect.h) * 0.4) / rect.w);
      commit({ ...doc, layers: [...doc.layers, { id, kind: "stamp", src, aspect, x: 0.5, y: 0.5, s, rot: 0, flip: false, opacity: 1, blend: "normal", hidden: false, adjust: ZERO_LAYER_ADJUST, erase: [] }] });
      select(id);
      const r = [src, ...recent.filter((x) => x !== src)].slice(0, 20);
      setRecent(r); writeList(RECENT_KEY, r);
    };
    img.src = src;
  };
  const remove = (src: string) => {
    const m = mine.filter((x) => x !== src); setMine(m); writeList(MY_KEY, m);
    const r = recent.filter((x) => x !== src); setRecent(r); writeList(RECENT_KEY, r);
  };

  const grid = (list: string[], removable = false) => (
    <div className="grid grid-cols-5 gap-2 px-4 pb-4">
      {list.map((src, i) => (
        <button
          key={`${i}:${src.length}:${src.slice(-24)}`} type="button" onClick={() => (removable && manage ? remove(src) : add(src))}
          className="oe-press relative flex aspect-square items-center justify-center rounded-md bg-raised p-1.5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="h-full w-full object-contain" draggable={false} />
          {removable && manage && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow"><Icon name="close" size={12} stroke={2.6} /></span>}
        </button>
      ))}
    </div>
  );
  const tabs = [
    { id: "recent", label: "Recent" },
    ...STAMP_PACKS.filter((p) => packs.includes(p.id)).map((p) => ({ id: p.id, label: p.name })),
    { id: "mine", label: "My stickers" },
  ];
  const pack = STAMP_PACKS.find((p) => p.id === cat);

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
          } catch { toast("That picture couldn't be opened."); }
        }}
      />
      <EditBar title="Stickers" onConfirm={() => openSub(null)} applyLabel="Done" />
      <Dock height={STAMP_SHEET_H} className="flex flex-col">
        <div className="flex flex-none items-center gap-2 pl-3 pt-3">
          <button ref={shopBtn} type="button" onClick={openShop} aria-label="Sticker library" className="oe-press flex h-9 flex-none items-center gap-1.5 rounded-full bg-accent-soft px-3 text-[13px] font-semibold text-accent">
            <Icon name="library" size={16} /> Library
          </button>
          <ChipRow className="pl-1 pr-3">
            {tabs.map((t) => <ToolChip key={t.id} label={t.label} selected={cat === t.id} onClick={() => { setCat(t.id); setManage(false); }} />)}
          </ChipRow>
        </div>
        <div className="no-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto">
          {cat === "recent" && (recent.length ? grid(recent) : (
            <p className="flex h-full items-center justify-center px-10 text-center text-[13px] leading-snug text-fg-3">Stickers you use show up here. Pick a pack above to start.</p>
          ))}
          {pack && grid(pack.stamps)}
          {cat === "mine" && (
            <>
              <div className="flex gap-2 px-4 pb-3">
                <Button size="sm" variant="secondary" icon="image-plus" className="min-w-0 flex-1" onClick={() => fileRef.current?.click()}>From a picture</Button>
                {mine.length > 0 && <Button size="sm" variant={manage ? "primary" : "ghost"} icon={manage ? "check" : "trash"} onClick={() => setManage((v) => !v)}>{manage ? "Done" : "Remove"}</Button>}
              </div>
              {mine.length ? grid(mine, true) : <p className="px-10 pt-4 text-center text-[13px] leading-snug text-fg-3">Turn any picture into a sticker. Transparent PNGs work best.</p>}
            </>
          )}
        </div>
      </Dock>
      <div className="pointer-events-none absolute inset-0 z-30">
        {balloon && !shop && <div className="pointer-events-auto"><StampShopBalloon anchor={shopBtn} onClick={openShop} /></div>}
      </div>
      {shop && <StampShop onClose={() => setShop(false)} onChange={(ids) => { setPacks(ids); if (!ids.includes(cat) && STAMP_PACKS.some((p) => p.id === cat)) setCat(ids[0] ?? "recent"); }} />}
    </>
  );
}

/* ================================================================== Text: typing overlay + text page */

function TextInput({ initial, onCancel, onDone }: { initial: string; onCancel: () => void; onDone: (t: string) => void }) {
  const { toast } = useEdit();
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="absolute inset-0 z-50 bg-bg/70 backdrop-blur-xl" style={{ animation: "oe-fade-in 160ms" }}>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3" style={{ height: TOP_H }}>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="rounded-full px-4" onClick={() => (text.trim() ? onDone(text) : toast("Type something first"))}>Done</Button>
      </div>
      <div className="absolute inset-x-0 flex items-center justify-center px-6" style={{ top: TOP_H, bottom: 240 }}>
        <textarea
          ref={ref} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your text" rows={Math.min(6, text.split("\n").length)}
          className="w-full resize-none bg-transparent text-center font-display text-[28px] font-semibold leading-tight text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none"
          style={{ caretColor: "var(--oe-accent)" }}
        />
      </div>
    </div>
  );
}

type StyleCat = "text" | "stroke" | "shadow" | "bg" | "align" | "spacing";
const STYLE_CATS: { id: StyleCat; label: string }[] = [
  { id: "text", label: "Colour" }, { id: "stroke", label: "Outline" }, { id: "shadow", label: "Shadow" },
  { id: "bg", label: "Label" }, { id: "align", label: "Align" }, { id: "spacing", label: "Spacing" },
];
const TEXT_SHEET_H = 270;

/** Colour row with a "none" option (outline, shadow, label). */
function ColorCells({ colors, value, none, onPick }: { colors: string[]; value: string | null; none: boolean; onPick: (c: string | null) => void }) {
  return (
    <>
      {none && (
        <button type="button" aria-label="None" aria-pressed={value === null} onClick={() => onPick(null)}
          className={cx("oe-press flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full", value === null ? "bg-fg text-bg" : "bg-raised text-fg-2")}>
          <Icon name="block" size={16} />
        </button>
      )}
      {colors.map((c) => <ColorChip key={c} color={c} selected={c === value} onClick={() => onPick(c)} />)}
    </>
  );
}

export function TextAddPage({ mode }: { mode: "add" | "edit" }) {
  const { doc, setLive, commit, openSub, select, nextId, rect, selected, setTool, photoCanvas } = useEdit();
  useAddPageExit("text");
  const existing = doc.layers.find((l) => l.id === selected && l.kind === "text") as Extract<Layer, { kind: "text" }> | undefined;
  const [input, setInput] = useState(mode === "add" || !existing);
  const [layerId, setLayerId] = useState<number | null>(mode === "edit" && existing ? existing.id : null);
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

  // tap the text on the photo to retype it; the eyedropper samples the photo
  useEffect(() => {
    if (input) return;
    setTool({
      down: (x, y) => {
        if (picking) {
          const src = photoCanvas();
          if (!src) return;
          const hex = sampleHex(src, x, y);
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
      <EditBar title="Text" onClose={() => { setLive(null); openSub(null); }} onConfirm={confirm} />
      <Dock height={TEXT_SHEET_H} className="flex flex-col gap-3 pt-4">
        <div className="no-scrollbar flex flex-none gap-2 overflow-x-auto px-4">
          {FONTS.map((f) => (
            <button
              key={f.id} type="button" onClick={() => setStyle({ font: f.id })} aria-pressed={st.font === f.id}
              className={cx("oe-press flex h-11 min-w-[84px] flex-none items-center justify-center whitespace-nowrap rounded-md px-3 text-[15px] transition-colors", st.font === f.id ? "bg-fg text-bg" : "bg-raised text-fg")}
              style={{ fontFamily: f.css }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <ChipRow className="flex-none">
          {STYLE_CATS.map((c) => <ToolChip key={c.id} label={c.label} selected={cat === c.id} onClick={() => setCat(c.id)} />)}
        </ChipRow>
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 pb-3">
          {(cat === "text" || cat === "stroke" || cat === "shadow" || cat === "bg") && (
            <>
              <div className="no-scrollbar flex items-center gap-3 overflow-x-auto px-4 py-1">
                <SwatchTool icon="pipette" label="Pick from the photo" active={picking} onClick={() => setPicking((v) => !v)} />
                <ColorCells colors={TEXT_COLORS} none={cat !== "text"} value={st[colorKey] as string | null} onPick={(c) => setStyle({ [colorKey]: c } as Partial<TextStyle>)} />
              </div>
              <SliderRow label={cat === "stroke" ? "Thickness" : "Opacity"} value={st[colorKey] === null ? "–" : Math.round((st[valueKey] as number) * 100)}>
                <EditSeekBar value={st[valueKey] as number} min={0} max={1} def={defV} level={false} disabled={st[colorKey] === null} onChange={(v) => setStyle({ [valueKey]: v } as Partial<TextStyle>)} />
              </SliderRow>
            </>
          )}
          {cat === "align" && (
            <div className="flex justify-center px-4">
              <Tabs
                look="segment" className="w-[260px]"
                items={[{ id: "left", label: <Icon name="align-left" size={18} label="Left" /> }, { id: "center", label: <Icon name="align-center" size={18} label="Centre" /> }, { id: "right", label: <Icon name="align-right" size={18} label="Right" /> }]}
                value={st.align} onChange={(a) => setStyle({ align: a })}
              />
            </div>
          )}
          {cat === "spacing" && (
            <>
              <SliderRow label="Letters" value={Math.round(st.letter * 100)}><EditSeekBar value={st.letter} min={0} max={1} def={0} level={false} onChange={(v) => setStyle({ letter: v })} /></SliderRow>
              <SliderRow label="Lines" value={Math.round(st.line * 100)}><EditSeekBar value={st.line} min={0} max={1} def={0} level={false} onChange={(v) => setStyle({ line: v })} /></SliderRow>
            </>
          )}
        </div>
      </Dock>
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

/* ================================================================== Draw: new drawing page */

/** Brush catalogue: the pack's brush tips with spacing, size range and how strokes combine. */
interface LocalBrush {
  id: string; name: string; type: "COLOR" | "HIGHLIGHTER" | "OUTLINE" | "STAMP"; min: number; max: number;
  colorPickerUse: boolean; defaultStrength: number; tex: string; outline?: string; interval: number; rot: boolean; inner?: string;
}
const COLOR_RANGE = { min: 0.0015, max: 0.15 };
const BRUSHES: LocalBrush[] = [
  { id: "pen", name: "Pen", type: "COLOR", ...COLOR_RANGE, colorPickerUse: true, defaultStrength: 20, tex: "round", interval: 0.05, rot: false },
  { id: "marker", name: "Marker", type: "COLOR", ...COLOR_RANGE, colorPickerUse: true, defaultStrength: 30, tex: "marker", interval: 0.04, rot: true },
  { id: "softmarker", name: "Felt tip", type: "COLOR", ...COLOR_RANGE, colorPickerUse: true, defaultStrength: 30, tex: "marker-soft", interval: 0.04, rot: true },
  { id: "highlighter", name: "Highlight", type: "HIGHLIGHTER", ...COLOR_RANGE, colorPickerUse: true, defaultStrength: 40, tex: "marker", interval: 0.04, rot: true },
  { id: "airbrush", name: "Spray", type: "COLOR", ...COLOR_RANGE, colorPickerUse: true, defaultStrength: 40, tex: "spray", interval: 0.06, rot: false },
  { id: "soft", name: "Soft", type: "COLOR", ...COLOR_RANGE, colorPickerUse: true, defaultStrength: 30, tex: "soft", interval: 0.06, rot: false },
  { id: "neon", name: "Neon", type: "OUTLINE", min: 0.01635, max: 0.3, colorPickerUse: true, defaultStrength: 20, tex: "round", outline: "neon", inner: "#FFFFFF", interval: 0.05, rot: false },
  { id: "dash", name: "Dashes", type: "STAMP", min: 0.0025, max: 0.5, colorPickerUse: true, defaultStrength: 12, tex: "dashed", interval: 0.55, rot: true },
];
const THUMB_COLOR: Partial<Record<LocalBrush["type"], string>> = { HIGHLIGHTER: "#FFC83D", OUTLINE: "#4CC9F0" };
const strokeOf = (b: LocalBrush, pts: number[], size: number, color: string): Stroke => ({
  pts, size, color, kind: b.type === "HIGHLIGHTER" ? "highlighter" : b.type === "OUTLINE" ? "outline" : "pen",
  tex: b.tex, outline: b.outline, inner: b.inner, interval: b.interval, rot: b.rot,
});

/** Brush previews: a sample squiggle drawn with each brush. */
function useBrushThumbs() {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void loadBrushTextures().then(() => {
      if (!alive) return;
      const out: Record<string, string> = {};
      const pts: number[] = [];
      for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push(0.16 + 0.68 * t, 0.55 - 0.22 * Math.sin(t * Math.PI * 1.6)); }
      for (const b of BRUSHES) {
        const c = document.createElement("canvas"); c.width = c.height = 128;
        const g = c.getContext("2d")!;
        g.fillStyle = "#1F2229"; g.fillRect(0, 0, 128, 128);
        const size = b.type === "OUTLINE" ? 0.07 : b.type === "STAMP" ? 0.4 : 0.1;
        drawStrokes(g, [strokeOf(b, pts, size, THUMB_COLOR[b.type] ?? "#FFFFFF")], 128, 128);
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
          if (src) { const hex = sampleHex(src, x, y); setCustom(hex); setColor(hex); }
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
  const showColors = brush.colorPickerUse && mode === "brush";

  return (
    <>
      <input ref={paletteRef} type="color" hidden defaultValue="#ffffff" onChange={(e) => { const c = e.currentTarget.value.toUpperCase(); setCustom(c); setColor(c); }} />
      <ControlRow bottom={MENU + (showColors ? 60 : 0)} undo={{ can: strokes.i > 0, on: () => stepStroke(-1) }} redo={{ can: strokes.i < strokes.list.length, on: () => stepStroke(1) }} onOriginal={setOriginal} />
      {showColors && (
        <div className="no-scrollbar absolute inset-x-3 z-20 flex h-[52px] items-center gap-3 overflow-x-auto rounded-lg bg-panel/90 px-3 shadow-lg ring-1 ring-line backdrop-blur-md" style={{ bottom: MENU + 8 }}>
          <SwatchTool icon="pipette" label="Pick from the photo" active={picking} onClick={() => setPicking((v) => !v)} />
          <SwatchTool icon="palette" label="Colour wheel" onClick={() => paletteRef.current?.click()} />
          {custom && <ColorChip color={custom} selected={color === custom} onClick={() => setColor(custom)} />}
          {BRUSH_COLORS.map((c) => <ColorChip key={c} color={c} selected={color === c && c !== custom} onClick={() => setColor(c)} />)}
        </div>
      )}
      <EditBar
        title="Draw"
        onClose={() => { setLive(null); openSub(null); }}
        onConfirm={() => { if (visible.length) { commit(build(visible)); select(layerId); } else setLive(null); openSub(null); }}
      />
      <Dock className="flex flex-col justify-center gap-3">
        <div className="flex items-center gap-3 px-4">
          <Tabs look="segment" className="w-[150px] flex-none" items={[{ id: "brush", label: "Brush" }, { id: "eraser", label: "Eraser" }]} value={mode} onChange={setMode} />
          <span className="flex-none text-[12px] font-medium text-fg-3">Size</span>
          <EditSeekBar
            value={sizes[mode]} min={0.01} max={1} def={mode === "eraser" ? 0.3 : brush.defaultStrength / 100}
            onChange={(v) => setSizes((s) => ({ ...s, [mode]: v }))}
          />
        </div>
        <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4">
          {BRUSHES.map((b) => (
            <button
              key={b.id} type="button" aria-pressed={brush.id === b.id}
              onClick={() => { setBrush(b); setMode("brush"); setSizes((s) => ({ ...s, brush: b.defaultStrength / 100 })); }}
              className="oe-press flex w-[64px] flex-none flex-col items-center gap-1.5"
            >
              <span className={cx("block h-16 w-16 overflow-hidden rounded-md bg-raised", brush.id === b.id && mode === "brush" && "ring-2 ring-accent ring-offset-2 ring-offset-panel")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {thumbs[b.id] && <img src={thumbs[b.id]} alt="" draggable={false} className="h-full w-full" />}
              </span>
              <span className={cx("text-[11px] font-medium", brush.id === b.id ? "text-fg" : "text-fg-2")}>{b.name}</span>
            </button>
          ))}
        </div>
      </Dock>
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
        {it && <EditSeekBar value={adj[it.key]} min={it.min} max={1} def={0} flashKey={flash} onChange={(v) => apply({ ...adj, [it.key]: v })} />}
      </ControlRow>
      <EditBar title={`Adjust ${KIND_LABEL[layer.kind].toLowerCase()}`} onClose={() => { setLive(null); openSub(null); }} onConfirm={() => { commit(updateLayer(doc, layer.id, (l) => ({ ...l, adjust: adj }))); openSub(null); }} />
      <Dock>
        <FeatureList>
          {LAYER_ADJUST_ITEMS.map((i) => (
            <FeatureButton key={i.key} icon={i.icon} label={i.label} selected={sel === i.key} modified={Math.abs(adj[i.key]) > 0.001} onClick={() => { setSel(i.key); setFlash((n) => n + 1); }} />
          ))}
        </FeatureList>
      </Dock>
    </>
  );
}

/* ================================================================== layer Erase page */

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
      <ControlRow undo={touched ? { can: hist.i > 0, on: () => step(-1) } : undefined} redo={touched ? { can: hist.i < hist.list.length, on: () => step(1) } : undefined} onOriginal={setOriginal} hideOriginal={!touched} />
      <EditBar
        title={`Erase ${KIND_LABEL[layer.kind].toLowerCase()}`}
        onClose={() => { setLive(null); openSub(null); }}
        onConfirm={() => { commit(withErase(hist.list.slice(0, hist.i))); openSub(null); }}
      />
      <Dock className="flex flex-col justify-center gap-4">
        <div className="flex justify-center gap-2">
          <FeatureButton icon="remove" label="Erase" selected={tool === "eraser"} onClick={() => setEraseTool("eraser")} />
          <FeatureButton icon="brush" label="Restore" selected={tool === "restore"} onClick={() => setEraseTool("restore")} />
          <FeatureButton icon="reset" label="Start over" onClick={() => { setHist({ list: [], i: 0 }); setLive(withErase([])); }} />
        </div>
        <SliderRow label="Size" value={Math.round(size * 100)}>
          <EditSeekBar value={size} min={0.01} max={1} def={0.5} level={false} onChange={setSize} />
        </SliderRow>
      </Dock>
    </>
  );
}
