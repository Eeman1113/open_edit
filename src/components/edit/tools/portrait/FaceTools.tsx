"use client";

// Portrait pages driven by the web face engine (src/lib/face, still-image mode): Face shape, Proportions, Sculpt, Body,
// Makeup, Eye light and Hair volume. Values are stored per face (see the face picker in faceUi.tsx) in
// doc.beauty.face, previewed live through the editor pipeline and re-rendered at full size on Save.
// Skin detail and Hair colour live in ../AiPortrait.tsx.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, Tabs, cx } from "@/components/ui";
import { TopBalloon } from "../../balloon";
import { useEdit } from "../../ctx";
import type { FaceVals, MakeupPick } from "../../model";
import { ChipRow, ControlRow, EditSeekBar, FeatureButton, SliderRow, ThumbItem, ToolChip } from "../../ui";
import { EditLoading, MENU, Panel, TextTooltip, useHold } from "../common";
import { BODY, EYELIGHT, FACE_RATIO, FACE_SHAPES, MAKEUP_SUB, MASK_CATS, RESHAPE3D, RESHAPE_CATS, type ReshapeItem } from "./faceData";
import { detectPose, faceEditActive, flippedUrlReady, peekPose } from "./faceEngine";
import { useBase, useFaceDraft, useFaceGuide, usable } from "./faceUi";
import { MAKEUP } from "./makeup";

/* ------------------------------------------------------------------ shared bits */

/** Row over the photo: the slider (children), extra buttons and hold-to-compare. */
function ControlBar({ bottom = MENU, children, right, originalEnabled }: { bottom?: number; children?: ReactNode; right?: ReactNode; originalEnabled: boolean }) {
  const [, hold] = useHold();
  return (
    <ControlRow bottom={bottom} onOriginal={hold} originalEnabled={originalEnabled}>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}{right}</div>
    </ControlRow>
  );
}

/** Left / Both / Right switch for items that can be applied to one side of the face. */
const PARTIALS: { id: "_left" | "" | "_right"; label: string }[] = [{ id: "_left", label: "Left" }, { id: "", label: "Both" }, { id: "_right", label: "Right" }];
function PartialToggle({ value, onChange, bottom, pillRef }: { value: "_left" | "" | "_right"; onChange: (v: "_left" | "" | "_right") => void; bottom: number; pillRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div className="absolute inset-x-0 z-20 flex justify-center" style={{ bottom }} onPointerDown={(e) => e.stopPropagation()}>
      <div ref={pillRef}>
        <Tabs look="segment" tone="overlay" className="w-[210px]" items={PARTIALS.map((p) => ({ id: p.id || "both", label: p.label }))} value={value || "both"} onChange={(v) => onChange(v === "both" ? "" : v as "_left" | "_right")} />
      </div>
    </div>
  );
}

// One-time tip balloons on the Face shape page.
const PARTIAL_TIP_KEY = "oe:edit:sidesTipSeen";
let bgCorrectionBalloonPending = true;
const partialTipPending = () => { try { return localStorage.getItem(PARTIAL_TIP_KEY) !== "1"; } catch { return false; } };

const seekRange = (d?: boolean) => (d ? { min: -1, max: 1, def: 0 } : { min: 0, max: 1, def: 0 });

/* ------------------------------------------------------------------ Face shape */

const STYLES = -1;

