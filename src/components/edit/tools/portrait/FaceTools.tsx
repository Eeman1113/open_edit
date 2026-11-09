"use client";

// Portrait two-depth pages driven by the web face engine (src/lib/face, IMAGE mode):
// Face (EPReshapeFragment), Face Ratio, 3D Face, Body, Makeup, Reflection (eye light), Volume (hair volume).
// Values are stored per face (FaceGuideLayout selection) in doc.beauty.face and rendered live through the editor
// pipeline; SAVE re-renders them at full resolution (pipeline.ts -> faceEngine.exportFaceStage).
// HD Skin / AI Hair / Hair color live in ../AiPortrait.tsx (ai-models part).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TopBalloon } from "../../balloon";
import { useEdit } from "../../ctx";
import type { FaceVals, MakeupPick } from "../../model";
import { CtrlIcon, EditSeekBar, FeatureButton, FeatureList, Img, PRIMARY, ThumbItem, Tint } from "../../ui";
import { EditLoading, MENU, Panel, TextTooltip, useHold } from "../common";
import { BODY, EYELIGHT, FACE_RATIO, FACE_SHAPES, MAKEUP_SUB, MASK_CATS, RESHAPE3D, RESHAPE_CATS, type ReshapeItem } from "./faceData";
import { detectPose, faceEditActive, flippedUrlReady, peekPose } from "./faceEngine";
import { useBase, useFaceDraft, useFaceGuide, usable } from "./faceUi";
import { MAKEUP } from "./makeup";

/* ------------------------------------------------------------------ shared bits */

