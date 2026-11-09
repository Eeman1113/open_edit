"use client";

// CollageActivity → CollageMainFragment (fragment_collage.xml):
//  - app bar 52dp: btn_back (icon_top_back 34dp, white, marginStart 8) and btn_save ("SAVE", bold white, 32dp,
//    minWidth 48, paddingH 12, r15 #0bd4d2, marginEnd 16). Both hidden while a 2-depth page is open.
//  - texture_view (the collage preview) from 52dp to bottom − 190dp, black.
//  - bottom menu: Sequence / Layout / Border (15dp, white / white 60%, 52dp, chain with 30dp side margins);
//    the selected menu's fragment (138dp) sits right above it. Layout is selected on start.
//  - 2-depth pages over everything: FOCUS (a cell was tapped) and COLOR_PALETTE.
//  - group_loading: full-screen touch blocker + 120dp rgba(0,0,0,.6) r12 box with the white loading lottie,
//    centred on the preview, while photos load or the collage is saved.
// Save → JPEG at full resolution → savePhoto(..., "B612") → EditConfirmFragment (COLLAGE).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog, Toast, Tint, useToast } from "@/components/edit/ui";
import { useBackHandler } from "@/lib/back";
import { LottieLoading } from "@/components/ai/LottieLoading";
import { getPhoto, isVideoPhoto, listPhotos, savePhoto } from "@/lib/store";
import { COMMON_COLORS, PACKS, borderEditable, defaultPack, templatesFor, type Pack, type Sel } from "./layouts";
import { aspectOf, coverScale, draw, hitCell, renderJpeg, XF0, type Pic, type Scene, type Xf } from "./render";
import { BorderPanel, FEATURE_H, FocusPanel, LayoutPanel, MENU_H, PalettePanel, SequencePanel, type BorderItem } from "./panels";
import { CollageConfirm } from "./Confirm";

type Menu = "SEQUENCE" | "LAYOUT" | "BORDER";
type Depth = "NONE" | "FOCUS" | "COLOR_PALETTE";
interface BorderColor { type: "builtin" | "picker" | "palette"; color: string }

export interface CollageDev {
  n?: number; menu?: Menu; depth?: Depth; sel?: string; pack?: string; border?: number; color?: string;
  picker?: boolean; save?: boolean; share?: boolean; alert?: boolean;
}