export function FacePage() {
  const guide = useFaceGuide({ banner: "BEAUTY" });
  const { fe, setVals, apply, close, confirm } = useFaceDraft();
  const sel = guide.sel;
  const vals: FaceVals = sel >= 0 ? fe.f[sel] ?? {} : {};
  const [cat, setCat] = useState(0);
  const [item, setItem] = useState<{ kind: "shape"; key: string } | { kind: "re"; it: ReshapeItem } | null>(null);
  const [partial, setPartial] = useState<"_left" | "" | "_right">("");
  const [flash, setFlash] = useState(0);
  const pillRef = useRef<HTMLDivElement>(null);
  const corrRef = useRef<HTMLButtonElement>(null);
  const [balloon, setBalloon] = useState<"partial" | "bg" | null>(null);
  const pick = (next: typeof item) => {
    if (!usable(sel)) { guide.noFace(); return; }
    setItem(next); setFlash((n) => n + 1);
    const hasPartial = next?.kind === "re" && !!next.it.p;
    if (!hasPartial) { setPartial(""); setBalloon((b) => (b === "partial" ? null : b)); }
    else if (partialTipPending()) {
      try { localStorage.setItem(PARTIAL_TIP_KEY, "1"); } catch { /* storage unavailable */ }
      setBalloon("partial");
    }
  };
  const reKey = item?.kind === "re" ? item.it.key + (item.it.p ? partial : "") : "";
  const value = item?.kind === "shape" ? (vals.shape?.key === item.key ? vals.shape.v : 0) : item ? vals.re?.[reKey] ?? 0 : 0;
  const setValue = (v: number) => {
    if (!item || !usable(sel)) return;
    if (bgCorrectionBalloonPending && Math.abs(v) > 0.001) { bgCorrectionBalloonPending = false; setBalloon("bg"); }
    setVals(sel, (o) => item.kind === "shape" ? { ...o, shape: { key: item.key, v } } : { ...o, re: { ...o.re, [reKey]: v } });
  };
  const reMod = (k: string) => [k, `${k}_left`, `${k}_right`].some((x) => Math.abs(vals.re?.[x] ?? 0) > 0.001);
  const catMod = (i: number) => (i === STYLES ? !!vals.shape && vals.shape.v > 0.001 : RESHAPE_CATS[i].items.some((it) => reMod(it.key)));
  const ctrlBottom = MENU + guide.bannerH;
  const showPartial = item?.kind === "re" && !!item.it.p;
  return (
    <>
      {guide.node}
      {guide.bannerNode}
      {showPartial && <PartialToggle value={partial} onChange={setPartial} bottom={ctrlBottom + 56} pillRef={pillRef} />}
      {balloon === "partial" && showPartial && <TopBalloon anchor={pillRef} text="Shape each side on its own" marginH={40} dismissMs={5000} onDismiss={() => setBalloon(null)} />}
      {balloon === "bg" && item && <TopBalloon anchor={corrRef} text="Keep straight lines straight" marginV={4} dismissMs={5000} onDismiss={() => setBalloon(null)} />}
      <ControlBar
        bottom={ctrlBottom}
        originalEnabled={faceEditActive(fe)}
        right={item && (
          <button
            ref={corrRef} type="button" onClick={() => apply({ ...fe, corr: !fe.corr })} aria-pressed={!!fe.corr} aria-label="Keep the background straight" title="Keep the background straight"
            className={cx("oe-press flex h-9 w-9 flex-none items-center justify-center rounded-full backdrop-blur-md", fe.corr ? "bg-accent text-on-accent" : "bg-glass text-white")}
          >
            <Icon name="grid" size={18} />
          </button>
        )}
      >
        {item && <EditSeekBar key={`${sel}|${reKey}|${item.kind}`} value={value} {...seekRange(item.kind === "re" && item.it.d)} flashKey={flash} onChange={setValue} />}
      </ControlBar>
      <Panel title="Face shape" onClose={close} onConfirm={() => confirm()}>
        <div className="flex h-full flex-col justify-center gap-3">
          <ChipRow>
            <ToolChip label="Styles" selected={cat === STYLES} modified={catMod(STYLES)} onClick={() => setCat(STYLES)} />
            {RESHAPE_CATS.map((c, i) => <ToolChip key={c.label} label={c.label} selected={cat === i} modified={catMod(i)} onClick={() => setCat(i)} />)}
          </ChipRow>
          <div className="mx-4 h-px bg-line" />
          <ChipRow>
            {cat === STYLES
              ? FACE_SHAPES.map(([k, l]) => (
                <ToolChip key={k} label={l} selected={item?.kind === "shape" && item.key === k} modified={vals.shape?.key === k && vals.shape.v > 0.001} onClick={() => pick({ kind: "shape", key: k })} />
              ))
              : RESHAPE_CATS[cat].items.map((it) => (
                <ToolChip key={it.key} label={it.label} selected={item?.kind === "re" && item.it === it} modified={reMod(it.key)} onClick={() => pick({ kind: "re", it })} />
              ))}
          </ChipRow>
        </div>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ Proportions / Sculpt */

function SliderListPage({ kind }: { kind: "FACE_RATIO" | "RESHAPE3D" }) {
  const guide = useFaceGuide({ banner: "BEAUTY" });
  const { fe, setVals, close, confirm } = useFaceDraft();
  const sel = guide.sel;
  const items = kind === "FACE_RATIO" ? FACE_RATIO : RESHAPE3D;
  const field = kind === "FACE_RATIO" ? "ratio" : "r3d";
  const vals = (sel >= 0 ? fe.f[sel]?.[field] : undefined) ?? {};
  const [item, setItem] = useState<ReshapeItem | null>(null);
  const [flash, setFlash] = useState(0);
  return (
    <>
      {guide.node}
      {guide.bannerNode}
      <ControlBar bottom={MENU + guide.bannerH} originalEnabled={faceEditActive(fe)}>
        {item && <EditSeekBar key={`${sel}|${item.key}`} value={vals[item.key] ?? 0} {...seekRange(item.d)} flashKey={flash} onChange={(v) => setVals(sel, (o) => ({ ...o, [field]: { ...o[field], [item.key]: v } }))} />}
      </ControlBar>
      <Panel title={kind === "FACE_RATIO" ? "Proportions" : "Sculpt"} onClose={close} onConfirm={() => confirm()}>
        <div className="flex h-full flex-col justify-center gap-3">
          <ChipRow className="flex-wrap justify-center gap-y-2">
            {items.map((it) => (
              <ToolChip key={it.key} label={it.label} selected={item?.key === it.key} modified={Math.abs(vals[it.key] ?? 0) > 0.001}
                onClick={() => { if (!usable(sel)) { guide.noFace(); return; } setItem(it); setFlash((n) => n + 1); }} />
            ))}
          </ChipRow>
        </div>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ Body */

function BodyPage() {
  const base = useBase();
  const { setTool } = useEdit();
  const { fe, apply, close, confirm } = useFaceDraft();
  const [pose, setPose] = useState(() => peekPose(base) ?? null);
  const [tip, setTip] = useState<string | null>(null);
  const [item, setItem] = useState("allbody");
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (!base) return;
    let alive = true;
    void detectPose(base).then((p) => {
      if (!alive) return;
      setPose(p);
      if (!p.pose) setTip("No person found in this photo.");
      else if (p.count > 1) setTip("Several people found: the largest one is edited.");
    });
    return () => { alive = false; };
  }, [base]);
  useEffect(() => { if (!tip) return; const t = window.setTimeout(() => setTip(null), 2500); return () => window.clearTimeout(t); }, [tip]);
  useEffect(() => { setTool({ down: () => setTip(null) }); return () => setTool(null); }, [setTool]);
  const ok = !!pose?.pose;
  const body = fe.body ?? {};
  const it = BODY.find((b) => b.key === item)!;
  const setValue = (v: number) => {
    let next = { ...body, [item]: v };
    // Whole body drives leg length (+), slim (−) and head (−); changing one of those resets Whole body
    if (item === "allbody") next = { ...next, longleg: v, slim: -v, head: -v };
    else if (["longleg", "slim", "head"].includes(item)) next.allbody = 0;
    apply({ ...fe, body: next });
  };
  return (
    <>
      <TextTooltip text={tip} />
      {pose === null && <EditLoading text="Looking for a person…" />}
      <ControlBar originalEnabled={faceEditActive(fe)}>
        <EditSeekBar key={item} value={body[item] ?? 0} {...seekRange(it.d)} disabled={!ok} flashKey={flash} onChange={setValue} />
      </ControlBar>
      <Panel title="Body" onClose={close} onConfirm={() => confirm()}>
        <div className="flex h-full flex-col justify-center">
          <ChipRow className="flex-wrap justify-center gap-y-2">
            {BODY.map((b) => (
              <ToolChip key={b.key} label={b.label} selected={item === b.key} modified={Math.abs(body[b.key] ?? 0) > 0.001} dim={!ok && pose !== null}
                onClick={() => { if (!ok) { setTip("No person found in this photo."); return; } setItem(b.key); setFlash((n) => n + 1); }} />
            ))}
          </ChipRow>
        </div>
      </Panel>
    </>
  );
}

export function IconListPage({ kind }: { kind: "FACE_RATIO" | "RESHAPE3D" | "BODY" }) {
  return kind === "BODY" ? <BodyPage /> : <SliderListPage kind={kind} />;
}

/* ------------------------------------------------------------------ Makeup */

/** Look swatch: the look's colour with a soft highlight. */
const lookBg = (c: string) => `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.4), rgba(255,255,255,0) 50%), ${c}`;

export function MakeupPage() {
  const guide = useFaceGuide({ banner: "MAKEUP" });
  const { fe, setVals, close, confirm } = useFaceDraft();
  const sel = guide.sel;
  const [ci, setCi] = useState(() => Math.max(0, MAKEUP.findIndex((m) => m.key.startsWith("lip"))));
  const [flash, setFlash] = useState(0);
  const [, force] = useState(0);
  const c = MAKEUP[ci];
  const mk = (sel >= 0 ? fe.f[sel]?.mk : undefined) ?? {};
  const cur: MakeupPick | undefined = mk[c.key];
  const setPick = (p: MakeupPick | null) => setVals(sel, (o) => {
    const m = { ...o.mk };
    if (p) m[c.key] = p; else delete m[c.key];
    return { ...o, mk: m };
  });
  const choose = (id: string) => {
    if (!usable(sel)) { guide.noFace(); return; }
    if (id === "none") { setPick(null); return; }
    if (cur?.id === id) return;
    // a new look starts at the category's default strength; tinted mask looks pick their first colour
    setPick({ id, v: c.def, sub: cur?.sub ?? (MASK_CATS.has(c.key) ? MAKEUP_SUB[c.key][0].id : undefined), flip: cur?.flip });
    setFlash((n) => n + 1);
  };
  // mirrored marks are prepared asynchronously; re-apply once ready
  useEffect(() => {
    if (c.key !== "beauty_mark" || !cur?.flip) return;
    let alive = true;
    void flippedUrlReady(cur.id).then(() => { if (alive) { setPick({ ...cur }); force((n) => n + 1); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.flip, cur?.id, c.key]);
  const subs = MAKEUP_SUB[c.key];
  return (
    <>
      {guide.node}
      {guide.bannerNode}
      {cur && subs && (
        <div className="no-scrollbar absolute right-3 z-20 flex flex-col gap-2 overflow-y-auto rounded-full bg-glass p-1.5 backdrop-blur-md" style={{ top: 64, maxHeight: `calc(100% - ${MENU + 120 + guide.bannerH}px)` }} onPointerDown={(e) => e.stopPropagation()}>
          {subs.map((s) => {
            const on = cur.sub === s.id;
            return (
              <button key={s.id} type="button" aria-pressed={on} className="h-8 w-8 flex-none rounded-full" style={{ background: s.color, boxShadow: on ? "0 0 0 2px var(--oe-bg), 0 0 0 4px var(--oe-fg)" : undefined }}
                onClick={() => setPick({ ...cur, sub: on && !MASK_CATS.has(c.key) ? undefined : s.id })} />
            );
          })}
        </div>
      )}
      <ControlBar bottom={MENU + guide.bannerH} originalEnabled={faceEditActive(fe)}>
        {cur && <EditSeekBar key={`${sel}|${c.key}`} value={cur.v} min={0} max={1} def={c.def} flashKey={flash} onChange={(v) => setPick({ ...cur, v })} />}
      </ControlBar>
      <Panel title="Makeup" onClose={close} onConfirm={() => confirm()}>
        <div className="flex h-full flex-col justify-center gap-3">
          <ChipRow>
            {MAKEUP.map((m, i) => <ToolChip key={m.key} label={m.label} selected={ci === i} modified={!!mk[m.key]} onClick={() => setCi(i)} />)}
          </ChipRow>
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4">
            {c.key === "beauty_mark" && (
              <div className="flex flex-none items-start">
                <FeatureButton icon="flip-h" label="Mirror" selected={!!cur?.flip} disabled={!cur} onClick={() => cur && setPick({ ...cur, flip: !cur.flip })} />
              </div>
            )}
            {c.items.map((it) => it.k === "none"
              ? <ThumbItem key="none" size={56} label="None" none selected={!cur} onClick={() => choose("none")} />
              : <ThumbItem key={it.k} size={56} label={it.l} bg={lookBg(it.bg ?? c.bg)} selected={cur?.id === it.k} onClick={() => choose(it.k)} />)}
          </div>
        </div>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ Eye light */

/** Catchlight preview: a dark iris with the light's shape. */
function CatchlightGlyph({ id }: { id: string }) {
  const shape = (() => {
    switch (id) {
      case "dot": return <circle cx="22" cy="18" r="4" fill="#fff" />;
      case "soft": return <circle cx="22" cy="18" r="7" fill="url(#oe-cl-soft)" />;
      case "ring": return <circle cx="24" cy="24" r="9" fill="none" stroke="#fff" strokeWidth="2.2" />;
      case "window": return <g fill="#fff"><rect x="17" y="13" width="5" height="5" /><rect x="23" y="13" width="5" height="5" /><rect x="17" y="19" width="5" height="5" /><rect x="23" y="19" width="5" height="5" /></g>;
      case "star": return <path d="M22 11 L24 17 L30 17 L25 21 L27 27 L22 23 L17 27 L19 21 L14 17 L20 17Z" fill="#fff" />;
      case "twin": return <g fill="#fff"><circle cx="19" cy="18" r="3.4" /><circle cx="29" cy="28" r="2.2" /></g>;
      default: return <circle cx="22" cy="18" r="4" fill="#fff" />;
    }
  })();
  return (
    <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full">
      <defs><radialGradient id="oe-cl-soft"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient></defs>
      <circle cx="24" cy="24" r="17" fill="#3b2a20" />
      <circle cx="24" cy="24" r="8" fill="#0b0c0f" />
      {shape}
    </svg>
  );
}

export function EyeLightPage() {
  const guide = useFaceGuide({ banner: "BEAUTY" });
  const { fe, setVals, close, confirm } = useFaceDraft();
  const sel = guide.sel;
  const eye = sel >= 0 ? fe.f[sel]?.eye : undefined;
  const [flash, setFlash] = useState(0);
  const choose = (id: string | null) => {
    if (!usable(sel)) { guide.noFace(); return; }
    setVals(sel, (o) => ({ ...o, eye: id ? { id, v: o.eye?.id === id ? o.eye.v : 0.4 } : undefined }));
    if (id) setFlash((n) => n + 1);
  };
  return (
    <>
      {guide.node}
      {guide.bannerNode}
      <ControlBar bottom={MENU + guide.bannerH} originalEnabled={faceEditActive(fe)}>
        {eye && <EditSeekBar key={`${sel}|${eye.id}`} value={eye.v} min={0} max={1} def={0.4} flashKey={flash} onChange={(v) => setVals(sel, (o) => ({ ...o, eye: { id: eye.id, v } }))} />}
      </ControlBar>
      <Panel title="Eye light" onClose={close} onConfirm={() => confirm()}>
        <div className="no-scrollbar flex h-full items-center gap-2.5 overflow-x-auto px-4" style={{ justifyContent: "safe center" }}>
          <ThumbItem size={56} label="None" none selected={!eye} onClick={() => choose(null)} />
          {EYELIGHT.map(([k, l]) => <ThumbItem key={k} size={56} label={l} bg="#d8cfc8" iconNode={<CatchlightGlyph id={k} />} selected={eye?.id === k} onClick={() => choose(k)} />)}
        </div>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ Hair volume */

export function VolumePage() {
  const guide = useFaceGuide({ banner: "BEAUTY" });
  const { fe, setVals, close, confirm } = useFaceDraft();
  const sel = guide.sel;
  const v = sel >= 0 ? fe.f[sel]?.hv ?? 0 : 0;
  return (
    <>
      {guide.node}
      {guide.bannerNode}
      <ControlBar bottom={MENU + guide.bannerH} originalEnabled={faceEditActive(fe)} />
      <Panel title="Hair volume" onClose={close} onConfirm={() => confirm()}>
        <div className="flex h-full flex-col justify-center gap-2" onPointerDown={() => { if (!usable(sel)) guide.noFace(); }}>
          <SliderRow label="Volume" value={Math.round(v * 100)}>
            <EditSeekBar key={sel} value={v} min={0} max={1} def={0} level={false} disabled={!usable(sel)} onChange={(x) => setVals(sel, (o) => ({ ...o, hv: x }))} />
          </SliderRow>
          <p className="px-6 text-center text-[12px] text-fg-3">Lifts the hair around the top of the head.</p>
        </div>
      </Panel>
    </>
  );
}