/** container_control (54dp): optional seek bar (marginLeft 68 / marginRight 24) + extra buttons + btn_original. */
function ControlBar({ bottom = MENU, children, right, originalEnabled }: { bottom?: number; children?: ReactNode; right?: ReactNode; originalEnabled: boolean }) {
  const [, hold] = useHold();
  return (
    <div className="absolute inset-x-0 z-20 flex items-center" style={{ bottom, height: 54 }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="relative flex min-w-0 flex-1 items-center">{children}</div>
      {right}
      <CtrlIcon name="original" enabled={originalEnabled} onHold={hold} style={{ marginRight: 10 }} />
    </div>
  );
}

/** EditTabLayout pill (edit_common_category_list_item): 13dp, padding 11.5/5.25, selected = white r50 + black text. */
function Pill({ label, selected, onClick, h = 27 }: { label: string; selected: boolean; onClick: () => void; h?: number }) {
  return (
    <button type="button" onClick={onClick} className="flex-none whitespace-nowrap" style={{ height: h, padding: "0 11.5px", fontSize: 13, borderRadius: h === 27 ? 13.5 : 50, background: selected ? "#ffffff" : "transparent", color: selected ? "#222222" : "#ffffff", transition: "background 150ms, color 150ms" }}>
      {label}
    </button>
  );
}

/**
 * PartialOptionToggleView, editor mode (setEnableCollapsed(false) = always expanded): #66222222 pill, 31dp tall in a
 * 34dp view, r15.5; segment width = widest label + 2x12dp; thumb = segment inset 2dp, white at alpha 76; labels 12dp
 * white (selected alpha 255, others 153). Order Left / Both / Right; the thumb slides in 300ms.
 */
const PARTIALS: ["_left" | "" | "_right", string][] = [["_left", "Left"], ["", "Both"], ["_right", "Right"]];
function PartialToggle({ value, onChange, bottom, pillRef }: { value: string; onChange: (v: "_left" | "" | "_right") => void; bottom: number; pillRef?: React.Ref<HTMLDivElement> }) {
  const segW = 34 + 24; // "Right" at 12dp is ~30dp wide
  const idx = PARTIALS.findIndex(([k]) => k === value);
  return (
    <div className="absolute inset-x-0 z-20 flex justify-center" style={{ bottom, height: 34 }} onPointerDown={(e) => e.stopPropagation()}>
      <div ref={pillRef} className="relative" style={{ marginTop: 3, height: 31, width: segW * 3, borderRadius: 15.5, background: "rgba(34,34,34,0.4)" }}>
        <div className="absolute" style={{ top: 2, bottom: 2, left: idx * segW + 2, width: segW - 4, borderRadius: 15.5, background: "rgba(255,255,255,0.298)", transition: "left 300ms" }} />
        {PARTIALS.map(([k, l], i) => (
          <button key={l} type="button" onClick={() => onChange(k)} className="absolute top-0 flex h-full items-center justify-center text-white" style={{ left: i * segW, width: segW, fontSize: 12, opacity: i === idx ? 1 : 0.6 }}>{l}</button>
        ))}
      </div>
    </div>
  );
}

/**
 * EPReshapeFragment balloons (SnowBalloon, BalloonAlignment.Top, auto dismiss 5000 ms):
 *  - "partial" on togglePartial: "Retouch the left and right separately!", margins p8s(0, 40); once ever
 *    (keyShowReshapePartialOptionTooltip), dismissed when an item without partial options is selected.
 *  - "bgCorrection" on btn_correction: "Correct the distorted background!", margins p8s(4, 0); once per app run
 *    (EPReshapeViewModel.x0), after the first value change away from the default with a detected face.
 */
const PARTIAL_TIP_KEY = "keyShowReshapePartialOptionTooltip";
let bgCorrectionBalloonPending = true;
const partialTipPending = () => { try { return localStorage.getItem(PARTIAL_TIP_KEY) !== "false"; } catch { return false; } };

const seekRange = (d?: boolean) => (d ? { min: -1, max: 1, def: 0 } : { min: 0, max: 1, def: 0 });

/* ------------------------------------------------------------------ Face (RESHAPE) */

export function FacePage() {
  const guide = useFaceGuide({ banner: "BEAUTY" });
  const { fe, setVals, apply, close, confirm } = useFaceDraft();
  const sel = guide.sel;
  const vals: FaceVals = sel >= 0 ? fe.f[sel] ?? {} : {};
  const [cat, setCat] = useState(0);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [item, setItem] = useState<{ kind: "shape"; key: string } | { kind: "re"; it: ReshapeItem } | null>(null);
  const [partial, setPartial] = useState<"_left" | "" | "_right">("");
  const [flash, setFlash] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const scrolling = useRef(false);
  const pillRef = useRef<HTMLDivElement>(null);
  const corrRef = useRef<HTMLButtonElement>(null);
  const [balloon, setBalloon] = useState<"partial" | "bg" | null>(null);
  const goCat = (i: number) => {
    setCat(i);
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cat="${i}"]`);
    if (el && listRef.current) { scrolling.current = true; listRef.current.scrollTo({ left: el.offsetLeft - 4, behavior: "smooth" }); window.setTimeout(() => { scrolling.current = false; }, 500); }
  };
  const pick = (next: typeof item) => {
    if (!usable(sel)) { guide.noFace(); return; }
    setItem(next); setFlash((n) => n + 1);
    const hasPartial = next?.kind === "re" && !!next.it.p;
    if (!hasPartial) { setPartial(""); setBalloon((b) => (b === "partial" ? null : b)); }
    else if (partialTipPending()) {
      try { localStorage.setItem(PARTIAL_TIP_KEY, "false"); } catch { /* storage unavailable */ }
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
  const ctrlBottom = MENU + guide.bannerH;
  const showPartial = item?.kind === "re" && !!item.it.p;
  return (
    <>
      {guide.node}
      {guide.bannerNode}
      {showPartial && <PartialToggle value={partial} onChange={setPartial} bottom={ctrlBottom + 54} pillRef={pillRef} />}
      {balloon === "partial" && showPartial && <TopBalloon anchor={pillRef} text="Retouch the left and right separately!" marginH={40} dismissMs={5000} onDismiss={() => setBalloon(null)} />}
      {balloon === "bg" && item && <TopBalloon anchor={corrRef} text="Correct the distorted background!" marginV={4} dismissMs={5000} onDismiss={() => setBalloon(null)} />}
      <ControlBar
        bottom={ctrlBottom}
        originalEnabled={faceEditActive(fe)}
        right={item && (
          // group_correction: btn_correction 34dp, marginRight 10 (icon_correction_vip is not shown: no VIP UI)
          <button ref={corrRef} type="button" onClick={() => apply({ ...fe, corr: !fe.corr })} style={{ width: 34, height: 34, marginRight: 10 }} aria-label="Correction">
            {fe.corr ? <Tint name="icon_edit_beauty_bgcorrection_off" size={34} color={PRIMARY} /> : <Img name="icon_edit_beauty_bgcorrection" size={34} />}
          </button>
        )}
      >
        {item && <EditSeekBar key={`${sel}|${reKey}|${item.kind}`} style={{ marginLeft: 68, marginRight: 24 }} value={value} {...seekRange(item.kind === "re" && item.it.d)} flashKey={flash} onChange={setValue} />}
      </ControlBar>
      <Panel
        onClose={close} onConfirm={() => confirm()}
        title={<div className="no-scrollbar flex items-center overflow-x-auto" style={{ gap: 2 }}>{RESHAPE_CATS.map((c, i) => <Pill key={c.label} h={26.5} label={c.label} selected={cat === i} onClick={() => goCat(i)} />)}</div>}
      >
        <div
          ref={listRef} className="no-scrollbar absolute inset-x-0 flex overflow-x-auto" style={{ top: 36, padding: "0 4px", gap: 6 }}
          onScroll={(e) => {
            if (scrolling.current) return;
            const x = e.currentTarget.scrollLeft + 40;
            let c = 0;
            e.currentTarget.querySelectorAll<HTMLElement>("[data-cat]").forEach((el) => { if (el.offsetLeft <= x) c = Number(el.dataset.cat); });
            setCat(c);
          }}
        >
          <FeatureButton icon="beauty_icon_face" label="Face" modified={!!vals.shape && vals.shape.v > 0.001} selected={shapesOpen} onClick={() => setShapesOpen((v) => !v)} />
          {shapesOpen && FACE_SHAPES.map(([k, l]) => (
            <FeatureButton key={k} icon={`faceshape_icon_${k}`} label={l} tint={false} selected={item?.kind === "shape" && item.key === k} onClick={() => pick({ kind: "shape", key: k })} />
          ))}
          {RESHAPE_CATS.map((c, ci) => c.items.map((it, ii) => (
            <div key={`${ci}${it.key}`} data-cat={ii === 0 ? ci : undefined} className="flex-none">
              <FeatureButton icon={`beauty_icon_${it.key}`} label={it.label} modified={reMod(it.key)} selected={item?.kind === "re" && item.it === it} onClick={() => pick({ kind: "re", it })} />
            </div>
          )))}
        </div>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ Face Ratio / 3D Face */

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
        {item && <EditSeekBar key={`${sel}|${item.key}`} style={{ marginLeft: 68, marginRight: 24 }} value={vals[item.key] ?? 0} {...seekRange(item.d)} flashKey={flash} onChange={(v) => setVals(sel, (o) => ({ ...o, [field]: { ...o[field], [item.key]: v } }))} />}
      </ControlBar>
      {/* icon_title_vip is not shown (no VIP UI) */}
      <Panel title={kind === "FACE_RATIO" ? "Face Ratio" : "3D Face"} onClose={close} onConfirm={() => confirm()}>
        <FeatureList count={items.length}>
          {items.map((it) => (
            <FeatureButton key={it.key} icon={`beauty_icon_${it.key}`} label={it.label} selected={item?.key === it.key} modified={Math.abs(vals[it.key] ?? 0) > 0.001}
              onClick={() => { if (!usable(sel)) { guide.noFace(); return; } setItem(it); setFlash((n) => n + 1); }} />
          ))}
        </FeatureList>
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
      // EPBodyFragment.w6: NOT_EXIST -> detection failed, MANY -> "the biggest person" hint
      if (!p.pose) setTip("Cannot detect a person.");
      else if (p.count > 1) setTip("It detects and touches up the person that appears the biggest in the picture.");
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
    // All body: longleg = +v, slim = -v, head = -v; changing one of those resets All body
    if (item === "allbody") next = { ...next, longleg: v, slim: -v, head: -v };
    else if (["longleg", "slim", "head"].includes(item)) next.allbody = 0;
    apply({ ...fe, body: next });
  };
  return (
    <>
      <TextTooltip text={tip} />
      {pose === null && <EditLoading />}
      <ControlBar originalEnabled={faceEditActive(fe)}>
        {/* seek_bar always visible (marginLeft 68 / marginRight 24), disabled without a person */}
        <EditSeekBar key={item} style={{ marginLeft: 68, marginRight: 24 }} value={body[item] ?? 0} {...seekRange(it.d)} disabled={!ok} flashKey={flash} onChange={setValue} />
      </ControlBar>
      <Panel title="Body" onClose={close} onConfirm={() => confirm()}>
        <FeatureList count={BODY.length}>
          {BODY.map((b, i) => (
            <div key={b.key} className="relative flex flex-none">
              <FeatureButton icon={b.icon} label={b.label} selected={item === b.key} modified={Math.abs(body[b.key] ?? 0) > 0.001}
                onClick={() => { if (!ok) { setTip("Cannot detect a person."); return; } setItem(b.key); setFlash((n) => n + 1); }} />
              {i === 0 && <span className="absolute" style={{ right: -10, top: 19, width: 1, height: 20, background: "#333333" }} />}
            </div>
          ))}
        </FeatureList>
      </Panel>
    </>
  );
}

export function IconListPage({ kind }: { kind: "FACE_RATIO" | "RESHAPE3D" | "BODY" }) {
  return kind === "BODY" ? <BodyPage /> : <SliderListPage kind={kind} />;
}

/* ------------------------------------------------------------------ Makeup */

const subThumb = (cat: string, id: string) => (cat === "lip_color" ? `makeup_sub_lc${id}` : null);

export function MakeupPage() {
  const guide = useFaceGuide({ banner: "MAKEUP" });
  const { fe, setVals, close, confirm } = useFaceDraft();
  const sel = guide.sel;
  const [ci, setCi] = useState(2); // defaultId 3 = Lip color
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
    // selecting a content sets the slider to the category default; mask types auto-select the first sub-content
    setPick({ id, v: c.def, sub: cur?.sub ?? (MASK_CATS.has(c.key) ? MAKEUP_SUB[c.key][0].id : undefined), flip: cur?.flip });
    setFlash((n) => n + 1);
  };
  // the mirrored beauty-mark texture is generated asynchronously; re-apply once it exists
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
      {/* list_sub_content: vertical, top-right of the preview, padding 10dp, 36dp chips */}
      {cur && subs && (
        <div className="no-scrollbar absolute right-0 top-0 z-20 flex flex-col overflow-y-auto" style={{ padding: 10, gap: 0, maxHeight: `calc(100% - ${MENU + 54 + guide.bannerH}px)` }} onPointerDown={(e) => e.stopPropagation()}>
          {subs.map((s) => {
            const on = cur.sub === s.id;
            const th = subThumb(c.key, s.id);
            return (
              <button key={s.id} type="button" className="relative flex-none" style={{ width: 36, height: 36, borderRadius: th ? 7 : "50%", background: th ? "rgba(0,0,0,0.1)" : s.color, boxShadow: on ? "inset 0 0 0 2px #ffffff" : undefined, overflow: "hidden" }}
                onClick={() => setPick({ ...cur, sub: on && !MASK_CATS.has(c.key) ? undefined : s.id })}>
                {th && <Img name={th} size={36} />}
                {on && <Img name="edit_makeup_option_selected" size={36} style={{ position: "absolute", inset: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
      <ControlBar bottom={MENU + guide.bannerH} originalEnabled={faceEditActive(fe)}>
        {cur && <EditSeekBar key={`${sel}|${c.key}`} style={{ marginLeft: 68, marginRight: 24 }} value={cur.v} min={0} max={1} def={c.def} flashKey={flash} onChange={(v) => setPick({ ...cur, v })} />}
      </ControlBar>
      <Panel title="Makeup" onClose={close} onConfirm={() => confirm()}>
        <div className="no-scrollbar absolute inset-x-0 top-0 flex items-center overflow-x-auto" style={{ height: 55, padding: "0 15px" }}>
          {MAKEUP.map((m, i) => <Pill key={m.key} label={m.label} selected={ci === i} onClick={() => setCi(i)} />)}
        </div>
        <div className="no-scrollbar absolute inset-x-0 flex overflow-x-auto" style={{ top: 55, height: 73, padding: `0 15px 0 ${c.key === "beauty_mark" ? 64 + 15 : 15}px`, gap: 4 }}>
          {c.items.map((it) => it.k === "none"
            ? <ThumbItem key="none" label="None" bg="#242424" text="#CCCCCC" none selected={!cur} onClick={() => choose("none")} />
            : <ThumbItem key={it.k} label={it.l} bg={it.bg ?? c.bg} icon={`makeup_${c.s}${it.k}`} selected={cur?.id === it.k} onClick={() => choose(it.k)} />)}
        </div>
        {/* btn_flip "Mirror": beauty mark only, 64dp black, paddingLeft 10, 34dp icon + 10dp label (disabled #80FFFFFF) */}
        {c.key === "beauty_mark" && (
          <button type="button" disabled={!cur} onClick={() => cur && setPick({ ...cur, flip: !cur.flip })} className="absolute left-0 flex flex-col items-center justify-center bg-black" style={{ top: 55, height: 73, width: 64, paddingLeft: 10 }}>
            <Tint name="icon_makeup_flip" size={34} color={cur ? "#ffffff" : "rgba(255,255,255,0.5)"} />
            <span style={{ marginTop: 5, fontSize: 10, color: cur ? "#ffffff" : "rgba(255,255,255,0.5)" }}>Mirror</span>
          </button>
        )}
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ Reflection (eye light) */

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
        {eye && <EditSeekBar key={`${sel}|${eye.id}`} style={{ marginLeft: 68, marginRight: 24 }} value={eye.v} min={0} max={1} def={0.4} flashKey={flash} onChange={(v) => setVals(sel, (o) => ({ ...o, eye: { id: eye.id, v } }))} />}
      </ControlBar>
      <Panel title="Reflection" onClose={close} onConfirm={() => confirm()}>
        <div className="no-scrollbar absolute inset-x-0 flex overflow-x-auto" style={{ top: 36, padding: "0 15px", gap: 4 }}>
          <ThumbItem label="None" bg="#242424" text="#CCCCCC" none selected={!eye} onClick={() => choose(null)} />
          {EYELIGHT.map(([k, l]) => <ThumbItem key={k} label={l} bg="#C3BEBB" icon={`beauty_ei${k}`} selected={eye?.id === k} onClick={() => choose(k)} />)}
        </div>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ Volume (hair volume) */

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
      {/* title "Volume" + list guide (icon_title_vip not shown); single seek_bar marginHorizontal 68dp */}
      <Panel title="Volume" guide onClose={close} onConfirm={() => confirm()}>
        <div className="absolute inset-x-0 top-0 flex items-center" style={{ bottom: 52 }} onPointerDown={() => { if (!usable(sel)) guide.noFace(); }}>
          <EditSeekBar key={sel} style={{ margin: "0 68px" }} value={v} min={0} max={1} def={0} disabled={!usable(sel)} onChange={(x) => setVals(sel, (o) => ({ ...o, hv: x }))} />
        </div>
      </Panel>
    </>
  );
}