const APPBAR = 52;
const BOTTOM = FEATURE_H + MENU_H; // guide_feature_top = bottom − 190dp
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

  /* ---------------------------------------------------------------- data (CollageDataViewModel) */
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

  /* ---------------------------------------------------------------- page (CollagePageViewModel) */
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
  const [toast, showToast] = useToast();
  const [swapTarget, setSwapTarget] = useState<number | null>(null);

  /* ---------------------------------------------------------------- load photos (initCollagePage / AddCollage) */
  useEffect(() => {
    let dead = false;
    (async () => {
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
      if (out.length < 1) { router.replace("/gallery"); return; } // CollageActivity.k1: empty list → finish()
      setPics(out);
      setCellPhoto(out.map((_, i) => i));
      setXf(out.map(() => ({ ...XF0 })));
      // loadData: default pack (1:1 for 2/3/5/7/8 photos, else 3:4) + its first layout
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
  const region = { x: 0, y: APPBAR, w: size.w, h: Math.max(1, size.h - APPBAR - BOTTOM) };
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
    const cells = draw(ctx, scene, W, H, { selected: hl, lineWidth: 2 * dpr });
    cellsRef.current = cells.map(([x, y, w, h]) => [x / dpr, y / dpr, w / dpr, h / dpr]);
  }, [scene, view.w, view.h, pics, sel.kind, depth, focusCell, swapTarget]);

  /* ---------------------------------------------------------------- data actions */
  const applySel = (s: Sel) => {
    // CollageDataViewModel.dg: switching between border-editable / non-editable restores or stashes the width
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

  /* ---------------------------------------------------------------- colour picker (ux4) */
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

  /* ---------------------------------------------------------------- 2-depth pages */
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
      await savePhoto(blob, W, H, "B612");
      setSaved({ url: URL.createObjectURL(blob), blob });
    } catch {
      showToast("Failed to save a photo.");
    }
    setSaveLoading(false);
  }, [saveLoading, pics, scene, showToast]);
  const onSave = () => {
    if (sel.kind === "none") { setAlert(true); return; } // CollageMainFragment.U4: nothing applied → leave alert
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

  /* ---------------------------------------------------------------- preview touch (ImageEditor.J2 → collage engine) */
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
      // snap_rotation: snap the total angle to a multiple of 90° within 4°
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
    // snap_position: snap the photo centre to the cell centre within 6dp
    const inT = Math.abs(next.tx * cw) < 6 && Math.abs(next.ty * ch) < 6;
    if (inT) { next.tx = 0; next.ty = 0; }
    if (inT && !g.snapT) vibrate();
    g.snapT = inT;
    setXf((all) => all.map((x, i) => (i === g.cell ? next : x)));
  };
  const onUp = (e: React.PointerEvent) => {
    if (picker) {
      // ux4 ACTION_UP → mg(colour): picker colour becomes the border colour, picker closes
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
    if (g.mode === "idle") { openFocus(g.cell); return; } // "select" event → Collage2DepthType.FOCUS
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
  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden bg-black" style={{ touchAction: "none" }}>
      <style>{"@keyframes collage-fade{from{opacity:0}to{opacity:1}}"}</style>

      {/* texture_view: the collage preview */}
      <div
        className="absolute"
        style={{ left: region.x, top: region.y, width: region.w, height: region.h, touchAction: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {sel.kind !== "none" && pics && (
        <canvas ref={canvasRef} className="pointer-events-none absolute" style={{ left: view.x, top: view.y, width: view.w, height: view.h }} />
      )}

      {/* app bar */}
      {topVisible && (
        <>
          <button type="button" onClick={onBackPressed} aria-label="Back" className="absolute" style={{ left: 8, top: 9, width: 34, height: 34 }}>
            <Tint name="icon_top_back" size={34} color="#ffffff" />
          </button>
          <button
            type="button"
            onClick={onSave}
            className="absolute flex items-center justify-center text-white"
            style={{ right: 16, top: 10, height: 32, minWidth: 48, padding: "0 12px", borderRadius: 15, background: "#0bd4d2", fontSize: 14, fontWeight: 700, lineHeight: "16px" }}
          >
            SAVE
          </button>
        </>
      )}

      {/* fragment_container: the selected menu (138dp) above the bottom tabs */}
      <div className="pointer-events-none absolute inset-x-0" style={{ bottom: MENU_H, height: FEATURE_H }}>
        <div className="pointer-events-auto absolute inset-0">
          {menu === "LAYOUT" && (
            <LayoutPanel
              templates={templates}
              pack={pack}
              sel={sel}
              onPack={setPack}
              onLayout={(i) => applySel({ kind: "layout", pack: pack.id, index: i })}
            />
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
        </div>
      </div>

      {/* bottom menu: btn_sequence / btn_layout / btn_border */}
      <div className="absolute inset-x-0 bottom-0 flex" style={{ height: MENU_H, padding: "0 30px" }}>
        {(["SEQUENCE", "LAYOUT", "BORDER"] as Menu[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMenu(m)}
            className="flex-1"
            style={{ fontSize: 15, color: menu === m ? "#ffffff" : "rgba(255,255,255,0.6)" }}
          >
            {m === "SEQUENCE" ? "Sequence" : m === "LAYOUT" ? "Layout" : "Border"}
          </button>
        ))}
      </div>

      {/* colour picker bubble (color_pick_layout: 50dp enlarge view + 10dp point, 19dp apart) */}
      {picker && (
        <div
          className="pointer-events-none absolute z-30"
          style={{ left: picker.x - 25, top: picker.y - (79 - 5), width: 50, height: 79, transformOrigin: "50% 100%", animation: "collage-pick 200ms" }}
        >
          <style>{"@keyframes collage-pick{from{transform:scale(0)}to{transform:scale(1)}}"}</style>
          <span className="absolute left-0 top-0 rounded-full" style={{ width: 50, height: 50, background: picker.color, boxShadow: "inset 0 0 0 2.5px #ffffff" }} />
          <span className="absolute rounded-full" style={{ left: 20, top: 69, width: 10, height: 10, background: picker.color, boxShadow: "inset 0 0 0 2.5px #ffffff" }} />
        </div>
      )}

      {/* fragment_2depth_container */}
      {depth === "FOCUS" && (
        <div className="absolute inset-x-0 bottom-0 z-20" style={{ height: BOTTOM }}>
          <FocusPanel
            onReplace={() => fileRef.current?.click()}
            onRight90={() => editFocused((x) => ({ ...x, rot90: (x.rot90 + 1) % 4 }))}
            onMirror={() => editFocused((x) => ({ ...x, fh: !x.fh }))}
            onFlip={() => editFocused((x) => ({ ...x, fv: !x.fv }))}
            onCancel={focusCancel}
            onConfirm={focusConfirm}
          />
        </div>
      )}
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

      {/* group_loading */}
      {loading && (
        <>
          <div className="absolute inset-0 z-40" />
          <div
            className="absolute z-40 flex items-center justify-center"
            style={{ left: region.x + region.w / 2 - 60, top: region.y + region.h / 2 - 60, width: 120, height: 120, borderRadius: 12, background: "rgba(0,0,0,0.6)" }}
          >
            <span style={{ display: "inline-flex", filter: "brightness(0) invert(1)" }}><LottieLoading size={40} /></span>
          </div>
        </>
      )}

      <Toast text={toast} />

      {alert && (
        <AlertDialog
          message="Are you sure you want to leave without saving?"
          cancel="Cancel"
          ok="Leave"
          onCancel={() => setAlert(false)}
          onOk={() => { setAlert(false); leave(); }}
        />
      )}

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
