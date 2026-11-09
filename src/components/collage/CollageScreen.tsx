"use client";

// Collage maker: top bar (back · Save), the collage preview, and a dock with Layout / Stack / Border over a tab bar.
// Tapping a cell opens the photo page (replace, rotate, flip; drag or pinch to frame); holding a cell and dragging
// swaps it with another. The colour mixer opens from Border. Save renders a full-size JPEG into the gallery and shows
// the Saved page.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Icon, IconButton, Spinner, TOKENS, cx, toast } from "@/components/ui";
import { useBackHandler } from "@/lib/back";
import { getPhoto, isVideoPhoto, listPhotos, savePhoto } from "@/lib/store";
import { sampleCanvas } from "@/components/edit/devSample";
import { COMMON_COLORS, PACKS, borderEditable, defaultPack, templatesFor, type Pack, type Sel } from "./layouts";
import { aspectOf, coverScale, draw, hitCell, renderJpeg, XF0, type Pic, type Scene, type Xf } from "./render";
import { BorderPanel, FEATURE_H, FocusPanel, LayoutPanel, MENU_H, PageBar, PalettePanel, SequencePanel, type BorderItem } from "./panels";
import { CollageConfirm } from "./Confirm";

type Menu = "SEQUENCE" | "LAYOUT" | "BORDER";
type Depth = "NONE" | "FOCUS" | "COLOR_PALETTE";
interface BorderColor { type: "builtin" | "picker" | "palette"; color: string }

export interface CollageDev {
  n?: number; sample?: number; menu?: Menu; depth?: Depth; sel?: string; pack?: string; border?: number; color?: string;
  picker?: boolean; save?: boolean; share?: boolean; alert?: boolean;
}

const APPBAR = 52;
const BOTTOM = FEATURE_H + MENU_H;
const LONG_PRESS = 400;

const vibrate = () => { try { navigator.vibrate?.(20); } catch {} };

async function decode(blob: Blob): Promise<Pic> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  return { img: bmp, w: bmp.width, h: bmp.height };
}

export function CollageScreen({ ids, dev }: { ids: string[]; dev?: CollageDev }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 390, h: 844 });
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  /* ---------------------------------------------------------------- collage data */
  const [pics, setPics] = useState<Pic[] | null>(null);
  const [cellPhoto, setCellPhoto] = useState<number[]>([]);
  const [xf, setXf] = useState<Xf[]>([]);
  const [sel, setSel] = useState<Sel>({ kind: "none" });
  const [pack, setPack] = useState<Pack>(PACKS[0]);
  const [border, setBorder] = useState(0);
  const savedBorder = useRef(0);
  const [borderColor, setBorderColor] = useState<BorderColor>({ type: "builtin", color: "#ffffff" });
  const [pickerColor, setPickerColor] = useState<string | null>(null);
  const [paletteColor, setPaletteColor] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState(0);

  /* ---------------------------------------------------------------- page state */
  const [menu, setMenu] = useState<Menu>(dev?.menu ?? "LAYOUT");
  const [depth, setDepth] = useState<Depth>("NONE");
  const [focusCell, setFocusCell] = useState<number | null>(null);
  const focusSnap = useRef<{ xf: Xf[]; cellPhoto: number[]; pics: Pic[] } | null>(null);
  const [paletteLive, setPaletteLive] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number; color: string } | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [alert, setAlert] = useState(false);
  const [saved, setSaved] = useState<{ url: string; blob: Blob } | null>(null);
  const [swapTarget, setSwapTarget] = useState<number | null>(null);

  /* ---------------------------------------------------------------- load photos */
  useEffect(() => {
    let dead = false;
    (async () => {
      if (dev?.sample) {
        const n = Math.max(2, Math.min(9, dev.sample));
        const out = await Promise.all(Array.from({ length: n }, (_, i) => createImageBitmap(sampleCanvas(900, 1200 - (i % 3) * 250, i + 1)).then((img) => ({ img, w: img.width, h: img.height }))));
        if (dead) return;
        setPics(out); setCellPhoto(out.map((_, i) => i)); setXf(out.map(() => ({ ...XF0 })));
        const p0 = (dev.pack && PACKS.find((p) => p.id === dev.pack)) || defaultPack(out.length);
        setPack(p0);
        setSel(dev.sel === "height" || dev.sel === "width" ? { kind: dev.sel } : { kind: "layout", pack: p0.id, index: dev.sel && /^\d+$/.test(dev.sel) ? Math.min(+dev.sel, templatesFor(out.length).length - 1) : 0 });
        if (dev.border !== undefined) setBorder(dev.border);
        if (dev.color) setBorderColor({ type: "builtin", color: dev.color });
        setImageLoading(false);
        return;
      }
      let list = ids;
      if (!list.length && dev?.n) {
        const all = (await listPhotos()).filter((p) => !isVideoPhoto(p) && p.blob.type !== "image/gif");
        list = all.slice(0, dev.n).map((p) => p.id);
      }
      const out: Pic[] = [];
      for (const id of list.slice(0, 9)) {
        const p = await getPhoto(id).catch(() => undefined);
        if (!p || isVideoPhoto(p)) continue;
        try { out.push(await decode(p.blob)); } catch {}
      }
      if (dead) return;
      if (out.length < 1) { router.replace("/gallery"); return; } // nothing to lay out
      setPics(out);
      setCellPhoto(out.map((_, i) => i));
      setXf(out.map(() => ({ ...XF0 })));
      // default canvas (1:1 for 2/3/5/7/8 photos, else 3:4) and its first layout
      const p0 = (dev?.pack && PACKS.find((p) => p.id === dev.pack)) || defaultPack(out.length);
      setPack(p0);
      let s0: Sel = { kind: "layout", pack: p0.id, index: 0 };
      if (dev?.sel === "height" || dev?.sel === "width") s0 = { kind: dev.sel };
      else if (dev?.sel && /^\d+$/.test(dev.sel)) s0 = { kind: "layout", pack: p0.id, index: Math.min(+dev.sel, templatesFor(out.length).length - 1) };
      setSel(s0);
      if (dev?.border !== undefined) setBorder(dev.border);
      if (dev?.color) setBorderColor({ type: "builtin", color: dev.color });
      setImageLoading(false);
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = pics?.length ?? 0;
  const templates = useMemo(() => templatesFor(count), [count]);

  const scene: Scene = useMemo(() => ({
    sel,
    pics: pics ? cellPhoto.map((i) => pics[i]) : [],
    xf,
    border,
    color: paletteLive ?? borderColor.color,
  }), [sel, pics, cellPhoto, xf, border, paletteLive, borderColor]);

  /* ---------------------------------------------------------------- preview geometry */
  const region = { x: 12, y: APPBAR + 12, w: size.w - 24, h: Math.max(1, size.h - APPBAR - BOTTOM - 24) };
  const aspect = sel.kind === "none" ? 1 : aspectOf(scene);
  const fit = region.w / region.h > aspect ? { h: region.h, w: region.h * aspect } : { w: region.w, h: region.w / aspect };
  const view = { x: region.x + (region.w - fit.w) / 2, y: region.y + (region.h - fit.h) / 2, w: fit.w, h: fit.h };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellsRef = useRef<[number, number, number, number][]>([]);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !pics || sel.kind === "none") return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = Math.round(view.w * dpr), H = Math.round(view.h * dpr);
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    const ctx = c.getContext("2d")!;
    const hl = swapTarget ?? (depth === "FOCUS" ? focusCell : null);
    const cells = draw(ctx, scene, W, H, { selected: hl, lineWidth: 3 * dpr, highlight: TOKENS.color.accent });
    cellsRef.current = cells.map(([x, y, w, h]) => [x / dpr, y / dpr, w / dpr, h / dpr]);
  }, [scene, view.w, view.h, pics, sel.kind, depth, focusCell, swapTarget]);

  /* ---------------------------------------------------------------- data actions */
  const applySel = (s: Sel) => {
    // switching between a selection with a border and one without stashes or restores the width
    const same = JSON.stringify(sel) === JSON.stringify(s);
    if (!same && borderEditable(sel) !== borderEditable(s)) {
      if (borderEditable(s)) setBorder(savedBorder.current);
      else { savedBorder.current = border; setBorder(0); }
    }
    if (!same) setXf((x) => x.map(() => ({ ...XF0 })));
    setSel(s);
    setFlashKey((k) => k + 1);
  };

  const borderItems: BorderItem[] = useMemo(() => {
    const out: BorderItem[] = [{ kind: "tool", tool: "picker" }, { kind: "tool", tool: "palette" }];
    if (pickerColor) out.push({ kind: "color", type: "picker", color: pickerColor });
    if (paletteColor) out.push({ kind: "color", type: "palette", color: paletteColor });
    for (const c of COMMON_COLORS) out.push({ kind: "color", type: "builtin", color: c });
    return out;
  }, [pickerColor, paletteColor]);

  /* ---------------------------------------------------------------- colour picker */
  const sampleAt = useCallback((x: number, y: number) => {
    const c = canvasRef.current;
    if (!c) return "#000000";
    const lx = x - view.x, ly = y - view.y;
    if (lx < 0 || ly < 0 || lx >= view.w || ly >= view.h) return "#000000";
    const k = c.width / view.w;
    try {
      const d = c.getContext("2d")!.getImageData(Math.floor(lx * k), Math.floor(ly * k), 1, 1).data;
      return `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    } catch { return "#000000"; }
  }, [view.x, view.y, view.w, view.h]);
  const startPicker = useCallback(() => {
    const x = region.x + region.w / 2, y = region.y + region.h / 2;
    setPicker({ x, y, color: sampleAt(x, y) });
  }, [region.x, region.y, region.w, region.h, sampleAt]);
  const devPicker = useRef(false);
  useEffect(() => {
    if (!dev?.picker || devPicker.current || !pics || menu !== "BORDER") return;
    devPicker.current = true;
    const t = window.setTimeout(startPicker, 300);
    return () => window.clearTimeout(t);
  }, [dev?.picker, pics, menu, startPicker]);

  /* ---------------------------------------------------------------- photo page and colour mixer */
  const openFocus = useCallback((cell: number) => {
    if (depth !== "FOCUS") {
      focusSnap.current = { xf: xf.map((x) => ({ ...x })), cellPhoto: [...cellPhoto], pics: pics ? [...pics] : [] };
      setDepth("FOCUS");
    }
    setFocusCell(cell);
  }, [depth, xf, cellPhoto, pics]);
  const devDepth = useRef(false);
  useEffect(() => {
    if (devDepth.current || !pics || !dev?.depth) return;
    devDepth.current = true;
    const d = dev.depth;
    const t = window.setTimeout(() => { if (d === "FOCUS") openFocus(0); else setDepth(d); }, 0);
    return () => window.clearTimeout(t);
  }, [pics, dev?.depth, openFocus]);
  const focusCancel = useCallback(() => {
    const s = focusSnap.current;
    if (s) { setXf(s.xf); setCellPhoto(s.cellPhoto); setPics(s.pics); }
    focusSnap.current = null;
    setDepth("NONE"); setFocusCell(null);
  }, []);
  const focusConfirm = () => { focusSnap.current = null; setDepth("NONE"); setFocusCell(null); };
  const editFocused = (f: (x: Xf) => Xf) => {
    if (focusCell == null) return;
    setXf((all) => all.map((x, i) => (i === focusCell ? f(x) : x)));
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const onReplaceFile = async (file: File | undefined) => {
    if (!file || focusCell == null || !pics) return;
    setImageLoading(true);
    try {
      const p = await decode(file);
      const idx = pics.length;
      setPics([...pics, p]);
      setCellPhoto((cp) => cp.map((v, i) => (i === focusCell ? idx : v)));
      setXf((all) => all.map((x, i) => (i === focusCell ? { ...XF0 } : x)));
    } catch {}
    setImageLoading(false);
  };

  /* ---------------------------------------------------------------- back / save */
  const leave = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push("/gallery");
  }, [router]);
  const onBackPressed = useCallback(() => {
    if (saved) return; // the confirm page handles its own back
    if (depth === "COLOR_PALETTE") { setPaletteLive(null); setDepth("NONE"); return; }
    if (depth === "FOCUS") { focusCancel(); return; }
    if (picker) { setPicker(null); return; }
    setAlert(true);
  }, [saved, depth, picker, focusCancel]);
  // hardware back: the leave dialog, palette page and confirm page register their own handlers above this one
  useBackHandler(onBackPressed, !saved);

  const doSave = useCallback(async () => {
    if (saveLoading || !pics) return;
    setSaveLoading(true);
    try {
      const { blob, W, H } = await renderJpeg(scene);
      await savePhoto(blob, W, H);
      setSaved({ url: URL.createObjectURL(blob), blob });
    } catch {
      toast("Couldn't save the collage. Please try again.", { icon: "alert", tone: "danger" });
    }
    setSaveLoading(false);
  }, [saveLoading, pics, scene]);
  const onSave = () => {
    if (sel.kind === "none") { setAlert(true); return; } // nothing laid out yet: offer to leave
    void doSave();
  };
  const devSaved = useRef(false);
  useEffect(() => {
    if (!dev?.save || devSaved.current || !pics || sel.kind === "none") return;
    devSaved.current = true;
    const t = window.setTimeout(() => void doSave(), 300);
    return () => window.clearTimeout(t);
  }, [dev?.save, pics, sel.kind, doSave]);
  const devAlert = useRef(false);
  useEffect(() => {
    if (!dev?.alert || devAlert.current || !pics) return;
    devAlert.current = true;
    const t = window.setTimeout(() => setAlert(true), 0);
    return () => window.clearTimeout(t);
  }, [dev?.alert, pics]);

  /* ---------------------------------------------------------------- preview gestures: pan / pinch / rotate a cell, hold to swap */
  const gest = useRef<{
    pts: Map<number, { x: number; y: number }>; cell: number; t0: number; x0: number; y0: number;
    mode: "idle" | "pan" | "pinch" | "swap"; base: Xf; d0: number; a0: number; mx0: number; my0: number;
    lp?: number; snapT: boolean; snapR: boolean;
  } | null>(null);
  const local = (e: React.PointerEvent) => {
    const r = rootRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const twoPt = () => {
    const g = gest.current!;
    const [a, b] = [...g.pts.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y), ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  const onDown = (e: React.PointerEvent) => {
    if (!pics || sel.kind === "none") return;
    const p = local(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (picker) {
      const y = Math.min(p.y, region.y + region.h);
      setPicker({ x: p.x, y, color: sampleAt(p.x, y) });
      return;
    }
    const g = gest.current;
    if (!g) {
      const cell = hitCell(cellsRef.current, p.x - view.x, p.y - view.y);
      if (cell < 0) return;
      const ng = {
        pts: new Map([[e.pointerId, p]]), cell, t0: performance.now(), x0: p.x, y0: p.y, mode: "idle" as const,
        base: { ...(xf[cell] ?? XF0) }, d0: 1, a0: 0, mx0: p.x, my0: p.y, snapT: false, snapR: false, lp: undefined as number | undefined,
      };
      if (cellsRef.current.length > 1) {
        ng.lp = window.setTimeout(() => {
          const cur = gest.current;
          if (cur && cur.mode === "idle") { cur.mode = "swap"; vibrate(); setSwapTarget(cur.cell); }
        }, LONG_PRESS);
      }
      gest.current = ng;
      return;
    }
    g.pts.set(e.pointerId, p);
    if (g.pts.size === 2 && g.mode !== "swap") {
      window.clearTimeout(g.lp);
      const t = twoPt();
      g.mode = "pinch"; g.base = { ...(xf[g.cell] ?? XF0) }; g.d0 = t.d || 1; g.a0 = t.ang; g.mx0 = t.mx; g.my0 = t.my;
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const p = local(e);
    if (picker) {
      if (!e.buttons) return;
      const y = Math.min(p.y, region.y + region.h);
      setPicker({ x: p.x, y, color: sampleAt(p.x, y) });
      return;
    }
    const g = gest.current;
    if (!g || !g.pts.has(e.pointerId)) return;
    g.pts.set(e.pointerId, p);
    const cell = cellsRef.current[g.cell];
    if (!cell) return;
    if (g.mode === "swap") {
      const t = hitCell(cellsRef.current, p.x - view.x, p.y - view.y);
      setSwapTarget(t >= 0 ? t : g.cell);
      return;
    }
    if (g.mode === "idle") {
      if (Math.hypot(p.x - g.x0, p.y - g.y0) < 6) return;
      window.clearTimeout(g.lp);
      g.mode = "pan"; g.base = { ...(xf[g.cell] ?? XF0) };
    }
    const [, , cw, ch] = cell;
    let next: Xf;
    if (g.mode === "pan") {
      next = { ...g.base, tx: g.base.tx + (p.x - g.x0) / cw, ty: g.base.ty + (p.y - g.y0) / ch };
    } else {
      if (g.pts.size < 2) return;
      const t = twoPt();
      next = {
        ...g.base,
        s: Math.min(10, Math.max(1, (g.base.s * t.d) / g.d0)),
        ang: g.base.ang + (t.ang - g.a0),
        tx: g.base.tx + (t.mx - g.mx0) / cw,
        ty: g.base.ty + (t.my - g.my0) / ch,
      };
      // snap the total angle to a multiple of 90° within 4°
      const tot = next.rot90 * 90 + next.ang;
      const near = Math.round(tot / 90) * 90;
      const inR = Math.abs(tot - near) < 4;
      if (inR) next.ang = near - next.rot90 * 90;
      if (inR && !g.snapR) vibrate();
      g.snapR = inR;
    }
    // keep the cell covered (no background showing) while the photo is not freely rotated
    const pic = scene.pics[g.cell];
    if (pic && Math.abs(next.ang) < 0.01) {
      const k = coverScale(pic, next, cw, ch) * next.s;
      const r90 = next.rot90 % 2 === 1;
      const iw = (r90 ? pic.h : pic.w) * k, ih = (r90 ? pic.w : pic.h) * k;
      const mx = Math.max(0, (iw - cw) / (2 * cw)), my = Math.max(0, (ih - ch) / (2 * ch));
      next.tx = Math.min(mx, Math.max(-mx, next.tx));
      next.ty = Math.min(my, Math.max(-my, next.ty));
    }
    // snap the photo centre to the cell centre within 6 px
    const inT = Math.abs(next.tx * cw) < 6 && Math.abs(next.ty * ch) < 6;
    if (inT) { next.tx = 0; next.ty = 0; }
    if (inT && !g.snapT) vibrate();
    g.snapT = inT;
    setXf((all) => all.map((x, i) => (i === g.cell ? next : x)));
  };
  const onUp = (e: React.PointerEvent) => {
    if (picker) {
      // lifting the finger makes the picked colour the border colour
      const c = picker.color;
      setPickerColor(c);
      setBorderColor({ type: "picker", color: c });
      setPicker(null);
      return;
    }
    const g = gest.current;
    if (!g) return;
    g.pts.delete(e.pointerId);
    if (g.pts.size > 0) {
      if (g.mode === "pinch") { const [only] = [...g.pts.values()]; g.mode = "pan"; g.base = { ...(xf[g.cell] ?? XF0) }; g.x0 = only.x; g.y0 = only.y; }
      return;
    }
    window.clearTimeout(g.lp);
    gest.current = null;
    if (g.mode === "idle") { openFocus(g.cell); return; } // a tap opens the photo page
    if (g.mode === "swap") {
      const t = swapTarget;
      setSwapTarget(null);
      if (t != null && t !== g.cell) {
        setCellPhoto((cp) => { const n = [...cp]; [n[g.cell], n[t]] = [n[t], n[g.cell]]; return n; });
        setXf((all) => all.map((x, i) => (i === g.cell || i === t ? { ...XF0 } : x)));
        vibrate();
      }
    }
  };

  /* ---------------------------------------------------------------- render */
  const topVisible = depth === "NONE";
  const loading = imageLoading || saveLoading;
  const MENUS: { id: Menu; label: string; icon: "collage" | "stack-v" | "frame" }[] = [
    { id: "LAYOUT", label: "Layout", icon: "collage" }, { id: "SEQUENCE", label: "Stack", icon: "stack-v" }, { id: "BORDER", label: "Border", icon: "frame" },
  ];
  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden bg-bg text-fg" style={{ touchAction: "none" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% 40%, var(--oe-panel), var(--oe-bg) 70%)" }} />
      {/* gesture surface over the preview area */}
      <div
        className="absolute"
        style={{ left: 0, top: APPBAR, width: size.w, height: Math.max(1, size.h - APPBAR - BOTTOM), touchAction: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {sel.kind !== "none" && pics && (
        <canvas ref={canvasRef} className="pointer-events-none absolute shadow-[0_8px_32px_rgba(0,0,0,0.45)]" style={{ left: view.x, top: view.y, width: view.w, height: view.h }} />
      )}

      {topVisible && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-bg/95 px-2 backdrop-blur-md" style={{ height: APPBAR }}>
          <IconButton icon="back" label="Back" variant="raised" onClick={onBackPressed} />
          <span className="flex-1 text-center font-display text-[16px] font-semibold">Collage</span>
          <Button size="sm" icon="save" className="h-10 rounded-full px-4" onClick={onSave}>Save</Button>
        </div>
      )}

      {/* dock: the selected menu over the tab bar */}
      {depth !== "COLOR_PALETTE" && (
        <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-xl bg-panel shadow-[0_-8px_24px_rgba(0,0,0,0.35)]" style={{ height: BOTTOM }}>
          <div className="absolute inset-x-0 top-0" style={{ height: FEATURE_H }}>
            {depth === "FOCUS" ? (
              <FocusPanel
                onReplace={() => fileRef.current?.click()}
                onRight90={() => editFocused((x) => ({ ...x, rot90: (x.rot90 + 1) % 4 }))}
                onMirror={() => editFocused((x) => ({ ...x, fh: !x.fh }))}
                onFlip={() => editFocused((x) => ({ ...x, fv: !x.fv }))}
              />
            ) : (
              <>
                {menu === "LAYOUT" && (
                  <LayoutPanel templates={templates} pack={pack} sel={sel} onPack={setPack} onLayout={(i) => applySel({ kind: "layout", pack: pack.id, index: i })} />
                )}
                {menu === "SEQUENCE" && <SequencePanel sel={sel} onHeight={() => applySel({ kind: "height" })} onWidth={() => applySel({ kind: "width" })} />}
                {menu === "BORDER" && (
                  <BorderPanel
                    items={borderItems}
                    current={borderColor}
                    size={border}
                    sizeEnabled={borderEditable(sel)}
                    flashKey={flashKey}
                    onSize={setBorder}
                    dimmed={!!picker}
                    onItem={(it) => {
                      if (it.kind === "tool") {
                        if (it.tool === "picker") startPicker();
                        else setDepth("COLOR_PALETTE");
                      } else setBorderColor({ type: it.type, color: it.color });
                    }}
                  />
                )}
              </>
            )}
          </div>
          <div role="tablist" aria-label="Collage tools" className={cx("absolute inset-x-0 bottom-0 flex items-stretch justify-center gap-6 border-t border-line transition-opacity", depth === "FOCUS" && "pointer-events-none opacity-30")} style={{ height: MENU_H }}>
            {MENUS.map((m) => {
              const on = menu === m.id;
              return (
                <button key={m.id} type="button" role="tab" aria-selected={on} onClick={() => setMenu(m.id)} className={cx("oe-press relative flex w-[72px] flex-col items-center justify-center gap-1", on ? "text-fg" : "text-fg-3")}>
                  <span className={cx("absolute top-0 h-[3px] w-6 rounded-b-full bg-accent transition-opacity", on ? "opacity-100" : "opacity-0")} />
                  <Icon name={m.icon} size={21} />
                  <span className="text-[11px] font-medium">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* colour picker loupe */}
      {picker && (
        <div className="pointer-events-none absolute z-30" style={{ left: picker.x - 28, top: picker.y - 84, width: 56, height: 84, transformOrigin: "50% 100%", animation: "oe-pop 160ms var(--oe-ease)" }}>
          <span className="absolute left-0 top-0 h-14 w-14 rounded-full ring-4 ring-white" style={{ background: picker.color, boxShadow: "0 4px 12px rgba(0,0,0,0.45)" }} />
          <span className="absolute left-[23px] top-[72px] h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: picker.color }} />
        </div>
      )}

      {depth === "FOCUS" && <PageBar title="Photo" onCancel={focusCancel} onConfirm={focusConfirm} />}
      {depth === "COLOR_PALETTE" && (
        <div className="absolute inset-0 z-20">
          <PalettePanel
            initial={paletteColor}
            onLive={setPaletteLive}
            onApply={(c) => { setPaletteColor(c); setBorderColor({ type: "palette", color: c }); }}
            onCommit={(c) => { setPaletteColor(c); setBorderColor({ type: "palette", color: c }); setPaletteLive(null); setDepth("NONE"); }}
            onBack={() => { setPaletteLive(null); setDepth("NONE"); }}
          />
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void onReplaceFile(e.target.files?.[0]); e.target.value = ""; }} />

      {loading && (
        <>
          <div className="absolute inset-0 z-40" />
          <div className="absolute z-40 flex items-center gap-3 rounded-lg bg-panel px-5 py-4 shadow-2xl ring-1 ring-line" style={{ left: "50%", top: region.y + region.h / 2, transform: "translate(-50%, -50%)" }}>
            <Spinner size={22} className="text-accent" />
            <span className="whitespace-nowrap text-[15px] font-medium">{saveLoading ? "Saving full size…" : "Loading photos…"}</span>
          </div>
        </>
      )}

      <Dialog
        open={alert} onClose={() => setAlert(false)} icon="trash" destructive
        title={sel.kind === "none" ? "Leave the collage?" : "Discard this collage?"}
        confirm={sel.kind === "none" ? "Leave" : "Discard"} cancel="Keep editing" onConfirm={leave}
      >
        {sel.kind === "none" ? "Nothing has been laid out yet." : "You haven't saved it yet. Leaving now throws it away."}
      </Dialog>

      {saved && (
        <CollageConfirm
          url={saved.url}
          blob={saved.blob}
          initialShare={!!dev?.share}
          onClose={() => { URL.revokeObjectURL(saved.url); setSaved(null); }}
          onBack={() => router.push("/gallery")}
        />
      )}
    </div>
  );
}
